// Availability is a scheduling preference, not proof that a worker can receive a live request.

export const MATCHING_PUSH_PROOF_TTL_MS = 24 * 60 * 60 * 1000;

export function isWorkerReachable(
  input: {
    pushProvenAt: string | null;
    foregroundActiveUntil: string | null;
    currentPushTokenUpdatedAts?: string[];
  },
  now = new Date(),
): boolean {
  const pushProvenAt = input.pushProvenAt ? Date.parse(input.pushProvenAt) : Number.NaN;
  const pushProofIsFresh = Number.isFinite(pushProvenAt) &&
    pushProvenAt <= now.getTime() &&
    now.getTime() - pushProvenAt <= MATCHING_PUSH_PROOF_TTL_MS;
  const proofMatchesCurrentToken = pushProofIsFresh &&
    (input.currentPushTokenUpdatedAts ?? []).some((updatedAt) => {
      const tokenUpdatedAt = Date.parse(updatedAt);
      return Number.isFinite(tokenUpdatedAt) && tokenUpdatedAt <= pushProvenAt;
    });
  if (proofMatchesCurrentToken) return true;
  if (!input.foregroundActiveUntil) return false;
  const activeUntil = Date.parse(input.foregroundActiveUntil);
  return !Number.isNaN(activeUntil) && activeUntil >= now.getTime();
}

export function isCohortEligible(
  jobCohortId: string | null,
  workerCohortId: string | null,
): boolean {
  return jobCohortId === workerCohortId;
}
