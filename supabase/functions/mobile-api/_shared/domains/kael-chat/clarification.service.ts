import {
  buildClarificationExplanationQuestion,
  buildFocusedClarificationQuestion,
  buildKaelMissingInfoArtifactProposal,
  isClarificationExplanationRequest,
  isUnknownClarificationAnswer,
  prependDeterministicSafetyGuidance,
  updateKaelProgress,
  type KaelDiagnosisScopeArtifact,
  type KaelProgressTarget,
  type PipelineResult,
} from "../../kael/index.ts";
import {
  diagnosisScopeWithQuestion,
  diagnosisScopeWithUncertainAnswer,
  persistDiagnosisScopeArtifact,
} from "./case-work-artifact.ts";
import type { DbClient } from "../../platform/db.ts";
import type { CaseSlotAnswerKind } from "../../kael/tools/case-turn-intent.ts";
import { appendKaelSystemTurn, type KaelTurnTelemetry } from "./session-store.ts";
import type { ReplyComposer } from "./reply-composer.ts";

import { auditGuardrailTripBestEffort } from "../../kael/learning/audit.ts";
import { guardOutput } from "../../kael/kael-guardrails/output-gateway.ts";
import { intakeObservationMetadata } from "./intake-safety.ts";
import { emitKaelChatStep } from "./emit-step.ts";
import { buildSafetyFirstKaelClarification } from "./intake-safety.ts";
import { telemetryFromStageLogs } from "./turn-telemetry.ts";

type KaelPipelineClarificationInput = {
  readonly client: DbClient;
  readonly sessionId: string;
  readonly actorId: string;
  readonly pipeline: Extract<PipelineResult, { success: false }>;
  readonly artifact: KaelDiagnosisScopeArtifact;
  readonly customerAnalysisDetail: string;
  readonly language: "vi" | "en";
  readonly responseSafetySignals: readonly string[];
  readonly progressTarget: KaelProgressTarget;
  readonly slotAskCounts?: Readonly<Record<string, number>>;
};

type DeterministicClarificationInput = {
  artifact: KaelDiagnosisScopeArtifact;
  customerEvidence: string;
  language: "vi" | "en";
  pendingSlot: string;
  progressTarget: KaelProgressTarget;
  safetySignals: readonly string[];
  sessionId: string;
  // What the model understood the reply to be; the keyword checks stay as the fallback.
  understandingKind?: CaseSlotAnswerKind;
  forceUnknown?: boolean;
  composeReply?: ReplyComposer;
};

// A detail asked this many times without an answer is verified on site instead of asked again.
export const CLARIFICATION_REPEAT_LIMIT = 2;

export async function maybeHandleDeterministicClarificationReply(
  client: DbClient,
  input: DeterministicClarificationInput,
) {
  if (!input.forceUnknown && (
    input.understandingKind === "asks_why" || isClarificationExplanationRequest(input.customerEvidence)
  )) {
    const question = buildClarificationExplanationQuestion(
      input.pendingSlot,
      input.language,
    );
    const artifact = diagnosisScopeWithQuestion(
      input.artifact,
      [input.pendingSlot],
      question,
      Math.max(input.artifact.confidence, 0.4),
    );
    await persistDiagnosisScopeArtifact(client, input.sessionId, artifact);
    const explained = await composeOr(input, "explain_detail", question);
    await appendClarificationTurn(client, input, artifact, {
      source: "deterministic_explanation",
      text: explained.text,
      telemetry: explained.telemetry,
    });
    await completeClarificationProgress(client, input.progressTarget);
    return true;
  }

  if (
    !input.forceUnknown && input.understandingKind !== "unknown" &&
    !isUnknownClarificationAnswer(input.customerEvidence)
  ) return false;

  const resolution = unknownClarificationResolution(input.language);
  const artifact = diagnosisScopeWithUncertainAnswer(
    input.artifact,
    input.pendingSlot,
    resolution.reviewReason,
    input.customerEvidence,
  );
  const accepted = await composeOr(input, "accept_unknown", resolution.visibleText);
  await Promise.all([
    persistDiagnosisScopeArtifact(client, input.sessionId, artifact),
    appendClarificationTurn(client, input, artifact, {
      source: input.forceUnknown ? "deterministic_loop_break" : "deterministic_unknown_resolution",
      text: accepted.text,
      telemetry: accepted.telemetry,
    }),
    completeClarificationProgress(client, input.progressTarget),
  ]);
  return true;
}

// Stops a third ask for the same detail: Kael records it as needing on-site verification, which is the
// path an "I don't know" answer already takes.
export async function breakRepeatedClarification(
  client: DbClient,
  input: Omit<DeterministicClarificationInput, "understandingKind" | "forceUnknown"> & {
    readonly slotAskCounts?: Readonly<Record<string, number>>;
  },
): Promise<boolean> {
  if ((input.slotAskCounts?.[input.pendingSlot] ?? 0) < CLARIFICATION_REPEAT_LIMIT) return false;
  return maybeHandleDeterministicClarificationReply(client, { ...input, forceUnknown: true });
}

// Safety wording stays exactly as written, so a case with safety signals is never reworded.
async function composeOr(
  input: DeterministicClarificationInput,
  kind: "explain_detail" | "accept_unknown",
  canonical: string,
) {
  if (!input.composeReply || input.safetySignals.length > 0) {
    return { text: canonical, telemetry: { replySource: "template" } as KaelTurnTelemetry };
  }
  return input.composeReply({ kind, canonical, customerSaid: input.customerEvidence });
}

