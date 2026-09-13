import { matchingRetryReceiptSchema } from "../../../../_shared/contracts/stage1-reliability.ts";
import { asServiceType, asString, nullableRecord, nullableString } from "../../platform/coercions.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { insertUserNotification } from "../notification/notifications.ts";
import {
  createBroadcasts,
  expireStaleBroadcasts,
  hasActiveBroadcast,
  listBroadcastRecipientWorkerIds,
  runWithBroadcastRetryLease,
} from "./broadcasts.ts";
import { queryEligibleWorkers } from "./broadcast-workers.ts";
import {
  logMatchingEvent,
  matchingFallbackEvent,
  requireMatchingDistrict,
  type MatchingFallbackReason,
} from "./matching-preference-shared.ts";

export async function reconcileSavedWorkerFallback(
  client: DbClient,
  input: {
    allowWithoutSavedBroadcast?: boolean;
    expectedWorkerId?: string;
    jobId: string;
    leaseAlreadyHeld?: boolean;
    reason: MatchingFallbackReason;
  },
) {
  const job = await dbQuery<Record<string, unknown>>(
    client.from("jobs")
      .select("id, quote_mode, customer_id, status, service_type, address_district")
      .eq("id", input.jobId)
      .maybeSingle(),
  );
  if (job.error) return { started: false as const, reasonCode: "DB_ERROR" as const };
  if (!job.data) return { started: false as const, reasonCode: "NOT_APPLICABLE" as const };
  if (job.data.quote_mode != null) {
    if (!input.expectedWorkerId) return { started: false as const, reasonCode: "NOT_APPLICABLE" as const };
    const result = await dbQuery(client.rpc("request_job_saved_worker_fallback_atomic", {
      p_job_id: input.jobId, p_expected_worker_id: input.expectedWorkerId,
    }));
    const row = nullableRecord(result.data);
    if (result.error || !row || typeof row.claimed !== "boolean") {
      return { started: false as const, reasonCode: "DB_ERROR" as const };
    }
    if (!row.claimed) return { started: false as const, reasonCode: nullableString(row.error_code) ?? "NOT_APPLICABLE" };
    const { claimed: _claimed, reason, ...receipt } = row;
    const parsed = matchingRetryReceiptSchema.safeParse(receipt);
    if (!parsed.success || parsed.data.job_id !== input.jobId ||
      !["saved_worker_declined", "saved_worker_expired", "saved_worker_unavailable"].includes(asString(reason))) {
      return { started: false as const, reasonCode: "DB_ERROR" as const };
    }
    return { started: true as const, broadcast_sent: parsed.data.broadcast_sent,
      reasonCode: parsed.data.state === "queued" ? "QUEUED" : "RECONCILED" };
  }
  if (input.reason === "saved_worker_expired") {
    await expireStaleBroadcasts(client, input.jobId, new Date().toISOString());
    if (await hasActiveBroadcast(client, input.jobId, new Date().toISOString())) {
      return { started: false as const, reasonCode: "ACTIVE_BROADCAST" as const };
    }
  }
  if (!input.allowWithoutSavedBroadcast && !await hasSavedWorkerBroadcast(
    client,
    input.jobId,
    input.expectedWorkerId,
  )) {
    return { started: false as const, reasonCode: "NOT_APPLICABLE" as const };
  }
  const claim = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("claim_saved_worker_fallback_atomic", {
      p_job_id: input.jobId,
      p_reason: input.reason,
      p_expected_worker_id: input.expectedWorkerId ?? null,
    }),
  );
  if (claim.error) return { started: false as const, reasonCode: "DB_ERROR" as const };
  const row = claim.data?.[0];
  if (!row || typeof row.claimed !== "boolean") {
    return { started: false as const, reasonCode: "DB_ERROR" as const };
  }
  if (!row.claimed) {
    return { started: false as const, reasonCode: nullableString(row.error_code) ?? "NOT_APPLICABLE" };
  }
  if (job.data.status !== "broadcasting") {
    return { started: false as const, reasonCode: "INVALID_STATUS" as const };
  }
  const matchingJob = job.data;
  const customerId = nullableString(matchingJob.customer_id);
  if (!customerId) return { started: false as const, reasonCode: "INVALID_STATUS" as const };
  const createFallbackBatch = async () => {
    const recipients = await listBroadcastRecipientWorkerIds(client, input.jobId);
    if (!recipients.success) return { success: false as const, reasonCode: "DB_ERROR" as const };
    const district = requireMatchingDistrict(matchingJob.address_district);
    await logMatchingEvent(client, input.jobId, matchingFallbackEvent(input.reason));
    const broadcast = await createBroadcasts(
      client,
      input.jobId,
      asServiceType(matchingJob.service_type),
      district,
      {
        excludeWorkerIds: Array.from(new Set([
          ...recipients.workerIds,
          ...(input.expectedWorkerId ? [input.expectedWorkerId] : []),
        ])),
      },
    );
    if (broadcast.success || broadcast.reasonCode !== "DB_ERROR") {
      await logMatchingEvent(client, input.jobId, "matching_search_expanded");
    }
    return broadcast;
  };
  const lease = input.leaseAlreadyHeld
    ? { acquired: true as const, value: await createFallbackBatch() }
    : await runWithBroadcastRetryLease(client, input.jobId, customerId, createFallbackBatch);
  if (!lease.acquired) {
    return { started: false as const, reasonCode: lease.reasonCode };
  }
  const broadcast = lease.value;
  if (!broadcast.success) {
    if (broadcast.reasonCode === "DB_ERROR") {
      await logMatchingEvent(client, input.jobId, "matching_recovery_required");
      return { started: false as const, reasonCode: "DB_ERROR" as const };
    }
    await logMatchingEvent(client, input.jobId, "no_worker_found_after_saved_worker");
    if (customerId) {
      await insertUserNotification(client, {
        userId: customerId,
        jobId: input.jobId,
        eventType: "no_worker_found",
        title: "Chưa có thợ phù hợp",
        body: "Kael đã mở rộng tìm kiếm nhưng chưa có thợ phù hợp.",
        metadata: { reason_code: input.reason },
      });
    }
    return { started: true as const, broadcast_sent: false as const, reasonCode: "NO_WORKER" as const };
  }
  await logMatchingEvent(client, input.jobId, "matching_general_batch_sent", {
    batch_id: broadcast.batchId,
    worker_count: broadcast.broadcastCount,
  });
  return { started: true as const, broadcast_sent: true as const, reasonCode: "EXPANDED" as const };
}

