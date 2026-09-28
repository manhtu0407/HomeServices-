import { nullableNumber, nullableRecord, nullableString } from "../../platform/coercions.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { normalizeIsoTimestamp } from "../../platform/iso-timestamp.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { AdminWorkerApplicationStatus } from "../contracts/admin-control.ts";

type Row = Record<string, unknown>;

export function requireWorkerReviewReceipt(
  data: unknown,
  queueId: string,
  decision: string,
  workerId?: string,
): Row {
  const row = Array.isArray(data) && data.length === 1 ? nullableRecord(data[0]) : null;
  if (!row || typeof row.ok !== "boolean" || row.queue_id !== queueId.toLowerCase() || row.decision !== decision) {
    apiFailure("DB_ERROR", "Không thể xác minh biên nhận duyệt hồ sơ", 500);
  }
  if (row.ok && (row.error_code !== null ||
    typeof row.worker_id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(row.worker_id) ||
    (workerId !== undefined && row.worker_id !== workerId.toLowerCase()) ||
    typeof row.decided_at !== "string" || normalizeIsoTimestamp(row.decided_at) === null)) {
    apiFailure("DB_ERROR", "Không thể xác minh biên nhận duyệt hồ sơ", 500);
  }
  return row;
}

export function requireAdminOwner(ctx: MobileApiContext): void {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ Owner Admin mới có thể thay đổi quyền Sub Admin", 403);
  }
}

export function mapWorkerApplicationDecisionError(code: string | null): never {
  if (code === "APPLICATION_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ thợ", 404);
  if (code === "WORKER_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy tài khoản thợ", 404);
  if (code === "ADMIN_REQUIRED") apiFailure("AUTH_FORBIDDEN", "Tài khoản chưa có quyền duyệt hồ sơ thợ", 403);
  if (code === "INVALID_DECISION" || code === "REASON_REQUIRED") {
    apiFailure("VALIDATION", "Quyết định hồ sơ thợ không hợp lệ", 400);
  }
  if (code === "ALREADY_REVIEWED") apiFailure("ALREADY_REVIEWED", "Hồ sơ thợ đã có quyết định khác", 409);
  apiFailure("REVIEW_FAILED", "Không thể lưu quyết định hồ sơ thợ", 409);
}

export function mapWorkerAccessError(code: string | null): never {
  if (code === "WORKER_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy tài khoản thợ", 404);
  if (code === "WORKER_MANAGE_REQUIRED") apiFailure("AUTH_FORBIDDEN", "Tài khoản chưa có quyền quản lý thợ", 403);
  if (code === "WORKER_NOT_APPROVED") apiFailure("CONFLICT", "Chỉ có thể tạm dừng thợ đã được duyệt", 409);
  if (code === "DISCIPLINE_HOLD_ACTIVE") {
    apiFailure("DISCIPLINE_HOLD_ACTIVE", "Thợ đang bị khóa bởi quyết định xử lý vi phạm; mở lại qua mục Vi phạm", 409);
  }
  if (code === "INVALID_INPUT") apiFailure("VALIDATION", "Thông tin thay đổi quyền thợ không hợp lệ", 400);
  apiFailure("WORKER_ACCESS_FAILED", "Không thể cập nhật quyền hoạt động của thợ", 409);
}

