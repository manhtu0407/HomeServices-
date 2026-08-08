import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery } from "../../platform/db.ts";
import { nullableRecord, nullableString } from "../../platform/coercions.ts";
import { scrubSensitiveForLLM } from "../../kael/index.ts";

const QUEUE_STATUSES = Object.freeze(["open", "acknowledged", "resolved", "cancelled"] as const);
const ESCALATION_LEVELS = Object.freeze(["soft", "hard"] as const);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_METADATA_KEYS = new Set(["source", "purpose", "provider", "model", "decision", "policy_id", "rule_id"]);

type QueueStatus = (typeof QUEUE_STATUSES)[number];
type EscalationLevel = (typeof ESCALATION_LEVELS)[number];

export type KaelAdminQueueListInput = {
  readonly status?: QueueStatus;
  readonly escalationLevel?: EscalationLevel;
  readonly from?: string;
  readonly to?: string;
  readonly page: number;
  readonly limit: number;
};

export type KaelAdminQueueResolveInput = {
  readonly note?: string;
};

export function parseKaelAdminQueueListInput(url: URL): KaelAdminQueueListInput {
  assertCanonicalListQuery(url);
  const status = optionalEnum(url.searchParams.get("status"), QUEUE_STATUSES, "status");
  const escalationLevel = optionalEnum(
    url.searchParams.get("escalation_level"),
    ESCALATION_LEVELS,
    "escalation_level",
  );
  const from = optionalDate(url.searchParams.get("from"), "from");
  const to = optionalDate(url.searchParams.get("to"), "to");
  const page = boundedInteger(url.searchParams.get("page"), 1, 10_000, 1, "page");
  const limit = boundedInteger(url.searchParams.get("limit"), 1, 100, 30, "limit");
  if (from && to && Date.parse(from) > Date.parse(to)) {
    apiFailure("VALIDATION", "Khoảng thời gian hàng đợi không hợp lệ", 400);
  }
  return { status, escalationLevel, from, to, page, limit };
}

export function parseKaelAdminQueueResolveInput(value: unknown): KaelAdminQueueResolveInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    apiFailure("VALIDATION", "Dữ liệu xử lý hàng đợi không hợp lệ", 400);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "note")) {
    apiFailure("VALIDATION", "Dữ liệu xử lý hàng đợi không hợp lệ", 400);
  }
  if (record.note === undefined || record.note === null || record.note === "") return {};
  if (typeof record.note !== "string") {
    apiFailure("VALIDATION", "Ghi chú xử lý không hợp lệ", 400);
  }
  const note = record.note.trim();
  if (note.length < 3 || note.length > 500) {
    apiFailure("VALIDATION", "Ghi chú xử lý phải từ 3 đến 500 ký tự", 400);
  }
  const scrubbed = safeSummary(note);
  if (!scrubbed || scrubbed.length < 3) {
    apiFailure("VALIDATION", "Ghi chú xử lý không được chỉ chứa dữ liệu nhạy cảm", 400);
  }
  return { note: scrubbed };
}

export async function listKaelAdminQueue(
  ctx: MobileApiContext,
  input: KaelAdminQueueListInput,
) {
  assertAdmin(ctx);
  const fromIndex = (input.page - 1) * input.limit;
  const toIndex = fromIndex + input.limit;
  let query = db(ctx)
    .from("kael_admin_queue")
    .select(
      "id,job_id,queue_type,priority,status,escalation_level,reason_code,response_summary,safe_metadata,created_at,updated_at,resolved_at,resolved_by,resolution_note",
    )
    .order("created_at", { ascending: false })
    .range(fromIndex, toIndex);
  if (input.status) query = query.eq("status", input.status);
  if (input.escalationLevel) query = query.eq("escalation_level", input.escalationLevel);
  if (input.from) query = query.gte("created_at", input.from);
  if (input.to) query = query.lte("created_at", input.to);

  const result = await dbQuery<Array<Record<string, unknown>>>(query);
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải hàng đợi Kael", 500);
  }
  const rows = result.data ?? [];
  const hasNextPage = rows.length > input.limit;
  return {
    items: rows.slice(0, input.limit).map(queueItem),
    page: input.page,
    limit: input.limit,
    next_page: hasNextPage ? input.page + 1 : null,
  };
}

