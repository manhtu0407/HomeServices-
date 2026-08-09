import { normalizeServiceAreaDistrict } from "../../../../_shared/domain.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { buildWorkerBriefOutput } from "../../kael/index.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { projectAddressAccess } from "../worker/apartment-access.ts";
import { logJobEvent } from "../../platform/audit.ts";
import {
  createBroadcasts,
  expireStaleBroadcasts,
  failBroadcastRetryClaim,
  hasActiveBroadcast,
  isBroadcastRetryContention,
  listBroadcastRecipientWorkerIds,
  runWithBroadcastRetryLease,
} from "./broadcasts.ts";
import { asServiceType, nullableNumber, nullableString } from "../../platform/coercions.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { insertUserNotification } from "../notification/notifications.ts";
import { resolveWorkerAvatarUrl } from "../worker/avatar.ts";
import { estimateWorkerNet, getWorkerCommissionTier } from "../payment/commission.ts";

export async function notifyCustomerCandidateReady(
  client: DbClient,
  jobId: string,
  candidateId: string,
) {
  const owner = await dbQuery<Record<string, unknown>>(
    client.from("jobs").select("customer_id").eq("id", jobId).maybeSingle(),
  );
  if (owner.error) {
    console.warn("mobile-api candidate notification owner lookup failed", {
      jobId,
      errorCode: owner.error.code,
    });
    return;
  }
  const customerId = owner.data ? nullableString(owner.data.customer_id) : null;
  if (!customerId) return;
  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType: "worker_candidate_ready",
    title: "Có thợ đang chờ bạn xác nhận",
    body: "Kael đã tìm thấy thợ phù hợp. Hãy xem thông tin đã xác minh và quyết định.",
    metadata: { candidate_id: candidateId },
  });
}

export async function loadSafeWorkerCandidateView(
  client: DbClient,
  jobId: string,
  candidateId: string,
  customerId: string,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client.from("job_worker_candidates")
      .select("id, job_id, worker_id, status, proposed_at, expires_at, customer_decided_at")
      .eq("id", candidateId).eq("job_id", jobId).maybeSingle(),
  );
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy thợ đang chờ xác nhận", 404);
  }
  return buildSafeWorkerCandidateView(client, result.data, customerId);
}

export async function buildSafeWorkerCandidateView(
  client: DbClient,
  candidate: Record<string, unknown>,
  customerId: string,
) {
  const workerId = nullableString(candidate.worker_id);
  if (!workerId) apiFailure("DB_ERROR", "Dữ liệu thợ đề xuất không hợp lệ", 500);
  const [worker, profile, favorite] = await Promise.all([
    dbQuery<Record<string, unknown>>(
      client.from("worker_profiles")
        .select("id, rating, total_jobs, years_experience, verification_status")
        .eq("id", workerId).maybeSingle(),
    ),
    dbQuery<Record<string, unknown>>(
      client.from("profiles").select("full_name, avatar_url").eq("id", workerId).maybeSingle(),
    ),
    dbQuery<Record<string, unknown>>(
      client.from("customer_favorite_workers").select("worker_id")
        .eq("customer_id", customerId).eq("worker_id", workerId).maybeSingle(),
    ),
  ]);
  if (worker.error || profile.error || favorite.error || !worker.data || !profile.data) {
    apiFailure("DB_ERROR", "Không thể tải hồ sơ thợ đề xuất", 500);
  }
  const status = nullableString(candidate.status);
  if (
    status !== "proposed" && status !== "customer_confirmed" &&
    status !== "customer_declined" && status !== "expired" && status !== "withdrawn"
  ) {
    apiFailure("DB_ERROR", "Trạng thái thợ đề xuất không hợp lệ", 500);
  }
  const candidateId = requiredCandidateString(candidate.id);
  const proposedAt = requiredCandidateString(candidate.proposed_at);
  const totalJobs = requiredCandidateInteger(worker.data.total_jobs);
  const yearsExperience = requiredCandidateInteger(worker.data.years_experience);
  const verificationStatus = requiredCandidateString(
    worker.data.verification_status,
  );
  const rating = nullableNumber(worker.data.rating);
  if (worker.data.rating !== null && worker.data.rating !== undefined &&
    (rating === null || rating < 0 || rating > 5)) {
    apiFailure("DB_ERROR", "Dữ liệu hồ sơ thợ đề xuất không hợp lệ", 500);
  }
  const avatarUrl = await resolveWorkerAvatarUrl(client, profile.data.avatar_url);
  return {
    candidate_id: candidateId,
    worker_id: workerId,
    status: status as "proposed" | "customer_confirmed" | "customer_declined" | "expired" | "withdrawn",
    display_name: nullableString(profile.data.full_name),
    avatar_url: avatarUrl,
    rating: totalJobs > 0 && rating !== null && rating > 0 ? rating : null,
    total_jobs: totalJobs,
    years_experience: yearsExperience,
    verification_status: verificationStatus,
    is_favorite: favorite.data !== null,
    proposed_at: proposedAt,
    expires_at: nullableString(candidate.expires_at),
    customer_decided_at: nullableString(candidate.customer_decided_at),
  };
}

function requiredCandidateInteger(value: unknown): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim().length > 0
    ? Number(value)
    : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    apiFailure("DB_ERROR", "Dữ liệu hồ sơ thợ đề xuất không hợp lệ", 500);
  }
  return parsed;
}

