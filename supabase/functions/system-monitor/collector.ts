import {
  advanceAvailability,
  evaluateKaelErrorRate,
  evaluateSystemHealth,
  isSystemEvidenceFresh,
  systemHealthSnapshotSchema,
  type EdgeAvailabilityState as AvailabilityState,
  type EdgeSystemHealthCheck as SystemHealthCheck,
  type EdgeSystemHealthSnapshot as SystemHealthSnapshot,
  type EdgeSystemHealthStatus as SystemHealthStatus,
} from "../_shared/contracts/system-health.ts";

export type SystemMonitorEvidence = {
  readonly edge: { readonly status: number | null; readonly body: unknown | null };
  readonly auth: { readonly status: number | null };
  readonly storage: { readonly status: number | null; readonly healthy: boolean | null };
  readonly realtime: { readonly status: number | null };
  readonly database: boolean | null;
  readonly workers: readonly Record<string, unknown>[] | null;
  readonly kael: Record<string, unknown> | null;
  readonly mobile: Record<string, unknown> | null;
  readonly observer: Record<string, unknown> | null;
};

export type SnapshotInput = {
  readonly environment: "production" | "staging" | "local";
  readonly expectedProjectRef: string | null;
  readonly scheduledAt: string;
  readonly now: Date;
  readonly evidence: SystemMonitorEvidence;
  readonly previous: SystemHealthSnapshot | null;
};

