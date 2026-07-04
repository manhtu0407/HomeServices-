import type { JobStatus } from '../constants'

export const LOCAL_WORKFLOW_PRICE_DISCLAIMER =
  'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.'

// Local workflow keeps only statuses that create visible customer/worker UI
// states. Backend-only settlement markers are folded by toLocalDealStatus():
// estimate_ready folds into the legacy awaiting_customer_confirm status for
// old rows, but UI copy treats that state as Kael orchestration rather than a
// customer gate. payment_pending/paid -> confirmed_by_customer keeps mobile
// honest while payment rails remain outside the visible mobile workflow.
export const LOCAL_DEAL_STATUSES = Object.freeze([
  'draft',
  'analyzing',
  'awaiting_customer_confirm',
  'broadcasting',
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'scope_change_pending',
  'completed_by_worker',
  'confirmed_by_customer',
  'reviewed',
  'cancelled',
] as const)

export type LocalDealStatus = (typeof LOCAL_DEAL_STATUSES)[number]

export const LOCAL_DEAL_ID = 'local-session-deal'

const LOCAL_DEAL_STATUS_SET = new Set<string>(LOCAL_DEAL_STATUSES)

export function toLocalDealStatus(status: JobStatus): LocalDealStatus {
  switch (status) {
    case 'estimate_ready':
      return 'awaiting_customer_confirm'
    case 'payment_pending':
    case 'paid':
      return 'confirmed_by_customer'
    case 'draft':
    case 'analyzing':
    case 'awaiting_customer_confirm':
    case 'broadcasting':
    case 'worker_matched':
    case 'worker_on_way':
    case 'arrived':
    case 'inspecting':
    case 'repairing':
    case 'scope_change_pending':
    case 'completed_by_worker':
    case 'confirmed_by_customer':
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
