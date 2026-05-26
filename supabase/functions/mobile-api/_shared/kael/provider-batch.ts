import type { EdgeAiSecrets } from "./types.ts";

const ANTHROPIC_BATCH_URL = "https://api.anthropic.com/v1/messages/batches";
const ANTHROPIC_VERSION = "2023-06-01";

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

  const response = await fetcher(ANTHROPIC_BATCH_URL, {
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
  const response = await fetcher(`${ANTHROPIC_BATCH_URL}/${encodeURIComponent(batchId)}`, {
    method: "GET",
    headers: anthropicHeaders(apiKey),
  });
  return parseAnthropicBatchResponse(response);
}

export async function retrieveAnthropicBatchResults(
  secrets: EdgeAiSecrets,
  batchId: string,
  fetcher: FetchLike = fetch,
): Promise<AnthropicBatchResult[]> {
  const apiKey = secrets.anthropicApiKey;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  const response = await fetcher(`${ANTHROPIC_BATCH_URL}/${encodeURIComponent(batchId)}/results`, {
    method: "GET",
    headers: anthropicHeaders(apiKey),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Anthropic batch results failed: ${response.status} ${text.slice(0, 240)}`);
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AnthropicBatchResult);
}

function anthropicHeaders(apiKey: string): HeadersInit {
  return {
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
    "x-api-key": apiKey,
  };
}

async function parseAnthropicBatchResponse(response: Response): Promise<AnthropicBatchSummary> {
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Anthropic batch failed: ${response.status} ${text.slice(0, 240)}`);
  }
  if (typeof json.id !== "string" || typeof json.processing_status !== "string") {
    throw new Error("Anthropic batch response missing id or processing_status");
  }
  return json as AnthropicBatchSummary;
}