export function buildSystemHealthSnapshot(input: SnapshotInput): SystemHealthSnapshot {
  const observedAt = input.now.toISOString();
  const from = new Date(input.now.getTime() - 5 * 60_000).toISOString();
  const window = { from, to: observedAt };
  const previous = new Map(input.previous?.checks.map((check) => [check.check_id, check]) ?? []);
  const previousBackend = previous.get("backend-core");
  const checks: SystemHealthCheck[] = [];

  const edgeStatus = input.evidence.edge.status;
  const edgeSucceeded = edgeStatus !== null && edgeStatus >= 200 && edgeStatus < 300;
  const edgeCheck = availabilityCheck({
    checkId: "backend-edge-availability",
    component: "backend",
    outcome: edgeStatus === null ? "unknown" : edgeSucceeded ? "success" : "failure",
    reasonCode: edgeStatus === null ? "EDGE_EVIDENCE_MISSING" : edgeSucceeded ? "EDGE_AVAILABLE" : "EDGE_UNAVAILABLE",
    previous: priorAvailability(previousBackend, "edge"),
    observedAt: edgeStatus === null ? null : observedAt,
    window,
  });

  const health = asRecord(input.evidence.edge.body);
  const environment = asRecord(health?.environment);
  const release = asRecord(health?.release);
  const projectRef = safeProjectRef(environment?.project_ref);
  const releaseId = safeReleaseId(release?.release_id);
  const identityConfigured = health !== null && release?.registered === true &&
    environment?.name !== undefined && projectRef !== null && input.expectedProjectRef !== null && releaseId !== null;
  const identityMatches = identityConfigured && environment?.name === input.environment &&
    projectRef === input.expectedProjectRef;
  const releaseCheck = check({
    check_id: "backend-release-identity",
    component: "backend",
    status: identityMatches ? "green" : identityConfigured ? "red" : "gray",
    reason_code: identityMatches ? "RELEASE_IDENTITY_MATCHED" : identityConfigured ? "RELEASE_IDENTITY_MISMATCH" : "RELEASE_IDENTITY_MISSING",
    observed_at: health === null ? null : observedAt,
    evidence_window: null,
    sample_count: health === null ? null : 1,
    metrics: { registered: release?.registered === true, project_match: projectRef !== null && projectRef === input.expectedProjectRef },
  });

  const authStatus = input.evidence.auth.status;
  const authSucceeded = authStatus !== null && authStatus >= 200 && authStatus < 300;
  const authCheck = availabilityCheck({
    checkId: "backend-auth-availability",
    component: "backend",
    outcome: authStatus === null ? "unknown" : authSucceeded ? "success" : "failure",
    reasonCode: authStatus === null ? "AUTH_EVIDENCE_MISSING" : authSucceeded ? "AUTH_HEALTH_REACHABLE" : "AUTH_UNAVAILABLE",
    previous: priorAvailability(previousBackend, "auth"),
    observedAt: authStatus === null ? null : observedAt,
    window,
  });

  const databaseCheck = availabilityCheck({
    checkId: "backend-database-availability",
    component: "backend",
    outcome: input.evidence.database === null ? "unknown" : input.evidence.database ? "success" : "failure",
    reasonCode: input.evidence.database === null ? "DATABASE_EVIDENCE_MISSING" : input.evidence.database ? "DATABASE_READ_SUCCEEDED" : "DATABASE_UNAVAILABLE",
    previous: priorAvailability(previousBackend, "db"),
    observedAt: input.evidence.database === null ? null : observedAt,
    window,
  });
  checks.push(combineBackendChecks([edgeCheck, releaseCheck, authCheck, databaseCheck], observedAt));
  checks.push(backendIoCheck(input.evidence.storage, input.evidence.realtime, previous.get("backend-storage-realtime-io"), observedAt, window));
  checks.push(workerCheck(input.evidence.workers, observedAt, window));
  checks.push(kaelCheck(input.evidence.kael, input.evidence.workers, previous.get("kael-agentic"), input.now, observedAt, window));
  checks.push(mobileCheck(input.evidence.mobile, observedAt, window));
  checks.push(observerCheck(input.evidence.observer, input.now, observedAt));

  const requiredCheckIds = checks.map((item) => item.check_id);
  const overallStatus = evaluateSystemHealth(checks, requiredCheckIds);
  const projectRefOutput = safeProjectRef(input.expectedProjectRef);
  const snapshot: SystemHealthSnapshot = {
    schema_version: 2,
    profile_id: "cloudflare-admin-v1",
    required_check_ids: requiredCheckIds,
    coverage_gaps: ["app-crash", "push-notifications"],
    environment: input.environment,
    project_ref: projectRefOutput,
    release_id: releaseId,
    scheduled_at: input.scheduledAt,
    completed_at: observedAt,
    expires_at: new Date(input.now.getTime() + 180_000).toISOString(),
    overall_status: overallStatus,
    checks,
  };
  const parsed = systemHealthSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) throw new Error(`SNAPSHOT_SCHEMA_INVALID:${parsed.error.issues[0]?.path.join(".") ?? "unknown"}`);
  const serialized = JSON.stringify(parsed.data);
  const byteLength = new TextEncoder().encode(serialized).byteLength;
  if (byteLength > 2 * 1024) throw new Error(`SNAPSHOT_SIZE_LIMIT:${byteLength}`);
  return JSON.parse(serialized) as SystemHealthSnapshot;
}

export function isSystemMonitorEvidenceUrlAllowed(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.username || url.password || url.hash) return false;
    const paths = new Set([
      "/functions/v1/mobile-api/harness/health",
      "/auth/v1/health",
      "/storage/v1/health",
      "/realtime/v1/healthcheck",
    ]);
    const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (localHost) return url.protocol === "http:" && !url.search && paths.has(url.pathname);
    if (url.protocol !== "https:" || url.port) return false;
    if (/^[a-z0-9]{8,40}\.supabase\.co$/u.test(url.hostname)) {
      return !url.search && paths.has(url.pathname);
    }
    return false;
  } catch {
    return false;
  }
}

export function normalizeSystemMonitorAggregate(
  value: unknown,
  source: "kael" | "mobile",
): Record<string, unknown> | null {
  const row = asRecord(value);
  if (!row) return null;
  const countKeys = source === "kael"
    ? [
      "valid_execution_count", "failed_execution_count", "api_call_count", "api_failure_count",
      "fallback_count", "api_call_count_15m", "open_circuit_count", "learning_eligible_count",
    ]
    : ["active_session_count", "api_failure_count", "platform_count"];
  const aggregate: Record<string, unknown> = {};
  for (const key of countKeys) {
    const count = row[key];
    if (!isBoundedCount(count)) return null;
    aggregate[key] = count;
  }
  if (source === "kael") {
    if (!("learning_oldest_due_at" in row)) return null;
    const oldestDueAt = row.learning_oldest_due_at;
    if (oldestDueAt !== null && (typeof oldestDueAt !== "string" || !Number.isFinite(Date.parse(oldestDueAt)))) return null;
    aggregate.learning_oldest_due_at = oldestDueAt;
  }
  return aggregate;
}

function isBoundedCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;
}

function check(input: Omit<SystemHealthCheck, "incident_id">): SystemHealthCheck {
  const { evidence_window: evidenceWindow, ...fields } = input;
  const metrics = Object.fromEntries(Object.entries(fields.metrics).filter(([key, value]) => value !== 0 || key.endsWith("_status")));
  return {
    ...fields,
    metrics,
    ...(evidenceWindow === null ? {} : { evidence_window: evidenceWindow }),
  };
}

function combineBackendChecks(checks: readonly SystemHealthCheck[], observedAt: string) {
  const status = worstStatus(checks.map((item) => item.status));
  const selected = checks.find((item) => item.status === status);
  const edge = checks.find((item) => item.check_id === "backend-edge-availability");
  const auth = checks.find((item) => item.check_id === "backend-auth-availability");
  const database = checks.find((item) => item.check_id === "backend-database-availability");
  return check({
    check_id: "backend-core",
    component: "backend",
    status,
    reason_code: status === "green" ? "CORE_HEALTHY" : selected?.reason_code ?? "BACKEND_EVIDENCE_INCOMPLETE",
    observed_at: checks.every((item) => item.observed_at !== null) ? observedAt : null,
    evidence_window: null,
    sample_count: checks.filter((item) => item.sample_count !== null).length,
    metrics: {
      edge_status: statusCode(edge?.status),
      edge_fails: metricNumber(edge?.metrics.fails),
      edge_successes: metricNumber(edge?.metrics.successes),
      auth_status: statusCode(auth?.status),
      auth_fails: metricNumber(auth?.metrics.fails),
      auth_successes: metricNumber(auth?.metrics.successes),
      auth_ok: metricStatus(checks, "backend-auth-availability"),
      db_status: statusCode(database?.status),
      db_fails: metricNumber(database?.metrics.fails),
      db_successes: metricNumber(database?.metrics.successes),
      db_ok: metricStatus(checks, "backend-database-availability"),
      release_ok: checks.find((item) => item.check_id === "backend-release-identity")?.status === "green"
        ? true
        : checks.find((item) => item.check_id === "backend-release-identity")?.status === "red"
        ? false
        : null,
      project: metricBoolean(checks, "backend-release-identity", "project_match"),
    },
  });
}

function worstStatus(statuses: readonly SystemHealthStatus[]): SystemHealthStatus {
  if (statuses.includes("red")) return "red";
  if (statuses.includes("yellow")) return "yellow";
  if (statuses.includes("gray")) return "gray";
  return "green";
}

function metricStatus(checks: readonly SystemHealthCheck[], id: string): boolean | null {
  const status = checks.find((item) => item.check_id === id)?.status;
  return status === undefined || status === "gray" ? null : status === "green";
}

function metricBoolean(checks: readonly SystemHealthCheck[], id: string, key: string): boolean | null {
  const value = checks.find((item) => item.check_id === id)?.metrics[key];
  return typeof value === "boolean" ? value : null;
}

function priorAvailability(previousBackend: SystemHealthCheck | undefined, key: string): SystemHealthCheck | undefined {
  const rawStatus = previousBackend?.metrics[`${key}_status`];
  if (typeof rawStatus !== "number" || !Number.isInteger(rawStatus) || rawStatus < 0 || rawStatus > 3) return undefined;
  const statuses: SystemHealthStatus[] = ["green", "yellow", "red", "gray"];
  return {
    check_id: `backend-${key}-availability`,
    component: "backend",
    status: statuses[rawStatus],
    reason_code: "PREVIOUS_BACKEND_EVIDENCE",
    observed_at: previousBackend?.observed_at ?? null,
    evidence_window: null,
    sample_count: previousBackend?.sample_count ?? null,
    metrics: {
      fails: metricNumber(previousBackend?.metrics[`${key}_fails`]),
      successes: metricNumber(previousBackend?.metrics[`${key}_successes`]),
    },
    incident_id: null,
  };
}

