import { asString, asStringArray, nullableNumber, nullableRecord, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { EdgeWorkerJobListResponse } from "../contracts/worker.ts";
import type { JobStatus, ServiceType } from "../../../../_shared/domain.ts";
import { projectAddressAccess } from "./apartment-access.ts";
import { buildWorkerBriefOutput } from "../../kael/index.ts";
import {
  canReleaseJobEvidenceToWorker,
  listJobEvidenceRefsByStage,
} from "../job/evidence-refs.ts";
import { createSignedCaseWorkEvidenceUrls } from "../kael-chat/media-vision.ts";
import { estimateWorkerNet, getWorkerCommissionTier } from "../payment/commission.ts";

const WORKER_JOB_LIST_COLUMNS =
  "id, customer_id, display_code, status, service_type, kael_problem_identified, address_building, address_unit, address_floor, address_district, apartment_access_profile, apartment_access_state, scheduled_at, kael_price_min, kael_price_max, kael_worker_brief_guidance, final_price, payment_status, payment_provider, payment_received_at, payment_amount_received, gross_amount, platform_fee, worker_net, photo_urls, completion_notes, completion_photo_urls, created_at, matched_at, completed_at";

export async function listWorkerJobs(ctx: MobileApiContext) {
  const client = db(ctx);
  const commissionTierRequest = getWorkerCommissionTier(client, ctx.user.id);
  const assignedJobsRequest = dbQuery<Array<Record<string, unknown>>>(
    client
      .from("jobs")
      .select(WORKER_JOB_LIST_COLUMNS)
      .eq("worker_id", ctx.user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  );
  const candidateJobsRequest = dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_worker_candidates")
      .select(`job_id, jobs!inner(${WORKER_JOB_LIST_COLUMNS})`)
      .eq("worker_id", ctx.user.id)
      .eq("status", "proposed")
      .eq("jobs.status", "worker_candidate_pending")
      .gt("expires_at", new Date().toISOString())
      .order("proposed_at", { ascending: false })
      .limit(20),
  );
  const [assignedJobs, candidateJobs, commissionTier] = await Promise.all([
    assignedJobsRequest,
    candidateJobsRequest,
    commissionTierRequest,
  ]);
  if (assignedJobs.error || candidateJobs.error) {
    apiFailure("DB_ERROR", "Không thể tải danh sách công việc", 500);
  }

  const pendingRows = (candidateJobs.data ?? []).map((candidate) => {
    const related = candidate.jobs;
    const job = isRecord(related)
      ? related
      : Array.isArray(related) && isRecord(related[0])
      ? related[0]
      : null;
    if (!job) apiFailure("DB_ERROR", "Không thể tải công việc đang chờ xác nhận", 500);
    return job;
  });
  const uniqueRows = new Map<string, Record<string, unknown>>();
  for (const row of [...(assignedJobs.data ?? []), ...pendingRows]) {
    const id = asString(row.id);
    if (!uniqueRows.has(id)) uniqueRows.set(id, row);
  }
  const rows = [...uniqueRows.values()]
    .sort((left, right) => Date.parse(asString(right.created_at)) - Date.parse(asString(left.created_at)))
    .slice(0, 100);
  const evidenceReleasedJobIds = rows
    .filter((row) =>
      canReleaseJobEvidenceToWorker(row.status, row.matched_at)
    )
    .map((row) => asString(row.id));
  const fieldEvidenceByJob = await listJobEvidenceRefsByStage(client, {
    jobIds: evidenceReleasedJobIds,
    ownerId: ctx.user.id,
    stage: "kael_reference",
  });
  const customerEvidenceByJob = new Map(await Promise.all(
    rows
      .filter((row) => canReleaseJobEvidenceToWorker(row.status, row.matched_at))
      .map(async (row) => [
        asString(row.id),
        await createSignedCaseWorkEvidenceUrls(
          ctx,
          asStringArray(row.photo_urls),
          nullableString(row.customer_id),
        ),
      ] as const),
  ));
  return {
    jobs: rows.map((row) => {
      const jobId = asString(row.id);
      const evidenceReleased = canReleaseJobEvidenceToWorker(
        row.status,
        row.matched_at,
      );
      const customerEvidencePhotoUrls = evidenceReleased
        ? customerEvidenceByJob.get(jobId) ?? []
        : [];
      const finalPrice = nullableNumber(row.final_price);
      const max = finalPrice ?? nullableNumber(row.kael_price_max);
      const min = nullableNumber(row.kael_price_min);
      const frozenWorkerNet = nullableNumber(row.worker_net);
      const addressProjection = projectAddressAccess(row, "worker");
      const fallbackBrief = buildWorkerBriefOutput({
        stage: "guidance",
        serviceType: row.service_type as ServiceType,
        problemSummary:
          nullableString(row.kael_problem_identified) ?? "Yêu cầu cần thợ kiểm tra",
        district: nullableString(row.address_district),
        fullAddress: addressProjection.fullAddress,
        estimatedEarningMin: estimateWorkerNet(min, commissionTier),
        estimatedEarningMax: frozenWorkerNet ?? estimateWorkerNet(max, commissionTier),
      }).brief;
      return {
        id: jobId,
        display_code: nullableString(row.display_code),
        status: row.status as JobStatus,
        service_type: row.service_type as ServiceType,
        problem_summary: nullableString(row.kael_problem_identified),
        address_building: addressProjection.fullAddress.building,
        address_unit: addressProjection.fullAddress.unit,
        address_floor: addressProjection.fullAddress.floor,
        district: addressProjection.fullAddress.district,
        address_access: addressProjection.addressAccess,
        final_price: finalPrice,
        estimated_earning: frozenWorkerNet ?? estimateWorkerNet(finalPrice, commissionTier),
        payment_status: parseWorkerJobPaymentStatus(row.payment_status),
        payment_provider: nullableString(row.payment_provider),
        payment_code: null,
        payment_transfer_content: null,
        payment_qr_image_url: null,
        payment_expires_at: null,
        payment_received_at: nullableString(row.payment_received_at),
        payment_amount_received: nullableNumber(row.payment_amount_received),
        gross_amount: nullableNumber(row.gross_amount),
        platform_fee: nullableNumber(row.platform_fee),
        worker_net: frozenWorkerNet,
        photo_urls: customerEvidencePhotoUrls,
        customer_evidence_photo_urls: customerEvidencePhotoUrls,
        field_evidence_photo_urls: evidenceReleased
          ? fieldEvidenceByJob.get(jobId) ?? []
          : [],
        completion_notes: nullableString(row.completion_notes),
        completion_photo_urls: evidenceReleased
          ? asStringArray(row.completion_photo_urls)
          : [],
        worker_brief_guidance:
          nullableRecord(row.kael_worker_brief_guidance) ?? fallbackBrief,
        scheduled_at: nullableString(row.scheduled_at),
        created_at: asString(row.created_at),
        matched_at: nullableString(row.matched_at),
        completed_at: nullableString(row.completed_at),
      };
    }),
  };
}

function parseWorkerJobPaymentStatus(
  value: unknown,
): EdgeWorkerJobListResponse["jobs"][number]["payment_status"] {
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
    value === "reconciled" ||
    value === "manual_qr_ready" ||
    value === "manual_customer_claimed" ||
    value === "manual_reconcile_required" ||
    value === "manual_verified" ||
    value === "direct_awaiting_confirmation" ||
    value === "direct_awaiting_customer_confirmation" ||
    value === "direct_awaiting_worker_confirmation" ||
    value === "direct_reconcile_required" ||
    value === "direct_paid"
  ) {
    return value;
  }
  apiFailure("DB_ERROR", "Trạng thái thanh toán không hợp lệ", 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
