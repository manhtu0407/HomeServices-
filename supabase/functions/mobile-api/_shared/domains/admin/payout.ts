import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type {
  AdminPayoutMethodDecisionInput,
  AdminPayoutMethodDecisionResponse,
  AdminPayoutMethodDetailResponse,
  AdminPayoutMethodListInput,
  AdminPayoutMethodListResponse,
  AdminPayoutMethodStatus,
  AdminPayoutMethodSummary,
  AdminWithdrawalRequestClaimResponse,
  AdminWithdrawalRequestDetailResponse,
  AdminWithdrawalRequestListInput,
  AdminWithdrawalRequestListResponse,
  AdminWithdrawalRequestResolveInput,
  AdminWithdrawalRequestResolveResponse,
  AdminWithdrawalRequestStatus,
  AdminWithdrawalRequestSummary,
} from "../contracts/admin-payout.ts";
import { requireAdminCapability } from "./control.ts";
import {
  asString,
  nullableNumber,
  nullableString,
} from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";

type Row = Record<string, unknown>;

const PAYOUT_METHOD_SAFE_SELECT = [
  "id",
  "worker_id",
  "bank_key",
  "bank_name",
  "bank_account_masked",
  "status",
  "reviewed_at",
  "review_reason",
  "created_at",
  "updated_at",
].join(",");
const PAYOUT_METHOD_DETAIL_SELECT = `${PAYOUT_METHOD_SAFE_SELECT},account_holder_name,bank_account`;
const WITHDRAWAL_SAFE_SELECT = [
  "id",
  "worker_id",
  "amount_vnd",
  "available_balance_before_vnd",
  "bank_key",
  "bank_name",
  "bank_account_masked",
  "status",
  "requested_at",
  "processing_at",
  "processing_by",
  "processed_at",
  "processed_by",
  "transfer_reference",
  "resolution_reason",
  "updated_at",
].join(",");
const WITHDRAWAL_DETAIL_SELECT = `${WITHDRAWAL_SAFE_SELECT},account_holder_name,bank_account`;

export async function listAdminPayoutMethods(
  ctx: MobileApiContext,
  input: AdminPayoutMethodListInput,
): Promise<AdminPayoutMethodListResponse> {
  await requireAdminCapability(ctx, "payouts.read");
  let query = db(ctx)
    .from("worker_payout_methods")
    .select(PAYOUT_METHOD_SAFE_SELECT, { count: "exact" })
    .order("created_at", { ascending: true })
    .range(input.offset, input.offset + input.limit);
  if (input.status !== "all") query = query.eq("status", input.status);

  const result = await dbQuery<Row[]>(query);
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải danh sách tài khoản nhận tiền", 500);
  }
  const page = result.data ?? [];
  const payoutMethods = page.slice(0, input.limit);
  const profileNames = await loadProfileNames(
    ctx,
    payoutMethods.map((method) => nullableString(method.worker_id)),
  );
  return {
    payout_methods: payoutMethods.map((method) =>
      serializePayoutMethodSummary(method, profileNames.get(requiredString(method.worker_id))),
    ),
    has_more: page.length > input.limit,
    next_offset: page.length > input.limit ? input.offset + payoutMethods.length : null,
    total_count: nonnegativeInteger(result.count),
  };
}

