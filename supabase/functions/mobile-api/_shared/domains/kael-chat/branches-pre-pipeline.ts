import { KAEL_CHAT_HARD_COST_CAP_USD } from "../../kael/kael-guardrails/cost-cap.ts";
import { normalizeServiceAreaDistrict, type ServiceType } from "../../../../_shared/domain.ts";
import {
  buildFocusedClarificationQuestion,
  buildKaelMissingInfoArtifactProposal,
  isGroundedClarificationAnswer,
  kaelDiagnosisScopeArtifactSchema,
  prependDeterministicSafetyGuidance,
  type KaelDiagnosisScopeArtifact,
  type KaelProgressTarget,
} from "../../kael/index.ts";
import type { DbClient } from "../../platform/db.ts";
import {
  diagnosisScopeWithGroundedAnswer,
  diagnosisScopeWithQuestion,
  loadKaelChatAnalysisState,
  persistDiagnosisScopeArtifact,
} from "./case-work-artifact.ts";
import {
  buildKaelConversationContext,
  mergeKaelCustomerDetailForReanalysis,
} from "./case-work-context.ts";
import { maybeHandleDeterministicClarificationReply } from "./clarification.service.ts";
import { emitKaelChatStep } from "./emit-step.ts";
import { maybeApplyKaelBoundaryGuard } from "./guard.ts";

type KaelChatPrePipelineInput = {
  readonly client: DbClient;
  readonly sessionId: string;
  readonly actorId: string;
  readonly message: string;
  readonly serviceType: ServiceType;
  readonly address_district?: string;
  readonly safeCustomerEvidence: string;
  readonly durableCustomerDetail: string;
  readonly problemChips: readonly string[];
  readonly language: "vi" | "en";
  readonly earlySafetySignals: readonly string[];
  readonly progressTarget: KaelProgressTarget;
  readonly llmClarificationEnabled: boolean;
};

export type KaelChatPrePipelineResult =
  | { readonly handled: true }
  | {
    readonly handled: false;
    readonly artifact: KaelDiagnosisScopeArtifact;
    readonly currentCostUsd: number;
    readonly district: string;
    readonly conversationContext?: string;
    readonly priorClarificationCount: number;
    readonly previousAnalysisReceipt?: Record<string, unknown>;
    readonly customerAnalysisDetail: string;
  };

export async function prepareKaelChatPrePipeline(
  input: KaelChatPrePipelineInput,
): Promise<KaelChatPrePipelineResult> {
  const {
    client,
    sessionId,
    actorId,
    message,
    serviceType,
    safeCustomerEvidence,
    durableCustomerDetail,
    problemChips,
    language,
    earlySafetySignals,
    progressTarget,
    llmClarificationEnabled,
  } = input;
  if (await maybeApplyKaelBoundaryGuard(
    client,
    sessionId,
    message,
    serviceType,
    {
      actorId,
      jobId: null,
      language,
      persistedSafetySignals: earlySafetySignals,
      progressTarget,
    },
  )) return { handled: true };
  // Reads only the turn history, so it overlaps the analysis-state load. A handled
  // early return below discards it; the no-op catch keeps that from surfacing as
  // an unhandled rejection while the later await still observes any error.
  const conversationPromise = llmClarificationEnabled
    ? buildKaelConversationContext(client, sessionId)
    : null;
  conversationPromise?.catch(() => undefined);
  const { artifact: initialArtifact, currentCostUsd, persistedTurnCount } = await loadKaelChatAnalysisState(
    client,
    sessionId,
    serviceType,
    durableCustomerDetail || problemChips.join(" ") || serviceType,
  );
  let artifact = initialArtifact;
  const pendingClarificationSlot = artifact.next_action.kind === "ask_question" &&
      artifact.missing_facts.length === 1
    ? artifact.missing_facts[0]
    : null;
  if (pendingClarificationSlot && await maybeHandleDeterministicClarificationReply(
    client,
    {
      artifact,
      customerEvidence: safeCustomerEvidence,
      language,
      pendingSlot: pendingClarificationSlot,
      progressTarget,
      safetySignals: earlySafetySignals,
      sessionId,
    },
  )) return { handled: true };
  if (pendingClarificationSlot && isGroundedClarificationAnswer(safeCustomerEvidence)) {
    artifact = diagnosisScopeWithGroundedAnswer(
      artifact,
      pendingClarificationSlot,
      durableCustomerDetail,
    );
    await persistDiagnosisScopeArtifact(client, sessionId, artifact);
  }
  if (await handlePrePipelineEscalationOrCostCap(
    input,
    artifact,
    currentCostUsd,
    persistedTurnCount,
  )) return { handled: true };

  const intake = await resolvePrePipelineIntake(input, artifact);
  if (intake.handled) return intake;
  const district = intake.district;

  let conversationContext: string | undefined;
  let priorClarificationCount = 0;
  let previousAnalysisReceipt: Record<string, unknown> | undefined;
  if (conversationPromise) {
    const convo = await conversationPromise;
    conversationContext = convo.context;
    priorClarificationCount = convo.clarificationCount;
    previousAnalysisReceipt = convo.previousAnalysisReceipt;
  }
  const customerAnalysisDetail = mergeKaelCustomerDetailForReanalysis(
    artifact,
    durableCustomerDetail,
  );

  return {
    handled: false,
    artifact,
    currentCostUsd,
    district,
    conversationContext,
    priorClarificationCount,
    previousAnalysisReceipt,
    customerAnalysisDetail,
  };
}

