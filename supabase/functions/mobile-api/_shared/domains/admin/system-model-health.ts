import { KAEL_ROUTING_CONFIG } from "../../kael/kael-providers/routing.config.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { nullableNumber, nullableString } from "../../platform/coercions.ts";
import { db, dbQuery } from "../../platform/db.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import type { AdminSystemContracts } from "../contracts/admin-system.ts";
import { decodeAdminSystemCursor, encodeAdminSystemCursor } from "./system-pagination.ts";
import { aggregateDataQuality, requiredInteger, requiredNumber, requiredString, type SystemRow } from "./system-shared.ts";

type AdminSystemModelHealthInput = AdminSystemContracts["modelHealthInput"];
type AdminSystemModelHealthDetailResponse = AdminSystemContracts["modelHealthDetailResponse"];
type AdminSystemModelHealthResponse = AdminSystemContracts["modelHealthResponse"];
type AdminSystemModelHealthRecord = AdminSystemModelHealthResponse["records"][number];
type AdminSystemModelInventoryRecord = AdminSystemModelHealthResponse["inventory"][number];
type AdminSystemDataQuality = AdminSystemModelHealthResponse["data_quality"];

type InventorySeed = Omit<AdminSystemModelInventoryRecord, "detail_key">;

export async function listSystemModelHealth(ctx: MobileApiContext, input: AdminSystemModelHealthInput): Promise<AdminSystemModelHealthResponse> {
  const inventory = await buildInventory();
  let healthQuery = db(ctx).from("admin_model_health_daily")
    .select("day,purpose,provider,model,call_count,success_count,failure_count,fallback_count,total_cost_usd,avg_latency_ms,p95_latency_ms,failure_kind,updated_at")
    .order("day", { ascending: false })
    .order("provider", { ascending: true })
    .order("purpose", { ascending: true });
  if (input.provider !== "all") healthQuery = healthQuery.eq("provider", input.provider);
  if (input.model !== "all") healthQuery = healthQuery.eq("model", input.model);
  if (input.purpose !== "all") healthQuery = healthQuery.eq("purpose", input.purpose);
  if (input.failure_kind !== "all") healthQuery = healthQuery.eq("failure_kind", input.failure_kind);
  if (input.from) healthQuery = healthQuery.gte("day", input.from.slice(0, 10));
  if (input.to) healthQuery = healthQuery.lte("day", input.to.slice(0, 10));
  const [healthResult, circuitResult] = await Promise.all([
    dbQuery<SystemRow[]>(healthQuery.limit(5000)),
    dbQuery<SystemRow[]>(db(ctx).from("kael_provider_circuit").select("scope,key,kind,window_started_at,failure_count,open_until,updated_at")),
  ]);
  if (healthResult.error || circuitResult.error) apiFailure("DB_ERROR", "Không thể tải tình trạng mô hình", 500);
  const circuits = circuitResult.data ?? [];
  let records = await Promise.all((healthResult.data ?? []).map((row) => serializeHealthRecord(row, circuits)));
  if (input.query) {
    const term = input.query.toLocaleLowerCase();
    records = records.filter((record) => `${record.provider} ${record.model ?? ""} ${record.purpose} ${record.failure_kind ?? ""}`.toLocaleLowerCase().includes(term));
  }
  if (input.circuit !== "all") records = records.filter((record) => record.circuit_state === input.circuit);
  if (input.view === "incidents") records = records.filter((record) => (record.failure_count ?? 0) > 0 || (record.fallback_count ?? 0) > 0 || record.circuit_state === "open");
  records.sort((left, right) => right.bucket.localeCompare(left.bucket) || left.provider.localeCompare(right.provider) || left.purpose.localeCompare(right.purpose) || left.detail_key.localeCompare(right.detail_key));
  const cursor = decodeAdminSystemCursor(input.cursor);
  if (cursor) records = records.filter((record) => record.bucket < cursor.primary || (record.bucket === cursor.primary && record.detail_key > cursor.id));
  const page = records.slice(0, input.limit + 1);
  const hasMore = page.length > input.limit;
  const visible = page.slice(0, input.limit);
  const last = visible[visible.length - 1];
  const rows = healthResult.data ?? [];
  const callsQuality: AdminSystemDataQuality = rows.length > 0 ? "available" : "unavailable";
  const costsQuality: AdminSystemDataQuality = rows.some((row) => nullableNumber(row.total_cost_usd) !== null) ? "available" : "unavailable";
  const latencyQuality: AdminSystemDataQuality = rows.length === 0 ? "unavailable" : rows.every((row) => nullableNumber(row.avg_latency_ms) !== null && nullableNumber(row.p95_latency_ms) !== null) ? "available" : "partial";
  const circuitQuality: AdminSystemDataQuality = "available";
  const totalCalls = callsQuality === "available" ? rows.reduce((total, row) => total + requiredInteger(row, "call_count"), 0) : null;
  const totalFailures = callsQuality === "available" ? rows.reduce((total, row) => total + requiredInteger(row, "failure_count"), 0) : null;
  const totalFallbacks = callsQuality === "available" ? rows.reduce((total, row) => total + requiredInteger(row, "fallback_count"), 0) : null;
  const totalCost = costsQuality === "available" ? rows.reduce((total, row) => total + requiredNumber(row, "total_cost_usd"), 0).toFixed(6) : null;
  const openCircuits = circuits.filter((row) => isCircuitOpen(row)).length;
  const qualities = { inventory: "available" as AdminSystemDataQuality, calls: callsQuality, latency: latencyQuality, costs: costsQuality, circuits: circuitQuality };
  return {
    generated_at: new Date().toISOString(), data_quality: aggregateDataQuality(Object.values(qualities)), data_quality_sources: qualities,
    summary: { configured_count: inventory.length, call_count: totalCalls, failure_count: totalFailures, fallback_count: totalFallbacks, open_circuit_count: openCircuits, total_cost_usd: totalCost },
    inventory, records: visible, has_more: hasMore,
    next_cursor: hasMore && last ? encodeAdminSystemCursor({ primary: last.bucket, id: last.detail_key }) : null,
    next_offset: null,
  };
}

