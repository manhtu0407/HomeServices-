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
  updateKaelProgress,
} from "../../../kael/index.ts";
import type { ScopeChangeStatus } from "../../../../../_shared/domain.ts";
import {
  getWorkerScopeChangeRate,
  logScopeChangeEstimateApiCall,
  scopeChangeRiskConfig,
} from "./decision.ts";
import { releaseDirectScopeClaim } from "./claim-support.ts";
import type { PricedScopeChangeEstimate } from "./effects-contracts.ts";
import { resolveVerifiedEstimate } from "./verified-estimate.ts";
import { parseBaselinePriceEvidenceReceipt } from "../../../kael/evidence/baseline-price-evidence.ts";

export async function prepareScopeChangeEstimate(input: {
  readonly client: DbClient;
  readonly ctx: MobileApiContext;
  readonly job: Record<string, unknown>;
  readonly jobId: string;
  readonly request: { client_request_id?: string; new_description: string; reason: string };
  readonly secrets: EdgeAiSecrets;
  readonly originalPriceMax: number;
  readonly evidencePhotoRefs: string[];
  readonly directClaimId: string | null;
}) {
  const { client, ctx, job, jobId, request, secrets } = input;
  const { originalPriceMax, evidencePhotoRefs, directClaimId } = input;
  const jobScopeProgressTarget = { table: "jobs" as const, id: jobId };
  await updateKaelProgress(client, jobScopeProgressTarget, {
    stage: "scope_reviewing",
    status: "running",
    progress: 0.24,
  });

  const serviceType = asServiceType(job.service_type);
  let analysis: Awaited<ReturnType<typeof computeScopeChangeEstimate>>;
  try {
    analysis = await computeScopeChangeEstimate(
      {
        serviceType,
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
    analysis.fallback_used || analysis.provider === null ||
    analysis.failure_reason
  ) {
    await logScopeChangeEstimateApiCall(client, jobId, analysis);
    await releaseDirectScopeClaim(
      client,
      jobId,
      ctx.user.id,
      request.client_request_id,
      directClaimId,
      analysis.failure_reason ?? "SCOPE_ESTIMATE_UNAVAILABLE",
    );
    await updateKaelProgress(client, jobScopeProgressTarget, {
      stage: "scope_estimating",
      status: "failed",
      progress: 0.68,
      failureReason: analysis.failure_reason ?? "scope_estimate_unavailable",
    });
    apiFailure(
      "KAEL_ESTIMATE_UNAVAILABLE",
      "Kael chưa thể tính giá phát sinh từ nguồn đã kiểm chứng. Phạm vi hiện tại vẫn được giữ nguyên để chờ thử lại hoặc hỗ trợ rà soát.",
      503,
    );
  }
  const verified = await resolveVerifiedEstimate({
    analysis,
    client,
    district: nullableString(job.address_district) ?? "hcmc_all",
    originalScope: originalVerifiedScope(job),
    scopeExclusions: explicitScopeExclusions(request.new_description),
    serviceType,
    workerId: ctx.user.id,
  });
  if (!verified.success) {
    await logScopeChangeEstimateApiCall(client, jobId, analysis);
    await releaseDirectScopeClaim(
      client,
      jobId,
      ctx.user.id,
      request.client_request_id,
      directClaimId,
      "SCOPE_BASELINE_UNAVAILABLE",
    );
    await updateKaelProgress(client, jobScopeProgressTarget, {
      stage: "scope_estimating",
      status: "failed",
      progress: 0.68,
      failureReason: verified.error,
    });
    apiFailure("KAEL_ESTIMATE_UNAVAILABLE", "Kael chưa thể tính giá phát sinh hợp lệ", 503);
  }
  const estimate = verified.estimate;
  const workerScopeChangeRate = await getWorkerScopeChangeRate(
    client,
    ctx.user.id,
  );
  const scopeChangeOutputs = buildScopeChangeOutputs({
    serviceType,
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

function originalVerifiedScope(job: Record<string, unknown>) {
  const envelope = asRecord(job.kael_estimate_card_v3);
  const card = asRecord(envelope.card);
  const reasoning = asRecord(card.price_reasoning_receipt);
  const fairness = asRecord(reasoning.fairness);
  const evidenceReceipt = parseBaselinePriceEvidenceReceipt(
    fairness.baseline_evidence,
  );
  const priceMin = nullableNumber(job.kael_price_min);
  const priceMax = nullableNumber(job.kael_price_max);
  if (!evidenceReceipt || priceMin === null || priceMax === null) return undefined;
  return { evidenceReceipt, priceMax, priceMin };
}

function explicitScopeExclusions(description: string) {
  const normalized = description.normalize("NFC").toLocaleLowerCase("vi-VN");
  return {
    materialsExcluded:
      /(?:không gồm|không bao gồm|loại trừ)[^.;]{0,80}vật tư/u.test(normalized) ||
      /materials?\s+(?:excluded|not included)/u.test(normalized),
    surfaceFinishExcluded:
      /(?:không gồm|không bao gồm|loại trừ)[^.;]{0,100}(?:hoàn thiện|trám|sơn)[^.;]{0,60}(?:gạch|tường|bề mặt)/u.test(
        normalized,
      ) || /surface finish(?:ing)?\s+(?:excluded|not included)/u.test(normalized),
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
