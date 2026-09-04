import { SERVICE_TYPES, type ServiceType } from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import {
  asBoolean,
  asServiceTypeArray,
  nullableNumber,
  nullableString,
} from "../../platform/coercions.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery, type Chain } from "../../platform/db.ts";
import type {
  AdminControlCapability,
  AdminOverviewApplicationRecord,
  AdminOverviewBreakdown,
  AdminOverviewDetailKey,
  AdminOverviewDetailsInput,
  AdminOverviewDetailsResponse,
  AdminOverviewDisputeRecord,
  AdminOverviewJobRecord,
  AdminOverviewPaymentRecord,
  AdminOverviewQueueRecord,
  AdminOverviewWorkerRecord,
  AdminWorkerApplicationSummary,
} from "../contracts/admin-control.ts";
import { buildWorkerApplicationSummaries } from "./control.ts";
import { requireAdminCapability } from "./actor.ts";

type Row = Record<string, unknown>;
type DetailRequirement = AdminControlCapability | "owner";
type JobDetailKey = keyof typeof JOB_GROUP_STATUSES | "other";
type WorkerDetailKey = "workers_in_verification" | "workers_suspended";
type DetailResponse<Key extends AdminOverviewDetailKey> = Extract<AdminOverviewDetailsResponse, { key: Key }>;

const JOB_GROUP_STATUSES = {
  coordination: [
    "draft",
    "analyzing",
    "estimate_ready",
    "awaiting_customer_confirm",
    "broadcasting",
    "worker_candidate_pending",
  ],
  assigned: ["worker_matched", "worker_on_way", "arrived"],
  inService: ["inspecting", "repairing", "scope_change_pending"],
  finishing: ["completed_by_worker", "confirmed_by_customer", "payment_pending"],
} as const;

const KNOWN_JOB_STATUSES = [
  ...JOB_GROUP_STATUSES.coordination,
  ...JOB_GROUP_STATUSES.assigned,
  ...JOB_GROUP_STATUSES.inService,
  ...JOB_GROUP_STATUSES.finishing,
  "paid",
  "reviewed",
  "cancelled",
] as const;

const PAGE_SCAN_SIZE = 500;

export function capabilityForAdminOverviewDetail(
  key: AdminOverviewDetailKey,
): DetailRequirement {
  if (key === "worker_applications" || key === "workers_in_verification" || key === "workers_suspended") {
    return "workers.read";
  }
  if (key === "payment_attention") return "transactions.read";
  if (key === "open_disputes") return "owner";
  return "operations.read";
}

export async function getAdminOverviewDetails(
  ctx: MobileApiContext,
  input: AdminOverviewDetailsInput,
): Promise<AdminOverviewDetailsResponse> {
  const requirement = capabilityForAdminOverviewDetail(input.key);
  if (requirement === "owner") {
    if (ctx.role !== "admin") {
      apiFailure("AUTH_FORBIDDEN", "Chỉ Owner Admin mới có thể xem chi tiết tranh chấp", 403);
    }
  } else {
    await requireAdminCapability(ctx, requirement);
  }

  if (isJobDetailKey(input.key)) return getJobDetails(ctx, { ...input, key: input.key });
  if (input.key === "worker_applications") return getWorkerApplicationDetails(ctx, { ...input, key: input.key });
  if (input.key === "workers_in_verification" || input.key === "workers_suspended") {
    return getWorkerDetails(ctx, { ...input, key: input.key });
  }
  if (input.key === "payment_attention") return getPaymentDetails(ctx, { ...input, key: input.key });
  if (input.key === "open_disputes") return getDisputeDetails(ctx, { ...input, key: input.key });
  return getQueueDetails(ctx, { ...input, key: "other_admin_queue" });
}

function isJobDetailKey(
  key: AdminOverviewDetailKey,
): key is JobDetailKey {
  return key === "coordination" || key === "assigned" || key === "inService" ||
    key === "finishing" || key === "other";
}

