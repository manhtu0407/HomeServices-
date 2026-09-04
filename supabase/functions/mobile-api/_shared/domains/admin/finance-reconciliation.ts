import { apiFailure } from "../../platform/api-failure.ts";
import { isRecord, nullableNumber, nullableString } from "../../platform/coercions.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { normalizeIsoTimestamp } from "../../platform/iso-timestamp.ts";
import { db, dbQuery } from "../../platform/db.ts";
import type { AdminFinanceContracts } from "../contracts/admin-finance.ts";
import { requireAdminCapability } from "./control.ts";

type Row = Record<string, unknown>;
type AdminPaymentReconciliationListInput = AdminFinanceContracts["paymentReconciliationListInput"];
type AdminPaymentReconciliationDecisionInput = AdminFinanceContracts["paymentReconciliationDecisionInput"];
type AdminPaymentReconciliationListResponse = AdminFinanceContracts["paymentReconciliationListResponse"];
type AdminPaymentReconciliationDetailResponse = AdminFinanceContracts["paymentReconciliationDetailResponse"];
type AdminPaymentReconciliationClaimInput = AdminFinanceContracts["paymentReconciliationClaimInput"];
type AdminPaymentReconciliationReleaseInput = AdminFinanceContracts["paymentReconciliationReleaseInput"];
type AdminPaymentReconciliationAssignmentResponse = AdminFinanceContracts["paymentReconciliationAssignmentResponse"];
type AdminPaymentReconciliationDecisionResponse = AdminFinanceContracts["paymentReconciliationDecisionResponse"];
type AdminWorkerFinanceSnapshotInput = AdminFinanceContracts["workerFinanceSnapshotInput"];
type AdminWorkerFinanceSnapshotResponse = AdminFinanceContracts["workerFinanceSnapshotResponse"];

const RECONCILIATION_SELECT = [
  "id",
  "job_id",
  "payment_method",
  "status",
  "gross_amount",
  "worker_id",
  "platform_fee",
  "worker_net",
  "amount_received",
  "customer_transfer_claimed_at",
  "response_deadline",
  "assigned_to",
  "assigned_at",
  "version",
  "created_at",
  "updated_at",
].join(",");

export async function getAdminWorkerFinanceSnapshot(
  ctx: MobileApiContext,
  workerId: string,
  input: AdminWorkerFinanceSnapshotInput,
): Promise<AdminWorkerFinanceSnapshotResponse> {
  await requireAdminCapability(ctx, "finance.read");
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("get_admin_worker_finance_snapshot", {
      p_actor_id: ctx.user.id,
      p_from: input.from ?? null,
      p_to: input.to ?? null,
      p_worker_id: workerId,
    }),
  );
  const row = result.data?.[0];
  if (result.error || !row) apiFailure("DB_ERROR", "Không thể tải thông tin tài chính của thợ", 500);
  return serializeWorkerFinanceSnapshot(row, workerId);
}

export async function listAdminPaymentReconciliations(
  ctx: MobileApiContext,
  input: AdminPaymentReconciliationListInput,
): Promise<AdminPaymentReconciliationListResponse> {
  await requireAdminCapability(ctx, "finance.read");
  let query = db(ctx)
    .from("job_payment_orders")
    .select(RECONCILIATION_SELECT)
    .limit(500);
  if (input.status === "pending") {
    query = query.in("status", [
      "manual_customer_claimed",
      "manual_reconcile_required",
      "direct_awaiting_customer_confirmation",
      "direct_awaiting_worker_confirmation",
      "direct_admin_confirmation_required",
      "direct_reconcile_required",
    ]);
  } else if (input.status === "reconcile_required") {
    query = query.in("status", ["manual_reconcile_required", "direct_reconcile_required"]);
  }
  if (input.payment_method !== "all") query = query.eq("payment_method", input.payment_method);
  if (input.assignment === "mine") query = query.eq("assigned_to", ctx.user.id);
  if (input.assignment === "unassigned") query = query.is("assigned_to", null);
  const result = await dbQuery<Row[]>(query);
  if (result.error) apiFailure("DB_ERROR", "Không thể tải hàng chờ đối soát", 500);
  const source = result.data ?? [];
  const jobs = await loadReconciliationJobs(ctx, source);
  const names = await loadReconciliationActorNames(ctx, source);
  const normalizedQuery = input.query?.trim().toLocaleLowerCase("vi") ?? null;
  const ordered = source
    .filter((row) => {
      if (!normalizedQuery) return true;
      const job = jobs.get(requiredString(row.job_id));
      return [nullableString(row.id), nullableString(row.job_id), nullableString(job?.display_code)]
        .some((value) => value?.toLocaleLowerCase("vi").includes(normalizedQuery));
    })
    .sort(compareReconciliations);
  const start = reconciliationCursorIndex(ordered, input.cursor);
  const page = ordered.slice(start, start + input.limit + 1);
  const visible = page.slice(0, input.limit);
  const rows = visible.map((row) => serializeReconciliation(row, jobs, names, ctx.user.id));
  return {
    generated_at: new Date().toISOString(),
    payment_reconciliations: rows,
    has_more: page.length > input.limit,
    next_cursor: page.length > input.limit ? reconciliationCursor(visible[visible.length - 1]) : null,
    total_count: ordered.length,
    total_amount_vnd: ordered.reduce((sum, row) => sum + (nonnegativeInteger(row.gross_amount) ?? 0), 0),
  };
}

