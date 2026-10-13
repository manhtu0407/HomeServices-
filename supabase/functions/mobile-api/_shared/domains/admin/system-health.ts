import {
  sanitizeSystemIncidentPacket,
  systemHealthSnapshotSchema,
  type EdgeSystemIncidentPacket as SystemIncidentPacket,
  type EdgeSystemHealthSnapshot as SystemHealthSnapshot,
} from "../../../../_shared/contracts/system-health.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { db, dbQuery } from "../../platform/db.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { AdminSystemContracts } from "../contracts/admin-system.ts";
import { decodeAdminSystemCursor, encodeAdminSystemCursor } from "./system-pagination.ts";

type Row = Record<string, unknown>;
type IncidentInput = AdminSystemContracts["incidentListInput"];
const INCIDENT_COLUMNS = "incident_id,external_incident_id,fingerprint,component,detector,severity,status,opened_at,updated_at,last_seen_at,resolved_at,release_id,build_id,platform,route_kind,stage,trace_id,run_id,request_id,support_code,evidence";
const SAFE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const SAFE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function getSystemHealth(ctx: MobileApiContext, schemaVersion: 1 | 2): Promise<AdminSystemContracts["healthResponse"]> {
  const [snapshotResult, observerResult] = await Promise.all([
    dbQuery<Row>(db(ctx).from("system_health_snapshots")
      .select("schema_version,profile_id,required_check_ids,coverage_gaps,environment,project_ref,release_id,scheduled_at,completed_at,expires_at,overall_status,checks")
      .eq("environment", healthEnvironment(ctx)).order("scheduled_at", { ascending: false }).limit(1).maybeSingle()),
    dbQuery<Row>(db(ctx).from("system_health_observer_state")
      .select("observer_heartbeat_at,dispatcher_status,d1_status,last_snapshot_at,last_error_code")
      .eq("environment", healthEnvironment(ctx)).maybeSingle()),
  ]);
  if (snapshotResult.error || observerResult.error) apiFailure("DB_ERROR", "Không thể tải sức khỏe hệ thống", 500);

  const parsedSnapshot = snapshotResult.data ? systemHealthSnapshotSchema.safeParse(snapshotResult.data) : null;
  const observer = observerResult.data ? serializeObserver(observerResult.data) : null;
  let snapshot = parsedSnapshot?.success ? parsedSnapshot.data : null;
  if (snapshot?.schema_version === 2 && schemaVersion === 1) {
    const checks = [...snapshot.checks, {
      check_id: "profile-coverage-unsupported",
      component: "app",
      status: "gray" as const,
      reason_code: "PROFILE_COVERAGE_UNSUPPORTED",
      observed_at: snapshot.completed_at,
      evidence_window: null,
      sample_count: null,
      metrics: {},
      incident_id: null,
    }];
    snapshot = {
      schema_version: 1,
      environment: snapshot.environment,
      project_ref: snapshot.project_ref,
      release_id: snapshot.release_id,
      scheduled_at: snapshot.scheduled_at,
      completed_at: snapshot.completed_at,
      expires_at: snapshot.expires_at,
      overall_status: snapshot.overall_status === "red" || snapshot.overall_status === "yellow" ? snapshot.overall_status : "gray",
      checks,
    };
  }
  return {
    generated_at: new Date().toISOString(),
    snapshot,
    observer,
  };
}