async function getJobDetails(
  ctx: MobileApiContext,
  input: AdminOverviewDetailsInput & { key: JobDetailKey },
): Promise<AdminOverviewDetailsResponse> {
  const offset = cursorOffset(input.cursor);
  const pageResult = await dbQuery<Row[]>(applyJobFilter(
    db(ctx).from("jobs")
      .select("id,display_code,service_type,status,updated_at", { count: "exact" })
      .order("updated_at", { ascending: true })
      .range(offset, offset + input.limit - 1),
    input.key,
  ));
  assertQuery(pageResult.error, "Không thể tải danh sách công việc");
  const totalCount = exactCount(pageResult.count, "công việc");
  const records = (pageResult.data ?? []).map(serializeJobRecord);
  const statuses = input.key === "other"
    ? await breakdownFromRows(await fetchAllRows((from, to) => applyJobFilter(
      db(ctx).from("jobs").select("status").order("updated_at", { ascending: true }).range(from, to),
      input.key,
    )), "status")
    : await countJobStatuses(ctx, JOB_GROUP_STATUSES[input.key]);
  const serviceBreakdown = await countJobServices(ctx, input.key);
  const oldestUpdatedAt = await oldestJobUpdate(ctx, input.key);

  return responseEnvelope(input, totalCount, records, statuses, serviceBreakdown, oldestUpdatedAt);
}

async function getWorkerApplicationDetails(
  ctx: MobileApiContext,
  input: AdminOverviewDetailsInput & { key: "worker_applications" },
): Promise<AdminOverviewDetailsResponse> {
  const queueRows = await fetchAllRows((from, to) => db(ctx)
    .from("kael_admin_queue")
    .select("id,actor_id,status,safe_metadata,created_at,updated_at")
    .eq("queue_type", "worker_application_review")
    .in("status", ["open", "acknowledged"])
    .order("updated_at", { ascending: true })
    .range(from, to));
  const summaries = await buildWorkerApplicationSummaries(ctx, queueRows);
  const offset = cursorOffset(input.cursor);
  const records = summaries.slice(offset, offset + input.limit).map(serializeApplicationRecord);
  const statusBreakdown = breakdownFromValues(summaries.map((summary) => summary.stage));
  const serviceBreakdown = breakdownFromValues(summaries.flatMap((summary) =>
    Array.from(new Set(summary.worker_profile?.service_types ?? []))
  ));

  return responseEnvelope(
    input,
    summaries.length,
    records,
    statusBreakdown,
    serviceBreakdown,
    summaries[0]?.updated_at ?? null,
  );
}

async function getWorkerDetails(
  ctx: MobileApiContext,
  input: AdminOverviewDetailsInput & { key: WorkerDetailKey },
): Promise<AdminOverviewDetailsResponse> {
  const offset = cursorOffset(input.cursor);
  const pageResult = await dbQuery<Row[]>(applyWorkerFilter(
    db(ctx).from("worker_profiles")
      .select("id,verification_status,is_suspended,service_types,updated_at", { count: "exact" })
      .order("updated_at", { ascending: true })
      .range(offset, offset + input.limit - 1),
    input.key,
  ));
  assertQuery(pageResult.error, "Không thể tải danh sách thợ");
  const totalCount = exactCount(pageResult.count, "thợ");
  const rows = pageResult.data ?? [];
  const profiles = await profileNames(ctx, rows.map((row) => requiredString(row.id, "worker id")));
  const records = rows.map((row) => serializeAdminOverviewWorkerRecord({
    ...row,
    full_name: profiles.get(requiredString(row.id, "worker id")) ?? null,
  }));
  const statusBreakdown = await countWorkerStatuses(ctx, input.key);
  const serviceBreakdown = await countWorkerServices(ctx, input.key);
  const oldestUpdatedAt = await oldestWorkerUpdate(ctx, input.key);

  return responseEnvelope(input, totalCount, records, statusBreakdown, serviceBreakdown, oldestUpdatedAt);
}

