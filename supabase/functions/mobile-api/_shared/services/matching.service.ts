// Edge service matching/broadcast domain (C4 6a, services/* split): the broadcast lifecycle —
// customer confirm-search -> createBroadcasts (with retry-lease + rollback), worker proposal,
// customer candidate decision, and worker decline. Address release starts only after confirmation.

import { asJobStatus, asServiceType, asString, nullableNumber, nullableString } from "./coercions.ts";
import { db, dbQuery, type DbClient } from "./db.ts";
import { mapAcceptError, relatedJob } from "./_shared.ts";
import { logJobEvent, queueKaelLearningEvent } from "./audit.ts";
import {
  createBroadcasts,
  expireStaleBroadcasts,
  failBroadcastRetryClaim,
  hasActiveBroadcast,
  runWithBroadcastRetryLease,
} from "./broadcasts.service.ts";
import { insertUserNotification } from "./notifications.service.ts";
import { notifyCustomerCandidateReady } from "./worker-candidate.service.ts";
import { requireJobAccess } from "../access.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { validateKaelAutonomyTransition, validateWorkflowTransition } from "../workflow-orchestrator.ts";
import { buildWorkerBriefOutput, type KaelAutonomyDecision } from "../kael/index.ts";
import { normalizeServiceAreaDistrict, PLATFORM_FEE_WORKER } from "../../../_shared/domain.ts";
import type { JobStatus, ServiceType } from "../../../_shared/domain.ts";

type ConfirmSearchOptions = {
  autonomyDecision?: KaelAutonomyDecision;
  kaelSessionId?: string;
};

