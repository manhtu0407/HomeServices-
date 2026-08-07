import { checkRateLimit, type RateLimitConfig } from "./rate-limit.ts";
import {
  createBufferedResponse,
  readResponseBytesBounded,
  readResponseJsonBounded,
} from "../../../_shared/network.ts";
import { boundedCanonicalProviderCode } from "./provider-boundary.ts";
import {
  acquireDependencyPermit,
  completeHarnessIdempotency,
  failHarnessIdempotency,
  hashReliabilityValue,
  markHarnessIdempotencyReconcileRequired,
  recordDependencyResult,
  reserveHarnessIdempotency,
  startHarnessIdempotencyExecution,
  type ReliabilityClient,
} from "../../../_shared/harness/reliability.ts";

type DbError = { code?: string; message?: string };
type DbResult<T> = {
  data: T | null;
  error: DbError | null;
  count?: number | null;
};
type QueryLike = PromiseLike<DbResult<unknown>>;

type Chain = {
  select(columns?: string, options?: unknown): Chain;
  update(value: unknown): Chain;
  eq(column: string, value: unknown): Chain;
  in(column: string, value: unknown[]): Chain;
  maybeSingle(): QueryLike;
  then<TResult1 = DbResult<unknown>, TResult2 = never>(
    onfulfilled?:
      | ((value: DbResult<unknown>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

export type PushDbClient = ReliabilityClient & {
  from(table: string): Chain;
};

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: "default" | null;
  badge?: number;
};

export type PushResult = {
  delivered: number;
  failed: number;
  errors: string[];
  replayed?: boolean;
  degraded?: boolean;
};

export type PushDeliveryOptions = {
  environment?: string;
  releaseId?: string;
  operationId?: string;
  idempotencyKey?: string;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;
const EXPO_PUSH_MAX_RESPONSE_BYTES = 1024 * 1024;
const EXPO_TICKET_ERROR_MAX_LENGTH = 64;
const PUSH_RATE_LIMIT: RateLimitConfig = {
  maxTokens: 5,
  refillRate: 5,
  refillIntervalMs: 60_000,
};

type PushTokenRow = {
  id: string;
  user_id: string;
  push_token: string;
};

export async function sendPushToUser(
  client: PushDbClient,
  userId: string,
  payload: PushPayload,
  options: PushDeliveryOptions = {},
): Promise<PushResult> {
  return sendPushToUsers(client, [userId], payload, options);
}

export async function sendPushToUsers(
  client: PushDbClient,
  userIds: string[],
  payload: PushPayload,
  options: PushDeliveryOptions = {},
): Promise<PushResult> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean))).sort();
  if (uniqueUserIds.length === 0) return emptyResult();

  const environment = options.environment ?? readRuntimeEnv("NESTSCOUT_ENVIRONMENT") ?? "local";
  const releaseId = options.releaseId ?? readRuntimeEnv("HARNESS_RELEASE_ID") ?? "unreleased";
  const operationId = options.operationId ?? "push.send";
  const idempotencyKey = options.idempotencyKey ?? await derivedPushIdempotencyKey(
    uniqueUserIds,
    payload,
  );
  const reservation = await reserveHarnessIdempotency(client, {
    environment,
    releaseId,
    operationId,
    actorId: null,
    idempotencyKey,
    requestFingerprint: canonicalJson({ recipients: uniqueUserIds, payload }),
  });
  if (reservation.state === "completed") {
    return { ...emptyResult(), replayed: true };
  }
  if (reservation.state === "in_progress") {
    return {
      delivered: 0,
      failed: uniqueUserIds.length,
      errors: ["IDEMPOTENCY_IN_PROGRESS"],
      replayed: true,
      degraded: true,
    };
  }
  if (reservation.state === "reconcile_required") {
    return {
      delivered: 0,
      failed: uniqueUserIds.length,
      errors: ["IDEMPOTENCY_RECONCILE_REQUIRED"],
      replayed: true,
      degraded: true,
    };
  }
  if (reservation.state === "conflict") {
    return { delivered: 0, failed: uniqueUserIds.length, errors: ["IDEMPOTENCY_CONFLICT"] };
  }
  if (reservation.state === "unavailable" && environment !== "local") {
    return {
      delivered: 0,
      failed: uniqueUserIds.length,
      errors: ["IDEMPOTENCY_UNAVAILABLE"],
      degraded: true,
    };
  }
  const reservationId = reservation.state === "reserved"
    ? reservation.reservationId
    : null;
  const permit = await acquireDependencyPermit(client, {
    dependency: "push",
    environment,
  });
  if (!permit.allowed) {
    await failHarnessIdempotency(client, reservationId, "PUSH_CIRCUIT_OPEN");
    return {
      delivered: 0,
      failed: uniqueUserIds.length,
      errors: ["PUSH_CIRCUIT_OPEN"],
      degraded: true,
    };
  }

  const allowedUserIds: string[] = [];
  const result = emptyResult();
  for (const userId of uniqueUserIds) {
    const rate = checkRateLimit(`push:${userId}`, PUSH_RATE_LIMIT);
    if (rate.allowed) {
      allowedUserIds.push(userId);
    } else {
      result.failed += 1;
      result.errors.push("RATE_LIMITED");
    }
  }
  if (allowedUserIds.length === 0) {
    await failHarnessIdempotency(client, reservationId, "RATE_LIMITED");
    return result;
  }

  const tokenResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("device_push_tokens")
      .select("id, user_id, push_token")
      .in("user_id", allowedUserIds)
      .eq("enabled", true)
      .eq("permission_status", "granted"),
  );
  if (tokenResult.error) {
    console.warn("mobile-api push token lookup failed", {
      errorCode: tokenResult.error.code,
    });
    await failHarnessIdempotency(client, reservationId, "TOKEN_LOOKUP_FAILED");
    return {
      delivered: result.delivered,
      failed: result.failed + allowedUserIds.length,
      errors: [...result.errors, "TOKEN_LOOKUP_FAILED"],
      degraded: true,
    };
  }

  const rows = (tokenResult.data ?? [])
    .map(asPushTokenRow)
    .filter((row): row is PushTokenRow => row !== null);
  if (reservationId) {
    const started = await startHarnessIdempotencyExecution(client, reservationId);
    if (!started) {
      await failHarnessIdempotency(client, reservationId, "IDEMPOTENCY_EXECUTION_UNAVAILABLE");
      return {
        delivered: result.delivered,
        failed: result.failed + allowedUserIds.length,
        errors: [...result.errors, "IDEMPOTENCY_EXECUTION_UNAVAILABLE"],
        degraded: true,
      };
    }
  }
  for (const batch of chunk(rows, EXPO_BATCH_SIZE)) {
    const batchResult = await sendExpoBatch(client, batch, payload);
    result.delivered += batchResult.delivered;
    result.failed += batchResult.failed;
    result.errors.push(...batchResult.errors);
  }
  const dependencyFailure = result.errors.some((code) =>
    code === "EXPO_REQUEST_FAILED" || /^HTTP_5\d\d$/.test(code)
  );
  await recordDependencyResult(client, {
    dependency: "push",
    environment,
    releaseId,
    success: !dependencyFailure,
    errorCode: dependencyFailure ? result.errors[0] ?? "PUSH_FAILED" : null,
    probeToken: permit.probeToken,
  });
  if (dependencyFailure) {
    await markHarnessIdempotencyReconcileRequired(
      client,
      reservationId,
      result.errors[0] ?? "PUSH_FAILED",
    );
    return { ...result, degraded: true };
  }
  if (reservationId) {
    const completed = await completeHarnessIdempotency(
      client,
      reservationId,
      canonicalJson(result),
    );
    if (!completed) {
      await markHarnessIdempotencyReconcileRequired(
        client,
        reservationId,
        "IDEMPOTENCY_COMMIT_FAILED",
      );
      result.errors.push("IDEMPOTENCY_COMMIT_FAILED");
      result.degraded = true;
    }
  }
  return result;
}

