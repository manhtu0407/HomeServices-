// Worker eligibility and deterministic ranking for job broadcasts.

import {
  asNumber,
  asString,
  asStringArray,
  nullableNumber,
  nullableString,
} from "../../platform/coercions.ts";
import { type DbClient, dbQuery } from "../../platform/db.ts";
import { ACTIVE_WORKER_JOB_STATUSES, DEFAULT_WORKER_CANDIDATE_POOL_SIZE } from "../../platform/job-state.ts";
import { clampServiceRadius } from "../../platform/domain-utils.ts";
import {
  normalizeDistrict,
  type ServiceType,
} from "../../../../_shared/domain.ts";
import { loadWorkerAvailabilityRows } from "./query-batches.ts";
import { workerAcceptsService } from "../worker/service-preferences.ts";
import { distanceKmBetween } from "./geo.ts";
import {
  DISINTERMEDIATION_RISK_PENALTY_THRESHOLD,
  rankEligibleWorkers,
} from "./broadcast-ranking.ts";
import { getKaelPerformanceProfile } from "../../kael/learning/performance-profiles.ts";
import {
  loadAllFavoriteWorkerIds,
  loadJobGeoForMatching,
  loadQualityLockedWorkerIds,
  normalizeSpecializationKey,
  readDisintermediationRiskCounts,
  specializationKeys,
} from "./broadcast-support.ts";

const WORKER_PROJECTION =
  "id, rating, total_jobs, service_types, selected_service_types, active_service_types, districts, home_lat, home_lng, service_radius_km, problem_specializations";

type WorkerRecord = Record<string, unknown>;
type JobGeo = Awaited<ReturnType<typeof loadJobGeoForMatching>>;
type MatchingCandidateLoad =
  | {
    success: true;
    jobGeo: JobGeo;
    favoriteWorkerIds: Set<string>;
    candidateRows: WorkerRecord[];
  }
  | { success: false; reason: string };