export async function listSystemIncidents(
  ctx: MobileApiContext,
  input: IncidentInput,
): Promise<AdminSystemContracts["incidentListResponse"]> {
  const cursor = input.cursor ? decodeAdminSystemCursor(input.cursor) : null;
  if (input.cursor && (!cursor || !SAFE_TIMESTAMP.test(cursor.primary) || !SAFE_UUID.test(cursor.id))) {
    apiFailure("VALIDATION", "Con trỏ sự cố không hợp lệ", 400);
  }
  let query = db(ctx).from("system_health_incidents").select(INCIDENT_COLUMNS)
    .eq("environment", healthEnvironment(ctx))
    .order("opened_at", { ascending: false })
    .order("incident_id", { ascending: false });
  if (input.component !== "all") query = query.eq("component", input.component);
  if (input.status !== "all") query = query.eq("status", input.status);
  if (input.severity !== "all") query = query.eq("severity", input.severity);
  if (input.from) query = query.gte("opened_at", input.from);
  if (input.to) query = query.lte("opened_at", input.to);
  if (input.release_id) query = query.eq("release_id", input.release_id);
  if (input.build_id) query = query.eq("build_id", input.build_id);
  if (cursor) {
    const openedAt = new Date(cursor.primary).toISOString();
    query = query.or(`opened_at.lt.${openedAt},and(opened_at.eq.${openedAt},incident_id.lt.${cursor.id})`);
  }
  const result = await dbQuery<Row[]>(query.limit(input.limit + 1));
  if (result.error) apiFailure("DB_ERROR", "Không thể tải lịch sử sự cố", 500);
  const rows = result.data ?? [];
  const hasMore = rows.length > input.limit;
  const selected = rows.slice(0, input.limit);
  const records = selected.map((row) => toIncidentPacket(row));
  if (records.some((packet) => packet === null)) apiFailure("DB_ERROR", "Bằng chứng sự cố không đạt contract an toàn", 500);
  const safeRecords = records as SystemIncidentPacket[];
  const last = selected.at(-1);
  return {
    generated_at: new Date().toISOString(),
    data_quality: "available",
    records: safeRecords,
    has_more: hasMore,
    next_cursor: hasMore && last
      ? encodeAdminSystemCursor({ primary: stringField(last, "opened_at"), id: stringField(last, "incident_id") })
      : null,
  };
}

export async function getSystemIncident(
  ctx: MobileApiContext,
  incidentId: string,
): Promise<AdminSystemContracts["incidentDetailResponse"]> {
  const result = await getIncidentRow(ctx, incidentId);
  const timeline = await getIncidentTimeline(ctx, incidentId);
  const record = toIncidentPacket(result, timeline);
  if (!record) apiFailure("DB_ERROR", "Bằng chứng sự cố không đạt contract an toàn", 500);
  const history = record.timeline;
  return { generated_at: new Date().toISOString(), record, history };
}

export async function exportSystemIncident(ctx: MobileApiContext, incidentId: string): Promise<SystemIncidentPacket> {
  const row = await getIncidentRow(ctx, incidentId);
  const packet = toIncidentPacket(row, await getIncidentTimeline(ctx, incidentId));
  if (!packet) apiFailure("DB_ERROR", "Bằng chứng sự cố không đạt contract an toàn", 500);
  return packet;
}

export async function refreshSystemHealth(ctx: MobileApiContext): Promise<AdminSystemContracts["refreshResponse"]> {
  const configuredUrl = Deno.env.get("SYSTEM_HEALTH_MONITOR_URL")?.trim();
  const baseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const secret = Deno.env.get("SYSTEM_HEALTH_MONITOR_SECRET") ?? "";
  const url = configuredUrl || (baseUrl ? `${baseUrl.replace(/\/+$/u, "")}/functions/v1/system-monitor` : "");
  if (!baseUrl || !isMonitorEndpoint(url, baseUrl) || secret.length < 32) {
    apiFailure("DEPENDENCY_UNAVAILABLE", "Refresh tình trạng hệ thống chưa được cấu hình", 503);
  }
  const scheduledAt = new Date().toISOString();
  const environment = ctx.environment;
  if (environment !== "production" && environment !== "staging" && environment !== "local") {
    apiFailure("DEPENDENCY_UNAVAILABLE", "Môi trường hệ thống chưa được định danh", 503);
  }
  const refreshClaim = await dbQuery<boolean>(db(ctx).rpc("claim_system_health_manual_refresh", {
    p_environment: environment,
    p_requested_at: scheduledAt,
  }), 5_000);
  if (refreshClaim.error || typeof refreshClaim.data !== "boolean") {
    apiFailure("DEPENDENCY_UNAVAILABLE", "Không thể kiểm tra giới hạn làm mới tình trạng hệ thống", 503);
  }
  if (!refreshClaim.data) {
    apiFailure("RATE_LIMITED", "Chỉ có thể làm mới tình trạng hệ thống một lần mỗi phút", 429);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-system-monitor-secret": secret },
      body: JSON.stringify({ scheduled_at: scheduledAt, trigger: "manual" }),
      redirect: "error",
      signal: AbortSignal.timeout(27_000),
    });
    await response.body?.cancel();
  } catch {
    apiFailure("DEPENDENCY_UNAVAILABLE", "Không thể yêu cầu làm mới tình trạng hệ thống", 503);
  }
  if (!response.ok) apiFailure("DEPENDENCY_UNAVAILABLE", "Bộ giám sát chưa chấp nhận yêu cầu làm mới", 503);
  return { accepted: true, scheduled_at: new Date(Math.floor(Date.parse(scheduledAt) / 60_000) * 60_000).toISOString() };
}

