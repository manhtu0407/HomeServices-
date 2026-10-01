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
  AdminSensitivePayoutAccessInput,
  AdminSensitivePayoutAccessResponse,
  AdminWithdrawalRequestClaimInput,
  AdminWithdrawalRequestClaimResponse,
  AdminWithdrawalRequestDetailResponse,
  AdminWithdrawalRequestListInput,
  AdminWithdrawalRequestListResponse,
  AdminWithdrawalRequestResolveInput,
  AdminWithdrawalRequestResolveResponse,
  AdminWithdrawalRequestReleaseInput,
  AdminWithdrawalRequestReleaseResponse,
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
import { scopeQueryToRealTraffic } from "../../platform/synthetic-cohort.ts";

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
  "version",
].join(",");
const PAYOUT_METHOD_DETAIL_SELECT = PAYOUT_METHOD_SAFE_SELECT;
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
  "eligible_at",
  "processing_at",
  "processing_by",
  "processed_at",
  "processed_by",
  "transfer_reference_suffix",
  "resolution_reason",
  "updated_at",
  "version",
].join(",");
const WITHDRAWAL_DETAIL_SELECT = WITHDRAWAL_SAFE_SELECT;

export async function listAdminPayoutMethods(
  ctx: MobileApiContext,
  input: AdminPayoutMethodListInput,
): Promise<AdminPayoutMethodListResponse> {
  await requireAdminCapability(ctx, "payouts.read");
  let query = scopeQueryToRealTraffic(db(ctx)
    .from("worker_payout_methods")
    .select(PAYOUT_METHOD_SAFE_SELECT, { count: "exact" })
    .limit(500));
  if (input.status !== "all") query = query.eq("status", input.status);

  const result = await dbQuery<Row[]>(query);
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải danh sách tài khoản nhận tiền", 500);
  }
  const source = result.data ?? [];
  const profileNames = await loadProfileNames(
    ctx,
    source.map((method) => nullableString(method.worker_id)),
  );
  const filtered = filterPayoutRows(source, profileNames, input.query)
    .sort((left, right) => requiredString(left.created_at).localeCompare(requiredString(right.created_at)) || requiredString(left.id).localeCompare(requiredString(right.id)));
  const start = payoutCursorIndex(filtered, input.cursor, "created_at");
  const page = filtered.slice(start, start + input.limit + 1);
  const payoutMethods = page.slice(0, input.limit);
  return {
    generated_at: new Date().toISOString(),
    payout_methods: payoutMethods.map((method) =>
      serializePayoutMethodSummary(method, profileNames.get(requiredString(method.worker_id))),
    ),
    has_more: page.length > input.limit,
    next_cursor: page.length > input.limit ? payoutCursor(payoutMethods[payoutMethods.length - 1], "created_at") : null,
    total_count: filtered.length,
  };
}

