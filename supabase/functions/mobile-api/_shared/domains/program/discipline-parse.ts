import { isRecord, nullableString } from "../../platform/coercions.ts";
import type {
  EdgeAdminViolationCaseSummary,
  EdgeDisciplinePolicyView,
  EdgeIdentityBlock,
  EdgeViolationCase,
  EdgeViolationConsequence,
} from "../contracts/discipline.ts";
import { malformed, recordArray, requiredInteger, requiredText } from "./parse.ts";

type Row = Record<string, unknown>;

const SOURCES = ["detector", "admin", "customer_report"] as const;
const STATUSES = ["proposed", "confirmed", "dismissed", "fabricated_report"] as const;
const APPEAL_STATUSES = ["none", "submitted", "upheld", "overturned"] as const;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) malformed(what);
  return value as T;
}

function parseConsequence(row: Row): EdgeViolationConsequence {
  if (typeof row.restored !== "boolean") malformed("consequence.restored");
  return {
    entry_kind: requiredText(row.entry_kind, "consequence.entry_kind"),
    effective_until: nullableString(row.effective_until),
    restored: row.restored,
    detail: isRecord(row.detail) ? row.detail : {},
  };
}

export function parseViolationCase(value: unknown): EdgeViolationCase {
  if (!isRecord(value)) malformed("case");
  if (typeof value.suspended_pending_review !== "boolean") malformed("case.suspended_pending_review");
  return {
    id: requiredText(value.id, "case.id"),
    violation_code: requiredText(value.violation_code, "case.violation_code"),
    level: requiredInteger(value.level, "case.level"),
    source: oneOf(value.source, SOURCES, "case.source"),
    statement: nullableString(value.statement),
    status: oneOf(value.status, STATUSES, "case.status"),
    decision_deadline_at: requiredText(value.decision_deadline_at, "case.decision_deadline_at"),
    decided_at: nullableString(value.decided_at),
    decision_reason: nullableString(value.decision_reason),
    appeal_status: oneOf(value.appeal_status, APPEAL_STATUSES, "case.appeal_status"),
    appeal_deadline_at: nullableString(value.appeal_deadline_at),
    suspended_pending_review: value.suspended_pending_review,
    created_at: requiredText(value.created_at, "case.created_at"),
    consequences: recordArray(value.consequences, "case.consequences").map(parseConsequence),
  };
}

export function parseDisciplinePolicy(row: Row): EdgeDisciplinePolicyView {
  return {
    l1_matching_days: requiredInteger(row.l1_matching_days, "policy.l1_matching_days"),
    l2_points_debit: requiredInteger(row.l2_points_debit, "policy.l2_points_debit"),
    l2_network_freeze_days: requiredInteger(row.l2_network_freeze_days, "policy.l2_network_freeze_days"),
    l3_freeze_days: requiredInteger(row.l3_freeze_days, "policy.l3_freeze_days"),
    strike_window_months: requiredInteger(row.strike_window_months, "policy.strike_window_months"),
    appeal_window_days: requiredInteger(row.appeal_window_days, "policy.appeal_window_days"),
    withdrawal_hold_days: requiredInteger(row.withdrawal_hold_days, "policy.withdrawal_hold_days"),
  };
}

export function parseAdminCaseSummary(value: unknown): EdgeAdminViolationCaseSummary {
  if (!isRecord(value)) malformed("admin case");
  return {
    ...parseViolationCase(value),
    worker_id: requiredText(value.worker_id, "case.worker_id"),
    worker_name: nullableString(value.worker_name),
  };
}

export function parseIdentityBlock(row: Row): EdgeIdentityBlock {
  return {
    id: requiredText(row.id, "block.id"),
    kind: oneOf(row.kind, ["cccd", "phone", "email"] as const, "block.kind"),
    case_id: nullableString(row.case_id),
    created_at: requiredText(row.created_at, "block.created_at"),
    lifted_at: nullableString(row.lifted_at),
    lift_reason: nullableString(row.lift_reason),
  };
}

