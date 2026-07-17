import {
  failureKindForCode,
  type CircuitFailure,
  type FailureKind,
} from "./circuit-breaker.ts";
import type {
  AIProvider,
  EdgeGuardClient,
  KaelPurpose,
} from "../types.ts";

const GUARD_RPC_TIMEOUT_MS = 2_000;
const RPC_TIMEOUT = Symbol("guard_rpc_timeout");

const KAEL_CHAT_RATE_CONFIG = Object.freeze({
  buckets: Object.freeze([
    Object.freeze({
      name: "minute",
      max_tokens: 5,
      refill_rate: 5,
      refill_interval_ms: 60_000,
    }),
    Object.freeze({
      name: "hour",
      max_tokens: 20,
      refill_rate: 20,
      refill_interval_ms: 3_600_000,
    }),
  ]),
});

export type DurableRateVerdict = {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
  readonly reason: "minute" | "hour" | null;
};

export async function isDurableCircuitOpen(
  client: EdgeGuardClient | null | undefined,
  purpose: KaelPurpose,
  provider: AIProvider,
): Promise<boolean> {
  const result = await runGuardRpc(client, "is_circuit_open", {
    p_scope: "purpose_provider",
    p_key: purposeProviderKey(purpose, provider),
  });
  if (!result) return false;
  const row = firstRow(result.data);
  if (typeof row === "boolean") return row;
  if (isRecord(row) && typeof row.is_open === "boolean") return row.is_open;
  warnGuardFailOpen("is_circuit_open", "unparsed");
  return false;
}

export async function recordDurableCircuitFailure(
  client: EdgeGuardClient | null | undefined,
  failure: CircuitFailure,
): Promise<void> {
  const kind = failure.kind ?? failureKindForCode(failure.errorCode);
  if (!kind) return;
  const location = circuitLocation(failure.purpose, failure.provider, kind);
  await runGuardRpc(client, "record_circuit_failure", {
    p_scope: location.scope,
    p_key: location.key,
    p_kind: kind,
    ...(failure.now ? { p_now: failure.now.toISOString() } : {}),
  });
}

export async function recordDurableCircuitSuccess(
  client: EdgeGuardClient | null | undefined,
  purpose: KaelPurpose,
  provider: AIProvider,
): Promise<void> {
  await runGuardRpc(client, "record_circuit_success", {
    p_scope: "purpose_provider",
    p_key: purposeProviderKey(purpose, provider),
  });
}

export async function takeDurableKaelChatRateLimit(
  client: EdgeGuardClient | null | undefined,
  key: string,
): Promise<DurableRateVerdict> {
  const result = await runGuardRpc(client, "rate_take", {
    p_scope: "kael_chat",
    p_key: key,
    p_cost: 1,
    p_config: KAEL_CHAT_RATE_CONFIG,
  });
  if (!result) return allowedRateVerdict();

  const row = firstRow(result.data);
  if (!isRecord(row) || typeof row.allowed !== "boolean") {
    warnGuardFailOpen("rate_take", "unparsed");
    return allowedRateVerdict();
  }
  return {
    allowed: row.allowed,
    retryAfterMs: nonNegativeInteger(row.retry_after_ms),
    reason: row.reason === "minute" || row.reason === "hour"
      ? row.reason
      : null,
  };
}

function circuitLocation(
  purpose: KaelPurpose,
  provider: AIProvider,
  kind: FailureKind,
): { scope: "purpose_provider" | "provider"; key: string } {
  return kind === "credit" || kind === "rate_limit"
    ? { scope: "provider", key: provider }
    : { scope: "purpose_provider", key: purposeProviderKey(purpose, provider) };
}

function purposeProviderKey(
  purpose: KaelPurpose,
  provider: AIProvider,
): string {
  return `${purpose}:${provider}`;
}

async function runGuardRpc(
  client: EdgeGuardClient | null | undefined,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: unknown } | null> {
  if (!client?.rpc) {
    warnGuardFailOpen(fn, "no_rpc");
    return null;
  }
  try {
    const result = await withTimeout(
      client.rpc(fn, args),
      GUARD_RPC_TIMEOUT_MS,
    );
    if (result === RPC_TIMEOUT) {
      warnGuardFailOpen(fn, "timeout");
      return null;
    }
    if (result.error) {
      warnGuardFailOpen(fn, safeErrCode(result.error));
      return null;
    }
    return result;
  } catch (error) {
    warnGuardFailOpen(fn, safeErrCode(error));
    return null;
  }
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
): Promise<T | typeof RPC_TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof RPC_TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(RPC_TIMEOUT), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function firstRow(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data;
}

function allowedRateVerdict(): DurableRateVerdict {
  return { allowed: true, retryAfterMs: 0, reason: null };
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeErrCode(error: unknown): string {
  if (isRecord(error) && typeof error.code === "string") return error.code;
  return error instanceof Error ? error.name : "unknown";
}

function warnGuardFailOpen(guard: string, errorCode: string): void {
  console.warn("Kael durable guard unavailable; failing open", {
    guard,
    errorCode,
  });
}
