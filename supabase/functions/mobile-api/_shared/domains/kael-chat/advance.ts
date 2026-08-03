import { sourceTrustSecretsForRequest } from "../../platform/domain-utils.ts";
import { sanitizeForLLM, type KaelChatCreateInput } from "../../../../_shared/domain.ts";
import type { KaelDiagnosisScopeArtifact } from "../../kael/contracts/artifact-contract.ts";
import {
  runKaelPipeline,
  prependDeterministicSafetyGuidance,
  updateKaelProgress,
  type EdgeAiSecrets,
  type PipelineResult,
} from "../../kael/index.ts";
import {
  sanitizeCustomerCaseEvidenceText,
  sanitizeUntrustedEvidenceList,
} from "../../kael/evidence/untrusted-evidence.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { isElectricalPlaybookEnabled } from "../../kael/learning/playbooks/electrical.ts";
import { db } from "../../platform/db.ts";
import { persistentKaelSafetySignals } from "./intake-safety.ts";
import { handleKaelChatPipelineOutcome } from "./branches-post-pipeline.ts";
import { prepareKaelChatPrePipeline } from "./branches-pre-pipeline.ts";
import { appendKaelSystemTurn } from "./session-store.ts";

export async function advanceKaelChatEstimate(
  ctx: MobileApiContext,
  sessionId: string,
  input: Required<Pick<KaelChatCreateInput, "service_type">> & {
    message?: string;
    problem_chips?: string[];
    photo_urls?: string[];
    vision_evidence?: KaelDiagnosisScopeArtifact["evidence"];
    address_district?: string;
    language?: "vi" | "en";
    persisted_safety_signals?: string[];
  },
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const progressTarget = { table: "kael_chat_sessions" as const, id: sessionId };
  const llmClarificationEnabled = true;
  const language = input.language ?? "vi";
  const electricalPlaybookEnabled = input.service_type === "electrical" &&
    isElectricalPlaybookEnabled();
  const message = sanitizeForLLM(input.message ?? "");
  const safeCustomerEvidence = sanitizeCustomerCaseEvidenceText(message);
  const problemChips = sanitizeUntrustedEvidenceList(input.problem_chips ?? []);
  const earlySafetySignals = persistentKaelSafetySignals(
    message,
    input.service_type,
    input.persisted_safety_signals,
  );
  const prePipeline = await prepareKaelChatPrePipeline({
    client,
    sessionId,
    actorId: ctx.user.id,
    message,
    serviceType: input.service_type,
    address_district: input.address_district,
    safeCustomerEvidence,
    durableCustomerDetail: safeCustomerEvidence,
    problemChips,
    language,
    earlySafetySignals,
    progressTarget,
    llmClarificationEnabled,
  });
  if (prePipeline.handled) return;
  const {
    artifact,
    currentCostUsd,
    district,
    conversationContext,
    priorClarificationCount,
    previousAnalysisReceipt,
    customerAnalysisDetail,
  } = prePipeline;
  const requestId = crypto.randomUUID();
  let pipeline: PipelineResult;
  try {
    await updateKaelProgress(client, progressTarget, {
      stage: "intent_classification",
      status: "queued",
      progress: 0,
    });
    pipeline = await runKaelPipeline(
      {
        serviceType: input.service_type,
        problemChips: problemChips.length > 0 ? problemChips : [input.service_type],
        description: customerAnalysisDetail,
        district,
        photoUrls: input.photo_urls ?? [],
        intakeDiagnosisEnabled: llmClarificationEnabled,
        conversationContext,
        clarificationCount: priorClarificationCount,
        priorProfileFacts: artifact.facts,
        priorSafetySignals: earlySafetySignals,
        language,
        progressTarget,
        actorId: ctx.user.id, // S4/F1 (§38): per-user AI-spend attribution
      },
      client,
      sourceTrustSecretsForRequest(secrets, ctx),
    );
  } catch {
    await updateKaelProgress(client, progressTarget, {
      stage: "intent_classification",
      status: "failed",
      progress: 0,
      failureReason: "pipeline_error",
    });
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "error",
      text: prependDeterministicSafetyGuidance(
        language === "en"
          ? "Kael cannot analyze this right now. Please try again in a few minutes."
          : "Kael chưa thể phân tích lúc này. Bạn thử gửi lại sau ít phút.",
        earlySafetySignals,
        language,
      ),
      nextStatus: "active",
    });
    return;
  }

  await handleKaelChatPipelineOutcome({
    client,
    sessionId,
    ctx,
    requestId,
    pipeline,
    artifact,
    service_type: input.service_type,
    vision_evidence: input.vision_evidence,
    photo_urls: input.photo_urls,
    language,
    earlySafetySignals,
    electricalPlaybookEnabled,
    progressTarget,
    customerAnalysisDetail,
    safeCustomerEvidence,
    problemChips,
    district,
    currentCostUsd,
    previousAnalysisReceipt,
  });
}