// Bounded retry for Expo push delivery.
// 2 retries, with 500ms then 2s backoff. Retry only on
// EXPO_REQUEST_FAILED or HTTP 5xx. Skip retry on HTTP 4xx and per-ticket
// DeviceNotRegistered (those are stable failures that disable token).
const EXPO_PUSH_MAX_ATTEMPTS = 3;
const EXPO_PUSH_BACKOFF_MS = [500, 2_000];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendExpoBatch(
  client: PushDbClient,
  rows: PushTokenRow[],
  payload: PushPayload,
): Promise<PushResult> {
  if (rows.length === 0) return emptyResult();

  let attempt = 0;
  let lastResult: PushResult = emptyResult();
  while (attempt < EXPO_PUSH_MAX_ATTEMPTS) {
    const attemptResult = await sendExpoBatchOnce(client, rows, payload);
    const shouldRetry =
      attemptResult.delivered === 0 &&
      attemptResult.errors.some(
        (code) => code === "EXPO_REQUEST_FAILED" || /^HTTP_5\d\d$/.test(code),
      ) &&
      attempt + 1 < EXPO_PUSH_MAX_ATTEMPTS;
    lastResult = attemptResult;
    if (!shouldRetry) {
      if (attempt > 0) {
        console.warn("mobile-api Expo push retried", { attempts: attempt + 1, errors: attemptResult.errors });
      }
      return attemptResult;
    }
    const backoff = EXPO_PUSH_BACKOFF_MS[attempt] ?? EXPO_PUSH_BACKOFF_MS[EXPO_PUSH_BACKOFF_MS.length - 1];
    await sleep(backoff);
    attempt += 1;
  }
  return lastResult;
}