export async function getAdminPaymentReconciliation(
  ctx: MobileApiContext,
  paymentOrderId: string,
): Promise<AdminPaymentReconciliationDetailResponse> {
  await requireAdminCapability(ctx, "finance.read");
  const orderResult = await dbQuery<Row>(
    db(ctx).from("job_payment_orders").select(RECONCILIATION_SELECT).eq("id", paymentOrderId).maybeSingle(),
  );
  if (orderResult.error) apiFailure("DB_ERROR", "Không thể tải chi tiết đối soát", 500);
  if (!orderResult.data) apiFailure("NOT_FOUND", "Không tìm thấy giao dịch đối soát", 404);
  const [jobs, names, eventResult] = await Promise.all([
    loadReconciliationJobs(ctx, [orderResult.data]),
    loadReconciliationActorNames(ctx, [orderResult.data]),
    dbQuery<Row[]>(db(ctx).from("job_payment_reconciliation_events")
      .select("id,event_type,actor_id,created_at")
      .eq("payment_order_id", paymentOrderId)
      .order("created_at", { ascending: true })
      .limit(100)),
  ]);
  if (eventResult.error) apiFailure("DB_ERROR", "Không thể tải lịch sử đối soát", 500);
  const job = jobs.get(requiredString(orderResult.data.job_id));
  if (!job) apiFailure("DB_ERROR", "Công việc đối soát không hợp lệ", 500);
  return {
    generated_at: new Date().toISOString(),
    reconciliation: serializeReconciliation(orderResult.data, jobs, names, ctx.user.id),
    customer_ref: maskedReference(requiredString(job.customer_id)),
    worker_ref: nullableString(orderResult.data.worker_id) ? maskedReference(requiredString(orderResult.data.worker_id)) : null,
    service_type: requiredString(job.service_type),
    expected_amount_vnd: requiredNonnegativeInteger(orderResult.data.gross_amount),
    received_amount_vnd: nonnegativeInteger(orderResult.data.amount_received),
    timeline: (eventResult.data ?? []).map((event) => ({
      event_id: requiredString(event.id),
      event_type: requiredString(event.event_type),
      actor_ref: nullableString(event.actor_id) ? maskedReference(requiredString(event.actor_id)) : null,
      occurred_at: requiredString(event.created_at),
    })),
  };
}

export async function claimAdminPaymentReconciliation(
  ctx: MobileApiContext,
  paymentOrderId: string,
  input: AdminPaymentReconciliationClaimInput,
): Promise<AdminPaymentReconciliationAssignmentResponse> {
  await requireAdminCapability(ctx, "finance.reconcile");
  return reconciliationAssignmentReceipt(ctx, "admin_claim_payment_reconciliation_atomic", paymentOrderId, {
    p_actor_id: ctx.user.id,
    p_client_request_id: input.client_request_id,
    p_expected_version: input.expected_version,
    p_payment_order_id: paymentOrderId,
    p_takeover_reason: input.takeover_reason ?? null,
  });
}

export async function releaseAdminPaymentReconciliation(
  ctx: MobileApiContext,
  paymentOrderId: string,
  input: AdminPaymentReconciliationReleaseInput,
): Promise<AdminPaymentReconciliationAssignmentResponse> {
  await requireAdminCapability(ctx, "finance.reconcile");
  return reconciliationAssignmentReceipt(ctx, "admin_release_payment_reconciliation_atomic", paymentOrderId, {
    p_actor_id: ctx.user.id,
    p_client_request_id: input.client_request_id,
    p_expected_version: input.expected_version,
    p_payment_order_id: paymentOrderId,
    p_reason: input.reason,
  });
}

