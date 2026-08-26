import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import {
  asRecord,
  asStringArray,
  nullableNumber,
  nullableString,
} from "../../platform/coercions.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import type {
  AdminEvidenceAccessInput,
  AdminEvidenceAccessResponse,
  AdminScopeChangeDetailResponse,
  AdminScopeChangeListInput,
  AdminScopeChangeListResponse,
  AdminScopeChangeSummary,
  AdminSupportCaseDetailResponse,
  AdminSupportCaseListInput,
  AdminSupportCaseListResponse,
  AdminSupportCaseSource,
  AdminSupportCaseSummary,
  AdminSupportPreparation,
  AdminSupportPreparationInput,
} from "../contracts/admin-control.ts";
import { ADMIN_SUPPORT_QUEUE_TYPES } from "../contracts/admin-control.ts";
import { requireAdminCapability } from "./actor.ts";
import {
  afterCursor,
  breakdown,
  compareScopeSummary,
  compareSupportSummary,
  disputePriority,
  encodeCursor,
  fetchAllRows,
  mapPreparationError,
  maskContact,
  maskName,
  optionalPreparationStatus,
  optionalPriority,
  optionalServiceType,
  preparationFromRow,
  requiredPriority,
  requiredQueueType,
  requiredRequestTiming,
  requiredScopeStatus,
  requiredServiceType,
  requiredString,
  safePriceReceipt,
  safeRecordedDecision,
  scopeCounts,
  scopeCursorKey,
  scopeTimeline,
  scrubNullable,
  scrubText,
  serializeMediaEvidence,
  serializeSnapshotEvidence,
  serializeSnapshotTimeline,
  sumMoney,
  supportCursorKey,
  supportSearchText,
  supportTimeline,
} from "./operations-support-helpers.ts";

type Row = Record<string, unknown>;
type SupportSourceRow = Row & { source?: AdminSupportCaseSource };
type EvidenceClient = DbClient & {
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, expires: number): Promise<{
        data: { signedUrl?: string } | null;
        error: unknown;
      }>;
    };
  };
};

export { ADMIN_SUPPORT_QUEUE_TYPES };
export {
  scrubText,
  serializeSnapshotEvidence,
  serializeSnapshotTimeline,
} from "./operations-support-helpers.ts";

export const ADMIN_SUPPORT_QUEUE_READ_TYPES = [
  ...ADMIN_SUPPORT_QUEUE_TYPES,
  "dispute_review",
] as const;

const PAGE_SIZE = 500;

export async function listAdminScopeChanges(
  ctx: MobileApiContext,
  input: AdminScopeChangeListInput,
): Promise<AdminScopeChangeListResponse> {
  await requireAdminCapability(ctx, "operations.read");
  const scopeRows = await fetchAllRows((from, to) => {
    let query = db(ctx).from("scope_change_requests").select(
      "id,job_id,status,request_timing,price_min,price_max,kael_computed_min,kael_computed_max,updated_at,created_at",
    );
    if (input.request_timing !== "all") query = query.eq("request_timing", input.request_timing);
    if (input.requested_from) query = query.gte("created_at", input.requested_from);
    if (input.requested_to) query = query.lte("created_at", input.requested_to);
    return query.order("updated_at", { ascending: true }).order("id", { ascending: true }).range(from, to);
  }, "Không thể tải danh sách đổi phạm vi");
  const jobs = await jobMap(ctx, scopeRows.map((row) => requiredString(row.job_id, "job id")));
  const summaries = scopeRows
    .map((row) => serializeAdminScopeChangeSummary(
      row,
      jobs.get(requiredString(row.job_id, "job id")),
    ))
    .filter((record) => input.status === "all" || record.status === input.status)
    .filter((record) => input.service_type === "all" || record.service_type === input.service_type)
    .filter((record) => !input.query || record.display_code.toLocaleLowerCase("vi-VN").includes(input.query.toLocaleLowerCase("vi-VN")))
    .sort(compareScopeSummary);
  const visible = afterCursor(summaries, input.cursor, scopeCursorKey);
  const records = visible.slice(0, input.limit);
  const hasMore = visible.length > input.limit;
  return {
    generated_at: new Date().toISOString(),
    counts: scopeCounts(summaries),
    records,
    has_more: hasMore,
    next_cursor: hasMore && records.length > 0 ? encodeCursor(scopeCursorKey(records[records.length - 1]!)) : null,
  };
}

