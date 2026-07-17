// Edge service job-read domain: read/query endpoints over jobs + scope —
// job detail (getJob), the customer's active job (listCustomerActiveJobs), pending scope decisions
// (listMyPendingDecisions), and the current scope-change reader. No workflow mutation. Imported by services.ts.

import { asJobStatus, asNumber, asServiceType, asString, asStringArray, nullableComplexity, nullableNumber, nullableRecord, nullableString } from "../_runtime/coercions.ts";
import { db, dbQuery, type DbClient } from "../_runtime/db.ts";
import { JOB_DETAIL_SELECT, parseKaelProgressSnapshot } from "../_runtime/shared.ts";
import { getJobBroadcastState } from "../matching/broadcasts.ts";
import { projectAddressAccess } from "../apartment-access/index.ts";
import { requireJobAccess } from "../../access.ts";
import { apiFailure, type MobileApiContext } from "../../router.ts";
import type { JobStatus, ScopeChangeStatus } from "../../../../_shared/domain.ts";
import { resolveWorkerAvatarUrl } from "../workers/avatar.ts";
import type { EdgeJobDetailResponse } from "../../router/dtos.ts";

const CUSTOMER_ACTIVE_JOB_STATUSES: JobStatus[] = [
  "awaiting_customer_confirm",
  "broadcasting",
  "worker_candidate_pending",
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

const CUSTOMER_SERVICE_HISTORY_STATUSES: JobStatus[] = [
  "paid",
  "reviewed",
  "cancelled",
];

export async function getJob(
  ctx: MobileApiContext,
  jobId: string,
): Promise<EdgeJobDetailResponse> {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select: JOB_DETAIL_SELECT,
  });
  const workerId = nullableString(job.worker_id);
  const [broadcastState, currentScopeChange, worker] = await Promise.all([
    job.status === "broadcasting" ? getJobBroadcastState(client, jobId) : null,
    job.status === "scope_change_pending" ? getCurrentScopeChange(client, jobId) : null,
    workerId ? loadJobWorkerSummary(client, workerId) : null,
  ]);
  const addressProjection = projectAddressAccess(job, ctx.role);
  const displayCode = nullableString(job.display_code);

  return {
    job: {
      id: asString(job.id),
      ...(displayCode ? { display_code: displayCode } : {}),
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
      payment_status: parsePaymentStatus(job.payment_status),
      payment_provider: nullableString(job.payment_provider),
      payment_code: nullableString(job.payment_code),
      payment_transfer_content: nullableString(job.payment_transfer_content),
      payment_qr_image_url: nullableString(job.payment_qr_image_url),
      payment_expires_at: nullableString(job.payment_expires_at),
      payment_received_at: nullableString(job.payment_received_at),
      payment_amount_received: nullableNumber(job.payment_amount_received),
      gross_amount: nullableNumber(job.gross_amount),
      platform_fee: nullableNumber(job.platform_fee),
      worker_net: nullableNumber(job.worker_net),
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
    worker,
    broadcast_state: broadcastState,
    current_scope_change: currentScopeChange,
  };
}