async function getPaymentDetails(
  ctx: MobileApiContext,
  input: AdminOverviewDetailsInput & { key: "payment_attention" },
): Promise<AdminOverviewDetailsResponse> {
  const offset = cursorOffset(input.cursor);
  const result = await dbQuery<Row[]>(db(ctx).from("jobs")
    .select("id,display_code,service_type,payment_status,payment_updated_at,updated_at", { count: "exact" })
    .eq("payment_status", "amount_mismatch")
    .order("updated_at", { ascending: true })
    .range(offset, offset + input.limit - 1));
  assertQuery(result.error, "Không thể tải danh sách thanh toán cần chú ý");
  const totalCount = exactCount(result.count, "thanh toán cần chú ý");
  const records = (result.data ?? []).map(serializePaymentRecord);
  const serviceBreakdown = await countPaymentServices(ctx);
  const oldestUpdatedAt = await oldestPaymentUpdate(ctx);

  return responseEnvelope(
    input,
    totalCount,
    records,
    totalCount > 0 ? [{ count: totalCount, key: "amount_mismatch" }] : [],
    serviceBreakdown,
    oldestUpdatedAt,
  );
}

async function getDisputeDetails(
  ctx: MobileApiContext,
  input: AdminOverviewDetailsInput & { key: "open_disputes" },
): Promise<AdminOverviewDetailsResponse> {
  const allRows = await fetchAllRows((from, to) => db(ctx).from("disputes")
    .select("id,job_id,dispute_type,status,updated_at")
    .neq("status", "resolved")
    .order("updated_at", { ascending: true })
    .range(from, to));
  const offset = cursorOffset(input.cursor);
  const pageRows = allRows.slice(offset, offset + input.limit);
  const jobs = await jobIdentityMap(ctx, pageRows.map((row) => requiredString(row.job_id, "job id")));
  const records = pageRows.map((row) => serializeDisputeRecord(row, jobs));
  const statusBreakdown = breakdownFromRows(allRows, "status");
  const serviceBreakdown = await disputeServiceBreakdown(ctx, allRows);

  return responseEnvelope(
    input,
    allRows.length,
    records,
    statusBreakdown,
    serviceBreakdown,
    nullableString(allRows[0]?.updated_at),
  );
}

async function getQueueDetails(
  ctx: MobileApiContext,
  input: AdminOverviewDetailsInput & { key: "other_admin_queue" },
): Promise<AdminOverviewDetailsResponse> {
  const rows = await fetchAllRows((from, to) => db(ctx).from("kael_admin_queue")
    .select("id,queue_type,status,updated_at")
    .neq("queue_type", "worker_application_review")
    .in("status", ["open", "acknowledged"])
    .order("updated_at", { ascending: true })
    .range(from, to));
  const offset = cursorOffset(input.cursor);
  const records = rows.slice(offset, offset + input.limit).map(serializeQueueRecord);

  return responseEnvelope(
    input,
    rows.length,
    records,
    breakdownFromRows(rows, "status"),
    [],
    nullableString(rows[0]?.updated_at),
  );
}

function applyJobFilter(query: Chain, key: keyof typeof JOB_GROUP_STATUSES | "other") {
  if (key !== "other") return query.in("status", [...JOB_GROUP_STATUSES[key]]);
  return query.or(`status.not.in.(${KNOWN_JOB_STATUSES.join(",")})`);
}

function applyWorkerFilter(query: Chain, key: AdminOverviewDetailKey) {
  if (key === "workers_suspended") return query.eq("is_suspended", true);
  return query.in("verification_status", ["submitted", "under_review"]);
}

async function countJobStatuses(
  ctx: MobileApiContext,
  statuses: readonly string[],
): Promise<AdminOverviewBreakdown[]> {
  const counts = await Promise.all(statuses.map(async (status) => ({
    count: await countResult(
      db(ctx).from("jobs").select("id", { count: "exact", head: true }).eq("status", status),
      `công việc ${status}`,
    ),
    key: status,
  })));
  return counts.filter((entry) => entry.count > 0);
}

