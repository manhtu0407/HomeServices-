// Edge service scope-change domain (C4 6a, services/* split): worker scope-change request
// (Kael AI re-pricing) + explicit customer decision. getCurrentScopeChange stays in
// services.ts (uses the local parseKaelProgressSnapshot). Imported directly by services.ts.

import { asComplexityOrNull, asServiceType, asString, asStringArray, nullableNumber, nullableString } from "./coercions.ts";
import { db, dbQuery, type DbClient } from "./db.ts";
import { mapScopeDecisionError, mapScopeRequestError, readEdgeEnvNumber } from "./_shared.ts";
import { logApiCalls, logJobEvent, queueKaelLearningEvent } from "./audit.ts";
import { notifyCustomerScopeChangeRequested, notifyWorkerScopeDecision } from "./notifications.service.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { requireJobAccess } from "../access.ts";
import { validateWorkflowTransition } from "../workflow-orchestrator.ts";
import {
  buildScopeChangeOutputs,
  computeScopeChangeEstimate,
  updateKaelProgress,
  type EdgeAiSecrets,
  type ScopeChangeKaelEstimate,
  type ScopeChangeRiskConfig,
} from "../kael/index.ts";
import type { ComplexityLevel, JobStatus, ScopeChangeStatus } from "../../../_shared/domain.ts";

