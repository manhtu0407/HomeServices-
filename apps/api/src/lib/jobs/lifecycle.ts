import type { JobStatus } from '@home-services/shared'

const VALID_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  draft: ['analyzing', 'cancelled'],
  // 'cancelled' added so AI pipeline failure terminates cleanly instead of
  // reverting to 'draft' and leaving an invisible orphan.
  // 'awaiting_customer_confirm' added so create-job can collapse the transient
  // estimate_ready waypoint into a single UPDATE (saves 1 round trip).
  analyzing: ['estimate_ready', 'awaiting_customer_confirm', 'draft', 'cancelled'],
  estimate_ready: ['awaiting_customer_confirm'],
  awaiting_customer_confirm: ['broadcasting', 'cancelled'],
  broadcasting: ['worker_matched', 'cancelled'],
  worker_matched: ['worker_on_way', 'cancelled'],
  worker_on_way: ['arrived', 'cancelled'],
  arrived: ['inspecting', 'cancelled'],
  inspecting: ['repairing', 'scope_change_pending', 'cancelled'],
  repairing: ['completed_by_worker', 'scope_change_pending', 'cancelled'],
  scope_change_pending: ['repairing', 'cancelled'],
  completed_by_worker: ['confirmed_by_customer'],
  confirmed_by_customer: ['payment_pending', 'reviewed'],
  payment_pending: ['paid'],
  paid: ['reviewed'],
  reviewed: [],
  cancelled: [],
}

const STATUS_TIMESTAMP_MAP: Partial<Record<JobStatus, string>> = {
  broadcasting: 'broadcast_at',
  worker_matched: 'matched_at',
  arrived: 'arrived_at',
  completed_by_worker: 'completed_at',
  confirmed_by_customer: 'confirmed_at',
  paid: 'paid_at',
  cancelled: 'cancelled_at',
  reviewed: 'reviewed_at',
  estimate_ready: 'estimate_ready_at',
  // awaiting_customer_confirm intentionally omitted: it has no dedicated
  // timestamp column. estimate_ready_at is set by create-job in the same UPDATE.
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  const allowed = VALID_TRANSITIONS[from]
  return allowed?.includes(to) ?? false
}

export function getValidTransitions(from: JobStatus): readonly JobStatus[] {
  return VALID_TRANSITIONS[from] ?? []
}

export function isTerminalStatus(status: JobStatus): boolean {
  const transitions = VALID_TRANSITIONS[status]
  return transitions !== undefined && transitions.length === 0
}

export function getTimestampColumn(status: JobStatus): string | null {
  return STATUS_TIMESTAMP_MAP[status] ?? null
}

export type TransitionResult =
  | { valid: true; timestampColumn: string | null }
  | { valid: false; error: string }

export function validateTransition(
  from: JobStatus,
  to: JobStatus,
): TransitionResult {
  if (isTerminalStatus(from)) {
    return {
      valid: false,
      error: `Trạng thái '${from}' là trạng thái kết thúc, không thể chuyển đổi`,
    }
  }

  if (!canTransition(from, to)) {
    const allowed = getValidTransitions(from)
    return {
      valid: false,
      error: `Không thể chuyển từ '${from}' sang '${to}'. Cho phép: ${allowed.join(', ') || 'không có'}`,
    }
  }

  return { valid: true, timestampColumn: getTimestampColumn(to) }
}

export const WORKER_UPDATABLE_STATUSES: readonly JobStatus[] = [
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'completed_by_worker',
]

export const CUSTOMER_GATE_STATUSES: readonly JobStatus[] = [
  'broadcasting',
  'confirmed_by_customer',
]