function statusCode(status: SystemHealthStatus | undefined): number {
  if (status === "green") return 0;
  if (status === "yellow") return 1;
  if (status === "red") return 2;
  return 3;
}

function availabilityCheck(input: {
  checkId: string;
  component: string;
  outcome: "success" | "failure" | "unknown";
  reasonCode: string;
  previous: SystemHealthCheck | undefined;
  threshold?: number;
  observedAt: string | null;
  window: { from: string; to: string };
}) {
  const state: AvailabilityState = {
    status: input.previous?.status ?? "gray",
    consecutive_failures: metricNumber(input.previous?.metrics.fails),
    consecutive_successes: metricNumber(input.previous?.metrics.successes),
  };
  const next = advanceAvailability(state, input.outcome, input.threshold ?? 2);
  let reasonCode = input.reasonCode;
  if (input.outcome === "failure" && next.status === "yellow") reasonCode = `${input.reasonCode}_FIRST_SAMPLE`;
  if (input.outcome === "success" && state.status === "red" && next.status === "red") reasonCode = `${input.reasonCode}_RECOVERY_PENDING`;
  return check({
    check_id: input.checkId,
    component: input.component,
    status: next.status,
    reason_code: input.outcome === "unknown" ? input.reasonCode : reasonCode,
    observed_at: input.observedAt,
    evidence_window: input.outcome === "unknown" ? null : input.window,
    sample_count: input.outcome === "unknown" ? null : 1,
    metrics: {
      ...(next.consecutive_failures > 0 ? { fails: next.consecutive_failures } : {}),
      ...(next.status !== "green" && next.consecutive_successes > 0 ? { successes: next.consecutive_successes } : {}),
    },
  });
}

function backendIoCheck(
  storageEvidence: SystemMonitorEvidence["storage"],
  realtimeEvidence: SystemMonitorEvidence["realtime"],
  previous: SystemHealthCheck | undefined,
  observedAt: string,
  window: { from: string; to: string },
) {
  const storageSuccessStatus = storageEvidence.status !== null && storageEvidence.status >= 200 && storageEvidence.status < 300;
  const storageOutcome = storageEvidence.status === null ? "unknown"
    : !storageSuccessStatus || storageEvidence.healthy === false ? "failure"
    : storageEvidence.healthy === true ? "success"
    : "unknown";
  const storageReasonCode = storageOutcome === "unknown"
    ? storageEvidence.status === null ? "STORAGE_EVIDENCE_MISSING" : "STORAGE_HEALTH_UNVERIFIED"
    : storageOutcome === "success" ? "STORAGE_HEALTHY" : "STORAGE_UNAVAILABLE";
  const realtimeOutcome = realtimeEvidence.status === null ? "unknown"
    : realtimeEvidence.status >= 200 && realtimeEvidence.status < 300 ? "success"
    : "failure";
  const realtimeReasonCode = realtimeOutcome === "unknown" ? "REALTIME_EVIDENCE_MISSING"
    : realtimeOutcome === "success" ? "REALTIME_HEALTHY" : "REALTIME_UNAVAILABLE";
  const storage = availabilityCheck({
    checkId: "backend-storage-io",
    component: "backend",
    outcome: storageOutcome,
    reasonCode: storageReasonCode,
    previous: previous ? sourceAvailability(previous, "storage") : undefined,
    observedAt: storageOutcome === "unknown" ? null : observedAt,
    window,
  });
  const realtime = availabilityCheck({
    checkId: "backend-realtime-io",
    component: "backend",
    outcome: realtimeOutcome,
    reasonCode: realtimeReasonCode,
    previous: previous ? sourceAvailability(previous, "realtime") : undefined,
    observedAt: realtimeOutcome === "unknown" ? null : observedAt,
    window,
  });
  const status = worstStatus([storage.status, realtime.status]);
  const selected = [storage, realtime].find((item) => item.status === status);
  const sampleCount = Number(storageOutcome !== "unknown") + Number(realtimeOutcome !== "unknown");
  return check({
    check_id: "backend-storage-realtime-io",
    component: "backend",
    status,
    reason_code: status === "green" ? "IO_CHECKS_HEALTHY" : selected?.reason_code ?? "IO_CHECKS_UNVERIFIED",
    observed_at: sampleCount > 0 ? observedAt : null,
    evidence_window: null,
    sample_count: sampleCount > 0 ? sampleCount : null,
    metrics: {
      storage_status: statusCode(storage.status),
      ...(metricNumber(storage.metrics.fails) > 0 ? { storage_fails: metricNumber(storage.metrics.fails) } : {}),
      ...(metricNumber(storage.metrics.successes) > 0 ? { storage_successes: metricNumber(storage.metrics.successes) } : {}),
      realtime_status: statusCode(realtime.status),
      ...(metricNumber(realtime.metrics.fails) > 0 ? { realtime_fails: metricNumber(realtime.metrics.fails) } : {}),
      ...(metricNumber(realtime.metrics.successes) > 0 ? { realtime_successes: metricNumber(realtime.metrics.successes) } : {}),
    },
  });
}

