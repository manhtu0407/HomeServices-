import {
  buildSystemHealthSnapshot,
  isSystemMonitorEvidenceUrlAllowed,
  type SystemMonitorEvidence,
} from "./collector.ts";
import type { SystemHealthSnapshot } from "../_shared/contracts/system-health.ts";

export type MonitorSourceState = {
  readonly backoff_until: string | null;
  readonly consecutive_failures: number;
};

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
  readSourceState(source: "sentry"): Promise<MonitorSourceState | null>;
  writeSourceState(source: "sentry", state: MonitorSourceState & { readonly last_status_code: number | null }): Promise<void>;
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
  claimFallbackDelivery(dedupeKey: string, deliveryKind: "dispatcher_down" | "recovery", now: string): Promise<boolean>;
  completeFallbackDelivery(input: {
    dedupeKey: string;
    delivered: boolean;
    retryAt: string | null;
    errorCode: string | null;
    now: string;
  }): Promise<boolean>;
  writeExternalObserverIncident(environment: string, input: {
    externalIncidentId: string;
    status: "open" | "resolved";
    openedAt: string;
    reasonCode: string;
  }): Promise<void>;
};

function formatVietnamTime(value: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(value);
}

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
    const route = (url.pathname.replace(/^\/functions\/v1\/system-monitor/u, "").replace(/\/$/u, "") || "/");
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
    const sentryPromise = readSentryEvidence(store, dependencies.env, budgetFetch);
    const [edge, auth, storage, realtime, database, workers, kael, mobile, observer, previous, sentry] = await Promise.all([
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
      sentryPromise,
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
      sentry,
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
        releaseId: dependencies.env("NESTSCOUT_RELEASE_ID") ?? dependencies.env("DENO_DEPLOYMENT_ID") ?? null,
      }).catch(() => undefined);
    }
  };
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
    try {
      const [snapshot, state] = await Promise.all([
        store.readLatestSnapshot(environment),
        store.readObserverState(environment),
      ]);
      return json({ snapshot, observer: state ? {
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
    let transition: DispatcherHeartbeatTransition;
    try {
      transition = await store.recordObserverHeartbeat(environment, { dispatcherStatus, d1Status, errorCode, observedAt });
    } catch {
      return json({ error: "OBSERVER_HEARTBEAT_WRITE_FAILED" }, 503);
    }
    try {
      const delivery = await deliverDispatcherFallback(
        dependencies.env,
        store,
        dependencies.fetcher,
        environment,
        transition,
        observedAt,
      );
      return json({ ok: true, alert_delivery: delivery });
    } catch {
      return json({ error: "OBSERVER_DELIVERY_STATE_FAILED" }, 503);
    }
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

type DispatcherHeartbeatTransition = {
  transition: "none" | "opened" | "resolved";
  incidentId: string | null;
  openedAt: string | null;
  reasonCode: string | null;
};

async function deliverDispatcherFallback(
  env: (name: string) => string | undefined,
  store: MonitorStore,
  fetcher: typeof fetch,
  environment: string,
  transition: DispatcherHeartbeatTransition,
  now: string,
): Promise<"not_due" | "sent" | "deferred" | "failed"> {
  const observedAt = Date.parse(now);
  const incidentId = transition.incidentId;
  let kind: "open" | "reminder" | "resolved" | null = null;
  if (transition.transition === "opened") kind = "open";
  else if (transition.transition === "resolved") kind = "resolved";
  else if (incidentId && transition.openedAt) {
    kind = observedAt - Date.parse(transition.openedAt) >= 30 * 60_000 ? "reminder" : "open";
  }
  if (!incidentId || !kind) return "not_due";

  const reminderBucket = kind === "reminder" ? Math.floor(observedAt / (30 * 60_000)) : null;
  const dedupeKey = `observer:${environment}:dispatcher:${incidentId}:${kind}${reminderBucket === null ? "" : `:${reminderBucket}`}`;
  const deliveryKind = kind === "resolved" ? "recovery" : "dispatcher_down";
  if (!await store.claimFallbackDelivery(dedupeKey, deliveryKind, now)) return "deferred";

  const token = env("SYSTEM_HEALTH_TELEGRAM_BOT_TOKEN") ?? "";
  const chatId = env("SYSTEM_HEALTH_TELEGRAM_CHAT_ID") ?? "";
  if (!/^[0-9]{5,15}:[A-Za-z0-9_-]{20,100}$/u.test(token) || !/^-?[0-9]{5,20}$/u.test(chatId)) {
    const completed = await store.completeFallbackDelivery({ dedupeKey, delivered: false, retryAt: new Date(observedAt + 15 * 60_000).toISOString(), errorCode: "TELEGRAM_NOT_CONFIGURED", now });
    if (!completed) throw new Error("OBSERVER_DELIVERY_COMPLETE_REJECTED");
    return "failed";
  }

  const title = kind === "resolved" ? "Bộ giám sát đã phục hồi" : kind === "reminder" ? "Bộ giám sát vẫn suy giảm" : "Bộ giám sát đang suy giảm";
  const reasonCode = transition.reasonCode && /^[A-Z][A-Z0-9_]{0,63}$/u.test(transition.reasonCode) ? transition.reasonCode : "DISPATCHER_UNAVAILABLE";
  const message = [
    `[NestScout] ${title}`,
    `Môi trường: ${environment}`,
    `Mức độ: ${kind === "resolved" ? "đã phục hồi" : "cần kiểm tra"}`,
    `Mã sự cố: ${incidentId}`,
    `Mã kiểm tra: ${reasonCode}`,
    `Thời điểm: ${formatVietnamTime(new Date(observedAt))}`,
  ].join("\n");
  const sent = await sendFallbackTelegram(fetcher, token, chatId, message, observedAt);
  const completed = await store.completeFallbackDelivery({
    dedupeKey,
    delivered: sent.kind === "sent",
    retryAt: sent.retryAt,
    errorCode: sent.errorCode,
    now,
  });
  if (!completed) throw new Error("OBSERVER_DELIVERY_COMPLETE_REJECTED");
  return sent.kind;
}

async function sendFallbackTelegram(
  fetcher: typeof fetch,
  token: string,
  chatId: string,
  message: string,
  now: number,
): Promise<{ kind: "sent" | "deferred" | "failed"; retryAt: string | null; errorCode: string | null }> {
  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      });
      const payload = await readBoundedJson(response, 4 * 1024);
      if (response.ok && asRecord(payload.value)?.ok === true) return { kind: "sent", retryAt: null, errorCode: null };
      if (response.status === 429) {
        const body = asRecord(payload.value);
        const parameters = asRecord(body?.parameters);
        const header = response.headers.get("retry-after");
        const retrySeconds = typeof parameters?.retry_after === "number" && Number.isInteger(parameters.retry_after)
          ? Math.max(1, Math.min(3600, parameters.retry_after))
          : header && /^\d{1,5}$/u.test(header) ? Math.max(1, Math.min(3600, Number(header))) : 60;
        return { kind: "deferred", retryAt: new Date(now + retrySeconds * 1000).toISOString(), errorCode: "TELEGRAM_RATE_LIMITED" };
      }
      if (response.status < 500 || attempt === 2) {
        return { kind: "failed", retryAt: new Date(now + 60_000).toISOString(), errorCode: "TELEGRAM_DELIVERY_FAILED" };
      }
    } catch {
      if (attempt === 2) return { kind: "failed", retryAt: new Date(now + 60_000).toISOString(), errorCode: "TELEGRAM_TIMEOUT_OR_NETWORK" };
    }
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
  return { kind: "failed", retryAt: new Date(now + 60_000).toISOString(), errorCode: "TELEGRAM_DELIVERY_FAILED" };
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

async function readSentryEvidence(store: MonitorStore, env: (name: string) => string | undefined, fetcher: typeof fetch): Promise<SystemMonitorEvidence["sentry"]> {
  const organization = env("SENTRY_HEALTH_ORG") ?? "";
  const projectId = env("SENTRY_HEALTH_PROJECT_ID") ?? "";
  const token = env("SENTRY_HEALTH_READ_TOKEN") ?? "";
  if (!/^[a-z0-9-]{2,80}$/iu.test(organization) || !/^\d{1,24}$/u.test(projectId) || !token) {
    return { configured: false, status: null, fatal: 0, errors: 0 };
  }
  const now = Date.now();
  const sourceState = await safeRead(() => store.readSourceState("sentry"), null);
  if (sourceState?.backoff_until && Date.parse(sourceState.backoff_until) > now) {
    return { configured: true, status: null, fatal: 0, errors: 0 };
  }
  const url = new URL(`/api/0/projects/${encodeURIComponent(organization)}/${encodeURIComponent(projectId)}/events/`, "https://sentry.io");
  url.searchParams.set("statsPeriod", "15m");
  url.searchParams.set("per_page", "50");
  if (!isSystemMonitorEvidenceUrlAllowed(url.toString())) return { configured: true, status: null, fatal: 0, errors: 0 };
  let status: number | null = null;
  try {
    const response = await fetcher(url.toString(), { method: "GET", headers: { authorization: `Bearer ${token}`, accept: "application/json" }, redirect: "error" });
    status = response.status;
    if (!response.ok) {
      const attempt = Math.min(5, (sourceState?.consecutive_failures ?? 0) + 1);
      const backoffSeconds = response.status === 429 ? readRetryAfter(response.headers.get("retry-after")) ?? sentryBackoffSeconds(attempt) : sentryBackoffSeconds(attempt);
      await store.writeSourceState("sentry", { backoff_until: new Date(now + backoffSeconds * 1000).toISOString(), consecutive_failures: attempt, last_status_code: response.status }).catch(() => undefined);
      return { configured: true, status: null, fatal: 0, errors: 0 };
    }
    const payload = await readBoundedJson(response, 256 * 1024);
    if (!payload.valid || !Array.isArray(payload.value)) {
      await store.writeSourceState("sentry", { backoff_until: new Date(now + 60_000).toISOString(), consecutive_failures: 1, last_status_code: status }).catch(() => undefined);
      return { configured: true, status: null, fatal: 0, errors: 0 };
    }
    let fatal = 0;
    let errors = 0;
    for (const event of payload.value) {
      const value = asRecord(event);
      if (!value) continue;
      const level = typeof value.level === "string" ? value.level : sentryTagLevel(value.tags);
      if (level === "fatal") fatal += 1;
      if (level === "error" || level === "fatal") errors += 1;
    }
    await store.writeSourceState("sentry", { backoff_until: null, consecutive_failures: 0, last_status_code: status }).catch(() => undefined);
    return { configured: true, status, fatal, errors };
  } catch {
    const attempt = Math.min(5, (sourceState?.consecutive_failures ?? 0) + 1);
    await store.writeSourceState("sentry", { backoff_until: new Date(now + sentryBackoffSeconds(attempt) * 1000).toISOString(), consecutive_failures: attempt, last_status_code: status }).catch(() => undefined);
    return { configured: true, status: null, fatal: 0, errors: 0 };
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

function sentryTagLevel(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const tag = value.find((item) => asRecord(item)?.key === "level");
  const level = asRecord(tag)?.value;
  return typeof level === "string" ? level : null;
}

function sentryBackoffSeconds(attempt: number) {
  return [60, 120, 240, 480, 900][Math.max(0, Math.min(4, attempt - 1))];
}

function readRetryAfter(value: string | null) {
  if (!value || !/^\d{1,5}$/u.test(value.trim())) return null;
  return Math.max(1, Math.min(900, Number(value.trim())));
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
