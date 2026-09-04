import { SERVICE_TYPES, type ServiceType } from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import {
  asRecord,
  asStringArray,
  nullableNumber,
  nullableString,
} from "../../platform/coercions.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import type {
  AdminCaseTimelineEntry,
  AdminEvidenceMetadata,
  AdminScopeChangeStatus,
  AdminScopeChangeSummary,
  AdminSupportCaseSummary,
  AdminSupportPreparation,
  AdminSupportPreparationStatus,
  AdminSupportQueueType,
} from "../contracts/admin-control.ts";
import {
  ADMIN_SCOPE_CHANGE_STATUSES,
  ADMIN_SUPPORT_QUEUE_TYPES,
} from "../contracts/admin-control.ts";

type Row = Record<string, unknown>;

const SCOPE_STATUS_RANK: Record<AdminScopeChangeStatus, number> = {
  waiting_customer_decision: 0,
  reviewing_by_kael: 1,
  requested_by_worker: 2,
  approved_by_customer: 3,
  rejected_by_customer: 4,
  cancelled: 5,
};

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const OPEN_SOURCE_STATUSES = new Set(["open", "acknowledged", "awaiting_counter_party", "admin_review", "appealed"]);
const PAGE_SIZE = 500;

export function serializeSnapshotEvidence(snapshot: Row | null): AdminEvidenceMetadata[] {
  if (!snapshot) return [];
  const snapshotId = requiredString(snapshot.id, "evidence snapshot id");
  const payload = asRecord(snapshot.evidence_snapshot);
  const lockedAt = nullableString(snapshot.evidence_locked_at);
  const rows: AdminEvidenceMetadata[] = [{
    evidence_id: `snapshot:${snapshotId}:manifest`,
    kind: "snapshot",
    label: "locked_snapshot",
    captured_at: lockedAt,
  }];
  for (const [index] of asStringArray(payload.photo_urls).entries()) {
    rows.push({ evidence_id: `snapshot:${snapshotId}:photo:${index}`, kind: "photo", label: "locked_photo", captured_at: lockedAt });
  }
  for (const messageId of asStringArray(payload.chat_message_ids)) {
    rows.push({ evidence_id: `snapshot:${snapshotId}:chat:${messageId}`, kind: "chat", label: "locked_chat", captured_at: lockedAt });
  }
  for (const scopeId of asStringArray(payload.scope_changes)) {
    rows.push({ evidence_id: `snapshot:${snapshotId}:scope:${scopeId}`, kind: "snapshot", label: "locked_scope_change", captured_at: lockedAt });
  }
  for (const artifactId of asStringArray(payload.kael_artifacts)) {
    rows.push({ evidence_id: `snapshot:${snapshotId}:kael:${artifactId}`, kind: "snapshot", label: "locked_kael_artifact", captured_at: lockedAt });
  }
  return rows;
}

export function serializeSnapshotTimeline(snapshot: Row | null): AdminCaseTimelineEntry[] {
  if (!snapshot) return [];
  const payload = asRecord(snapshot.evidence_snapshot);
  if (!Array.isArray(payload.status_timeline)) return [];
  return payload.status_timeline.flatMap((entry, index) => {
    const row = asRecord(entry);
    const occurredAt = nullableString(row.at);
    if (!occurredAt) return [];
    return [{
      key: nullableString(row.event_type) ?? nullableString(row.status) ?? `snapshot_event_${index}`,
      label: "locked_job_event",
      occurred_at: occurredAt,
    }];
  });
}

