// Edge service job-read domain (C4 6a, services/* split): read/query endpoints over jobs + scope —
// job detail (getJob), the customer's active job (listCustomerActiveJobs), pending scope decisions
// (listMyPendingDecisions), and the current scope-change reader. No workflow mutation. Imported by services.ts.

import { asJobStatus, asNumber, asServiceType, asString, asStringArray, nullableComplexity, nullableNumber, nullableRecord, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { JOB_DETAIL_SELECT, parseKaelProgressSnapshot } from "../../platform/job-state.ts";
import { getJobBroadcastState } from "../matching/broadcasts.ts";
import { projectAddressAccess } from "../worker/apartment-access.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { JobStatus } from "../../../../_shared/domain.ts";
import { resolveWorkerAvatarUrl } from "../worker/avatar.ts";
import type { EdgeJobDetailResponse } from "../contracts/job-detail.ts";
import {
  canReleaseJobEvidenceToWorker,
  listJobEvidenceRefsByStage,
} from "./evidence-refs.ts";
import { createSignedCaseWorkEvidenceUrls } from "../kael-chat/media-vision.ts";
import { getCurrentScopeChange } from "./pending-decisions.ts";

export { listMyPendingDecisions } from "./pending-decisions.ts";

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
  options: { paymentRailAvailable?: boolean } = {},
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
  const evidenceReleased = ctx.role !== "worker" ||
    canReleaseJobEvidenceToWorker(job.status, job.matched_at);
  const fieldEvidenceByJob = workerId && evidenceReleased
    ? await listJobEvidenceRefsByStage(client, {
        jobIds: [jobId],
        ownerId: workerId,
        stage: "kael_reference",
      })
    : new Map<string, string[]>();
  const addressProjection = projectAddressAccess(job, ctx.role);
  const displayCode = nullableString(job.display_code);
  const customerEvidencePhotoUrls = evidenceReleased
    ? await createSignedCaseWorkEvidenceUrls(
      ctx,
      asStringArray(job.photo_urls),
      nullableString(job.customer_id),
    )
    : [];
  const paymentInstructionsVisible = ctx.role !== "worker";

  return {
    job: {
      id: asString(job.id),
      ...(displayCode ? { display_code: displayCode } : {}),
      status: asJobStatus(job.status),
      service_type: asServiceType(job.service_type),
      description: asString(job.description),
      problem_chips: asStringArray(job.problem_chips),
      photo_urls: customerEvidencePhotoUrls,
      customer_evidence_photo_urls: customerEvidencePhotoUrls,
      field_evidence_photo_urls: fieldEvidenceByJob.get(jobId) ?? [],
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
      payment_rail_available: ctx.role === "customer" && options.paymentRailAvailable === true,
      payment_status: parsePaymentStatus(job.payment_status),
      payment_provider: nullableString(job.payment_provider),
      payment_code: paymentInstructionsVisible ? nullableString(job.payment_code) : null,
      payment_transfer_content: paymentInstructionsVisible
        ? nullableString(job.payment_transfer_content)
        : null,
      payment_qr_image_url: paymentInstructionsVisible
        ? nullableString(job.payment_qr_image_url)
        : null,
      payment_expires_at: paymentInstructionsVisible ? nullableString(job.payment_expires_at) : null,
      payment_received_at: nullableString(job.payment_received_at),
      payment_amount_received: nullableNumber(job.payment_amount_received),
      gross_amount: nullableNumber(job.gross_amount),
      platform_fee: nullableNumber(job.platform_fee),
      worker_net: nullableNumber(job.worker_net),
      completion_notes: nullableString(job.completion_notes),
      completion_photo_urls: evidenceReleased
        ? asStringArray(job.completion_photo_urls)
        : [],
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
    value === "cash_confirmed" ||
    value === "amount_mismatch" ||
    value === "expired" ||
    value === "failed" ||
    value === "reconciled"
  ) {
    return value;
  }
  apiFailure("DB_ERROR", "Trạng thái thanh toán không hợp lệ", 500);
}

export async function listCustomerActiveJobs(
  ctx: MobileApiContext,
  options: { paymentRailAvailable?: boolean } = {},
) {
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
  const detail = await getJob(ctx, row.id, options);
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