export async function getAdminScopeChange(
  ctx: MobileApiContext,
  scopeChangeId: string,
): Promise<AdminScopeChangeDetailResponse> {
  await requireAdminCapability(ctx, "operations.read");
  const scopeResult = await dbQuery<Row>(db(ctx).from("scope_change_requests").select(
    "id,job_id,status,request_timing,requested_description,reason,original_summary,price_min,price_max,kael_computed_min,kael_computed_max,kael_review,evidence_photo_urls,created_at,updated_at,customer_decision_at",
  ).eq("id", scopeChangeId).maybeSingle());
  const scope = scopeResult.data;
  if (scopeResult.error) apiFailure("DB_ERROR", "Không thể tải đổi phạm vi", 500);
  if (!scope) apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu đổi phạm vi", 404);
  const jobId = requiredString(scope.job_id, "job id");
  const [jobResult, disputeResult, mediaResult] = await Promise.all([
    dbQuery<Row>(db(ctx).from("jobs").select(
      "id,display_code,service_type,description,kael_price_min,kael_price_max,final_price,status,payment_status,created_at,matched_at,arrived_at,completed_at,confirmed_at,paid_at,updated_at",
    ).eq("id", jobId).maybeSingle()),
    dbQuery<Row>(db(ctx).from("disputes").select("id,dispute_type,status,updated_at").eq("job_id", jobId)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle()),
    dbQuery<Row[]>(db(ctx).from("job_media_assets").select(
      "id,stage,mime_type,created_at",
    ).eq("job_id", jobId).eq("stage", "scope_change").order("created_at", { ascending: true })),
  ]);
  if (jobResult.error || !jobResult.data || disputeResult.error || mediaResult.error) {
    apiFailure("DB_ERROR", "Không thể tải chi tiết đổi phạm vi", 500);
  }
  const job = jobResult.data;
  const summary = serializeAdminScopeChangeSummary(scope, job);
  const originalMin = nullableNumber(job.kael_price_min);
  const originalMax = nullableNumber(job.kael_price_max);
  const deltaMin = nullableNumber(scope.kael_computed_min) ?? nullableNumber(scope.price_min);
  const deltaMax = nullableNumber(scope.kael_computed_max) ?? nullableNumber(scope.price_max);
  return {
    generated_at: new Date().toISOString(),
    summary,
    original_scope: {
      description: nullableString(scope.original_summary) ?? nullableString(job.description),
      price_min_vnd: originalMin,
      price_max_vnd: originalMax,
    },
    proposed_scope: {
      description: requiredString(scope.requested_description, "proposed scope"),
      reason: requiredString(scope.reason, "scope reason"),
      request_timing: requiredRequestTiming(scope.request_timing),
      requested_at: requiredString(scope.created_at, "requested at"),
      customer_decision_at: nullableString(scope.customer_decision_at),
    },
    pricing: {
      kael_min_vnd: deltaMin,
      kael_max_vnd: deltaMax,
      total_min_vnd: sumMoney(originalMin, deltaMin),
      total_max_vnd: sumMoney(originalMax, deltaMax),
    },
    evidence: serializeMediaEvidence(mediaResult.data ?? []),
    timeline: scopeTimeline(scope, job),
    price_receipt: safePriceReceipt(scope.kael_review),
    related_dispute: disputeResult.data ? {
      dispute_id: requiredString(disputeResult.data.id, "dispute id"),
      dispute_type: requiredString(disputeResult.data.dispute_type, "dispute type"),
      status: requiredString(disputeResult.data.status, "dispute status"),
    } : null,
  };
}

