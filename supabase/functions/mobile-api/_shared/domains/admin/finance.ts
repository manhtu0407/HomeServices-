import { apiFailure } from "../../platform/api-failure.ts";
import { asString, nullableNumber, nullableRecord, nullableString } from "../../platform/coercions.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery } from "../../platform/db.ts";
import type { AdminFinanceContracts } from "../contracts/admin-finance.ts";
import { requireAdminCapability } from "./control.ts";
export {
  decideAdminPaymentReconciliation,
  getAdminWorkerFinanceSnapshot,
  listAdminPaymentReconciliations,
} from "./finance-reconciliation.ts";
import {
  csvCell,
  encodeFinanceCursor,
  financeBucket,
  hcmcRangeBounds,
  parseFinanceCursor,
  resolveFinancePeriod,
  uniqueStrings,
  type ResolvedFinancePeriod,
} from "./finance-reporting.ts";

type Row = Record<string, unknown>;
type AdminFinanceRange = AdminFinanceContracts["range"];
type AdminFinanceSummaryResponse = AdminFinanceContracts["financeSummaryResponse"];
type AdminFinanceBalanceSnapshotInput = AdminFinanceContracts["financeBalanceSnapshotInput"];
type AdminFinanceBalanceSnapshotResponse = AdminFinanceContracts["financeBalanceSnapshotResponse"];
type AdminFinancePeriodInput = AdminFinanceContracts["financePeriodInput"];
type AdminFinanceOverviewResponse = AdminFinanceContracts["financeOverviewResponse"];
type AdminFinanceTransactionFilters = AdminFinanceContracts["financeTransactionFilters"];
type AdminFinanceTransaction = AdminFinanceContracts["financeTransaction"];
type AdminFinanceTransactionListResponse = AdminFinanceContracts["financeTransactionListResponse"];
type AdminFinanceCsvExportResponse = AdminFinanceContracts["financeCsvExportResponse"];
type AdminFinanceTaxPolicy = AdminFinanceContracts["financeTaxPolicy"];
type AdminFinanceTaxPolicyDraftInput = AdminFinanceContracts["financeTaxPolicyDraftInput"];
type AdminFinanceTaxPolicyApproveInput = AdminFinanceContracts["financeTaxPolicyApproveInput"];
type AdminFinanceTaxPolicyRetireInput = AdminFinanceContracts["financeTaxPolicyRetireInput"];
type AdminFinanceTaxPolicyListResponse = AdminFinanceContracts["financeTaxPolicyListResponse"];

const MAX_FINANCE_EXPORT_ROWS = 50_000;
const FINANCE_OVERVIEW_METRICS = [
  "gmv_vnd",
  "paid_jobs",
  "average_order_value_vnd",
  "commission_accrued_vnd",
  "commission_collected_vnd",
  "commission_receivable_vnd",
  "business_kept_vnd",
  "platform_incoming_vnd",
  "payout_outflow_vnd",
  "net_cash_flow_vnd",
  "refund_completed_vnd",
  "kael_ai_cost_usd",
  "tax_estimate_vnd",
] as const;
const FINANCE_CSV_COLUMNS: Array<keyof AdminFinanceTransaction> = [
  "job_id",
  "display_code",
  "customer_ref",
  "worker_ref",
  "service_type",
  "payment_method",
  "status",
  "gross_amount_vnd",
  "platform_fee_vnd",
  "worker_net_vnd",
  "refund_amount_vnd",
  "commission_reversal_vnd",
  "worker_credit_vnd",
  "paid_at",
  "data_quality",
  "unavailable_reason",
];

export async function getAdminFinanceSummary(
  ctx: MobileApiContext,
  input: { anchor?: string; range: AdminFinanceRange },
): Promise<AdminFinanceSummaryResponse> {
  await requireAdminCapability(ctx, "finance.read");
  const bounds = hcmcRangeBounds(input.range, input.anchor);
  const result = await dbQuery<Row>(
    db(ctx).rpc("admin_finance_summary", {
      p_actor_id: ctx.user.id,
      p_from: bounds.from,
      p_to: bounds.to,
    }),
  );
  if (result.error || !result.data) apiFailure("DB_ERROR", "Không thể tải tổng hợp tài chính", 500);
  return serializeFinanceSummary(result.data, input.range, bounds);
}