function sourceAvailability(previous: SystemHealthCheck, source: "storage" | "realtime"): SystemHealthCheck | undefined {
  const previousStatus = previous.metrics[`${source}_status`];
  if (typeof previousStatus !== "number" || !Number.isInteger(previousStatus) || previousStatus < 0 || previousStatus > 3) return undefined;
  const statuses: SystemHealthStatus[] = ["green", "yellow", "red", "gray"];
  return {
    check_id: `backend-${source}-io`,
    component: "backend",
    status: statuses[previousStatus],
    reason_code: previous.reason_code,
    observed_at: previous.observed_at,
    evidence_window: null,
    sample_count: previous.sample_count,
    metrics: {
      fails: metricNumber(previous.metrics[`${source}_fails`]),
      successes: metricNumber(previous.metrics[`${source}_successes`]),
    },
    incident_id: null,
  };
}

function workerCheck(workers: readonly Record<string, unknown>[] | null, observedAt: string, window: { from: string; to: string }) {
  if (workers === null || workers.length === 0) {
    return check({
      check_id: "backend-scheduled-workers",
      component: "backend",
      status: "gray",
      reason_code: "WORKER_EVIDENCE_MISSING",
      observed_at: null,
      evidence_window: null,
      sample_count: null,
      metrics: {},
    });
  }
  const enabled = workers.filter((worker) => worker.enabled === true);
  if (enabled.length === 0) {
    return check({ check_id: "backend-scheduled-workers", component: "backend", status: "gray", reason_code: "WORKERS_NOT_CONFIGURED", observed_at: null, evidence_window: null, sample_count: 0, metrics: {} });
  }
  let failed = 0;
  let missing = 0;
  let late = 0;
  let incomplete = 0;
  const nowMs = Date.parse(observedAt);
  for (const worker of enabled) {
    if (worker.cron_enabled === false) failed += 1;
    else if (worker.cron_enabled !== true) {
      missing += 1;
      incomplete += 1;
    }
    const finishedAt = typeof worker.last_finished_at === "string" ? worker.last_finished_at : null;
    const lastStatus = worker.last_status;
    if (lastStatus === "failed" || lastStatus === "error") failed += 1;
    else if (lastStatus !== "succeeded") missing += 1;
    if (!finishedAt || !Number.isFinite(Date.parse(finishedAt))) {
      missing += 1;
      continue;
    }
    if (Date.parse(finishedAt) > nowMs + 30_000) {
      missing += 1;
      continue;
    }
    if (worker.schedule_kind === "interval") {
      if (!isBoundedCount(worker.expected_interval_seconds) || worker.expected_interval_seconds < 1 ||
          !isBoundedCount(worker.grace_seconds)) {
        missing += 1;
        incomplete += 1;
        continue;
      }
      const dueMs = (worker.expected_interval_seconds + worker.grace_seconds) * 1000;
      if (nowMs - Date.parse(finishedAt) > dueMs) late += 1;
    } else if (worker.schedule_kind === "daily") {
      if (!isBoundedCount(worker.grace_seconds)) {
        missing += 1;
        incomplete += 1;
        continue;
      }
      const graceMs = worker.grace_seconds * 1000;
      const hour = worker.daily_utc_hour;
      const minute = worker.daily_utc_minute;
      if (!Number.isInteger(hour) || (hour as number) < 0 || (hour as number) > 23 ||
          !Number.isInteger(minute) || (minute as number) < 0 || (minute as number) > 59) {
        missing += 1;
        incomplete += 1;
        continue;
      }
      const todayDue = new Date(observedAt);
      todayDue.setUTCHours(hour as number, minute as number, 0, 0);
      const todayGraceExpiresAt = todayDue.getTime() + graceMs;
      const latestDueMs = nowMs > todayGraceExpiresAt ? todayDue.getTime() : todayDue.getTime() - 24 * 60 * 60 * 1000;
      if (nowMs > latestDueMs + graceMs && Date.parse(finishedAt) < latestDueMs) late += 1;
    } else {
      missing += 1;
      incomplete += 1;
    }
  }
  const status: SystemHealthStatus = failed > 0 || late > 0 ? "red" : missing > 0 ? "gray" : "green";
  return check({
    check_id: "backend-scheduled-workers",
    component: "backend",
    status,
    reason_code: failed > 0 ? "WORKER_FAILED" : late > 0 ? "WORKER_LATE" : incomplete > 0 ? "WORKER_EVIDENCE_INCOMPLETE" : missing > 0 ? "WORKER_NOT_OBSERVED" : "WORKERS_OK",
    observed_at: status === "gray" ? null : observedAt,
    evidence_window: null,
    sample_count: enabled.length,
    metrics: { failed, late, missing },
  });
}