export async function reconcileSavedWorkerFallbackForJob(
  client: DbClient,
  jobId: string,
  reason: MatchingFallbackReason,
) {
  const preference = await dbQuery<Record<string, unknown>>(
    client.from("job_matching_preferences")
      .select("preferred_worker_id")
      .eq("job_id", jobId)
      .maybeSingle(),
  );
  const workerId = preference.data ? nullableString(preference.data.preferred_worker_id) : null;
  if (preference.error || !workerId) {
    return { started: false as const, reasonCode: "NOT_APPLICABLE" as const };
  }
  return reconcileSavedWorkerFallback(client, { expectedWorkerId: workerId, jobId, reason });
}

export async function reconcileExpiredSavedWorkerMatches(client: DbClient, limit = 100) {
  const preferences = await dbQuery<Array<Record<string, unknown>>>(
    client.from("job_matching_preferences")
      .select("job_id, preferred_worker_id, jobs!inner(status)")
      .eq("strategy", "saved_worker_first")
      .eq("auto_general", true)
      .is("fallback_at", null)
      .eq("jobs.status", "broadcasting")
      .order("selected_at", { ascending: true })
      .limit(limit),
  );
  if (preferences.error) return { reconciled: 0, failed: 1 };
  let reconciled = 0;
  let failed = 0;
  for (const preference of preferences.data ?? []) {
    const jobId = nullableString(preference.job_id);
    const workerId = nullableString(preference.preferred_worker_id);
    if (!jobId || !workerId) continue;
    try {
      const fallback = await reconcileSavedWorkerFallback(client, {
        expectedWorkerId: workerId,
        jobId,
        reason: "saved_worker_expired",
      });
      if (fallback.started) reconciled += 1;
      if (fallback.reasonCode === "DB_ERROR") failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { reconciled, failed };
}

export async function startSavedWorkerBroadcast(
  client: DbClient,
  job: Record<string, unknown>,
  workerId: string,
  autoGeneral: boolean,
) {
  const district = requireMatchingDistrict(job.address_district);
  const eligibility = await queryEligibleWorkers(
    client,
    asServiceType(job.service_type),
    district,
    1,
    { candidateWorkerIds: [workerId], jobId: asString(job.id) },
  );
  if (!eligibility.success) {
    await logMatchingEvent(client, asString(job.id), "matching_recovery_required");
    return {
      broadcast_sent: false,
      message: "Kael chưa xác nhận được lượt gửi đến thợ. Bạn có thể tìm lại an toàn.",
    };
  }
  if (eligibility.workers.length === 0) {
    if (!autoGeneral) {
      apiFailure("WORKER_NOT_ELIGIBLE", "Thợ đã lưu hiện chưa sẵn sàng cho yêu cầu này.", 409);
    }
    const fallback = await reconcileSavedWorkerFallback(client, {
      allowWithoutSavedBroadcast: true,
      expectedWorkerId: workerId,
      jobId: asString(job.id),
      leaseAlreadyHeld: true,
      reason: "saved_worker_unavailable",
    });
    return fallback.broadcast_sent
      ? { broadcast_sent: true, message: "Thợ đã lưu chưa sẵn sàng; Kael đã mở rộng sang nhóm thợ phù hợp." }
      : { broadcast_sent: false, message: "Thợ đã lưu chưa sẵn sàng và Kael chưa tìm thấy nhóm thợ phù hợp." };
  }
  const broadcast = await createBroadcasts(
    client,
    asString(job.id),
    asServiceType(job.service_type),
    district,
    { candidateWorkerIds: [workerId] },
  );
  if (!broadcast.success) {
    if (broadcast.reasonCode === "DB_ERROR") {
      await logMatchingEvent(client, asString(job.id), "matching_recovery_required");
      return {
        broadcast_sent: false,
        message: "Kael chưa xác nhận được lượt gửi đến thợ. Bạn có thể tìm lại an toàn.",
      };
    }
    if (!autoGeneral) {
      apiFailure("WORKER_NOT_ELIGIBLE", "Thợ đã lưu hiện chưa sẵn sàng cho yêu cầu này.", 409);
    }
    const fallback = await reconcileSavedWorkerFallback(client, {
      allowWithoutSavedBroadcast: true,
      expectedWorkerId: workerId,
      jobId: asString(job.id),
      leaseAlreadyHeld: true,
      reason: "saved_worker_unavailable",
    });
    return fallback.broadcast_sent
      ? { broadcast_sent: true, message: "Thợ đã lưu chưa sẵn sàng; Kael đã mở rộng sang nhóm thợ phù hợp." }
      : { broadcast_sent: false, message: "Kael chưa tìm thấy thợ phù hợp để gửi yêu cầu." };
  }
  await logMatchingEvent(client, asString(job.id), "matching_saved_worker_selected", {
    batch_id: broadcast.batchId,
  });
  return {
    broadcast_sent: true,
    message: "Kael đã gửi yêu cầu đến thợ đã lưu và đang chờ phản hồi.",
  };
}

export async function startGeneralBroadcast(
  client: DbClient,
  job: Record<string, unknown>,
  eventType: "matching_general_selected",
) {
  const district = requireMatchingDistrict(job.address_district);
  const broadcast = await createBroadcasts(
    client,
    asString(job.id),
    asServiceType(job.service_type),
    district,
  );
  if (!broadcast.success) {
    if (broadcast.reasonCode === "DB_ERROR") apiFailure("DB_ERROR", "Không thể gửi yêu cầu đến thợ", 500);
    await logMatchingEvent(client, asString(job.id), "no_worker_found");
    return { broadcast_sent: false, message: "Kael chưa tìm thấy thợ phù hợp để gửi yêu cầu." };
  }
  await logMatchingEvent(client, asString(job.id), eventType, {
    batch_id: broadcast.batchId,
    worker_count: broadcast.broadcastCount,
  });
  return {
    broadcast_sent: true,
    message: `Kael đã gửi yêu cầu đến ${broadcast.broadcastCount} thợ phù hợp.`,
  };
}

async function hasSavedWorkerBroadcast(
  client: DbClient,
  jobId: string,
  workerId: string | undefined,
) {
  if (!workerId) return false;
  const result = await dbQuery<Record<string, unknown>>(
    client.from("job_broadcasts")
      .select("id")
      .eq("job_id", jobId)
      .eq("worker_id", workerId)
      .limit(1)
      .maybeSingle(),
  );
  return !result.error && Boolean(result.data);
}
