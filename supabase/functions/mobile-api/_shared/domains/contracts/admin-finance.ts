type AdminFinanceRange = "day" | "week" | "month" | "year";

type AdminPaymentReconciliationListInput = {
  limit: number;
  cursor?: string;
  status: "pending" | "reconcile_required" | "all";
  payment_method: "platform_bank_manual" | "direct_worker" | "all";
  assignment: "mine" | "unassigned" | "all";
  query?: string;
};

type AdminPaymentReconciliationDecisionInput = {
  decision: "confirm" | "reconcile_required" | "direct_paid" | "direct_release" | "cash_confirm" | "cash_reject";
  amount_received?: number;
  bank_reference?: string;
  credited_at?: string;
  reason?: string;
  expected_version: number;
  client_request_id: string;
};

type AdminPaymentReconciliationListResponse = {
  generated_at: string;
  payment_reconciliations: Array<{
    id: string;
    job_id: string;
    display_code: string;
    payment_method: "platform_bank_manual" | "direct_worker";
    status: string;
    gross_amount: number;
    worker_id: string;
    platform_fee: number;
    worker_net: number;
    settlement_state: "pending" | "customer_claimed" | "admin_verified" | "admin_rejected";
    amount_received: number | null;
    customer_transfer_claimed_at: string | null;
    response_deadline: string | null;
    assigned_to: string | null;
    assigned_to_name: string | null;
    assigned_to_me: boolean;
    assigned_at: string | null;
    version: number;
    created_at: string;
    updated_at: string;
  }>;
  has_more: boolean;
  next_cursor: string | null;
  total_count: number;
  total_amount_vnd: number;
};

type AdminPaymentReconciliationDetailResponse = {
  generated_at: string;
  reconciliation: AdminPaymentReconciliationListResponse["payment_reconciliations"][number];
  customer_ref: string;
  worker_ref: string | null;
  service_type: string;
  expected_amount_vnd: number;
  received_amount_vnd: number | null;
  timeline: Array<{ event_id: string; event_type: string; actor_ref: string | null; occurred_at: string }>;
};

type AdminPaymentReconciliationClaimInput = {
  expected_version: number;
  client_request_id: string;
  takeover_reason?: string;
};

type AdminPaymentReconciliationReleaseInput = {
  expected_version: number;
  client_request_id: string;
  reason: string;
};

type AdminPaymentReconciliationAssignmentResponse = {
  ok: true;
  payment_order_id: string;
  assigned_to: string | null;
  assigned_at: string | null;
  version: number;
  generated_at: string;
};

type AdminPaymentReconciliationDecisionResponse = {
  ok: true;
  payment_order_id: string;
  outcome: "paid" | "reconcile_required" | "direct_reconcile_required" | "confirmed" | "rejected";
  job_id: string;
  status: "payment_pending" | "paid";
  payment_status: string;
  hold_until: string | null;
  event_id: string;
  version: number;
  generated_at: string;
};

type AdminWorkerFinanceSnapshotInput = {
  from?: string;
  to?: string;
};

type AdminWorkerFinanceSnapshotResponse = {
  worker_id: string;
  total_jobs_paid: number;
  gross_earnings: number;
  platform_fee_total: number;
  net_earnings: number;
  available_balance: number;
  withdrawal_reserved_amount: number;
  withdrawn_total: number;
  cash_commission_collected_total: number;
  cash_commission_due_total: number;
  pending_payment_count: number;
  pending_payment_amount: number;
  provisional_payment_count: number;
  provisional_payment_amount: number;
  on_hold_amount: number;
  current_commission_level: number;
  current_commission_rate_bps: number;
  withdrawal_eligible_at: string | null;
  recent_transactions: Array<{
    job_id: string;
    display_code: string | null;
    entry_type: "worker_credit" | "cash_commission_debit";
    payment_state: "pending" | "available" | "on_hold" | "reversed" | "cash_collected" | "cash_reconciliation_due";
    settlement_state: "pending" | "customer_claimed" | "admin_verified" | "admin_rejected";
    gross_amount: number;
    platform_fee: number;
    worker_net: number;
    commission_level: number;
    commission_rate_bps: number;
    cash_commission_collected: number;
    cash_commission_due: number;
    recorded_at: string;
    available_at: string | null;
  }>;
  daily_earnings: Array<{
    date: string;
    gross_earnings: number;
    platform_fee_total: number;
    net_earnings: number;
    paid_job_count: number;
  }>;
  from_date: string | null;
  to_date: string | null;
};

