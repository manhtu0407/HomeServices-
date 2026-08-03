// Scope-change customer decision, evidence validation, and durable API telemetry.

import {
  asString,
  asStringArray,
  nullableNumber,
  nullableString,
} from "../../../platform/coercions.ts";
import { mapScopeDecisionError } from "../../../platform/domain-error-mappers.ts";
import { readEdgeEnvNumber } from "../../../platform/edge-env.ts";
import { logJobEvent } from "../../../platform/audit.ts";
import { logApiCalls } from "../../../kael/learning/audit.ts";
import { notifyWorkerScopeDecision } from "../../notification/notifications.ts";
import { db, type DbClient, dbQuery } from "../../../platform/db.ts";
import { apiFailure } from "../../../platform/api-failure.ts";
import type { MobileApiContext } from "../../../platform/auth.ts";
import type {
  ComplexityLevel,
  JobStatus,
  ScopeChangeStatus,
} from "../../../../../_shared/domain.ts";
import type {
  ScopeChangeKaelEstimate,
  ScopeChangeRiskConfig,
} from "../../../kael/index.ts";

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
  const requestTiming =
    nullableString(scopeRow.data?.request_timing) === "pre_arrival"
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
      {
        scope_change_id: scopeChangeId,
        customer_confirmation: true,
        request_timing: requestTiming,
      },
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
    {
      scope_change_id: scopeChangeId,
      customer_input: input.decision,
      request_timing: requestTiming,
    },
  );
  await notifyWorkerScopeDecision(client, jobId, scopeChangeId, input.decision);
  return {
    scope_change_id: scopeChangeId,
    job_id: jobId,
    status: row.scope_status as ScopeChangeStatus,
    decided_at: asString(row.decided_at_ts),
  };
}

export async function logScopeChangeEstimateApiCall(
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

export async function getWorkerScopeChangeRate(
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

export async function validateScopeChangeEvidenceRefs(
  client: DbClient,
  jobId: string,
  workerId: string,
  _customerId: string,
  mediaRefs: string[],
) {
  const normalizedRefs = [
    ...new Set(mediaRefs.map((ref) => ref.trim()).filter(Boolean)),
  ];
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
    apiFailure(
      "INVALID_SCOPE_MEDIA_REF",
      "Ảnh bằng chứng chưa được xác minh đầy đủ.",
      400,
    );
  }
  return validatedRefs;
}

export function scopeChangeRiskConfig(
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
    hcmcHourlyRateVnd: readEdgeEnvNumber("SCOPE_CHANGE_HCMC_HOURLY_RATE_VND") ??
      derivedHourlyRate,
    baseMultiplier: readEdgeEnvNumber("SCOPE_CHANGE_BASE_MULTIPLIER") ?? 1.5,
  };
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
