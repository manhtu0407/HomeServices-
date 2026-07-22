import {
  buildClarificationExplanationQuestion,
  buildKaelMissingInfoArtifactProposal,
  isClarificationExplanationRequest,
  isUnknownClarificationAnswer,
  prependDeterministicSafetyGuidance,
  updateKaelProgress,
  type KaelDiagnosisScopeArtifact,
  type KaelProgressTarget,
} from "../kael/index.ts";
import type { DbClient } from "./db.ts";
import {
  diagnosisScopeWithQuestion,
  diagnosisScopeWithUncertainAnswer,
  persistDiagnosisScopeArtifact,
} from "./kael-chat-case-work.ts";
import { appendKaelSystemTurn } from "./kael-chat-session-store.ts";

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
