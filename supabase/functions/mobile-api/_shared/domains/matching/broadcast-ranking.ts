// Deterministic ranking for job broadcasts: distance, specialization, favorites, risk penalty.

import { asNumber, asString, asStringArray, nullableNumber } from "../../platform/coercions.ts";
import { clampServiceRadius } from "../../platform/domain-utils.ts";
import { distanceKmBetween } from "./geo.ts";
import {
  loadJobGeoForMatching,
  normalizeSpecializationKey,
} from "./broadcast-support.ts";

export const DISINTERMEDIATION_RISK_PENALTY_THRESHOLD = 2;
const DISINTERMEDIATION_RISK_SCORE_PENALTY = 15;
const FAVORITE_WORKER_SCORE_BONUS = 25;

export function rankEligibleWorkers(
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
        score: rating * 10 + (specializationMatch ? 20 : 0) + favoriteBonus +
          distanceScore -
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

function hasSpecializationMatch(
  workerSpecializations: string[],
  jobProblemKeys: Set<string>,
) {
  if (jobProblemKeys.size === 0 || workerSpecializations.length === 0) {
    return false;
  }
  return workerSpecializations
    .map(normalizeSpecializationKey)
    .some((key) => key.length > 0 && jobProblemKeys.has(key));
}
