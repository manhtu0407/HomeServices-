// Edge service broadcasts/matching domain (C4 6a, services/* split): job-broadcast CRUD/lifecycle
// + worker eligibility/ranking (geo + specialization + disintermediation soft-penalty). Imported
// directly by services.ts; calls notifyBroadcastWorkers (notifications domain).

import { asNumber, asString, asStringArray, nullableNumber, nullableRecord, nullableString } from "./coercions.ts";
import { dbQuery, type DbClient, type DbResult } from "./db.ts";
import { ACTIVE_WORKER_JOB_STATUSES, clampServiceRadius, DEFAULT_WORKER_CANDIDATE_POOL_SIZE, secondsRemaining } from "./_shared.ts";
import { notifyBroadcastWorkers } from "./notifications.service.ts";
import { apiFailure } from "../router.ts";
import { normalizeDistrict, type ServiceType } from "../../../_shared/domain.ts";
import {
  loadWorkerAvailabilityRows,
} from "./broadcast-query-batches.ts";
import {
  isWorkerServiceQualityLocked,
  workerAcceptsService,
} from "./worker-service-preferences.ts";

const DISINTERMEDIATION_RISK_PENALTY_THRESHOLD = 2;
const DISINTERMEDIATION_RISK_SCORE_PENALTY = 15;
const FAVORITE_WORKER_SCORE_BONUS = 25;
const BROADCAST_RETRY_LEASE_SECONDS = 180;
const BROADCAST_RETRY_CLAIM_FAILURE_CODES = [
  "ACTIVE_BROADCAST",
  "CLAIM_ACTIVE",
  "INVALID_INPUT",
  "INVALID_STATUS",
  "NOT_FOUND",
  "NOT_OWNER",
] as const;

export type BroadcastRetryClaimFailureCode =
  typeof BROADCAST_RETRY_CLAIM_FAILURE_CODES[number];

type ActivateBroadcastBatchInput = {
  jobId: string;
  workerIds: string[];
  batchId: string;
  sentAt: string;
  expiresAt: string;
};

