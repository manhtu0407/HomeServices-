// Customer-confirmed worker proposal gate. Keeps jobs.worker_id and address
// release locked until the owning customer confirms an exact candidate id.

import { normalizeServiceAreaDistrict, PLATFORM_FEE_WORKER } from "../../../_shared/domain.ts";
import type { JobStatus } from "../../../_shared/domain.ts";
import { requireJobAccess } from "../access.ts";
import { buildWorkerBriefOutput } from "../kael/index.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { validateWorkflowTransition } from "../workflow-orchestrator.ts";
import { projectAddressAccess } from "./apartment-access.service.ts";
import { logJobEvent } from "./audit.ts";
import {
  acquireBroadcastRetryLease,
  createBroadcasts,
  expireStaleBroadcasts,
  hasActiveBroadcast,
  listBroadcastRecipientWorkerIds,
} from "./broadcasts.service.ts";
import { asJobStatus, asNumber, asServiceType, asString, nullableNumber, nullableString } from "./coercions.ts";
import { db, dbQuery, type DbClient } from "./db.ts";
import { insertUserNotification, notifyCustomerWorkerMatched } from "./notifications.service.ts";

export async function getWorkerCandidate(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select: "id, status, customer_id, worker_id",
  });
  const current = await dbQuery<Record<string, unknown>>(
    client.from("job_worker_candidates")
      .select("id, job_id, worker_id, status, proposed_at, expires_at, customer_decided_at")
      .eq("job_id", jobId).in("status", ["proposed", "customer_confirmed"])
      .order("proposed_at", { ascending: false }).limit(1).maybeSingle(),
  );
  if (current.error) apiFailure("DB_ERROR", "Không thể tải thợ đang chờ xác nhận", 500);
  if (
    current.data?.status === "proposed" &&
    candidateHasExpired(current.data.expires_at)
  ) {
    const expired = await dbQuery<Array<Record<string, unknown>>>(
      client.rpc("reject_worker_candidate_atomic", {
        p_job_id: jobId,
        p_candidate_id: asString(current.data.id),
        p_customer_id: ctx.user.id,
      }),
    );
    const expiredRow = expired.data?.[0];
    if (expired.error || !expiredRow?.ok) {
      apiFailure("STATUS_CHANGED", "Đề xuất thợ đã hết hạn. Vui lòng tải lại.", 409);
    }
    await logJobEvent(client, jobId, "worker_candidate_expired", ctx,
      "worker_candidate_pending", "broadcasting", { candidate_id: asString(current.data.id) });
    const resumed = await resumeMatchingAfterCandidateRejection(client, ctx, jobId);
    return {
      job_id: jobId,
      status: "broadcasting" as JobStatus,
      candidate: null,
      broadcast_sent: resumed.broadcastSent,
      message: resumed.message,
    };
  }
  return {
    job_id: jobId,
    status: job.status,
    candidate: current.data
      ? await buildSafeWorkerCandidateView(client, current.data, asString(job.customer_id))
      : null,
  };
}

export async function confirmWorkerCandidate(
  ctx: MobileApiContext,
  jobId: string,
  candidateId: string,
) {
  const client = db(ctx);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("confirm_worker_candidate_atomic", {
      p_job_id: jobId,
      p_candidate_id: candidateId,
      p_customer_id: ctx.user.id,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể xác nhận thợ", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể xác nhận thợ", 500);
  if (!row.ok) {
    const errorCode = nullableString(row.error_code);
    const shouldResumeMatching = (
      errorCode === "WORKER_NOT_ELIGIBLE" || errorCode === "EXPIRED"
    ) && nullableString(row.job_status) === "broadcasting";
    if (shouldResumeMatching) {
      const eventType = errorCode === "EXPIRED"
        ? "worker_candidate_expired"
        : "worker_candidate_became_ineligible";
      await logJobEvent(client, jobId, eventType, ctx,
        "worker_candidate_pending", "broadcasting", { candidate_id: candidateId, worker_id: nullableString(row.worker_id) });
      await resumeMatchingAfterCandidateRejection(client, ctx, jobId);
    }
    mapWorkerCandidateDecisionError(errorCode);
  }
  const workerId = nullableString(row.worker_id);
  if (!workerId) apiFailure("DB_ERROR", "Dữ liệu thợ xác nhận không hợp lệ", 500);
  const alreadyApplied = row.already_applied === true;
  if (!alreadyApplied) {
    const transition = validateWorkflowTransition({
      event: "customer_confirmed_worker",
      from: "worker_candidate_pending",
      to: "worker_matched",
    });
    if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);
    await logJobEvent(client, jobId, "customer_confirmed_worker", ctx,
      "worker_candidate_pending", "worker_matched", { candidate_id: candidateId, worker_id: workerId });
    await notifyCustomerWorkerMatched(client, jobId, workerId);
    await insertUserNotification(client, {
      userId: workerId,
      jobId,
      eventType: "customer_confirmed_worker",
      title: "Khách đã xác nhận bạn",
      body: "Công việc đã được ghép. Bạn có thể xem hướng dẫn và chuẩn bị di chuyển.",
      metadata: { candidate_id: candidateId },
    });
    await persistWorkerBriefGuidanceAfterAccept(client, jobId, {});
  }
  const candidate = await loadSafeWorkerCandidateView(client, jobId, candidateId, ctx.user.id);
  return {
    job_id: jobId,
    status: asJobStatus(row.job_status),
    candidate,
    already_applied: alreadyApplied,
  };
}

