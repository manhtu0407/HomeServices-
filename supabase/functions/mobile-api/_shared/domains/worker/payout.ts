import type {
  WorkerPayoutMethodSaveRequest,
  EdgeWorkerWithdrawalRequestCreateInput,
} from "../../../../_shared/worker-payout-contract.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type {
  EdgeWorkerPayoutMethod,
  EdgeWorkerPayoutMethodResponse,
  EdgeWorkerWithdrawalRequest,
  EdgeWorkerWithdrawalRequestCreateResponse,
  EdgeWorkerWithdrawalRequestListResponse,
  WorkerPayoutMethodStatus,
  WorkerWithdrawalRequestStatus,
} from "../contracts/worker-payout.ts";
import {
  asString,
  nullableNumber,
  nullableString,
} from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";

type Row = Record<string, unknown>;

const PAYOUT_METHOD_COLUMNS = [
  "id",
  "bank_key",
  "bank_name",
  "bank_account_masked",
  "status",
  "reviewed_at",
  "updated_at",
].join(",");

const WITHDRAWAL_REQUEST_COLUMNS = [
  "id",
  "amount_vnd",
  "available_balance_before_vnd",
  "bank_key",
  "bank_name",
  "bank_account_masked",
  "status",
  "requested_at",
  "eligible_at",
  "processing_at",
  "processed_at",
  "transfer_reference",
  "resolution_reason",
  "updated_at",
].join(",");

export async function getWorkerPayoutMethod(
  ctx: MobileApiContext,
): Promise<EdgeWorkerPayoutMethodResponse> {
  requireWorker(ctx);
  const result = await dbQuery<Row>(
    db(ctx)
      .from("worker_payout_methods")
      .select(PAYOUT_METHOD_COLUMNS)
      .eq("worker_id", ctx.user.id)
      .eq("is_default", true)
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Chưa thể tải tài khoản nhận tiền", 500);
  }
  return { payout_method: result.data ? serializePayoutMethod(result.data) : null };
}

export async function saveWorkerPayoutMethod(
  ctx: MobileApiContext,
  input: WorkerPayoutMethodSaveRequest,
): Promise<EdgeWorkerPayoutMethodResponse> {
  requireWorker(ctx);
  // The database RPC stores the raw number atomically and returns only a mask.
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("upsert_worker_payout_method", {
      p_account_holder_name: input.account_holder_name.trim(),
      p_bank_account: input.bank_account.trim(),
      p_bank_key: input.bank_key,
      p_worker_id: ctx.user.id,
    }),
  );
  const row = result.data?.[0];
  if (result.error || !row) {
    apiFailure("DB_ERROR", "Chưa thể lưu tài khoản nhận tiền", 500);
  }
  return { payout_method: serializePayoutMethod(row) };
}

export async function listWorkerWithdrawalRequests(
  ctx: MobileApiContext,
): Promise<EdgeWorkerWithdrawalRequestListResponse> {
  requireWorker(ctx);
  const result = await dbQuery<Row[]>(
    db(ctx)
      .from("worker_withdrawal_requests")
      .select(WITHDRAWAL_REQUEST_COLUMNS)
      .eq("worker_id", ctx.user.id)
      .order("requested_at", { ascending: false })
      .limit(20),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Chưa thể tải yêu cầu rút tiền", 500);
  }
  return { requests: (result.data ?? []).map(serializeWithdrawalRequest) };
}