export async function getAdminPayoutMethod(
  ctx: MobileApiContext,
  payoutMethodId: string,
): Promise<AdminPayoutMethodDetailResponse> {
  await requireAdminCapability(ctx, "payouts.read");
  const result = await dbQuery<Row>(
    scopeQueryToRealTraffic(db(ctx)
      .from("worker_payout_methods")
      .select(PAYOUT_METHOD_DETAIL_SELECT)
      .eq("id", payoutMethodId))
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải tài khoản nhận tiền", 500);
  if (!result.data) apiFailure("NOT_FOUND", "Không tìm thấy tài khoản nhận tiền", 404);

  const workerId = requiredString(result.data.worker_id);
  const profileNames = await loadProfileNames(ctx, [workerId]);
  return {
    generated_at: new Date().toISOString(),
    payout_method: serializePayoutMethodSummary(result.data, profileNames.get(workerId)),
  };
}

export async function createAdminPayoutMethodSensitiveAccess(
  ctx: MobileApiContext,
  payoutMethodId: string,
  input: AdminSensitivePayoutAccessInput,
): Promise<AdminSensitivePayoutAccessResponse> {
  return sensitivePayoutAccess(ctx, "worker_payout_methods", payoutMethodId, input.reason, "payout_method");
}

export async function decideAdminPayoutMethod(
  ctx: MobileApiContext,
  payoutMethodId: string,
  input: AdminPayoutMethodDecisionInput,
): Promise<AdminPayoutMethodDecisionResponse> {
  await requireAdminCapability(ctx, "payouts.process");
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("admin_review_worker_payout_method_v2", {
      p_actor_id: ctx.user.id,
      p_client_request_id: input.client_request_id,
      p_payout_method_id: payoutMethodId,
      p_decision: input.decision,
      p_expected_version: input.expected_version,
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
    version: requiredPositiveInteger(row.version_out),
    generated_at: requiredString(row.generated_at_out),
  };
}

export async function listAdminWithdrawalRequests(
  ctx: MobileApiContext,
  input: AdminWithdrawalRequestListInput,
): Promise<AdminWithdrawalRequestListResponse> {
  await requireAdminCapability(ctx, "payouts.read");
  let query = scopeQueryToRealTraffic(db(ctx)
    .from("worker_withdrawal_requests")
    .select(WITHDRAWAL_SAFE_SELECT, { count: "exact" })
    .limit(500));
  if (input.status !== "all") query = query.eq("status", input.status);
  if (input.assignment === "mine") query = query.eq("processing_by", ctx.user.id);
  if (input.assignment === "unassigned") query = query.is("processing_by", null);

  const result = await dbQuery<Row[]>(query);
  if (result.error) apiFailure("DB_ERROR", "Không thể tải yêu cầu rút tiền", 500);
  const source = result.data ?? [];
  const profileNames = await loadProfileNames(ctx, source.flatMap((request) => [
    nullableString(request.worker_id),
    nullableString(request.processing_by),
    nullableString(request.processed_by),
  ]));
  const filtered = filterPayoutRows(source, profileNames, input.query)
    .sort((left, right) => requiredString(left.requested_at).localeCompare(requiredString(right.requested_at)) || requiredString(left.id).localeCompare(requiredString(right.id)));
  const start = payoutCursorIndex(filtered, input.cursor, "requested_at");
  const page = filtered.slice(start, start + input.limit + 1);
  const requests = page.slice(0, input.limit);
  return {
    generated_at: new Date().toISOString(),
    withdrawal_requests: requests.map((request) => serializeWithdrawalSummary(request, profileNames, ctx.user.id)),
    has_more: page.length > input.limit,
    next_cursor: page.length > input.limit ? payoutCursor(requests[requests.length - 1], "requested_at") : null,
    total_count: filtered.length,
  };
}

export async function getAdminWithdrawalRequest(
  ctx: MobileApiContext,
  withdrawalRequestId: string,
): Promise<AdminWithdrawalRequestDetailResponse> {
  await requireAdminCapability(ctx, "payouts.read");
  const result = await dbQuery<Row>(
    scopeQueryToRealTraffic(db(ctx)
      .from("worker_withdrawal_requests")
      .select(WITHDRAWAL_DETAIL_SELECT)
      .eq("id", withdrawalRequestId))
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
    generated_at: new Date().toISOString(),
    withdrawal_request: serializeWithdrawalSummary(result.data, profileNames, ctx.user.id),
  };
}

export async function createAdminWithdrawalSensitiveAccess(
  ctx: MobileApiContext,
  withdrawalRequestId: string,
  input: AdminSensitivePayoutAccessInput,
): Promise<AdminSensitivePayoutAccessResponse> {
  return sensitivePayoutAccess(ctx, "worker_withdrawal_requests", withdrawalRequestId, input.reason, "withdrawal_request");
}

export async function claimAdminWithdrawalRequest(
  ctx: MobileApiContext,
  withdrawalRequestId: string,
  input: AdminWithdrawalRequestClaimInput,
): Promise<AdminWithdrawalRequestClaimResponse> {
  await requireAdminCapability(ctx, "payouts.process");
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("admin_claim_worker_withdrawal_v2", {
      p_actor_id: ctx.user.id,
      p_client_request_id: input.client_request_id,
      p_expected_version: input.expected_version,
      p_request_id: withdrawalRequestId,
      p_takeover_reason: input.takeover_reason ?? null,
    }),
  );
  failIfWithdrawalHeld(result.error?.message);
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
    version: requiredPositiveInteger(row.version_out),
    generated_at: requiredString(row.generated_at_out),
  };
}

