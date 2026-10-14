import {
  buildSystemHealthSnapshot,
  isSystemMonitorEvidenceUrlAllowed,
  type SystemMonitorEvidence,
} from "./collector.ts";
import type { EdgeSystemHealthSnapshot as SystemHealthSnapshot } from "../_shared/contracts/system-health.ts";

export type MonitorStore = {
  claimRun(environment: string, scheduledAt: string, ownerId: string): Promise<boolean>;
  databaseProbe(): Promise<boolean>;
  readPreviousSnapshot(environment: string, before: string): Promise<SystemHealthSnapshot | null>;
  readWorkerEvidence(): Promise<readonly Record<string, unknown>[]>;
  readKaelEvidence(environment: string, since: string): Promise<Record<string, unknown>>;
  readMobileEvidence(environment: string): Promise<Record<string, unknown>>;
  readObserverState(environment: string): Promise<Record<string, unknown> | null>;
  readLatestSnapshot(environment: string): Promise<SystemHealthSnapshot | null>;
  recordSnapshot(snapshot: SystemHealthSnapshot): Promise<boolean>;
  writeWorkerHeartbeat(input: {
    readonly jobName: "system-health-monitor";
    readonly executionId: string;
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly completionStatus: "succeeded" | "failed";
    readonly reasonCode: string | null;
    readonly releaseId: string | null;
  }): Promise<void>;
  recordObserverHeartbeat(environment: string, input: {
    dispatcherStatus: string;
    d1Status: string;
    errorCode: string | null;
    observedAt: string;
  }): Promise<{
    transition: "none" | "opened" | "resolved";
    incidentId: string | null;
    openedAt: string | null;
    reasonCode: string | null;
  }>;
  writeExternalObserverIncident(environment: string, input: {
    externalIncidentId: string;
    status: "open" | "resolved";
    openedAt: string;
    reasonCode: string;
  }): Promise<void>;
};

export type MonitorHandlerDependencies = {
  readonly env: (name: string) => string | undefined;
  readonly createStore: (supabaseUrl: string, serviceKey: string, fetcher?: typeof fetch) => MonitorStore;
  readonly fetcher: typeof fetch;
  readonly now?: () => Date;
};

const MAX_REQUEST_BYTES = 4 * 1024;
const COLLECTOR_BUDGET_MS = 25_000;