export async function rejectWorkerCandidate(
  ctx: MobileApiContext,
  jobId: string,
  candidateId: string,
) {
  const client = db(ctx);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("reject_worker_candidate_atomic", {
      p_job_id: jobId,
      p_candidate_id: candidateId,
      p_customer_id: ctx.user.id,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể từ chối thợ", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể từ chối thợ", 500);
  if (!row.ok) mapWorkerCandidateDecisionError(nullableString(row.error_code));
  const workerId = nullableString(row.worker_id);
  if (!workerId) apiFailure("DB_ERROR", "Dữ liệu thợ đề xuất không hợp lệ", 500);
  const alreadyApplied = row.already_applied === true;
  const returnedStatus = asJobStatus(row.job_status);
  if (!alreadyApplied) {
    const transition = validateWorkflowTransition({
      event: "customer_rejected_worker",
      from: "worker_candidate_pending",
      to: "broadcasting",
    });
    if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);
    await logJobEvent(client, jobId, "customer_rejected_worker", ctx,
      "worker_candidate_pending", "broadcasting", { candidate_id: candidateId, worker_id: workerId });
    await insertUserNotification(client, {
      userId: workerId,
      jobId,
      eventType: "customer_rejected_worker",
      title: "Khách đã chọn tìm thợ khác",
      body: "Bạn đã được mở lại trạng thái nhận việc.",
      metadata: { candidate_id: candidateId },
    });
  }
  const candidate = await loadSafeWorkerCandidateView(client, jobId, candidateId, ctx.user.id);
  if (returnedStatus !== "broadcasting") {
    return {
      job_id: jobId,
      status: returnedStatus,
      candidate,
      already_applied: alreadyApplied,
      broadcast_sent: false,
      message: "Quyết định này đã được xử lý.",
    };
  }
  const resumed = await resumeMatchingAfterCandidateRejection(client, ctx, jobId);
  return {
    job_id: jobId,
    status: "broadcasting" as JobStatus,
    candidate,
    already_applied: alreadyApplied,
    broadcast_sent: resumed.broadcastSent,
    message: resumed.message,
  };
}

