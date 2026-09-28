// Edge service job-read domain (C4 6a, services/* split): read/query endpoints over jobs + scope —
// job detail (getJob), the customer's active job (listCustomerActiveJobs), pending scope decisions
// (listMyPendingDecisions), and the current scope-change reader. No workflow mutation. Imported by services.ts.

import { asJobStatus, asNumber, asServiceType, asString, asStringArray, nullableComplexity, nullableNumber, nullableRecord, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { JOB_DETAIL_SELECT, parseKaelProgressSnapshot } from "../../platform/job-state.ts";
import { getJobBroadcastState } from "../matching/broadcasts.ts";
import {
  getMatchingState,
  reconcileSavedWorkerFallbackForJob,
} from "../matching/matching-preference.ts";
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
import { loadPaymentReceipt, parsePaymentStatus } from "./payment-receipt.ts";
import { listCustomerServiceHistory } from "./customer-history.ts";
import { getCurrentJobIncidentReview } from "./incident.ts";
import { estimateWorkerNet, frozenWorkerCommissionTier } from "../payment/commission.ts";
import { projectWorkerJobBrief } from "../worker/job-brief.ts";
import {
  resolveSyntheticActorScope,
  scopeQueryToSyntheticActor,
} from "../../platform/synthetic-cohort.ts";

export { listMyPendingDecisions } from "./pending-decisions.ts";
export { listCustomerServiceHistory, projectCustomerServiceHistoryRows } from "./customer-history.ts";

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

type AvailablePaymentRailProvider = "platform_bank_manual" | "sepay_vietqr";

export async function getJob(
  ctx: MobileApiContext,
  jobId: string,
  options: { paymentRailProvider?: AvailablePaymentRailProvider | null } = {},
): Promise<EdgeJobDetailResponse> {
  const client = db(ctx);
  const privilegedClient = (ctx.privilegedSupabase ?? client) as DbClient;
  const job = await requireJobAccess(client, jobId, ctx, {
    select: JOB_DETAIL_SELECT,
  });
  const workerId = nullableString(job.worker_id);
  const paymentProvider = nullableString(job.payment_provider);
  const hasPaymentReceipt = job.status === "payment_pending" ||
    paymentProvider === "platform_bank_manual" || paymentProvider === "direct_worker";
  const incidentReviewVisible = job.status === "inspecting" || job.status === "repairing";
  const [initialBroadcastState, currentJobIncident, currentScopeChange, worker, paymentReceipt] = await Promise.all([
    job.status === "broadcasting" ? getJobBroadcastState(client, jobId) : null,
    incidentReviewVisible ? getCurrentJobIncidentReview(client, jobId) : null,
    job.status === "scope_change_pending" ? getCurrentScopeChange(client, jobId) : null,
    workerId ? loadJobWorkerSummary(privilegedClient, workerId) : null,
    hasPaymentReceipt
      ? loadPaymentReceipt(
        privilegedClient,
        jobId,
        ctx.role,
        ctx.role === "customer" ? ctx.user.id : null,
      )
      : null,
  ]);
  let broadcastState = initialBroadcastState;
  if (
    ctx.role === "customer" &&
    job.status === "broadcasting" &&
    job.quote_mode == null &&
    (broadcastState?.active_count ?? 0) === 0
  ) {
    try {
      const fallback = await reconcileSavedWorkerFallbackForJob(
        client,
        jobId,
        "saved_worker_expired",
      );
      if (fallback.started) {
        broadcastState = await getJobBroadcastState(client, jobId);
      }
    } catch {
      console.warn("mobile-api saved-worker refresh reconciliation failed", { jobId });
    }
  }
  const matchingState = ctx.role === "customer" || ctx.role === "admin"
    ? await getMatchingState(client, jobId, asString(job.status), privilegedClient)
    : null;
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
  const paymentInstructionsVisible = ctx.role === "customer";
  const estimatedWorkerNet = ctx.role === "worker" || ctx.role === "admin"
    ? nullableNumber(job.worker_net) ?? estimateWorkerNet(
      nullableNumber(job.final_price),
      frozenWorkerCommissionTier(job),
    )
    : null;

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
      kael_worker_brief_guidance: workerId && (ctx.role === "worker" || ctx.role === "admin")
        ? projectWorkerJobBrief(job, workerId)
        : null,
      kael_progress: parseKaelProgressSnapshot(job.kael_progress, jobId),
      final_price: nullableNumber(job.final_price),
      estimated_worker_net: estimatedWorkerNet,
      payment_rail_available: ctx.role === "customer" && options.paymentRailProvider !== undefined && options.paymentRailProvider !== null,
      payment_rail_provider: ctx.role === "customer"
        ? options.paymentRailProvider ?? null
        : null,
      payment_status: parsePaymentStatus(job.payment_status),
       payment_provider: paymentProvider,
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
      payment_receipt: paymentReceipt,
      completion_notes: nullableString(job.completion_notes),
      completion_photo_urls: evidenceReleased
        ? asStringArray(job.completion_photo_urls)
        : [],
      created_at: asString(job.created_at),
      matched_at: nullableString(job.matched_at),
      arrived_at: nullableString(job.arrived_at),
      work_started_at: nullableString(job.work_started_at),
      work_paused_at: nullableString(job.work_paused_at),
      work_paused_ms: nullableNumber(job.work_paused_ms) ?? 0,
      worker_work_note: nullableString(job.worker_work_note),
      completed_at: nullableString(job.completed_at),
      confirmed_at: nullableString(job.confirmed_at),
      paid_at: nullableString(job.paid_at),
      reviewed_at: nullableString(job.reviewed_at),
    },
    worker,
    broadcast_state: broadcastState,
    matching_state: matchingState,
    current_job_incident: currentJobIncident,
    current_scope_change: currentScopeChange,
  };
}

export async function listCustomerActiveJobs(
  ctx: MobileApiContext,
  options: { paymentRailProvider?: AvailablePaymentRailProvider | null } = {},
) {
  const client = db(ctx);
  const actorScope = await resolveSyntheticActorScope(client, ctx.user.id, "customer");
  const jobsQuery = client
    .from("jobs")
    .select("id")
    .eq("customer_id", ctx.user.id)
    .in("status", CUSTOMER_ACTIVE_JOB_STATUSES);
  const result = await dbQuery<Array<{ id: string }>>(
    scopeQueryToSyntheticActor(jobsQuery, actorScope)
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