export async function getSystemModelHealthDetail(ctx: MobileApiContext, detailKey: string): Promise<AdminSystemModelHealthDetailResponse> {
  const list = await listSystemModelHealth(ctx, { query: "", limit: 50, view: "overview", provider: "all", model: "all", purpose: "all", failure_kind: "all", circuit: "all" });
  let record = list.records.find((item) => item.detail_key === detailKey);
  let cursor = list.next_cursor;
  while (!record && cursor) {
    const next = await listSystemModelHealth(ctx, { query: "", limit: 50, cursor, view: "overview", provider: "all", model: "all", purpose: "all", failure_kind: "all", circuit: "all" });
    record = next.records.find((item) => item.detail_key === detailKey);
    cursor = next.next_cursor;
  }
  if (!record) apiFailure("NOT_FOUND", "Không tìm thấy chi tiết tình trạng mô hình", 404);
  const start = `${record.bucket}T00:00:00.000Z`;
  const end = `${record.bucket}T23:59:59.999Z`;
  const [logsResult, circuitsResult] = await Promise.all([
    dbQuery<SystemRow[]>(db(ctx).from("api_logs").select("id,error_code,success,fallback_used,latency_ms,created_at").eq("provider", record.provider).eq("purpose", record.purpose).gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }).limit(100)),
    dbQuery<SystemRow[]>(db(ctx).from("kael_provider_circuit").select("scope,key,kind,window_started_at,failure_count,open_until,updated_at").order("updated_at", { ascending: false })),
  ]);
  if (logsResult.error || circuitsResult.error) apiFailure("DB_ERROR", "Không thể tải chi tiết tình trạng mô hình", 500);
  const safeErrors = (logsResult.data ?? []).filter((row) => row.success === false).map((row) => ({
    code: sanitizeErrorCode(nullableString(row.error_code)), recorded_at: requiredString(row, "created_at"),
  }));
  const circuitHistory = (circuitsResult.data ?? []).filter((row) => circuitMatches(row, record.provider, record.purpose)).map((row) => ({
    kind: requiredString(row, "kind"), failure_count: requiredInteger(row, "failure_count"), window_started_at: requiredString(row, "window_started_at"),
    open_until: nullableString(row.open_until), updated_at: requiredString(row, "updated_at"),
  }));
  return {
    generated_at: new Date().toISOString(), data_quality: list.data_quality, record, version: 1,
    history: [...safeErrors, ...circuitHistory], available_actions: [], permission: "read",
  };
}

async function buildInventory(): Promise<AdminSystemModelInventoryRecord[]> {
  const seeds: InventorySeed[] = [];
  for (const config of Object.values(KAEL_ROUTING_CONFIG)) {
    const routes = [config.primary, config.simpleNormalChatPrimary, config.modelFallback, config.fallback, config.escalation].filter((route): route is NonNullable<typeof route> => Boolean(route));
    for (const route of routes) seeds.push({ provider: route.provider, model: route.model, purpose: config.purpose, configured: true });
  }
  const unique = [...new Map(seeds.map((seed) => [`${seed.purpose}|${seed.provider}|${seed.model}`, seed])).values()];
  return Promise.all(unique.map(async (seed) => ({ ...seed, detail_key: await opaqueDetailKey("inventory", seed.provider, seed.model, seed.purpose) })));
}

async function serializeHealthRecord(row: SystemRow, circuits: SystemRow[]): Promise<AdminSystemModelHealthRecord> {
  const bucket = requiredString(row, "day");
  const provider = requiredString(row, "provider");
  const purpose = requiredString(row, "purpose");
  const model = nullableString(row.model);
  return {
    detail_key: await opaqueDetailKey(bucket, provider, model ?? "unrecorded", purpose), bucket, provider, model, purpose,
    call_count: nullableInteger(row.call_count), success_count: nullableInteger(row.success_count), failure_count: nullableInteger(row.failure_count), fallback_count: nullableInteger(row.fallback_count),
    avg_latency_ms: nullableNumber(row.avg_latency_ms), p95_latency_ms: nullableNumber(row.p95_latency_ms), total_cost_usd: nullableNumber(row.total_cost_usd),
    failure_kind: nullableString(row.failure_kind), circuit_state: circuits.some((circuit) => circuitMatches(circuit, provider, purpose) && isCircuitOpen(circuit)) ? "open" : "closed",
    updated_at: nullableString(row.updated_at) ?? `${bucket}T23:59:59.999Z`,
  };
}

function circuitMatches(row: SystemRow, provider: string, purpose: string) {
  const key = nullableString(row.key) ?? "";
  return key === provider || key.includes(provider) && (row.scope === "provider" || key.includes(purpose));
}

function isCircuitOpen(row: SystemRow) {
  const openUntil = Date.parse(nullableString(row.open_until) ?? "");
  return Number.isFinite(openUntil) && openUntil > Date.now();
}

function nullableInteger(value: unknown) {
  const number = nullableNumber(value);
  return number !== null && Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function sanitizeErrorCode(value: string | null) {
  if (!value) return "PROVIDER_FAILURE";
  return /^[A-Z0-9_:-]{1,100}$/.test(value) ? value : "PROVIDER_FAILURE";
}

async function opaqueDetailKey(...parts: string[]) {
  const bytes = new TextEncoder().encode(parts.join("\u001f"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