export async function getAdminFinanceOverview(
  ctx: MobileApiContext,
  input: AdminFinancePeriodInput,
): Promise<AdminFinanceOverviewResponse> {
  await requireAdminCapability(ctx, "finance.read");
  const period = resolveFinancePeriod(input);
  const result = await dbQuery<Row>(
    db(ctx).rpc("admin_finance_overview", {
      p_actor_id: ctx.user.id,
      p_bucket: financeBucket(period),
      p_from: period.from,
      p_to: period.to,
    }),
  );
  if (result.error || !result.data) apiFailure("DB_ERROR", "Không thể tải tổng quan tài chính", 500);
  return serializeFinanceOverview(result.data, period);
}

export async function listAdminFinanceTransactions(
  ctx: MobileApiContext,
  input: AdminFinanceTransactionFilters,
): Promise<AdminFinanceTransactionListResponse> {
  await requireAdminCapability(ctx, "finance.read");
  const period = resolveFinancePeriod(input);
  const cursor = input.cursor ? parseFinanceCursor(input.cursor) : null;
  const result = await dbQuery<Row>(
    db(ctx).rpc("admin_finance_transactions_page", {
      p_actor_id: ctx.user.id,
      p_cursor_job_id: cursor?.job_id ?? null,
      p_cursor_paid_at: cursor?.paid_at ?? null,
      p_from: period.from,
      p_limit: input.limit ?? 25,
      p_payment_method: input.payment_method ?? null,
      p_service_type: input.service_type ?? null,
      p_status: input.status ?? null,
      p_to: period.to,
    }),
  );
  if (result.error || !result.data) apiFailure("DB_ERROR", "Không thể tải giao dịch tài chính", 500);
  const rows = asRecordArray(result.data.rows);
  const nextCursor = nullableRecord(result.data.next_cursor);
  const pageLimit = nonnegativeInteger(result.data.limit);
  if (!rows || result.data.pii !== "masked" || pageLimit !== (input.limit ?? 25)) {
    apiFailure("DB_ERROR", "Danh sách giao dịch tài chính không hợp lệ", 500);
  }
  const encodedCursor = nextCursor ? encodeFinanceCursor(nextCursor) : null;
  return {
    transactions: rows.map(serializeFinanceTransaction),
    has_more: encodedCursor !== null,
    next_cursor: encodedCursor,
  };
}

export async function exportAdminFinanceCsv(
  ctx: MobileApiContext,
  input: AdminFinanceTransactionFilters,
): Promise<AdminFinanceCsvExportResponse> {
  await requireAdminCapability(ctx, "finance.read");
  const period = resolveFinancePeriod(input);
  const result = await dbQuery<Row>(
    db(ctx).rpc("admin_finance_export_rows", {
      p_actor_id: ctx.user.id,
      p_from: period.from,
      p_limit: MAX_FINANCE_EXPORT_ROWS + 1,
      p_payment_method: input.payment_method ?? null,
      p_service_type: input.service_type ?? null,
      p_status: input.status ?? null,
      p_to: period.to,
    }),
  );
  if (result.error || !result.data) apiFailure("DB_ERROR", "Không thể xuất báo cáo tài chính", 500);
  const rawRows = asRecordArray(result.data.rows);
  const rowCount = nonnegativeInteger(result.data.row_count);
  if (!rawRows || rowCount === null || rowCount !== rawRows.length || result.data.pii !== "masked") {
    apiFailure("DB_ERROR", "Bản xuất tài chính không hợp lệ", 500);
  }
  if (rowCount > MAX_FINANCE_EXPORT_ROWS) apiFailure("VALIDATION", "Báo cáo vượt quá giới hạn 50.000 dòng", 400);
  const rows = rawRows.map(serializeFinanceTransaction);
  const csvRows = [
    FINANCE_CSV_COLUMNS.join(","),
    ...rows.map((row) => FINANCE_CSV_COLUMNS.map((column) => csvCell(row[column])).join(",")),
  ];
  return {
    delivery: "json_payload",
    filename: `nestscout-finance-${period.from.slice(0, 10)}-${period.to.slice(0, 10)}.csv`,
    content_type: "text/csv;charset=utf-8",
    encoding: "utf-8",
    csv: csvRows.join("\r\n"),
    row_count: rows.length,
    pii_masked: true,
    from: period.from,
    to: period.to,
  };
}

