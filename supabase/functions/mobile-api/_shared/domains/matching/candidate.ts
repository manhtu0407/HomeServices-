// Customer-confirmed worker proposal gate. Keeps jobs.worker_id and address
// release locked until the owning customer confirms an exact candidate id.

import type { JobStatus } from "../../../../_shared/domain.ts";
import { requireJobAccess } from "../../platform/access.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { validateWorkflowTransition } from "../../workflow-orchestrator.ts";
import { logJobEvent } from "../../platform/audit.ts";
import {
  buildSafeWorkerCandidateView,
  candidateHasExpired,
  loadSafeWorkerCandidateView,
  mapWorkerCandidateDecisionError,
  persistWorkerBriefGuidanceAfterAccept,
  resumeMatchingAfterCandidateRejection,
} from "./candidate-support.ts";
import { asJobStatus, asString, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { insertUserNotification, notifyCustomerWorkerMatched } from "../notification/notifications.ts";
import { loadDirectWorkerPaymentAvailability } from "../payment/direct-payment-availability.ts";

export { notifyCustomerCandidateReady } from "./candidate-support.ts";

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
  const candidate = current.data
    ? await buildSafeWorkerCandidateView(client, current.data, asString(job.customer_id))
    : null;
  const directPaymentAvailable = candidate && ctx.role === "customer"
    ? await loadDirectWorkerPaymentAvailability(client, jobId, ctx.user.id)
    : null;
  return {
    job_id: jobId,
    status: job.status,
    candidate: candidate
      ? { ...candidate, direct_payment_available: directPaymentAvailable }
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
  const returnedStatus = asJobStatus(row.job_status);
  if (!alreadyApplied) {
    // Checked against the status the RPC actually landed on, not against the one this branch
    // expects. Asserting a literal against a literal answers a question nobody asked.
    const transition = validateWorkflowTransition({
      event: "customer_confirmed_worker",
      from: "worker_candidate_pending",
      to: returnedStatus,
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
    await persistWorkerBriefGuidanceAfterAccept(client, jobId);
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
      to: returnedStatus,
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