export function preparationFromRow(
  row: Row | undefined,
  canEdit: boolean,
  actorId: string,
  assignedToName: string | null,
): AdminSupportPreparation {
  const checklist = asRecord(row?.checklist);
  return {
    status: optionalPreparationStatus(row?.status) ?? "new",
    checklist: {
      opening_request_reviewed: checklist.opening_request_reviewed === true,
      counterparty_response_reviewed_or_missing: checklist.counterparty_response_reviewed_or_missing === true,
      locked_evidence_reviewed: checklist.locked_evidence_reviewed === true,
      job_timeline_reviewed: checklist.job_timeline_reviewed === true,
      scope_and_payment_reviewed: checklist.scope_and_payment_reviewed === true,
      ready_for_next_step: checklist.ready_for_next_step === true,
    },
    assigned_to: nullableString(row?.assigned_to),
    assigned_to_name: assignedToName,
    version: nullableNumber(row?.version) ?? 0,
    updated_at: nullableString(row?.updated_at),
    can_edit: canEdit,
    assigned_to_me: nullableString(row?.assigned_to) === actorId,
  };
}

export function serializeMediaEvidence(rows: Row[]): AdminEvidenceMetadata[] {
  return rows.map((row) => ({
    evidence_id: requiredString(row.id, "evidence id"),
    kind: nullableString(row.mime_type)?.startsWith("image/") ? "photo" : "document",
    label: nullableString(row.stage) ?? "Evidence",
    captured_at: nullableString(row.created_at),
  }));
}

export function scopeTimeline(scope: Row, job: Row): AdminCaseTimelineEntry[] {
  return timeline([
    ["job_created", "Công việc được tạo", job.created_at],
    ["worker_matched", "Đã ghép thợ", job.matched_at],
    ["scope_requested", "Thợ yêu cầu đổi phạm vi", scope.created_at],
    ["scope_updated", "Đổi phạm vi được cập nhật", scope.updated_at],
    ["customer_decision", "Khách đã ghi nhận quyết định", scope.customer_decision_at],
  ]);
}

export function supportTimeline(row: Row, job: Row | undefined, messages: Row[], scopes: Row[]): AdminCaseTimelineEntry[] {
  return timeline([
    ["job_created", "Công việc được tạo", job?.created_at],
    ["worker_matched", "Đã ghép thợ", job?.matched_at],
    ["worker_arrived", "Thợ đã đến", job?.arrived_at],
    ...scopes.map((scope) => ["scope_change", `Đổi phạm vi: ${nullableString(scope.status) ?? "đã cập nhật"}`, scope.updated_at]),
    ...messages.map((message) => ["chat", `Trao đổi từ ${nullableString(message.sender_role) ?? "hệ thống"}`, message.created_at]),
    ["case_opened", "Ca hỗ trợ được mở", row.created_at],
    ["case_updated", "Ca hỗ trợ được cập nhật", row.updated_at],
    ["payment_status", "Trạng thái thanh toán được cập nhật", job?.updated_at],
    ["job_paid", "Thanh toán được ghi nhận", job?.paid_at],
  ] as Array<[string, string, unknown]>);
}

function timeline(entries: Array<[string, string, unknown]>): AdminCaseTimelineEntry[] {
  return entries.flatMap(([key, label, at]) => {
    const occurredAt = nullableString(at);
    return occurredAt ? [{ key, label, occurred_at: occurredAt }] : [];
  }).sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));
}

export function safePriceReceipt(value: unknown): Record<string, unknown> | null {
  const review = asRecord(value);
  const receipt = asRecord(review.price_reasoning_receipt);
  if (Object.keys(receipt).length === 0) return null;
  return {
    schema_version: nullableString(receipt.schema_version),
    evidence_count: Array.isArray(receipt.evidence) ? receipt.evidence.length : null,
    generated_at: nullableString(receipt.generated_at),
  };
}

export function safeRecordedDecision(value: unknown): Record<string, unknown> | null {
  const decision = asRecord(value);
  if (Object.keys(decision).length === 0) return null;
  return {
    outcome: nullableString(decision.outcome),
    reasoning: scrubNullable(decision.reasoning),
    recorded_refund_amount_vnd: nullableNumber(decision.refund_amount),
    recorded_worker_credit_amount_vnd: nullableNumber(decision.worker_credit_amount),
    financial_execution_confirmed: false,
  };
}

