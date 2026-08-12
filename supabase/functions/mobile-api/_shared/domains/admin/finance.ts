import { apiFailure } from "../../platform/api-failure.ts";
import { asString, nullableNumber, nullableString } from "../../platform/coercions.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery } from "../../platform/db.ts";
import type { AdminFinanceContracts } from "../contracts/admin-finance.ts";
import { requireAdminCapability } from "./control.ts";

type Row = Record<string, unknown>;
type AdminFinanceRange = AdminFinanceContracts["range"];
type AdminPaymentReconciliationListInput = AdminFinanceContracts["paymentReconciliationListInput"];
type AdminPaymentReconciliationDecisionInput = AdminFinanceContracts["paymentReconciliationDecisionInput"];
type AdminPaymentReconciliationListResponse = AdminFinanceContracts["paymentReconciliationListResponse"];
type AdminPaymentReconciliationDecisionResponse = AdminFinanceContracts["paymentReconciliationDecisionResponse"];
type AdminFinanceSummaryResponse = AdminFinanceContracts["financeSummaryResponse"];
type AdminFinanceBalanceSnapshotInput = AdminFinanceContracts["financeBalanceSnapshotInput"];
type AdminFinanceBalanceSnapshotResponse = AdminFinanceContracts["financeBalanceSnapshotResponse"];

const RECONCILIATION_SELECT = [
  "id",
  "job_id",
  "payment_method",
  "status",
  "gross_amount",
  "amount_received",
  "customer_transfer_claimed_at",
  "response_deadline",
  "created_at",
  "updated_at",
].join(",");

export async function listAdminPaymentReconciliations(
  ctx: MobileApiContext,
  input: AdminPaymentReconciliationListInput,
): Promise<AdminPaymentReconciliationListResponse> {
  await requireAdminCapability(ctx, "finance.reconcile");
  let query = db(ctx)
    .from("job_payment_orders")
    .select(RECONCILIATION_SELECT)
    .order("updated_at", { ascending: false })
    .range(input.offset, input.offset + input.limit);
  if (input.status === "pending") {
    query = query.in("status", [
      "manual_customer_claimed",
      "manual_reconcile_required",
      "direct_awaiting_customer_confirmation",
      "direct_awaiting_worker_confirmation",
      "direct_reconcile_required",
    ]);
  } else if (input.status === "reconcile_required") {
    query = query.in("status", ["manual_reconcile_required", "direct_reconcile_required"]);
  }
  const result = await dbQuery<Row[]>(query);
  if (result.error) apiFailure("DB_ERROR", "Không thể tải hàng chờ đối soát", 500);
  const page = result.data ?? [];
  const rows = page.slice(0, input.limit).map(serializeReconciliation);
  return {
    payment_reconciliations: rows,
    has_more: page.length > input.limit,
    next_offset: page.length > input.limit ? input.offset + rows.length : null,
  };
}

export async function decideAdminPaymentReconciliation(
  ctx: MobileApiContext,
  paymentOrderId: string,
  input: AdminPaymentReconciliationDecisionInput,
): Promise<AdminPaymentReconciliationDecisionResponse> {
  await requireAdminCapability(ctx, "finance.reconcile");
  const reference = input.bank_reference ? await hashBankReference(input.bank_reference) : null;
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("decide_manual_bank_payment_reconciliation", {
      p_actor_id: ctx.user.id,
      p_amount_received: input.amount_received ?? null,
      p_bank_reference_hash: reference?.hash ?? null,
      p_bank_reference_suffix: reference?.suffix ?? null,
      p_credited_at: input.credited_at ?? null,
      p_decision: input.decision,
      p_payment_order_id: paymentOrderId,
      p_reason_code: input.reason ?? null,
    }),
  );
  const row = result.data?.[0];
  if (result.error || !row) apiFailure("DB_ERROR", "Không thể lưu quyết định đối soát", 500);
  if (row.ok !== true) mapDecisionError(nullableString(row.error_code));
  const outcome = nullableString(row.outcome);
  const jobId = nullableString(row.job_id);
  const status = nullableString(row.status);
  const paymentStatus = nullableString(row.payment_status);
  if (
    !jobId ||
    (outcome !== "paid" && outcome !== "reconcile_required" && outcome !== "direct_reconcile_required") ||
    (status !== "payment_pending" && status !== "paid") ||
    !paymentStatus
  ) {
    apiFailure("DB_ERROR", "Biên nhận đối soát không hợp lệ", 500);
  }
  return {
    ok: true,
    payment_order_id: paymentOrderId,
    outcome,
    job_id: jobId,
    status,
    payment_status: paymentStatus,
    hold_until: nullableString(row.hold_until),
  };
}