async function handlePrePipelineEscalationOrCostCap(
  input: KaelChatPrePipelineInput,
  artifact: KaelDiagnosisScopeArtifact,
  currentCostUsd: number,
  persistedTurnCount: number,
): Promise<boolean> {
  if (artifact.next_action.kind === "escalate") {
    const escalationArtifact = kaelDiagnosisScopeArtifactSchema.parse({
      ...artifact,
      quote_ready: false,
      next_action: artifact.next_action,
      updated_at: new Date().toISOString(),
    });
    await emitKaelChatStep(input.client, input.sessionId, input.progressTarget, {
      artifact: escalationArtifact,
      turn: {
        contentType: "clarification",
        text: prependDeterministicSafetyGuidance(
          input.language === "en"
            ? "Kael is not yet confident enough to provide a safe offer. A support specialist needs to review the collected information."
            : "Kael chưa đủ chắc chắn để báo giá an toàn. Yêu cầu này cần người hỗ trợ xem lại thông tin đã thu thập.",
          input.earlySafetySignals,
          input.language,
          { serviceType: input.serviceType },
        ),
        nextStatus: "active",
        metadata: {
          diagnosis_scope: escalationArtifact,
          escalation_reason: artifact.next_action.reason,
        },
      },
      progress: {
        stage: "clarification",
        status: "failed",
        progress: 1,
        failureReason: artifact.next_action.reason,
      },
    });
    return true;
  }
  if (currentCostUsd < KAEL_CHAT_HARD_COST_CAP_USD) return false;
  await emitKaelChatStep(input.client, input.sessionId, input.progressTarget, {
    turn: {
      contentType: "error",
      text: prependDeterministicSafetyGuidance(
        input.language === "en"
          ? "Kael has paused further analysis in this session to keep AI usage safe. You can use an existing validated offer or start a new session if needed."
          : "Kael tạm dừng phân tích thêm cho phiên này để giữ ngân sách AI an toàn. Bạn có thể đặt thợ từ ước tính đã có hoặc tạo phiên mới nếu cần.",
        input.earlySafetySignals,
        input.language,
        { serviceType: input.serviceType },
      ),
      nextStatus: "active",
      metadata: {
        budget_exceeded: true,
        hard_cap_usd: KAEL_CHAT_HARD_COST_CAP_USD,
        total_cost_usd: currentCostUsd,
        persisted_turn_count: persistedTurnCount,
      },
    },
    progress: {
      stage: "intent_classification",
      status: "failed",
      progress: 0,
      failureReason: "budget_exceeded",
    },
  });
  return true;
}

async function resolvePrePipelineIntake(
  input: KaelChatPrePipelineInput,
  artifact: KaelDiagnosisScopeArtifact,
): Promise<{ handled: true } | { handled: false; district: string }> {
  const district = normalizeServiceAreaDistrict(input.address_district);
  if (!district) {
    const question = prependDeterministicSafetyGuidance(
      input.language === "en"
        ? "Which Ho Chi Minh City district is the apartment in? Kael uses it to validate the area and eligible workers."
        : "Bạn cho Kael biết quận ở TP.HCM để ước tính đúng khu vực và tìm thợ phù hợp.",
      input.earlySafetySignals,
      input.language,
      { serviceType: input.serviceType },
    );
    const nextArtifact = diagnosisScopeWithQuestion(
      artifact,
      ["address_district"],
      question,
      0.25,
    );
    await emitPrePipelineClarification(
      input,
      nextArtifact,
      question,
      ["address_district"],
    );
    return { handled: true };
  }
  if (input.llmClarificationEnabled || input.safeCustomerEvidence.length >= 10 || input.problemChips.length > 0) {
    return { handled: false, district };
  }
  const question = prependDeterministicSafetyGuidance(
    buildFocusedClarificationQuestion("symptom", input.language),
    input.earlySafetySignals,
    input.language,
    { serviceType: input.serviceType },
  );
  const nextArtifact = diagnosisScopeWithQuestion(artifact, ["description"], question, 0.3);
  await emitPrePipelineClarification(input, nextArtifact, question, ["description"]);
  return { handled: true };
}

async function emitPrePipelineClarification(
  input: KaelChatPrePipelineInput,
  artifact: KaelDiagnosisScopeArtifact,
  question: string,
  missingFields: readonly ("address_district" | "description")[],
) {
  await emitKaelChatStep(input.client, input.sessionId, input.progressTarget, {
    artifact,
    turn: {
      contentType: "clarification",
      text: question,
      nextStatus: "active",
      metadata: {
        artifact_proposal: buildKaelMissingInfoArtifactProposal({ missingFields, question }),
        diagnosis_scope: artifact,
      },
    },
    progress: { stage: "clarification", status: "completed", progress: 1 },
  });
}