// RPCs raise named exceptions; each becomes a precise refusal the screen can explain.
const NAMED_FAILURES: Array<[string, string, string, number]> = [
  ["ADMIN_CAPABILITY_REQUIRED", "AUTH_FORBIDDEN", "Tài khoản không có quyền xử lý vi phạm", 403],
  ["CASE_NOT_FOUND", "NOT_FOUND", "Không tìm thấy hồ sơ vi phạm", 404],
  ["CASE_ALREADY_DECIDED", "INVALID_STATUS", "Hồ sơ này đã có quyết định khác", 409],
  ["NOT_A_CUSTOMER_REPORT", "VALIDATION", "Chỉ báo cáo của khách mới có thể bị đánh dấu là bịa đặt", 400],
  ["SUSPEND_ONLY_FOR_OPEN_HARM_CASE", "INVALID_STATUS", "Chỉ đình chỉ ngay với hồ sơ cấp 5 đang chờ xử lý", 409],
  ["HOLD_NOT_EXTENDABLE", "INVALID_STATUS", "Chỉ gia hạn tạm giữ với hồ sơ cấp 5 đã xác nhận và còn hiệu lực", 409],
  ["INVALID_HOLD_INPUT", "VALIDATION", "Cần số hồ sơ của cơ quan có thẩm quyền và ngày hết hạn trong vòng 365 ngày", 400],
  ["APPEAL_WINDOW_CLOSED", "APPEAL_WINDOW_CLOSED", "Đã quá hạn gửi khiếu nại", 409],
  ["APPEAL_NOT_ALLOWED", "INVALID_STATUS", "Hồ sơ này không thể khiếu nại", 409],
  ["APPEAL_NOT_SUBMITTED", "INVALID_STATUS", "Chưa có khiếu nại để xét", 409],
  ["APPEAL_ALREADY_DECIDED", "INVALID_STATUS", "Khiếu nại này đã có quyết định khác", 409],
  ["INVALID_APPEAL_INPUT", "VALIDATION", "Khiếu nại cần lý do rõ ràng và bằng chứng hợp lệ", 400],
  ["INVALID_DECISION_INPUT", "VALIDATION", "Quyết định cần lý do rõ ràng", 400],
  ["INVALID_REPORT_INPUT", "VALIDATION", "Báo cáo chưa hợp lệ", 400],
  ["JOB_NOT_REPORTABLE", "INVALID_STATUS", "Chỉ báo cáo được thợ đã nhận công việc của bạn", 409],
  ["REPORT_RATE_LIMITED", "RATE_LIMITED", "Bạn đã gửi quá nhiều báo cáo hôm nay", 429],
  ["IDENTITY_BLOCKLISTED", "IDENTITY_BLOCKLISTED", "Danh tính này đã bị chặn do vi phạm nghiêm trọng", 409],
  ["INVALID_IDENTITY_INPUT", "VALIDATION", "Số CCCD không hợp lệ", 400],
  ["BLOCK_NOT_FOUND", "NOT_FOUND", "Không tìm thấy mục chặn đang hiệu lực", 404],
  ["INVALID_LIFT_REASON", "VALIDATION", "Cần lý do rõ ràng để gỡ chặn", 400],
  ["WORKER_NOT_FOUND", "NOT_FOUND", "Không tìm thấy thợ", 404],
  ["INVALID_COMPENSATION_INPUT", "VALIDATION", "Số tiền hoặc nội dung đề nghị bồi thường chưa hợp lệ", 400],
  ["COMPENSATION_NOT_ALLOWED", "INVALID_STATUS", "Vụ việc này không thuộc diện đề nghị bồi thường", 409],
  ["COMPENSATION_ALREADY_OPEN", "INVALID_STATUS", "Vụ việc này đã có đề nghị bồi thường", 409],
  ["COMPENSATION_NOT_FOUND", "NOT_FOUND", "Không tìm thấy đề nghị bồi thường", 404],
  ["COMPENSATION_NOT_YOUR_TURN", "INVALID_STATUS", "Đang chờ bên kia trả lời", 409],
  ["COMPENSATION_EXPIRED", "INVALID_STATUS", "Đề nghị bồi thường đã quá hạn trả lời", 409],
  ["COMPENSATION_NO_COUNTERS_LEFT", "INVALID_STATUS", "Đã hết lượt đề xuất; chỉ còn đồng ý hoặc từ chối", 409],
  ["INSUFFICIENT_WORKER_BALANCE", "INSUFFICIENT_BALANCE", "Số dư của thợ không đủ cho mức bồi thường này", 409],
  ["COMPENSATION_NOT_AGREED", "INVALID_STATUS", "Hai bên chưa thống nhất mức bồi thường", 409],
  ["COMPENSATION_ALREADY_PAID", "INVALID_STATUS", "Khoản bồi thường này đã được ghi nhận chuyển với mã khác", 409],
];

export function namedFailure(message: string | undefined): [string, string, number] | null {
  const text = message ?? "";
  const hit = NAMED_FAILURES.find(([marker]) => text.includes(marker));
  return hit ? [hit[1], hit[2], hit[3]] : null;
}
