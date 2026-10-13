import { createClient } from "@supabase/supabase-js";
import { systemHealthSnapshotSchema, type EdgeSystemHealthSnapshot as SystemHealthSnapshot } from "../_shared/contracts/system-health.ts";
import { normalizeSystemMonitorAggregate } from "./collector.ts";
import { createSystemMonitorHandler, type MonitorStore } from "./handler.ts";

const handler = createSystemMonitorHandler({
  env: (name) => Deno.env.get(name),
  createStore: createSupabaseMonitorStore,
  fetcher: fetch,
});

Deno.serve(handler);

function createSupabaseMonitorStore(
  supabaseUrl: string,
  serviceKey: string,
  fetcher: typeof fetch = boundedSupabaseFetch,
): MonitorStore {
  const client = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetcher },
  });

  return {
    async claimRun(environment, scheduledAt, ownerId) {
      const { data, error } = await client.rpc("claim_system_health_run", {
        p_environment: environment,
        p_scheduled_at: scheduledAt,
        p_owner_id: ownerId,
        p_lease_seconds: 45,
      });
      if (error || typeof data !== "boolean") throw new Error("MONITOR_CLAIM_FAILED");
      return data;
    },
    async databaseProbe() {
      const { data, error } = await client.rpc("system_monitor_health_probe");
      if (error || typeof data !== "boolean") throw new Error("DATABASE_PROBE_FAILED");
      return data;
    },
    async readPreviousSnapshot(environment, before) {
      const { data, error } = await client.from("system_health_snapshots")
        .select("schema_version,profile_id,required_check_ids,coverage_gaps,environment,project_ref,release_id,scheduled_at,completed_at,expires_at,overall_status,checks")
        .eq("environment", environment)
        .lt("scheduled_at", before)
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error("PREVIOUS_SNAPSHOT_READ_FAILED");
      return parseSnapshot(data);
    },
    async readWorkerEvidence() {
      const { data, error } = await client.rpc("get_system_monitor_worker_evidence");
      if (error || !Array.isArray(data)) throw new Error("WORKER_EVIDENCE_READ_FAILED");
      const normalized = data.map(normalizeWorkerEvidence);
      if (normalized.some((item) => item === null)) throw new Error("WORKER_EVIDENCE_INVALID");
      return normalized as Record<string, unknown>[];
    },
    async readKaelEvidence(environment, since) {
      const { data, error } = await client.rpc("get_system_monitor_kael_evidence", {
        p_environment: environment,
        p_since: since,
      });
      if (error) throw new Error("KAEL_EVIDENCE_READ_FAILED");
      const aggregate = normalizeSystemMonitorAggregate(data, "kael");
      if (!aggregate) throw new Error("KAEL_EVIDENCE_INVALID");
      return aggregate;
    },
    async readMobileEvidence(environment) {
      const { data, error } = await client.rpc("get_system_monitor_mobile_evidence", {
        p_environment: environment,
        p_now: new Date().toISOString(),
      });
      if (error) throw new Error("MOBILE_EVIDENCE_READ_FAILED");
      const aggregate = normalizeSystemMonitorAggregate(data, "mobile");
      if (!aggregate) throw new Error("MOBILE_EVIDENCE_INVALID");
      return aggregate;
    },
    async readObserverState(environment) {
      const { data, error } = await client.from("system_health_observer_state")
        .select("observer_heartbeat_at,dispatcher_status,d1_status,last_snapshot_at,last_error_code")
        .eq("environment", environment)
        .maybeSingle();
      if (error) throw new Error("OBSERVER_STATE_READ_FAILED");
      const row = asRecord(data);
      if (!row) return null;
      return {
        observer_heartbeat_at: safeDate(row.observer_heartbeat_at),
        dispatcher_status: safeStatus(row.dispatcher_status),
        d1_status: safeStatus(row.d1_status),
        last_snapshot_at: safeDate(row.last_snapshot_at),
        last_error_code: safeReasonCode(row.last_error_code),
      };
    },
    async readLatestSnapshot(environment) {
      const { data, error } = await client.from("system_health_snapshots")
        .select("schema_version,profile_id,required_check_ids,coverage_gaps,environment,project_ref,release_id,scheduled_at,completed_at,expires_at,overall_status,checks")
        .eq("environment", environment)
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error("LATEST_SNAPSHOT_READ_FAILED");
      return parseSnapshot(data);
    },
    async recordSnapshot(snapshot) {
      const { data, error } = await client.rpc("record_system_health_snapshot", { p_snapshot: snapshot });
      if (error || typeof data !== "boolean") throw new Error("SNAPSHOT_WRITE_FAILED");
      return data;
    },
    async writeWorkerHeartbeat(input) {
      const { error } = await client.rpc("record_system_monitor_worker_heartbeat", {
        p_job_name: input.jobName,
        p_execution_id: input.executionId,
        p_started_at: input.startedAt,
        p_finished_at: input.finishedAt,
        p_completion_status: input.completionStatus,
        p_reason_code: input.reasonCode,
        p_release_id: input.releaseId,
      });
      if (error) throw new Error("WORKER_HEARTBEAT_WRITE_FAILED");
    },
    async recordObserverHeartbeat(environment, input) {
      const { data, error } = await client.rpc("record_system_monitor_observer_heartbeat", {
        p_environment: environment,
        p_dispatcher_status: input.dispatcherStatus,
        p_d1_status: input.d1Status,
        p_error_code: input.errorCode,
        p_observed_at: input.observedAt,
      });
      if (error) throw new Error("OBSERVER_STATE_WRITE_FAILED");
      const value = asRecord(data);
      const transition = value?.transition === "opened" || value?.transition === "resolved" || value?.transition === "none"
        ? value.transition
        : null;
      if (!value || !transition) throw new Error("OBSERVER_TRANSITION_INVALID");
      return {
        transition,
        incidentId: typeof value.incident_id === "string" && /^[0-9a-f-]{36}$/iu.test(value.incident_id) ? value.incident_id : null,
        openedAt: safeDate(value.opened_at),
        reasonCode: safeReasonCode(value.reason_code),
      };
    },
    async writeExternalObserverIncident(environment, input) {
      const { data, error } = await client.rpc("record_system_monitor_external_incident", {
        p_external_incident_id: input.externalIncidentId,
        p_environment: environment,
        p_status: input.status,
        p_opened_at: input.openedAt,
        p_reason_code: input.reasonCode,
      });
      if (error || data !== true) throw new Error("OBSERVER_INCIDENT_WRITE_FAILED");
    },
  };
}

