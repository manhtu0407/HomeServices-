import type { AICacheStatus, AIMessageContent, AIProvider, AIRequest, AIResponse, AIError, EdgeAiSecrets, ProviderRequestSpec, AITextContent } from "./types.ts";
import { KAEL_CIRCUIT_BREAKER } from "./circuit-breaker.ts";
import { readKaelOptimizationFlags } from "./cost-tracking.ts";

export async function callAI(
  request: AIRequest,
  secrets: EdgeAiSecrets,
): Promise<AIResponse | AIError> {
  const apiKey = providerKey(request.provider, secrets);
  if (!apiKey) {
    return {
      success: false,
      provider: request.provider,
      code: "KEY_MISSING",
      error: "provider key missing",
    };
  }

  const timeout = request.timeoutMs ?? (request.provider === "anthropic"
    ? 20_000
    : request.provider === "perplexity"
    ? 15_000
    : 10_000);
  const maxRetries = request.maxRetries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10_000);
      console.warn("AI retry", {
        provider: request.provider,
        model: request.model,
        attempt,
        backoffMs: delay,
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const controller = new AbortController();
    try {
      const response = await withTimeout(
        callProvider(request, apiKey, controller.signal),
        timeout,
        controller,
      );
      console.info("AI call success", {
        provider: request.provider,
        model: request.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        costUsd: response.usage.costUsd.toFixed(6),
        latencyMs: response.latencyMs,
      });
      if (request.purpose) {
        KAEL_CIRCUIT_BREAKER.recordSuccess(request.purpose, request.provider);
      }
      return response;
    } catch (err) {
      lastError = err;
      if (!isRetryableProviderError(err) || attempt === maxRetries) break;
    }
  }

  const code = lastError instanceof ProviderHttpError
    ? `HTTP_${lastError.status}`
    : isProviderTimeout(lastError)
    ? "TIMEOUT"
    : "AI_CALL_FAILED";
  console.error("AI call failed", {
    provider: request.provider,
    model: request.model,
    code,
    retriesExhausted: true,
  });
  if (request.purpose) {
    KAEL_CIRCUIT_BREAKER.recordFailure({
      purpose: request.purpose,
      provider: request.provider,
      errorCode: code,
    });
  }
  return {
    success: false,
    provider: request.provider,
    code,
    error: code,
  };
}

async function callProvider(
  request: AIRequest,
  apiKey: string,
  signal: AbortSignal,
): Promise<AIResponse> {
  const start = Date.now();
  const { url, headers, body, parse } = providerRequest(request, apiKey);
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  const latencyMs = Date.now() - start;

  if (!response.ok) {
    const text = await response.text();
    throw new ProviderHttpError(response.status, text);
  }

  return parse(await response.json(), latencyMs, request.model);
}