type AdminFinanceSummaryResponse = {
  generated_at: string;
  range: AdminFinanceRange;
  from: string;
  to: string;
  platform_incoming: number;
  payout_outflow: number;
  commission_accrued: number;
  commission_collected: number;
  commission_receivable: number;
  worker_hold: number;
  worker_available: number;
  payout_pending: number;
  direct_payment_total: number;
  opening_balance: number | null;
  closing_balance: number | null;
  expected_bank_change: number | null;
  actual_bank_change: number | null;
  unexplained_variance: number | null;
};

type AdminFinanceBalanceSnapshotInput = {
  balance_vnd: number;
  observed_at: string;
  client_request_id: string;
};

type AdminFinanceBalanceSnapshotResponse = {
  snapshot_id: string;
  balance_vnd: number;
  observed_at: string;
  generated_at: string;
};

type AdminFinanceBalanceSnapshotListResponse = {
  generated_at: string;
  snapshots: Array<{ snapshot_id: string; balance_vnd: number; observed_at: string; recorded_by_ref: string }>;
};

type AdminFinancePeriodInput = {
  range?: AdminFinanceRange;
  anchor?: string;
  from?: string;
  to?: string;
};

type AdminFinanceDataQuality = "available" | "partial" | "unavailable";
type AdminFinanceTrendDirection = "up" | "down" | "flat" | "unavailable";

type AdminFinanceComparableMetric = {
  value: number | null;
  previous_value: number | null;
  change_value: number | null;
  change_percent: number | null;
  direction: AdminFinanceTrendDirection;
  data_quality: AdminFinanceDataQuality;
  unavailable_reason: string | null;
};

type AdminFinanceSnapshotMetric = {
  value: number | null;
  data_quality: AdminFinanceDataQuality;
  unavailable_reason: string | null;
};

type AdminFinanceOverviewResponse = {
  generated_at: string;
  preset: AdminFinanceRange | "custom";
  from: string;
  to: string;
  previous_from: string;
  previous_to: string;
  data_quality: AdminFinanceDataQuality;
  metrics: Record<
    | "gmv_vnd"
    | "paid_jobs"
    | "average_order_value_vnd"
    | "commission_accrued_vnd"
    | "commission_collected_vnd"
    | "commission_receivable_vnd"
    | "business_kept_vnd"
    | "platform_incoming_vnd"
    | "payout_outflow_vnd"
    | "net_cash_flow_vnd"
    | "refund_completed_vnd"
    | "kael_ai_cost_usd"
    | "tax_estimate_vnd",
    AdminFinanceComparableMetric
  >;
  current_balances: Record<
    "worker_hold_vnd" | "worker_available_vnd" | "payout_pending_vnd",
    AdminFinanceSnapshotMetric
  >;
  bank_reconciliation: Record<
    | "opening_balance_vnd"
    | "closing_balance_vnd"
    | "expected_change_vnd"
    | "actual_change_vnd"
    | "unexplained_variance_vnd",
    AdminFinanceSnapshotMetric
  >;
  trend: Array<{
    bucket_start: string;
    bucket_end: string;
    gmv_vnd: number | null;
    commission_collected_vnd: number | null;
    paid_jobs: number | null;
    data_quality: AdminFinanceDataQuality;
    unavailable_reason: string | null;
  }>;
  payment_methods: Array<{
    payment_method: string;
    gmv_vnd: number | null;
    paid_jobs: number | null;
    share_percent: number | null;
    data_quality: AdminFinanceDataQuality;
    unavailable_reason: string | null;
  }>;
  services: Array<{
    service_type: string;
    gmv_vnd: number | null;
    commission_accrued_vnd: number | null;
    paid_jobs: number | null;
    data_quality: AdminFinanceDataQuality;
    unavailable_reason: string | null;
  }>;
  tax_policy_ids: string[];
};

type AdminFinanceTransactionFilters = AdminFinancePeriodInput & {
  cursor?: string;
  limit?: number;
  payment_method?: string;
  service_type?: string;
  status?: "paid" | "reviewed" | "cancelled";
};

type AdminFinanceTransaction = {
  job_id: string;
  display_code: string;
  customer_ref: string;
  worker_ref: string | null;
  service_type: string;
  payment_method: string;
  status: string;
  gross_amount_vnd: number | null;
  platform_fee_vnd: number | null;
  worker_net_vnd: number | null;
  refund_amount_vnd: number | null;
  commission_reversal_vnd: number | null;
  worker_credit_vnd: number | null;
  paid_at: string | null;
  data_quality: AdminFinanceDataQuality;
  unavailable_reason: string | null;
};