export async function requestScopeChange(ctx: MobileApiContext, jobId: string, input: {
  new_description: string;
  reason: string;
  photo_urls?: string[];
}, secrets: EdgeAiSecrets) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select:
      "id, status, customer_id, worker_id, service_type, description, address_district, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max",
  });
  const evidencePhotoRefs = await validateScopeChangeEvidenceRefs(
    client,
    jobId,
    ctx.user.id,
    asString(job.customer_id),
    input.photo_urls ?? [],
  );
  const originalPriceMax = nullableNumber(job.kael_price_max);
  const transition = validateWorkflowTransition({
    event: "scope_change_requested",
    from: job.status as JobStatus,
    to: "scope_change_pending",
  });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);
  if (originalPriceMax === null || originalPriceMax <= 0) {
    apiFailure(
      "KAEL_PRICE_MISSING",
      "Kael chưa có giá gốc hợp lệ để tính phạm vi phát sinh",
      409,
    );
  }

  const jobScopeProgressTarget = { table: "jobs" as const, id: jobId };
  await updateKaelProgress(client, jobScopeProgressTarget, {
    stage: "scope_reviewing",
    status: "running",
    progress: 0.24,
  });

  let estimate: Awaited<ReturnType<typeof computeScopeChangeEstimate>>;
  try {
    estimate = await computeScopeChangeEstimate({
      serviceType: asServiceType(job.service_type),
      district: nullableString(job.address_district),
      originalDescription: nullableString(job.description) ?? "",
      originalProblemSummary: nullableString(job.kael_problem_identified),
      originalComplexity: asComplexityOrNull(job.kael_complexity),
      originalPriceMin: nullableNumber(job.kael_price_min),
      originalPriceMax,
      workerReportedDescription: input.new_description,
      workerReason: input.reason,
    }, secrets);
  } catch (error) {
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
  if (estimate.fallback_used || estimate.provider === null || estimate.failure_reason) {
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
  const workerScopeChangeRate = await getWorkerScopeChangeRate(client, ctx.user.id);
  const scopeChangeOutputs = buildScopeChangeOutputs({
    serviceType: asServiceType(job.service_type),
    originalPriceMax,
    newPriceMin: estimate.price_min,
    newPriceMax: estimate.price_max,
    newComplexity: estimate.complexity_assessment,
    hasPhotos: evidencePhotoRefs.length > 0,
    workerDescription: input.new_description,
    workerReason: input.reason,
    workerScopeChangeRate,
    riskConfig: scopeChangeRiskConfig(
      originalPriceMax,
      asComplexityOrNull(job.kael_complexity),
    ),
  });
  const enrichedEstimate: ScopeChangeKaelEstimate = {
    ...estimate,
    anti_fraud: scopeChangeOutputs.anti_fraud,
    worker_challenge: scopeChangeOutputs.worker_challenge,
    customer_card: scopeChangeOutputs.customer_card,
  };
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("request_scope_change_atomic", {
      p_job_id: jobId,
      p_worker_id: ctx.user.id,
      p_new_description: input.new_description,
      p_reason: input.reason,
      p_evidence_photo_urls: evidencePhotoRefs,
      p_kael_computed_min: enrichedEstimate.price_min,
      p_kael_computed_max: enrichedEstimate.price_max,
      p_kael_review: enrichedEstimate,
    }),
  );
  if (result.error) {
    await updateKaelProgress(client, jobScopeProgressTarget, {
      stage: "scope_estimating",
      status: "failed",
      progress: 0.72,
      failureReason: "scope_request_rpc_failed",
    });
    apiFailure("DB_ERROR", "Không thể tạo yêu cầu thay đổi", 500);
  }
  const row = result.data?.[0];
  if (!row) {
    await updateKaelProgress(client, jobScopeProgressTarget, {
      stage: "scope_estimating",
      status: "failed",
      progress: 0.72,
      failureReason: "scope_request_missing_row",
    });
    apiFailure("DB_ERROR", "Không thể tạo yêu cầu thay đổi", 500);
  }
  if (!row.ok) {
    await updateKaelProgress(client, jobScopeProgressTarget, {
      stage: "scope_estimating",
      status: "failed",
      progress: 0.72,
      failureReason: nullableString(row.error_code) ?? "scope_request_rejected",
    });
    mapScopeRequestError(nullableString(row.error_code));
  }
  const scopeChangeId = asString(row.scope_change_id);
  const scopeProgressTarget = { table: "scope_change_requests" as const, id: scopeChangeId };
  await updateKaelProgress(client, scopeProgressTarget, {
    stage: "scope_estimating",
    status: "completed",
    progress: 1,
  });
  await updateKaelProgress(client, jobScopeProgressTarget, {
    stage: "scope_estimating",
    status: "completed",
    progress: 1,
  });
  await logJobEvent(
    client,
    jobId,
    "kael_scope_review_computed",
    ctx,
    null,
    null,
    {
      fallback_used: estimate.fallback_used,
      confidence: estimate.confidence,
      computed_min: estimate.price_min,
      computed_max: estimate.price_max,
      anti_fraud_score: scopeChangeOutputs.anti_fraud.score,
      challenge_required: scopeChangeOutputs.anti_fraud.challenge_required,
    },
  );
  await logScopeChangeEstimateApiCall(client, jobId, enrichedEstimate);
  await logJobEvent(
    client,
    jobId,
    "worker_requested_scope_change",
    ctx,
    null,
    "scope_change_pending",
    {
      scope_change_id: scopeChangeId,
    },
  );
  const customerId = nullableString(job.customer_id);
  await notifyCustomerScopeChangeRequested(
    client,
    jobId,
    customerId,
    scopeChangeId,
  );
  await logJobEvent(
    client,
    jobId,
    "scope_change_notified",
    ctx,
    "scope_change_pending",
    "scope_change_pending",
    { scope_change_id: scopeChangeId, customer_confirmation_required: true },
  );
  await queueKaelLearningEvent(client, 'post-B6', {
    actor_id: ctx.user.id,
    actor_role: ctx.role,
    job_id: jobId,
    customer_id: nullableString(job.customer_id) ?? undefined,
    worker_id: ctx.user.id,
    service_type: asServiceType(job.service_type),
    problem_slug: nullableString(job.kael_problem_identified) ?? undefined,
    district_code: nullableString(job.address_district) ?? undefined,
    complexity: enrichedEstimate.complexity_assessment,
    baseline_min: nullableNumber(job.kael_price_min) ?? undefined,
    baseline_max: originalPriceMax,
    scope_change_requested: true,
    worker_report: {
      has_photos: evidencePhotoRefs.length > 0,
      reported_complexity: enrichedEstimate.complexity_assessment,
      challenge_required: scopeChangeOutputs.anti_fraud.challenge_required,
    },
  });
  return {
    scope_change_id: scopeChangeId,
    job_id: jobId,
    status: row.scope_status as ScopeChangeStatus,
    created_at: asString(row.created_at_ts),
    kael_estimate: {
      price_min: estimate.price_min,
      price_max: estimate.price_max,
      confidence: estimate.confidence,
      problem_summary: estimate.problem_summary,
      advisory: estimate.advisory ?? null,
      complexity_assessment: estimate.complexity_assessment,
      disclaimer: estimate.disclaimer,
      fallback_used: estimate.fallback_used,
    },
    anti_fraud: scopeChangeOutputs.anti_fraud,
    worker_challenge: scopeChangeOutputs.worker_challenge,
    customer_card: scopeChangeOutputs.customer_card,
  };
}

