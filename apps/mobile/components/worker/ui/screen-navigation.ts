import { type LocalDeal } from '@nestscout/shared'
import { WorkerV5ScreenId } from '../dock/types'

export function workerV5JobsDestinationScreenId(deal: LocalDeal | null): WorkerV5ScreenId {
  if (!deal) return '2.1-opportunity-inbox'
  const status = deal.backendStatus ?? deal.status
  if (deal.status === 'broadcasting' && deal.broadcast?.status === 'sent') return '2.2-offer-detail'
  if (status === 'worker_candidate_pending') return '2.3-customer-confirmation-wait'
  if (status === 'worker_matched' || status === 'worker_on_way') return '2.7-in-progress'
  if (status === 'arrived' || status === 'inspecting' || status === 'repairing') return '2.7-in-progress'
  if (status === 'scope_change_pending') return '2.9-approval-wait'
  if (status === 'completed_by_worker' || status === 'confirmed_by_customer') return '2.11-completion-submitted'
  if (
    status === 'payment_pending'
    && deal.payment?.provider === 'direct_worker'
    && !deal.payment.directWorkerConfirmedAt
    && (deal.payment.status === 'direct_awaiting_worker_confirmation'
      || (deal.payment.status === 'direct_awaiting_confirmation' && Boolean(deal.payment.directCustomerConfirmedAt)))
  ) return '2.11-completion-submitted'
  if (
    status === 'reviewed'
    || status === 'payment_pending'
    || status === 'paid'
  ) return '2.12-case-closed'
  return '2.1-opportunity-inbox'
}