export async function listAdminFinanceTaxPolicies(
  ctx: MobileApiContext,
): Promise<AdminFinanceTaxPolicyListResponse> {
  await requireAdminCapability(ctx, "finance.read");
  const result = await dbQuery<Row>(
    db(ctx).rpc("admin_finance_tax_policies", { p_actor_id: ctx.user.id }),
  );
  if (result.error || !result.data) apiFailure("DB_ERROR", "Không thể tải chính sách thuế", 500);
  const policyRows = asRecordArray(result.data.tax_policies);
  const activePolicyIds = Array.isArray(result.data.active_policy_ids) ? result.data.active_policy_ids : null;
  if (!policyRows || !activePolicyIds) apiFailure("DB_ERROR", "Danh sách chính sách thuế không hợp lệ", 500);
  const policies = policyRows.map(serializeTaxPolicy);
  return {
    tax_policies: policies,
    active_policy_ids: uniqueStrings(activePolicyIds.map(nullableString)),
  };
}

export async function createAdminFinanceTaxPolicyDraft(
  ctx: MobileApiContext,
  input: AdminFinanceTaxPolicyDraftInput,
): Promise<AdminFinanceTaxPolicy> {
  await requireAdminCapability(ctx, "finance.tax.manage");
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("admin_create_finance_tax_policy_draft", {
      p_actor_id: ctx.user.id,
      p_policy: input,
    }),
  );
  const row = result.data?.[0];
  if (result.error || !row) apiFailure("DB_ERROR", "Không thể tạo bản nháp chính sách thuế", 500);
  return serializeTaxPolicy(row);
}

export async function updateAdminFinanceTaxPolicyDraft(
  ctx: MobileApiContext,
  policyId: string,
  input: AdminFinanceTaxPolicyDraftInput,
): Promise<AdminFinanceTaxPolicy> {
  await requireAdminCapability(ctx, "finance.tax.manage");
  const result = await dbQuery<Row[]>(db(ctx).rpc("admin_update_finance_tax_policy_draft", {
    p_actor_id: ctx.user.id,
    p_policy_id: policyId,
    p_policy: input,
  }));
  const row = result.data?.[0];
  if (result.error || !row) apiFailure("DB_ERROR", "Không thể cập nhật bản nháp chính sách thuế", 500);
  return serializeTaxPolicy(row);
}

export async function approveAdminFinanceTaxPolicy(
  ctx: MobileApiContext,
  policyId: string,
  input: AdminFinanceTaxPolicyApproveInput,
): Promise<AdminFinanceTaxPolicy> {
  if (ctx.role !== "admin") apiFailure("AUTH_FORBIDDEN", "Chỉ Owner Admin được phê duyệt chính sách thuế", 403);
  await requireAdminCapability(ctx, "finance.tax.manage");
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("admin_approve_finance_tax_policy", {
      p_accountant_approval_reference: input.accountant_approval_reference,
      p_actor_id: ctx.user.id,
      p_policy_id: policyId,
    }),
  );
  const row = result.data?.[0];
  if (result.error || !row) apiFailure("DB_ERROR", "Không thể phê duyệt chính sách thuế", 500);
  return serializeTaxPolicy(row);
}

export async function retireAdminFinanceTaxPolicy(
  ctx: MobileApiContext,
  policyId: string,
  input: AdminFinanceTaxPolicyRetireInput,
): Promise<AdminFinanceTaxPolicy> {
  if (ctx.role !== "admin") apiFailure("AUTH_FORBIDDEN", "Chỉ Owner Admin được ngừng chính sách thuế", 403);
  await requireAdminCapability(ctx, "finance.tax.manage");
  const result = await dbQuery<Row[]>(db(ctx).rpc("admin_retire_finance_tax_policy", {
    p_actor_id: ctx.user.id,
    p_policy_id: policyId,
    p_reason: input.reason,
  }));
  const row = result.data?.[0];
  if (result.error || !row) apiFailure("DB_ERROR", "Không thể ngừng chính sách thuế", 500);
  return serializeTaxPolicy(row);
}

