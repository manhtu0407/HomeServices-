type AdminFinanceRange = "day" | "week" | "month" | "year";

type AdminPaymentReconciliationListInput = {
  limit: number;
  offset: number;
  status: "pending" | "reconcile_required" | "all";
};

type AdminPaymentReconciliationDecisionInput = {
  decision: "confirm" | "reconcile_required" | "direct_paid" | "direct_release";
  amount_received?: number;
  bank_reference?: string;
  credited_at?: string;
  reason?: string;
};

type AdminPaymentReconciliationListResponse = {
  payment_reconciliations: Array<{
    id: string;
    job_id: string;
    payment_method: "platform_bank_manual" | "direct_worker";
    status: string;
    gross_amount: number;
    amount_received: number | null;
    customer_transfer_claimed_at: string | null;
    response_deadline: string | null;
    created_at: string;
    updated_at: string;
  }>;
  has_more: boolean;
  next_offset: number | null;
};

type AdminPaymentReconciliationDecisionResponse = {
  ok: true;
  payment_order_id: string;
  outcome: "paid" | "reconcile_required" | "direct_reconcile_required";
  job_id: string;
  status: "payment_pending" | "paid";
  payment_status: string;
  hold_until: string | null;
};

type AdminFinanceSummaryResponse = {
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
};

type AdminFinanceBalanceSnapshotResponse = {
  snapshot_id: string;
  balance_vnd: number;
  observed_at: string;
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
  status?: "paid" | "reviewed";
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
  transactions: AdminFinanceTransaction[];
  has_more: boolean;
  next_cursor: string | null;
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
};

type AdminFinanceTaxPolicy = {
  id: string;
  version: number;
  name: string;
  tax_type: string;
  subject: "platform" | "worker";
  basis: "gmv" | "commission_collected" | "commission_retained" | "worker_net_paid";
  rate_bps: number;
  status: "draft" | "approved" | "retired";
  effective_from: string;
  effective_to: string | null;
  source_reference: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

type AdminFinanceTaxPolicyDraftInput = {
  name: string;
  tax_type: AdminFinanceTaxPolicy["tax_type"];
  subject: AdminFinanceTaxPolicy["subject"];
  basis: AdminFinanceTaxPolicy["basis"];
  rate_bps: number;
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
  tax_policies: AdminFinanceTaxPolicy[];
  active_policy_ids: string[];
};

export type AdminFinanceContracts = {
  range: AdminFinanceRange;
  paymentReconciliationListInput: AdminPaymentReconciliationListInput;
  paymentReconciliationDecisionInput: AdminPaymentReconciliationDecisionInput;
  paymentReconciliationListResponse: AdminPaymentReconciliationListResponse;
  paymentReconciliationDecisionResponse: AdminPaymentReconciliationDecisionResponse;
  financeSummaryResponse: AdminFinanceSummaryResponse;
  financeBalanceSnapshotInput: AdminFinanceBalanceSnapshotInput;
  financeBalanceSnapshotResponse: AdminFinanceBalanceSnapshotResponse;
  financePeriodInput: AdminFinancePeriodInput;
  financeOverviewResponse: AdminFinanceOverviewResponse;
  financeTransactionFilters: AdminFinanceTransactionFilters;
  financeTransaction: AdminFinanceTransaction;
  financeTransactionListResponse: AdminFinanceTransactionListResponse;
  financeCsvExportResponse: AdminFinanceCsvExportResponse;
  financeTaxPolicy: AdminFinanceTaxPolicy;
  financeTaxPolicyDraftInput: AdminFinanceTaxPolicyDraftInput;
  financeTaxPolicyApproveInput: AdminFinanceTaxPolicyApproveInput;
  financeTaxPolicyRetireInput: AdminFinanceTaxPolicyRetireInput;
  financeTaxPolicyListResponse: AdminFinanceTaxPolicyListResponse;
};