export async function listAdminSupportCases(
  ctx: MobileApiContext,
  input: AdminSupportCaseListInput,
): Promise<AdminSupportCaseListResponse> {
  await requireAdminCapability(ctx, "operations.read");
  const [disputes, queues] = await Promise.all([
    fetchAllRows((from, to) => db(ctx).from("disputes").select(
      "id,job_id,dispute_type,status,counter_party_response_deadline,created_at,updated_at",
    ).order("updated_at", { ascending: true }).order("id", { ascending: true }).range(from, to), "Không thể tải tranh chấp"),
    fetchAllRows((from, to) => db(ctx).from("kael_admin_queue").select(
      "id,job_id,queue_type,priority,status,reason_code,safe_metadata,created_at,updated_at",
    ).in("queue_type", [...ADMIN_SUPPORT_QUEUE_READ_TYPES]).order("updated_at", { ascending: true })
      .order("id", { ascending: true }).range(from, to), "Không thể tải hàng chờ hỗ trợ"),
  ]);
  const disputeQueues = new Map(queues
    .filter((row) => row.queue_type === "dispute_review")
    .map((row) => [supportCaseIdentity(row), row]));
  const base: SupportSourceRow[] = [
    ...disputes.map((row): SupportSourceRow => ({
      ...row,
      queue_priority: disputeQueues.get(`dispute:${requiredString(row.id, "dispute id")}`)?.priority,
      source: "dispute",
    })),
    ...queues.filter((row) => row.queue_type !== "dispute_review")
      .map((row): SupportSourceRow => ({ ...row, source: "queue" })),
  ];
  const jobIds = base.flatMap((row) => nullableString(row.job_id) ? [nullableString(row.job_id)!] : []);
  const [jobs, preparations] = await Promise.all([
    jobMap(ctx, jobIds),
    preparationMap(ctx, base),
  ]);
  const summaries = base.map((row) => supportSummary(row, jobs, preparations))
    .filter((record) => input.type === "all" || record.type === input.type)
    .filter((record) => input.source_status === "all" || record.source_status === input.source_status)
    .filter((record) => input.priority === "all" || record.priority === input.priority)
    .filter((record) => input.service_type === "all" || record.service_type === input.service_type)
    .filter((record) => input.preparation_status === "all" || (record.preparation_status ?? "new") === input.preparation_status)
    .filter((record) => input.assignee === "all" ||
      (input.assignee === "unassigned" ? !record.assigned_to : record.assigned_to === ctx.user.id))
    .filter((record) => !input.query || supportSearchText(record).includes(input.query.toLocaleLowerCase("vi-VN")))
    .sort(compareSupportSummary);
  const visible = afterCursor(summaries, input.cursor, supportCursorKey);
  const records = visible.slice(0, input.limit);
  const hasMore = visible.length > input.limit;
  return {
    generated_at: new Date().toISOString(),
    counts: breakdown(summaries.map((record) => record.type)),
    records,
    has_more: hasMore,
    next_cursor: hasMore && records.length > 0 ? encodeCursor(supportCursorKey(records[records.length - 1]!)) : null,
  };
}

export async function getAdminSupportCase(
  ctx: MobileApiContext,
  source: AdminSupportCaseSource,
  caseId: string,
): Promise<AdminSupportCaseDetailResponse> {
  const actor = await requireAdminCapability(ctx, "operations.read");
  const sourceRow = await supportSourceRow(ctx, source, caseId);
  const row = source === "dispute"
    ? { ...sourceRow, queue_priority: await disputeQueuePriority(ctx, caseId) }
    : sourceRow;
  const jobId = nullableString(row.job_id);
  const [jobs, preparations, notes, profiles, media, messages, scopes] = await Promise.all([
    jobMap(ctx, jobId ? [jobId] : []),
    preparationMap(ctx, [{ ...row, source }]),
    supportNotes(ctx, source, caseId),
    partyProfiles(ctx, row),
    jobId ? jobMedia(ctx, jobId) : Promise.resolve([]),
    jobId ? jobMessages(ctx, jobId) : Promise.resolve([]),
    jobId ? jobScopes(ctx, jobId) : Promise.resolve([]),
  ]);
  const summary = supportSummary({ ...row, source }, jobs, preparations);
  const preparationRow = preparations.get(`${source}:${caseId}`);
  const assignedTo = nullableString(preparationRow?.assigned_to);
  const assigneeProfiles = await profileMap(ctx, assignedTo ? [assignedTo] : []);
  const preparation = preparationFromRow(
    preparationRow,
    actor.capabilities.includes("operations.triage"),
    ctx.user.id,
    assignedTo ? assigneeProfiles.get(assignedTo)?.name ?? null : null,
  );
  const snapshot = source === "dispute" ? await disputeEvidenceSnapshot(ctx, row) : null;
  return {
    generated_at: new Date().toISOString(),
    summary,
    neutral_summary: scrubText(nullableString(row.kael_neutral_summary) ?? nullableString(row.response_summary) ?? nullableString(row.reason_code) ?? ""),
    parties: profiles,
    opening_statement: scrubNullable(row.initiator_statement),
    counterparty_statement: scrubNullable(row.counter_party_statement),
    evidence: [
      ...serializeSnapshotEvidence(snapshot),
      ...serializeMediaEvidence(media),
    ],
    timeline: [
      ...serializeSnapshotTimeline(snapshot),
      ...supportTimeline(row, jobs.get(jobId ?? ""), messages, scopes),
    ].sort((left, right) => left.occurred_at.localeCompare(right.occurred_at)),
    abuse_signals: asStringArray(row.abuse_signals).map(scrubText).filter(Boolean),
    recorded_decision: safeRecordedDecision(row.admin_decision),
    preparation,
    notes,
  };
}