function kaelCheck(
  evidence: Record<string, unknown> | null,
  workers: readonly Record<string, unknown>[] | null,
  previous: SystemHealthCheck | undefined,
  now: Date,
  observedAt: string,
  window: { from: string; to: string },
) {
  if (evidence === null) {
    return check({ check_id: "kael-agentic", component: "kael", status: "gray", reason_code: "KAEL_EVIDENCE_MISSING", observed_at: null, evidence_window: null, sample_count: null, metrics: {} });
  }
  const requiredCounts = [
    evidence.valid_execution_count,
    evidence.failed_execution_count,
    evidence.api_call_count,
    evidence.api_failure_count,
    evidence.fallback_count,
    evidence.api_call_count_15m,
    evidence.open_circuit_count,
    evidence.learning_eligible_count,
  ];
  const oldestDue = evidence.learning_oldest_due_at;
  if (!requiredCounts.every(isBoundedCount) || !("learning_oldest_due_at" in evidence) ||
      oldestDue !== null && (typeof oldestDue !== "string" || !Number.isFinite(Date.parse(oldestDue)))) {
    return check({
      check_id: "kael-agentic",
      component: "kael",
      status: "gray",
      reason_code: "KAEL_EVIDENCE_INCOMPLETE",
      observed_at: observedAt,
      evidence_window: window,
      sample_count: nullableCount(evidence.valid_execution_count),
      metrics: { failed: nullableCount(evidence.failed_execution_count), calls15m: nullableCount(evidence.api_call_count_15m) },
    });
  }
  const sampleCount = metricNumber(evidence.valid_execution_count);
  const failureCount = metricNumber(evidence.failed_execution_count);
  const priorRedEvaluations = previous?.reason_code === "ERROR_RATE_HIGH" &&
    (previous.status === "yellow" || previous.status === "red") &&
    isSystemEvidenceFresh(previous.observed_at, now.getTime()) ? 1 : 0;
  const rate = evaluateKaelErrorRate({ failureCount, sampleCount, previousRedEvaluations: priorRedEvaluations });
  const learning = learningQueueEvidence(evidence, workers, now.getTime());
  const openCircuits = metricNumber(evidence.open_circuit_count);
  const recentActivity = metricNumber(evidence.api_call_count_15m);
  let status = rate.status;
  let reasonCode = rate.reasonCode;
  if (openCircuits > 0 && (status === "green" || status === "gray")) {
    status = "yellow";
    reasonCode = "PROVIDER_CIRCUIT_OPEN";
  }
  if (recentActivity === 0 && (status === "green" || status === "gray")) {
    status = "gray";
    reasonCode = "NO_RECENT_AI_ACTIVITY";
  }
  if (learning.status === "yellow" && status !== "red") {
    status = "yellow";
    reasonCode = learning.reasonCode ?? "LEARNING_QUEUE_STALE";
  } else if (learning.status === "gray" && status === "green") {
    status = "gray";
    reasonCode = learning.reasonCode ?? "LEARNING_QUEUE_EVIDENCE_MISSING";
  }
  return check({
    check_id: "kael-agentic",
    component: "kael",
    status,
    reason_code: reasonCode,
    observed_at: observedAt,
    evidence_window: window,
    sample_count: sampleCount,
    metrics: {
      failed: failureCount,
      calls15m: recentActivity,
      fallbacks: metricNumber(evidence.fallback_count),
      circuits: openCircuits,
      learning: metricNumber(evidence.learning_eligible_count),
      ...(learning.ageSeconds === null ? {} : { learning_age_seconds: learning.ageSeconds }),
      ...(rate.redEvaluations === 0 ? {} : { red_evaluations: rate.redEvaluations }),
    },
  });
}

