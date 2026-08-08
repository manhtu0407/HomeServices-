export type HarnessTraceClient = {
  rpc?(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export type HarnessTraceContext = Readonly<{
  traceId: string;
  runId: string;
  parentRunId: string | null;
  turnId: string | null;
  toolCallId: string | null;
  parentEventId: string | null;
  actorIdHash: string | null;
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
  readonly parentRunId?: string | null;
  readonly turnId?: string | null;
  readonly toolCallId?: string | null;
  readonly parentEventId?: string | null;
  readonly actorIdHash?: string | null;
  readonly jobId?: string | null;
  readonly releaseId: string;
  readonly environment: string;
  readonly client?: HarnessTraceClient;
  readonly now?: number;
}): HarnessTraceContext {
  const header = (name: string) => input.request?.headers.get(name) ?? null;
  return Object.freeze({
    traceId: validUuid(input.traceId ?? header("x-trace-id") ?? header("x-harness-trace-id") ?? header("x-request-id")) ?? crypto.randomUUID(),
    runId: validUuid(input.runId ?? header("x-run-id") ?? header("x-harness-run-id")) ?? crypto.randomUUID(),
    parentRunId: validUuid(input.parentRunId ?? header("x-parent-run-id") ?? header("x-harness-parent-run-id")),
    turnId: validUuid(input.turnId ?? header("x-turn-id") ?? header("x-harness-turn-id")),
    toolCallId: validUuid(input.toolCallId ?? header("x-tool-call-id") ?? header("x-harness-tool-call-id")),
    parentEventId: validUuid(input.parentEventId ?? header("x-parent-event-id") ?? header("x-harness-parent-event-id")),
    actorIdHash: validHash(input.actorIdHash),
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
    readonly jobId?: string | null;
    readonly client?: HarnessTraceClient;
  },
): Promise<HarnessTraceContext> {
  return Object.freeze({
    ...trace,
    actorIdHash: await hashHarnessIdentifier(input.actorId),
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
    readonly actorRole: string | null;
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
      p_actor_role: input.actorRole,
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
  return new Headers({
    "x-trace-id": trace.traceId,
    "x-run-id": trace.runId,
    "x-harness-release-id": trace.releaseId,
    ...(trace.turnId ? { "x-turn-id": trace.turnId } : {}),
    ...(trace.toolCallId ? { "x-tool-call-id": trace.toolCallId } : {}),
  });
}

export function sanitizeHarnessMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const normalized = key.toLowerCase();
    if (/token|secret|password|authorization|email|phone|address|description|content|prompt|image|audio|transcript|latitude|longitude|cccd|bank|message|text|question|answer|query|title|name|url|uri|unit|floor|street|ward|postal|zip|otp/iu.test(normalized)) continue;
    if (value === null || typeof value === "boolean") safe[key.slice(0, 80)] = value;
    else if (typeof value === "number" && Number.isFinite(value)) safe[key.slice(0, 80)] = value;
    else if (typeof value === "string") safe[key.slice(0, 80)] = value.slice(0, 240);
    else if (Array.isArray(value)) {
      safe[key.slice(0, 80)] = value.slice(0, 20).filter((item) =>
        item === null || ["string", "number", "boolean"].includes(typeof item)
      ).map((item) => typeof item === "string" ? item.slice(0, 120) : item);
    }
  }
  return safe;
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