export async function updateAdminSupportCasePreparation(
  ctx: MobileApiContext,
  source: AdminSupportCaseSource,
  caseId: string,
  input: AdminSupportPreparationInput,
): Promise<AdminSupportPreparation> {
  await requireAdminCapability(ctx, "operations.triage");
  await supportSourceRow(ctx, source, caseId);
  const result = await dbQuery<Row[]>(db(ctx).rpc("admin_update_support_case_preparation_atomic", {
    p_actor_id: ctx.user.id,
    p_source_kind: source,
    p_source_id: caseId,
    p_expected_version: input.expected_version,
    p_idempotency_key: input.idempotency_key,
    p_assignment: input.assignment ?? "keep",
    p_status: input.status ?? null,
    p_checklist_patch: input.checklist ?? {},
    p_note: input.note ? scrubText(input.note) : null,
  }));
  const row = result.data?.[0];
  if (result.error || !row) apiFailure("DB_ERROR", "Không thể lưu hồ sơ chuẩn bị", 500);
  if (row.ok !== true) mapPreparationError(nullableString(row.error_code));
  const assignedTo = nullableString(row.assigned_to_out);
  const assigneeProfiles = await profileMap(ctx, assignedTo ? [assignedTo] : []);
  return preparationFromRow({
    assigned_to: row.assigned_to_out,
    checklist: row.checklist_out,
    status: row.status_out,
    updated_at: row.updated_at_out,
    version: row.version_out,
  }, true, ctx.user.id, assignedTo ? assigneeProfiles.get(assignedTo)?.name ?? null : null);
}

export async function createAdminScopeEvidenceAccess(
  ctx: MobileApiContext,
  scopeChangeId: string,
  input: AdminEvidenceAccessInput,
): Promise<AdminEvidenceAccessResponse> {
  await requireAdminCapability(ctx, "operations.read");
  const scope = await dbQuery<Row>(db(ctx).from("scope_change_requests").select("job_id").eq("id", scopeChangeId).maybeSingle());
  if (scope.error) apiFailure("DB_ERROR", "Không thể kiểm tra evidence đổi phạm vi", 500);
  if (!scope.data) apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu đổi phạm vi", 404);
  return createEvidenceAccess(ctx, requiredString(scope.data.job_id, "job id"), input, "scope_change", scopeChangeId);
}

export async function createAdminSupportEvidenceAccess(
  ctx: MobileApiContext,
  source: AdminSupportCaseSource,
  caseId: string,
  input: AdminEvidenceAccessInput,
): Promise<AdminEvidenceAccessResponse> {
  await requireAdminCapability(ctx, "operations.read");
  const sourceRow = await supportSourceRow(ctx, source, caseId);
  const jobId = nullableString(sourceRow.job_id);
  if (!jobId) apiFailure("NOT_FOUND", "Ca hỗ trợ không có evidence công việc", 404);
  return createEvidenceAccess(ctx, jobId, input, "support_case", `${source}:${caseId}`);
}