export function mapSubAdminAccessError(code: string | null): never {
  if (code === "TARGET_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy tài khoản cần cấp quyền", 404);
  if (code === "OWNER_REQUIRED") apiFailure("AUTH_FORBIDDEN", "Chỉ Owner Admin có thể thay đổi quyền Sub Admin", 403);
  if (code === "INVALID_TARGET" || code === "OWNER_CANNOT_BE_OPERATOR" || code === "INVALID_TARGET_ROLE") {
    apiFailure("VALIDATION", "Tài khoản này không thể trở thành Sub Admin", 400);
  }
  if (code === "OPERATOR_NOT_FOUND" || code === "OPERATOR_NOT_ACTIVE") {
    apiFailure("NOT_FOUND", "Không tìm thấy Sub Admin đang hoạt động", 404);
  }
  if (code === "NOMINATION_REQUIRED") {
    apiFailure("CONFLICT", "Tài khoản cần được Owner đề cử trước khi cấp quyền", 409);
  }
  if (code === "VERSION_CONFLICT") {
    apiFailure("CONFLICT", "Quyền Sub Admin đã thay đổi. Hãy tải lại trước khi lưu", 409);
  }
  if (code === "IDEMPOTENCY_CONFLICT") {
    apiFailure("CONFLICT", "Mã yêu cầu đã được dùng cho một thay đổi khác", 409);
  }
  if (code === "INVALID_INPUT" || code === "INVALID_ACTION") {
    apiFailure("VALIDATION", "Thông tin quyền Sub Admin không hợp lệ", 400);
  }
  apiFailure("SUB_ADMIN_ACCESS_FAILED", "Không thể cập nhật quyền Sub Admin", 409);
}

export function mapManagerNominationError(code: string | null): never {
  if (code === "TARGET_NOT_FOUND" || code === "NOMINATION_NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy tài khoản hoặc đề cử quản lý", 404);
  }
  if (code === "OWNER_REQUIRED") apiFailure("AUTH_FORBIDDEN", "Chỉ Owner Admin có thể quản lý đề cử", 403);
  if (code === "INVALID_TARGET" || code === "INVALID_TARGET_ROLE") {
    apiFailure("VALIDATION", "Tài khoản này không thể được đề cử quản lý", 400);
  }
  if (code === "ALREADY_OPERATOR") apiFailure("CONFLICT", "Tài khoản này đã là quản trị viên phụ", 409);
  if (code === "NOMINATION_EXISTS") apiFailure("CONFLICT", "Tài khoản này đang chờ được cấp quyền", 409);
  if (code === "NOMINATION_OWNED_BY_ANOTHER_OWNER") {
    apiFailure("CONFLICT", "Tài khoản này đang có đề cử quản lý khác", 409);
  }
  if (code === "NOMINATION_NOT_PENDING") apiFailure("CONFLICT", "Đề cử này không còn chờ cấp quyền", 409);
  apiFailure("MANAGER_NOMINATION_FAILED", "Không thể cập nhật đề cử quản lý", 409);
}

export function asWorkerApplicationStatus(value: unknown): AdminWorkerApplicationStatus | null {
  return value === "open" || value === "acknowledged" || value === "resolved" || value === "cancelled"
    ? value
    : null;
}

export function asDecisionStatus(value: unknown): Exclude<AdminWorkerApplicationStatus, "cancelled"> | null {
  return value === "open" || value === "acknowledged" || value === "resolved" ? value : null;
}

export function asReviewDecision(value: unknown): "approve" | "request_changes" | "reject" | null {
  return value === "approve" || value === "request_changes" || value === "reject" ? value : null;
}

export function asUserRole(value: unknown): "customer" | "worker" | "admin" | "admin_operator" | null {
  return value === "customer" || value === "worker" || value === "admin" || value === "admin_operator"
    ? value
    : null;
}

export function asBaselineRole(value: unknown): "customer" | "worker" | null {
  return value === "customer" || value === "worker" ? value : null;
}

export function asOperatorStatus(value: unknown): "active" | "revoked" | null {
  return value === "active" || value === "revoked" ? value : null;
}

export function asRecordArray(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
      const record = nullableRecord(item);
      return record ? [record] : [];
    })
    : [];
}

export function nonNegativeInteger(value: unknown): number | null {
  const number = nullableNumber(value);
  return number !== null && Number.isInteger(number) && number >= 0 ? number : null;
}

export function uniqueStrings(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function indexById(rows: Row[], key = "id") {
  return new Map(rows.flatMap((row) => {
    const id = nullableString(row[key]);
    return id ? [[id, row] as const] : [];
  }));
}