export async function recordAdminFinanceBalanceSnapshot(
  ctx: MobileApiContext,
  input: AdminFinanceBalanceSnapshotInput,
): Promise<AdminFinanceBalanceSnapshotResponse> {
  await requireAdminCapability(ctx, "finance.reconcile");
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("record_platform_bank_balance_snapshot", {
      p_actor_id: ctx.user.id,
      p_balance_vnd: input.balance_vnd,
      p_observed_at: input.observed_at,
    }),
  );
  const row = result.data?.[0];
  const snapshotId = row ? nullableString(row.snapshot_id) : null;
  const balance = row ? nonnegativeInteger(row.balance_vnd) : null;
  const observedAt = row ? nullableString(row.observed_at) : null;
  if (result.error || !snapshotId || balance === null || !observedAt) {
    apiFailure("DB_ERROR", "Không thể lưu số dư tài khoản", 500);
  }
  return { snapshot_id: snapshotId, balance_vnd: balance, observed_at: observedAt };
}

function serializeFinanceSummary(
  row: Row,
  range: AdminFinanceRange,
  bounds: { from: string; to: string },
): AdminFinanceSummaryResponse {
  const keys = [
    "platform_incoming",
    "payout_outflow",
    "commission_accrued",
    "commission_collected",
    "commission_receivable",
    "worker_hold",
    "worker_available",
    "payout_pending",
    "direct_payment_total",
  ] as const;
  const values = Object.fromEntries(keys.map((key) => [key, nonnegativeInteger(row[key])]));
  if (keys.some((key) => values[key] === null)) {
    apiFailure("DB_ERROR", "Tổng hợp tài chính không hợp lệ", 500);
  }
  return {
    range,
    from: bounds.from,
    to: bounds.to,
    platform_incoming: values.platform_incoming as number,
    payout_outflow: values.payout_outflow as number,
    commission_accrued: values.commission_accrued as number,
    commission_collected: values.commission_collected as number,
    commission_receivable: values.commission_receivable as number,
    worker_hold: values.worker_hold as number,
    worker_available: values.worker_available as number,
    payout_pending: values.payout_pending as number,
    direct_payment_total: values.direct_payment_total as number,
    opening_balance: nullableNumber(row.opening_balance),
    closing_balance: nullableNumber(row.closing_balance),
    expected_bank_change: nullableNumber(row.expected_bank_change),
    actual_bank_change: nullableNumber(row.actual_bank_change),
    unexplained_variance: nullableNumber(row.unexplained_variance),
  };
}

