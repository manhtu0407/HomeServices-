import { checkRateLimit, type RateLimitConfig } from "./rate-limit.ts";
import {
  readResponseJsonBounded,
} from "../../../_shared/network.ts";
import { fetchPushProviderWithTimeout } from "./push-http.ts";
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
  submitted: number;
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
  matchingDeliveryId?: string;
};

export type PushReceiptReconciliationResult = {
  checked: number;
  providerHandoffs: number;
  failed: number;
  staleTokenReceipts: number;
  tokensDisabled: number;
  unresolved: number;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const EXPO_BATCH_SIZE = 100;
const EXPO_RECEIPT_BATCH_SIZE = 50;
const EXPO_PUSH_MAX_RESPONSE_BYTES = 1024 * 1024;
const EXPO_TICKET_ERROR_MAX_LENGTH = 64;
const EXPO_TICKET_ID_MAX_LENGTH = 200;
const PUSH_RATE_LIMIT: RateLimitConfig = {
  maxTokens: 5,
  refillRate: 5,
  refillIntervalMs: 60_000,
};

type PushTokenRow = {
  id: string;
  user_id: string;
  push_token: string;
  updated_at: string;
};

type MatchingPushReceiptClaim = {
  providerTicketRowId: string;
  providerTicketId: string;
};

export async function sendPushToUser(
  client: PushDbClient,
  userId: string,
  payload: PushPayload,
  options: PushDeliveryOptions = {},
): Promise<PushResult> {
  return sendPushToUsers(client, [userId], payload, options);
}

type PushDependencyPermit = Awaited<ReturnType<typeof acquireDependencyPermit>>;
type PreparedPushDelivery = {
  client: PushDbClient;
  payload: PushPayload;
  environment: string;
  releaseId: string;
  reservationId: string | null;
  permit: PushDependencyPermit;
  allowedUserIds: string[];
  matchingDeliveryId: string | null;
  result: PushResult;
};

export async function sendPushToUsers(
  client: PushDbClient,
  userIds: string[],
  payload: PushPayload,
  options: PushDeliveryOptions = {},
): Promise<PushResult> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean))).sort();
  if (uniqueUserIds.length === 0) return emptyResult();

  const prepared = await preparePushDelivery(client, uniqueUserIds, payload, options);
  if ("submitted" in prepared) return prepared;
  const tokenResult = await loadPushTokens(client, prepared.allowedUserIds);
  if (tokenResult.error) return await pushTokenLookupFailure(prepared, tokenResult.error);
  const rows = (tokenResult.data ?? [])
    .map(asPushTokenRow)
    .filter((row): row is PushTokenRow => row !== null);
  if (prepared.reservationId && !(await startPushIdempotency(prepared))) {
    await failHarnessIdempotency(
      client,
      prepared.reservationId,
      "IDEMPOTENCY_EXECUTION_UNAVAILABLE",
    );
    return {
      submitted: prepared.result.submitted,
      failed: prepared.result.failed + prepared.allowedUserIds.length,
      errors: [...prepared.result.errors, "IDEMPOTENCY_EXECUTION_UNAVAILABLE"],
      degraded: true,
    };
  }
  const result = await deliverPushBatches(
    client,
    rows,
    payload,
    prepared.matchingDeliveryId,
    prepared.result,
  );
  return settlePushDelivery(prepared, result);
}