export async function resolveKaelAdminQueue(
  ctx: MobileApiContext,
  queueId: string,
  input: KaelAdminQueueResolveInput,
) {
  assertAdmin(ctx);
  if (!UUID_PATTERN.test(queueId)) {
    apiFailure("VALIDATION", "Mã hàng đợi Kael không hợp lệ", 400);
  }
  const resolvedAt = new Date().toISOString();
  const result = await dbQuery<Record<string, unknown>>(
    db(ctx)
      .from("kael_admin_queue")
      .update({
        status: "resolved",
        resolved_by: ctx.user.id,
        resolved_at: resolvedAt,
        resolution_note: input.note ?? null,
      })
      .eq("id", queueId)
      .in("status", ["open", "acknowledged"])
      .select(
        "id,job_id,queue_type,priority,status,escalation_level,reason_code,response_summary,safe_metadata,created_at,updated_at,resolved_at,resolved_by,resolution_note",
      )
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể xử lý mục hàng đợi Kael", 500);
  }
  if (!result.data) {
    apiFailure("NOT_FOUND", "Mục hàng đợi không còn chờ xử lý", 404);
  }
  return { ok: true, item: queueItem(result.data) };
}


function assertCanonicalListQuery(url: URL): void {
  const allowed = new Set(["status", "escalation_level", "from", "to", "page", "limit"]);
  const seen = new Set<string>();
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || seen.has(key) || value.length > 128) {
      apiFailure("VALIDATION", "Bộ lọc hàng đợi Kael không hợp lệ", 400);
    }
    seen.add(key);
  }
}

function assertAdmin(ctx: MobileApiContext): void {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được truy cập hàng đợi Kael", 403);
  }
}

function queueItem(row: Record<string, unknown>) {
  return {
    id: requiredString(row.id),
    job_id: nullableString(row.job_id),
    queue_type: requiredString(row.queue_type),
    priority: requiredString(row.priority),
    status: requiredString(row.status),
    escalation_level: nullableString(row.escalation_level),
    reason_code: requiredString(row.reason_code),
    response_summary: safeSummary(row.response_summary),
    safe_metadata: safeMetadata(nullableRecord(row.safe_metadata)),
    created_at: requiredString(row.created_at),
    updated_at: requiredString(row.updated_at),
    resolved_at: nullableString(row.resolved_at),
    resolved_by: nullableString(row.resolved_by),
    resolution_note: safeSummary(row.resolution_note),
  };
}

function safeMetadata(value: Record<string, unknown> | null): Record<string, unknown> {
  if (!value) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (typeof item === "string") safe[key] = safeSummary(item);
    else if (typeof item === "number" || typeof item === "boolean" || item === null) safe[key] = item;
  }
  return safe;
}

function safeSummary(value: unknown): string | null {
  const parsed = nullableString(value);
  if (!parsed) return null;
  return scrubSensitiveForLLM(parsed)
    .replace(/(\[(?:phone|email|id-number|bank-account|building|floor|unit|house-no)\])(?=\p{L})/giu, "$1 ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500) || null;
}

function requiredString(value: unknown): string {
  const parsed = nullableString(value);
  if (!parsed) apiFailure("DB_ERROR", "Dữ liệu hàng đợi Kael không hợp lệ", 500);
  return parsed;
}

function optionalEnum<T extends readonly string[]>(
  value: string | null,
  allowed: T,
  field: string,
): T[number] | undefined {
  if (!value) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    apiFailure("VALIDATION", `Bộ lọc ${field} không hợp lệ`, 400);
  }
  return value as T[number];
}

function optionalDate(value: string | null, field: string): string | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) apiFailure("VALIDATION", `Bộ lọc ${field} không hợp lệ`, 400);
  return new Date(time).toISOString();
}

function boundedInteger(
  value: string | null,
  min: number,
  max: number,
  fallback: number,
  field: string,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    apiFailure("VALIDATION", `Bộ lọc ${field} không hợp lệ`, 400);
  }
  return parsed;
}
