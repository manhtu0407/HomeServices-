import type { AdminCapability, JobStatus, ScopeChangeStatus, ServiceType, UserRole, WorkerVerificationStatus } from '@nestscout/shared'

export type {
  AdminViewAiCostListResponse,
  AdminViewAiCostSummary,
  AdminViewLearningRuleListResponse,
  AdminViewLearningRuleSummary,
  AdminViewPriceBaselineListResponse,
  AdminViewPriceBaselineSummary,
} from './admin-system'

export type {
  AdminFinanceBalanceSnapshotInput,
  AdminFinanceBalanceSnapshotListResponse,
  AdminFinanceBalanceSnapshotResponse,
  AdminFinanceCsvExportResponse,
  AdminFinanceOverviewResponse,
  AdminFinancePeriodInput,
  AdminFinanceRange,
  AdminFinanceSummaryResponse,
  AdminFinanceTaxPolicy,
  AdminFinanceTaxPolicyApproveInput,
  AdminFinanceTaxPolicyDraftInput,
  AdminFinanceTaxPolicyListResponse,
  AdminFinanceTaxPolicyRetireInput,
  AdminFinanceTransaction,
  AdminFinanceTransactionFilters,
  AdminFinanceTransactionListResponse,
  AdminFinanceTransactionDetailResponse,
  AdminPaymentReconciliationAssignmentResponse,
  AdminPaymentReconciliationClaimInput,
  AdminPaymentReconciliationDecisionInput,
  AdminPaymentReconciliationDecisionResponse,
  AdminPaymentReconciliationListResponse,
  AdminPaymentReconciliationListInput,
  AdminPaymentReconciliationDetailResponse,
  AdminPaymentReconciliationReleaseInput,
  AdminPaymentReconciliationStatus,
  AdminPaymentReconciliationSummary,
  AdminWorkerFinanceSnapshotResponse,
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

export type AdminViewScopeChangeListInput = {
  cursor?: string
  limit?: number
  query?: string
  requested_from?: string
  requested_to?: string
  request_timing?: 'all' | 'pre_arrival' | 'on_site'
  service_type?: ServiceType | 'all'
  status?: ScopeChangeStatus | 'all'
}

export type AdminViewScopeChangeSummary = {
  scope_change_id: string
  job_id: string
  display_code: string
  service_type: ServiceType
  status: ScopeChangeStatus
  updated_at: string
  delta_min_vnd: number | null
  delta_max_vnd: number | null
}

export type AdminViewScopeChangeListResponse = {
  generated_at: string
  counts: {
    kael_processing: number
    waiting_customer: number
    approved: number
    rejected_or_cancelled: number
  }
  records: AdminViewScopeChangeSummary[]
  has_more: boolean
  next_cursor: string | null
}

export type AdminViewEvidenceMetadata = {
  evidence_id: string
  kind: 'photo' | 'document' | 'chat' | 'snapshot'
  label: string
  captured_at: string | null
}

export type AdminViewCaseTimelineEntry = {
  key: string
  label: string
  occurred_at: string
}

export type AdminViewScopeChangeDetailResponse = {
  generated_at: string
  summary: AdminViewScopeChangeSummary
  original_scope: {
    description: string | null
    price_min_vnd: number | null
    price_max_vnd: number | null
  }
  proposed_scope: {
    description: string
    reason: string
    request_timing: 'pre_arrival' | 'on_site'
    requested_at: string
    customer_decision_at: string | null
  }
  pricing: {
    kael_min_vnd: number | null
    kael_max_vnd: number | null
    total_min_vnd: number | null
    total_max_vnd: number | null
  }
  evidence: AdminViewEvidenceMetadata[]
  timeline: AdminViewCaseTimelineEntry[]
  price_receipt: Record<string, unknown> | null
  related_dispute: {
    dispute_id: string
    dispute_type: string
    status: string
  } | null
}

export const ADMIN_VIEW_SUPPORT_QUEUE_TYPES = [
  'demanding_customer',
  'worker_cancellation_review',
  'worker_no_show',
  'customer_cancellation_review',
  'disintermediation_risk',
  'autonomy_escalation',
] as const

export type AdminViewSupportQueueType = (typeof ADMIN_VIEW_SUPPORT_QUEUE_TYPES)[number]
export type AdminViewSupportCaseSource = 'dispute' | 'queue'
export type AdminViewSupportPreparationStatus = 'new' | 'acknowledged' | 'in_review' | 'ready'

export type AdminViewSupportChecklist = {
  opening_request_reviewed: boolean
  counterparty_response_reviewed_or_missing: boolean
  locked_evidence_reviewed: boolean
  job_timeline_reviewed: boolean
  scope_and_payment_reviewed: boolean
  ready_for_next_step: boolean
}

export type AdminViewSupportPreparation = {
  status: AdminViewSupportPreparationStatus
  checklist: AdminViewSupportChecklist
  assigned_to: string | null
  assigned_to_name: string | null
  version: number
  updated_at: string | null
  can_edit: boolean
  assigned_to_me: boolean
}

export type AdminViewSupportCaseListInput = {
  assignee?: 'all' | 'unassigned' | 'mine'
  cursor?: string
  limit?: number
  preparation_status?: AdminViewSupportPreparationStatus | 'all'
  priority?: 'all' | 'low' | 'medium' | 'high' | 'critical'
  query?: string
  service_type?: ServiceType | 'all'
  source_status?: string | 'all'
  type?: 'all' | 'dispute' | AdminViewSupportQueueType
}

export type AdminViewSupportCaseSummary = {
  source: AdminViewSupportCaseSource
  case_id: string
  type: 'dispute' | AdminViewSupportQueueType
  job_id: string | null
  display_code?: string | null
  service_type?: ServiceType | null
  priority: 'low' | 'medium' | 'high' | 'critical'
  source_status: string
  preparation_status?: AdminViewSupportPreparationStatus
  assigned_to?: string | null
  reason_code: string
  deadline_at?: string | null
  updated_at: string
}

export type AdminViewSupportCaseListResponse = {
  generated_at: string
  counts: { key: string; count: number }[]
  records: AdminViewSupportCaseSummary[]
  has_more: boolean
  next_cursor: string | null
}

export type AdminViewSupportCaseNote = {
  note_id: string
  body: string
  author_name: string | null
  created_at: string
}

export type AdminViewSupportCaseDetailResponse = {
  generated_at: string
  summary: AdminViewSupportCaseSummary
  neutral_summary: string
  parties: { role: string; name: string | null; contact_masked: string | null }[]
  opening_statement: string | null
  counterparty_statement: string | null
  evidence: AdminViewEvidenceMetadata[]
  timeline: AdminViewCaseTimelineEntry[]
  abuse_signals: string[]
  recorded_decision: Record<string, unknown> | null
  preparation: AdminViewSupportPreparation
  notes: AdminViewSupportCaseNote[]
}

export type AdminViewSupportPreparationInput = {
  expected_version: number
  idempotency_key: string
  assignment?: 'claim' | 'unclaim' | 'keep'
  status?: AdminViewSupportPreparationStatus
  checklist?: Partial<AdminViewSupportChecklist>
  note?: string
}

export type AdminViewEvidenceAccessInput = { evidence_id: string }
export type AdminViewEvidenceAccessResponse = {
  evidence_id: string
  signed_url: string
  expires_at: string
}

export type AdminViewOverviewDetailKey =
  | 'coordination'
  | 'assigned'
  | 'inService'
  | 'finishing'
  | 'other'
  | 'worker_applications'
  | 'payment_attention'
  | 'open_disputes'
  | 'other_admin_queue'
  | 'workers_in_verification'
  | 'workers_suspended'

export type AdminViewOverviewBreakdown = { key: string; count: number }

export type AdminViewOverviewJobRecord = {
  kind: 'job'
  job_id: string
  display_code: string
  service_type: ServiceType
  status: string
  updated_at: string
}

export type AdminViewOverviewApplicationRecord = {
  kind: 'application'
  application_id: string
  worker_id: string
  name: string | null
  contact_masked: string | null
  stage: AdminViewWorkerReviewStage
  checklist: { completed_count: number; total_count: number; missing: string[] }
  service_types: ServiceType[]
  updated_at: string
}

export type AdminViewOverviewWorkerRecord = {
  kind: 'worker'
  worker_id: string
  name: string | null
  service_types: ServiceType[]
  state: string
  updated_at: string
}

export type AdminViewOverviewPaymentRecord = {
  kind: 'payment'
  job_id: string
  display_code: string
  service_type: ServiceType
  payment_status: string
  updated_at: string
}

export type AdminViewOverviewDisputeRecord = {
  kind: 'dispute'
  dispute_id: string
  job_id: string
  display_code: string
  dispute_type: string
  status: string
  updated_at: string
}

export type AdminViewOverviewQueueRecord = {
  kind: 'queue'
  queue_id: string
  queue_type: string
  status: string
  updated_at: string
}

export type AdminViewOverviewDetailRecord =
  | AdminViewOverviewJobRecord
  | AdminViewOverviewApplicationRecord
  | AdminViewOverviewWorkerRecord
  | AdminViewOverviewPaymentRecord
  | AdminViewOverviewDisputeRecord
  | AdminViewOverviewQueueRecord

type AdminViewOverviewDetailsCommon = {
  generated_at: string
  total_count: number
  status_breakdown: AdminViewOverviewBreakdown[]
  service_breakdown: AdminViewOverviewBreakdown[]
  oldest_updated_at: string | null
  has_more: boolean
  next_cursor: string | null
}

type AdminViewOverviewRecordByKey = {
  coordination: AdminViewOverviewJobRecord
  assigned: AdminViewOverviewJobRecord
  inService: AdminViewOverviewJobRecord
  finishing: AdminViewOverviewJobRecord
  other: AdminViewOverviewJobRecord
  worker_applications: AdminViewOverviewApplicationRecord
  payment_attention: AdminViewOverviewPaymentRecord
  open_disputes: AdminViewOverviewDisputeRecord
  other_admin_queue: AdminViewOverviewQueueRecord
  workers_in_verification: AdminViewOverviewWorkerRecord
  workers_suspended: AdminViewOverviewWorkerRecord
}

export type AdminViewOverviewDetailsResponse = {
  [Key in AdminViewOverviewDetailKey]: AdminViewOverviewDetailsCommon & {
    key: Key
    records: AdminViewOverviewRecordByKey[Key][]
  }
}[AdminViewOverviewDetailKey]

export type AdminViewWorkerApplicationStatus = 'open' | 'acknowledged' | 'resolved' | 'cancelled'
export type AdminViewWorkerReviewStage = 'pending_access' | 'missing_profile' | 'ready_verification' | 'verified'

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
  stage: AdminViewWorkerReviewStage
  checklist: { completed_count: number; total_count: number; missing: string[] }
  profile_review_queue_id: string | null
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
  next_cursor: string | null
  total_count: number | null
}