export async function activateBroadcastBatch(
  client: DbClient,
  input: ActivateBroadcastBatchInput,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("activate_job_broadcast_batch_atomic", {
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
  options: { excludeWorkerIds?: string[] } = {},
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
  const eligible = eligibleResult.workers;
  if (eligible.length === 0) {
    return {
      success: false as const,
      reasonCode: "NO_WORKER" as const,
      reason: "Không tìm thấy thợ phù hợp đang online trong khu vực",
    };
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60_000);
  const batchId = crypto.randomUUID();
  const activation = await activateBroadcastBatch(client, {
    jobId,
    workerIds: eligible.map((worker) => worker.id),
    batchId,
    sentAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
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

export async function acquireBroadcastRetryLease(
  client: DbClient,
  jobId: string,
  customerId: string,
): Promise<
  | { acquired: true; claimToken: string }
  | { acquired: false; reasonCode: BroadcastRetryClaimFailureCode }
> {
  const claimToken = crypto.randomUUID();
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("claim_job_broadcast_retry_atomic", {
      p_job_id: jobId,
      p_customer_id: customerId,
      p_claim_token: claimToken,
      p_lease_seconds: BROADCAST_RETRY_LEASE_SECONDS,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể bắt đầu tìm thợ", 500);
  }
  const row = result.data?.[0];
  const reasonCode = nullableString(row?.error_code);
  if (!row || typeof row.claimed !== "boolean" ||
    (row.claimed && reasonCode !== null)) {
    apiFailure(
      "DB_ERROR",
      "Phản hồi khóa thử lại broadcast không hợp lệ",
      500,
    );
  }
  if (row.claimed) return { acquired: true, claimToken };
  if (!reasonCode ||
    !(BROADCAST_RETRY_CLAIM_FAILURE_CODES as readonly string[]).includes(reasonCode)) {
    apiFailure(
      "DB_ERROR",
      "Phản hồi khóa thử lại broadcast không hợp lệ",
      500,
    );
  }
  return {
    acquired: false,
    reasonCode: reasonCode as BroadcastRetryClaimFailureCode,
  };
}

export async function releaseBroadcastRetryLease(
  client: DbClient,
  jobId: string,
  customerId: string,
  claimToken: string,
): Promise<boolean> {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("release_job_broadcast_retry_claim_atomic", {
      p_job_id: jobId,
      p_customer_id: customerId,
      p_claim_token: claimToken,
    }),
  );
  const released = result.data?.[0]?.released;
  if (result.error || typeof released !== "boolean" || !released) {
    console.warn("mobile-api broadcast retry claim release failed", { jobId });
    return false;
  }
  return true;
}

export async function runWithBroadcastRetryLease<T>(
  client: DbClient,
  jobId: string,
  customerId: string,
  work: () => Promise<T>,
): Promise<
  | { acquired: false; reasonCode: BroadcastRetryClaimFailureCode }
  | { acquired: true; value: T }
> {
  const claim = await acquireBroadcastRetryLease(
    client,
    jobId,
    customerId,
  );
  if (!claim.acquired) return claim;

  try {
    // The claim RPC waits for the previous owner and rechecks active rows after
    // winning, so provider/worker queries can now run without a duplicate writer.
    return { acquired: true, value: await work() };
  } finally {
    await releaseBroadcastRetryLease(
      client,
      jobId,
      customerId,
      claim.claimToken,
    );
  }
}

export function isBroadcastRetryContention(
  reasonCode: BroadcastRetryClaimFailureCode,
) {
  return reasonCode === "ACTIVE_BROADCAST" || reasonCode === "CLAIM_ACTIVE";
}

export function failBroadcastRetryClaim(
  reasonCode: BroadcastRetryClaimFailureCode,
): never {
  if (isBroadcastRetryContention(reasonCode)) {
    apiFailure(
      "BROADCAST_ACTIVE",
      "Yêu cầu đang được gửi đến thợ. Vui lòng chờ phản hồi hiện tại.",
      409,
    );
  }
  if (reasonCode === "NOT_FOUND" || reasonCode === "NOT_OWNER") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (reasonCode === "INVALID_STATUS") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể bắt đầu tìm thợ", 500);
}

export async function getJobBroadcastState(client: DbClient, jobId: string) {
  const now = new Date();
  const nowIso = now.toISOString();
  await expireStaleBroadcasts(client, jobId, nowIso);
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

export async function listBroadcastRecipientWorkerIds(client: DbClient, jobId: string) {
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
        reason: "Đã duyệt hủy nhưng không thể kiểm tra danh sách thợ đã nhận yêu cầu.",
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

async function queryEligibleWorkers(
  client: DbClient,
  serviceType: ServiceType,
  district: string,
  limit: number,
  options: { excludeWorkerIds?: string[]; jobId?: string } = {},
) {
  const candidateLimit = Math.max(limit, DEFAULT_WORKER_CANDIDATE_POOL_SIZE);
  const districtCode = normalizeDistrict(district);
  const excludedWorkerIds = new Set(options.excludeWorkerIds ?? []);
  const jobGeo = options.jobId
    ? await loadJobGeoForMatching(client, options.jobId)
    : null;
  const favoriteWorkerIds = await loadAllFavoriteWorkerIds(
    client,
    jobGeo?.customerId ?? null,
  );
  const workerProjection =
    "id, rating, total_jobs, service_types, selected_service_types, active_service_types, districts, home_lat, home_lng, service_radius_km, problem_specializations";
  const candidateRows: Array<Record<string, unknown>> = [];
  for (let offset = 0;; offset += candidateLimit) {
    const page = await dbQuery<Array<Record<string, unknown>>>(
      client
        .from("worker_profiles")
        .select(workerProjection)
        .eq("is_approved", true)
        .eq("is_available", true)
        .eq("is_suspended", false)
        .contains("selected_service_types", [serviceType])
        .or(`districts.cs.{${districtCode}},districts.cs.{hcmc_all}`)
        .order("rating", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + candidateLimit - 1),
    );
    if (page.error) {
      console.warn("mobile-api worker eligibility query failed", {
        serviceType,
        district: districtCode,
        errorCode: page.error.code,
      });
      return {
        success: false as const,
        reason: "Lỗi khi tìm thợ phù hợp",
      };
    }
    const pageRows = page.data ?? [];
    candidateRows.push(...pageRows);
    if (pageRows.length < candidateLimit) break;
  }
  let favoriteCandidates: Array<Record<string, unknown>> = [];
  if (favoriteWorkerIds.size > 0) {
    const favoriteResult = await dbQuery<Array<Record<string, unknown>>>(
      client
        .from("worker_profiles")
        .select(workerProjection)
        .in("id", Array.from(favoriteWorkerIds))
        .eq("is_approved", true)
        .eq("is_available", true)
        .eq("is_suspended", false)
        .contains("selected_service_types", [serviceType])
        .or(`districts.cs.{${districtCode}},districts.cs.{hcmc_all}`),
    );
    if (favoriteResult.error) {
      console.warn("mobile-api favorite-worker eligibility load failed", {
        customerId: jobGeo?.customerId ?? null,
        errorCode: favoriteResult.error.code,
      });
    } else {
      favoriteCandidates = favoriteResult.data ?? [];
    }
  }
  const combinedCandidates = new Map<string, Record<string, unknown>>();
  for (const worker of [...candidateRows, ...favoriteCandidates]) {
    const workerId = asString(worker.id);
    if (workerId) combinedCandidates.set(workerId, worker);
  }
  const qualityLocks = await loadQualityLockedWorkerIds(
    client,
    Array.from(combinedCandidates.keys()),
    serviceType,
  );
  if (!qualityLocks.success) {
    return {
      success: false as const,
      reason: "Lỗi khi kiểm tra chất lượng dịch vụ của thợ",
    };
  }
  const candidates = Array.from(combinedCandidates.values()).filter((worker) =>
    workerAcceptsService(worker, serviceType) &&
    !qualityLocks.workerIds.has(asString(worker.id)) &&
    !excludedWorkerIds.has(asString(worker.id)) &&
    hasEveryRequiredCapability(
      asStringArray(worker.problem_specializations),
      jobGeo?.workerRequirements ?? [],
    )
  );
  const candidateIds = candidates
    .map((worker) => asString(worker.id))
    .filter(Boolean);
  if (candidateIds.length === 0) {
    return { success: true as const, workers: [] };
  }
  const [activeJobs, activeReservations, workerMemory] = await loadWorkerAvailabilityRows(
    client,
    candidateIds,
    ACTIVE_WORKER_JOB_STATUSES,
    new Date().toISOString(),
  );
  if (activeJobs.error) {
    console.warn("mobile-api active worker job query failed", {
      serviceType,
      district: districtCode,
      errorCode: activeJobs.error.code,
    });
    return {
      success: false as const,
      reason: "Lỗi khi tìm thợ phù hợp",
    };
  }
  const busyWorkerIds = new Set(
    (activeJobs.data ?? [])
      .map((job) => asString(job.worker_id))
      .filter(Boolean),
  );
  if (activeReservations.error) {
    return { success: false as const, reason: "Lỗi khi kiểm tra thợ đang chờ xác nhận" };
  }
  const reservedWorkerIds = new Set(
    (activeReservations.data ?? []).map((row) => asString(row.worker_id)).filter(Boolean),
  );
  const riskCounts = readDisintermediationRiskCounts(workerMemory, candidateIds.length);
  const deprioritizedIds = candidateIds.filter((id) =>
    (riskCounts.get(id) ?? 0) >= DISINTERMEDIATION_RISK_PENALTY_THRESHOLD
  );
  if (deprioritizedIds.length > 0) {
    // §32.6: no silent matching changes — record which candidates got the soft penalty.
    console.info("mobile-api matching soft-deprioritized workers (disintermediation risk)", {
      jobId: options.jobId ?? null,
      workerIds: deprioritizedIds,
    });
  }
  return {
    success: true as const,
    workers: rankEligibleWorkers(
      candidates.filter((worker) =>
        !busyWorkerIds.has(asString(worker.id)) &&
        !reservedWorkerIds.has(asString(worker.id))
      ),
      jobGeo,
      riskCounts,
      favoriteWorkerIds,
    )
      .slice(0, limit)
      .map((worker) => ({
        id: asString(worker.id),
      })),
  };
}

async function loadQualityLockedWorkerIds(
  client: DbClient,
  workerIds: string[],
  serviceType: ServiceType,
) {
  const lockedWorkerIds = new Set<string>();
  if (workerIds.length === 0) {
    return { success: true as const, workerIds: lockedWorkerIds };
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("worker_service_quality_status")
      .select("worker_id, locked_until, is_locked")
      .in("worker_id", workerIds)
      .eq("service_type", serviceType),
  );
  if (result.error) {
    console.warn("mobile-api worker service quality load failed", {
      errorCode: result.error.code,
      serviceType,
      workerCount: workerIds.length,
    });
    return { success: false as const, workerIds: lockedWorkerIds };
  }
  for (const row of result.data ?? []) {
    const workerId = asString(row.worker_id);
    if (workerId && isWorkerServiceQualityLocked(row)) {
      lockedWorkerIds.add(workerId);
    }
  }
  return { success: true as const, workerIds: lockedWorkerIds };
}

function readDisintermediationRiskCounts(
  result: DbResult<Array<Record<string, unknown>>>,
  workerCount: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  if (result.error) {
    // Fail open: a risk-signal read failure must not block matching.
    console.warn("mobile-api disintermediation risk load failed", {
      errorCode: result.error.code,
      workerCount,
    });
    return counts;
  }
  for (const row of result.data ?? []) {
    const workerId = asString(row.worker_id);
    const redFlags = nullableRecord(row.red_flags) ?? {};
    const count = asNumber(redFlags.disintermediation_risk_count);
    if (workerId && count > 0) counts.set(workerId, count);
  }
  return counts;
}

async function loadJobGeoForMatching(client: DbClient, jobId: string) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select("customer_id, address_lat, address_lng, problem_chips, service_problem_id, kael_problem_identified, diagnosis_scope")
      .eq("id", jobId)
      .maybeSingle(),
  );
  if (result.error) {
    console.warn("mobile-api geo job lookup failed", {
      jobId,
      errorCode: result.error.code,
    });
    return null;
  }
  if (!result.data) return null;
  const diagnosisScope = nullableRecord(result.data.diagnosis_scope) ?? {};
  return {
    customerId: nullableString(result.data.customer_id),
    lat: nullableNumber(result.data.address_lat),
    lng: nullableNumber(result.data.address_lng),
    problemKeys: specializationKeys([
      ...asStringArray(result.data.problem_chips),
      ...asStringArray(diagnosisScope.worker_requirements),
      nullableString(result.data.service_problem_id),
      nullableString(result.data.kael_problem_identified),
    ]),
    workerRequirements: asStringArray(diagnosisScope.worker_requirements),
  };
}

function hasEveryRequiredCapability(
  workerCapabilities: string[],
  requiredCapabilities: string[],
) {
  if (requiredCapabilities.length === 0) return true;
  // Legacy profiles predate granular capability capture; their selected
  // service plus district eligibility remains the qualification.
  if (workerCapabilities.length === 0) return true;
  const available = specializationKeys(workerCapabilities);
  return requiredCapabilities.every((requirement) =>
    available.has(normalizeSpecializationKey(requirement))
  );
}

function rankEligibleWorkers(
  workers: Array<Record<string, unknown>>,
  jobGeo: Awaited<ReturnType<typeof loadJobGeoForMatching>>,
  riskCounts: Map<string, number> = new Map(),
  favoriteWorkerIds: Set<string> = new Set(),
) {
  return workers
    .map((worker) => {
      const workerLat = nullableNumber(worker.home_lat);
      const workerLng = nullableNumber(worker.home_lng);
      const radius = clampServiceRadius(worker.service_radius_km);
      const distanceKm = jobGeo && jobGeo.lat !== null && jobGeo.lng !== null &&
          workerLat !== null && workerLng !== null
        ? distanceKmBetween(jobGeo.lat, jobGeo.lng, workerLat, workerLng)
        : null;
      const specializationMatch = hasSpecializationMatch(
        asStringArray(worker.problem_specializations),
        jobGeo?.problemKeys ?? new Set<string>(),
      );
      const rating = asNumber(worker.rating);
      const totalJobs = asNumber(worker.total_jobs);
      const distanceScore = distanceKm === null || distanceKm <= radius
        ? 0
        : -(distanceKm - radius) * 2;
      const riskCount = riskCounts.get(asString(worker.id)) ?? 0;
      const riskPenalty = riskCount >= DISINTERMEDIATION_RISK_PENALTY_THRESHOLD
        ? DISINTERMEDIATION_RISK_SCORE_PENALTY
        : 0;
      const favoriteBonus = favoriteWorkerIds.has(asString(worker.id))
        ? FAVORITE_WORKER_SCORE_BONUS
        : 0;
      return {
        worker,
        rating,
        totalJobs,
        score: rating * 10 + (specializationMatch ? 20 : 0) + favoriteBonus + distanceScore -
          riskPenalty,
      };
    })
    .sort((left, right) =>
      right.score - left.score ||
      right.rating - left.rating ||
      right.totalJobs - left.totalJobs
    )
    .map((entry) => entry.worker);
}

async function loadAllFavoriteWorkerIds(
  client: DbClient,
  customerId: string | null,
) {
  if (!customerId) return new Set<string>();
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("customer_favorite_workers")
      .select("worker_id")
      .eq("customer_id", customerId),
  );
  if (result.error) {
    console.warn("mobile-api favorite-worker ranking load failed", {
      customerId,
      errorCode: result.error.code,
    });
    return new Set<string>();
  }
  return new Set(
    (result.data ?? []).map((row) => asString(row.worker_id)).filter(Boolean),
  );
}

export function distanceKmBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasSpecializationMatch(
  workerSpecializations: string[],
  jobProblemKeys: Set<string>,
) {
  if (jobProblemKeys.size === 0 || workerSpecializations.length === 0) return false;
  return workerSpecializations
    .map(normalizeSpecializationKey)
    .some((key) => key.length > 0 && jobProblemKeys.has(key));
}

function specializationKeys(values: Array<string | null>) {
  return new Set(
    values
      .map((value) => normalizeSpecializationKey(value ?? ""))
      .filter(Boolean),
  );
}

function normalizeSpecializationKey(value: string) {
  return value.trim().toLowerCase();
}