export async function reconcileMatchingPushReceipts(
  client: PushDbClient,
  dispatcherId: string,
): Promise<PushReceiptReconciliationResult> {
  const result = emptyReceiptReconciliationResult();
  if (!client.rpc || !dispatcherId) return result;

  // The dispatcher id names the maintainer, not a recipient: the claim spans every recipient.
  let claimResult: { data: unknown; error: unknown };
  try {
    claimResult = await client.rpc("claim_due_matching_push_provider_tickets", {
      p_limit: EXPO_RECEIPT_BATCH_SIZE,
    });
  } catch {
    console.warn("mobile-api push receipt claim failed", { dispatcherId });
    return result;
  }
  if (claimResult.error) {
    console.warn("mobile-api push receipt claim failed", { dispatcherId });
    return result;
  }

  const claims = (Array.isArray(claimResult.data) ? claimResult.data : [])
    .map(asMatchingPushReceiptClaim)
    .filter((claim): claim is MatchingPushReceiptClaim => claim !== null);
  result.checked = claims.length;
  if (claims.length === 0) return result;

  let response: Response;
  try {
    response = await fetchPushProviderWithTimeout(
      EXPO_PUSH_RECEIPTS_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: claims.map((claim) => claim.providerTicketId) }),
      },
      10_000,
      EXPO_PUSH_MAX_RESPONSE_BYTES,
    );
  } catch {
    console.warn("mobile-api Expo push receipt request failed", { count: claims.length });
    result.unresolved = claims.length;
    return result;
  }
  if (!response.ok) {
    console.warn("mobile-api Expo push receipt HTTP failure", {
      count: claims.length,
      status: response.status,
    });
    result.unresolved = claims.length;
    return result;
  }

  const parsed = await readResponseJsonBounded(
    response,
    EXPO_PUSH_MAX_RESPONSE_BYTES,
  ).catch(() => null);
  const receipts = asRecord(asRecord(parsed)?.data) ?? {};
  for (const claim of claims) {
    const receipt = asRecord(receipts[claim.providerTicketId]);
    if (!receipt) {
      result.unresolved += 1;
      continue;
    }
    const providerStatus = receipt.status;
    if (providerStatus !== "ok" && providerStatus !== "error") {
      result.unresolved += 1;
      continue;
    }
    const providerErrorCode = providerStatus === "error"
      ? boundedCanonicalProviderCode(
        asRecord(receipt.details)?.error,
        EXPO_TICKET_ERROR_MAX_LENGTH,
      ) ?? "UNKNOWN_PUSH_RECEIPT_ERROR"
      : null;
    const applied = await applyMatchingPushProviderReceipt(
      client,
      claim.providerTicketRowId,
      providerStatus,
      providerErrorCode,
    );
    if (!applied) {
      result.unresolved += 1;
      continue;
    }
    if (applied.outcome === "provider_handoff") result.providerHandoffs += 1;
    else if (applied.outcome === "stale_token") result.staleTokenReceipts += 1;
    else if (applied.outcome === "failed") result.failed += 1;
    else result.unresolved += 1;
    if (applied.tokenDisabled) result.tokensDisabled += 1;
  }
  return result;
}

async function preparePushDelivery(
  client: PushDbClient,
  uniqueUserIds: string[],
  payload: PushPayload,
  options: PushDeliveryOptions,
): Promise<PushResult | PreparedPushDelivery> {
  const environment = options.environment ??
    readRuntimeEnv("NESTSCOUT_ENVIRONMENT") ?? "local";
  const releaseId = options.releaseId ??
    readRuntimeEnv("HARNESS_RELEASE_ID") ?? "unreleased";
  const operationId = options.operationId ?? "push.send";
  const idempotencyKey = environment === "local"
    ? ""
    : options.idempotencyKey ?? await derivedPushIdempotencyKey(uniqueUserIds, payload);
  const reservation = environment === "local"
    ? { state: "unavailable" as const, reservationId: null }
    : await reserveHarnessIdempotency(client, {
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
      submitted: 0,
      failed: uniqueUserIds.length,
      errors: ["IDEMPOTENCY_IN_PROGRESS"],
      replayed: true,
      degraded: true,
    };
  }
  if (reservation.state === "reconcile_required") {
    return {
      submitted: 0,
      failed: uniqueUserIds.length,
      errors: ["IDEMPOTENCY_RECONCILE_REQUIRED"],
      replayed: true,
      degraded: true,
    };
  }
  if (reservation.state === "conflict") {
    return { submitted: 0, failed: uniqueUserIds.length, errors: ["IDEMPOTENCY_CONFLICT"] };
  }
  if (reservation.state === "unavailable" && environment !== "local") {
    return {
      submitted: 0,
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
      submitted: 0,
      failed: uniqueUserIds.length,
      errors: ["PUSH_CIRCUIT_OPEN"],
      degraded: true,
    };
  }
  const rate = allowPushRecipients(uniqueUserIds);
  if (rate.allowedUserIds.length === 0) {
    await failHarnessIdempotency(client, reservationId, "RATE_LIMITED");
    return rate.result;
  }
  return {
    client,
    payload,
    environment,
    releaseId,
    reservationId,
    permit,
    allowedUserIds: rate.allowedUserIds,
    matchingDeliveryId: options.matchingDeliveryId?.trim() || null,
    result: rate.result,
  };
}