export type AdminViewWorkerReviewDetail = {
  application: AdminViewWorkerApplicationSummary
  login_gates: { email: string | null; phone: string | null; full_name: string | null; created_at: string | null }
  profile: {
    legal_name: string | null
    date_of_birth: string | null
    gender: string | null
    service_types: ServiceType[]
    years_experience: number
    districts: string[]
    service_radius_km: number | null
    problem_specializations: string[]
    bank_account: string | null
    bank_name: string | null
    documents: { cccd_front_url: string | null; cccd_back_url: string | null; selfie_url: string | null; expires_at: string | null }
  } | null
  history: { stage: 'access' | 'profile'; decision: 'approve' | 'request_changes' | 'reject'; reason: string | null; decided_at: string; decided_by_name: string | null }[]
}

export type AdminViewWorkerProfileDecisionInput = { decision: 'approve' | 'request_changes'; reason?: string }
export type AdminViewWorkerProfileDecisionResponse = {
  ok: true
  application_id: string
  worker_id: string
  decision: AdminViewWorkerProfileDecisionInput['decision']
  verification_status: WorkerVerificationStatus
  decided_at: string
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
  version: number
  granted_at: string
  updated_at: string
  last_activity_at: string | null
}

export type AdminViewSubAdminListInput = {
  limit?: number
  cursor?: string
}