export async function getAdminPayoutMethod(
  ctx: MobileApiContext,
  payoutMethodId: string,
): Promise<AdminPayoutMethodDetailResponse> {
  await requireAdminCapability(ctx, "payouts.process");
  const result = await dbQuery<Row>(
    db(ctx)
      .from("worker_payout_methods")
      .select(PAYOUT_METHOD_DETAIL_SELECT)
      .eq("id", payoutMethodId)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải tài khoản nhận tiền", 500);
  if (!result.data) apiFailure("NOT_FOUND", "Không tìm thấy tài khoản nhận tiền", 404);

  const workerId = requiredString(result.data.worker_id);
  const profileNames = await loadProfileNames(ctx, [workerId]);
  return {
    payout_method: {
      ...serializePayoutMethodSummary(result.data, profileNames.get(workerId)),
      account_holder_name: requiredString(result.data.account_holder_name),
      bank_account: requiredString(result.data.bank_account),
    },
  };
}

export async function decideAdminPayoutMethod(
  ctx: MobileApiContext,
  payoutMethodId: string,
  input: AdminPayoutMethodDecisionInput,
): Promise<AdminPayoutMethodDecisionResponse> {
  await requireAdminCapability(ctx, "payouts.process");
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("admin_review_worker_payout_method_atomic", {
      p_actor_id: ctx.user.id,
      p_payout_method_id: payoutMethodId,
      p_decision: input.decision,
      p_reason: input.reason ?? null,
    }),
  );
  if (result.error || !result.data?.[0]) {
    apiFailure("DB_ERROR", "Không thể lưu quyết định xác nhận tài khoản", 500);
  }
  const row = result.data[0];
  if (row.ok !== true) mapPayoutMethodDecisionError(nullableString(row.error_code));
  const status = payoutMethodStatus(row.status_out);
  const reviewedAt = nullableString(row.reviewed_at_out);
  if (!status || status === "pending_verification" || !reviewedAt) {
    apiFailure("DB_ERROR", "Quyết định xác nhận tài khoản không có biên nhận hợp lệ", 500);
  }
  return {
    ok: true,
    payout_method_id: asString(row.payout_method_id) || payoutMethodId,
    status,
    reviewed_at: reviewedAt,
  };
}

export async function listAdminWithdrawalRequests(
  ctx: MobileApiContext,
  input: AdminWithdrawalRequestListInput,
): Promise<AdminWithdrawalRequestListResponse> {
  await requireAdminCapability(ctx, "payouts.read");
  let query = db(ctx)
    .from("worker_withdrawal_requests")
    .select(WITHDRAWAL_SAFE_SELECT, { count: "exact" })
    .order("requested_at", { ascending: true })
    .range(input.offset, input.offset + input.limit);
  if (input.status !== "all") query = query.eq("status", input.status);

  const result = await dbQuery<Row[]>(query);
  if (result.error) apiFailure("DB_ERROR", "Không thể tải yêu cầu rút tiền", 500);
  const page = result.data ?? [];
  const requests = page.slice(0, input.limit);
  const profileNames = await loadProfileNames(ctx, requests.flatMap((request) => [
    nullableString(request.worker_id),
    nullableString(request.processing_by),
    nullableString(request.processed_by),
  ]));
  return {
    withdrawal_requests: requests.map((request) => serializeWithdrawalSummary(request, profileNames)),
    has_more: page.length > input.limit,
    next_offset: page.length > input.limit ? input.offset + requests.length : null,
    total_count: nonnegativeInteger(result.count),
  };
}

export async function getAdminWithdrawalRequest(
  ctx: MobileApiContext,
  withdrawalRequestId: string,
): Promise<AdminWithdrawalRequestDetailResponse> {
  await requireAdminCapability(ctx, "payouts.process");
  const result = await dbQuery<Row>(
    db(ctx)
      .from("worker_withdrawal_requests")
      .select(WITHDRAWAL_DETAIL_SELECT)
      .eq("id", withdrawalRequestId)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải chi tiết yêu cầu rút tiền", 500);
  if (!result.data) apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu rút tiền", 404);

  const profileNames = await loadProfileNames(ctx, [
    nullableString(result.data.worker_id),
    nullableString(result.data.processing_by),
    nullableString(result.data.processed_by),
  ]);
  return {
    withdrawal_request: {
      ...serializeWithdrawalSummary(result.data, profileNames),
      account_holder_name: requiredString(result.data.account_holder_name),
      bank_account: requiredString(result.data.bank_account),
    },
  };
}

export async function claimAdminWithdrawalRequest(
  ctx: MobileApiContext,
  withdrawalRequestId: string,
): Promise<AdminWithdrawalRequestClaimResponse> {
  await requireAdminCapability(ctx, "payouts.process");
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("admin_claim_worker_withdrawal_atomic", {
      p_actor_id: ctx.user.id,
      p_request_id: withdrawalRequestId,
    }),
  );
  if (result.error || !result.data?.[0]) {
    apiFailure("DB_ERROR", "Không thể nhận xử lý yêu cầu rút tiền", 500);
  }
  const row = result.data[0];
  if (row.ok !== true) mapWithdrawalClaimError(nullableString(row.error_code));
  const processingBy = nullableString(row.processing_by_out);
  const processingAt = nullableString(row.processing_at_out);
  if (row.status_out !== "processing" || !processingBy || !processingAt) {
    apiFailure("DB_ERROR", "Yêu cầu rút tiền không có biên nhận xử lý hợp lệ", 500);
  }
  return {
    ok: true,
    request_id: asString(row.request_id) || withdrawalRequestId,
    status: "processing",
    processing_by: processingBy,
    processing_at: processingAt,
  };
}

