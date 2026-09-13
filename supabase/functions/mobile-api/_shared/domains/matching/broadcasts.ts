// Job-broadcast lifecycle and public matching entry point.

import {
  asNumber,
  asString,
  nullableRecord,
  nullableString,
} from "../../platform/coercions.ts";
import { type DbClient, dbQuery, type DbResult } from "../../platform/db.ts";
import { secondsRemaining } from "../../platform/domain-utils.ts";
import { notifyBroadcastWorkers } from "../notification/notifications.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { ServiceType } from "../../../../_shared/domain.ts";
import { queryEligibleWorkers } from "./broadcast-workers.ts";
import { BROADCAST_DELIVERY_TTL_MS } from "./delivery.ts";

const PREVIOUS_RELEASE_BROADCAST_TTL_MS = 60_000;

export {
  acquireBroadcastRetryLease,
  failBroadcastRetryClaim,
  isBroadcastRetryContention,
  releaseBroadcastRetryLease,
  runWithBroadcastRetryLease,
} from "./broadcast-support.ts";

type ActivateBroadcastBatchInput = {
  jobId: string;
  workerIds: string[];
  batchId: string;
  sentAt: string;
  expiresAt: string;
  durable?: boolean;
};

export async function activateBroadcastBatch(
  client: DbClient,
  input: ActivateBroadcastBatchInput,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc(input.durable !== false
      ? "activate_job_broadcast_batch_durable_atomic_v2"
      : "activate_job_broadcast_batch_atomic", {
      p_job_id: input.jobId,
      p_worker_ids: input.workerIds,
      p_batch_id: input.batchId,
      p_sent_at: input.sentAt,
      p_expires_at: input.expiresAt,
    }),
  );
  if (result.error) {
    return {
      success: false as const,
      reasonCode: "DB_ERROR" as const,
      reason: "Lỗi khi gửi yêu cầu đến thợ",
    };
  }
  const targets = (result.data ?? []).map((row) => ({
    broadcastId: asString(row.id),
    workerId: asString(row.worker_id),
    deliveryId: asString(row.delivery_id),
    operationId: asString(row.operation_id),
  })).filter((row) => row.broadcastId && row.workerId);
  if (targets.length === 0) {
    return {
      success: false as const,
      reasonCode: "NO_WORKER" as const,
      reason: "Không còn thợ phù hợp để gửi lại yêu cầu",
    };
  }
  return { success: true as const, targets };
}

export async function createBroadcasts(
  client: DbClient,
  jobId: string,
  serviceType: ServiceType,
  district: string,
  options: { candidateWorkerIds?: string[]; excludeWorkerIds?: string[] } = {},
) {
  const modeResult = await dbQuery<Record<string, unknown>>(
    client.from("jobs").select("quote_mode").eq("id", jobId).maybeSingle(),
  );
  if (modeResult.error || !modeResult.data) {
    return {
      success: false as const,
      reasonCode: "DB_ERROR" as const,
      reason: "Không thể kiểm tra chế độ gửi yêu cầu",
    };
  }
  const durable = nullableString(modeResult.data.quote_mode) !== null;
  const workerIdsResult = durable
    ? await readReservedWorkerIds(client, jobId, options)
    : await readLegacyEligibleWorkerIds(client, jobId, serviceType, district, options);
  if (!workerIdsResult.success) return workerIdsResult;
  if (workerIdsResult.workerIds.length === 0) {
    return {
      success: false as const,
      reasonCode: "NO_WORKER" as const,
      reason: "Không tìm thấy thợ phù hợp đang online trong khu vực",
    };
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (durable
    ? BROADCAST_DELIVERY_TTL_MS
    : PREVIOUS_RELEASE_BROADCAST_TTL_MS));
  const batchId = crypto.randomUUID();
  const activation = await activateBroadcastBatch(client, {
    jobId,
    workerIds: workerIdsResult.workerIds,
    batchId,
    sentAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    durable,
  });
  if (!activation.success) return activation;
  await notifyBroadcastWorkers(
    client,
    jobId,
    serviceType,
    district,
    expiresAt.toISOString(),
    activation.targets,
  );
  return {
    success: true as const,
    batchId,
    broadcastCount: activation.targets.length,
    expiresAt: expiresAt.toISOString(),
  };
}