async function getIncidentRow(ctx: MobileApiContext, incidentId: string): Promise<Row> {
  const result = await dbQuery<Row>(db(ctx).from("system_health_incidents").select(INCIDENT_COLUMNS)
    .eq("environment", healthEnvironment(ctx)).eq("incident_id", incidentId).maybeSingle());
  if (result.error) apiFailure("DB_ERROR", "Không thể tải chi tiết sự cố", 500);
  if (!result.data) apiFailure("NOT_FOUND", "Không tìm thấy sự cố", 404);
  return result.data;
}

async function getIncidentTimeline(ctx: MobileApiContext, incidentId: string): Promise<Row[]> {
  const result = await dbQuery<Row[]>(db(ctx).from("system_health_incident_events")
    .select("event_kind,recorded_at,status,severity,reason_code,metrics")
    .eq("incident_id", incidentId)
    .order("recorded_at", { ascending: true })
    .order("event_id", { ascending: true })
    .limit(40));
  if (result.error) apiFailure("DB_ERROR", "Không thể tải diễn tiến sự cố", 500);
  return result.data ?? [];
}

function toIncidentPacket(row: Row, timeline: readonly Row[] = []): SystemIncidentPacket | null {
  const evidence = asRecord(row.evidence);
  return sanitizeSystemIncidentPacket({
    incident_id: row.incident_id,
    external_incident_id: row.external_incident_id,
    fingerprint: row.fingerprint,
    component: row.component,
    detector: row.detector,
    severity: row.severity,
    status: row.status,
    opened_at: row.opened_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    release_id: row.release_id,
    build_id: row.build_id,
    platform: row.platform,
    route_kind: row.route_kind,
    stage: row.stage,
    trace_id: row.trace_id,
    run_id: row.run_id,
    request_id: row.request_id,
    support_code: row.support_code,
    reason_code: evidence?.reason_code,
    observed_at: evidence?.observed_at,
    metrics: evidence?.metrics,
    timeline: timeline.map((event) => ({
      event: event.event_kind,
      at: event.recorded_at,
      status: event.status,
      severity: event.severity,
      reason_code: event.reason_code,
      metrics: event.metrics,
    })),
    observations: [{ observed_at: evidence?.observed_at, reason_code: evidence?.reason_code, metrics: evidence?.metrics }],
  });
}

function serializeObserver(row: Row): AdminSystemContracts["healthResponse"]["observer"] {
  return {
    observer_heartbeat_at: nullableIso(row.observer_heartbeat_at),
    dispatcher_status: healthStatus(row.dispatcher_status),
    d1_status: healthStatus(row.d1_status),
    last_snapshot_at: nullableIso(row.last_snapshot_at),
    last_error_code: safeReason(row.last_error_code),
  };
}

function healthEnvironment(ctx: MobileApiContext): "production" | "staging" | "local" {
  const value = ctx.environment;
  if (value === "production" || value === "staging" || value === "local") return value;
  apiFailure("DEPENDENCY_UNAVAILABLE", "Môi trường hệ thống chưa được định danh", 503);
}

export function isMonitorEndpoint(value: string, supabaseBaseUrl: string): boolean {
  try {
    const url = new URL(value);
    const base = new URL(supabaseBaseUrl);
    return (url.protocol === "https:" || (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")))
      && url.origin === base.origin
      && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === "/functions/v1/system-monitor";
  } catch {
    return false;
  }
}

function healthStatus(value: unknown): "green" | "yellow" | "red" | "gray" {
  return value === "green" || value === "yellow" || value === "red" || value === "gray" ? value : "gray";
}

function safeReason(value: unknown): string | null {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value) ? value : null;
}

function nullableIso(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function stringField(row: Row, key: string): string {
  return typeof row[key] === "string" ? row[key] as string : "";
}

function asRecord(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}
