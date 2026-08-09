// Scope-change request support: atomic claims/replay and Kael estimate preparation.

import {
  asComplexityOrNull,
  asRecord,
  asServiceType,
  asString,
  nullableNumber,
  nullableString,
} from "../../../platform/coercions.ts";
import { mapScopeRequestError } from "../../../platform/domain-error-mappers.ts";
import { type DbClient, dbQuery } from "../../../platform/db.ts";
import { apiFailure } from "../../../platform/api-failure.ts";
import type { MobileApiContext } from "../../../platform/auth.ts";
import {
  buildScopeChangeOutputs,
  computeScopeChangeEstimate,
  type EdgeAiSecrets,
  type ScopeChangeKaelEstimate,
  updateKaelProgress,
} from "../../../kael/index.ts";
import type { ScopeChangeStatus } from "../../../../../_shared/domain.ts";
import {
  getWorkerScopeChangeRate,
  logScopeChangeEstimateApiCall,
  scopeChangeRiskConfig,
} from "./decision.ts";

type PricedScopeChangeEstimate = Extract<
  ScopeChangeKaelEstimate,
  { fallback_used: false }
>;

export async function releaseDirectScopeClaim(
  client: DbClient,
  jobId: string,
  workerId: string,
  clientRequestId: string | undefined,
  claimId: string | null,
  errorCode: string,
) {
  if (!clientRequestId || !claimId) return;
  try {
    const result = await dbQuery<Array<Record<string, unknown>>>(
      client.rpc("release_scope_change_request_claim_atomic", {
        p_job_id: jobId,
        p_worker_id: workerId,
        p_client_request_id: clientRequestId,
        p_claim_id: claimId,
        p_error_code: errorCode,
      }),
    );
    if (result.error || result.data?.[0]?.released !== true) {
      console.warn("mobile-api scope-change claim release failed", {
        jobId,
        errorCode,
      });
    }
  } catch {
    console.warn("mobile-api scope-change claim release threw", {
      jobId,
      errorCode,
    });
  }
}

export async function prepareScopeChangeEstimate(input: {
  readonly client: DbClient;
  readonly ctx: MobileApiContext;
  readonly job: Record<string, unknown>;
  readonly jobId: string;
  readonly request: {
    client_request_id?: string;
    new_description: string;
    reason: string;
  };
  readonly secrets: EdgeAiSecrets;
  readonly originalPriceMax: number;
  readonly evidencePhotoRefs: string[];
  readonly directClaimId: string | null;
}) {
  const {
    client,
    ctx,
    job,
    jobId,
    request,
    secrets,
    originalPriceMax,
    evidencePhotoRefs,
    directClaimId,
  } = input;
  const jobScopeProgressTarget = { table: "jobs" as const, id: jobId };
  await updateKaelProgress(client, jobScopeProgressTarget, {
    stage: "scope_reviewing",
    status: "running",
    progress: 0.24,
  });

  let estimate: Awaited<ReturnType<typeof computeScopeChangeEstimate>>;
  try {
    estimate = await computeScopeChangeEstimate(
      {
        serviceType: asServiceType(job.service_type),
        district: nullableString(job.address_district),
        originalDescription: nullableString(job.description) ?? "",
        originalProblemSummary: nullableString(job.kael_problem_identified),
        originalComplexity: asComplexityOrNull(job.kael_complexity),
        originalPriceMin: nullableNumber(job.kael_price_min),
        originalPriceMax,
        workerReportedDescription: request.new_description,
        workerReason: request.reason,
      },
      secrets,
      { client, actorId: ctx.user.id },
    );
  } catch (error) {
    await releaseDirectScopeClaim(
      client,
      jobId,
      ctx.user.id,
      request.client_request_id,
      directClaimId,
      "SCOPE_REVIEW_FAILED",
    );
    await updateKaelProgress(client, jobScopeProgressTarget, {
      stage: "scope_reviewing",
      status: "failed",
      progress: 0.24,
      failureReason: "scope_review_failed",
    });
    throw error;
  }
  await updateKaelProgress(client, jobScopeProgressTarget, {
    stage: "scope_estimating",
    status: "running",
    progress: 0.68,
  });
  if (
    estimate.fallback_used || estimate.provider === null ||
    estimate.failure_reason
  ) {
    await logScopeChangeEstimateApiCall(client, jobId, estimate);
    await releaseDirectScopeClaim(
      client,
      jobId,
      ctx.user.id,
      request.client_request_id,
      directClaimId,
      estimate.failure_reason ?? "SCOPE_ESTIMATE_UNAVAILABLE",
    );
    await updateKaelProgress(client, jobScopeProgressTarget, {
      stage: "scope_estimating",
      status: "failed",
      progress: 0.68,
      failureReason: estimate.failure_reason ?? "scope_estimate_unavailable",
    });
    apiFailure(
      "KAEL_ESTIMATE_UNAVAILABLE",
      "Kael chưa thể tính giá phát sinh từ nguồn đã kiểm chứng. Phạm vi hiện tại vẫn được giữ nguyên để chờ thử lại hoặc hỗ trợ rà soát.",
      503,
    );
  }
  if (estimate.price_max <= 0 || estimate.price_max < estimate.price_min) {
    await releaseDirectScopeClaim(
      client,
      jobId,
      ctx.user.id,
      request.client_request_id,
      directClaimId,
      "SCOPE_ESTIMATE_INVALID",
    );
    await updateKaelProgress(client, jobScopeProgressTarget, {
      stage: "scope_estimating",
      status: "failed",
      progress: 0.68,
      failureReason: "scope_estimate_invalid",
    });
    apiFailure(
      "KAEL_PRICE_MISSING",
      "Kael chưa thể tính giá phát sinh hợp lệ",
      409,
    );
  }
  const workerScopeChangeRate = await getWorkerScopeChangeRate(
    client,
    ctx.user.id,
  );
  const scopeChangeOutputs = buildScopeChangeOutputs({
    serviceType: asServiceType(job.service_type),
    originalPriceMax,
    newPriceMin: estimate.price_min,
    newPriceMax: estimate.price_max,
    newComplexity: estimate.complexity_assessment,
    hasPhotos: evidencePhotoRefs.length > 0,
    workerDescription: request.new_description,
    workerReason: request.reason,
    workerScopeChangeRate,
    riskConfig: scopeChangeRiskConfig(
      originalPriceMax,
      asComplexityOrNull(job.kael_complexity),
    ),
  });
  const enrichedEstimate: PricedScopeChangeEstimate = {
    ...estimate,
    anti_fraud: scopeChangeOutputs.anti_fraud,
    worker_challenge: scopeChangeOutputs.worker_challenge,
    customer_card: scopeChangeOutputs.customer_card,
  };
  return {
    estimate,
    enrichedEstimate,
    scopeChangeOutputs,
    jobScopeProgressTarget,
  };
}