export async function decideScopeChange(
  ctx: MobileApiContext,
  scopeChangeId: string,
  input: { decision: "approve" | "reject" },
) {
  const client = db(ctx);
  const scopeRow = await dbQuery<Record<string, unknown>>(
    client
      .from("scope_change_requests")
      .select("job_id, request_timing, resume_job_status")
      .eq("id", scopeChangeId)
      .maybeSingle(),
  );
  if (scopeRow.error || !scopeRow.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu đổi phạm vi", 404);
  }
  const scopeJobId = nullableString(scopeRow.data?.job_id);
  const requestTiming = nullableString(scopeRow.data?.request_timing) === "pre_arrival"
    ? "pre_arrival"
    : "on_site";
  const nextJobStatus = scopeDecisionToJobStatus(
    input.decision,
    requestTiming,
    nullableString(scopeRow.data?.resume_job_status),
  );
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("decide_scope_change_atomic", {
      p_scope_change_id: scopeChangeId,
      p_customer_id: ctx.user.id,
      p_decision: input.decision,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật quyết định", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể cập nhật quyết định", 500);
  if (!row.ok) mapScopeDecisionError(nullableString(row.error_code));

  const jobId = asString(row.job_id_out);
  if (input.decision === "approve") {
    await logJobEvent(
      client,
      jobId,
      "scope_change_final_price_locked",
      ctx,
      "scope_change_pending",
      nextJobStatus,
      { scope_change_id: scopeChangeId, customer_confirmation: true, request_timing: requestTiming },
    );
  }

  await logJobEvent(
    client,
    jobId,
    input.decision === "approve"
      ? "customer_confirmed_scope_change"
      : "customer_rejected_scope_change",
    ctx,
    "scope_change_pending",
    nextJobStatus,
    { scope_change_id: scopeChangeId, customer_input: input.decision, request_timing: requestTiming },
  );
  await notifyWorkerScopeDecision(client, jobId, scopeChangeId, input.decision);
  return {
    scope_change_id: scopeChangeId,
    job_id: jobId,
    status: row.scope_status as ScopeChangeStatus,
    decided_at: asString(row.decided_at_ts),
  };
}

async function logScopeChangeEstimateApiCall(
  client: DbClient,
  jobId: string,
  estimate: ScopeChangeKaelEstimate,
) {
  const traceRows = (estimate.trace ?? [])
    .filter((trace) =>
      trace.purpose === "scope_change" &&
      trace.provider !== null &&
      trace.model !== null
    )
    .map((trace) => ({
      job_id: jobId,
      request_id: crypto.randomUUID(),
      purpose: "scope_change",
      provider: trace.provider,
      model: trace.model,
      input_tokens: null,
      output_tokens: null,
      cost_usd: trace.cost_usd,
      latency_ms: trace.latency_ms ?? 0,
      success: trace.validation.status === "pass",
      error_code: trace.validation.reason_code ?? null,
      safe_metadata: trace.safe_metadata,
    }));
  if (traceRows.length > 0) {
    await logApiCalls(client, traceRows);
    return;
  }

  const provider = estimate.provider;
  const model = estimate.model;
  if (!provider || !model) return;
  await logApiCalls(client, [{
    job_id: jobId,
    request_id: crypto.randomUUID(),
    purpose: "scope_change",
    provider,
    model,
    input_tokens: null,
    output_tokens: null,
    cost_usd: estimate.cost_usd,
    latency_ms: estimate.latency_ms ?? 0,
    success: !estimate.fallback_used,
    error_code: estimate.failure_reason ?? null,
  }]);
}

async function getWorkerScopeChangeRate(
  client: DbClient,
  workerId: string,
): Promise<number> {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("worker_scope_change_stats")
      .select("scope_change_rate")
      .eq("worker_id", workerId)
      .maybeSingle(),
  );
  if (result.error || !result.data) return 0;
  const rate = nullableNumber(result.data.scope_change_rate) ?? 0;
  return Math.max(0, Math.min(1, rate));
}

