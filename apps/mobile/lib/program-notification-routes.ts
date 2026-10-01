// Discipline and compensation notices open the screen that owns the decision, not the job the
// case came from: the job screen has no compensation or violation controls. The Edge program
// push dispatcher writes the same two routes as the push deep link.
export const customerCompensationRoute = '/(customer)/history?section=compensation'
export const workerViolationsRoute = '/(worker)/earnings?ns_worker_screen=4.7-violations'

const customerCompensationEvents = new Set([
  'violation_confirmed_customer',
  'compensation_counter_offer',
  'compensation_agreed',
  'compensation_declined',
  'compensation_paid',
])

const workerViolationEvents = new Set([
  'violation_confirmed',
  'violation_appeal_upheld',
  'violation_appeal_overturned',
  'withdrawal_hold_extended',
  'compensation_claim_received',
  'compensation_counter_offer',
  'compensation_agreed',
  'compensation_declined',
  'compensation_paid',
])

export function isCustomerCompensationNotification(eventType: string) {
  return customerCompensationEvents.has(eventType)
}

export function isWorkerViolationNotification(eventType: string) {
  return workerViolationEvents.has(eventType)
}