function allowPushRecipients(userIds: string[]): {
  allowedUserIds: string[];
  result: PushResult;
} {
  const allowedUserIds: string[] = [];
  const result = emptyResult();
  for (const userId of userIds) {
    const rate = checkRateLimit(`push:${userId}`, PUSH_RATE_LIMIT);
    if (rate.allowed) {
      allowedUserIds.push(userId);
    } else {
      result.failed += 1;
      result.errors.push("RATE_LIMITED");
    }
  }
  return { allowedUserIds, result };
}

async function loadPushTokens(
  client: PushDbClient,
  userIds: string[],
): Promise<DbResult<Array<Record<string, unknown>>>> {
  return dbQuery<Array<Record<string, unknown>>>(
    client
      .from("device_push_tokens")
      .select("id, user_id, push_token, updated_at")
      .in("user_id", userIds)
      .eq("enabled", true)
      .eq("permission_status", "granted"),
  );
}

async function pushTokenLookupFailure(
  prepared: PreparedPushDelivery,
  error: DbError,
): Promise<PushResult> {
  console.warn("mobile-api push token lookup failed", {
    errorCode: error.code,
  });
  await failHarnessIdempotency(
    prepared.client,
    prepared.reservationId,
    "TOKEN_LOOKUP_FAILED",
  );
  return {
    submitted: prepared.result.submitted,
    failed: prepared.result.failed + prepared.allowedUserIds.length,
    errors: [...prepared.result.errors, "TOKEN_LOOKUP_FAILED"],
    degraded: true,
  };
}

async function startPushIdempotency(
  prepared: PreparedPushDelivery,
): Promise<boolean> {
  if (!prepared.reservationId) return true;
  return startHarnessIdempotencyExecution(
    prepared.client,
    prepared.reservationId,
  );
}

async function deliverPushBatches(
  client: PushDbClient,
  rows: PushTokenRow[],
  payload: PushPayload,
  matchingDeliveryId: string | null,
  result: PushResult,
): Promise<PushResult> {
  for (const batch of chunk(rows, EXPO_BATCH_SIZE)) {
    const batchResult = await sendExpoBatch(
      client,
      batch,
      payload,
      matchingDeliveryId,
    );
    result.submitted += batchResult.submitted;
    result.failed += batchResult.failed;
    result.errors.push(...batchResult.errors);
  }
  return result;
}

