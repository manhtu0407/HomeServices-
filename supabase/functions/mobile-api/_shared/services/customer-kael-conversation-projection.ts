import type { EdgeCustomerKaelConversationSessionResponse } from "../router/customer-kael-conversation-dtos.ts";
import {
  KAEL_PERFORMANCE_PROFILE_IDS,
  type KaelPerformanceProfileId,
} from "../kael/performance-profiles.ts";
import {
  asNumber,
  asRecord,
  asString,
  nullableServiceType,
  nullableString,
} from "./coercions.ts";

export type CustomerCaseCatalogDetail = {
  jobId: string | null;
  profileId: KaelPerformanceProfileId | null;
  serviceType: ReturnType<typeof nullableServiceType>;
  totalTurns: number;
  updatedAt: string;
};

export function projectCustomerCaseCatalogDetail(
  row: Record<string, unknown>,
): CustomerCaseCatalogDetail {
  return {
    jobId: nullableString(row.job_id),
    profileId: nullablePerformanceProfile(asRecord(row.safe_metadata).profile_id),
    serviceType: nullableServiceType(row.service_type),
    totalTurns: asNumber(row.total_turns),
    updatedAt: asString(row.updated_at),
  };
}

export function nullablePerformanceProfile(value: unknown): KaelPerformanceProfileId | null {
  return typeof value === "string" && (KAEL_PERFORMANCE_PROFILE_IDS as readonly string[]).includes(value)
    ? value as KaelPerformanceProfileId
    : null;
}

export function isVisibleCustomerConversationCatalogRow(
  row: Record<string, unknown>,
  availableCaseSessionIds: ReadonlySet<string>,
) {
  const caseSessionId = nullableString(row.case_session_id);
  return !caseSessionId || availableCaseSessionIds.has(caseSessionId);
}

export function latestIsoTimestamp(current: string, candidate: string) {
  const currentTime = Date.parse(current);
  const candidateTime = Date.parse(candidate);
  if (Number.isFinite(candidateTime) && (!Number.isFinite(currentTime) || candidateTime > currentTime)) {
    return candidate;
  }
  return current;
}

export function sortCustomerConversationSessions(
  sessions: EdgeCustomerKaelConversationSessionResponse[],
) {
  return [...sessions].sort((left, right) => {
    const leftPinned = left.pinned_at ? 1 : 0;
    const rightPinned = right.pinned_at ? 1 : 0;
    if (leftPinned !== rightPinned) return rightPinned - leftPinned;
    const activityDelta = Date.parse(right.updated_at) - Date.parse(left.updated_at);
    if (Number.isFinite(activityDelta) && activityDelta !== 0) return activityDelta;
    return right.started_at.localeCompare(left.started_at);
  });
}