async function sendExpoBatchOnce(
  client: PushDbClient,
  rows: PushTokenRow[],
  payload: PushPayload,
): Promise<PushResult> {
  const messages = rows.map((row) => ({
    to: row.push_token,
    title: payload.title,
    body: payload.body,
    data: payload.data ? safePushData(payload.data) : undefined,
    sound: payload.sound ?? undefined,
    badge: payload.badge,
  }));

  let response: Response;
  try {
    response = await fetchWithTimeout(
      EXPO_PUSH_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      },
      10_000,
    );
  } catch {
    console.warn("mobile-api Expo push request failed", { count: rows.length });
    return {
      delivered: 0,
      failed: rows.length,
      errors: ["EXPO_REQUEST_FAILED"],
    };
  }

  if (!response.ok) {
    console.warn("mobile-api Expo push HTTP failure", { status: response.status });
    return {
      delivered: 0,
      failed: rows.length,
      errors: [`HTTP_${response.status}`],
    };
  }

  const parsed = await readResponseJsonBounded(
    response,
    EXPO_PUSH_MAX_RESPONSE_BYTES,
  ).catch(() => null);
  const envelope = asRecord(parsed);
  const tickets = Array.isArray(envelope?.data) ? envelope.data : [];
  const result = emptyResult();
  const tokenDisableWrites: Promise<void>[] = [];
  rows.forEach((row, index) => {
    const ticket = asRecord(tickets[index]);
    if (ticket?.status === "ok") {
      result.delivered += 1;
      return;
    }

    result.failed += 1;
    const providerErrorCode = boundedCanonicalProviderCode(
      asRecord(ticket?.details)?.error,
      EXPO_TICKET_ERROR_MAX_LENGTH,
    );
    const errorCode = providerErrorCode ?? "UNKNOWN_PUSH_ERROR";
    result.errors.push(errorCode);
    if (errorCode === "DeviceNotRegistered") {
      tokenDisableWrites.push(disablePushToken(client, row.id));
    }
  });
  await Promise.all(tokenDisableWrites);
  return result;
}

async function disablePushToken(client: PushDbClient, tokenId: string) {
  const disabled = await dbQuery(
    client
      .from("device_push_tokens")
      .update({
        enabled: false,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", tokenId)
      .select("id")
      .maybeSingle(),
  );
  if (disabled.error) {
    console.warn("mobile-api stale push token disable failed", {
      tokenId,
      errorCode: disabled.error.code,
    });
  }
}

function safePushData(data: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    safe[key.slice(0, 64)] = String(value).slice(0, 500);
  }
  return safe;
}

function asPushTokenRow(row: Record<string, unknown>): PushTokenRow | null {
  const id = typeof row.id === "string" ? row.id : "";
  const userId = typeof row.user_id === "string" ? row.user_id : "";
  const pushToken = typeof row.push_token === "string" ? row.push_token : "";
  if (!id || !userId || !pushToken) return null;
  return { id, user_id: userId, push_token: pushToken };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function derivedPushIdempotencyKey(
  userIds: string[],
  payload: PushPayload,
): Promise<string> {
  return `push:${await hashReliabilityValue(canonicalJson({ userIds, payload }))}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function readRuntimeEnv(name: string): string | undefined {
  try {
    return typeof Deno !== "undefined" ? Deno.env.get(name) : undefined;
  } catch {
    return undefined;
  }
}

function emptyResult(): PushResult {
  return { delivered: 0, failed: 0, errors: [] };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timeout after ${ms}ms`));
    }, ms);
  });
  try {
    const response = await Promise.race([
      fetch(url, {
        ...init,
        redirect: "error",
        signal: controller.signal,
      }),
      timeout,
    ]);
    const bytes = await Promise.race([
      readResponseBytesBounded(response, EXPO_PUSH_MAX_RESPONSE_BYTES),
      timeout,
    ]);
    return createBufferedResponse(response, bytes);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function dbQuery<T = unknown>(
  promise: QueryLike,
  ms = 10_000,
): Promise<DbResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DB timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]) as DbResult<T>;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