async function settlePushDelivery(
  prepared: PreparedPushDelivery,
  result: PushResult,
): Promise<PushResult> {
  const dependencyFailure = result.errors.some((code) =>
    code === "EXPO_REQUEST_FAILED" || /^HTTP_5\d\d$/.test(code)
  );
  await recordDependencyResult(prepared.client, {
    dependency: "push",
    environment: prepared.environment,
    releaseId: prepared.releaseId,
    success: !dependencyFailure,
    errorCode: dependencyFailure ? result.errors[0] ?? "PUSH_FAILED" : null,
    probeToken: prepared.permit.probeToken,
  });
  if (dependencyFailure) {
    await markHarnessIdempotencyReconcileRequired(
      prepared.client,
      prepared.reservationId,
      result.errors[0] ?? "PUSH_FAILED",
    );
    return { ...result, degraded: true };
  }
  if (prepared.reservationId) {
    const completed = await completeHarnessIdempotency(
      prepared.client,
      prepared.reservationId,
      canonicalJson(result),
    );
    if (!completed) {
      await markHarnessIdempotencyReconcileRequired(
        prepared.client,
        prepared.reservationId,
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
  matchingDeliveryId: string | null,
): Promise<PushResult> {
  if (rows.length === 0) return emptyResult();

  let attempt = 0;
  let lastResult: PushResult = emptyResult();
  while (attempt < EXPO_PUSH_MAX_ATTEMPTS) {
    const attemptResult = await sendExpoBatchOnce(
      client,
      rows,
      payload,
      matchingDeliveryId,
    );
    const shouldRetry =
      attemptResult.submitted === 0 &&
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
  matchingDeliveryId: string | null,
): Promise<PushResult> {
  const messages = rows.map((row) => ({
    to: row.push_token,
    title: payload.title,
    body: payload.body,
    data: payload.data || matchingDeliveryId
      ? safePushData({
        ...(payload.data ?? {}),
        ...(matchingDeliveryId
          ? {
            matching_delivery_id: matchingDeliveryId,
            device_push_token_id: row.id,
            device_push_token_updated_at: row.updated_at,
          }
          : {}),
      })
      : undefined,
    sound: payload.sound ?? undefined,
    badge: payload.badge,
  }));

  let response: Response;
  try {
    response = await fetchPushProviderWithTimeout(
      EXPO_PUSH_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      },
      10_000,
      EXPO_PUSH_MAX_RESPONSE_BYTES,
    );
  } catch {
    console.warn("mobile-api Expo push request failed", { count: rows.length });
    return {
      submitted: 0,
      failed: rows.length,
      errors: ["EXPO_REQUEST_FAILED"],
    };
  }

  if (!response.ok) {
    console.warn("mobile-api Expo push HTTP failure", { status: response.status });
    return {
      submitted: 0,
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
  await Promise.all(rows.map(async (row, index) => {
    const ticket = asRecord(tickets[index]);
    if (ticket?.status === "ok") {
      const providerTicketId = boundedProviderTicketId(ticket.id);
      if (!providerTicketId) {
        result.failed += 1;
        result.errors.push("UNKNOWN_PUSH_TICKET");
        return;
      }
      if (matchingDeliveryId && !(await recordMatchingPushProviderTicket(
        client,
        matchingDeliveryId,
        row,
        providerTicketId,
      ))) {
        result.failed += 1;
        result.errors.push("PUSH_TICKET_PERSIST_FAILED");
        return;
      }
      result.submitted += 1;
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
      await disablePushToken(client, row.id, row.updated_at);
    }
  }));
  return result;
}

async function recordMatchingPushProviderTicket(
  client: PushDbClient,
  matchingDeliveryId: string,
  token: PushTokenRow,
  providerTicketId: string,
): Promise<boolean> {
  if (!client.rpc) return false;
  try {
    const result = await client.rpc("record_matching_push_provider_ticket", {
      p_delivery_id: matchingDeliveryId,
      p_device_push_token_id: token.id,
      p_device_push_token_updated_at: token.updated_at,
      p_provider_ticket_id: providerTicketId,
    });
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return !result.error && asRecord(row)?.recorded === true;
  } catch {
    return false;
  }
}

async function applyMatchingPushProviderReceipt(
  client: PushDbClient,
  providerTicketRowId: string,
  providerStatus: "ok" | "error",
  providerErrorCode: string | null,
): Promise<{ outcome: string; tokenDisabled: boolean } | null> {
  if (!client.rpc) return null;
  try {
    const result = await client.rpc("apply_matching_push_provider_receipt", {
      p_provider_ticket_row_id: providerTicketRowId,
      p_provider_status: providerStatus,
      p_provider_error_code: providerErrorCode,
    });
    const row = asRecord(Array.isArray(result.data) ? result.data[0] : result.data);
    const outcome = typeof row?.outcome === "string" ? row.outcome : null;
    if (result.error || !outcome) return null;
    return { outcome, tokenDisabled: row?.token_disabled === true };
  } catch {
    return null;
  }
}

async function disablePushToken(
  client: PushDbClient,
  tokenId: string,
  tokenUpdatedAt: string,
) {
  const disabled = await dbQuery(
    client
      .from("device_push_tokens")
      .update({
        enabled: false,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", tokenId)
      .eq("updated_at", tokenUpdatedAt)
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
  const updatedAt = typeof row.updated_at === "string" ? row.updated_at : "";
  if (!id || !userId || !pushToken || !updatedAt) return null;
  return { id, user_id: userId, push_token: pushToken, updated_at: updatedAt };
}

function asMatchingPushReceiptClaim(value: unknown): MatchingPushReceiptClaim | null {
  const row = asRecord(value);
  const providerTicketRowId = typeof row?.provider_ticket_row_id === "string"
    ? row.provider_ticket_row_id
    : "";
  const providerTicketId = boundedProviderTicketId(row?.provider_ticket_id);
  return providerTicketRowId && providerTicketId
    ? { providerTicketRowId, providerTicketId }
    : null;
}

function boundedProviderTicketId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= EXPO_TICKET_ID_MAX_LENGTH
    ? normalized
    : null;
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
  return { submitted: 0, failed: 0, errors: [] };
}

function emptyReceiptReconciliationResult(): PushReceiptReconciliationResult {
  return {
    checked: 0,
    providerHandoffs: 0,
    failed: 0,
    staleTokenReceipts: 0,
    tokensDisabled: 0,
    unresolved: 0,
  };
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
