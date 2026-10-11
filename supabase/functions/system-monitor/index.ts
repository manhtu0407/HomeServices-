import { createClient } from "@supabase/supabase-js";
import { systemHealthSnapshotSchema, type SystemHealthSnapshot } from "../_shared/contracts/system-health.ts";
import { createSystemMonitorHandler, type MonitorStore, type MonitorSourceState } from "./handler.ts";

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
        .select("schema_version,environment,project_ref,release_id,scheduled_at,completed_at,expires_at,overall_status,checks")
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
      return data.map(normalizeWorkerEvidence).filter((item): item is Record<string, unknown> => item !== null);
    },
    async readKaelEvidence(environment, since) {
      const { data, error } = await client.rpc("get_system_monitor_kael_evidence", {
        p_environment: environment,
        p_since: since,
      });
      if (error) throw new Error("KAEL_EVIDENCE_READ_FAILED");
      return normalizeAggregate(data);
    },
    async readMobileEvidence(environment) {
      const { data, error } = await client.rpc("get_system_monitor_mobile_evidence", {
        p_environment: environment,
        p_now: new Date().toISOString(),
      });
      if (error) throw new Error("MOBILE_EVIDENCE_READ_FAILED");
      return normalizeAggregate(data);
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
        .select("schema_version,environment,project_ref,release_id,scheduled_at,completed_at,expires_at,overall_status,checks")
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
    async readSourceState(source) {
      const { data, error } = await client.from("system_monitor_source_state")
        .select("backoff_until,consecutive_failures")
        .eq("source_name", source)
        .maybeSingle();
      if (error) throw new Error("SOURCE_STATE_READ_FAILED");
      const row = asRecord(data);
      return row ? {
        backoff_until: safeDate(row.backoff_until),
        consecutive_failures: boundedCount(row.consecutive_failures),
      } satisfies MonitorSourceState : null;
    },
    async writeSourceState(source, state) {
      const { error } = await client.from("system_monitor_source_state").upsert({
        source_name: source,
        backoff_until: state.backoff_until,
        consecutive_failures: boundedCount(state.consecutive_failures),
        last_status_code: state.last_status_code,
        updated_at: new Date().toISOString(),
      }, { onConflict: "source_name" });
      if (error) throw new Error("SOURCE_STATE_WRITE_FAILED");
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
    async claimFallbackDelivery(dedupeKey, deliveryKind, now) {
      const { data, error } = await client.rpc("claim_system_health_delivery", {
        p_dedupe_key: dedupeKey,
        p_delivery_kind: deliveryKind,
        p_now: now,
        p_lease_seconds: 30,
      });
      if (error || typeof data !== "boolean") throw new Error("OBSERVER_DELIVERY_CLAIM_FAILED");
      return data;
    },
    async completeFallbackDelivery(input) {
      const { data, error } = await client.rpc("complete_system_health_delivery", {
        p_dedupe_key: input.dedupeKey,
        p_delivered: input.delivered,
        p_retry_at: input.retryAt,
        p_error_code: input.errorCode,
        p_now: input.now,
      });
      if (error || typeof data !== "boolean") throw new Error("OBSERVER_DELIVERY_COMPLETE_FAILED");
      return data;
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
  if (!row || typeof row.job_name !== "string") return null;
  return {
    job_name: row.job_name,
    schedule_kind: row.schedule_kind,
    expected_interval_seconds: boundedCount(row.expected_interval_seconds),
    daily_utc_hour: boundedCount(row.daily_utc_hour),
    daily_utc_minute: boundedCount(row.daily_utc_minute),
    grace_seconds: boundedCount(row.grace_seconds),
    config_version: boundedCount(row.config_version),
    enabled: row.enabled === true,
    cron_enabled: typeof row.cron_enabled === "boolean" ? row.cron_enabled : null,
    last_status: safeWorkerStatus(row.last_status),
    last_started_at: safeDate(row.last_started_at),
    last_finished_at: safeDate(row.last_finished_at),
    last_reason_code: safeReasonCode(row.last_reason_code),
    last_release_id: safeToken(row.last_release_id, 100),
  };
}

function normalizeAggregate(value: unknown) {
  const row = asRecord(value);
  if (!row) throw new Error("MONITOR_AGGREGATE_INVALID");
  const allowed = [
    "valid_execution_count", "failed_execution_count", "api_call_count", "api_failure_count",
    "fallback_count", "api_call_count_15m", "open_circuit_count", "learning_eligible_count",
    "active_session_count", "platform_count",
  ];
  const aggregate: Record<string, unknown> = {};
  for (const key of allowed) if (key in row) aggregate[key] = boundedCount(row[key]);
  if ("learning_oldest_due_at" in row) aggregate.learning_oldest_due_at = safeDate(row.learning_oldest_due_at);
  return aggregate;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function boundedCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : 0;
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
