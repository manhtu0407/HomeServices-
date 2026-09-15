import type { JobStatus } from '../constants'
import type { LocalPaymentStatus } from '../mobile-workflow'
import type { MatchingState } from './api-responses'
import type { ConfirmationOperationReceipt, MatchingSelectionReceipt } from '../contracts/stage1-reliability'

type ConfirmSearchResponse = {
  job_id: string
  status: JobStatus
  broadcast_sent: boolean
  worker: {
    avatar_url: string | null
    display_code?: string | null
    full_name: string
    id: string
    rating: number
    review_count?: number | null
    total_jobs: number
  } | null
  message: string
  matching_state?: MatchingState | null
}

type MatchingPreferenceResponse = ConfirmSearchResponse & {
  matching_state: MatchingState
  selection?: MatchingSelectionReceipt
}

type ConfirmKaelChatResponse = ConfirmSearchResponse & {
  session_id: string
  operation?: ConfirmationOperationReceipt
}

type StatusUpdateResponse = {
  job_id: string
  from_status: JobStatus
  to_status: JobStatus
  updated_at: string
  work_session?: {
    started_at: string | null
    paused_at: string | null
    paused_ms: number
    note: string | null
  }
}

type ConfirmCompletionResponse = {
  job_id: string
  status: JobStatus
  final_price: number | null
}

type PaymentIntentResponse = {
  job_id: string
  status: JobStatus
  payment: {
    provider: 'sepay_vietqr' | 'staging_simulator' | 'platform_bank_manual'
    status: LocalPaymentStatus
    gross_amount: number | null
    platform_fee: number | null
    worker_net: number | null
    payment_code: string | null
    transfer_content: string | null
    qr_image_url: string | null
    expires_at: string | null
    received_at: string | null
    amount_received: number | null
    updated_at: string | null
  }
}

type ManualBankPaymentClaimInput = {
  transferred_at: string
  sending_bank?: string
}

type ManualBankPaymentClaimResponse = {
  job_id: string
  status: 'payment_pending'
  payment_status: 'manual_customer_claimed' | 'manual_reconcile_required'
  transfer_claimed_at: string
  settlement_state: 'customer_claimed' | 'admin_verified'
  salary_visible: true
}

type DirectWorkerPaymentSelectInput = {
  client_request_id: string
}

type DirectWorkerPaymentResponseInput = {
  received: boolean
}

type DirectWorkerPaymentResponse = {
  job_id: string
  status: 'payment_pending' | 'paid'
  direct_status:
    | 'awaiting_customer_confirmation'
    | 'awaiting_worker_confirmation'
    | 'awaiting_admin_confirmation'
    | 'reconcile_required'
    | 'paid'
  collateral_amount?: number
  response_deadline?: string | null
}

type CustomerCancellationResponse = {
  cancellation_id: string
  dispute_id?: string
  refund_state?: 'review_required'
  job_id: string
  status: 'requested'
  job_status: JobStatus
  sub_case:
    | 'before_a7'
    | 'after_a7_before_worker_accept'
    | 'after_worker_accept'
    | 'after_worker_completed_trigger_dispute'
    | 'scheduled_job'
  reason_code: string
  reason_category: string
  admin_review_required: boolean
  phase0_no_monetary_penalty: boolean
  worker_goodwill: Record<string, unknown> | null
  abuse_signals: string[]
  message: string
  created_at: string
}

type DisputeOpenResponse = {
  dispute_id: string
  job_id: string
  status: string
  dispute_type: string
  evidence_snapshot_id: string
  admin_review_required: boolean
  priority: 'low' | 'medium' | 'high' | 'critical'
  evidence_locked_at: string
  message: string
  created_at: string
}

type DisputeCounterStatementResponse = {
  dispute_id: string
  status: string
  counter_party_statement_submitted: boolean
  updated_at: string
}

type DisputeAdminDecisionResponse = {
  dispute_id: string
  status: string
  outcome: string
  decided_at: string
}

export type WorkflowResponses = {
  confirmCompletion: ConfirmCompletionResponse
  confirmKaelChat: ConfirmKaelChatResponse
  confirmSearch: ConfirmSearchResponse
  customerCancellation: CustomerCancellationResponse
  directWorkerPayment: DirectWorkerPaymentResponse
  directWorkerPaymentResponse: DirectWorkerPaymentResponseInput
  directWorkerPaymentSelect: DirectWorkerPaymentSelectInput
  disputeAdminDecision: DisputeAdminDecisionResponse
  disputeCounterStatement: DisputeCounterStatementResponse
  disputeOpen: DisputeOpenResponse
  manualBankPaymentClaim: ManualBankPaymentClaimInput
  manualBankPaymentClaimResponse: ManualBankPaymentClaimResponse
  matchingPreference: MatchingPreferenceResponse
  paymentIntent: PaymentIntentResponse
  statusUpdate: StatusUpdateResponse
}
