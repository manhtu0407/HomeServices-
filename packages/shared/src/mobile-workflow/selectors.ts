import { validateLocalDealDraft } from './draft'
import {
  canCancelLocalDeal,
  canSubmitCustomerReview,
  NEXT_WORKER_STATUS,
} from './reducer'
import type {
  LocalCustomerSearchState,
  LocalWorkflowSelectors,
  LocalWorkflowState,
} from './types'

export function selectLocalWorkflow(state: LocalWorkflowState): LocalWorkflowSelectors {
  const deal = state.deal
  const status = deal?.status ?? null
  const broadcast = deal?.broadcast ?? null
  const customerSearchState: LocalCustomerSearchState =
    !deal
      ? 'idle'
      : status === 'broadcasting' && (broadcast?.status === 'declined' || broadcast?.status === 'expired')
        ? 'no_worker'
        : status === 'broadcasting'
          ? 'searching'
          : status === 'worker_candidate_pending'
            ? 'candidate'
          : status === 'worker_matched'
            ? 'matched'
            : status === 'completed_by_worker' || status === 'confirmed_by_customer' || status === 'payment_pending' || status === 'paid' || status === 'reviewed'
              ? 'completed'
              : status && ['worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending'].includes(status)
                ? 'active'
                : 'idle'
  const hasWorkerActionGate = state.workerGate === 'local_deal_audit' || state.workerGate === 'remote_backend'
  const backendStatus = deal?.backendStatus ?? status
  const canCustomerSubmitReview = Boolean(deal && canSubmitCustomerReview(deal))

  return {
    currentStatus: status,
    currentBackendStatus: backendStatus,
    scheduleMode: 'now_only',
    customerSearchState,
    hasLocalBroadcast: Boolean(broadcast),
    canConfirmCustomerSearch: false,
    canWorkerAccept: hasWorkerActionGate && status === 'broadcasting' && broadcast?.status === 'sent',
    canWorkerAdvance:
      hasWorkerActionGate &&
      broadcast?.status === 'accepted' &&
      Boolean(status && NEXT_WORKER_STATUS[status]),
    canWorkerSeeFullAddress: Boolean(broadcast?.status === 'accepted' && broadcast.fullAddressVisible && broadcast.fullAddressLabel),
    canCustomerCancelDeal: Boolean(deal && canCancelLocalDeal(deal.status)),
    // Kael Autonomy v2: customer completion is input/evidence, not the
    // default final authority in the UI. The reducer action stays for legacy
    // recovery tests and backend parity, but selectors keep it off-screen.
    canCustomerConfirmCompletion: false,
    canCustomerSubmitReview,
    paymentLocked: true,
    reviewLocked: !canCustomerSubmitReview,
    draftValidationMessage: deal ? validateLocalDealDraft(deal.draft) : null,
  }
}
