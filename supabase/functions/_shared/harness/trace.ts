export type HarnessTraceClient = {
  rpc?(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export type HarnessTraceContext = Readonly<{
  traceId: string;
  runId: string;
  operationId?: string;
  parentRunId: string | null;
  turnId: string | null;
  toolCallId: string | null;
  parentEventId: string | null;
  actorIdHash: string | null;
  actorRole: string | null;
  jobId: string | null;
  releaseId: string;
  environment: string;
  startedAtMs: number;
  client?: HarnessTraceClient;
}>;

export type HarnessEventStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "blocked"
  | "cancelled"
  | "observed";

export function createHarnessTraceContext(input: {
  readonly request?: Request;
  readonly traceId?: string | null;
  readonly runId?: string | null;
  readonly operationId?: string | null;
  readonly parentRunId?: string | null;
  readonly turnId?: string | null;
  readonly toolCallId?: string | null;
  readonly parentEventId?: string | null;
  readonly actorIdHash?: string | null;
  readonly actorRole?: string | null;
  readonly jobId?: string | null;
  readonly releaseId: string;
  readonly environment: string;
  readonly client?: HarnessTraceClient;
  readonly acceptRequestLineage?: boolean;
  readonly now?: number;
}): HarnessTraceContext {
  const header = (name: string) => input.acceptRequestLineage
    ? input.request?.headers.get(name) ?? null
    : null;
  return Object.freeze({
    traceId: validUuid(input.traceId ?? header("x-trace-id") ?? header("x-harness-trace-id") ?? header("x-request-id")) ?? crypto.randomUUID(),
    runId: validUuid(input.runId ?? header("x-run-id") ?? header("x-harness-run-id")) ?? crypto.randomUUID(),
    operationId: validUuid(input.operationId ?? header("x-operation-id")) ?? crypto.randomUUID(),
    parentRunId: validUuid(input.parentRunId ?? header("x-parent-run-id") ?? header("x-harness-parent-run-id")),
    turnId: validUuid(input.turnId ?? header("x-turn-id") ?? header("x-harness-turn-id")),
    toolCallId: validUuid(input.toolCallId ?? header("x-tool-call-id") ?? header("x-harness-tool-call-id")),
    parentEventId: validUuid(input.parentEventId ?? header("x-parent-event-id") ?? header("x-harness-parent-event-id")),
    actorIdHash: validHash(input.actorIdHash),
    actorRole: boundedText(input.actorRole ?? "", 80) || null,
    jobId: validUuid(input.jobId),
    releaseId: boundedText(input.releaseId, 160) || "unreleased",
    environment: normalizeEnvironment(input.environment),
    startedAtMs: input.now ?? Date.now(),
    ...(input.client ? { client: input.client } : {}),
  });
}

export async function bindHarnessTraceActor(
  trace: HarnessTraceContext,
  input: {
    readonly actorId: string;
    readonly actorRole?: string | null;
    readonly jobId?: string | null;
    readonly client?: HarnessTraceClient;
  },
): Promise<HarnessTraceContext> {
  return Object.freeze({
    ...trace,
    actorIdHash: await hashHarnessIdentifier(input.actorId),
    actorRole: boundedText(input.actorRole ?? "", 80) || trace.actorRole,
    jobId: validUuid(input.jobId) ?? trace.jobId,
    ...(input.client ? { client: input.client } : {}),
  });
}

export function childHarnessTrace(
  trace: HarnessTraceContext,
  input: {
    readonly parentRunId?: string | null;
    readonly parentEventId?: string | null;
    readonly turnId?: string | null;
    readonly toolCallId?: string | null;
  },
): HarnessTraceContext {
  return Object.freeze({
    ...trace,
    parentRunId: validUuid(input.parentRunId) ?? trace.parentRunId,
    parentEventId: validUuid(input.parentEventId) ?? trace.parentEventId,
    turnId: validUuid(input.turnId) ?? trace.turnId,
    toolCallId: validUuid(input.toolCallId) ?? trace.toolCallId,
  });
}

export async function beginHarnessRun(
  trace: HarnessTraceContext | undefined,
  input: {
    readonly actorId?: string | null;
    readonly actorRole?: string | null;
    readonly routeKind: string;
    readonly capability: string | null;
    readonly safeMetadata?: Record<string, unknown>;
  },
): Promise<boolean> {
  if (!trace?.client?.rpc) return false;
  const actorIdHash = trace.actorIdHash ?? (input.actorId
    ? await hashHarnessIdentifier(input.actorId)
    : null);
  try {
    const { error } = await trace.client.rpc("begin_harness_run", {
      p_run_id: trace.runId,
      p_trace_id: trace.traceId,
      p_parent_run_id: trace.parentRunId,
      p_actor_id_hash: actorIdHash,
      p_actor_role: input.actorRole ?? trace.actorRole,
      p_route_kind: boundedText(input.routeKind, 160),
      p_capability: input.capability ? boundedText(input.capability, 220) : null,
      p_environment: trace.environment,
      p_release_id: trace.releaseId,
      p_job_id: trace.jobId,
      p_safe_metadata: sanitizeHarnessMetadata(input.safeMetadata ?? {}),
    });
    return !error;
  } catch {
    return false;
  }
}

export async function recordHarnessEvent(
  trace: HarnessTraceContext | undefined,
  input: {
    readonly eventClass: string;
    readonly stage?: string | null;
    readonly status: HarnessEventStatus;
    readonly attemptNumber?: number;
    readonly toolId?: string | null;
    readonly provider?: string | null;
    readonly model?: string | null;
    readonly costUsd?: number | null;
    readonly latencyMs?: number | null;
    readonly errorCode?: string | null;
    readonly safeMetadata?: Record<string, unknown>;
    readonly eventId?: string | null;
    readonly parentEventId?: string | null;
  },
): Promise<string | null> {
  if (!trace) return null;
  const eventId = validUuid(input.eventId) ?? crypto.randomUUID();
  const payload = {
    p_event_id: eventId,
    p_run_id: trace.runId,
    p_trace_id: trace.traceId,
    p_parent_event_id: validUuid(input.parentEventId) ?? trace.parentEventId,
    p_turn_id: trace.turnId,
    p_tool_call_id: trace.toolCallId,
    p_event_class: boundedText(input.eventClass, 120),
    p_stage: input.stage ? boundedText(input.stage, 120) : null,
    p_status: input.status,
    p_attempt_number: boundedAttempt(input.attemptNumber),
    p_tool_id: input.toolId ? boundedText(input.toolId, 160) : null,
    p_provider: input.provider ? boundedText(input.provider, 80) : null,
    p_model: input.model ? boundedText(input.model, 160) : null,
    p_cost_usd: finiteNonNegative(input.costUsd),
    p_latency_ms: finiteInteger(input.latencyMs),
    p_release_id: trace.releaseId,
    p_environment: trace.environment,
    p_error_code: input.errorCode ? boundedText(input.errorCode, 120) : null,
    p_safe_metadata: sanitizeHarnessMetadata(input.safeMetadata ?? {}),
  };
  console.info("harness_event", payload);
  if (!trace.client?.rpc) return eventId;
  try {
    const { error } = await trace.client.rpc("append_harness_event", payload);
    return error ? null : eventId;
  } catch {
    return null;
  }
}

export async function finishHarnessRun(
  trace: HarnessTraceContext | undefined,
  input: {
    readonly status: "completed" | "failed" | "cancelled" | "suspended";
    readonly errorCode?: string | null;
    readonly safeMetadata?: Record<string, unknown>;
  },
): Promise<boolean> {
  if (!trace?.client?.rpc) return false;
  try {
    const { error } = await trace.client.rpc("finish_harness_run", {
      p_run_id: trace.runId,
      p_status: input.status,
      p_duration_ms: Math.max(0, Date.now() - trace.startedAtMs),
      p_error_code: input.errorCode ? boundedText(input.errorCode, 120) : null,
      p_safe_metadata: sanitizeHarnessMetadata(input.safeMetadata ?? {}),
    });
    return !error;
  } catch {
    return false;
  }
}

export async function beginHarnessAuthorizedRequest(
  trace: HarnessTraceContext,
  input: {
    readonly actorRole: string | null;
    readonly routeKind: string;
    readonly capability: string;
    readonly risk: string;
    readonly operationClass: string;
    readonly privileged: boolean;
    readonly confirmationGate: string;
    readonly resourceType: string;
    readonly resourceId?: string | null;
  },
): Promise<boolean> {
  if (!trace.client?.rpc || !trace.actorIdHash) return false;
  const resourceIdHash = input.resourceId
    ? await hashHarnessIdentifier(input.resourceId)
    : null;
  try {
    const { data, error } = await trace.client.rpc(
      "begin_harness_authorized_request",
      {
        p_run_id: trace.runId,
        p_trace_id: trace.traceId,
        p_parent_run_id: trace.parentRunId,
        p_actor_id_hash: trace.actorIdHash,
        p_actor_role: input.actorRole ?? trace.actorRole,
        p_route_kind: boundedText(input.routeKind, 160),
        p_capability: boundedText(input.capability, 220),
        p_environment: trace.environment,
        p_release_id: trace.releaseId,
        p_job_id: trace.jobId,
        p_risk: boundedText(input.risk, 80),
        p_operation_class: boundedText(input.operationClass, 80),
        p_privileged: input.privileged,
        p_confirmation_gate: boundedText(input.confirmationGate, 80),
        p_resource_type: boundedText(input.resourceType, 80),
        p_resource_id_hash: resourceIdHash,
      },
    );
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function finishHarnessAuthorizedRequest(
  trace: HarnessTraceContext,
  input: {
    readonly actorRole: string | null;
    readonly routeKind: string;
    readonly capability: string;
    readonly privileged: boolean;
    readonly resourceType: string;
    readonly resourceId?: string | null;
  },
): Promise<boolean> {
  if (!trace.client?.rpc || !trace.actorIdHash) return false;
  const resourceIdHash = input.resourceId
    ? await hashHarnessIdentifier(input.resourceId)
    : null;
  try {
    const { data, error } = await trace.client.rpc(
      "finish_harness_authorized_request",
      {
        p_run_id: trace.runId,
        p_trace_id: trace.traceId,
        p_actor_id_hash: trace.actorIdHash,
        p_actor_role: input.actorRole ?? trace.actorRole,
        p_route_kind: boundedText(input.routeKind, 160),
        p_capability: boundedText(input.capability, 220),
        p_environment: trace.environment,
        p_release_id: trace.releaseId,
        p_privileged: input.privileged,
        p_resource_type: boundedText(input.resourceType, 80),
        p_resource_id_hash: resourceIdHash,
        p_duration_ms: Math.max(0, Date.now() - trace.startedAtMs),
      },
    );
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function recordHarnessPrivilegedOperation(
  trace: HarnessTraceContext | undefined,
  input: {
    readonly actorRole: string | null;
    readonly operationId: string;
    readonly capability: string;
    readonly reason: string;
    readonly resourceType: string;
    readonly resourceId?: string | null;
    readonly result: "allowed" | "succeeded" | "failed" | "denied";
    readonly errorCode?: string | null;
    readonly safeMetadata?: Record<string, unknown>;
  },
): Promise<boolean> {
  if (!trace?.client?.rpc) return trace?.environment === "local";
  try {
    const { error } = await trace.client.rpc("record_harness_privileged_operation", {
      p_operation_event_id: crypto.randomUUID(),
      p_run_id: trace.runId,
      p_trace_id: trace.traceId,
      p_actor_id_hash: trace.actorIdHash,
      p_actor_role: input.actorRole,
      p_operation_id: boundedText(input.operationId, 160),
      p_capability: boundedText(input.capability, 220),
      p_reason: boundedText(input.reason, 200),
      p_resource_type: boundedText(input.resourceType, 80),
      p_resource_id_hash: input.resourceId
        ? await hashHarnessIdentifier(input.resourceId)
        : null,
      p_result: input.result,
      p_release_id: trace.releaseId,
      p_environment: trace.environment,
      p_error_code: input.errorCode ? boundedText(input.errorCode, 120) : null,
      p_safe_metadata: sanitizeHarnessMetadata(input.safeMetadata ?? {}),
    });
    return !error;
  } catch {
    return false;
  }
}

export function harnessTraceHeaders(trace: HarnessTraceContext): Headers {
  const supportCode = trace.traceId.replaceAll("-", "").slice(-8).toUpperCase();
  return new Headers({
    "x-trace-id": trace.traceId,
    "x-run-id": trace.runId,
    "x-operation-id": trace.operationId ?? trace.runId,
    "x-release-id": trace.releaseId,
    "x-support-code": supportCode,
    "x-harness-release-id": trace.releaseId,
    ...(trace.turnId ? { "x-turn-id": trace.turnId } : {}),
    ...(trace.toolCallId ? { "x-tool-call-id": trace.toolCallId } : {}),
  });
}

/**
 * Provenance keys admitted past the free-text denylist below. Membership is the
 * whole lowercased key, never a prefix, and it does not relax the value
 * constraints that follow — an allowlisted key still crosses only as a bounded
 * scalar or array.
 *
 * A key qualifies only when its value is a one-way digest, an opaque version
 * label, or a finite count: none of those can carry customer text, which is what
 * the denylist exists to stop. `prompt_digest` and `input_tokens` would
 * otherwise be dropped for matching `prompt` and `token`, leaving a model call
 * that decides a price with no record of which prompt or schema produced it.
 *
 * Widening this set requires updating `P29-harness-metadata-allowlist`, whose
 * closed-set case fails on any key added here alone.
 */
export const HARNESS_METADATA_ALLOWLIST: ReadonlySet<string> = new Set([
  "charter_version",
  "prompt_digest",
  "prompt_section_digests",
  "schema_id",
  "schema_digest",
  "prefix_stable",
  "max_output_tokens",
  "temperature",
  "effort",
  "input_tokens",
  "output_tokens",
  "cache_hit_tokens",
  "cache_miss_tokens",
]);

export function sanitizeHarnessMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const normalized = key.toLowerCase();
    if (
      !HARNESS_METADATA_ALLOWLIST.has(normalized) &&
      /token|secret|password|authorization|email|phone|address|description|content|prompt|image|audio|transcript|latitude|longitude|cccd|bank|message|text|question|answer|query|title|name|url|uri|unit|floor|street|ward|postal|zip|otp/iu.test(normalized)
    ) continue;
    const safeKey = safeMetadataString(key, 80);
    if (!safeKey) continue;
    if (value === null || typeof value === "boolean") safe[safeKey] = value;
    else if (typeof value === "number" && Number.isFinite(value)) safe[safeKey] = value;
    else if (typeof value === "string") {
      const safeValue = safeMetadataString(value, 120);
      if (safeValue) safe[safeKey] = safeValue;
    }
    else if (Array.isArray(value)) {
      safe[safeKey] = value.slice(0, 20).flatMap((item) => {
        if (item === null || typeof item === "boolean") return [item];
        if (typeof item === "number" && Number.isFinite(item)) return [item];
        if (typeof item === "string") {
          const safeValue = safeMetadataString(item, 120);
          return safeValue ? [safeValue] : [];
        }
        return [];
      });
    }
  }
  return safe;
}

function safeMetadataString(value: string, maxLength: number): string | null {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength && /^[A-Za-z0-9._:-]+$/u.test(normalized)
    ? normalized
    : null;
}

export async function hashHarnessIdentifier(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function validUuid(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(normalized)
    ? normalized
    : null;
}

function validHash(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[0-9a-f]{64}$/u.test(normalized) ? normalized : null;
}

function normalizeEnvironment(value: string): string {
  return ["local", "preview", "staging", "production"].includes(value)
    ? value
    : "local";
}

function boundedText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function boundedAttempt(value: number | undefined): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? Math.min(value!, 10) : 1;
}

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function finiteInteger(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}
