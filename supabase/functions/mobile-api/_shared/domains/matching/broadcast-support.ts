// Broadcast retry lease plus worker-ranking support reads.

import {
  asNumber,
  asString,
  asStringArray,
  nullableNumber,
  nullableRecord,
  nullableString,
} from "../../platform/coercions.ts";
import { type DbClient, dbQuery, type DbResult } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { ServiceType } from "../../../../_shared/domain.ts";
import { isWorkerServiceQualityLocked } from "../worker/service-preferences.ts";
import { getKaelPerformanceProfile } from "../../kael/learning/performance-profiles.ts";

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
  if (
    !row || typeof row.claimed !== "boolean" ||
    (row.claimed && reasonCode !== null)
  ) {
    apiFailure(
      "DB_ERROR",
      "Phản hồi khóa thử lại broadcast không hợp lệ",
      500,
    );
  }
  if (row.claimed) return { acquired: true, claimToken };
  if (
    !reasonCode ||
    !(BROADCAST_RETRY_CLAIM_FAILURE_CODES as readonly string[]).includes(
      reasonCode,
    )
  ) {
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

export async function loadQualityLockedWorkerIds(
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

export function readDisintermediationRiskCounts(
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

// A late-arrival proposal lowers a worker's rank for a while. Like the risk signal above it
// fails open: a read error must never stop a job from being matched.
export async function loadDisciplineDeprioritizedIds(
  client: DbClient,
  workerIds: string[],
): Promise<Set<string>> {
  if (workerIds.length === 0) return new Set();
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("list_matching_deprioritized_workers", { p_worker_ids: workerIds }),
  );
  if (result.error) {
    console.warn("mobile-api discipline matching signal load failed", {
      errorCode: result.error.code,
      workerCount: workerIds.length,
    });
    return new Set();
  }
  return new Set((result.data ?? []).map((row) => asString(row.worker_id)).filter(Boolean));
}

export async function loadAllFavoriteWorkerIds(
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

export async function loadJobGeoForMatching(
  client: DbClient,
  jobId: string,
  serviceType: ServiceType,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select(
        "customer_id, address_lat, address_lng, problem_chips, service_type, service_problem_id, kael_problem_identified, diagnosis_scope, intake_scope_snapshot, quote_mode, synthetic_cohort_id",
      )
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
  const diagnosisScope = nullableRecord(result.data.diagnosis_scope) ??
    nullableRecord(result.data.intake_scope_snapshot) ?? {};
  let workerRequirements = asStringArray(diagnosisScope.worker_requirements);
  const profileCapabilities = getKaelPerformanceProfile(serviceType)?.worker_capabilities ?? [];
  if (isLegacyServiceWideRequirements(workerRequirements, profileCapabilities)) {
    let policyQuery = client.from("service_intake_policies")
      .select("capability_requirements")
      .eq("status", "active");
    const serviceProblemId = nullableString(result.data.service_problem_id);
    const problemSlug = nullableString(result.data.kael_problem_identified);
    if (serviceProblemId) {
      policyQuery = policyQuery.eq("service_problem_id", serviceProblemId);
    } else if (problemSlug) {
      policyQuery = policyQuery.eq("service_type", serviceType).eq("problem_slug", problemSlug);
    }
    if (serviceProblemId || problemSlug) {
      const policyResult = await dbQuery<Record<string, unknown>>(
        policyQuery.maybeSingle(),
      );
      if (policyResult.error) {
        console.warn("mobile-api legacy matching-policy lookup failed", {
          jobId,
          errorCode: policyResult.error.code,
        });
      } else if (policyResult.data) {
        workerRequirements = resolveMatchingWorkerRequirements(
          serviceType,
          workerRequirements,
          asStringArray(policyResult.data.capability_requirements),
        );
      }
    }
  }
  return {
    customerId: nullableString(result.data.customer_id),
    quoteMode: nullableString(result.data.quote_mode),
    syntheticCohortId: nullableString(result.data.synthetic_cohort_id),
    lat: nullableNumber(result.data.address_lat),
    lng: nullableNumber(result.data.address_lng),
    problemKeys: specializationKeys([
      ...asStringArray(result.data.problem_chips),
      ...workerRequirements,
      nullableString(result.data.service_problem_id),
      nullableString(result.data.kael_problem_identified),
    ]),
    workerRequirements,
  };
}

export function resolveMatchingWorkerRequirements(
  serviceType: ServiceType,
  persistedRequirements: readonly string[],
  activeCaseRequirements: readonly string[],
) {
  const profileCapabilities = getKaelPerformanceProfile(serviceType)?.worker_capabilities ?? [];
  return isLegacyServiceWideRequirements(persistedRequirements, profileCapabilities)
    ? [...new Set(activeCaseRequirements)]
    : [...new Set(persistedRequirements)];
}

function isLegacyServiceWideRequirements(
  requirements: readonly string[],
  serviceCapabilities: readonly string[],
) {
  const normalizedRequirements = new Set(requirements.map((value) => value.trim().toLowerCase()));
  const normalizedCapabilities = new Set(serviceCapabilities.map((value) => value.trim().toLowerCase()));
  return normalizedCapabilities.size > 0 &&
    normalizedRequirements.size === normalizedCapabilities.size &&
    [...normalizedCapabilities].every((capability) => normalizedRequirements.has(capability));
}

export function specializationKeys(values: Array<string | null>) {
  return new Set(
    values
      .map((value) => normalizeSpecializationKey(value ?? ""))
      .filter(Boolean),
  );
}

export function normalizeSpecializationKey(value: string) {
  return value.trim().toLowerCase();
}