export async function confirmSearch(
  ctx: MobileApiContext,
  jobId: string,
  options: ConfirmSearchOptions = {},
) {
  const client = db(ctx);
  const now = new Date().toISOString();
  let rollbackStatus: JobStatus | null = null;
  const autonomyDecision = options.autonomyDecision;
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select:
      "id, status, customer_id, worker_id, service_type, address_district, kael_problem_identified, kael_price_min, kael_price_max, final_price",
  });
  const retryingExistingSearch = job.status === "broadcasting";

  // Lock jobs.final_price = kael_price_max as initial
  // Kael baseline (only if not already locked, e.g. retry). Worker không có
  // authority để override; chỉ A11 Kael scope decision re-locks từ Kael compute mới.
  const kaelPriceMax = nullableNumber(job.kael_price_max);
  const lockedFinalPrice = nullableNumber(job.final_price) ?? kaelPriceMax;

  const district = normalizeServiceAreaDistrict(
    nullableString(job.address_district) ?? "",
  );
  if (!district) {
    apiFailure(
      "VALIDATION",
      "Địa chỉ cần có quận TP.HCM rõ ràng",
      400,
    );
  }

  if (job.status === "broadcasting") {
    await expireStaleBroadcasts(client, jobId, now);
    if (await hasActiveBroadcast(client, jobId, now)) {
      apiFailure(
        "BROADCAST_ACTIVE",
        "Yêu cầu đang được gửi đến thợ. Vui lòng chờ phản hồi hiện tại.",
        409,
      );
    }
  } else {
    if (lockedFinalPrice === null || lockedFinalPrice <= 0) {
      apiFailure(
        "KAEL_PRICE_MISSING",
        "Kael chưa chốt được giá tạm tính nên chưa thể tìm thợ",
        409,
      );
    }
    const transition = autonomyDecision
      ? validateKaelAutonomyTransition({
        decision: autonomyDecision,
        from: job.status as JobStatus,
        to: "broadcasting",
      })
      : validateWorkflowTransition({
        event: "customer_confirmed_ticket",
        from: job.status as JobStatus,
        to: "broadcasting",
      });
    if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);
    rollbackStatus = job.status as JobStatus;
    const workerBriefCore = buildWorkerBriefOutput({
      stage: "core",
      serviceType: asServiceType(job.service_type),
      problemSummary:
        nullableString(job.kael_problem_identified) ?? "Yêu cầu cần thợ kiểm tra",
      district: nullableString(job.address_district),
      estimatedEarningMin: nullableNumber(job.kael_price_min) === null
        ? null
        : Math.round(nullableNumber(job.kael_price_min)! * (1 - PLATFORM_FEE_WORKER)),
      estimatedEarningMax: lockedFinalPrice === null
        ? null
        : Math.round(lockedFinalPrice * (1 - PLATFORM_FEE_WORKER)),
    });

    const updated = await dbQuery<{ id: string }>(
      client
        .from("jobs")
        .update({
          status: "broadcasting",
          broadcast_at: now,
          confirmed_search_at: now,
          final_price: lockedFinalPrice,
          kael_worker_brief_core: workerBriefCore,
        })
        .eq("id", jobId)
        .eq("customer_id", ctx.user.id)
        .eq("status", job.status)
        .select("id")
        .maybeSingle(),
    );
    if (updated.error) apiFailure("DB_ERROR", "Không thể bắt đầu tìm thợ", 500);
    if (!updated.data) {
      apiFailure(
        "STATUS_CHANGED",
        "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
        409,
      );
    }

    await logJobEvent(
      client,
      jobId,
      autonomyDecision ? "kael_started_matching" : "customer_confirmed_search",
      ctx,
      job.status as JobStatus,
      "broadcasting",
      autonomyDecision ? { autonomy_decision: autonomyDecision } : {},
    );
  }

  const sendBroadcast = async () => {
    if (retryingExistingSearch) {
      await logJobEvent(
        client,
        jobId,
        "customer_retried_search",
        ctx,
        "broadcasting",
        "broadcasting",
      );
    }
    const broadcast = await createBroadcasts(
      client,
      jobId,
      job.service_type as ServiceType,
      district,
    );
    if (!broadcast.success) {
      if (broadcast.reasonCode === "DB_ERROR") {
        if (rollbackStatus) {
          const rolledBack = await rollbackFailedBroadcastStart(
            client,
            jobId,
            ctx.user.id,
            rollbackStatus,
          );
          if (!rolledBack) {
            apiFailure(
              "DB_ERROR",
              "Không thể khôi phục yêu cầu sau lỗi gửi thợ",
              500,
            );
          }
          if (
            options.kaelSessionId &&
            !(await restoreKaelOfferAfterBroadcastFailure(
              client,
              options.kaelSessionId,
              jobId,
              ctx.user.id,
            ))
          ) {
            apiFailure(
              "DB_ERROR",
              "Kh\u00f4ng th\u1ec3 kh\u00f4i ph\u1ee5c phi\u00ean Kael sau l\u1ed7i g\u1eedi th\u1ee3",
              500,
            );
          }
          await logJobEvent(
            client,
            jobId,
            "broadcast_start_failed",
            ctx,
            "broadcasting",
            rollbackStatus,
            {
              reason: broadcast.reason,
              ...(autonomyDecision ? { autonomy_decision: autonomyDecision } : {}),
            },
          );
        }
        apiFailure("DB_ERROR", "Không thể gửi yêu cầu đến thợ", 500);
      }
      await logJobEvent(
        client,
        jobId,
        "no_worker_found",
        ctx,
        "broadcasting",
        null,
        {
          reason: broadcast.reason,
          district,
          service_type: job.service_type,
          ...(autonomyDecision ? { autonomy_decision: autonomyDecision } : {}),
        },
      );
      await insertUserNotification(client, {
        userId: ctx.user.id,
        jobId,
        eventType: "no_worker_found",
        title: "Chưa có thợ phù hợp",
        body: "Hiện chưa có thợ phù hợp. Bạn có thể thử tìm lại sau.",
        metadata: { district, service_type: asString(job.service_type) },
      });
      return {
        job_id: jobId,
        status: "broadcasting" as JobStatus,
        broadcast_sent: false,
        worker: null,
        message: broadcast.reason,
      };
    }

    await logJobEvent(
      client,
      jobId,
      "broadcast_sent",
      ctx,
      "broadcasting",
      null,
      {
        batch_id: broadcast.batchId,
        worker_count: broadcast.broadcastCount,
        ...(autonomyDecision ? { autonomy_decision: autonomyDecision } : {}),
      },
    );

    return {
      job_id: jobId,
      status: "broadcasting" as JobStatus,
      broadcast_sent: true,
      worker: null,
      message:
        `Đã gửi yêu cầu đến ${broadcast.broadcastCount} thợ. Đang chờ phản hồi.`,
    };
  };

  if (!retryingExistingSearch) return sendBroadcast();

  const claimResult = await runWithBroadcastRetryLease(
    client,
    jobId,
    ctx.user.id,
    sendBroadcast,
  );
  if (!claimResult.acquired) {
    failBroadcastRetryClaim(claimResult.reasonCode);
  }
  return claimResult.value;
}

