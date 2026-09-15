import type { WaitingKind, WaitingModel, WaitingClockInput } from './waiting.types'
export interface WaitingSnapshot {
  jobId: string | null
  jobStatus?: string | null
  scope?: { status?: string | null; createdAt?: string | number | null } | null
  /** Correct request-level timestamps from server. Broadcast expiry is NOT candidate expiry. */
  timing?: Omit<WaitingClockInput, 'requestKey'>
}
const assignedStatuses = new Set(['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing', 'completed_by_worker', 'completed', 'closed'])
export function buildWaitingModel(kind: WaitingKind, snapshot: WaitingSnapshot): WaitingModel {
  const { jobId, jobStatus, scope, timing } = snapshot
  let state: WaitingModel['state'] = 'unavailable'
  if (jobId && kind === 'customer-confirmation') {
    if (jobStatus === 'worker_candidate_pending') state = 'waiting'
    else if (jobStatus && assignedStatuses.has(jobStatus)) state = 'approved'
    else if (jobStatus === 'cancelled' || jobStatus === 'broadcasting') state = 'rejected'
  }
  if (jobId && kind === 'scope-approval' && scope) {
    if (scope.status === 'approved_by_customer') state = 'approved'
    else if (scope.status === 'rejected_by_customer' || scope.status === 'cancelled') state = 'rejected'
    else if (jobStatus === 'scope_change_pending') state = 'waiting'
  }
  const clock: WaitingClockInput = {
    requestKey: `${jobId ?? 'missing'}:${kind}:${scope?.createdAt ?? ''}`,
    // Scope creation time is present in the source. Candidate start is not: leave it unknown.
    startedAt: timing?.startedAt ?? (kind === 'scope-approval' ? scope?.createdAt : null),
    expiresAt: timing?.expiresAt ?? null,
    anchor: timing?.anchor,
  }
  if (state === 'unavailable') { clock.startedAt = null; clock.expiresAt = null }
  return { kind, state, clock, referenceCopy: false }
}
