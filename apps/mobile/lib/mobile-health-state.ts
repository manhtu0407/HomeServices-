export type MobileHealthFailureReason = 'API_TIMEOUT' | 'API_NETWORK_ERROR' | 'API_HTTP_5XX'

type PendingMobileHealthFailure = {
  reason_code: MobileHealthFailureReason
  duration_ms: number
  observed_at: number
}

let pendingFailure: PendingMobileHealthFailure | null = null

export function noteMobileHealthFailure(reason: MobileHealthFailureReason, durationMs: number) {
  pendingFailure = {
    reason_code: reason,
    duration_ms: Math.max(0, Math.min(60_000, Math.floor(durationMs))),
    observed_at: Date.now(),
  }
}

export function peekMobileHealthFailure(now = Date.now()): PendingMobileHealthFailure | null {
  if (!pendingFailure) return null
  if (now - pendingFailure.observed_at > 180_000) {
    pendingFailure = null
    return null
  }
  return pendingFailure
}

export function clearMobileHealthFailure(expected: PendingMobileHealthFailure | null) {
  if (expected && pendingFailure?.observed_at === expected.observed_at && pendingFailure.reason_code === expected.reason_code) {
    pendingFailure = null
  }
}

export function resetMobileHealthFailureForTests() {
  pendingFailure = null
}