async function countJobServices(
  ctx: MobileApiContext,
  key: keyof typeof JOB_GROUP_STATUSES | "other",
): Promise<AdminOverviewBreakdown[]> {
  const counts = await Promise.all(SERVICE_TYPES.map(async (serviceType) => ({
    count: await countResult(
      applyJobFilter(
        db(ctx).from("jobs").select("id", { count: "exact", head: true }).eq("service_type", serviceType),
        key,
      ),
      `công việc ${serviceType}`,
    ),
    key: serviceType,
  })));
  return counts.filter((entry) => entry.count > 0);
}

async function countWorkerStatuses(
  ctx: MobileApiContext,
  key: AdminOverviewDetailKey,
): Promise<AdminOverviewBreakdown[]> {
  const statuses = key === "workers_suspended"
    ? ["suspended"]
    : ["submitted", "under_review"];
  const counts = await Promise.all(statuses.map(async (status) => {
    let query = db(ctx).from("worker_profiles").select("id", { count: "exact", head: true });
    query = key === "workers_suspended"
      ? query.eq("is_suspended", true)
      : query.eq("verification_status", status);
    return { count: await countResult(query, `thợ ${status}`), key: status };
  }));
  return counts.filter((entry) => entry.count > 0);
}

async function countWorkerServices(
  ctx: MobileApiContext,
  key: AdminOverviewDetailKey,
): Promise<AdminOverviewBreakdown[]> {
  const counts = await Promise.all(SERVICE_TYPES.map(async (serviceType) => ({
    count: await countResult(
      applyWorkerFilter(
        db(ctx).from("worker_profiles")
          .select("id", { count: "exact", head: true })
          .contains("service_types", [serviceType]),
        key,
      ),
      `thợ ${serviceType}`,
    ),
    key: serviceType,
  })));
  return counts.filter((entry) => entry.count > 0);
}

async function countPaymentServices(ctx: MobileApiContext): Promise<AdminOverviewBreakdown[]> {
  const counts = await Promise.all(SERVICE_TYPES.map(async (serviceType) => ({
    count: await countResult(
      db(ctx).from("jobs").select("id", { count: "exact", head: true })
        .eq("payment_status", "amount_mismatch")
        .eq("service_type", serviceType),
      `thanh toán ${serviceType}`,
    ),
    key: serviceType,
  })));
  return counts.filter((entry) => entry.count > 0);
}

async function oldestJobUpdate(
  ctx: MobileApiContext,
  key: keyof typeof JOB_GROUP_STATUSES | "other",
) {
  const result = await dbQuery<Row[]>(applyJobFilter(
    db(ctx).from("jobs").select("updated_at").order("updated_at", { ascending: true }).limit(1),
    key,
  ));
  assertQuery(result.error, "Không thể xác định công việc cập nhật lâu nhất");
  return nullableString(result.data?.[0]?.updated_at);
}

async function oldestWorkerUpdate(ctx: MobileApiContext, key: AdminOverviewDetailKey) {
  const result = await dbQuery<Row[]>(applyWorkerFilter(
    db(ctx).from("worker_profiles").select("updated_at").order("updated_at", { ascending: true }).limit(1),
    key,
  ));
  assertQuery(result.error, "Không thể xác định hồ sơ thợ cập nhật lâu nhất");
  return nullableString(result.data?.[0]?.updated_at);
}

async function oldestPaymentUpdate(ctx: MobileApiContext) {
  const result = await dbQuery<Row[]>(db(ctx).from("jobs")
    .select("updated_at")
    .eq("payment_status", "amount_mismatch")
    .order("updated_at", { ascending: true })
    .limit(1));
  assertQuery(result.error, "Không thể xác định thanh toán cập nhật lâu nhất");
  return nullableString(result.data?.[0]?.updated_at);
}