async function boundedSupabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  const signal = init?.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(5_000)])
    : AbortSignal.timeout(5_000);
  return await fetch(input, { ...init, signal });
}

function parseSnapshot(value: unknown): SystemHealthSnapshot | null {
  const parsed = systemHealthSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeWorkerEvidence(value: unknown): Record<string, unknown> | null {
  const row = asRecord(value);
  if (!row || typeof row.job_name !== "string" ||
      (row.schedule_kind !== "interval" && row.schedule_kind !== "daily") ||
      typeof row.enabled !== "boolean" ||
      (row.cron_enabled !== null && typeof row.cron_enabled !== "boolean")) return null;
  const intervalSeconds = boundedCount(row.expected_interval_seconds);
  const dailyUtcHour = boundedCount(row.daily_utc_hour);
  const dailyUtcMinute = boundedCount(row.daily_utc_minute);
  const graceSeconds = boundedCount(row.grace_seconds);
  const configVersion = boundedCount(row.config_version);
  if (graceSeconds === null || configVersion === null || configVersion < 1 ||
      row.schedule_kind === "interval" && (intervalSeconds === null || intervalSeconds < 1) ||
      row.schedule_kind === "daily" && (dailyUtcHour === null || dailyUtcHour > 23 || dailyUtcMinute === null || dailyUtcMinute > 59)) return null;
  return {
    job_name: row.job_name,
    schedule_kind: row.schedule_kind,
    expected_interval_seconds: intervalSeconds,
    daily_utc_hour: dailyUtcHour,
    daily_utc_minute: dailyUtcMinute,
    grace_seconds: graceSeconds,
    config_version: configVersion,
    enabled: row.enabled,
    cron_enabled: typeof row.cron_enabled === "boolean" ? row.cron_enabled : null,
    last_status: safeWorkerStatus(row.last_status),
    last_started_at: safeDate(row.last_started_at),
    last_finished_at: safeDate(row.last_finished_at),
    last_reason_code: safeReasonCode(row.last_reason_code),
    last_release_id: safeToken(row.last_release_id, 100),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function boundedCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : null;
}

function safeDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function safeStatus(value: unknown) {
  return value === "green" || value === "yellow" || value === "red" || value === "gray" ? value : "gray";
}

function safeWorkerStatus(value: unknown) {
  return value === "succeeded" || value === "failed" || value === "running" || value === "error" ? value : null;
}

function safeReasonCode(value: unknown) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value) ? value : null;
}

function safeToken(value: unknown, limit: number) {
  return typeof value === "string" && value.length <= limit && /^[A-Za-z0-9._:+-]+$/u.test(value) ? value : null;
}