export async function resolveAdminWithdrawalRequest(
  ctx: MobileApiContext,
  withdrawalRequestId: string,
  input: AdminWithdrawalRequestResolveInput,
): Promise<AdminWithdrawalRequestResolveResponse> {
  await requireAdminCapability(ctx, "payouts.process");
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("admin_resolve_worker_withdrawal_atomic", {
      p_actor_id: ctx.user.id,
      p_request_id: withdrawalRequestId,
      p_decision: input.decision,
      p_transfer_reference: input.transfer_reference ?? null,
      p_reason: input.reason ?? null,
    }),
  );
  if (result.error || !result.data?.[0]) {
    apiFailure("DB_ERROR", "Không thể lưu kết quả chi trả", 500);
  }
  const row = result.data[0];
  if (row.ok !== true) mapWithdrawalResolveError(nullableString(row.error_code));
  const status = withdrawalStatus(row.status_out);
  const processedAt = nullableString(row.processed_at_out);
  if (!status || status === "pending" || status === "processing" || !processedAt) {
    apiFailure("DB_ERROR", "Kết quả chi trả không có biên nhận hợp lệ", 500);
  }
  return {
    ok: true,
    request_id: asString(row.request_id) || withdrawalRequestId,
    status,
    processed_at: processedAt,
  };
}

async function loadProfileNames(
  ctx: MobileApiContext,
  ids: Array<string | null>,
): Promise<Map<string, string | null>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (uniqueIds.length === 0) return new Map();
  const result = await dbQuery<Row[]>(
    db(ctx).from("profiles").select("id,full_name").in("id", uniqueIds),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải thông tin người nhận chi trả", 500);
  return new Map((result.data ?? []).flatMap((profile) => {
    const id = nullableString(profile.id);
    return id ? [[id, nullableString(profile.full_name)] as const] : [];
  }));
}

function serializePayoutMethodSummary(
  row: Row,
  workerName: string | null | undefined,
): AdminPayoutMethodSummary {
  const status = payoutMethodStatus(row.status);
  if (!status) apiFailure("DB_ERROR", "Tài khoản nhận tiền có trạng thái không hợp lệ", 500);
  return {
    id: requiredString(row.id),
    worker_id: requiredString(row.worker_id),
    worker_name: workerName ?? null,
    bank_key: requiredString(row.bank_key),
    bank_name: requiredString(row.bank_name),
    bank_account_masked: requiredString(row.bank_account_masked),
    status,
    reviewed_at: optionalTimestamp(row.reviewed_at),
    review_reason: nullableString(row.review_reason),
    created_at: requiredString(row.created_at),
    updated_at: requiredString(row.updated_at),
  };
}

function serializeWithdrawalSummary(
  row: Row,
  profileNames: Map<string, string | null>,
): AdminWithdrawalRequestSummary {
  const workerId = requiredString(row.worker_id);
  const processingBy = nullableString(row.processing_by);
  const processedBy = nullableString(row.processed_by);
  const status = withdrawalStatus(row.status);
  const amount = nonnegativeInteger(row.amount_vnd);
  const balance = nonnegativeInteger(row.available_balance_before_vnd);
  if (!status || amount === null || balance === null) {
    apiFailure("DB_ERROR", "Yêu cầu rút tiền có dữ liệu không hợp lệ", 500);
  }
  return {
    id: requiredString(row.id),
    worker_id: workerId,
    worker_name: profileNames.get(workerId) ?? null,
    amount_vnd: amount,
    available_balance_before_vnd: balance,
    bank_key: requiredString(row.bank_key),
    bank_name: requiredString(row.bank_name),
    bank_account_masked: requiredString(row.bank_account_masked),
    status,
    requested_at: requiredString(row.requested_at),
    processing_at: optionalTimestamp(row.processing_at),
    processing_by_name: processingBy ? profileNames.get(processingBy) ?? null : null,
    processed_at: optionalTimestamp(row.processed_at),
    processed_by_name: processedBy ? profileNames.get(processedBy) ?? null : null,
    transfer_reference: nullableString(row.transfer_reference),
    resolution_reason: nullableString(row.resolution_reason),
    updated_at: requiredString(row.updated_at),
  };
}