export type AdminViewSubAdminListResponse = {
  actor: AdminViewActor
  generated_at: string
  total_count: number
  members: AdminViewSubAdminSummary[]
  nominations: AdminViewManagerNominationSummary[]
  pending_accounts: AdminViewOperatorProvisioningSummary[]
  has_more: boolean
  next_cursor: string | null
}

export type AdminViewOperatorProvisioningSummary = {
  id: string
  full_name: string
  email_masked: string
  status: 'pending_password_change' | 'active' | 'failed'
  capabilities: AdminCapability[]
  created_at: string
  updated_at: string
  last_activity_at: string | null
}

export type AdminViewOperatorProvisionInput = {
  full_name: string
  email: string
  initial_password: string
  capabilities: AdminCapability[]
}

export type AdminViewOperatorProvisionResponse = { ok: true; account: AdminViewOperatorProvisioningSummary }
export type AdminViewOperatorResetPasswordResponse = { ok: true; provisioning_id: string; updated_at: string }

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
  client_request_id: string
  expected_version: number
  reason?: string
}

export type AdminViewSubAdminAccessResponse = {
  ok: true
  user_id: string
  status: 'active' | 'revoked'
  role: UserRole
  capabilities: AdminCapability[]
  version: number
  event_id: string
  generated_at: string
  replayed: boolean
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
  version: number
}