async function profileNames(ctx: MobileApiContext, ids: string[]) {
  if (ids.length === 0) return new Map<string, string | null>();
  const result = await dbQuery<Row[]>(db(ctx).from("profiles").select("id,full_name").in("id", ids));
  assertQuery(result.error, "Không thể tải tên thợ");
  return new Map((result.data ?? []).map((row) => [
    requiredString(row.id, "profile id"),
    nullableString(row.full_name),
  ]));
}

async function jobIdentityMap(ctx: MobileApiContext, ids: string[]) {
  if (ids.length === 0) return new Map<string, Row>();
  const result = await dbQuery<Row[]>(db(ctx).from("jobs")
    .select("id,display_code,service_type")
    .in("id", Array.from(new Set(ids))));
  assertQuery(result.error, "Không thể tải mã công việc của tranh chấp");
  return new Map((result.data ?? []).map((row) => [requiredString(row.id, "job id"), row]));
}

async function disputeServiceBreakdown(ctx: MobileApiContext, rows: Row[]) {
  const jobIds = Array.from(new Set(rows.map((row) => requiredString(row.job_id, "job id"))));
  const jobRows: Row[] = [];
  for (let index = 0; index < jobIds.length; index += PAGE_SCAN_SIZE) {
    const result = await dbQuery<Row[]>(db(ctx).from("jobs")
      .select("id,service_type")
      .in("id", jobIds.slice(index, index + PAGE_SCAN_SIZE)));
    assertQuery(result.error, "Không thể tải nhóm dịch vụ tranh chấp");
    jobRows.push(...(result.data ?? []));
  }
  return breakdownFromRows(jobRows, "service_type");
}

async function countResult(query: Chain, subject: string) {
  const result = await dbQuery<null>(query);
  assertQuery(result.error, `Không thể đếm ${subject}`);
  return exactCount(result.count, subject);
}

async function fetchAllRows(factory: (from: number, to: number) => Chain): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SCAN_SIZE) {
    const result = await dbQuery<Row[]>(factory(offset, offset + PAGE_SCAN_SIZE - 1));
    assertQuery(result.error, "Không thể tải dữ liệu chi tiết Tổng quan");
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SCAN_SIZE) return rows;
  }
}

function responseEnvelope<Key extends AdminOverviewDetailKey>(
  input: AdminOverviewDetailsInput & { key: Key },
  totalCount: number,
  records: DetailResponse<Key>["records"],
  statusBreakdown: AdminOverviewBreakdown[],
  serviceBreakdown: AdminOverviewBreakdown[],
  oldestUpdatedAt: string | null,
): DetailResponse<Key> {
  const offset = cursorOffset(input.cursor);
  const nextOffset = offset + records.length;
  const hasMore = nextOffset < totalCount;
  return {
    generated_at: new Date().toISOString(),
    has_more: hasMore,
    key: input.key,
    next_cursor: hasMore ? String(nextOffset) : null,
    oldest_updated_at: oldestUpdatedAt,
    records,
    service_breakdown: serviceBreakdown,
    status_breakdown: statusBreakdown,
    total_count: totalCount,
  } as DetailResponse<Key>;
}

function serializeJobRecord(row: Row): AdminOverviewJobRecord {
  return {
    display_code: requiredString(row.display_code, "display code"),
    job_id: requiredString(row.id, "job id"),
    kind: "job",
    service_type: requiredServiceType(row.service_type),
    status: requiredString(row.status, "job status"),
    updated_at: requiredString(row.updated_at, "job updated_at"),
  };
}