async function readReservedWorkerIds(
  client: DbClient,
  jobId: string,
  options: { candidateWorkerIds?: string[]; excludeWorkerIds?: string[] },
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("get_matching_capacity_reservation_worker_ids", {
      p_job_id: jobId,
    }),
  );
  if (result.error) {
    return {
      success: false as const,
      reasonCode: "DB_ERROR" as const,
      reason: "Không thể kiểm tra phần năng lực thợ đã được giữ chỗ",
    };
  }
  const candidateIds = options.candidateWorkerIds
    ? new Set(options.candidateWorkerIds)
    : null;
  const excludedIds = new Set(options.excludeWorkerIds ?? []);
  const workerIds = [...new Set((result.data ?? [])
    .map((row) => asString(row.worker_id))
    .filter((workerId): workerId is string => Boolean(workerId))
    .filter((workerId) => (!candidateIds || candidateIds.has(workerId)) && !excludedIds.has(workerId)))]
    .slice(0, 5);
  return { success: true as const, workerIds };
}

async function readLegacyEligibleWorkerIds(
  client: DbClient,
  jobId: string,
  serviceType: ServiceType,
  district: string,
  options: { candidateWorkerIds?: string[]; excludeWorkerIds?: string[] },
) {
  const eligibleResult = await queryEligibleWorkers(
    client,
    serviceType,
    district,
    5,
    { ...options, jobId },
  );
  if (!eligibleResult.success) {
    return {
      success: false as const,
      reasonCode: "DB_ERROR" as const,
      reason: eligibleResult.reason,
    };
  }
  return {
    success: true as const,
    workerIds: eligibleResult.workers.map((worker) => worker.id),
  };
}

export async function expireStaleBroadcasts(
  client: DbClient,
  jobId: string,
  nowIso: string,
) {
  const result = await dbQuery(
    client
      .from("job_broadcasts")
      .update({ status: "expired", responded_at: nowIso })
      .eq("job_id", jobId)
      .eq("status", "sent")
      .lte("expires_at", nowIso),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật broadcast đã hết hạn", 500);
  }
}

export async function hasActiveBroadcast(
  client: DbClient,
  jobId: string,
  nowIso: string,
): Promise<boolean> {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_broadcasts")
      .select("id, expires_at")
      .eq("job_id", jobId)
      .eq("status", "sent")
      .limit(20),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể kiểm tra broadcast hiện tại", 500);
  }
  return (result.data ?? []).some((row) => {
    const expiresAt = nullableString(row.expires_at);
    return !expiresAt || expiresAt > nowIso;
  });
}

export async function getJobBroadcastState(client: DbClient, jobId: string) {
  const now = new Date();
  const nowIso = now.toISOString();
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_broadcasts")
      .select("id, expires_at")
      .eq("job_id", jobId)
      .eq("status", "sent")
      .limit(20),
  );
  if (result.error) {
    apiFailure(
      "DB_ERROR",
      "Không thể kiểm tra trạng thái broadcast",
      500,
    );
  }
  const active = (result.data ?? []).filter((row) => {
    const expiresAt = nullableString(row.expires_at);
    return !expiresAt || expiresAt > nowIso;
  });
  const seconds = active
    .map((row) => secondsRemaining(nullableString(row.expires_at), now))
    .filter((value): value is number => value !== null);
  return {
    active_count: active.length,
    seconds_remaining: seconds.length > 0 ? Math.max(...seconds) : 0,
  };
}

export async function listBroadcastRecipientWorkerIds(
  client: DbClient,
  jobId: string,
) {
  const workerIds = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const result = await dbQuery<Array<Record<string, unknown>>>(
      client
        .from("job_broadcasts")
        .select("worker_id")
        .eq("job_id", jobId)
        .order("broadcast_at", { ascending: true })
        .range(from, from + pageSize - 1),
    );
    if (result.error) {
      return {
        success: false as const,
        reason:
          "Đã duyệt hủy nhưng không thể kiểm tra danh sách thợ đã nhận yêu cầu.",
      };
    }
    const rows = result.data ?? [];
    for (const row of rows) {
      const workerId = asString(row.worker_id);
      if (workerId) workerIds.add(workerId);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return {
    success: true as const,
    workerIds: Array.from(workerIds),
  };
}
