// Edge service job-read domain (C4 6a, services/* split): read/query endpoints over jobs + scope —
// job detail (getJob), the customer's active job (listCustomerActiveJobs), pending scope decisions
// (listMyPendingDecisions), and the current scope-change reader. No workflow mutation. Imported by services.ts.

import { asJobStatus, asNumber, asServiceType, asString, asStringArray, nullableComplexity, nullableNumber, nullableRecord, nullableString } from "./coercions.ts";
import { db, dbQuery, type DbClient } from "./db.ts";
import { JOB_DETAIL_SELECT, parseKaelProgressSnapshot } from "./_shared.ts";
import { getJobBroadcastState } from "./broadcasts.service.ts";
import { projectAddressAccess } from "./apartment-access.service.ts";
import { requireJobAccess } from "../access.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import type { JobStatus, ScopeChangeStatus } from "../../../_shared/domain.ts";

const CUSTOMER_ACTIVE_JOB_STATUSES: JobStatus[] = [
  "awaiting_customer_confirm",
  "broadcasting",
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
  "confirmed_by_customer",
  "payment_pending",
];

export async function getJob(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select: JOB_DETAIL_SELECT,
  });
  const broadcastState = job.status === "broadcasting"
    ? await getJobBroadcastState(client, jobId)
    : null;
  const currentScopeChange = job.status === "scope_change_pending"
    ? await getCurrentScopeChange(client, jobId)
    : null;
  const addressProjection = projectAddressAccess(job, ctx.role);

  return {
    job: {
      id: asString(job.id),
      status: asJobStatus(job.status),
      service_type: asServiceType(job.service_type),
      description: asString(job.description),
      problem_chips: asStringArray(job.problem_chips),
      photo_urls: asStringArray(job.photo_urls),
      address_building: addressProjection.fullAddress.building,
      address_unit: addressProjection.fullAddress.unit,
      address_floor: addressProjection.fullAddress.floor,
      address_district: addressProjection.fullAddress.district,
      address_access: addressProjection.addressAccess,
      scheduled_at: nullableString(job.scheduled_at),
      kael_problem_identified: nullableString(job.kael_problem_identified),
      kael_complexity: nullableComplexity(job.kael_complexity),
      kael_price_min: nullableNumber(job.kael_price_min),
      kael_price_max: nullableNumber(job.kael_price_max),
      kael_advisory: nullableString(job.kael_advisory),
      kael_estimate_card_v3: nullableRecord(job.kael_estimate_card_v3),
      kael_worker_brief_core: nullableRecord(job.kael_worker_brief_core),
      kael_worker_brief_guidance: nullableRecord(job.kael_worker_brief_guidance),
      kael_progress: parseKaelProgressSnapshot(job.kael_progress, jobId),
      final_price: nullableNumber(job.final_price),
      completion_notes: nullableString(job.completion_notes),
      completion_photo_urls: asStringArray(job.completion_photo_urls),
      created_at: asString(job.created_at),
      matched_at: nullableString(job.matched_at),
      arrived_at: nullableString(job.arrived_at),
      completed_at: nullableString(job.completed_at),
      confirmed_at: nullableString(job.confirmed_at),
      paid_at: nullableString(job.paid_at),
      reviewed_at: nullableString(job.reviewed_at),
    },
    broadcast_state: broadcastState,
    current_scope_change: currentScopeChange,
  };
}

export async function listCustomerActiveJobs(ctx: MobileApiContext) {
  const client = db(ctx);
  const result = await dbQuery<Array<{ id: string }>>(
    client
      .from("jobs")
      .select("id")
      .eq("customer_id", ctx.user.id)
      .in("status", CUSTOMER_ACTIVE_JOB_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải yêu cầu đang hoạt động", 500);
  }
  const row = result.data?.[0];
  if (!row) return { active_job: null };
  const detail = await getJob(ctx, row.id);
  return { active_job: detail };
}

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

async function getCurrentScopeChange(client: DbClient, jobId: string) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("scope_change_requests")
      .select(
        "id, status, requested_description, reason, price_min, price_max, kael_computed_min, kael_computed_max, kael_review, kael_progress, evidence_photo_urls, created_at",
      )
      .eq("job_id", jobId)
      .in("status", ["waiting_customer_decision", "reviewing_by_kael"])
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
    created_at: nullableString(row.created_at),
  };
}
