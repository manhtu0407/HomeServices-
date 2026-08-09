import { apiLogPurposeForPipelineStage, logApiCalls } from "../../../kael/learning/audit.ts";
import { sourceTrustSecretsForRequest } from "../../../platform/domain-utils.ts";
import { apiFailure } from "../../../platform/api-failure.ts";
import type { MobileApiContext } from "../../../platform/auth.ts";
import type { DbClient } from "../../../platform/db.ts";
import {
  prependDeterministicSafetyGuidance,
  resolveElectricalIntakeRuntime,
  runKaelPipeline,
  type EdgeAiSecrets,
  type PipelineResult,
} from "../../../kael/index.ts";
import { isKaelAiKillSwitchEnabled } from "../../../kael/kael-guardrails/spend-gate.ts";
import type { JobCreateInput } from "../../../../../_shared/domain.ts";
import { retireAnalyzingJobOrFail } from "./compensation.ts";

export type SuccessfulJobPipeline = Extract<PipelineResult, { success: true }>;

export async function analyzeJobOrFail(input: {
  readonly client: DbClient;
  readonly ctx: MobileApiContext;
  readonly request: JobCreateInput;
  readonly secrets: EdgeAiSecrets;
  readonly jobId: string;
  readonly canonicalDistrict: string;
  readonly requestId: string;
}): Promise<SuccessfulJobPipeline> {
  const {
    client,
    ctx,
    request,
    secrets,
    jobId,
    canonicalDistrict,
    requestId,
  } = input;
  const jobIntakeSafetySignals = resolveElectricalIntakeRuntime({
    intakeDiagnosisEnabled: false,
    serviceType: request.service_type,
    problemChips: request.problem_chips,
    description: request.description,
  }).safetySignals;
  const withJobIntakeSafetyGuidance = (message: string) =>
    prependDeterministicSafetyGuidance(
      message,
      isKaelAiKillSwitchEnabled() ? [] : jobIntakeSafetySignals,
      "vi",
    );

  let pipeline: PipelineResult;
  try {
    pipeline = await runKaelPipeline(
      {
        serviceType: request.service_type,
        problemChips: request.problem_chips,
        description: request.description,
        district: canonicalDistrict,
        photoUrls: request.photo_urls,
        progressJobId: jobId,
        actorId: ctx.user.id,
      },
      client,
      sourceTrustSecretsForRequest(secrets, ctx),
    );
  } catch {
    await retireAnalyzingJobOrFail({
      client,
      jobId,
      actor: ctx,
      reasonCode: "PIPELINE_THROW",
      cleanupFailureMessage: "Không thể đóng yêu cầu sau lỗi hệ thống",
    });
    console.warn("mobile-api Kael pipeline threw", {
      jobId,
      reasonCode: "PIPELINE_THROW",
    });
    apiFailure(
      "AI_FAILED",
      withJobIntakeSafetyGuidance("Hệ thống đang xử lý. Vui lòng thử lại."),
      502,
    );
  }

  await logApiCalls(
    client,
    pipeline.stageLogs
      .filter((stage) => stage.provider && stage.model)
      .map((stage) => ({
        job_id: jobId,
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
          ...(stage.cacheStatus ? { cache_status: stage.cacheStatus } : {}),
          ...(stage.safeMetadata ?? {}),
        },
      })),
  );

  if (!pipeline.success) {
    await retireAnalyzingJobOrFail({
      client,
      jobId,
      actor: ctx,
      reasonCode: pipeline.code,
      metadata: pipeline.policyReasonCode
        ? { policy_reason_code: pipeline.policyReasonCode }
        : {},
      cleanupFailureMessage: "Không thể đóng yêu cầu sau lỗi hệ thống",
    });
    if (pipeline.code === "UNSUPPORTED" || pipeline.code === "SERVICE_MISMATCH") {
      apiFailure("UNSUPPORTED", pipeline.error, 400);
    }
    if (pipeline.code === "NO_BASELINE") {
      apiFailure("NO_BASELINE", pipeline.error, 502);
    }
    apiFailure(
      "AI_FAILED",
      withJobIntakeSafetyGuidance("Hệ thống đang xử lý. Vui lòng thử lại."),
      502,
    );
  }

  return pipeline;
}