export function scopeCounts(records: AdminScopeChangeSummary[]) {
  return {
    kael_processing: records.filter((record) => record.status === "requested_by_worker" || record.status === "reviewing_by_kael").length,
    waiting_customer: records.filter((record) => record.status === "waiting_customer_decision").length,
    approved: records.filter((record) => record.status === "approved_by_customer").length,
    rejected_or_cancelled: records.filter((record) => record.status === "rejected_by_customer" || record.status === "cancelled").length,
  };
}

export function compareScopeSummary(left: AdminScopeChangeSummary, right: AdminScopeChangeSummary) {
  return SCOPE_STATUS_RANK[left.status] - SCOPE_STATUS_RANK[right.status]
    || left.updated_at.localeCompare(right.updated_at)
    || left.scope_change_id.localeCompare(right.scope_change_id);
}

export function compareSupportSummary(left: AdminSupportCaseSummary, right: AdminSupportCaseSummary) {
  const leftOpen = OPEN_SOURCE_STATUSES.has(left.source_status) ? 0 : 1;
  const rightOpen = OPEN_SOURCE_STATUSES.has(right.source_status) ? 0 : 1;
  return leftOpen - rightOpen
    || deadlineSort(left.deadline_at) - deadlineSort(right.deadline_at)
    || PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority]
    || left.updated_at.localeCompare(right.updated_at)
    || left.case_id.localeCompare(right.case_id);
}

function deadlineSort(value: string | null | undefined) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function scopeCursorKey(record: AdminScopeChangeSummary) {
  return `${SCOPE_STATUS_RANK[record.status]}|${record.updated_at}|${record.scope_change_id}`;
}

export function supportCursorKey(record: AdminSupportCaseSummary) {
  return `${OPEN_SOURCE_STATUSES.has(record.source_status) ? 0 : 1}|${String(deadlineSort(record.deadline_at)).padStart(16, "0")}|${PRIORITY_RANK[record.priority]}|${record.updated_at}|${record.source}:${record.case_id}`;
}

export function afterCursor<T>(records: T[], cursor: string | undefined, key: (record: T) => string) {
  if (!cursor) return records;
  const decoded = decodeCursor(cursor);
  return records.filter((record) => key(record) > decoded);
}

export function encodeCursor(value: string) {
  return btoa(value);
}

function decodeCursor(value: string) {
  try {
    const decoded = atob(value);
    if (!decoded.includes("|")) throw new Error("invalid cursor");
    return decoded;
  } catch {
    apiFailure("VALIDATION", "Con trỏ phân trang không hợp lệ", 400);
  }
}

