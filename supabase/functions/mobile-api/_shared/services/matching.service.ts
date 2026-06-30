// Edge service matching/broadcast domain (C4 6a, services/* split): the broadcast lifecycle —
// customer confirm-search -> createBroadcasts (with retry-lease + rollback), worker accept (brief
// guidance persist + address building-release), and worker decline. Imported by services.ts.

import { asJobStatus, asServiceType, asString, nullableNumber, nullableString } from "./coercions.ts";
import { db, dbQuery, type DbClient } from "./db.ts";
import { mapAcceptError, relatedJob } from "./_shared.ts";
import { logJobEvent, queueKaelLearningEvent } from "./audit.ts";
import { acquireBroadcastRetryLease, createBroadcasts, expireStaleBroadcasts, hasActiveBroadcast } from "./broadcasts.service.ts";
import { insertUserNotification, notifyCustomerWorkerMatched } from "./notifications.service.ts";
import { projectAddressAccess } from "./apartment-access.service.ts";
import { requireJobAccess } from "../access.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { validateKaelAutonomyTransition, validateWorkflowTransition } from "../workflow-orchestrator.ts";
import { buildWorkerBriefOutput, type KaelAutonomyDecision } from "../kael/index.ts";
import { normalizeServiceAreaDistrict, PLATFORM_FEE_WORKER } from "../../../_shared/domain.ts";
import type { JobStatus, ServiceType } from "../../../_shared/domain.ts";

type ConfirmSearchOptions = {
  autonomyDecision?: KaelAutonomyDecision;
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
    if (!(await acquireBroadcastRetryLease(client, jobId, ctx.user.id, now))) {
      apiFailure(
        "BROADCAST_ACTIVE",
        "Yêu cầu đang được gửi đến thợ. Vui lòng chờ phản hồi hiện tại.",
        409,
      );
    }
    await logJobEvent(
      client,
      jobId,
      "customer_retried_search",
      ctx,
      "broadcasting",
      "broadcasting",
    );
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
    // Notify customer when no eligible worker accepted.
    await insertUserNotification(client, {
      userId: ctx.user.id,
      jobId,
      eventType: "no_worker_found",
      title: "Chưa có thợ phù hợp",
      body: "Kael sẽ tiếp tục theo dõi và báo lại khi có thợ.",
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

  await logJobEvent(
    client,
    jobId,
    "worker_accepted",
    ctx,
    "broadcasting",
    "worker_matched",
  );
  await notifyCustomerWorkerMatched(client, jobId, ctx.user.id);
  await persistWorkerBriefGuidanceAfterAccept(client, jobId, row);
  const addressProjection = projectAddressAccess(row, ctx.role, {
    forcedStage: "building_released",
  });
  return {
    job_id: jobId,
    status: row.job_status as JobStatus,
    full_address: addressProjection.fullAddress,
    address_access: addressProjection.addressAccess,
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

async function persistWorkerBriefGuidanceAfterAccept(
  client: DbClient,
  jobId: string,
  acceptedRow: Record<string, unknown>,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select(
        "id, status, service_type, kael_problem_identified, address_building, address_unit, address_floor, address_district, apartment_access_profile, apartment_access_state, kael_price_min, kael_price_max, final_price",
      )
      .eq("id", jobId)
      .maybeSingle(),
  );
  if (result.error || !result.data) return;

  const job = result.data;
  const finalPrice = nullableNumber(job.final_price) ??
    nullableNumber(job.kael_price_max);
  const priceMin = nullableNumber(job.kael_price_min);
  const addressProjection = projectAddressAccess(
    {
      ...job,
      address_building: nullableString(acceptedRow.address_building) ??
        nullableString(job.address_building),
      address_floor: nullableString(acceptedRow.address_floor) ??
        nullableString(job.address_floor),
      address_unit: nullableString(acceptedRow.address_unit) ??
        nullableString(job.address_unit),
      address_district: nullableString(acceptedRow.address_district) ??
        nullableString(job.address_district),
    },
    "worker",
    { forcedStage: "building_released" },
  );
  const guidance = buildWorkerBriefOutput({
    stage: "guidance",
    serviceType: asServiceType(job.service_type),
    problemSummary:
      nullableString(job.kael_problem_identified) ??
        "\u0059\u00eau c\u1ea7u c\u1ea7n th\u1ee3 ki\u1ec3m tra",
    district: nullableString(job.address_district),
    fullAddress: addressProjection.fullAddress,
    estimatedEarningMin: priceMin === null
      ? null
      : Math.round(priceMin * (1 - PLATFORM_FEE_WORKER)),
    estimatedEarningMax: finalPrice === null
      ? null
      : Math.round(finalPrice * (1 - PLATFORM_FEE_WORKER)),
  });

  await dbQuery(
    client
      .from("jobs")
      .update({ kael_worker_brief_guidance: guidance })
      .eq("id", jobId),
  ).catch(() => {
    console.warn("mobile-api worker brief guidance persist failed", { jobId });
  });
}