export async function createWorkerWithdrawalRequest(
  ctx: MobileApiContext,
  input: EdgeWorkerWithdrawalRequestCreateInput,
): Promise<EdgeWorkerWithdrawalRequestCreateResponse> {
  requireWorker(ctx);
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("create_worker_withdrawal_request", {
      p_amount_vnd: input.amount_vnd,
      p_client_request_id: input.client_request_id,
      p_worker_id: ctx.user.id,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Chưa thể tạo yêu cầu rút tiền", 500);
  }
  const row = result.data?.[0];
  if (!row) {
    apiFailure("DB_ERROR", "Yêu cầu rút tiền chưa có biên nhận hợp lệ", 500);
  }
  if (row.ok !== true) mapWithdrawalCreateError(nullableString(row.error_code));
  const requestId = nullableString(row.request_id);
  if (!requestId) apiFailure("DB_ERROR", "Yêu cầu rút tiền chưa có mã hợp lệ", 500);
  const requestResult = await dbQuery<Row>(
    db(ctx)
      .from("worker_withdrawal_requests")
      .select(WITHDRAWAL_REQUEST_COLUMNS)
      .eq("id", requestId)
      .maybeSingle(),
  );
  if (requestResult.error || !requestResult.data) {
    apiFailure("DB_ERROR", "Không thể tải biên nhận yêu cầu rút tiền", 500);
  }
  return { request: serializeWithdrawalRequest(requestResult.data) };
}

function requireWorker(ctx: MobileApiContext): void {
  if (ctx.role !== "worker") {
    apiFailure("AUTH_FORBIDDEN", "Tài khoản không có quyền rút tiền", 403);
  }
}

function serializePayoutMethod(row: Row): EdgeWorkerPayoutMethod {
  const id = nullableString(row.id);
  const bankKey = nullableString(row.bank_key);
  const bankName = nullableString(row.bank_name);
  const bankAccountMasked = nullableString(row.bank_account_masked);
  const status = payoutMethodStatus(row.status);
  const updatedAt = nullableString(row.updated_at);
  const reviewedAt = row.reviewed_at === null ? null : nullableString(row.reviewed_at);
  if (!id || !bankKey || !bankName || !bankAccountMasked || !status || !updatedAt || (row.reviewed_at !== null && !reviewedAt)) {
    apiFailure("DB_ERROR", "Tài khoản nhận tiền có dữ liệu không hợp lệ", 500);
  }
  return {
    id,
    bank_key: bankKey,
    bank_name: bankName,
    bank_account_masked: bankAccountMasked,
    status,
    reviewed_at: reviewedAt,
    updated_at: updatedAt,
  };
}

function serializeWithdrawalRequest(row: Row): EdgeWorkerWithdrawalRequest {
  const id = nullableString(row.id);
  const amount = nonnegativeInteger(row.amount_vnd);
  const balance = nonnegativeInteger(row.available_balance_before_vnd);
  const bankKey = nullableString(row.bank_key);
  const bankName = nullableString(row.bank_name);
  const bankAccountMasked = nullableString(row.bank_account_masked);
  const status = withdrawalStatus(row.status);
  const requestedAt = nullableString(row.requested_at);
  const eligibleAt = nullableString(row.eligible_at);
  const updatedAt = nullableString(row.updated_at);
  const processingAt = row.processing_at === null ? null : nullableString(row.processing_at);
  const processedAt = row.processed_at === null ? null : nullableString(row.processed_at);
  if (!id || amount === null || balance === null || !bankKey || !bankName || !bankAccountMasked || !status || !requestedAt || !eligibleAt || !updatedAt || (row.processing_at !== null && !processingAt) || (row.processed_at !== null && !processedAt)) {
    apiFailure("DB_ERROR", "Yêu cầu rút tiền có dữ liệu không hợp lệ", 500);
  }
  return {
    id,
    amount_vnd: amount,
    available_balance_before_vnd: balance,
    bank_key: bankKey,
    bank_name: bankName,
    bank_account_masked: bankAccountMasked,
    status,
    requested_at: requestedAt,
    eligible_at: eligibleAt,
    processing_at: processingAt,
    processed_at: processedAt,
    transfer_reference: nullableString(row.transfer_reference),
    resolution_reason: nullableString(row.resolution_reason),
    updated_at: updatedAt,
  };
}

function payoutMethodStatus(value: unknown): WorkerPayoutMethodStatus | null {
  return value === "pending_verification" || value === "verified" || value === "rejected"
    ? value
    : null;
}

function withdrawalStatus(value: unknown): WorkerWithdrawalRequestStatus | null {
  return value === "pending" || value === "processing" || value === "paid" || value === "rejected" || value === "failed"
    ? value
    : null;
}

function nonnegativeInteger(value: unknown): number | null {
  const number = nullableNumber(value);
  return number !== null && Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function mapWithdrawalCreateError(code: string | null): never {
  if (code === "WORKER_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ thợ", 404);
  if (code === "WORKER_NOT_ELIGIBLE") apiFailure("AUTH_FORBIDDEN", "Tài khoản thợ chưa đủ điều kiện rút tiền", 403);
  if (code === "PAYOUT_METHOD_MISSING") apiFailure("PAYOUT_METHOD_MISSING", "Hãy thêm tài khoản nhận tiền trước khi rút", 409);
  if (code === "PAYOUT_METHOD_NOT_VERIFIED") apiFailure("PAYOUT_METHOD_NOT_VERIFIED", "Tài khoản nhận tiền đang chờ quản trị viên xác nhận", 409);
  if (code === "INSUFFICIENT_BALANCE") apiFailure("INSUFFICIENT_BALANCE", "Số dư có thể rút không đủ cho yêu cầu này", 409);
  if (code === "CLIENT_REQUEST_MISMATCH") apiFailure("IDEMPOTENCY_CONFLICT", "Yêu cầu rút tiền đã được gửi với số tiền khác", 409);
  if (code === "INVALID_INPUT") apiFailure("VALIDATION", "Yêu cầu rút tiền không hợp lệ", 400);
  apiFailure("WITHDRAWAL_CREATE_FAILED", "Chưa thể tạo yêu cầu rút tiền", 409);
}
