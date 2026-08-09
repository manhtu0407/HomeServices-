import { kaelServiceLabelVi } from "../../platform/labels.ts";
import { apiLogPurposeForPipelineStage, logApiCalls } from "../../kael/learning/audit.ts";
import {
  buildKaelMissingInfoArtifactProposal,
  buildPriceEvidenceUnavailableArtifact,
  deterministicSafetyGuidance,
  type KaelDiagnosisScopeArtifact,
  type KaelProgressTarget,
  type PipelineResult,
} from "../../kael/index.ts";
import type { DbClient } from "../../platform/db.ts";
import type { ServiceType } from "../../../../_shared/domain.ts";
import { diagnosisScopeWithQuestion } from "./case-work-artifact.ts";
import { handleKaelPipelineClarification } from "./clarification.service.ts";
import { emitKaelChatStep } from "./emit-step.ts";
import { finalizeKaelChatEstimate } from "./estimate-support.ts";
import { resolveKaelResponseSafetySignals } from "./intake-safety.ts";
import {
  intakeObservationMetadata,
  kaelServiceLabelEn,
  withIntakeSafetyGuidance,
} from "./intake-safety.ts";

type KaelChatPostPipelineInput = {
  readonly client: DbClient;
  readonly sessionId: string;
  readonly ctx: {
    readonly user: { readonly id: string };
  };
  readonly requestId: string;
  readonly pipeline: PipelineResult;
  readonly artifact: KaelDiagnosisScopeArtifact;
  readonly service_type: ServiceType;
  readonly vision_evidence?: KaelDiagnosisScopeArtifact["evidence"];
  readonly photo_urls?: string[];
  readonly language: "vi" | "en";
  readonly earlySafetySignals: readonly string[];
  readonly electricalPlaybookEnabled: boolean;
  readonly progressTarget: KaelProgressTarget;
  readonly customerAnalysisDetail: string;
  readonly safeCustomerEvidence: string;
  readonly problemChips: string[];
  readonly district: string;
  readonly currentCostUsd: number;
  readonly previousAnalysisReceipt?: Record<string, unknown>;
};

type FailedPipeline = Exclude<PipelineResult, { success: true }>;

export async function handleKaelChatPipelineOutcome(
  input: KaelChatPostPipelineInput,
) {
  const {
    client,
    sessionId,
    requestId,
    pipeline,
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
  } = input;
  let artifact = input.artifact;
  const responseSafetySignals = resolveKaelResponseSafetySignals({
    electricalPlaybookEnabled,
    earlySafetySignals,
    pipelineSafetySignals: pipeline.success ? pipeline.safetySignals : undefined,
    intakeObservation: pipeline.intakeObservation,
  });
  const criticalSafetyGuidance = deterministicSafetyGuidance(
    responseSafetySignals,
    language,
  );

  await recordKaelChatPipelineApiCalls(client, requestId, sessionId, pipeline);

  if (!pipeline.success) {
    await handleFailedKaelChatPipeline({
      input,
      artifact,
      responseSafetySignals,
    });
    return;
  }

  await finalizeKaelChatEstimate({
    client,
    sessionId,
    artifact,
    pipeline,
    service_type: input.service_type,
    vision_evidence: input.vision_evidence,
    photo_urls: input.photo_urls,
    language,
    responseSafetySignals,
    criticalSafetyGuidance,
    electricalPlaybookEnabled,
    progressTarget,
    safeCustomerEvidence,
    customerAnalysisDetail,
    problemChips,
    district,
    currentCostUsd,
    previousAnalysisReceipt,
  });
}

async function recordKaelChatPipelineApiCalls(
  client: DbClient,
  requestId: string,
  sessionId: string,
  pipeline: PipelineResult,
) {
  await logApiCalls(
    client,
    pipeline.stageLogs
      .filter((stage) => stage.provider && stage.model)
      .map((stage) => ({
        job_id: null,
        request_id: requestId,
        purpose: apiLogPurposeForPipelineStage(stage.stage),
        provider: stage.provider,
        model: stage.model,
        input_tokens: stage.inputTokens ?? null,
        output_tokens: stage.outputTokens ?? null,
        cost_usd: stage.costUsd ?? null,
        latency_ms: stage.latencyMs,
        success: stage.success,
        error_code: stage.failureReason ?? null,
        safe_metadata: {
          surface: "kael_chat",
          session_id: sessionId,
          ...(stage.cacheStatus ? { cache_status: stage.cacheStatus } : {}),
          ...(stage.safeMetadata ?? {}),
        },
      })),
  );
}

async function handleFailedKaelChatPipeline(input: {
  input: KaelChatPostPipelineInput;
  artifact: KaelDiagnosisScopeArtifact;
  responseSafetySignals: readonly string[];
}) {
  const { pipeline } = input.input;
  if (pipeline.success) return;
  if (pipeline.code === "NEEDS_CLARIFICATION") {
    await handleKaelPipelineClarification({
      client: input.input.client,
      sessionId: input.input.sessionId,
      actorId: input.input.ctx.user.id,
      pipeline,
      artifact: input.artifact,
      customerAnalysisDetail: input.input.customerAnalysisDetail,
      language: input.input.language,
      responseSafetySignals: input.responseSafetySignals,
      progressTarget: input.input.progressTarget,
    });
    return;
  }
  if (pipeline.code === "SERVICE_MISMATCH") {
    await emitPipelineServiceMismatch(input.input, pipeline, input.responseSafetySignals);
    return;
  }
  if (pipeline.code === "NO_BASELINE") {
    await emitPipelineNoBaseline(input.input, input.artifact, pipeline, input.responseSafetySignals);
    return;
  }
  await emitPipelineFallback(input.input, input.artifact, pipeline, input.responseSafetySignals);
}