function parsePaymentStatus(
  value: unknown,
): EdgeJobDetailResponse["job"]["payment_status"] {
  if (value === null || value === undefined) return null;
  if (
    value === "not_started" ||
    value === "code_requested" ||
    value === "vietqr_ready" ||
    value === "pending" ||
    value === "received" ||
    value === "amount_mismatch" ||
    value === "expired" ||
    value === "failed" ||
    value === "reconciled"
  ) {
    return value;
  }
  apiFailure("DB_ERROR", "Trạng thái thanh toán không hợp lệ", 500);
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

export async function listCustomerServiceHistory(ctx: MobileApiContext) {
  const client = db(ctx);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("jobs")
      .select("id, service_type, status, worker_id, final_price, completed_at, paid_at, reviewed_at, cancelled_at, created_at")
      .eq("customer_id", ctx.user.id)
      .in("status", CUSTOMER_SERVICE_HISTORY_STATUSES)
      .order("updated_at", { ascending: false }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải lịch sử dịch vụ", 500);
  }

  const jobs = result.data ?? [];
  const workerIds = Array.from(new Set(
    jobs.map((job) => nullableString(job.worker_id)).filter((workerId): workerId is string => Boolean(workerId)),
  ));
  if (workerIds.length === 0) {
    return { service_history: projectCustomerServiceHistoryRows(jobs, new Map(), new Set()) };
  }

  const [profileResult, favoriteResult] = await Promise.all([
    dbQuery<Array<Record<string, unknown>>>(
      client.from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", workerIds),
    ),
    dbQuery<Array<Record<string, unknown>>>(
      client.from("customer_favorite_workers")
        .select("worker_id")
        .eq("customer_id", ctx.user.id)
        .in("worker_id", workerIds),
    ),
  ]);
  if (profileResult.error || favoriteResult.error) {
    apiFailure("DB_ERROR", "Không thể tải thông tin thợ trong lịch sử", 500);
  }

  const signedProfiles: Array<Record<string, unknown>> = await Promise.all(
    (profileResult.data ?? []).map(async (profile): Promise<Record<string, unknown>> => ({
      ...profile,
      avatar_url: await resolveWorkerAvatarUrl(client, profile.avatar_url),
    })),
  );
  const profilesByWorkerId = new Map(
    signedProfiles.map((profile) => [asString(profile.id), profile]),
  );
  const favoriteWorkerIds = new Set(
    (favoriteResult.data ?? []).map((favorite) => asString(favorite.worker_id)),
  );

  return {
    service_history: projectCustomerServiceHistoryRows(
      jobs,
      profilesByWorkerId,
      favoriteWorkerIds,
    ),
  };
}

async function loadJobWorkerSummary(
  client: DbClient,
  workerId: string,
): Promise<EdgeJobDetailResponse["worker"]> {
  const [profile, worker] = await Promise.all([
    dbQuery<Record<string, unknown>>(
      client.from("profiles").select("full_name, avatar_url").eq("id", workerId).maybeSingle(),
    ),
    dbQuery<Record<string, unknown>>(
      client.from("worker_profiles").select("legal_name, rating, total_jobs").eq("id", workerId).maybeSingle(),
    ),
  ]);
  if (profile.error || worker.error || !profile.data || !worker.data) {
    apiFailure("DB_ERROR", "Không thể tải thông tin thợ", 500);
  }
  return {
    avatar_url: await resolveWorkerAvatarUrl(client, profile.data.avatar_url),
    full_name: nullableString(profile.data.full_name) ?? nullableString(worker.data.legal_name) ?? "",
    id: workerId,
    rating: Math.max(0, Math.min(5, asNumber(worker.data.rating))),
    total_jobs: Math.max(0, Math.trunc(asNumber(worker.data.total_jobs))),
  };
}

export function projectCustomerServiceHistoryRows(
  jobs: Array<Record<string, unknown>>,
  profilesByWorkerId: Map<string, Record<string, unknown>>,
  favoriteWorkerIds: Set<string>,
) {
  return jobs.map((job) => {
    const status = asJobStatus(job.status);
    const createdAt = asString(job.created_at);
    const endedAt = status === "cancelled"
      ? nullableString(job.cancelled_at) ?? createdAt
      : nullableString(job.reviewed_at) ?? nullableString(job.paid_at) ?? nullableString(job.completed_at) ?? createdAt;
    const workerId = nullableString(job.worker_id);
    const workerProfile = workerId ? profilesByWorkerId.get(workerId) : undefined;
    return {
      id: asString(job.id),
      service_type: asServiceType(job.service_type),
      status,
      ended_at: endedAt,
      final_price: nullableNumber(job.final_price),
      worker: workerId
        ? {
            id: workerId,
            display_name: nullableString(workerProfile?.full_name),
            avatar_url: nullableString(workerProfile?.avatar_url),
            is_favorite: favoriteWorkerIds.has(workerId),
          }
        : null,
    };
  });
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

async function getCurrentScopeChange(
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