function learningQueueEvidence(
  evidence: Record<string, unknown>,
  workers: readonly Record<string, unknown>[] | null,
  nowMs: number,
): { status: "yellow" | "gray" | null; reasonCode: string | null; ageSeconds: number | null } {
  const eligible = metricNumber(evidence.learning_eligible_count);
  if (eligible === 0) return { status: null, reasonCode: null, ageSeconds: null };
  const oldestDue = typeof evidence.learning_oldest_due_at === "string" ? Date.parse(evidence.learning_oldest_due_at) : Number.NaN;
  if (!Number.isFinite(oldestDue) || oldestDue > nowMs) {
    return { status: "gray", reasonCode: "LEARNING_QUEUE_EVIDENCE_MISSING", ageSeconds: null };
  }
  const fallback = workers?.find((worker) => worker.job_name === "kael-learning-queue-stale-fallback");
  if (!fallback || fallback.enabled !== true || fallback.cron_enabled !== true || fallback.schedule_kind !== "interval") {
    return { status: "gray", reasonCode: "LEARNING_QUEUE_SCHEDULE_UNAVAILABLE", ageSeconds: Math.floor((nowMs - oldestDue) / 1000) };
  }
  const interval = fallback.expected_interval_seconds;
  const grace = fallback.grace_seconds;
  if (!Number.isInteger(interval) || (interval as number) < 60 || !Number.isInteger(grace) || (grace as number) < 0) {
    return { status: "gray", reasonCode: "LEARNING_QUEUE_SCHEDULE_UNAVAILABLE", ageSeconds: Math.floor((nowMs - oldestDue) / 1000) };
  }
  const ageSeconds = Math.floor((nowMs - oldestDue) / 1000);
  const staleAfterSeconds = 48 * 60 * 60 + (interval as number) + (grace as number);
  return ageSeconds > staleAfterSeconds
    ? { status: "yellow", reasonCode: "LEARNING_QUEUE_STALE", ageSeconds }
    : { status: null, reasonCode: null, ageSeconds };
}

