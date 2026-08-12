import type { AdminCapability, JobStatus, ServiceType, UserRole, WorkerVerificationStatus } from '@nestscout/shared'

export type {
  AdminFinanceBalanceSnapshotInput,
  AdminFinanceBalanceSnapshotResponse,
  AdminFinanceRange,
  AdminFinanceSummaryResponse,
  AdminPaymentReconciliationDecisionInput,
  AdminPaymentReconciliationDecisionResponse,
  AdminPaymentReconciliationListResponse,
  AdminPaymentReconciliationStatus,
  AdminPaymentReconciliationSummary,
} from '@nestscout/shared'

export type AdminViewActor = {
  access_level: 'owner' | 'operator'
  capabilities: AdminCapability[]
}

export type AdminViewOperationsResponse = {
  actor: AdminViewActor
  generated_at: string
  attention: {
    key: 'worker_applications' | 'payment_attention' | 'open_disputes' | 'other_admin_queue'
    target_section: 'operations' | 'workers' | 'transactions'
    count: number
  }[]
  flow: { status: string; count: number }[]
  quality: { key: 'workers_suspended' | 'workers_in_verification'; count: number }[]
  audit_events: {
    id: string
    actor_id: string | null
    actor_name: string | null
    actor_role: string
    action: string
    topic: string | null
    decision: string
    occurred_at: string
  }[]
}

export type AdminViewWorkerApplicationStatus = 'open' | 'acknowledged' | 'resolved' | 'cancelled'

export type AdminViewWorkerApplicationSummary = {
  id: string
  worker_id: string
  status: AdminViewWorkerApplicationStatus
  submitted_at: string
  updated_at: string
  contact_type: 'email' | 'phone' | 'unknown'
  contact_suffix: string | null
  source: string | null
  language: 'vi' | 'en' | null
  account_role: UserRole | null
  full_name: string | null
  phone_masked: string | null
  worker_profile: {
    verification_status: WorkerVerificationStatus
    is_approved: boolean
    is_suspended: boolean
    service_types: ServiceType[]
    districts: string[]
    has_cccd: boolean
    has_selfie: boolean
  } | null
  review: {
    decision: 'approve' | 'request_changes' | 'reject'
    reason: string | null
    decided_at: string
    decided_by_name: string | null
  } | null
}

export type AdminViewWorkerApplicationListResponse = {
  applications: AdminViewWorkerApplicationSummary[]
  has_more: boolean
  next_offset: number | null
  total_count: number | null
}

export type AdminViewWorkerApplicationDecisionInput = {
  decision: 'approve' | 'request_changes' | 'reject'
  reason?: string
}

export type AdminViewWorkerApplicationDecisionResponse = {
  ok: true
  application_id: string
  worker_id: string
  decision: AdminViewWorkerApplicationDecisionInput['decision']
  status: Exclude<AdminViewWorkerApplicationStatus, 'cancelled'>
  role: UserRole
  verification_status: WorkerVerificationStatus | null
  decided_at: string
}

export type AdminViewWorkerAccessInput = {
  action: 'suspend' | 'reinstate'
  reason: string
}

export type AdminViewWorkerAccessResponse = {
  ok: true
  worker_id: string
  verification_status: WorkerVerificationStatus
  is_suspended: boolean
  decided_at: string
}

export type AdminViewSubAdminSummary = {
  user_id: string
  full_name: string | null
  phone_masked: string | null
  baseline_role: 'customer' | 'worker'
  status: 'active' | 'revoked'
  capabilities: AdminCapability[]
  granted_at: string
  updated_at: string
  last_activity_at: string | null
}

export type AdminViewSubAdminListResponse = {
  actor: AdminViewActor
  members: AdminViewSubAdminSummary[]
  nominations: AdminViewManagerNominationSummary[]
}

export type AdminViewSubAdminAccountCandidate = {
  user_id: string
  full_name: string | null
  phone_masked: string | null
  role: 'customer' | 'worker'
}

export type AdminViewSubAdminAccountSearchResponse = {
  accounts: AdminViewSubAdminAccountCandidate[]
}

export type AdminViewManagerNominationSummary = {
  id: string
  user_id: string
  full_name: string | null
  phone_masked: string | null
  role: 'customer' | 'worker'
  nominated_at: string
}

export type AdminViewManagerNominationResponse = {
  ok: true
  nomination: AdminViewManagerNominationSummary
}

export type AdminViewManagerNominationCancellationResponse = {
  ok: true
  nomination_id: string
}

export type AdminViewSubAdminAccessInput = {
  action: 'grant' | 'update' | 'revoke'
  capabilities: AdminCapability[]
  reason?: string
}

export type AdminViewSubAdminAccessResponse = {
  ok: true
  user_id: string
  status: 'active' | 'revoked'
  role: UserRole
  capabilities: AdminCapability[]
  updated_at: string
}

export type AdminViewTransactionSummary = {
  job_id: string
  display_code: string
  service_type: ServiceType
  status: JobStatus
  payment_status: string | null
  payment_provider: string | null
  gross_amount: number | null
  platform_fee: number | null
  worker_net: number | null
  customer_name: string | null
  worker_name: string | null
  dispute_status: string | null
  updated_at: string
  paid_at: string | null
}

