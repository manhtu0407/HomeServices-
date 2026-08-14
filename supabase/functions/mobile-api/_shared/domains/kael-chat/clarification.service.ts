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
import type { DbClient } from "../../platform/db.ts";
import {
  diagnosisScopeWithQuestion,
  diagnosisScopeWithUncertainAnswer,
  persistDiagnosisScopeArtifact,
} from "./case-work-artifact.ts";
import { appendKaelSystemTurn } from "./session-store.ts";

import { auditGuardrailTripBestEffort } from "../../kael/learning/audit.ts";
import { guardOutput } from "../../kael/kael-guardrails/output-gateway.ts";
import { intakeObservationMetadata } from "./intake-safety.ts";
import { emitKaelChatStep } from "./emit-step.ts";
import { buildSafetyFirstKaelClarification } from "./intake-safety.ts";

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
};

type DeterministicClarificationInput = {
  artifact: KaelDiagnosisScopeArtifact;
  customerEvidence: string;
  language: "vi" | "en";
  pendingSlot: string;
  progressTarget: KaelProgressTarget;
  safetySignals: readonly string[];
  sessionId: string;
};

export async function maybeHandleDeterministicClarificationReply(
  client: DbClient,
  input: DeterministicClarificationInput,
) {
  if (isClarificationExplanationRequest(input.customerEvidence)) {
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
    await appendClarificationTurn(client, input, artifact, {
      source: "deterministic_explanation",
      text: question,
    });
    await completeClarificationProgress(client, input.progressTarget);
    return true;
  }

  if (!isUnknownClarificationAnswer(input.customerEvidence)) return false;

  const resolution = unknownClarificationResolution(input.language);
  const artifact = diagnosisScopeWithUncertainAnswer(
    input.artifact,
    input.pendingSlot,
    resolution.reviewReason,
    input.customerEvidence,
  );
  await Promise.all([
    persistDiagnosisScopeArtifact(client, input.sessionId, artifact),
    appendClarificationTurn(client, input, artifact, {
      source: "deterministic_unknown_resolution",
      text: resolution.visibleText,
    }),
    completeClarificationProgress(client, input.progressTarget),
  ]);
  return true;
}

async function appendClarificationTurn(
  client: DbClient,
  input: DeterministicClarificationInput,
  artifact: KaelDiagnosisScopeArtifact,
  response: { source: string; text: string },
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