function serializeFinanceOverview(
  row: Row,
  period: ResolvedFinancePeriod,
): AdminFinanceOverviewResponse {
  const metrics = asRecord(row.metrics);
  const previousPeriod = asRecord(row.previous_period);
  const previousMetrics = asRecord(previousPeriod.metrics);
  const balances = asRecord(row.current_worker_balances);
  const bank = asRecord(row.bank_reconciliation);
  const trend = asRecordArray(row.series);
  const paymentMethods = asRecordArray(row.payment_method_breakdown);
  const services = asRecordArray(row.service_breakdown);
  const dataQuality = asRecord(row.data_quality);
  const tax = asRecord(row.tax);
  if (!trend || !paymentMethods || !services) apiFailure("DB_ERROR", "Tổng quan tài chính không hợp lệ", 500);
  const financialQuality = dataQuality.paid_financials === "complete" ? "available" : "partial";
  const metricSources: Record<typeof FINANCE_OVERVIEW_METRICS[number], [string, string | null]> = {
    gmv_vnd: ["gmv", null],
    paid_jobs: ["paid_job_count", null],
    average_order_value_vnd: ["average_order_value", "AVERAGE_ORDER_VALUE_UNAVAILABLE"],
    commission_accrued_vnd: ["commission_accrued", null],
    commission_collected_vnd: ["commission_collected", null],
    commission_receivable_vnd: ["commission_receivable", null],
    business_kept_vnd: ["commission_retained", null],
    platform_incoming_vnd: ["platform_incoming", null],
    payout_outflow_vnd: ["payout_outflow", null],
    net_cash_flow_vnd: ["net_cash_flow", null],
    refund_completed_vnd: ["refund_outflow", null],
    kael_ai_cost_usd: ["kael_ai_spend_usd", "KAEL_COST_NOT_RECORDED"],
    tax_estimate_vnd: ["", "TAX_POLICY_NOT_CONFIGURED"],
  };
  const serializedMetrics = Object.fromEntries(FINANCE_OVERVIEW_METRICS.map((key) => {
    const [source, unavailableReason] = metricSources[key];
    if (key === "tax_estimate_vnd") {
      const available = tax.status === "estimated";
      return [key, comparableMetric(
        available ? tax.estimated_vnd : null,
        null,
        available ? "partial" : "unavailable",
        available ? "PREVIOUS_TAX_ESTIMATE_UNAVAILABLE" : unavailableReason,
      )];
    }
    if (key === "kael_ai_cost_usd" && dataQuality.kael_spend !== "recorded") {
      return [key, comparableMetric(null, null, "unavailable", unavailableReason)];
    }
    const current = financialQuality === "partial" && key !== "paid_jobs"
      ? null
      : nullableFiniteNumber(metrics[source]);
    const previous = nullableFiniteNumber(previousMetrics[source]);
    if (current === null) return [key, comparableMetric(null, null, "unavailable", unavailableReason ?? "METRIC_UNAVAILABLE")];
    return [key, comparableMetric(current, previous, financialQuality, financialQuality === "partial" ? "PAID_FINANCIALS_PARTIAL" : null)];
  })) as AdminFinanceOverviewResponse["metrics"];
  const serializedBalances = {
    worker_hold_vnd: snapshotMetric(balances.on_hold),
    worker_available_vnd: snapshotMetric(balances.available),
    payout_pending_vnd: snapshotMetric(balances.payout_pending),
  };
  const bankQuality = dataQuality.bank_snapshots === "complete" ? "available" : "unavailable";
  const serializedBank = {
    opening_balance_vnd: signedSnapshotMetric(bank.opening_balance, bankQuality, "BANK_SNAPSHOT_MISSING"),
    closing_balance_vnd: signedSnapshotMetric(bank.closing_balance, bankQuality, "BANK_SNAPSHOT_MISSING"),
    expected_change_vnd: signedSnapshotMetric(bank.expected_change, bankQuality, "BANK_SNAPSHOT_MISSING"),
    actual_change_vnd: signedSnapshotMetric(bank.actual_change, bankQuality, "BANK_SNAPSHOT_MISSING"),
    unexplained_variance_vnd: signedSnapshotMetric(bank.unexplained_variance, bankQuality, "BANK_SNAPSHOT_MISSING"),
  };
  const taxRules = asRecordArray(tax.rules) ?? [];
  return {
    preset: period.preset,
    from: period.from,
    to: period.to,
    previous_from: period.previousFrom,
    previous_to: period.previousTo,
    data_quality: financialQuality,
    metrics: serializedMetrics,
    current_balances: serializedBalances,
    bank_reconciliation: serializedBank,
    trend: trend.map(serializeTrendPoint),
    payment_methods: paymentMethods.map((item) => serializePaymentMethodBreakdown(item, nullableFiniteNumber(metrics.gmv), financialQuality)),
    services: services.map((item) => serializeServiceBreakdown(item, financialQuality)),
    tax_policy_ids: uniqueStrings(taxRules.map((rule) => nullableString(rule.policy_id))),
  };
}

function comparableMetric(
  currentValue: unknown,
  previousValue: unknown,
  quality: AdminFinanceOverviewResponse["data_quality"],
  unavailableReason: string | null,
): AdminFinanceOverviewResponse["metrics"][keyof AdminFinanceOverviewResponse["metrics"]] {
  if (quality === "unavailable") {
    return {
      value: null,
      previous_value: null,
      change_value: null,
      change_percent: null,
      direction: "unavailable",
      data_quality: quality,
      unavailable_reason: unavailableReason ?? "METRIC_UNAVAILABLE",
    };
  }
  const current = nullableFiniteNumber(currentValue);
  const previous = nullableFiniteNumber(previousValue);
  const change = current === null || previous === null ? null : current - previous;
  return {
    value: current,
    previous_value: previous,
    change_value: change,
    change_percent: change === null || previous === null || previous === 0 ? null : (change / previous) * 100,
    direction: change === null ? "unavailable" : change === 0 ? "flat" : change > 0 ? "up" : "down",
    data_quality: quality,
    unavailable_reason: unavailableReason,
  };
}

function snapshotMetric(value: unknown): AdminFinanceOverviewResponse["current_balances"][keyof AdminFinanceOverviewResponse["current_balances"]] {
  const metricValue = nonnegativeInteger(value);
  return metricValue === null
    ? { value: null, data_quality: "unavailable", unavailable_reason: "BALANCE_UNAVAILABLE" }
    : { value: metricValue, data_quality: "available", unavailable_reason: null };
}