export function serializeAdminScopeChangeSummary(scope: Row, job: Row = {}): AdminScopeChangeSummary {
  const row = { ...job, ...scope };
  return {
    scope_change_id: requiredString(row.id, "scope change id"),
    job_id: requiredString(row.job_id, "job id"),
    display_code: requiredString(row.display_code, "display code"),
    service_type: requiredServiceType(row.service_type),
    status: requiredScopeStatus(row.status),
    updated_at: requiredString(row.updated_at, "scope updated_at"),
    delta_min_vnd: nullableNumber(row.kael_computed_min) ?? nullableNumber(row.price_min),
    delta_max_vnd: nullableNumber(row.kael_computed_max) ?? nullableNumber(row.price_max),
  };
}

export function serializeAdminSupportQueueSummary(row: Row): AdminSupportCaseSummary {
  const type = requiredQueueType(row.queue_type);
  return {
    source: "queue",
    case_id: requiredString(row.id, "queue id"),
    type,
    job_id: nullableString(row.job_id),
    priority: requiredPriority(row.priority),
    source_status: requiredString(row.status, "queue status"),
    reason_code: requiredString(row.reason_code, "reason code"),
    updated_at: requiredString(row.updated_at, "queue updated_at"),
  };
}

export function supportCaseIdentity(row: Row): string {
  const queueType = nullableString(row.queue_type);
  if (queueType === "dispute_review") {
    const disputeId = nullableString(asRecord(row.safe_metadata).dispute_id);
    if (disputeId) return `dispute:${disputeId}`;
  }
  return `queue:${requiredString(row.id, "queue id")}`;
}

async function createEvidenceAccess(
  ctx: MobileApiContext,
  jobId: string,
  input: AdminEvidenceAccessInput,
  purpose: string,
  subject: string,
): Promise<AdminEvidenceAccessResponse> {
  if (input.evidence_id.startsWith("snapshot:")) {
    apiFailure("NOT_FOUND", "Evidence snapshot được xem trực tiếp, không có tệp tải xuống", 404);
  }
  const media = await dbQuery<Row>(db(ctx).from("job_media_assets").select(
    "id,job_id,bucket_id,object_path",
  ).eq("id", input.evidence_id).eq("job_id", jobId).maybeSingle());
  if (media.error) apiFailure("DB_ERROR", "Không thể kiểm tra evidence", 500);
  if (!media.data) apiFailure("NOT_FOUND", "Không tìm thấy evidence", 404);
  const bucket = requiredString(media.data.bucket_id, "evidence bucket");
  const path = requiredString(media.data.object_path, "evidence object");
  const signed = await (ctx.supabase as EvidenceClient).storage.from(bucket).createSignedUrl(path, 300);
  if (signed.error || !signed.data?.signedUrl) apiFailure("STORAGE_ERROR", "Không thể mở evidence", 503);
  const audit = await dbQuery(db(ctx).from("kael_permission_audit").insert({
    actor_id: ctx.user.id,
    actor_role: ctx.role,
    purpose: `admin_${purpose}_evidence_access`,
    action: "view",
    topic: "job_media_asset",
    decision: "allow",
    reason_code: "short_lived_signed_url",
    safe_metadata: { evidence_id: input.evidence_id, subject },
  }));
  if (audit.error) apiFailure("AUDIT_FAILED", "Không thể ghi nhận lần mở evidence", 500);
  return {
    evidence_id: input.evidence_id,
    signed_url: signed.data.signedUrl,
    expires_at: new Date(Date.now() + 300_000).toISOString(),
  };
}

