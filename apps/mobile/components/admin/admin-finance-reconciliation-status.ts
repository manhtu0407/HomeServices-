export type FinanceReconciliationCopy = {
  customerClaimedAt: string
  receiptStatus: string
  reconcileRequired: string
  waitingCustomer: string
}

export function reconciliationStatusLabel(status: string, copy: FinanceReconciliationCopy) {
  if (status === 'manual_customer_claimed') return copy.customerClaimedAt
  if (status === 'manual_reconcile_required' || status === 'direct_reconcile_required') return copy.reconcileRequired
  if (status === 'direct_awaiting_customer_confirmation' || status === 'direct_awaiting_worker_confirmation') return copy.waitingCustomer
  return copy.receiptStatus
}