function providerRequest(
  request: AIRequest,
  apiKey: string,
): ProviderRequestSpec {
  if (request.provider === "anthropic") {
    const promptCacheEnabled = readKaelOptimizationFlags()
      .KAEL_OPT_PROMPT_CACHE_ENABLED;
    const systemContent = request.messages.find((m) => m.role === "system")
      ?.content;
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: request.model,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
        messages: request.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content })),
        system: anthropicSystemContent(systemContent, promptCacheEnabled),
      },
      parse: (
        data: Record<string, unknown>,
        latencyMs: number,
        model: string,
      ) => {
        const content = getPath<string>(data, ["content", 0, "text"]) ?? "";
        const inputTokens = getPath<number>(data, ["usage", "input_tokens"]) ??
          0;
        const outputTokens =
          getPath<number>(data, ["usage", "output_tokens"]) ?? 0;
        const cacheCreationInputTokens =
          getPath<number>(data, ["usage", "cache_creation_input_tokens"]) ?? 0;
        const cacheReadInputTokens =
          getPath<number>(data, ["usage", "cache_read_input_tokens"]) ?? 0;
        const isHaiku = model.includes("haiku");
        const baseInputRate = isHaiku ? 0.25 : 3;
        const costUsd =
          inputTokens * (baseInputRate / 1_000_000) +
          cacheCreationInputTokens * ((baseInputRate * 1.25) / 1_000_000) +
          cacheReadInputTokens * ((baseInputRate * 0.1) / 1_000_000) +
          outputTokens * ((isHaiku ? 1.25 : 15) / 1_000_000);
        const cacheStatus = promptCacheEnabled
          ? inferAnthropicCacheStatus(
            cacheCreationInputTokens,
            cacheReadInputTokens,
          )
          : undefined;
        return {
          success: true as const,
          content,
          usage: {
            inputTokens,
            outputTokens,
            costUsd,
            cacheCreationInputTokens,
            cacheReadInputTokens,
            cacheStatus,
          },
          latencyMs,
        };
      },
    };
  }

  const openAiCompatibleUrl = request.provider === "perplexity"
    ? "https://api.perplexity.ai/v1/sonar"
    : "https://api.deepseek.com/chat/completions";
  return {
    url: openAiCompatibleUrl,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: {
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.2,
      ...(request.provider === "deepseek"
        ? {
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
        }
        : {}),
      ...(request.provider === "perplexity"
        ? perplexitySearchOptions(request)
        : {}),
      messages: request.messages.map((m) => ({
        role: m.role,
        content: aiMessageContentToText(m.content),
      })),
    },
    parse: (data: Record<string, unknown>, latencyMs: number) => {
      const content =
        getPath<string>(data, ["choices", 0, "message", "content"]) ?? "";
      const inputTokens = getPath<number>(data, ["usage", "prompt_tokens"]) ??
        0;
      const outputTokens =
        getPath<number>(data, ["usage", "completion_tokens"]) ?? 0;
      const costUsd = request.provider === "deepseek"
        ? inputTokens * (0.14 / 1_000_000) + outputTokens * (0.28 / 1_000_000)
        : inputTokens * (1 / 1_000_000) + outputTokens * (1 / 1_000_000);
      const citations = Array.isArray(data.citations)
        ? data.citations.filter((item): item is string =>
          typeof item === "string"
        )
        : undefined;
      return {
        success: true as const,
        content,
        usage: { inputTokens, outputTokens, costUsd },
        latencyMs,
        citations,
      };
    },
  };
}

function anthropicSystemContent(
  content: AIMessageContent | undefined,
  promptCacheEnabled: boolean,
): string | AITextContent[] {
  const text = aiMessageContentToText(content);
  if (!promptCacheEnabled || !text.trim()) return text;
  return [{
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  }];
}

function inferAnthropicCacheStatus(
  cacheCreationInputTokens: number,
  cacheReadInputTokens: number,
): AICacheStatus {
  if (cacheReadInputTokens > 0) return "hit";
  if (cacheCreationInputTokens > 0) return "write";
  return "miss";
}

function perplexitySearchOptions(
  request: AIRequest,
): Record<string, unknown> {
  const webSearchOptions: Record<string, unknown> = {};
  if (request.searchDomainFilter?.length) {
    webSearchOptions.search_domain_filter = [...request.searchDomainFilter];
  }
  if (request.searchRecencyFilter) {
    webSearchOptions.search_recency_filter = request.searchRecencyFilter;
  }
  if (request.searchMode) {
    webSearchOptions.search_mode = request.searchMode;
  }
  if (request.searchContextSize) {
    webSearchOptions.search_context_size = request.searchContextSize;
  }
  return Object.keys(webSearchOptions).length > 0
    ? { web_search_options: webSearchOptions }
    : {};
}

function providerKey(
  provider: AIProvider,
  secrets: EdgeAiSecrets,
): string | undefined {
  if (provider === "anthropic") return secrets.anthropicApiKey;
  if (provider === "perplexity") return secrets.perplexityApiKey;
  return secrets.deepseekApiKey;
}

function aiMessageContentToText(content: AIMessageContent | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((block): block is AITextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  controller: AbortController,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timeout after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof ProviderHttpError) {
    return error.status === 429 || error.status >= 500;
  }
  return isProviderTimeout(error);
}

function isProviderTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /Timeout|Abort/i.test(String(error));
}

class ProviderHttpError extends Error {
  constructor(public readonly status: number, body: string) {
    super(`HTTP ${status}: ${body.slice(0, 160)}`);
  }
}

function getPath<T>(obj: unknown, path: Array<string | number>): T | undefined {
  let current = obj;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[key];
    } else {
      if (typeof current !== "object" || current === null) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
  }
  return current as T | undefined;
}