function signedSnapshotMetric(
  value: unknown,
  quality: AdminFinanceOverviewResponse["data_quality"],
  unavailableReason: string,
): AdminFinanceOverviewResponse["bank_reconciliation"][keyof AdminFinanceOverviewResponse["bank_reconciliation"]] {
  const metricValue = nullableFiniteNumber(value);
  return quality === "available" && metricValue !== null
    ? { value: metricValue, data_quality: "available", unavailable_reason: null }
    : { value: null, data_quality: "unavailable", unavailable_reason: unavailableReason };
}

function serializeTrendPoint(row: Row): AdminFinanceOverviewResponse["trend"][number] {
  const metrics = asRecord(row.metrics);
  const quality = nonnegativeInteger(metrics.missing_paid_financial_rows) === 0 ? "available" : "partial";
  const bucketStart = nullableString(row.from);
  const bucketEnd = nullableString(row.to);
  if (!bucketStart || !bucketEnd) apiFailure("DB_ERROR", "Mốc xu hướng tài chính không hợp lệ", 500);
  return {
    bucket_start: bucketStart,
    bucket_end: bucketEnd,
    gmv_vnd: quality === "available" ? nullableFiniteNumber(metrics.gmv) : null,
    commission_collected_vnd: quality === "available" ? nullableFiniteNumber(metrics.commission_collected) : null,
    paid_jobs: nullableFiniteNumber(metrics.paid_job_count),
    data_quality: quality,
    unavailable_reason: quality === "partial" ? "PAID_FINANCIALS_PARTIAL" : null,
  };
}

function serializePaymentMethodBreakdown(
  row: Row,
  totalGmv: number | null,
  quality: AdminFinanceOverviewResponse["data_quality"],
): AdminFinanceOverviewResponse["payment_methods"][number] {
  const paymentMethod = nullableString(row.payment_method);
  const gmv = nonnegativeInteger(row.gmv);
  const paidJobs = nonnegativeInteger(row.paid_job_count);
  if (!paymentMethod || gmv === null || paidJobs === null) apiFailure("DB_ERROR", "Phương thức thanh toán không hợp lệ", 500);
  return {
    payment_method: paymentMethod,
    gmv_vnd: quality === "available" ? gmv : null,
    paid_jobs: paidJobs,
    share_percent: quality !== "available" || totalGmv === null || totalGmv === 0 ? null : (gmv / totalGmv) * 100,
    data_quality: quality,
    unavailable_reason: quality === "partial" ? "PAID_FINANCIALS_PARTIAL" : null,
  };
}

function serializeServiceBreakdown(row: Row, quality: AdminFinanceOverviewResponse["data_quality"]): AdminFinanceOverviewResponse["services"][number] {
  const serviceType = nullableString(row.service_type);
  const gmv = nonnegativeInteger(row.gmv);
  const commissionAccrued = nonnegativeInteger(row.commission_accrued);
  const paidJobs = nonnegativeInteger(row.paid_job_count);
  if (!serviceType || gmv === null || commissionAccrued === null || paidJobs === null) {
    apiFailure("DB_ERROR", "Loại dịch vụ tài chính không hợp lệ", 500);
  }
  return {
    service_type: serviceType,
    gmv_vnd: quality === "available" ? gmv : null,
    commission_accrued_vnd: quality === "available" ? commissionAccrued : null,
    paid_jobs: paidJobs,
    data_quality: quality,
    unavailable_reason: quality === "partial" ? "PAID_FINANCIALS_PARTIAL" : null,
  };
}

