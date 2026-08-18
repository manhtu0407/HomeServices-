export type AdminFinanceRange = 'day' | 'week' | 'month' | 'year'

export type AdminPaymentReconciliationStatus = 'pending' | 'reconcile_required' | 'all'

export type AdminPaymentReconciliationSummary = {
  id: string
  job_id: string
  payment_method: 'platform_bank_manual' | 'direct_worker'
  status: string
  gross_amount: number
  worker_id?: string
  platform_fee?: number
  worker_net?: number
  settlement_state?: 'pending' | 'customer_claimed' | 'admin_verified' | 'admin_rejected'
  amount_received: number | null
  customer_transfer_claimed_at: string | null
  response_deadline: string | null
  created_at: string
  updated_at: string
}

export type AdminPaymentReconciliationListResponse = {
  payment_reconciliations: AdminPaymentReconciliationSummary[]
  has_more: boolean
  next_offset: number | null
}

export type AdminPaymentReconciliationDecisionInput = {
  decision: 'confirm' | 'reconcile_required' | 'direct_paid' | 'direct_release' | 'cash_confirm' | 'cash_reject'
  amount_received?: number
  bank_reference?: string
  credited_at?: string
  reason?: string
}

export type AdminPaymentReconciliationDecisionResponse = {
  ok: true
  payment_order_id: string
  outcome: 'paid' | 'reconcile_required' | 'direct_reconcile_required' | 'confirmed' | 'rejected'
  job_id: string
  status: 'payment_pending' | 'paid'
  payment_status: string
  hold_until: string | null
}

export type AdminWorkerFinanceSnapshotResponse = {
  worker_id: string
  total_jobs_paid: number
  gross_earnings: number
  platform_fee_total: number
  net_earnings: number
  available_balance: number
  withdrawal_reserved_amount: number
  withdrawn_total: number
  cash_commission_collected_total: number
  cash_commission_due_total: number
  pending_payment_count: number
  pending_payment_amount: number
  provisional_payment_count: number
  provisional_payment_amount: number
  on_hold_amount: number
  current_commission_level: number
  current_commission_rate_bps: number
  withdrawal_eligible_at: string | null
  recent_transactions: {
    job_id: string
    display_code: string | null
    entry_type: 'worker_credit' | 'cash_commission_debit'
    payment_state: 'pending' | 'available' | 'on_hold' | 'reversed' | 'cash_collected' | 'cash_reconciliation_due'
    settlement_state: 'pending' | 'customer_claimed' | 'admin_verified' | 'admin_rejected'
    gross_amount: number
    platform_fee: number
    worker_net: number
    commission_level: number
    commission_rate_bps: number
    cash_commission_collected: number
    cash_commission_due: number
    recorded_at: string
    available_at: string | null
  }[]
  daily_earnings: {
    date: string
    gross_earnings: number
    platform_fee_total: number
    net_earnings: number
    paid_job_count: number
  }[]
  from_date: string | null
  to_date: string | null
}

export type AdminFinanceSummaryResponse = {
  range: AdminFinanceRange
  from: string
  to: string
  platform_incoming: number
  payout_outflow: number
  commission_accrued: number
  commission_collected: number
  commission_receivable: number
  worker_hold: number
  worker_available: number
  payout_pending: number
  direct_payment_total: number
  opening_balance: number | null
  closing_balance: number | null
  expected_bank_change: number | null
  actual_bank_change: number | null
  unexplained_variance: number | null
}

export type AdminFinanceBalanceSnapshotInput = {
  balance_vnd: number
  observed_at: string
}

export type AdminFinanceBalanceSnapshotResponse = {
  snapshot_id: string
  balance_vnd: number
  observed_at: string
}

export type AdminFinancePeriodInput = {
  range?: AdminFinanceRange
  anchor?: string
  from?: string
  to?: string
}

export type AdminFinanceDataQuality = 'available' | 'partial' | 'unavailable'

export type AdminFinanceTrendDirection = 'up' | 'down' | 'flat' | 'unavailable'

export type AdminFinanceComparableMetric = {
  value: number | null
  previous_value: number | null
  change_value: number | null
  change_percent: number | null
  direction: AdminFinanceTrendDirection
  data_quality: AdminFinanceDataQuality
  unavailable_reason: string | null
}

export type AdminFinanceSnapshotMetric = {
  value: number | null
  data_quality: AdminFinanceDataQuality
  unavailable_reason: string | null
}