export async function fetchAllRows(
  factory: (from: number, to: number) => ReturnType<DbClient["from"]>,
  errorMessage: string,
) {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await dbQuery<Row[]>(factory(offset, offset + PAGE_SIZE - 1));
    if (result.error) apiFailure("DB_ERROR", errorMessage, 500);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export function supportSearchText(record: AdminSupportCaseSummary) {
  return [record.case_id, record.job_id, record.display_code].filter(Boolean).join(" ").toLocaleLowerCase("vi-VN");
}

export function breakdown(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts, ([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

export function disputePriority(deadline: string | null) {
  if (!deadline) return "medium" as const;
  const remaining = Date.parse(deadline) - Date.now();
  if (remaining <= 0) return "critical" as const;
  if (remaining <= 24 * 60 * 60 * 1000) return "high" as const;
  return "medium" as const;
}

export function requiredQueueType(value: unknown): AdminSupportQueueType {
  const type = nullableString(value);
  if (type && (ADMIN_SUPPORT_QUEUE_TYPES as readonly string[]).includes(type)) return type as AdminSupportQueueType;
  apiFailure("DB_ERROR", "Loại ca hỗ trợ không hợp lệ", 500);
}

export function requiredScopeStatus(value: unknown): AdminScopeChangeStatus {
  const status = nullableString(value);
  if (status && (ADMIN_SCOPE_CHANGE_STATUSES as readonly string[]).includes(status)) return status as AdminScopeChangeStatus;
  apiFailure("DB_ERROR", "Trạng thái đổi phạm vi không hợp lệ", 500);
}

export function requiredRequestTiming(value: unknown): "pre_arrival" | "on_site" {
  if (value === "pre_arrival" || value === "on_site") return value;
  apiFailure("DB_ERROR", "Thời điểm đổi phạm vi không hợp lệ", 500);
}

export function requiredPriority(value: unknown): "low" | "medium" | "high" | "critical" {
  if (value === "low" || value === "medium" || value === "high" || value === "critical") return value;
  apiFailure("DB_ERROR", "Mức ưu tiên không hợp lệ", 500);
}

export function optionalPriority(value: unknown): "low" | "medium" | "high" | "critical" | null {
  return value === "low" || value === "medium" || value === "high" || value === "critical" ? value : null;
}

export function optionalPreparationStatus(value: unknown): AdminSupportPreparationStatus | null {
  return value === "new" || value === "acknowledged" || value === "in_review" || value === "ready" ? value : null;
}

export function requiredServiceType(value: unknown): ServiceType {
  const serviceType = nullableString(value);
  if (serviceType && (SERVICE_TYPES as readonly string[]).includes(serviceType)) return serviceType as ServiceType;
  apiFailure("DB_ERROR", "Nhóm dịch vụ không hợp lệ", 500);
}

export function optionalServiceType(value: unknown): ServiceType | null {
  const serviceType = nullableString(value);
  return serviceType && (SERVICE_TYPES as readonly string[]).includes(serviceType) ? serviceType as ServiceType : null;
}

export function requiredString(value: unknown, subject: string) {
  const string = nullableString(value)?.trim();
  if (!string) apiFailure("DB_ERROR", `Dữ liệu ${subject} không hợp lệ`, 500);
  return string;
}

export function sumMoney(left: number | null, right: number | null) {
  return left === null || right === null ? null : left + right;
}

export function maskContact(value: string | null) {
  if (!value) return null;
  const suffix = value.replace(/\D/g, "").slice(-4);
  return suffix ? `•••• ${suffix}` : null;
}

export function maskName(value: string | null) {
  const parts = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return null;
  if (parts.length === 1) return `${parts[0]!.slice(0, 1)}•••`;
  return [parts[0], ...parts.slice(1).map((part) => `${part.slice(0, 1)}.`)].join(" ");
}

export function scrubNullable(value: unknown) {
  const text = nullableString(value);
  return text ? scrubText(text) : null;
}

export function scrubText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email đã ẩn]")
    .replace(/(?:\+?84|0)(?:[ .-]?\d){8,10}/g, "[số điện thoại đã ẩn]")
    .replace(/\b\d{9,16}\b/g, "[dữ liệu nhạy cảm đã ẩn]")
    .trim()
    .slice(0, 1000);
}

export function mapPreparationError(code: string | null): never {
  if (code === "OPERATIONS_TRIAGE_REQUIRED") apiFailure("AUTH_FORBIDDEN", "Tài khoản chưa có quyền chuẩn bị hồ sơ", 403);
  if (code === "VERSION_CONFLICT") apiFailure("CONFLICT", "Hồ sơ đã được cập nhật ở nơi khác", 409);
  if (code === "CASE_NOT_FOUND") apiFailure("NOT_FOUND", "Không tìm thấy ca hỗ trợ", 404);
  if (code === "ASSIGNED_TO_ANOTHER") apiFailure("CONFLICT", "Ca đang được quản trị viên khác nhận xử lý", 409);
  if (code === "INVALID_INPUT") apiFailure("VALIDATION", "Nội dung chuẩn bị hồ sơ không hợp lệ", 400);
  apiFailure("CONFLICT", "Không thể cập nhật hồ sơ chuẩn bị", 409);
}