async function emitPipelineServiceMismatch(
  input: KaelChatPostPipelineInput,
  pipeline: FailedPipeline,
  responseSafetySignals: readonly string[],
) {
  const suggested = pipeline.suggestedService;
  const mismatchText = input.language === "en"
    ? (suggested
      ? `Your description appears to match ${kaelServiceLabelEn(suggested)}. Go back and select that service so Kael can analyze it accurately.`
      : "Your description does not match the selected service. Go back and select the appropriate service for an accurate analysis.")
    : (suggested
      ? `Mô tả của bạn nghiêng về dịch vụ ${kaelServiceLabelVi(suggested)}. Bạn quay lại chọn đúng dịch vụ để Kael ước tính chính xác.`
      : "Mô tả của bạn không khớp với dịch vụ đang chọn. Bạn quay lại chọn đúng dịch vụ phù hợp để Kael ước tính.");
  await emitKaelChatStep(input.client, input.sessionId, input.progressTarget, {
    turn: {
      contentType: "error",
      text: withIntakeSafetyGuidance(mismatchText, responseSafetySignals, input.language),
      nextStatus: "unsupported",
      metadata: {
        boundary_reason: "service_mismatch_llm",
        ...(pipeline.policyReasonCode ? { policy_reason_code: pipeline.policyReasonCode } : {}),
        ...intakeObservationMetadata(pipeline.intakeObservation),
        ...(suggested ? { suggested_service: suggested } : {}),
      },
    },
    progress: {
      stage: "intent_classification",
      status: "failed",
      progress: 1,
      failureReason: "service_mismatch",
    },
  });
}

async function emitPipelineNoBaseline(
  input: KaelChatPostPipelineInput,
  artifact: KaelDiagnosisScopeArtifact,
  pipeline: FailedPipeline,
  responseSafetySignals: readonly string[],
) {
  const unavailableArtifact = buildPriceEvidenceUnavailableArtifact(artifact, {
    customerDetail: input.customerAnalysisDetail,
    scopeSummary: input.customerAnalysisDetail,
  });
  await emitKaelChatStep(input.client, input.sessionId, input.progressTarget, {
    artifact: unavailableArtifact,
    turn: {
      contentType: "error",
      text: withIntakeSafetyGuidance(
        input.language === "en"
          ? "Kael has identified the scope but does not have validated price evidence for this case. It needs review before any offer is shown."
          : "Kael đã xác định phạm vi nhưng chưa có dữ liệu giá đã kiểm chứng cho trường hợp này. Yêu cầu cần được rà soát trước khi hiển thị báo giá.",
        responseSafetySignals,
        input.language,
      ),
      nextStatus: "active",
      metadata: {
        diagnosis_scope: unavailableArtifact,
        quote_readiness: "validated_price_evidence_unavailable",
        ...intakeObservationMetadata(pipeline.intakeObservation),
      },
    },
    progress: {
      stage: "price_synthesis",
      status: "failed",
      progress: 1,
      failureReason: "validated_price_evidence_unavailable",
    },
  });
}

async function emitPipelineFallback(
  input: KaelChatPostPipelineInput,
  artifact: KaelDiagnosisScopeArtifact,
  pipeline: FailedPipeline,
  responseSafetySignals: readonly string[],
) {
  const unsupported = pipeline.code === "UNSUPPORTED";
  const clarificationText = unsupported
    ? pipeline.error
    : input.language === "en"
    ? "Kael does not yet have enough safe evidence to estimate. Add more detail or send a clearer photo."
    : "Kael chưa đủ dữ liệu an toàn để ước tính. Bạn mô tả thêm hoặc gửi ảnh rõ hơn.";
  const clarificationArtifact = unsupported
    ? undefined
    : diagnosisScopeWithQuestion(
      artifact,
      ["description_or_photo"],
      clarificationText,
      0.35,
      input.customerAnalysisDetail,
    );
  await emitKaelChatStep(input.client, input.sessionId, input.progressTarget, {
    artifact: clarificationArtifact,
    turn: {
      contentType: unsupported ? "error" : "clarification",
      text: withIntakeSafetyGuidance(clarificationText, responseSafetySignals, input.language),
      nextStatus: "active",
      metadata: {
        ...intakeObservationMetadata(pipeline.intakeObservation),
        ...(pipeline.policyReasonCode ? { policy_reason_code: pipeline.policyReasonCode } : {}),
        ...(clarificationArtifact ? {
          artifact_proposal: buildKaelMissingInfoArtifactProposal({
            missingFields: ["description_or_photo"],
            question: clarificationText,
            confidence: 0.35,
            artifactType: "ai_notes",
          }),
          diagnosis_scope: clarificationArtifact,
        } : {}),
      },
    },
    progress: {
      stage: unsupported ? "intent_classification" : "clarification",
      status: unsupported ? "failed" : "completed",
      progress: 1,
      failureReason: unsupported ? "unsupported" : undefined,
    },
  });
}