async function appendClarificationTurn(
  client: DbClient,
  input: DeterministicClarificationInput,
  artifact: KaelDiagnosisScopeArtifact,
  response: { source: string; text: string; telemetry?: KaelTurnTelemetry },
) {
  await appendKaelSystemTurn(client, input.sessionId, {
    contentType: "clarification",
    text: prependDeterministicSafetyGuidance(
      response.text,
      input.safetySignals,
      input.language,
      { trustedText: true },
    ),
    nextStatus: "active",
    telemetry: response.telemetry,
    metadata: {
      artifact_proposal: buildKaelMissingInfoArtifactProposal({
        missingFields: [input.pendingSlot],
        question: response.text,
        confidence: artifact.confidence,
        artifactType: "ai_notes",
      }),
      clarification_source: response.source,
      diagnosis_scope: artifact,
    },
  });
}

async function completeClarificationProgress(
  client: DbClient,
  progressTarget: KaelProgressTarget,
) {
  await updateKaelProgress(client, progressTarget, {
    stage: "clarification",
    status: "completed",
    progress: 1,
  });
}

function unknownClarificationResolution(language: "vi" | "en") {
  if (language === "en") {
    return {
      reviewReason:
        "This detail must be verified on site before scope and estimate are confirmed.",
      visibleText:
        "That is okay. You do not need to guess or test it yourself. Kael marked this detail for on-site verification before confirming the scope and estimate.",
    };
  }
  return {
    reviewReason:
      "Cần xác minh chi tiết này tại chỗ trước khi chốt phạm vi và ước tính.",
    visibleText:
      "Không sao, bạn không cần đoán hoặc tự thao tác để kiểm tra. Kael đã đánh dấu chi tiết này cần được xác minh tại chỗ trước khi chốt phạm vi và ước tính.",
  };
}

export async function handleKaelPipelineClarification(
  input: KaelPipelineClarificationInput,
) {
  const {
    client,
    sessionId,
    actorId,
    pipeline,
    artifact: initialArtifact,
    customerAnalysisDetail,
    language,
    responseSafetySignals,
    progressTarget,
  } = input;
  if (pipeline.code === "NEEDS_CLARIFICATION") {
    const missingSlots = pipeline.clarification?.missingSlots ?? [];
    if (missingSlots[0] && await breakRepeatedClarification(client, {
      artifact: initialArtifact,
      customerEvidence: customerAnalysisDetail,
      language,
      pendingSlot: missingSlots[0],
      progressTarget,
      safetySignals: responseSafetySignals,
      sessionId,
      slotAskCounts: input.slotAskCounts,
    })) return;
    const focusedFallback = buildFocusedClarificationQuestion(
      missingSlots[0] ?? "service_scope",
      language,
    );
    const checked = guardOutput({
      text: pipeline.clarification?.question ?? "",
      actor: "customer",
      language,
      surface: "kael_chat_clarification",
      fallbackText: focusedFallback,
    });
    if (checked.used_fallback || !checked.allowed) {
      await auditGuardrailTripBestEffort(client, {
        jobId: null,
        actorId,
        actorRole: "customer",
        surface: "kael_chat_clarification",
        reason: checked.reason ?? "self_check",
        guardrailLabel: checked.guardrailLabel ?? null,
        source: checked.reason === "semantic_guardrail"
          ? "semantic_self_check"
          : "self_check",
        safeMetadata: {
          session_id: sessionId,
          clarification_source: "ai",
        },
      });
    }
    const safetyFirstClarification = buildSafetyFirstKaelClarification({
      providerText: checked.text,
      focusedFallback,
      safetySignals: responseSafetySignals,
      language,
    });
    const safeQuestion = safetyFirstClarification.question;
    const sentiment = pipeline.clarification?.customerSentiment;
    const artifact = diagnosisScopeWithQuestion(
      initialArtifact,
      missingSlots.length > 0 ? missingSlots : ["description"],
      safeQuestion,
      0.4,
      customerAnalysisDetail,
    );
    await emitKaelChatStep(client, sessionId, progressTarget, {
      artifact,
      parallel: true,
      turn: {
        contentType: "clarification",
        text: safetyFirstClarification.visibleText,
        nextStatus: "active",
        telemetry: telemetryFromStageLogs(
          pipeline.stageLogs,
          "intent",
          safetyFirstClarification.safetyFallbackUsed || checked.used_fallback ? "fallback" : "ai",
        ),
        metadata: {
          artifact_proposal: buildKaelMissingInfoArtifactProposal({
            missingFields: missingSlots.length > 0 ? missingSlots : ["description"],
            question: safeQuestion,
            confidence: 0.4,
            artifactType: "ai_notes",
          }),
          clarification_source: safetyFirstClarification.safetyFallbackUsed
            ? "safety_fallback"
            : checked.used_fallback
            ? "fallback"
            : "ai",
          diagnosis_scope: artifact,
          ...intakeObservationMetadata(pipeline.intakeObservation),
          ...(sentiment ? { customer_sentiment: sentiment } : {}),
        },
        ...(sentiment
          ? { sessionMetadata: { last_customer_sentiment: sentiment } }
          : {}),
      },
      progress: {
        stage: "clarification",
        status: "completed",
        progress: 1,
      },
    });
    return;
  }
}