export function parseScopeChangeReplay(value: unknown, expectedJobId: string) {
  const payload = asRecord(value);
  const estimate = asRecord(payload.kael_estimate);
  const scopeChangeId = nullableString(payload.scope_change_id);
  const jobId = nullableString(payload.job_id);
  const status = nullableString(payload.status);
  const createdAt = nullableString(payload.created_at);
  const priceMin = nullableNumber(estimate.price_min);
  const priceMax = nullableNumber(estimate.price_max);
  const confidence = nullableNumber(estimate.confidence);
  const problemSummary = nullableString(estimate.problem_summary);
  const advisory = estimate.advisory === null
    ? null
    : nullableString(estimate.advisory);
  const complexity = asComplexityOrNull(estimate.complexity_assessment);
  const disclaimer = nullableString(estimate.disclaimer);
  const fallbackUsed = typeof estimate.fallback_used === "boolean"
    ? estimate.fallback_used
    : null;
  if (
    !scopeChangeId ||
    jobId !== expectedJobId ||
    !status ||
    !createdAt ||
    priceMin === null ||
    priceMin <= 0 ||
    priceMax === null ||
    priceMax < priceMin ||
    confidence === null ||
    !problemSummary ||
    (estimate.advisory !== null && advisory === null) ||
    complexity === null ||
    !disclaimer ||
    fallbackUsed === null
  ) {
    apiFailure(
      "DB_ERROR",
      "Không thể phát lại yêu cầu thay đổi đã hoàn tất",
      500,
    );
  }
  return {
    scope_change_id: scopeChangeId,
    job_id: jobId,
    status: status as ScopeChangeStatus,
    created_at: createdAt,
    kael_estimate: {
      price_min: priceMin,
      price_max: priceMax,
      confidence,
      problem_summary: problemSummary,
      advisory,
      complexity_assessment: complexity,
      disclaimer,
      fallback_used: fallbackUsed,
    },
    anti_fraud: asRecord(payload.anti_fraud),
    worker_challenge: asRecord(payload.worker_challenge),
    customer_card: asRecord(payload.customer_card),
  };
}

export function mapDirectScopeClaimError(errorCode: string | null): never {
  if (errorCode === "REQUEST_IN_PROGRESS") {
    apiFailure(
      "REQUEST_IN_PROGRESS",
      "Kael đang tạo yêu cầu thay đổi này. Vui lòng chờ trong giây lát.",
      409,
    );
  }
  if (errorCode === "IDEMPOTENCY_CONFLICT") {
    apiFailure(
      "IDEMPOTENCY_CONFLICT",
      "Mã yêu cầu đã được dùng cho nội dung khác.",
      409,
    );
  }
  if (errorCode === "INVALID_INPUT") {
    apiFailure("VALIDATION", "Nội dung yêu cầu thay đổi không hợp lệ", 400);
  }
  mapScopeRequestError(errorCode);
}