export type AdminViewPayoutMethodListResponse = {
  generated_at: string
  payout_methods: AdminViewPayoutMethodSummary[]
  has_more: boolean
  next_cursor: string | null
  total_count: number | null
}

export type AdminViewPayoutMethodDetailResponse = {
  generated_at: string
  payout_method: AdminViewPayoutMethodSummary
}

export type AdminViewSensitivePayoutAccessInput = { reason: string }
export type AdminViewSensitivePayoutAccessResponse = {
  expires_at: string
  account_holder_name: string
  bank_account: string
}

export type AdminViewPayoutMethodDecisionInput = {
  decision: 'verify' | 'reject'
  reason?: string
  expected_version: number
  client_request_id: string
}

export type AdminViewPayoutMethodDecisionResponse = {
  ok: true
  payout_method_id: string
  status: Exclude<AdminViewPayoutMethodStatus, 'pending_verification'>
  reviewed_at: string
  version: number
  generated_at: string
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
  eligible_at?: string | null
  processing_at: string | null
  processing_by_name: string | null
  processing_by_me: boolean
  processed_at: string | null
  processed_by_name: string | null
  transfer_reference_suffix: string | null
  resolution_reason: string | null
  updated_at: string
  version: number
}

export type AdminViewWithdrawalRequestListResponse = {
  generated_at: string
  withdrawal_requests: AdminViewWithdrawalRequestSummary[]
  has_more: boolean
  next_cursor: string | null
  total_count: number | null
}

export type AdminViewWithdrawalRequestDetailResponse = {
  generated_at: string
  withdrawal_request: AdminViewWithdrawalRequestSummary
}

export type AdminViewWithdrawalRequestClaimInput = {
  expected_version: number
  client_request_id: string
  takeover_reason?: string
}

export type AdminViewWithdrawalRequestClaimResponse = {
  ok: true
  request_id: string
  status: 'processing'
  processing_by: string
  processing_at: string
  version: number
  generated_at: string
}

export type AdminViewWithdrawalRequestResolveInput = {
  decision: 'paid' | 'rejected' | 'failed'
  transfer_reference?: string
  reason?: string
  external_transfer_confirmed?: true
  expected_version: number
  client_request_id: string
}

export type AdminViewWithdrawalRequestResolveResponse = {
  ok: true
  request_id: string
  status: 'paid' | 'rejected' | 'failed'
  processed_at: string
  version: number
  event_id: string
  generated_at: string
}

export type AdminViewWithdrawalRequestReleaseInput = {
  expected_version: number
  client_request_id: string
  reason: string
}

export type AdminViewWithdrawalRequestReleaseResponse = {
  ok: true
  request_id: string
  status: 'pending'
  version: number
  generated_at: string
}
