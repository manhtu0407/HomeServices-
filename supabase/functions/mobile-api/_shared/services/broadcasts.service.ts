// Edge service broadcasts/matching domain (C4 6a, services/* split): job-broadcast CRUD/lifecycle
// + worker eligibility/ranking (geo + specialization + disintermediation soft-penalty). Imported
// directly by services.ts; calls notifyBroadcastWorkers (notifications domain).

import { asNumber, asString, asStringArray, nullableNumber, nullableRecord, nullableString } from "./coercions.ts";
import { dbQuery, type DbClient } from "./db.ts";
import { ACTIVE_WORKER_JOB_STATUSES, clampServiceRadius, DEFAULT_WORKER_CANDIDATE_POOL_SIZE, secondsRemaining } from "./_shared.ts";
import { notifyBroadcastWorkers } from "./notifications.service.ts";
import { apiFailure } from "../router.ts";
import { normalizeDistrict, type ServiceType } from "../../../_shared/domain.ts";

const DISINTERMEDIATION_RISK_PENALTY_THRESHOLD = 2;
const DISINTERMEDIATION_RISK_SCORE_PENALTY = 15;
const FAVORITE_WORKER_SCORE_BONUS = 25;

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
  const rows = eligible.map((worker) => ({
    job_id: jobId,
    worker_id: worker.id,
    status: "sent",
    broadcast_at: now.toISOString(),
    sent_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    batch_id: batchId,
  }));
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.from("job_broadcasts").insert(rows).select("id, worker_id"),
  );
  if (result.error) {
    return {
      success: false as const,
      reasonCode: "DB_ERROR" as const,
      reason: "Lỗi khi gửi yêu cầu đến thợ",
    };
  }
  const broadcastTargets = (result.data ?? []).map((row) => ({
    broadcastId: asString(row.id),
    workerId: asString(row.worker_id),
  })).filter((row) => row.broadcastId && row.workerId);
  await notifyBroadcastWorkers(
    client,
    jobId,
    serviceType,
    district,
    expiresAt.toISOString(),
    broadcastTargets,
  );
  return { success: true as const, batchId, broadcastCount: eligible.length };
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
  nowIso: string,
): Promise<boolean> {
  const guardIso = new Date(Date.parse(nowIso) - 1_000).toISOString();
  const result = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({ broadcast_at: nowIso, confirmed_search_at: nowIso })
      .eq("id", jobId)
      .eq("customer_id", customerId)
      .eq("status", "broadcasting")
      .or(`broadcast_at.is.null,broadcast_at.lte.${guardIso}`)
      .select("id")
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể bắt đầu tìm thợ", 500);
  }
  return Boolean(result.data);
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
    "id, rating, total_jobs, service_types, districts, home_lat, home_lng, service_radius_km, problem_specializations";
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("worker_profiles")
      .select(workerProjection)
      .eq("is_approved", true)
      .eq("is_available", true)
      .eq("is_suspended", false)
      .contains("service_types", [serviceType])
      .or(`districts.cs.{${districtCode}},districts.cs.{hcmc_all}`)
      .order("rating", { ascending: false })
      .limit(candidateLimit),
  );
  if (result.error) {
    console.warn("mobile-api worker eligibility query failed", {
      serviceType,
      district: districtCode,
      errorCode: result.error.code,
    });
    return {
      success: false as const,
      reason: "Lỗi khi tìm thợ phù hợp",
    };
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
        .contains("service_types", [serviceType])
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
  for (const worker of [...(result.data ?? []), ...favoriteCandidates]) {
    const workerId = asString(worker.id);
    if (workerId) combinedCandidates.set(workerId, worker);
  }
  const candidates = Array.from(combinedCandidates.values()).filter((worker) =>
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
  const activeJobs = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("jobs")
      .select("worker_id")
      .in("worker_id", candidateIds)
      .in("status", ACTIVE_WORKER_JOB_STATUSES)
      .limit(candidateIds.length),
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
  const activeReservations = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_worker_candidates")
      .select("worker_id")
      .in("worker_id", candidateIds)
      .eq("status", "proposed")
      .gt("expires_at", new Date().toISOString())
      .limit(candidateIds.length),
  );
  if (activeReservations.error) {
    return { success: false as const, reason: "Lỗi khi kiểm tra thợ đang chờ xác nhận" };
  }
  const reservedWorkerIds = new Set(
    (activeReservations.data ?? []).map((row) => asString(row.worker_id)).filter(Boolean),
  );
  const riskCounts = await loadDisintermediationRiskCounts(client, candidateIds);
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

async function loadDisintermediationRiskCounts(
  client: DbClient,
  workerIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (workerIds.length === 0) return counts;
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("worker_kael_memory")
      .select("worker_id, red_flags")
      .in("worker_id", workerIds),
  );
  if (result.error) {
    // Fail open: a risk-signal read failure must not block matching.
    console.warn("mobile-api disintermediation risk load failed", {
      errorCode: result.error.code,
      workerCount: workerIds.length,
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
  // Legacy approved profiles predate granular capability capture; their
  // canonical service_types + district eligibility remains the qualification.
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