async function supportSourceRow(ctx: MobileApiContext, source: AdminSupportCaseSource, caseId: string) {
  const query = source === "dispute"
    ? db(ctx).from("disputes").select(
      "id,job_id,dispute_type,status,initiated_by,initiated_by_id,counter_party_id,initiator_statement,counter_party_statement,counter_party_response_deadline,evidence_snapshot_id,evidence_locked_at,kael_neutral_summary,abuse_signals,admin_decision,created_at,updated_at",
    ).eq("id", caseId)
    : db(ctx).from("kael_admin_queue").select(
      "id,job_id,actor_id,actor_role,queue_type,priority,status,reason_code,response_summary,safe_metadata,created_at,updated_at",
    ).eq("id", caseId).in("queue_type", [...ADMIN_SUPPORT_QUEUE_TYPES]);
  const result = await dbQuery<Row>(query.maybeSingle());
  if (result.error) apiFailure("DB_ERROR", "Không thể tải ca hỗ trợ", 500);
  if (!result.data) apiFailure("NOT_FOUND", "Không tìm thấy ca hỗ trợ", 404);
  return result.data;
}

async function jobMap(ctx: MobileApiContext, ids: string[]) {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return new Map<string, Row>();
  const rows: Row[] = [];
  for (let index = 0; index < unique.length; index += PAGE_SIZE) {
    const result = await dbQuery<Row[]>(db(ctx).from("jobs").select(
      "id,display_code,service_type,description,kael_price_min,kael_price_max,final_price,status,payment_status,customer_id,worker_id,created_at,matched_at,arrived_at,completed_at,confirmed_at,paid_at,updated_at",
    ).in("id", unique.slice(index, index + PAGE_SIZE)));
    if (result.error) apiFailure("DB_ERROR", "Không thể tải công việc liên quan", 500);
    rows.push(...(result.data ?? []));
  }
  return new Map(rows.map((row) => [requiredString(row.id, "job id"), row]));
}

async function preparationMap(ctx: MobileApiContext, rows: SupportSourceRow[]) {
  if (rows.length === 0) return new Map<string, Row>();
  const ids = rows.map((row) => requiredString(row.id, "case id"));
  const result = await dbQuery<Row[]>(db(ctx).from("admin_support_case_preparations").select(
    "source_kind,source_id,assigned_to,status,checklist,version,updated_at",
  ).in("source_id", ids));
  if (result.error) apiFailure("DB_ERROR", "Không thể tải trạng thái chuẩn bị", 500);
  return new Map((result.data ?? []).map((row) => [
    `${requiredString(row.source_kind, "source kind")}:${requiredString(row.source_id, "source id")}`,
    row,
  ]));
}

function supportSummary(
  row: SupportSourceRow,
  jobs: Map<string, Row>,
  preparations: Map<string, Row>,
): AdminSupportCaseSummary {
  const source = row.source === "dispute" ? "dispute" : "queue";
  const id = requiredString(row.id, "case id");
  const jobId = nullableString(row.job_id);
  const job = jobId ? jobs.get(jobId) : undefined;
  const preparation = preparations.get(`${source}:${id}`);
  const common = {
    source,
    case_id: id,
    job_id: jobId,
    display_code: nullableString(job?.display_code),
    service_type: optionalServiceType(job?.service_type),
    preparation_status: optionalPreparationStatus(preparation?.status) ?? "new",
    assigned_to: nullableString(preparation?.assigned_to),
    updated_at: requiredString(row.updated_at, "case updated_at"),
  } as const;
  if (source === "queue") {
    return {
      ...common,
      type: requiredQueueType(row.queue_type),
      priority: requiredPriority(row.priority),
      source_status: requiredString(row.status, "queue status"),
      reason_code: requiredString(row.reason_code, "reason code"),
      deadline_at: null,
    };
  }
  return {
    ...common,
    type: "dispute",
    priority: optionalPriority(row.queue_priority) ?? disputePriority(nullableString(row.counter_party_response_deadline)),
    source_status: requiredString(row.status, "dispute status"),
    reason_code: requiredString(row.dispute_type, "dispute type"),
    deadline_at: nullableString(row.counter_party_response_deadline),
  };
}

async function supportNotes(ctx: MobileApiContext, source: AdminSupportCaseSource, caseId: string) {
  const result = await dbQuery<Row[]>(db(ctx).from("admin_support_case_notes").select(
    "id,body,created_by,created_at",
  ).eq("source_kind", source).eq("source_id", caseId).order("created_at", { ascending: true }));
  if (result.error) apiFailure("DB_ERROR", "Không thể tải ghi chú nội bộ", 500);
  const authors = await profileMap(ctx, (result.data ?? []).flatMap((row) => nullableString(row.created_by) ? [nullableString(row.created_by)!] : []));
  return (result.data ?? []).map((row) => ({
    note_id: requiredString(row.id, "note id"),
    body: requiredString(row.body, "note body"),
    author_name: authors.get(nullableString(row.created_by) ?? "")?.name ?? null,
    created_at: requiredString(row.created_at, "note created_at"),
  }));
}