export type AdminFinanceOverviewResponse = {
  preset: AdminFinanceRange | 'custom'
  from: string
  to: string
  previous_from: string
  previous_to: string
  data_quality: AdminFinanceDataQuality
  metrics: {
    gmv_vnd: AdminFinanceComparableMetric
    paid_jobs: AdminFinanceComparableMetric
    average_order_value_vnd: AdminFinanceComparableMetric
    commission_accrued_vnd: AdminFinanceComparableMetric
    commission_collected_vnd: AdminFinanceComparableMetric
    commission_receivable_vnd: AdminFinanceComparableMetric
    business_kept_vnd: AdminFinanceComparableMetric
    platform_incoming_vnd: AdminFinanceComparableMetric
    payout_outflow_vnd: AdminFinanceComparableMetric
    net_cash_flow_vnd: AdminFinanceComparableMetric
    refund_completed_vnd: AdminFinanceComparableMetric
    kael_ai_cost_usd: AdminFinanceComparableMetric
    tax_estimate_vnd: AdminFinanceComparableMetric
  }
  current_balances: {
    worker_hold_vnd: AdminFinanceSnapshotMetric
    worker_available_vnd: AdminFinanceSnapshotMetric
    payout_pending_vnd: AdminFinanceSnapshotMetric
  }
  bank_reconciliation: {
    opening_balance_vnd: AdminFinanceSnapshotMetric
    closing_balance_vnd: AdminFinanceSnapshotMetric
    expected_change_vnd: AdminFinanceSnapshotMetric
    actual_change_vnd: AdminFinanceSnapshotMetric
    unexplained_variance_vnd: AdminFinanceSnapshotMetric
  }
  trend: AdminFinanceTrendPoint[]
  payment_methods: AdminFinancePaymentMethodBreakdown[]
  services: AdminFinanceServiceBreakdown[]
  tax_policy_ids: string[]
}

export type AdminFinanceTrendPoint = {
  bucket_start: string
  bucket_end: string
  gmv_vnd: number | null
  commission_collected_vnd: number | null
  paid_jobs: number | null
  data_quality: AdminFinanceDataQuality
  unavailable_reason: string | null
}

export type AdminFinancePaymentMethodBreakdown = {
  payment_method: string
  gmv_vnd: number | null
  paid_jobs: number | null
  share_percent: number | null
  data_quality: AdminFinanceDataQuality
  unavailable_reason: string | null
}

export type AdminFinanceServiceBreakdown = {
  service_type: string
  gmv_vnd: number | null
  commission_accrued_vnd: number | null
  paid_jobs: number | null
  data_quality: AdminFinanceDataQuality
  unavailable_reason: string | null
}

export type AdminFinanceTransactionFilters = AdminFinancePeriodInput & {
  cursor?: string
  limit?: number
  payment_method?: string
  service_type?: string
  status?: 'paid' | 'reviewed'
}

export type AdminFinanceTransaction = {
  job_id: string
  display_code: string
  customer_ref: string
  worker_ref: string | null
  service_type: string
  payment_method: string
  status: string
  gross_amount_vnd: number | null
  platform_fee_vnd: number | null
  worker_net_vnd: number | null
  refund_amount_vnd: number | null
  commission_reversal_vnd: number | null
  worker_credit_vnd: number | null
  paid_at: string | null
  data_quality: AdminFinanceDataQuality
  unavailable_reason: string | null
}

export type AdminFinanceTransactionListResponse = {
  transactions: AdminFinanceTransaction[]
  has_more: boolean
  next_cursor: string | null
}

export type AdminFinanceCsvExportResponse = {
  delivery: 'json_payload'
  filename: string
  content_type: 'text/csv;charset=utf-8'
  encoding: 'utf-8'
  csv: string
  row_count: number
  pii_masked: true
  from: string
  to: string
}

export type AdminFinanceTaxPolicyStatus = 'draft' | 'approved' | 'retired'
export type AdminFinanceTaxType = string
export type AdminFinanceTaxSubject = 'platform' | 'worker'
export type AdminFinanceTaxBasis = 'gmv' | 'commission_collected' | 'commission_retained' | 'worker_net_paid'

export type AdminFinanceTaxPolicy = {
  id: string
  version: number
  name: string
  tax_type: AdminFinanceTaxType
  subject: AdminFinanceTaxSubject
  basis: AdminFinanceTaxBasis
  rate_bps: number
  status: AdminFinanceTaxPolicyStatus
  effective_from: string
  effective_to: string | null
  source_reference: string | null
  approved_at: string | null
  approved_by: string | null
  created_at: string
  updated_at: string
}

export type AdminFinanceTaxPolicyDraftInput = {
  name: string
  tax_type: AdminFinanceTaxType
  subject: AdminFinanceTaxSubject
  basis: AdminFinanceTaxBasis
  rate_bps: number
  effective_from: string
  effective_to?: string
  source_reference: string
}

export type AdminFinanceTaxPolicyApproveInput = {
  accountant_approval_reference: string
}

export type AdminFinanceTaxPolicyRetireInput = {
  reason: string
}

export type AdminFinanceTaxPolicyListResponse = {
  tax_policies: AdminFinanceTaxPolicy[]
  active_policy_ids: string[]
}