export async function releaseAdminWithdrawalRequest(
  ctx: MobileApiContext,
  withdrawalRequestId: string,
  input: AdminWithdrawalRequestReleaseInput,
): Promise<AdminWithdrawalRequestReleaseResponse> {
  await requireAdminCapability(ctx, "payouts.process");
  const result = await dbQuery<Row[]>(db(ctx).rpc("admin_release_worker_withdrawal_v2", {
    p_actor_id: ctx.user.id,
    p_client_request_id: input.client_request_id,
    p_expected_version: input.expected_version,
    p_reason: input.reason,
    p_request_id: withdrawalRequestId,
  }));
  const row = result.data?.[0];
  if (result.error || !row) apiFailure("DB_ERROR", "Không thể bỏ nhận yêu cầu rút tiền", 500);
  if (row.ok !== true) mapWithdrawalClaimError(nullableString(row.error_code));
  if (row.status_out !== "pending") apiFailure("DB_ERROR", "Biên nhận bỏ xử lý không hợp lệ", 500);
  return {
    ok: true,
    request_id: nullableString(row.request_id) ?? withdrawalRequestId,
    status: "pending",
    version: requiredPositiveInteger(row.version_out),
    generated_at: requiredString(row.generated_at_out),
  };
}

// A confirmed harm case holds the worker's withdrawals; the database refuses to move a request
// on while the hold is live, and the admin is told why instead of seeing a server error.
function failIfWithdrawalHeld(message: string | undefined) {
  if (message?.includes("WITHDRAWAL_HOLD_ACTIVE")) {
    apiFailure("WITHDRAWAL_HOLD_ACTIVE", "Thợ đang bị tạm giữ rút tiền do vi phạm nghiêm trọng; chưa thể chi trả", 409);
  }
}

export async function resolveAdminWithdrawalRequest(
  ctx: MobileApiContext,
  withdrawalRequestId: string,
  input: AdminWithdrawalRequestResolveInput,
): Promise<AdminWithdrawalRequestResolveResponse> {
  await requireAdminCapability(ctx, "payouts.process");
  const result = await dbQuery<Row[]>(
    db(ctx).rpc("admin_resolve_worker_withdrawal_v2", {
      p_actor_id: ctx.user.id,
      p_client_request_id: input.client_request_id,
      p_expected_version: input.expected_version,
      p_external_transfer_confirmed: input.external_transfer_confirmed ?? false,
      p_request_id: withdrawalRequestId,
      p_decision: input.decision,
      ...(input.transfer_reference ? await hashTransferReference(input.transfer_reference) : {
        p_transfer_reference_hash: null,
        p_transfer_reference_suffix: null,
      }),
      p_reason: input.reason ?? null,
    }),
  );
  failIfWithdrawalHeld(result.error?.message);
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
    version: requiredPositiveInteger(row.version_out),
    event_id: requiredString(row.event_id_out),
    generated_at: requiredString(row.generated_at_out),
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
    version: requiredPositiveInteger(row.version),
  };
}

function serializeWithdrawalSummary(
  row: Row,
  profileNames: Map<string, string | null>,
  actorId: string,
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
    eligible_at: requiredString(row.eligible_at),
    processing_at: optionalTimestamp(row.processing_at),
    processing_by_name: processingBy ? profileNames.get(processingBy) ?? null : null,
    processing_by_me: processingBy === actorId,
    processed_at: optionalTimestamp(row.processed_at),
    processed_by_name: processedBy ? profileNames.get(processedBy) ?? null : null,
    transfer_reference_suffix: nullableString(row.transfer_reference_suffix),
    resolution_reason: nullableString(row.resolution_reason),
    updated_at: requiredString(row.updated_at),
    version: requiredPositiveInteger(row.version),
  };
}

