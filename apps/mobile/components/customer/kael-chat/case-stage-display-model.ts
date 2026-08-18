import type { AppLanguage } from '@/lib/app-language'
import type { LocalDealStatus } from '@nestscout/shared'
import { formatNumber } from './case-work-display-model'
import type { CustomerV21ScreenId } from '../ui/types'

export function formatKnownCount(value: number | null | undefined, language: AppLanguage) {
  if (typeof value === 'number') return formatNumber(value, language)
  return '0'
}
export function stepForStatus(status: LocalDealStatus) {
  if (status === 'draft' || status === 'analyzing' || status === 'estimate_ready' || status === 'awaiting_customer_confirm') return 1
  if (status === 'broadcasting' || status === 'worker_candidate_pending' || status === 'worker_matched' || status === 'worker_on_way') return 2
  if (status === 'arrived' || status === 'inspecting' || status === 'repairing' || status === 'scope_change_pending') return 3
  return 4
}

export function screenIdsForStatus(status: LocalDealStatus): CustomerV21ScreenId[] {
  if (status === 'broadcasting') return ['2.7-matching']
  if (status === 'worker_matched') return ['2.10-location-eta', '2.12-job-accepted']
  if (status === 'worker_on_way') return ['2.10-location-eta', '2.11-live-alert']
  if (status === 'arrived' || status === 'inspecting') return ['2.12-job-accepted']
  if (status === 'repairing' || status === 'scope_change_pending') return ['2.13-job-progress']
  if (status === 'completed_by_worker') return ['2.13-job-progress']
  if (status === 'payment_pending' || status === 'paid') return ['2.13-job-progress', '3.3-payment-protected']
  if (status === 'confirmed_by_customer' || status === 'reviewed') return ['2.13-job-progress']
  if (status === 'awaiting_customer_confirm') return ['2.8-options', '2.9-quotes']
  return ['2.6-case-overview']
}