function serializeApplicationRecord(
  summary: AdminWorkerApplicationSummary,
): AdminOverviewApplicationRecord {
  const contactMasked = summary.phone_masked ??
    (summary.contact_suffix ? `•••• ${summary.contact_suffix.slice(-4)}` : null);
  return {
    application_id: summary.id,
    checklist: summary.checklist,
    contact_masked: contactMasked,
    kind: "application",
    name: summary.full_name,
    service_types: summary.worker_profile?.service_types ?? [],
    stage: summary.stage,
    updated_at: summary.updated_at,
    worker_id: summary.worker_id,
  };
}

export function serializeAdminOverviewWorkerRecord(row: Row): AdminOverviewWorkerRecord {
  return {
    kind: "worker",
    name: nullableString(row.full_name),
    service_types: asServiceTypeArray(row.service_types),
    state: asBoolean(row.is_suspended)
      ? "suspended"
      : requiredString(row.verification_status, "worker state"),
    updated_at: requiredString(row.updated_at, "worker updated_at"),
    worker_id: requiredString(row.id, "worker id"),
  };
}

function serializePaymentRecord(row: Row): AdminOverviewPaymentRecord {
  return {
    display_code: requiredString(row.display_code, "display code"),
    job_id: requiredString(row.id, "job id"),
    kind: "payment",
    payment_status: requiredString(row.payment_status, "payment status"),
    service_type: requiredServiceType(row.service_type),
    updated_at: nullableString(row.payment_updated_at) ?? requiredString(row.updated_at, "payment updated_at"),
  };
}

function serializeDisputeRecord(
  row: Row,
  jobs: Map<string, Row>,
): AdminOverviewDisputeRecord {
  const jobId = requiredString(row.job_id, "job id");
  const job = jobs.get(jobId);
  return {
    display_code: nullableString(job?.display_code) ?? jobId,
    dispute_id: requiredString(row.id, "dispute id"),
    dispute_type: requiredString(row.dispute_type, "dispute type"),
    job_id: jobId,
    kind: "dispute",
    status: requiredString(row.status, "dispute status"),
    updated_at: requiredString(row.updated_at, "dispute updated_at"),
  };
}

function serializeQueueRecord(row: Row): AdminOverviewQueueRecord {
  return {
    kind: "queue",
    queue_id: requiredString(row.id, "queue id"),
    queue_type: requiredString(row.queue_type, "queue type"),
    status: requiredString(row.status, "queue status"),
    updated_at: requiredString(row.updated_at, "queue updated_at"),
  };
}

function breakdownFromRows(rows: Row[], field: string): AdminOverviewBreakdown[] {
  return breakdownFromValues(rows.flatMap((row) => {
    const value = nullableString(row[field]);
    return value ? [value] : [];
  }));
}

function breakdownFromValues(values: string[]): AdminOverviewBreakdown[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts, ([key, count]) => ({ count, key }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function requiredServiceType(value: unknown): ServiceType {
  const serviceType = nullableString(value);
  if (serviceType && (SERVICE_TYPES as readonly string[]).includes(serviceType)) {
    return serviceType as ServiceType;
  }
  apiFailure("DB_ERROR", "Dữ liệu nhóm dịch vụ không hợp lệ", 500);
}

function requiredString(value: unknown, subject: string) {
  const string = nullableString(value)?.trim();
  if (!string) apiFailure("DB_ERROR", `Dữ liệu ${subject} không hợp lệ`, 500);
  return string;
}

function cursorOffset(cursor: string | undefined) {
  if (!cursor) return 0;
  const offset = Number.parseInt(cursor, 10);
  if (!Number.isInteger(offset) || offset < 0) {
    apiFailure("VALIDATION", "Con trỏ chi tiết Tổng quan không hợp lệ", 400);
  }
  return offset;
}

function exactCount(value: unknown, subject: string) {
  const count = nullableNumber(value);
  if (count === null || !Number.isInteger(count) || count < 0) {
    apiFailure("DB_ERROR", `Không thể xác định tổng số ${subject}`, 500);
  }
  return count;
}

function assertQuery(error: unknown, message: string) {
  if (error) apiFailure("DB_ERROR", message, 500);
}