async function sensitivePayoutAccess(
  ctx: MobileApiContext,
  table: "worker_payout_methods" | "worker_withdrawal_requests",
  id: string,
  reason: string,
  topic: "payout_method" | "withdrawal_request",
): Promise<AdminSensitivePayoutAccessResponse> {
  await requireAdminCapability(ctx, "payouts.process");
  const result = await dbQuery<Row>(
    db(ctx).from(table).select("id,account_holder_name,bank_account").eq("id", id).maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể mở thông tin tài khoản nhạy cảm", 500);
  if (!result.data) apiFailure("NOT_FOUND", "Không tìm thấy thông tin chi trả", 404);
  const audit = await dbQuery<Row[]>(db(ctx).from("kael_permission_audit").insert({
    actor_id: ctx.user.id,
    actor_role: ctx.role,
    purpose: "admin_payout_sensitive_access",
    action: "view_sensitive",
    topic,
    decision: "allow",
    reason_code: "operator_requested_sensitive_access",
    safe_metadata: { record_id: id, reason_provided: reason.trim().length >= 3 },
  }).select("id"));
  if (audit.error) apiFailure("DB_ERROR", "Không thể ghi audit truy cập tài khoản", 500);
  return {
    account_holder_name: requiredString(result.data.account_holder_name),
    bank_account: requiredString(result.data.bank_account),
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  };
}

function filterPayoutRows(rows: Row[], names: Map<string, string | null>, query: string | undefined) {
  const normalized = query?.trim().toLocaleLowerCase("vi");
  if (!normalized) return rows;
  return rows.filter((row) => {
    const workerId = nullableString(row.worker_id);
    return [nullableString(row.id), workerId, workerId ? names.get(workerId) : null]
      .some((value) => value?.toLocaleLowerCase("vi").includes(normalized));
  });
}

function payoutCursor(row: Row | undefined, timestampKey: "created_at" | "requested_at") {
  if (!row) return null;
  return btoa(JSON.stringify({ id: requiredString(row.id), timestamp: requiredString(row[timestampKey]) }))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function payoutCursorIndex(rows: Row[], cursor: string | undefined, timestampKey: "created_at" | "requested_at") {
  if (!cursor) return 0;
  try {
    const padded = cursor.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(cursor.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as { id?: unknown; timestamp?: unknown };
    const index = rows.findIndex((row) => row.id === parsed.id && row[timestampKey] === parsed.timestamp);
    return index < 0 ? 0 : index + 1;
  } catch {
    apiFailure("VALIDATION", "Con trỏ chi trả không hợp lệ", 400);
  }
}

async function hashTransferReference(value: string) {
  const normalized = value.trim();
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  const hash = Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { p_transfer_reference_hash: hash, p_transfer_reference_suffix: normalized.slice(-16) };
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

function requiredPositiveInteger(value: unknown): number {
  const parsed = nonnegativeInteger(value);
  if (parsed === null || parsed <= 0) apiFailure("DB_ERROR", "Phiên bản dữ liệu chi trả không hợp lệ", 500);
  return parsed;
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
  if (code === "WITHDRAWAL_NOT_ELIGIBLE") {
    apiFailure("CONFLICT", "Yêu cầu rút tiền chưa đủ thời gian chờ 24 giờ", 409);
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
  if (code === "WITHDRAWAL_NOT_ELIGIBLE") {
    apiFailure("CONFLICT", "Yêu cầu rút tiền chưa đủ thời gian chờ 24 giờ", 409);
  }
  if (code === "INVALID_INPUT") {
    apiFailure("VALIDATION", "Kết quả chi trả không hợp lệ", 400);
  }
  apiFailure("WITHDRAWAL_RESOLVE_FAILED", "Không thể lưu kết quả chi trả", 409);
}
