import {
  HARNESS_RELIABILITY_CONFIG,
  type HarnessDependency,
  type HarnessOperationClass,
} from "./reliability-registry.ts";

export type ReliabilityClient = {
  rpc?(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export type IdempotencyReservation =
  | { state: "reserved"; reservationId: string }
  | { state: "in_progress"; reservationId: string }
  | { state: "completed"; reservationId: string; responseHash: string | null }
  | { state: "reconcile_required"; reservationId: string }
  | { state: "conflict"; reservationId: null }
  | { state: "unavailable"; reservationId: null };

export function reliabilityPolicyForOperation(operationClass: HarnessOperationClass) {
  return HARNESS_RELIABILITY_CONFIG.operation_classes[operationClass];
}

export function degradedModeFor(reason: keyof typeof HARNESS_RELIABILITY_CONFIG.degraded_modes): string {
  return HARNESS_RELIABILITY_CONFIG.degraded_modes[reason];
}

export async function hashReliabilityValue(
  value: string | Uint8Array,
): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", copyToArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function validateIdempotencyKey(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!/^[A-Za-z0-9._:-]{16,160}$/.test(normalized)) return null;
  return normalized;
}

export async function reserveHarnessIdempotency(
  client: ReliabilityClient | null | undefined,
  input: {
    environment: string;
    releaseId: string;
    operationId: string;
    actorId: string | null;
    idempotencyKey: string;
    requestFingerprint: string | Uint8Array;
  },
): Promise<IdempotencyReservation> {
  if (!client?.rpc) return { state: "unavailable", reservationId: null };
  const keyHash = await hashReliabilityValue(input.idempotencyKey);
  const requestHash = await hashReliabilityValue(input.requestFingerprint);
  try {
    const { data, error } = await client.rpc("reserve_harness_idempotency", {
      p_environment: input.environment,
      p_release_id: input.releaseId,
      p_operation_id: input.operationId,
      p_actor_id_hash: input.actorId ? await hashReliabilityValue(input.actorId) : null,
      p_key_hash: keyHash,
      p_request_hash: requestHash,
      p_ttl_seconds: HARNESS_RELIABILITY_CONFIG.reservation_ttl_seconds,
    });
    if (error) return { state: "unavailable", reservationId: null };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") return { state: "unavailable", reservationId: null };
    const candidate = row as Record<string, unknown>;
    const state = candidate.state;
    const reservationId = typeof candidate.reservation_id === "string"
      ? candidate.reservation_id
      : null;
    if (state === "conflict") return { state, reservationId: null };
    if (!reservationId || ![
      "reserved",
      "in_progress",
      "completed",
      "reconcile_required",
    ].includes(String(state))) {
      return { state: "unavailable", reservationId: null };
    }
    if (state === "completed") {
      return {
        state,
        reservationId,
        responseHash: typeof candidate.response_hash === "string"
          ? candidate.response_hash
          : null,
      };
    }
    return {
      state: state as "reserved" | "in_progress" | "reconcile_required",
      reservationId,
    };
  } catch {
    return { state: "unavailable", reservationId: null };
  }
}


export async function startHarnessIdempotencyExecution(
  client: ReliabilityClient | null | undefined,
  reservationId: string | null,
): Promise<boolean> {
  if (!client?.rpc || !reservationId) return false;
  try {
    const { data, error } = await client.rpc(
      "start_harness_idempotency_execution",
      { p_reservation_id: reservationId },
    );
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function markHarnessIdempotencyReconcileRequired(
  client: ReliabilityClient | null | undefined,
  reservationId: string | null,
  errorCode: string,
): Promise<void> {
  if (!client?.rpc || !reservationId) return;
  try {
    await client.rpc("mark_harness_idempotency_reconcile_required", {
      p_reservation_id: reservationId,
      p_error_code: errorCode.slice(0, 120),
    });
  } catch {
    // A previously started side effect remains blocked by the executing lease.
  }
}

export async function completeHarnessIdempotency(
  client: ReliabilityClient | null | undefined,
  reservationId: string | null,
  responseFingerprint: string,
): Promise<boolean> {
  if (!client?.rpc || !reservationId) return false;
  const responseHash = await hashReliabilityValue(responseFingerprint);
  try {
    const { data, error } = await client.rpc("complete_harness_idempotency", {
      p_reservation_id: reservationId,
      p_response_hash: responseHash,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function failHarnessIdempotency(
  client: ReliabilityClient | null | undefined,
  reservationId: string | null,
  errorCode: string,
): Promise<void> {
  if (!client?.rpc || !reservationId) return;
  try {
    await client.rpc("fail_harness_idempotency", {
      p_reservation_id: reservationId,
      p_error_code: errorCode.slice(0, 120),
    });
  } catch {
    // The original operation failure remains authoritative.
  }
}

export type DependencyPermit = {
  allowed: boolean;
  state: "closed" | "open" | "half_open";
  retryAfterMs: number;
  probeToken: string | null;
};

export async function acquireDependencyPermit(
  client: ReliabilityClient | null | undefined,
  input: { dependency: HarnessDependency; environment: string },
): Promise<DependencyPermit> {
  if (input.environment === "local") {
    return { allowed: true, state: "closed", retryAfterMs: 0, probeToken: null };
  }
  if (!client?.rpc) {
    return { allowed: false, state: "open", retryAfterMs: 30_000, probeToken: null };
  }
  const policy = HARNESS_RELIABILITY_CONFIG.dependencies[input.dependency];
  try {
    const { data, error } = await client.rpc("acquire_harness_dependency_permit", {
      p_dependency: input.dependency,
      p_environment: input.environment,
      p_half_open_probes: policy.half_open_probes,
      p_probe_ttl_seconds: Math.max(5, Math.ceil(policy.open_ms / 1000)),
    });
    if (error) return unavailableDependencyPermit(input.environment);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") return unavailableDependencyPermit(input.environment);
    const candidate = row as Record<string, unknown>;
    const state = ["closed", "open", "half_open"].includes(String(candidate.state))
      ? candidate.state as DependencyPermit["state"]
      : "open";
    const retryAfterMs = Number(candidate.retry_after_ms);
    return {
      allowed: candidate.allowed === true,
      state,
      retryAfterMs: Number.isFinite(retryAfterMs) ? Math.max(retryAfterMs, 0) : 30_000,
      probeToken: typeof candidate.probe_token === "string" ? candidate.probe_token : null,
    };
  } catch {
    return unavailableDependencyPermit(input.environment);
  }
}

function unavailableDependencyPermit(environment: string): DependencyPermit {
  return environment === "local"
    ? { allowed: true, state: "closed", retryAfterMs: 0, probeToken: null }
    : { allowed: false, state: "open", retryAfterMs: 30_000, probeToken: null };
}

export async function dependencyCircuitState(
  client: ReliabilityClient | null | undefined,
  input: { dependency: HarnessDependency; environment: string },
): Promise<{ state: "closed" | "open" | "half_open"; retryAfterMs: number }> {
  const permit = await acquireDependencyPermit(client, input);
  return { state: permit.state, retryAfterMs: permit.retryAfterMs };
}

export async function recordDependencyResult(
  client: ReliabilityClient | null | undefined,
  input: {
    dependency: HarnessDependency;
    environment: string;
    releaseId: string;
    success: boolean;
    errorCode?: string | null;
    probeToken?: string | null;
  },
): Promise<void> {
  if (!client?.rpc) return;
  const policy = HARNESS_RELIABILITY_CONFIG.dependencies[input.dependency];
  try {
    await client.rpc("record_harness_dependency_result", {
      p_dependency: input.dependency,
      p_environment: input.environment,
      p_release_id: input.releaseId,
      p_success: input.success,
      p_error_code: input.errorCode?.slice(0, 120) ?? null,
      p_threshold: policy.threshold,
      p_window_ms: policy.window_ms,
      p_open_ms: policy.open_ms,
      p_half_open_probes: policy.half_open_probes,
      p_probe_token: input.probeToken ?? null,
    });
  } catch {
    // Dependency result logging is best-effort; caller behavior stays fail-closed.
  }
}