export async function notifyCustomerCandidateReady(
  client: DbClient,
  jobId: string,
  candidateId: string,
) {
  const owner = await dbQuery<Record<string, unknown>>(
    client.from("jobs").select("customer_id").eq("id", jobId).maybeSingle(),
  );
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

async function loadSafeWorkerCandidateView(
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

async function buildSafeWorkerCandidateView(
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
  if (worker.error || profile.error || !worker.data || !profile.data) {
    apiFailure("DB_ERROR", "Không thể tải hồ sơ thợ đề xuất", 500);
  }
  const status = nullableString(candidate.status);
  if (
    status !== "proposed" && status !== "customer_confirmed" &&
    status !== "customer_declined" && status !== "expired" && status !== "withdrawn"
  ) {
    apiFailure("DB_ERROR", "Trạng thái thợ đề xuất không hợp lệ", 500);
  }
  const totalJobs = Math.max(0, Math.trunc(asNumber(worker.data.total_jobs)));
  const rating = nullableNumber(worker.data.rating);
  return {
    candidate_id: asString(candidate.id),
    worker_id: workerId,
    status: status as "proposed" | "customer_confirmed" | "customer_declined" | "expired" | "withdrawn",
    display_name: nullableString(profile.data.full_name),
    avatar_url: nullableString(profile.data.avatar_url),
    rating: totalJobs > 0 && rating !== null && rating > 0 ? rating : null,
    total_jobs: totalJobs,
    years_experience: Math.max(0, Math.trunc(asNumber(worker.data.years_experience))),
    verification_status: asString(worker.data.verification_status),
    is_favorite: !favorite.error && favorite.data !== null,
    proposed_at: asString(candidate.proposed_at),
    expires_at: nullableString(candidate.expires_at),
    customer_decided_at: nullableString(candidate.customer_decided_at),
  };
}

async function resumeMatchingAfterCandidateRejection(
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
  if (!(await acquireBroadcastRetryLease(client, jobId, ctx.user.id, now))) {
    return { broadcastSent: false, message: "Kael đang tiếp tục tìm thợ phù hợp." };
  }
  const district = normalizeServiceAreaDistrict(nullableString(job.address_district) ?? "");
  if (!district) apiFailure("VALIDATION", "Địa chỉ cần có quận TP.HCM rõ ràng", 400);
  const recipients = await listBroadcastRecipientWorkerIds(client, jobId);
  if (!recipients.success) apiFailure("DB_ERROR", "Không thể tiếp tục tìm thợ", 500);
  const broadcast = await createBroadcasts(client, jobId, asServiceType(job.service_type), district, {
    excludeWorkerIds: recipients.workerIds,
  });
  if (!broadcast.success) {
    if (broadcast.reasonCode === "DB_ERROR") apiFailure("DB_ERROR", "Không thể tiếp tục tìm thợ", 500);
    await logJobEvent(client, jobId, "no_worker_found_after_candidate_rejection", ctx,
      "broadcasting", null, { excluded_worker_count: recipients.workerIds.length });
    return { broadcastSent: false, message: broadcast.reason };
  }
  await logJobEvent(client, jobId, "broadcast_sent_after_candidate_rejection", ctx,
    "broadcasting", null, {
      batch_id: broadcast.batchId,
      worker_count: broadcast.broadcastCount,
      excluded_worker_count: recipients.workerIds.length,
    });
  return {
    broadcastSent: true,
    message: `Kael đã gửi yêu cầu đến ${broadcast.broadcastCount} thợ tiếp theo.`,
  };
}

function mapWorkerCandidateDecisionError(errorCode: string | null): never {
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

function candidateHasExpired(value: unknown) {
  const expiresAt = nullableString(value);
  if (!expiresAt) return false;
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

async function persistWorkerBriefGuidanceAfterAccept(
  client: DbClient,
  jobId: string,
  acceptedRow: Record<string, unknown>,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client.from("jobs")
      .select("id, status, service_type, kael_problem_identified, address_building, address_unit, address_floor, address_district, apartment_access_profile, apartment_access_state, kael_price_min, kael_price_max, final_price")
      .eq("id", jobId).maybeSingle(),
  );
  if (result.error || !result.data) return;
  const job = result.data;
  const finalPrice = nullableNumber(job.final_price) ?? nullableNumber(job.kael_price_max);
  const priceMin = nullableNumber(job.kael_price_min);
  const addressProjection = projectAddressAccess({
    ...job,
    address_building: nullableString(acceptedRow.address_building) ?? nullableString(job.address_building),
    address_floor: nullableString(acceptedRow.address_floor) ?? nullableString(job.address_floor),
    address_unit: nullableString(acceptedRow.address_unit) ?? nullableString(job.address_unit),
    address_district: nullableString(acceptedRow.address_district) ?? nullableString(job.address_district),
  }, "worker", { forcedStage: "building_released" });
  const guidance = buildWorkerBriefOutput({
    stage: "guidance",
    serviceType: asServiceType(job.service_type),
    problemSummary: nullableString(job.kael_problem_identified) ?? "Yêu cầu cần thợ kiểm tra",
    district: nullableString(job.address_district),
    fullAddress: addressProjection.fullAddress,
    estimatedEarningMin: priceMin === null ? null : Math.round(priceMin * (1 - PLATFORM_FEE_WORKER)),
    estimatedEarningMax: finalPrice === null ? null : Math.round(finalPrice * (1 - PLATFORM_FEE_WORKER)),
  });
  await dbQuery(
    client.from("jobs").update({ kael_worker_brief_guidance: guidance }).eq("id", jobId),
  ).catch(() => console.warn("mobile-api worker brief guidance persist failed", { jobId }));
}