async function partyProfiles(ctx: MobileApiContext, row: Row) {
  const ids = [nullableString(row.initiated_by_id), nullableString(row.counter_party_id), nullableString(row.actor_id)]
    .filter((id): id is string => Boolean(id));
  const profiles = await profileMap(ctx, ids);
  if (nullableString(row.dispute_type)) {
    return [
      profileParty(requiredString(row.initiated_by, "initiator role"), nullableString(row.initiated_by_id), profiles),
      profileParty("counterparty", nullableString(row.counter_party_id), profiles),
    ];
  }
  return [profileParty(nullableString(row.actor_role) ?? "actor", nullableString(row.actor_id), profiles)];
}

async function profileMap(ctx: MobileApiContext, ids: string[]) {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return new Map<string, { name: string | null; phone: string | null }>();
  const result = await dbQuery<Row[]>(db(ctx).from("profiles").select("id,full_name,phone").in("id", unique));
  if (result.error) apiFailure("DB_ERROR", "Không thể tải thông tin các bên", 500);
  return new Map((result.data ?? []).map((row) => [requiredString(row.id, "profile id"), {
    name: nullableString(row.full_name),
    phone: nullableString(row.phone),
  }]));
}

function profileParty(role: string, id: string | null, profiles: Map<string, { name: string | null; phone: string | null }>) {
  const profile = id ? profiles.get(id) : undefined;
  return { role, name: maskName(profile?.name ?? null), contact_masked: maskContact(profile?.phone ?? null) };
}

async function disputeQueuePriority(ctx: MobileApiContext, disputeId: string) {
  const result = await dbQuery<Row>(db(ctx).from("kael_admin_queue").select("priority")
    .eq("queue_type", "dispute_review")
    .eq("safe_metadata->>dispute_id", disputeId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle());
  if (result.error) apiFailure("DB_ERROR", "Không thể tải mức ưu tiên tranh chấp", 500);
  return nullableString(result.data?.priority);
}

async function jobMedia(ctx: MobileApiContext, jobId: string) {
  const result = await dbQuery<Row[]>(db(ctx).from("job_media_assets").select(
    "id,stage,mime_type,created_at",
  ).eq("job_id", jobId).order("created_at", { ascending: true }));
  if (result.error) apiFailure("DB_ERROR", "Không thể tải evidence công việc", 500);
  return result.data ?? [];
}

async function jobMessages(ctx: MobileApiContext, jobId: string) {
  const result = await dbQuery<Row[]>(db(ctx).from("chat_messages").select(
    "id,sender_role,created_at",
  ).eq("job_id", jobId).order("created_at", { ascending: true }).limit(100));
  if (result.error) apiFailure("DB_ERROR", "Không thể tải timeline trao đổi", 500);
  return result.data ?? [];
}

async function jobScopes(ctx: MobileApiContext, jobId: string) {
  const result = await dbQuery<Row[]>(db(ctx).from("scope_change_requests").select(
    "id,status,created_at,updated_at,customer_decision_at",
  ).eq("job_id", jobId).order("created_at", { ascending: true }));
  if (result.error) apiFailure("DB_ERROR", "Không thể tải timeline đổi phạm vi", 500);
  return result.data ?? [];
}

async function disputeEvidenceSnapshot(ctx: MobileApiContext, dispute: Row) {
  const id = nullableString(dispute.evidence_snapshot_id);
  if (!id) return null;
  const result = await dbQuery<Row>(db(ctx).from("evidence_snapshots").select(
    "id,evidence_locked_at,evidence_snapshot",
  ).eq("id", id).maybeSingle());
  if (result.error) apiFailure("DB_ERROR", "Không thể kiểm tra evidence snapshot", 500);
  return result.data;
}