export async function getAdminFinanceSummary(
  ctx: MobileApiContext,
  input: { anchor?: string; range: AdminFinanceRange },
): Promise<AdminFinanceSummaryResponse> {
  await requireAdminCapability(ctx, "finance.reconcile");
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

function serializeReconciliation(row: Row): AdminPaymentReconciliationListResponse["payment_reconciliations"][number] {
  const method = nullableString(row.payment_method);
  const grossAmount = nonnegativeInteger(row.gross_amount);
  const id = nullableString(row.id);
  const jobId = nullableString(row.job_id);
  const status = nullableString(row.status);
  const createdAt = nullableString(row.created_at);
  const updatedAt = nullableString(row.updated_at);
  if (
    (method !== "platform_bank_manual" && method !== "direct_worker") ||
    grossAmount === null || grossAmount <= 0 || !id || !jobId || !status || !createdAt || !updatedAt
  ) apiFailure("DB_ERROR", "Dữ liệu đối soát thanh toán không hợp lệ", 500);
  return {
    id,
    job_id: jobId,
    payment_method: method,
    status,
    gross_amount: grossAmount,
    amount_received: nullableNumber(row.amount_received),
    customer_transfer_claimed_at: nullableString(row.customer_transfer_claimed_at),
    response_deadline: nullableString(row.response_deadline),
    created_at: createdAt,
    updated_at: updatedAt,
  };
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

function hcmcRangeBounds(range: AdminFinanceRange, anchor?: string) {
  const reference = anchor ? new Date(anchor) : new Date();
  if (!Number.isFinite(reference.getTime())) apiFailure("VALIDATION", "Mốc thời gian không hợp lệ", 400);
  const hcmc = new Date(reference.getTime() + 7 * 60 * 60 * 1000);
  const year = hcmc.getUTCFullYear();
  const month = hcmc.getUTCMonth();
  const day = hcmc.getUTCDate();
  if (range === "day") return hcmcWindow(year, month, day, 1);
  if (range === "week") {
    const weekday = hcmc.getUTCDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    return hcmcWindow(year, month, day + mondayOffset, 7);
  }
  if (range === "month") {
    return { from: hcmcDate(year, month, 1), to: hcmcDate(year, month + 1, 1) };
  }
  return { from: hcmcDate(year, 0, 1), to: hcmcDate(year + 1, 0, 1) };
}

function hcmcWindow(year: number, month: number, day: number, days: number) {
  return { from: hcmcDate(year, month, day), to: hcmcDate(year, month, day + days) };
}

function hcmcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day, -7, 0, 0, 0)).toISOString();
}

async function hashBankReference(value: string) {
  const normalized = value.trim();
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  const hash = Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { hash, suffix: normalized.slice(-16) };
}

function nonnegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function mapDecisionError(code: string | null): never {
  if (code === "PAYMENT_ORDER_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy lệnh thanh toán", 404);
  if (code === "BANK_REFERENCE_USED") apiFailure("CONFLICT", "Mã giao dịch ngân hàng đã được dùng cho công việc khác", 409);
  if (code === "INVALID_STATUS") apiFailure("STATUS_CHANGED", "Lệnh thanh toán đã thay đổi trạng thái", 409);
  if (code === "INVALID_INPUT") apiFailure("VALIDATION", "Thông tin đối soát không hợp lệ", 400);
  if (code === "COLLATERAL_NOT_FOUND" || code === "WORKER_LEDGER_INVALID") {
    apiFailure("CONFLICT", "Biên nhận thanh toán cần được kiểm tra thêm", 409);
  }
  apiFailure("PAYMENT_RECONCILIATION_FAILED", "Không thể xử lý đối soát thanh toán", 409);
}