export function createSystemMonitorHandler(dependencies: MonitorHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const route = normalizeSystemMonitorRoute(url.pathname);
    if (route === null) return json({ error: "NOT_FOUND" }, 404);
    if (route.startsWith("/observer/")) {
      return handleObserverRequest(request, route, dependencies);
    }
    if (request.method !== "POST" || route !== "/") return json({ error: "NOT_FOUND" }, 404);

    const monitorSecret = dependencies.env("SYSTEM_HEALTH_MONITOR_SECRET") ?? "";
    if (!constantTimeEqual(monitorSecret, request.headers.get("x-system-monitor-secret") ?? "")) {
      return json({ error: "UNAUTHORIZED" }, 401);
    }

    const configuredEnvironment = dependencies.env("SYSTEM_HEALTH_ENVIRONMENT");
    if (configuredEnvironment !== "production" && configuredEnvironment !== "staging" && configuredEnvironment !== "local") {
      return json({ error: "MONITOR_ENVIRONMENT_NOT_CONFIGURED" }, 503);
    }
    const supabaseUrl = dependencies.env("SUPABASE_URL") ?? "";
    const serviceKey = readServiceKey(dependencies.env);
    if (!isSupabaseUrl(supabaseUrl) || !serviceKey) return json({ error: "MONITOR_NOT_CONFIGURED" }, 503);

    const body = await readBoundedJson(request, MAX_REQUEST_BYTES);
    if (!body.valid || !isMonitorRequestBody(body.value)) return json({ error: "INVALID_REQUEST" }, 400);
    const now = dependencies.now?.() ?? new Date();
    const submittedAt = body.value.scheduled_at ? Date.parse(body.value.scheduled_at) : now.getTime();
    if (!Number.isFinite(submittedAt) || submittedAt > now.getTime() + 30_000 || submittedAt < now.getTime() - 120_000) {
      return json({ error: "INVALID_SCHEDULED_AT" }, 400);
    }
    const scheduledAt = new Date(Math.floor(submittedAt / 60_000) * 60_000).toISOString();
    const deadline = Date.now() + COLLECTOR_BUDGET_MS;
    const supabaseBudgetFetch = createSystemMonitorBudgetedFetch(dependencies.fetcher, deadline, 5_000);
    const store = dependencies.createStore(supabaseUrl, serviceKey, supabaseBudgetFetch);
    const ownerId = crypto.randomUUID();
    let claimed: boolean;
    try {
      claimed = await store.claimRun(configuredEnvironment, scheduledAt, ownerId);
    } catch {
      return json({ error: "MONITOR_CLAIM_FAILED" }, 503);
    }
    if (!claimed) return json({ ok: true, skipped: "RUN_ALREADY_CLAIMED" }, 202);

    const workerStartedAt = new Date().toISOString();
    let completionStatus: "succeeded" | "failed" = "failed";
    let completionReasonCode: string | null = "MONITOR_RUN_FAILED";
    try {
    const budgetFetch = (input: RequestInfo | URL, init?: RequestInit) => fetchWithBudget(
      input,
      init,
      dependencies.fetcher,
      deadline,
    );
    const [edge, auth, storage, realtime, database, workers, kael, mobile, observer, previous] = await Promise.all([
      readEdgeEvidence(supabaseUrl, dependencies.env, budgetFetch),
      readAuthEvidence(supabaseUrl, dependencies.env, budgetFetch),
      readStorageEvidence(supabaseUrl, dependencies.env, budgetFetch),
      readRealtimeEvidence(supabaseUrl, dependencies.env, budgetFetch),
      safeRead(() => store.databaseProbe(), null),
      safeRead(() => store.readWorkerEvidence(), null),
      safeRead(() => store.readKaelEvidence(configuredEnvironment, new Date(now.getTime() - 5 * 60_000).toISOString()), null),
      safeRead(() => store.readMobileEvidence(configuredEnvironment), null),
      safeRead(() => store.readObserverState(configuredEnvironment), null),
      safeRead(() => store.readPreviousSnapshot(configuredEnvironment, scheduledAt), null),
    ]);
    if (Date.now() >= deadline) return json({ error: "COLLECTOR_BUDGET_EXCEEDED" }, 503);

    const expectedProjectRef = dependencies.env("SYSTEM_HEALTH_EXPECTED_PROJECT_REF") ?? inferProjectRef(supabaseUrl);
    const evidence: SystemMonitorEvidence = {
      edge,
      auth,
      storage,
      realtime,
      database,
      workers,
      kael,
      mobile,
      observer,
    };
    let snapshot: SystemHealthSnapshot;
    try {
      snapshot = buildSystemHealthSnapshot({
        environment: configuredEnvironment,
        expectedProjectRef,
        scheduledAt,
        now: dependencies.now?.() ?? new Date(),
        evidence,
        previous,
      });
    } catch (error) {
      const detail = error instanceof Error && /^SNAPSHOT_(?:SCHEMA_INVALID:[A-Za-z0-9_.]+|SIZE_LIMIT:\d+)$/u.test(error.message)
        ? error.message
        : "SNAPSHOT_VALIDATION_FAILED";
      return json({ error: "SNAPSHOT_CONTRACT_INVALID", detail }, 503);
    }
    try {
      const saved = await store.recordSnapshot(snapshot);
      if (!saved) return json({ error: "SNAPSHOT_WRITE_REJECTED" }, 503);
    } catch {
      return json({ error: "SNAPSHOT_WRITE_FAILED" }, 503);
    }
    completionStatus = "succeeded";
    completionReasonCode = null;
    return json({ ok: true, snapshot: { environment: snapshot.environment, scheduled_at: snapshot.scheduled_at, overall_status: snapshot.overall_status } });
    } catch {
      return json({ error: "MONITOR_RUN_FAILED" }, 503);
    } finally {
      await store.writeWorkerHeartbeat({
        jobName: "system-health-monitor",
        executionId: ownerId,
        startedAt: workerStartedAt,
        finishedAt: new Date().toISOString(),
        completionStatus,
        reasonCode: completionReasonCode,
        releaseId: dependencies.env("HARNESS_RELEASE_ID") ?? dependencies.env("NESTSCOUT_RELEASE_ID") ?? null,
      }).catch(() => undefined);
    }
  };
}