export async function queryEligibleWorkers(
  client: DbClient,
  serviceType: ServiceType,
  district: string,
  limit: number,
  options: {
    candidateWorkerIds?: string[];
    excludeWorkerIds?: string[];
    jobId?: string;
  } = {},
) {
  const candidatesResult = await loadMatchingCandidates(client, serviceType, district, limit, options);
  if (!candidatesResult.success) return candidatesResult;
  const { candidateRows, favoriteWorkerIds, jobGeo } = candidatesResult;
  const districtCode = normalizeDistrict(district);
  const excludedWorkerIds = new Set(options.excludeWorkerIds ?? []);
  const favoriteCandidates = options.candidateWorkerIds?.length
    ? []
    : await loadFavoriteCandidates(
      client,
      favoriteWorkerIds,
      serviceType,
      districtCode,
      jobGeo,
    );
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
      serviceType,
    )
  );
  const candidateIds = candidates
    .map((worker) => asString(worker.id))
    .filter(Boolean);
  if (candidateIds.length === 0) {
    return { success: true as const, workers: [] };
  }
  const [activeJobs, activeReservations, workerMemory] =
    await loadWorkerAvailabilityRows(
      client,
      candidateIds,
      ACTIVE_WORKER_JOB_STATUSES,
      new Date().toISOString(),
    );
  if (activeJobs.error) {
    console.warn("mobile-api active worker job query failed", {
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
    return {
      success: false as const,
      reason: "Lỗi khi kiểm tra thợ đang chờ xác nhận",
    };
  }
  const reservedWorkerIds = new Set(
    (activeReservations.data ?? []).map((row) => asString(row.worker_id))
      .filter(Boolean),
  );
  const riskCounts = readDisintermediationRiskCounts(
    workerMemory,
    candidateIds.length,
  );
  const deprioritizedIds = candidateIds.filter((id) =>
    (riskCounts.get(id) ?? 0) >= DISINTERMEDIATION_RISK_PENALTY_THRESHOLD
  );
  if (deprioritizedIds.length > 0) {
    // §32.6: no silent matching changes — record which candidates got the soft penalty.
    console.info(
      "mobile-api matching soft-deprioritized workers (disintermediation risk)",
      {
        jobId: options.jobId ?? null,
        deprioritizedCount: deprioritizedIds.length,
      },
    );
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

async function loadMatchingCandidates(
  client: DbClient,
  serviceType: ServiceType,
  district: string,
  limit: number,
  options: { candidateWorkerIds?: string[]; jobId?: string },
): Promise<MatchingCandidateLoad> {
  const candidateLimit = Math.max(limit, DEFAULT_WORKER_CANDIDATE_POOL_SIZE);
  const districtCode = normalizeDistrict(district);
  const jobGeo = options.jobId ? await loadJobGeoForMatching(client, options.jobId) : null;
  const favoriteWorkerIds = await loadAllFavoriteWorkerIds(client, jobGeo?.customerId ?? null);
  const candidateWorkerIds = Array.from(new Set(
    (options.candidateWorkerIds ?? []).filter(Boolean),
  ));
  if (candidateWorkerIds.length > 0) {
    const requested = await dbQuery<WorkerRecord[]>(
      client
        .from("worker_profiles")
        .select(WORKER_PROJECTION)
        .in("id", candidateWorkerIds)
        .eq("is_approved", true)
        .eq("is_available", true)
        .eq("is_suspended", false)
        .contains("selected_service_types", [serviceType])
        .or(`districts.cs.{${districtCode}},districts.cs.{hcmc_all}`),
    );
    if (requested.error) {
      console.warn("mobile-api requested worker eligibility query failed", {
        errorCode: requested.error.code,
        requestedCount: candidateWorkerIds.length,
      });
      return { success: false, reason: "Lỗi khi kiểm tra thợ đã lưu" };
    }
    return {
      success: true,
      jobGeo,
      favoriteWorkerIds,
      candidateRows: requested.data ?? [],
    };
  }
  const candidateRows: WorkerRecord[] = [];
  for (let offset = 0;; offset += candidateLimit) {
    const page = await dbQuery<WorkerRecord[]>(
      client
        .from("worker_profiles")
        .select(WORKER_PROJECTION)
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
        errorCode: page.error.code,
      });
      return { success: false, reason: "Lỗi khi tìm thợ phù hợp" };
    }
    const pageRows = page.data ?? [];
    candidateRows.push(...pageRows);
    if (pageRows.length < candidateLimit) break;
  }
  return { success: true, jobGeo, favoriteWorkerIds, candidateRows };
}

async function loadFavoriteCandidates(
  client: DbClient,
  favoriteWorkerIds: Set<string>,
  serviceType: ServiceType,
  districtCode: string,
  jobGeo: JobGeo,
): Promise<WorkerRecord[]> {
  if (favoriteWorkerIds.size === 0) return [];
  const favoriteResult = await dbQuery<WorkerRecord[]>(
    client
      .from("worker_profiles")
      .select(WORKER_PROJECTION)
      .in("id", Array.from(favoriteWorkerIds))
      .eq("is_approved", true)
      .eq("is_available", true)
      .eq("is_suspended", false)
      .contains("selected_service_types", [serviceType])
      .or(`districts.cs.{${districtCode}},districts.cs.{hcmc_all}`),
  );
  if (!favoriteResult.error) return favoriteResult.data ?? [];
  console.warn("mobile-api favorite-worker eligibility load failed", {
    errorCode: favoriteResult.error.code,
  });
  return [];
}

function hasEveryRequiredCapability(
  workerCapabilities: string[],
  requiredCapabilities: string[],
  serviceType: ServiceType,
) {
  if (requiredCapabilities.length === 0) return true;
  const serviceCapabilityKeys = specializationKeys(
    [...(getKaelPerformanceProfile(serviceType)?.worker_capabilities ?? [])],
  );
  const scopedCapabilities = workerCapabilities.filter((capability) =>
    serviceCapabilityKeys.has(normalizeSpecializationKey(capability))
  );
  // problem_specializations is global across selected services. When it has no
  // capability for this service, the selected service remains the legacy gate.
  if (scopedCapabilities.length === 0) return true;
  const available = specializationKeys(scopedCapabilities);
  return requiredCapabilities.every((requirement) =>
    available.has(normalizeSpecializationKey(requirement))
  );
}