export async function acceptBroadcast(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("accept_broadcast_atomic", {
      p_job_id: jobId,
      p_worker_id: ctx.user.id,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Lỗi khi nhận yêu cầu", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Lỗi khi nhận yêu cầu", 500);
  if (!row.ok) {
    if (row.error_code === "EXPIRED") {
      await logJobEvent(client, jobId, "broadcast_expired", ctx, null, null, {
        reason: "EXPIRED via RPC",
      });
    }
    mapAcceptError(nullableString(row.error_code));
  }
  const transition = validateWorkflowTransition({
    event: "worker_accepted",
    from: "broadcasting",
    to: asJobStatus(row.job_status),
  });
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);

  const candidateId = nullableString(row.candidate_id);
  if (!candidateId) apiFailure("DB_ERROR", "Lỗi khi ghi nhận thợ đề xuất", 500);
  const alreadyApplied = row.already_applied === true;
  if (!alreadyApplied) {
    await logJobEvent(
      client,
      jobId,
      "worker_accepted",
      ctx,
      "broadcasting",
      "worker_candidate_pending",
      { candidate_id: candidateId },
    );
    await notifyCustomerCandidateReady(client, jobId, candidateId);
  }
  return {
    job_id: jobId,
    status: row.job_status as JobStatus,
    candidate_id: candidateId,
    awaiting_customer_confirmation: true as const,
    already_applied: alreadyApplied,
  };
}

export async function declineBroadcast(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("job_broadcasts")
      .select("id, status, expires_at, jobs(status)")
      .eq("job_id", jobId)
      .eq("worker_id", ctx.user.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Yêu cầu này không dành cho bạn", 404);
  }
  if (result.data.status !== "sent") {
    apiFailure("BROADCAST_NOT_ACTIVE", "Yêu cầu này đã được xử lý", 409);
  }
  const parentJob = relatedJob(result.data.jobs);
  if (!parentJob || parentJob.status !== "broadcasting") {
    apiFailure("BROADCAST_NOT_ACTIVE", "Yêu cầu này đã được xử lý", 409);
  }

  const now = new Date().toISOString();
  const expiresAt = nullableString(result.data.expires_at);
  if (expiresAt && expiresAt <= now) {
    const expired = await dbQuery<{ id: string }>(
      client
        .from("job_broadcasts")
        .update({ status: "expired", responded_at: now })
        .eq("id", result.data.id)
        .eq("status", "sent")
        .select("id")
        .maybeSingle(),
    );
    if (expired.error) {
      apiFailure("DB_ERROR", "Không thể cập nhật broadcast hết hạn", 500);
    }
    if (!expired.data) {
      apiFailure("BROADCAST_NOT_ACTIVE", "Yêu cầu này đã được xử lý", 409);
    }
    await logJobEvent(client, jobId, "broadcast_expired", ctx, null, null);
    apiFailure("EXPIRED", "Yêu cầu đã hết hạn", 410);
  }

  const update = await dbQuery<{ id: string }>(
    client
      .from("job_broadcasts")
      .update({ status: "declined", responded_at: now })
      .eq("id", result.data.id)
      .eq("status", "sent")
      .select("id")
      .maybeSingle(),
  );
  if (update.error) apiFailure("DB_ERROR", "Lỗi khi từ chối", 500);
  if (!update.data) {
    apiFailure("BROADCAST_NOT_ACTIVE", "Yêu cầu này đã được xử lý", 409);
  }
  await logJobEvent(client, jobId, "worker_declined", ctx, null, null);
  await queueKaelLearningEvent(client, 'post-decline', {
    actor_id: ctx.user.id,
    actor_role: ctx.role,
    job_id: jobId,
    worker_id: ctx.user.id,
    decline_reason: "broadcast_declined",
    feedback_present: false,
  });
  return { job_id: jobId, declined: true as const };
}

export async function rollbackFailedBroadcastStart(
  client: DbClient,
  jobId: string,
  customerId: string,
  previousStatus: JobStatus,
): Promise<boolean> {
  const result = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({
        status: previousStatus,
        broadcast_at: null,
        confirmed_search_at: null,
      })
      .eq("id", jobId)
      .eq("customer_id", customerId)
      .eq("status", "broadcasting")
      .select("id")
      .maybeSingle(),
  );
  return !result.error && Boolean(result.data);
}

async function restoreKaelOfferAfterBroadcastFailure(
  client: DbClient,
  sessionId: string,
  jobId: string,
  customerId: string,
) {
  const result = await dbQuery<{ id: string }>(
    client
      .from("kael_chat_sessions")
      .update({ status: "estimate_ready", case_phase: "offer_review" })
      .eq("id", sessionId)
      .eq("job_id", jobId)
      .eq("customer_id", customerId)
      .eq("case_phase", "matching")
      .select("id")
      .maybeSingle(),
  );
  return !result.error && Boolean(result.data);
}