function normalizeSystemMonitorRoute(pathname: string): string | null {
  const normalizedPath = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
  for (const prefix of ["/functions/v1/system-monitor", "/system-monitor"]) {
    if (normalizedPath === prefix) return "/";
    if (normalizedPath.startsWith(`${prefix}/`)) return normalizedPath.slice(prefix.length);
  }
  return normalizedPath === "/" ? "/" : null;
}

async function handleObserverRequest(
  request: Request,
  route: string,
  dependencies: MonitorHandlerDependencies,
) {
  const observerSecret = dependencies.env("SYSTEM_HEALTH_OBSERVER_SECRET") ?? "";
  if (!constantTimeEqual(observerSecret, request.headers.get("x-system-monitor-observer-secret") ?? "")) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }
  const environment = dependencies.env("SYSTEM_HEALTH_ENVIRONMENT");
  const supabaseUrl = dependencies.env("SUPABASE_URL") ?? "";
  const serviceKey = readServiceKey(dependencies.env);
  if ((environment !== "production" && environment !== "staging" && environment !== "local") || !isSupabaseUrl(supabaseUrl) || !serviceKey) {
    return json({ error: "OBSERVER_NOT_CONFIGURED" }, 503);
  }
  const store = dependencies.createStore(supabaseUrl, serviceKey);
  if (request.method === "GET" && route === "/observer/latest") {
    const version = new URL(request.url).searchParams.get("schema_version");
    if ([...new URL(request.url).searchParams.keys()].some((key) => key !== "schema_version") ||
        version !== null && version !== "1" && version !== "2") return json({ error: "UNSUPPORTED_SCHEMA_VERSION" }, 400);
    const requestedVersion = version === "2" ? 2 : 1;
    try {
      const [snapshot, state] = await Promise.all([
        store.readLatestSnapshot(environment),
        store.readObserverState(environment),
      ]);
      const responseSnapshot = requestedVersion === 1 && snapshot?.schema_version === 2 ? legacySnapshotProjection(snapshot) : snapshot;
      return json({ snapshot: responseSnapshot, observer: state ? {
        observer_heartbeat_at: state.observer_heartbeat_at ?? null,
        dispatcher_status: state.dispatcher_status ?? "gray",
        d1_status: state.d1_status ?? "gray",
      } : null });
    } catch {
      return json({ error: "OBSERVER_READ_FAILED" }, 503);
    }
  }
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const body = await readBoundedJson(request, MAX_REQUEST_BYTES);
  if (!body.valid) return json({ error: "INVALID_JSON" }, 400);
  if (route === "/observer/heartbeat") {
    const value = asRecord(body.value);
    const dispatcherStatus = safeHealthStatus(value?.dispatcher_status);
    const d1Status = safeHealthStatus(value?.d1_status);
    const errorCode = safeReasonCode(value?.error_code);
    if (!value || Object.keys(value).some((key) => !["dispatcher_status", "d1_status", "error_code"].includes(key)) ||
        !dispatcherStatus || !d1Status || (value.error_code !== null && value.error_code !== undefined && !errorCode)) {
      return json({ error: "INVALID_REQUEST" }, 400);
    }
    const observedAt = (dependencies.now?.() ?? new Date()).toISOString();
    try {
      await store.recordObserverHeartbeat(environment, { dispatcherStatus, d1Status, errorCode, observedAt });
    } catch {
      return json({ error: "OBSERVER_HEARTBEAT_WRITE_FAILED" }, 503);
    }
    return json({ ok: true, alert_delivery: "disabled_by_profile" });
  }
  if (route === "/observer/outage") {
    const value = asRecord(body.value);
    const externalIncidentId = typeof value?.external_incident_id === "string" && /^[0-9a-f-]{36}$/iu.test(value.external_incident_id)
      ? value.external_incident_id
      : null;
    const status = value?.status === "open" || value?.status === "resolved" ? value.status : null;
    const openedAt = typeof value?.opened_at === "string" && Number.isFinite(Date.parse(value.opened_at)) ? value.opened_at : null;
    const reasonCode = safeReasonCode(value?.reason_code);
    if (!value || Object.keys(value).some((key) => !["external_incident_id", "status", "opened_at", "reason_code"].includes(key)) ||
        !externalIncidentId || !status || !openedAt || !reasonCode || Date.parse(openedAt) > Date.now() + 30_000) {
      return json({ error: "INVALID_REQUEST" }, 400);
    }
    try {
      await store.writeExternalObserverIncident(environment, { externalIncidentId, status, openedAt, reasonCode });
      return json({ ok: true, external_incident_id: externalIncidentId });
    } catch {
      return json({ error: "OBSERVER_OUTAGE_WRITE_FAILED" }, 503);
    }
  }
  return json({ error: "NOT_FOUND" }, 404);
}