function requiredCandidateString(value: unknown): string {
  const parsed = nullableString(value);
  if (!parsed?.trim()) {
    apiFailure("DB_ERROR", "Dữ liệu hồ sơ thợ đề xuất không hợp lệ", 500);
  }
  return parsed;
}

export async function resumeMatchingAfterCandidateRejection(
  client: DbClient,
  ctx: MobileApiContext,
  jobId: string,
) {
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, status, customer_id, worker_id, service_type, address_district",
  });
  if (job.status !== "broadcasting") {
    return { broadcastSent: false, message: "Quyết định này đã được xử lý." };
  }
  const now = new Date().toISOString();
  await expireStaleBroadcasts(client, jobId, now);
  if (await hasActiveBroadcast(client, jobId, now)) {
    return { broadcastSent: true, message: "Kael đang tiếp tục tìm thợ phù hợp." };
  }
  const district = normalizeServiceAreaDistrict(nullableString(job.address_district) ?? "");
  if (!district) apiFailure("VALIDATION", "Địa chỉ cần có quận TP.HCM rõ ràng", 400);
  const recipients = await listBroadcastRecipientWorkerIds(client, jobId);
  if (!recipients.success) apiFailure("DB_ERROR", "Không thể tiếp tục tìm thợ", 500);
  const claimResult = await runWithBroadcastRetryLease(
    client,
    jobId,
    ctx.user.id,
    async () => {
      const broadcast = await createBroadcasts(
        client,
        jobId,
        asServiceType(job.service_type),
        district,
        { excludeWorkerIds: recipients.workerIds },
      );
      if (!broadcast.success) {
        if (broadcast.reasonCode === "DB_ERROR") {
          apiFailure("DB_ERROR", "Không thể tiếp tục tìm thợ", 500);
        }
        await logJobEvent(
          client,
          jobId,
          "no_worker_found_after_candidate_rejection",
          ctx,
          "broadcasting",
          null,
          { excluded_worker_count: recipients.workerIds.length },
        );
        return { broadcastSent: false, message: broadcast.reason };
      }
      await logJobEvent(
        client,
        jobId,
        "broadcast_sent_after_candidate_rejection",
        ctx,
        "broadcasting",
        null,
        {
          batch_id: broadcast.batchId,
          worker_count: broadcast.broadcastCount,
          excluded_worker_count: recipients.workerIds.length,
        },
      );
      return {
        broadcastSent: true,
        message: `Kael đã gửi yêu cầu đến ${broadcast.broadcastCount} thợ tiếp theo.`,
      };
    },
  );
  if (!claimResult.acquired) {
    if (isBroadcastRetryContention(claimResult.reasonCode)) {
      return { broadcastSent: false, message: "Kael đang tiếp tục tìm thợ phù hợp." };
    }
    failBroadcastRetryClaim(claimResult.reasonCode);
  }
  return claimResult.value;
}

export function mapWorkerCandidateDecisionError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy thợ đang chờ xác nhận", 404);
  }
  if (errorCode === "INVALID_STATUS" || errorCode === "STATUS_CHANGED" || errorCode === "EXPIRED") {
    apiFailure("INVALID_STATUS", "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.", 409);
  }
  if (errorCode === "WORKER_NOT_ELIGIBLE") {
    apiFailure("WORKER_NOT_ELIGIBLE", "Thợ này không còn sẵn sàng. Vui lòng chọn tìm thợ khác.", 409);
  }
  apiFailure("DB_ERROR", "Không thể cập nhật thợ đề xuất", 500);
}

export function candidateHasExpired(value: unknown) {
  const expiresAt = nullableString(value);
  if (!expiresAt) return false;
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

export async function persistWorkerBriefGuidanceAfterAccept(
  client: DbClient,
  jobId: string,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client.from("jobs")
      .select("id, worker_id, status, service_type, kael_problem_identified, address_building, address_unit, address_floor, address_district, apartment_access_profile, apartment_access_state, kael_price_min, kael_price_max, final_price")
      .eq("id", jobId).maybeSingle(),
  );
  if (result.error || !result.data) return;
  const job = result.data;
  const finalPrice = nullableNumber(job.final_price) ?? nullableNumber(job.kael_price_max);
  const priceMin = nullableNumber(job.kael_price_min);
  const workerId = nullableString(job.worker_id);
  const commissionTier = workerId
    ? await getWorkerCommissionTier(client, workerId)
    : null;
  const addressProjection = projectAddressAccess(job, "worker", { forcedStage: "building_released" });
  const guidance = buildWorkerBriefOutput({
    stage: "guidance",
    serviceType: asServiceType(job.service_type),
    problemSummary: nullableString(job.kael_problem_identified) ?? "Yêu cầu cần thợ kiểm tra",
    district: nullableString(job.address_district),
    fullAddress: addressProjection.fullAddress,
    estimatedEarningMin: estimateWorkerNet(priceMin, commissionTier),
    estimatedEarningMax: estimateWorkerNet(finalPrice, commissionTier),
  });
  const guidanceUpdate = await dbQuery(
    client.from("jobs").update({ kael_worker_brief_guidance: guidance }).eq("id", jobId),
  );
  if (guidanceUpdate.error) {
    console.warn("mobile-api worker brief guidance persist failed", { jobId });
  }
}