type AdminFinanceTransactionListResponse = {
  generated_at: string;
  transactions: AdminFinanceTransaction[];
  has_more: boolean;
  next_cursor: string | null;
};

type AdminFinanceTransactionDetailResponse = {
  generated_at: string;
  refund?: import("../../../../_shared/contracts/payment.ts").EdgeRefundSummary | null;
  transaction: AdminFinanceTransaction;
  timeline: Array<{ event_type: string; occurred_at: string; actor_ref: string | null }>;
};

type AdminFinanceCsvExportResponse = {
  delivery: "json_payload";
  filename: string;
  content_type: "text/csv;charset=utf-8";
  encoding: "utf-8";
  csv: string;
  row_count: number;
  pii_masked: true;
  from: string;
  to: string;
  generated_at: string;
};

type AdminFinanceTaxRule = {
  id: string;
  tax_type: string;
  subject: "platform" | "worker";
  basis: "gmv" | "commission_collected" | "commission_retained" | "worker_net_paid" | "worker_bonus";
  rate_bps: number;
  applies_at_or_above_vnd: number | null;
  created_at: string;
};

type AdminFinanceTaxPolicy = {
  id: string;
  version: number;
  name: string;
  tax_type: string;
  subject: "platform" | "worker";
  basis: "gmv" | "commission_collected" | "commission_retained" | "worker_net_paid" | "worker_bonus";
  rate_bps: number;
  status: "draft" | "approved" | "retired";
  effective_from: string;
  effective_to: string | null;
  source_reference: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  rules: AdminFinanceTaxRule[];
};

type AdminFinanceTaxPolicyDraftInput = {
  name: string;
  rules: Array<Pick<AdminFinanceTaxRule, "tax_type" | "subject" | "basis" | "rate_bps">>;
  effective_from: string;
  effective_to?: string;
  source_reference: string;
};

type AdminFinanceTaxPolicyApproveInput = {
  accountant_approval_reference: string;
};

type AdminFinanceTaxPolicyRetireInput = {
  reason: string;
};

type AdminFinanceTaxPolicyListResponse = {
  generated_at: string;
  tax_policies: AdminFinanceTaxPolicy[];
  active_policy_ids: string[];
};

export type AdminFinanceContracts = {
  range: AdminFinanceRange;
  paymentReconciliationListInput: AdminPaymentReconciliationListInput;
  paymentReconciliationDecisionInput: AdminPaymentReconciliationDecisionInput;
  paymentReconciliationListResponse: AdminPaymentReconciliationListResponse;
  paymentReconciliationDetailResponse: AdminPaymentReconciliationDetailResponse;
  paymentReconciliationClaimInput: AdminPaymentReconciliationClaimInput;
  paymentReconciliationReleaseInput: AdminPaymentReconciliationReleaseInput;
  paymentReconciliationAssignmentResponse: AdminPaymentReconciliationAssignmentResponse;
  paymentReconciliationDecisionResponse: AdminPaymentReconciliationDecisionResponse;
  workerFinanceSnapshotInput: AdminWorkerFinanceSnapshotInput;
  workerFinanceSnapshotResponse: AdminWorkerFinanceSnapshotResponse;
  financeSummaryResponse: AdminFinanceSummaryResponse;
  financeBalanceSnapshotInput: AdminFinanceBalanceSnapshotInput;
  financeBalanceSnapshotResponse: AdminFinanceBalanceSnapshotResponse;
  financeBalanceSnapshotListResponse: AdminFinanceBalanceSnapshotListResponse;
  financePeriodInput: AdminFinancePeriodInput;
  financeOverviewResponse: AdminFinanceOverviewResponse;
  financeTransactionFilters: AdminFinanceTransactionFilters;
  financeTransaction: AdminFinanceTransaction;
  financeTransactionListResponse: AdminFinanceTransactionListResponse;
  financeTransactionDetailResponse: AdminFinanceTransactionDetailResponse;
  financeCsvExportResponse: AdminFinanceCsvExportResponse;
  financeTaxPolicy: AdminFinanceTaxPolicy;
  financeTaxPolicyDraftInput: AdminFinanceTaxPolicyDraftInput;
  financeTaxPolicyApproveInput: AdminFinanceTaxPolicyApproveInput;
  financeTaxPolicyRetireInput: AdminFinanceTaxPolicyRetireInput;
  financeTaxPolicyListResponse: AdminFinanceTaxPolicyListResponse;
};