export type AdminViewTransactionListResponse = {
  transactions: AdminViewTransactionSummary[]
  has_more: boolean
  next_offset: number | null
  total_count: number | null
}

export type AdminViewTransactionDetailResponse = {
  transaction: AdminViewTransactionSummary
  timeline: {
    key: 'created' | 'payment_updated' | 'paid' | 'ledger_recorded' | 'dispute_opened'
    occurred_at: string
    label_key: 'created' | 'payment_updated' | 'paid' | 'ledger_recorded' | 'dispute_opened'
  }[]
  ledger: {
    created_at: string
    payment_state: string | null
    available_at: string | null
    gross_amount: number
    platform_fee: number
    worker_net: number
    commission_level: number | null
    commission_rate_bps: number | null
    sepay_transaction_suffix: string | null
    sepay_reference_suffix: string | null
  } | null
}

export type AdminViewGovernanceListInput = {
  limit?: number
  offset?: number
}

export type AdminViewDisputeSummary = {
  id: string
  job_id: string
  display_code: string
  dispute_type: string
  initiated_by: string
  status: string
  created_at: string
  updated_at: string
  decided_at: string | null
}

export type AdminViewDisputeListResponse = {
  disputes: AdminViewDisputeSummary[]
  has_more: boolean
  next_offset: number | null
  total_count: number
}

export type AdminViewPriceBaselineSummary = {
  id: string
  service_type: ServiceType
  complexity: string
  district_code: string
  price_min: number
  price_max: number
  source: string
  version: number
  updated_at: string
}

export type AdminViewPriceBaselineListResponse = {
  price_baselines: AdminViewPriceBaselineSummary[]
  has_more: boolean
  next_offset: number | null
  total_count: number
}

export type AdminViewAiCostSummary = {
  day: string
  purpose: string
  provider: string
  call_count: number
  success_count: number
  failure_count: number
  fallback_count: number
  total_cost_usd: number
  avg_latency_ms: number | null
  p95_latency_ms: number | null
  failure_rate: number | null
}

export type AdminViewAiCostListResponse = {
  costs: AdminViewAiCostSummary[]
  has_more: boolean
  next_offset: number | null
  total_count: number
}

export type AdminViewLearningRuleSummary = {
  id: string
  rule_type: string
  affected_service: ServiceType | null
  affected_problem: string | null
  affected_district: string | null
  confidence: number
  evidence_count: number
  status: string
  active_version: number
  rollback_available: boolean
  updated_at: string
}

export type AdminViewLearningRuleListResponse = {
  rules: AdminViewLearningRuleSummary[]
  has_more: boolean
  next_offset: number | null
  total_count: number
}

export type AdminViewPayoutMethodStatus = 'pending_verification' | 'verified' | 'rejected'
export type AdminViewWithdrawalRequestStatus = 'pending' | 'processing' | 'paid' | 'rejected' | 'failed'

export type AdminViewPayoutMethodSummary = {
  id: string
  worker_id: string
  worker_name: string | null
  bank_key: string
  bank_name: string
  bank_account_masked: string
  status: AdminViewPayoutMethodStatus
  reviewed_at: string | null
  review_reason: string | null
  created_at: string
  updated_at: string
}

export type AdminViewPayoutMethodListResponse = {
  payout_methods: AdminViewPayoutMethodSummary[]
  has_more: boolean
  next_offset: number | null
  total_count: number | null
}

export type AdminViewPayoutMethodDetailResponse = {
  payout_method: AdminViewPayoutMethodSummary & {
    account_holder_name: string
    bank_account: string
  }
}

export type AdminViewPayoutMethodDecisionInput = {
  decision: 'verify' | 'reject'
  reason?: string
}

export type AdminViewPayoutMethodDecisionResponse = {
  ok: true
  payout_method_id: string
  status: Exclude<AdminViewPayoutMethodStatus, 'pending_verification'>
  reviewed_at: string
}

export type AdminViewWithdrawalRequestSummary = {
  id: string
  worker_id: string
  worker_name: string | null
  amount_vnd: number
  available_balance_before_vnd: number
  bank_key: string
  bank_name: string
  bank_account_masked: string
  status: AdminViewWithdrawalRequestStatus
  requested_at: string
  processing_at: string | null
  processing_by_name: string | null
  processed_at: string | null
  processed_by_name: string | null
  transfer_reference: string | null
  resolution_reason: string | null
  updated_at: string
}

export type AdminViewWithdrawalRequestListResponse = {
  withdrawal_requests: AdminViewWithdrawalRequestSummary[]
  has_more: boolean
  next_offset: number | null
  total_count: number | null
}

export type AdminViewWithdrawalRequestDetailResponse = {
  withdrawal_request: AdminViewWithdrawalRequestSummary & {
    account_holder_name: string
    bank_account: string
  }
}

export type AdminViewWithdrawalRequestClaimResponse = {
  ok: true
  request_id: string
  status: 'processing'
  processing_by: string
  processing_at: string
}

export type AdminViewWithdrawalRequestResolveInput = {
  decision: 'paid' | 'rejected' | 'failed'
  transfer_reference?: string
  reason?: string
}

export type AdminViewWithdrawalRequestResolveResponse = {
  ok: true
  request_id: string
  status: 'paid' | 'rejected' | 'failed'
  processed_at: string
}