function requiredString(value: unknown): string {
  const parsed = nullableString(value);
  if (!parsed) apiFailure("DB_ERROR", "Dữ liệu chi trả không có trường bắt buộc", 500);
  return parsed;
}

function optionalTimestamp(value: unknown): string | null {
  return value === null || value === undefined ? null : requiredString(value);
}

function nonnegativeInteger(value: unknown): number | null {
  const number = nullableNumber(value);
  return number !== null && Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function payoutMethodStatus(value: unknown): AdminPayoutMethodStatus | null {
  return value === "pending_verification" || value === "verified" || value === "rejected"
    ? value
    : null;
}

function withdrawalStatus(value: unknown): AdminWithdrawalRequestStatus | null {
  return value === "pending" || value === "processing" || value === "paid" || value === "rejected" || value === "failed"
    ? value
    : null;
}

function mapPayoutMethodDecisionError(code: string | null): never {
  if (code === "PAYOUT_PROCESS_REQUIRED") {
    apiFailure("AUTH_FORBIDDEN", "Tài khoản chưa được cấp quyền xử lý chi trả", 403);
  }
  if (code === "PAYOUT_METHOD_NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy tài khoản nhận tiền", 404);
  }
  if (code === "PAYOUT_METHOD_ALREADY_REVIEWED") {
    apiFailure("ALREADY_REVIEWED", "Tài khoản nhận tiền đã có quyết định", 409);
  }
  if (code === "INVALID_INPUT") {
    apiFailure("VALIDATION", "Quyết định xác nhận tài khoản không hợp lệ", 400);
  }
  apiFailure("PAYOUT_METHOD_REVIEW_FAILED", "Không thể lưu quyết định xác nhận tài khoản", 409);
}

function mapWithdrawalClaimError(code: string | null): never {
  if (code === "PAYOUT_PROCESS_REQUIRED") {
    apiFailure("AUTH_FORBIDDEN", "Tài khoản chưa được cấp quyền xử lý chi trả", 403);
  }
  if (code === "WITHDRAWAL_NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu rút tiền", 404);
  }
  if (code === "WITHDRAWAL_ALREADY_PROCESSING") {
    apiFailure("CONFLICT", "Yêu cầu rút tiền đang do quản trị viên khác xử lý", 409);
  }
  if (code === "WITHDRAWAL_ALREADY_RESOLVED") {
    apiFailure("ALREADY_RESOLVED", "Yêu cầu rút tiền đã được xử lý", 409);
  }
  apiFailure("WITHDRAWAL_CLAIM_FAILED", "Không thể nhận xử lý yêu cầu rút tiền", 409);
}

function mapWithdrawalResolveError(code: string | null): never {
  if (code === "PAYOUT_PROCESS_REQUIRED") {
    apiFailure("AUTH_FORBIDDEN", "Tài khoản chưa được cấp quyền xử lý chi trả", 403);
  }
  if (code === "WITHDRAWAL_NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu rút tiền", 404);
  }
  if (code === "WITHDRAWAL_NOT_PROCESSING") {
    apiFailure("CONFLICT", "Hãy nhận xử lý yêu cầu trước khi cập nhật kết quả", 409);
  }
  if (code === "WITHDRAWAL_ASSIGNED_TO_OTHER") {
    apiFailure("AUTH_FORBIDDEN", "Yêu cầu này đang do quản trị viên khác xử lý", 403);
  }
  if (code === "INVALID_INPUT") {
    apiFailure("VALIDATION", "Kết quả chi trả không hợp lệ", 400);
  }
  apiFailure("WITHDRAWAL_RESOLVE_FAILED", "Không thể lưu kết quả chi trả", 409);
}
