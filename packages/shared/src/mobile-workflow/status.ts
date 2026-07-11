import type { JobStatus } from '../constants'

export const LOCAL_WORKFLOW_PRICE_DISCLAIMER =
  'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.'

// Keep server-owned phases intact. UI gates must never infer a customer action
// phase by folding an earlier backend status into a later local status.
export const LOCAL_DEAL_STATUSES = Object.freeze([
  'draft',
  'analyzing',
  'estimate_ready',
  'awaiting_customer_confirm',
  'broadcasting',
  'worker_candidate_pending',
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'scope_change_pending',
  'completed_by_worker',
  'confirmed_by_customer',
  'payment_pending',
  'paid',
  'reviewed',
  'cancelled',
] as const)

export type LocalDealStatus = (typeof LOCAL_DEAL_STATUSES)[number]

export const LOCAL_DEAL_ID = 'local-session-deal'

const LOCAL_DEAL_STATUS_SET = new Set<string>(LOCAL_DEAL_STATUSES)

export function toLocalDealStatus(status: JobStatus): LocalDealStatus {
  switch (status) {
    case 'draft':
    case 'analyzing':
    case 'estimate_ready':
    case 'awaiting_customer_confirm':
    case 'broadcasting':
    case 'worker_candidate_pending':
    case 'worker_matched':
    case 'worker_on_way':
    case 'arrived':
    case 'inspecting':
    case 'repairing':
    case 'scope_change_pending':
    case 'completed_by_worker':
    case 'confirmed_by_customer':
    case 'payment_pending':
    case 'paid':
    case 'reviewed':
    case 'cancelled':
      return status
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

export function isLocalDealStatus(status: JobStatus): status is LocalDealStatus {
  return LOCAL_DEAL_STATUS_SET.has(status)
}