function serializeFinanceTransaction(row: Row): AdminFinanceTransaction {
  const jobId = nullableString(row.job_id);
  const displayCode = nullableString(row.display_code);
  const customerRef = nullableString(row.customer_ref);
  const serviceType = nullableString(row.service_type);
  const paymentMethod = nullableString(row.payment_method);
  const status = nullableString(row.status);
  const grossAmount = nonnegativeInteger(row.gross_amount_vnd);
  const platformFee = nonnegativeInteger(row.platform_fee_vnd);
  const workerNet = nonnegativeInteger(row.worker_net_vnd);
  const refundAmount = nonnegativeInteger(row.refund_amount_vnd);
  const commissionReversal = nonnegativeInteger(row.commission_reversal_vnd);
  const workerCredit = nonnegativeInteger(row.worker_credit_vnd);
  if (!jobId || !displayCode || !customerRef || !serviceType || !paymentMethod || !status) {
    apiFailure("DB_ERROR", "Giao dịch tài chính không hợp lệ", 500);
  }
  if (refundAmount === null || commissionReversal === null || workerCredit === null) {
    apiFailure("DB_ERROR", "Số tiền giao dịch tài chính không hợp lệ", 500);
  }
  const quality = grossAmount === null || platformFee === null || workerNet === null ? "partial" : "available";
  return {
    job_id: jobId,
    display_code: displayCode,
    customer_ref: customerRef,
    worker_ref: nullableString(row.worker_ref),
    service_type: serviceType,
    payment_method: paymentMethod,
    status,
    gross_amount_vnd: grossAmount,
    platform_fee_vnd: platformFee,
    worker_net_vnd: workerNet,
    refund_amount_vnd: refundAmount,
    commission_reversal_vnd: commissionReversal,
    worker_credit_vnd: workerCredit,
    paid_at: nullableString(row.paid_at),
    data_quality: quality,
    unavailable_reason: quality === "partial" ? "PAID_FINANCIALS_PARTIAL" : null,
  };
}

function serializeTaxPolicy(row: Row): AdminFinanceTaxPolicy {
  const id = nullableString(row.id);
  const name = nullableString(row.name);
  const taxType = asTaxType(row.tax_type);
  const subject = asTaxSubject(row.subject);
  const basis = asTaxBasis(row.basis);
  const status = asTaxPolicyStatus(row.status);
  const effectiveFrom = nullableString(row.effective_from);
  const sourceReference = nullableString(row.source_reference);
  const createdAt = nullableString(row.created_at);
  const updatedAt = nullableString(row.updated_at);
  const version = positiveInteger(row.version);
  const rateBps = nonnegativeInteger(row.rate_bps);
  if (!id || !name || !taxType || !subject || !basis || !status || !effectiveFrom || !createdAt || !updatedAt || version === null || rateBps === null || rateBps > 10_000) {
    apiFailure("DB_ERROR", "Chính sách thuế không hợp lệ", 500);
  }
  return {
    id,
    version,
    name,
    tax_type: taxType,
    subject,
    basis,
    rate_bps: rateBps,
    status,
    effective_from: effectiveFrom,
    effective_to: nullableString(row.effective_to),
    source_reference: sourceReference,
    approved_at: nullableString(row.approved_at),
    approved_by: nullableString(row.approved_by),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function asRecord(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    apiFailure("DB_ERROR", "Dữ liệu tài chính không hợp lệ", 500);
  }
  return value as Row;
}

function asRecordArray(value: unknown): Row[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(asRecord);
}

function requireDataQuality(row: Row): AdminFinanceOverviewResponse["data_quality"] {
  const quality = asDataQuality(row.data_quality);
  if (!quality) apiFailure("DB_ERROR", "Chất lượng dữ liệu tài chính không hợp lệ", 500);
  if (quality === "unavailable" && !nullableString(row.unavailable_reason)) {
    apiFailure("DB_ERROR", "Dữ liệu chưa khả dụng phải có lý do", 500);
  }
  return quality;
}

function asDataQuality(value: unknown): AdminFinanceOverviewResponse["data_quality"] | null {
  return value === "available" || value === "partial" || value === "unavailable" ? value : null;
}

function nullableFiniteNumber(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }

function positiveInteger(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null; }

function asTaxType(value: unknown): AdminFinanceTaxPolicy["tax_type"] | null {
  const taxType = nullableString(value);
  return taxType && /^[A-Za-z0-9_]{2,40}$/.test(taxType) ? taxType : null;
}

function asTaxSubject(value: unknown): AdminFinanceTaxPolicy["subject"] | null {
  return value === "platform" || value === "worker" ? value : null;
}

function asTaxBasis(value: unknown): AdminFinanceTaxPolicy["basis"] | null {
  return value === "gmv" || value === "commission_collected" || value === "commission_retained" || value === "worker_net_paid" ? value : null;
}

function asTaxPolicyStatus(value: unknown): AdminFinanceTaxPolicy["status"] | null {
  return value === "draft" || value === "approved" || value === "retired" ? value : null;
}

function nonnegativeInteger(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }
