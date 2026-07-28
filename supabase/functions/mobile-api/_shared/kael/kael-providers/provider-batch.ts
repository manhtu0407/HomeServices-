import type { EdgeAiSecrets } from "../types.ts";
import {
  createBufferedResponse,
  readResponseBytesBounded,
  readResponseTextBounded,
  ResponseBodyTooLargeError,
} from "../../../../_shared/network.ts";

const ANTHROPIC_BATCH_URL = "https://api.anthropic.com/v1/messages/batches";
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_BATCH_TIMEOUT_MS = 20_000;
const ANTHROPIC_BATCH_MAX_RETRIES = 2;
const ANTHROPIC_BATCH_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const ANTHROPIC_BATCH_RESULTS_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const ANTHROPIC_BATCH_ID_MAX_LENGTH = 256;
const ANTHROPIC_BATCH_URL_MAX_LENGTH = 2_048;
const ANTHROPIC_BATCH_STATUSES = new Set(["in_progress", "canceling", "ended"]);
const ANTHROPIC_BATCH_RESULT_TYPES = new Set(["succeeded", "errored", "canceled", "expired"]);

export type AnthropicBatchRequest = {
  custom_id: string;
  params: {
    model: string;
    max_tokens: number;
    temperature?: number;
    system?: Array<Record<string, unknown>>;
    messages: Array<Record<string, unknown>>;
  };
};

export type AnthropicBatchSummary = {
  id: string;
  processing_status: string;
  request_counts?: {
    processing?: number;
    succeeded?: number;
    errored?: number;
    canceled?: number;
    expired?: number;
  };
  results_url?: string | null;
  created_at?: string | null;
  ended_at?: string | null;
  expires_at?: string | null;
};

export type AnthropicBatchResult = {
  custom_id: string;
  result: {
    type: "succeeded" | "errored" | "canceled" | "expired";
    message?: Record<string, unknown>;
    error?: Record<string, unknown>;
  };
};

type FetchLike = typeof fetch;

export async function createAnthropicMessageBatch(
  secrets: EdgeAiSecrets,
  requests: readonly AnthropicBatchRequest[],
  fetcher: FetchLike = fetch,
): Promise<AnthropicBatchSummary> {
  const apiKey = secrets.anthropicApiKey;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  if (requests.length === 0) throw new Error("Cannot create empty Anthropic batch");

  const response = await fetchAnthropicBatch(fetcher, ANTHROPIC_BATCH_URL, {
    method: "POST",
    headers: anthropicHeaders(apiKey),
    body: JSON.stringify({ requests }),
  });
  return parseAnthropicBatchResponse(response);
}

export async function retrieveAnthropicMessageBatch(
  secrets: EdgeAiSecrets,
  batchId: string,
  fetcher: FetchLike = fetch,
): Promise<AnthropicBatchSummary> {
  const apiKey = secrets.anthropicApiKey;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const response = await fetchAnthropicBatch(
    fetcher,
    `${ANTHROPIC_BATCH_URL}/${encodeURIComponent(batchId)}`,
    {
    method: "GET",
    headers: anthropicHeaders(apiKey),
    },
  );
  return parseAnthropicBatchResponse(response);
}

export async function retrieveAnthropicBatchResults(
  secrets: EdgeAiSecrets,
  batchId: string,
  fetcher: FetchLike = fetch,
): Promise<AnthropicBatchResult[]> {
  const apiKey = secrets.anthropicApiKey;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const response = await fetchAnthropicBatch(
    fetcher,
    `${ANTHROPIC_BATCH_URL}/${encodeURIComponent(batchId)}/results`,
    { method: "GET", headers: anthropicHeaders(apiKey) },
    ANTHROPIC_BATCH_RESULTS_MAX_RESPONSE_BYTES,
  );
  const text = await readResponseTextBounded(
    response,
    ANTHROPIC_BATCH_RESULTS_MAX_RESPONSE_BYTES,
  );
  if (!response.ok) {
    throw new Error(`Anthropic batch results failed: ${response.status}`);
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseAnthropicBatchResultLine);
}

async function fetchAnthropicBatch(
  fetcher: FetchLike,
  url: string,
  init: RequestInit,
  maxResponseBytes = ANTHROPIC_BATCH_MAX_RESPONSE_BYTES,
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const retryTransportFailure = method === "GET" || method === "HEAD";
  let lastError: unknown;
  for (let attempt = 0; attempt <= ANTHROPIC_BATCH_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error("Anthropic batch request timed out"));
        }, ANTHROPIC_BATCH_TIMEOUT_MS);
      });
      const response = await Promise.race([
        fetcher(url, {
          ...init,
          redirect: "error",
          signal: controller.signal,
        }),
        timeout,
      ]);
      const bytes = await Promise.race([
        readResponseBytesBounded(response, maxResponseBytes),
        timeout,
      ]);
      const bufferedResponse = createBufferedResponse(response, bytes);
      if (
        !canRetryBatchResponse(method, response.status) ||
        attempt === ANTHROPIC_BATCH_MAX_RETRIES
      ) {
        return bufferedResponse;
      }
      lastError = new Error(`Anthropic batch retryable HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (
        error instanceof ResponseBodyTooLargeError ||
        !retryTransportFailure ||
        attempt === ANTHROPIC_BATCH_MAX_RETRIES
      ) {
        throw error;
      }
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Anthropic batch request failed");
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function canRetryBatchResponse(method: string, status: number): boolean {
  if (!isRetryableStatus(status)) return false;
  if (method === "GET" || method === "HEAD") return true;
  return status === 429;
}

function anthropicHeaders(apiKey: string): HeadersInit {
  return {
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
    "x-api-key": apiKey,
  };
}

async function parseAnthropicBatchResponse(response: Response): Promise<AnthropicBatchSummary> {
  const text = await readResponseTextBounded(
    response,
    ANTHROPIC_BATCH_MAX_RESPONSE_BYTES,
  );
  if (!response.ok) {
    throw new Error(`Anthropic batch failed: ${response.status}`);
  }
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Anthropic batch response invalid JSON");
  }
  const json = asRecord(parsed);
  const id = boundedNonEmptyString(json?.id, ANTHROPIC_BATCH_ID_MAX_LENGTH);
  const processingStatus = boundedNonEmptyString(json?.processing_status, 32);
  if (!json || !id || !processingStatus || !ANTHROPIC_BATCH_STATUSES.has(processingStatus)) {
    throw new Error("Anthropic batch response invalid shape");
  }

  const requestCounts = parseBatchRequestCounts(json.request_counts);
  const resultsUrl = optionalBoundedString(json.results_url, ANTHROPIC_BATCH_URL_MAX_LENGTH);
  const createdAt = optionalTimestamp(json.created_at);
  const endedAt = optionalTimestamp(json.ended_at);
  const expiresAt = optionalTimestamp(json.expires_at);
  if (
    requestCounts === undefined || resultsUrl === undefined || createdAt === undefined ||
    endedAt === undefined || expiresAt === undefined
  ) {
    throw new Error("Anthropic batch response invalid shape");
  }

  return {
    id,
    processing_status: processingStatus,
    ...(requestCounts === null ? {} : { request_counts: requestCounts }),
    ...(resultsUrl === null ? {} : { results_url: resultsUrl }),
    ...(createdAt === null ? {} : { created_at: createdAt }),
    ...(endedAt === null ? {} : { ended_at: endedAt }),
    ...(expiresAt === null ? {} : { expires_at: expiresAt }),
  };
}

function parseAnthropicBatchResultLine(line: string): AnthropicBatchResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error("Anthropic batch result invalid JSON");
  }
  const row = asRecord(parsed);
  const result = asRecord(row?.result);
  const customId = boundedNonEmptyString(row?.custom_id, ANTHROPIC_BATCH_ID_MAX_LENGTH);
  const resultType = boundedNonEmptyString(result?.type, 32);
  if (!row || !result || !customId || !resultType || !ANTHROPIC_BATCH_RESULT_TYPES.has(resultType)) {
    throw new Error("Anthropic batch result invalid shape");
  }

  const message = result.message === undefined ? undefined : asRecord(result.message);
  const error = result.error === undefined ? undefined : asRecord(result.error);
  if (
    (result.message !== undefined && !message) ||
    (result.error !== undefined && !error) ||
    (resultType === "succeeded" && !message)
  ) {
    throw new Error("Anthropic batch result invalid shape");
  }

  return {
    custom_id: customId,
    result: {
      type: resultType as AnthropicBatchResult["result"]["type"],
      ...(message ? { message } : {}),
      ...(error ? { error } : {}),
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedNonEmptyString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function optionalBoundedString(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  return boundedNonEmptyString(value, maxLength) ?? undefined;
}

function optionalTimestamp(value: unknown): string | null | undefined {
  const text = optionalBoundedString(value, 64);
  if (text === undefined || text === null) return text;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(text);
  if (!match) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  const daysInMonth = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0;
  if (
    year === 0 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 ||
    second > 59 || offsetHour > 23 || offsetMinute > 59
  ) return undefined;
  return Number.isFinite(Date.parse(text)) ? text : undefined;
}

function parseBatchRequestCounts(
  value: unknown,
): AnthropicBatchSummary["request_counts"] | null | undefined {
  if (value === undefined || value === null) return null;
  const record = asRecord(value);
  if (!record) return undefined;
  const parsed: NonNullable<AnthropicBatchSummary["request_counts"]> = {};
  for (const key of ["processing", "succeeded", "errored", "canceled", "expired"] as const) {
    const count = record[key];
    if (count === undefined) continue;
    if (!Number.isSafeInteger(count) || (count as number) < 0) return undefined;
    parsed[key] = count as number;
  }
  return parsed;
}
