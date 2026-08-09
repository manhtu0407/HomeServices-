import {
  asJobStatus,
  asNumber,
  asString,
  asStringArray,
  nullableNumber,
  nullableRecord,
  nullableString,
} from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { parseKaelProgressSnapshot } from "../../platform/job-state.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { JobStatus, ScopeChangeStatus } from "../../../../_shared/domain.ts";
import type { EdgeJobDetailResponse } from "../contracts/job-detail.ts";

export async function listMyPendingDecisions(ctx: MobileApiContext) {
  const client = db(ctx);
  const jobsResult = await dbQuery<
    Array<{ id: string; service_type: string | null; kael_problem_identified: string | null }>
  >(
    client
      .from("jobs")
      .select("id, service_type, kael_problem_identified")
      .eq("customer_id", ctx.user.id)
      .eq("status", "scope_change_pending"),
  );
  if (jobsResult.error) {
    apiFailure("DB_ERROR", "Không thể tải các quyết định đang chờ", 500);
  }
  const jobs = jobsResult.data ?? [];
  if (jobs.length === 0) return { pending_decisions: [] };
  const jobById = new Map(jobs.map((job) => [job.id, job]));

  const scopeResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("scope_change_requests")
      .select(
        "id, job_id, requested_description, reason, price_min, price_max, created_at",
      )
      .in("job_id", jobs.map((job) => job.id))
      .eq("status", "waiting_customer_decision")
      .order("created_at", { ascending: false }),
  );
  if (scopeResult.error) {
    apiFailure("DB_ERROR", "Không thể tải các quyết định đang chờ", 500);
  }
  const pendingDecisions = (scopeResult.data ?? []).map((row) => {
    const jobId = asString(row.job_id);
    const job = jobById.get(jobId);
    return {
      kind: "scope_change" as const,
      scope_change_id: asString(row.id),
      job_id: jobId,
      service_type: job ? nullableString(job.service_type) : null,
      problem: job ? nullableString(job.kael_problem_identified) : null,
      requested_description: asString(row.requested_description),
      reason: asString(row.reason),
      price_min: asNumber(row.price_min),
      price_max: asNumber(row.price_max),
      created_at: asString(row.created_at),
    };
  });
  return { pending_decisions: pendingDecisions };
}

export async function getCurrentScopeChange(
  client: DbClient,
  jobId: string,
): Promise<EdgeJobDetailResponse["current_scope_change"]> {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("scope_change_requests")
      .select(
        "id, status, requested_description, reason, price_min, price_max, kael_computed_min, kael_computed_max, kael_review, kael_progress, evidence_photo_urls, request_timing, resume_job_status, created_at",
      )
      .eq("job_id", jobId)
      .eq("status", "waiting_customer_decision")
      .order("created_at", { ascending: false })
      .limit(1),
  );
  if (result.error) {
    apiFailure(
      "DB_ERROR",
      "Không thể tải yêu cầu đổi phạm vi hiện tại",
      500,
    );
  }
  const row = result.data?.[0];
  if (!row) return null;
  return {
    id: asString(row.id),
    status: row.status as ScopeChangeStatus,
    requested_description: nullableString(row.requested_description),
    reason: nullableString(row.reason),
    price_min: nullableNumber(row.price_min),
    price_max: nullableNumber(row.price_max),
    kael_computed_min: nullableNumber(row.kael_computed_min),
    kael_computed_max: nullableNumber(row.kael_computed_max),
    kael_review: nullableRecord(row.kael_review),
    kael_progress: parseKaelProgressSnapshot(row.kael_progress, asString(row.id)),
    evidence_photo_urls: asStringArray(row.evidence_photo_urls),
    request_timing: parseScopeRequestTiming(row.request_timing),
    resume_job_status: parseNullableJobStatus(row.resume_job_status),
    created_at: nullableString(row.created_at),
  };
}

function parseScopeRequestTiming(value: unknown): "pre_arrival" | "on_site" {
  if (value === "pre_arrival" || value === "on_site") return value;
  apiFailure("DB_ERROR", "Thời điểm đổi phạm vi không hợp lệ", 500);
}

function parseNullableJobStatus(value: unknown): JobStatus | null {
  if (value === null || value === undefined) return null;
  const parsed = asJobStatus(value);
  if (parsed === "draft" && value !== "draft") {
    apiFailure("DB_ERROR", "Trạng thái tiếp tục công việc không hợp lệ", 500);
  }
  return parsed;
}
