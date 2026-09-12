import { toWorkflowPhase, type LocalDeal } from '@nestscout/shared'

export function isPaymentProtectedStatus(status: NonNullable<LocalDeal['payment']>['status']) {
  return status === 'received' || status === 'cash_confirmed' || status === 'reconciled' ||
    status === 'manual_verified' || status === 'direct_paid'
}

export function isDealPaymentProtected(deal: LocalDeal | null | undefined) {
  if (!deal?.payment || !deal.payment.provider ||
    !['platform_bank_manual', 'sepay_vietqr', 'bank_transfer', 'cash', 'direct_worker'].includes(deal.payment.provider)) return false
  const phase = toWorkflowPhase(deal.backendStatus ?? deal.status)
  return (phase === 'paid' || phase === 'done') && isPaymentProtectedStatus(deal.payment.status)
}