function scopeDecisionToJobStatus(
  decision: "approve" | "reject",
  requestTiming: "pre_arrival" | "on_site",
  resumeStatus: string | null,
): JobStatus {
  const allowedResumeStatuses = new Set<JobStatus>([
    "worker_matched",
    "worker_on_way",
    "arrived",
    "inspecting",
    "repairing",
  ]);
  const safeResume = allowedResumeStatuses.has(resumeStatus as JobStatus)
    ? resumeStatus as JobStatus
    : "repairing";
  return decision === "approve" && requestTiming === "on_site"
    ? "repairing"
    : safeResume;
}

async function validateScopeChangeEvidenceRefs(
  client: DbClient,
  jobId: string,
  workerId: string,
  _customerId: string,
  mediaRefs: string[],
) {
  const normalizedRefs = [...new Set(mediaRefs.map((ref) => ref.trim()).filter(Boolean))];
  if (normalizedRefs.length === 0) return [];
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("validate_scope_change_evidence_refs", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_media_refs: normalizedRefs,
    }),
  );
  if (result.error) {
    apiFailure(
      "SCOPE_MEDIA_VALIDATION_UNAVAILABLE",
      "Chưa thể xác minh ảnh bằng chứng riêng tư. Vui lòng thử lại.",
      503,
    );
  }
  const row = result.data?.[0];
  if (!row || row.ok !== true) {
    apiFailure(
      nullableString(row?.reason) ?? "INVALID_SCOPE_MEDIA_REF",
      "Ảnh bằng chứng không thuộc công việc hoặc người tham gia hiện tại.",
      400,
    );
  }
  const validatedRefs = asStringArray(row.validated_refs);
  if (validatedRefs.length !== normalizedRefs.length) {
    apiFailure("INVALID_SCOPE_MEDIA_REF", "Ảnh bằng chứng chưa được xác minh đầy đủ.", 400);
  }
  return validatedRefs;
}

function scopeChangeRiskConfig(
  originalPriceMax: number,
  originalComplexity: ComplexityLevel | null,
): ScopeChangeRiskConfig {
  const complexityHours = { small: 1, medium: 3, large: 6 };
  const baselineComplexity = originalComplexity ?? "medium";
  const derivedHourlyRate = Math.max(
    1,
    Math.round(originalPriceMax / (complexityHours[baselineComplexity] * 1.5)),
  );
  return {
    complexityHours,
    hcmcHourlyRateVnd:
      readEdgeEnvNumber("SCOPE_CHANGE_HCMC_HOURLY_RATE_VND") ??
        derivedHourlyRate,
    baseMultiplier: readEdgeEnvNumber("SCOPE_CHANGE_BASE_MULTIPLIER") ?? 1.5,
  };
}
