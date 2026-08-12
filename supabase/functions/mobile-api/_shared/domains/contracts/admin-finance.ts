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

export type AdminFinanceContracts = {
  range: AdminFinanceRange;
  paymentReconciliationListInput: AdminPaymentReconciliationListInput;
  paymentReconciliationDecisionInput: AdminPaymentReconciliationDecisionInput;
  paymentReconciliationListResponse: AdminPaymentReconciliationListResponse;
  paymentReconciliationDecisionResponse: AdminPaymentReconciliationDecisionResponse;
  financeSummaryResponse: AdminFinanceSummaryResponse;
  financeBalanceSnapshotInput: AdminFinanceBalanceSnapshotInput;
  financeBalanceSnapshotResponse: AdminFinanceBalanceSnapshotResponse;
};