function mobileCheck(evidence: Record<string, unknown> | null, observedAt: string, window: { from: string; to: string }) {
  if (evidence === null) {
    return check({ check_id: "app-native-connectivity", component: "app", status: "gray", reason_code: "NATIVE_SESSION_EVIDENCE_MISSING", observed_at: null, evidence_window: null, sample_count: null, metrics: {} });
  }
  if (!isBoundedCount(evidence.active_session_count) || !isBoundedCount(evidence.api_failure_count) ||
      !isBoundedCount(evidence.platform_count) || evidence.api_failure_count > evidence.active_session_count ||
      evidence.platform_count > evidence.active_session_count) {
    return check({
      check_id: "app-native-connectivity",
      component: "app",
      status: "gray",
      reason_code: "NATIVE_SESSION_EVIDENCE_INCOMPLETE",
      observed_at: isBoundedCount(evidence.active_session_count) ? observedAt : null,
      evidence_window: isBoundedCount(evidence.active_session_count) ? window : null,
      sample_count: nullableCount(evidence.active_session_count),
      metrics: { api_failures: nullableCount(evidence.api_failure_count), platforms: nullableCount(evidence.platform_count) },
    });
  }
  const sessions = metricNumber(evidence.active_session_count);
  const status = sessions === 0 ? "gray" : evidence.api_failure_count === sessions ? "red" : metricNumber(evidence.api_failure_count) > 0 ? "yellow" : "green";
  return check({
    check_id: "app-native-connectivity",
    component: "app",
    status,
    reason_code: sessions === 0 ? "NO_ACTIVE_NATIVE_SESSIONS" : status === "red" ? "NATIVE_API_FAILURES" : status === "yellow" ? "NATIVE_API_DEGRADED" : "NATIVE_SESSIONS_CONNECTED",
    observed_at: sessions === 0 ? null : observedAt,
    evidence_window: sessions === 0 ? null : window,
    sample_count: sessions,
    metrics: { api_failures: metricNumber(evidence.api_failure_count), platforms: metricNumber(evidence.platform_count) },
  });
}

function observerCheck(evidence: Record<string, unknown> | null, now: Date, observedAt: string) {
  const heartbeatAt = typeof evidence?.observer_heartbeat_at === "string" ? evidence.observer_heartbeat_at : null;
  if (evidence === null || heartbeatAt === null) {
    return check({ check_id: "observer-dispatcher", component: "observer", status: "gray", reason_code: "OBSERVER_HEARTBEAT_MISSING", observed_at: null, evidence_window: null, sample_count: null, metrics: {} });
  }
  if (!isSystemEvidenceFresh(heartbeatAt, now.getTime())) {
    return check({ check_id: "observer-dispatcher", component: "observer", status: "red", reason_code: "OBSERVER_HEARTBEAT_STALE", observed_at: heartbeatAt, evidence_window: null, sample_count: 1, metrics: {} });
  }
  const dispatcherStatus = evidence.dispatcher_status;
  const d1Status = evidence.d1_status;
  const status: SystemHealthStatus = dispatcherStatus === "red" || d1Status === "red"
    ? "red"
    : dispatcherStatus === "green" && d1Status === "green"
    ? "green"
    : dispatcherStatus === "gray" || d1Status === "gray"
    ? "gray"
    : "yellow";
  return check({
    check_id: "observer-dispatcher",
    component: "observer",
    status,
    reason_code: status === "green" ? "OBSERVER_OK" : status === "red" ? "OBSERVER_OR_D1_FAILED" : status === "gray" ? "OBSERVER_INCOMPLETE" : "OBSERVER_DEGRADED",
    observed_at: observedAt,
    evidence_window: null,
    sample_count: 1,
    metrics: { d1_healthy: d1Status === "green", dispatcher_healthy: dispatcherStatus === "green" },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function metricNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function nullableCount(value: unknown): number | null {
  return isBoundedCount(value) ? value : null;
}

function safeProjectRef(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9]{8,40}$/u.test(value) ? value : null;
}

function safeReleaseId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9._+-]{1,100}$/u.test(value) ? value : null;
}
