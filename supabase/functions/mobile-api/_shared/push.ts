import { checkRateLimit, type RateLimitConfig } from "./rate-limit.ts";

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

export type PushDbClient = {
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
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;
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
): Promise<PushResult> {
  return sendPushToUsers(client, [userId], payload);
}

export async function sendPushToUsers(
  client: PushDbClient,
  userIds: string[],
  payload: PushPayload,
): Promise<PushResult> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return emptyResult();

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
  if (allowedUserIds.length === 0) return result;

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
    return {
      delivered: result.delivered,
      failed: result.failed + allowedUserIds.length,
      errors: [...result.errors, "TOKEN_LOOKUP_FAILED"],
    };
  }

  const rows = (tokenResult.data ?? [])
    .map(asPushTokenRow)
    .filter((row): row is PushTokenRow => row !== null);
  for (const batch of chunk(rows, EXPO_BATCH_SIZE)) {
    const batchResult = await sendExpoBatch(client, batch, payload);
    result.delivered += batchResult.delivered;
    result.failed += batchResult.failed;
    result.errors.push(...batchResult.errors);
  }
  return result;
}

// Phase 4.3 (plan §22.9.D, 2026-05-23): bounded retry for Expo push delivery.
// 2 retries, backoff 500ms -> 2s -> 8s (cap 10s). Retry only on
// EXPO_REQUEST_FAILED or HTTP 5xx. Skip retry on HTTP 4xx and per-ticket
// DeviceNotRegistered (those are stable failures that disable token).
const EXPO_PUSH_MAX_ATTEMPTS = 3;
const EXPO_PUSH_BACKOFF_MS = [500, 2_000, 8_000];

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
    response = await withTimeout(
      fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      }),
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

  const parsed = await response.json().catch(() => null);
  const tickets = Array.isArray(parsed?.data) ? parsed.data : [];
  const result = emptyResult();
  rows.forEach((row, index) => {
    const ticket = tickets[index];
    if (ticket?.status === "ok") {
      result.delivered += 1;
      return;
    }

    result.failed += 1;
    const errorCode = typeof ticket?.details?.error === "string"
      ? ticket.details.error
      : "UNKNOWN_PUSH_ERROR";
    result.errors.push(errorCode);
    if (errorCode === "DeviceNotRegistered") {
      void disablePushToken(client, row.id);
    }
  });
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

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function emptyResult(): PushResult {
  return { delivered: 0, failed: 0, errors: [] };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
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