function legacySnapshotProjection(snapshot: Extract<SystemHealthSnapshot, { schema_version: 2 }>): SystemHealthSnapshot {
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
  return {
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

async function readEdgeEvidence(supabaseUrl: string, env: (name: string) => string | undefined, fetcher: typeof fetch) {
  const url = new URL("/functions/v1/mobile-api/harness/health", supabaseUrl).toString();
  const anonKey = env("SUPABASE_ANON_KEY") ?? env("SUPABASE_PUBLISHABLE_KEY") ?? "";
  if (!isSystemMonitorEvidenceUrlAllowed(url) || !anonKey) return { status: null, body: null };
  try {
    const response = await fetcher(url, { method: "GET", headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` }, redirect: "error" });
    const body = response.ok ? await readBoundedJson(response, 16 * 1024) : { valid: false, value: null };
    return { status: response.status, body: body.valid ? body.value : null };
  } catch {
    return { status: null, body: null };
  }
}

async function readAuthEvidence(supabaseUrl: string, env: (name: string) => string | undefined, fetcher: typeof fetch) {
  const url = new URL("/auth/v1/health", supabaseUrl).toString();
  const anonKey = env("SUPABASE_ANON_KEY") ?? env("SUPABASE_PUBLISHABLE_KEY") ?? "";
  if (!isSystemMonitorEvidenceUrlAllowed(url) || !anonKey) return { status: null };
  try {
    const response = await fetcher(url, { method: "GET", headers: { apikey: anonKey }, redirect: "error" });
    return { status: response.status };
  } catch {
    return { status: null };
  }
}

async function readStorageEvidence(supabaseUrl: string, env: (name: string) => string | undefined, fetcher: typeof fetch) {
  const url = new URL("/storage/v1/health", supabaseUrl).toString();
  const anonKey = env("SUPABASE_ANON_KEY") ?? env("SUPABASE_PUBLISHABLE_KEY") ?? "";
  if (!isSystemMonitorEvidenceUrlAllowed(url) || !anonKey) return { status: null, healthy: null };
  try {
    const response = await fetcher(url, { method: "GET", headers: { apikey: anonKey }, redirect: "error" });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { status: response.status, healthy: null };
    }
    const body = await readBoundedJson(response, 4 * 1024);
    const health = asRecord(body.value)?.healthy;
    return { status: response.status, healthy: body.valid && typeof health === "boolean" ? health : null };
  } catch {
    return { status: null, healthy: null };
  }
}

async function readRealtimeEvidence(supabaseUrl: string, env: (name: string) => string | undefined, fetcher: typeof fetch) {
  const url = new URL("/realtime/v1/healthcheck", supabaseUrl).toString();
  const anonKey = env("SUPABASE_ANON_KEY") ?? env("SUPABASE_PUBLISHABLE_KEY") ?? "";
  if (!isSystemMonitorEvidenceUrlAllowed(url) || !anonKey) return { status: null };
  try {
    const response = await fetcher(url, { method: "GET", headers: { apikey: anonKey }, redirect: "error" });
    await response.body?.cancel().catch(() => undefined);
    return { status: response.status };
  } catch {
    return { status: null };
  }
}

async function fetchWithBudget(input: RequestInfo | URL, init: RequestInit | undefined, fetcher: typeof fetch, deadline: number) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!isSystemMonitorEvidenceUrlAllowed(url)) throw new Error("SYSTEM_MONITOR_URL_NOT_ALLOWED");
  return await fetchWithinDeadline(input, init, fetcher, deadline, 10_000);
}

export function createSystemMonitorBudgetedFetch(fetcher: typeof fetch, deadline: number, maxRequestMs: number): typeof fetch {
  return (input, init) => fetchWithinDeadline(input, init, fetcher, deadline, maxRequestMs);
}

async function fetchWithinDeadline(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fetcher: typeof fetch,
  deadline: number,
  maxRequestMs: number,
) {
  const remaining = Math.min(maxRequestMs, deadline - Date.now());
  if (remaining <= 0) throw new Error("COLLECTOR_BUDGET_EXCEEDED");
  const timeoutSignal = AbortSignal.timeout(remaining);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return await fetcher(input, { ...init, signal });
}

function readServiceKey(env: (name: string) => string | undefined) {
  const encoded = env("SUPABASE_SECRET_KEYS");
  if (encoded) {
    try {
      const parsed = JSON.parse(encoded) as unknown;
      const record = asRecord(parsed);
      if (record) {
        const keys = Object.values(record).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
        return typeof record.default === "string" ? record.default : keys[0] ?? "";
      }
    } catch {
      return "";
    }
  }
  return env("SUPABASE_SERVICE_ROLE_KEY") ?? env("SUPABASE_SECRET_KEY") ?? "";
}

function isSupabaseUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" && url.hostname.endsWith(".supabase.co")) ||
      (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname));
  } catch {
    return false;
  }
}

function inferProjectRef(supabaseUrl: string): string | null {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const match = hostname.match(/^([a-z0-9]{8,40})\.supabase\.co$/u);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function isMonitorRequestBody(value: unknown): value is { scheduled_at?: string; trigger?: "scheduled" | "manual" } {
  const record = asRecord(value);
  if (!record || Object.keys(record).some((key) => !["scheduled_at", "trigger"].includes(key))) return false;
  if (record.scheduled_at !== undefined && (typeof record.scheduled_at !== "string" || !Number.isFinite(Date.parse(record.scheduled_at)))) return false;
  return record.trigger === undefined || record.trigger === "scheduled" || record.trigger === "manual";
}

async function readBoundedJson(request: Request, maxBytes: number): Promise<{ valid: boolean; value: unknown }>;
async function readBoundedJson(response: Response, maxBytes: number): Promise<{ valid: boolean; value: unknown }>;
async function readBoundedJson(source: Request | Response, maxBytes: number): Promise<{ valid: boolean; value: unknown }> {
  const contentLength = Number(source.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) return { valid: false, value: null };
  try {
    const text = await source.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) return { valid: false, value: null };
    return { valid: true, value: JSON.parse(text) as unknown };
  } catch {
    return { valid: false, value: null };
  }
}

async function safeRead<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function safeHealthStatus(value: unknown) {
  return value === "green" || value === "yellow" || value === "red" || value === "gray" ? value : null;
}

function safeReasonCode(value: unknown) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value) ? value : null;
}

function constantTimeEqual(expected: string, actual: string) {
  if (!expected || !actual) return false;
  const encoder = new TextEncoder();
  const left = encoder.encode(expected);
  const right = encoder.encode(actual);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return mismatch === 0;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