export async function decideAdminPaymentReconciliation(
  ctx: MobileApiContext,
  paymentOrderId: string,
  input: AdminPaymentReconciliationDecisionInput,
): Promise<AdminPaymentReconciliationDecisionResponse> {
  await requireAdminCapability(ctx, "finance.reconcile");
  const isCashDecision = input.decision === "cash_confirm" || input.decision === "cash_reject";
  if (input.decision === "cash_reject" && (input.reason ?? "").trim().length < 3) {
    apiFailure("VALIDATION", "Hãy ghi rõ lý do từ chối xác nhận tiền mặt", 400);
  }
  const reference = !isCashDecision && input.bank_reference ? await hashBankReference(input.bank_reference) : null;
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("admin_decide_payment_reconciliation_v2", {
      p_actor_id: ctx.user.id,
      p_amount_received: input.amount_received ?? null,
      p_client_request_id: input.client_request_id,
      p_credited_at: input.credited_at ?? null,
      p_decision: input.decision,
      p_expected_version: input.expected_version,
      p_payment_order_id: paymentOrderId,
      p_reason_code: input.reason ?? null,
      ...(isCashDecision ? {} : {
        p_bank_reference_hash: reference?.hash ?? null,
        p_bank_reference_suffix: reference?.suffix ?? null,
      }),
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
    (outcome !== "paid" && outcome !== "reconcile_required" && outcome !== "direct_reconcile_required" && outcome !== "confirmed" && outcome !== "rejected") ||
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
    event_id: requiredString(row.event_id_out),
    version: requiredPositiveInteger(row.version_out),
    generated_at: requiredString(row.generated_at_out),
  };
}

function serializeReconciliation(
  row: Row,
  jobs: Map<string, Row>,
  names: Map<string, string | null>,
  actorId: string,
): AdminPaymentReconciliationListResponse["payment_reconciliations"][number] {
  const method = nullableString(row.payment_method);
  const grossAmount = nonnegativeInteger(row.gross_amount);
  const id = nullableString(row.id);
  const jobId = nullableString(row.job_id);
  const status = nullableString(row.status);
  const createdAt = nullableString(row.created_at);
  const updatedAt = nullableString(row.updated_at);
  const assignedTo = nullableString(row.assigned_to);
  const job = jobs.get(jobId ?? "");
  if (
    (method !== "platform_bank_manual" && method !== "direct_worker") ||
    grossAmount === null || grossAmount <= 0 || !id || !jobId || !status || !createdAt || !updatedAt || !job
  ) apiFailure("DB_ERROR", "Dữ liệu đối soát thanh toán không hợp lệ", 500);
  return {
    id,
    job_id: jobId,
    display_code: requiredString(job.display_code),
    payment_method: method,
    status,
    gross_amount: grossAmount,
    worker_id: requiredString(row.worker_id),
    platform_fee: nonnegativeInteger(row.platform_fee) ?? 0,
    worker_net: nonnegativeInteger(row.worker_net) ?? 0,
    settlement_state: settlementStateForReconciliation(status),
    amount_received: nullableNumber(row.amount_received),
    customer_transfer_claimed_at: nullableString(row.customer_transfer_claimed_at),
    response_deadline: nullableString(row.response_deadline),
    assigned_to: assignedTo,
    assigned_to_name: assignedTo ? names.get(assignedTo) ?? null : null,
    assigned_to_me: assignedTo === actorId,
    assigned_at: nullableString(row.assigned_at),
    version: requiredPositiveInteger(row.version),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

async function reconciliationAssignmentReceipt(
  ctx: MobileApiContext,
  rpcName: string,
  paymentOrderId: string,
  args: Record<string, unknown>,
): Promise<AdminPaymentReconciliationAssignmentResponse> {
  const result = await dbQuery<Row[]>(db(ctx).rpc(rpcName, args));
  const row = result.data?.[0];
  if (result.error || !row) apiFailure("DB_ERROR", "Không thể cập nhật người xử lý đối soát", 500);
  if (row.ok !== true) mapAssignmentError(nullableString(row.error_code));
  return {
    ok: true,
    payment_order_id: nullableString(row.payment_order_id) ?? paymentOrderId,
    assigned_to: nullableString(row.assigned_to_out),
    assigned_at: nullableString(row.assigned_at_out),
    version: requiredPositiveInteger(row.version_out),
    generated_at: requiredString(row.generated_at_out),
  };
}

async function loadReconciliationJobs(ctx: MobileApiContext, orders: Row[]): Promise<Map<string, Row>> {
  const ids = Array.from(new Set(orders.map((row) => nullableString(row.job_id)).filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();
  const result = await dbQuery<Row[]>(
    db(ctx).from("jobs").select("id,display_code,service_type,customer_id").in("id", ids),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải công việc đối soát", 500);
  return new Map((result.data ?? []).map((row) => [requiredString(row.id), row]));
}

async function loadReconciliationActorNames(ctx: MobileApiContext, orders: Row[]): Promise<Map<string, string | null>> {
  const ids = Array.from(new Set(orders.map((row) => nullableString(row.assigned_to)).filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();
  const result = await dbQuery<Row[]>(db(ctx).from("profiles").select("id,full_name").in("id", ids));
  if (result.error) apiFailure("DB_ERROR", "Không thể tải người xử lý đối soát", 500);
  return new Map((result.data ?? []).map((row) => [requiredString(row.id), nullableString(row.full_name)]));
}

function compareReconciliations(left: Row, right: Row) {
  const now = Date.now();
  const leftOverdue = Date.parse(nullableString(left.response_deadline) ?? "") < now ? 0 : 1;
  const rightOverdue = Date.parse(nullableString(right.response_deadline) ?? "") < now ? 0 : 1;
  if (leftOverdue !== rightOverdue) return leftOverdue - rightOverdue;
  const leftAssigned = nullableString(left.assigned_to) ? 1 : 0;
  const rightAssigned = nullableString(right.assigned_to) ? 1 : 0;
  if (leftAssigned !== rightAssigned) return leftAssigned - rightAssigned;
  const updated = requiredString(left.updated_at).localeCompare(requiredString(right.updated_at));
  return updated || requiredString(left.id).localeCompare(requiredString(right.id));
}

function reconciliationCursor(row: Row | undefined) {
  if (!row) return null;
  return btoa(JSON.stringify({ id: requiredString(row.id), updated_at: requiredString(row.updated_at) }))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function reconciliationCursorIndex(rows: Row[], cursor: string | undefined) {
  if (!cursor) return 0;
  try {
    const padded = cursor.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(cursor.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as { id?: unknown; updated_at?: unknown };
    const index = rows.findIndex((row) => row.id === parsed.id && row.updated_at === parsed.updated_at);
    return index < 0 ? 0 : index + 1;
  } catch {
    apiFailure("VALIDATION", "Con trỏ đối soát không hợp lệ", 400);
  }
}

function maskedReference(value: string) {
  return `***${value.slice(-6)}`;
}

function mapAssignmentError(code: string | null): never {
  if (code === "PAYMENT_ORDER_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy giao dịch đối soát", 404);
  if (code === "VERSION_CONFLICT") apiFailure("CONFLICT", "Dữ liệu đã thay đổi. Hãy tải lại trước khi tiếp tục", 409);
  if (code === "ALREADY_ASSIGNED" || code === "ASSIGNED_TO_OTHER") apiFailure("CONFLICT", "Giao dịch đang do quản trị viên khác xử lý", 409);
  if (code === "TAKEOVER_REASON_REQUIRED" || code === "REASON_REQUIRED") apiFailure("VALIDATION", "Hãy ghi rõ lý do thay đổi người xử lý", 400);
  if (code === "IDEMPOTENCY_CONFLICT") apiFailure("CONFLICT", "Mã yêu cầu đã được dùng cho thao tác khác", 409);
  apiFailure("RECONCILIATION_ASSIGNMENT_FAILED", "Không thể cập nhật người xử lý đối soát", 409);
}

function serializeWorkerFinanceSnapshot(row: Row, expectedWorkerId: string): AdminWorkerFinanceSnapshotResponse {
  if (nullableString(row.worker_id) !== expectedWorkerId) {
    apiFailure("DB_ERROR", "Thông tin tài chính không thuộc về thợ được yêu cầu", 500);
  }
  return {
    worker_id: expectedWorkerId,
    total_jobs_paid: requiredNonnegativeInteger(row.total_jobs_paid),
    gross_earnings: requiredNonnegativeInteger(row.gross_earnings),
    platform_fee_total: requiredNonnegativeInteger(row.platform_fee_total),
    net_earnings: requiredNonnegativeInteger(row.net_earnings),
    available_balance: requiredNonnegativeInteger(row.available_balance),
    withdrawal_reserved_amount: requiredNonnegativeInteger(row.withdrawal_reserved_amount),
    withdrawn_total: requiredNonnegativeInteger(row.withdrawn_total),
    cash_commission_collected_total: requiredNonnegativeInteger(row.cash_commission_collected_total),
    cash_commission_due_total: requiredNonnegativeInteger(row.cash_commission_due_total),
    pending_payment_count: requiredNonnegativeInteger(row.pending_payment_count),
    pending_payment_amount: requiredNonnegativeInteger(row.pending_payment_amount),
    provisional_payment_count: requiredNonnegativeInteger(row.provisional_payment_count),
    provisional_payment_amount: requiredNonnegativeInteger(row.provisional_payment_amount),
    on_hold_amount: requiredNonnegativeInteger(row.on_hold_amount),
    current_commission_level: requiredPositiveInteger(row.current_commission_level),
    current_commission_rate_bps: requiredCommissionRateBps(row.current_commission_rate_bps),
    withdrawal_eligible_at: optionalTimestamp(row.withdrawal_eligible_at),
    recent_transactions: serializeWorkerFinanceTransactions(row.recent_transactions),
    daily_earnings: serializeWorkerDailyEarnings(row.daily_earnings),
    from_date: optionalTimestamp(row.from_date),
    to_date: optionalTimestamp(row.to_date),
  };
}

function serializeWorkerFinanceTransactions(value: unknown): AdminWorkerFinanceSnapshotResponse["recent_transactions"] {
  if (!Array.isArray(value) || value.length > 20) invalidWorkerFinanceSnapshot();
  return value.map((entry) => {
    if (!isRecord(entry)) invalidWorkerFinanceSnapshot();
    const jobId = nullableString(entry.job_id);
    const recordedAt = requiredTimestamp(entry.recorded_at);
    if (!jobId || !recordedAt) invalidWorkerFinanceSnapshot();
    return {
      job_id: jobId,
      display_code: nullableString(entry.display_code),
      entry_type: workerFinanceEntryType(entry.entry_type),
      payment_state: workerFinancePaymentState(entry.payment_state),
      settlement_state: workerFinanceSettlementState(entry.settlement_state),
      gross_amount: requiredNonnegativeInteger(entry.gross_amount),
      platform_fee: requiredNonnegativeInteger(entry.platform_fee),
      worker_net: requiredNonnegativeInteger(entry.worker_net),
      commission_level: requiredPositiveInteger(entry.commission_level),
      commission_rate_bps: requiredCommissionRateBps(entry.commission_rate_bps),
      cash_commission_collected: requiredNonnegativeInteger(entry.cash_commission_collected),
      cash_commission_due: requiredNonnegativeInteger(entry.cash_commission_due),
      recorded_at: recordedAt,
      available_at: optionalTimestamp(entry.available_at),
    };
  });
}

function serializeWorkerDailyEarnings(value: unknown): AdminWorkerFinanceSnapshotResponse["daily_earnings"] {
  if (!Array.isArray(value) || value.length > 366) invalidWorkerFinanceSnapshot();
  let previousDate: string | null = null;
  return value.map((entry) => {
    if (!isRecord(entry) || !isIsoDate(entry.date)) invalidWorkerFinanceSnapshot();
    if (previousDate !== null && entry.date >= previousDate) invalidWorkerFinanceSnapshot();
    previousDate = entry.date;
    return {
      date: entry.date,
      gross_earnings: requiredNonnegativeInteger(entry.gross_earnings),
      platform_fee_total: requiredNonnegativeInteger(entry.platform_fee_total),
      net_earnings: requiredNonnegativeInteger(entry.net_earnings),
      paid_job_count: requiredNonnegativeInteger(entry.paid_job_count),
    };
  });
}

function workerFinanceEntryType(value: unknown): AdminWorkerFinanceSnapshotResponse["recent_transactions"][number]["entry_type"] {
  if (value === "worker_credit" || value === "cash_commission_debit") return value;
  invalidWorkerFinanceSnapshot();
}

function workerFinancePaymentState(value: unknown): AdminWorkerFinanceSnapshotResponse["recent_transactions"][number]["payment_state"] {
  if (value === "pending" || value === "available" || value === "on_hold" || value === "reversed" || value === "cash_collected" || value === "cash_reconciliation_due") return value;
  invalidWorkerFinanceSnapshot();
}

function workerFinanceSettlementState(value: unknown): AdminWorkerFinanceSnapshotResponse["recent_transactions"][number]["settlement_state"] {
  if (value === "pending" || value === "customer_claimed" || value === "admin_verified" || value === "admin_rejected") return value;
  invalidWorkerFinanceSnapshot();
}

function requiredNonnegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalidWorkerFinanceSnapshot();
  return value;
}

function requiredPositiveInteger(value: unknown): number {
  const parsed = requiredNonnegativeInteger(value);
  if (parsed <= 0) invalidWorkerFinanceSnapshot();
  return parsed;
}

function requiredCommissionRateBps(value: unknown): number {
  const parsed = requiredNonnegativeInteger(value);
  if (parsed > 1500) invalidWorkerFinanceSnapshot();
  return parsed;
}

function requiredTimestamp(value: unknown): string | null {
  const raw = nullableString(value);
  return raw ? normalizeIsoTimestamp(raw) : null;
}

function optionalTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = requiredTimestamp(value);
  if (!parsed) invalidWorkerFinanceSnapshot();
  return parsed;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function invalidWorkerFinanceSnapshot(): never {
  apiFailure("DB_ERROR", "Thông tin tài chính của thợ không hợp lệ", 500);
}

function requiredString(value: unknown): string {
  const parsed = nullableString(value);
  if (!parsed) apiFailure("DB_ERROR", "Dữ liệu đối soát thiếu thông tin thợ", 500);
  return parsed;
}

function settlementStateForReconciliation(status: string): "pending" | "customer_claimed" | "admin_verified" | "admin_rejected" {
  if (status === "manual_customer_claimed" || status === "direct_admin_confirmation_required" || status === "direct_awaiting_customer_confirmation" || status === "direct_awaiting_worker_confirmation") return "customer_claimed";
  if (status === "manual_verified" || status === "direct_paid") return "admin_verified";
  if (status === "manual_reconcile_required" || status === "direct_reconcile_required") return "admin_rejected";
  return "pending";
}

async function hashBankReference(value: string) {
  const normalized = value.trim();
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  const hash = Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { hash, suffix: normalized.slice(-16) };
}

function nonnegativeInteger(value: unknown): number | null { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null; }

function mapDecisionError(code: string | null): never {
  if (code === "PAYMENT_ORDER_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy lệnh thanh toán", 404);
  if (code === "BANK_REFERENCE_USED") apiFailure("CONFLICT", "Mã giao dịch ngân hàng đã được dùng cho công việc khác", 409);
  if (code === "INVALID_STATUS") apiFailure("STATUS_CHANGED", "Lệnh thanh toán đã thay đổi trạng thái", 409);
  if (code === "VERSION_CONFLICT") apiFailure("CONFLICT", "Dữ liệu đã thay đổi. Hãy tải lại trước khi tiếp tục", 409);
  if (code === "RECONCILIATION_NOT_CLAIMED") apiFailure("CONFLICT", "Hãy nhận xử lý giao dịch trước khi ghi quyết định", 409);
  if (code === "ASSIGNED_TO_OTHER") apiFailure("AUTH_FORBIDDEN", "Giao dịch đang do quản trị viên khác xử lý", 403);
  if (code === "IDEMPOTENCY_CONFLICT") apiFailure("CONFLICT", "Mã yêu cầu đã được dùng cho thao tác khác", 409);
  if (code === "INVALID_INPUT") apiFailure("VALIDATION", "Thông tin đối soát không hợp lệ", 400);
  if (code === "COLLATERAL_NOT_FOUND" || code === "WORKER_LEDGER_INVALID") {
    apiFailure("CONFLICT", "Biên nhận thanh toán cần được kiểm tra thêm", 409);
  }
  if (code === "WITHDRAWAL_NOT_ELIGIBLE") {
    apiFailure("CONFLICT", "Yêu cầu rút tiền chưa đủ thời gian chờ 24 giờ", 409);
  }
  apiFailure("PAYMENT_RECONCILIATION_FAILED", "Không thể xử lý đối soát thanh toán", 409);
}
