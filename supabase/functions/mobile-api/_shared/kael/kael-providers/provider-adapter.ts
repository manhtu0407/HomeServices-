import type { FailureKind as CircuitFailureKind } from "./circuit-breaker.ts";
import { readKaelOptimizationFlags } from "../kael-usage/cost-tracking.ts";
import {
  calculateModelCostUsd,
  type SearchContextSize,
} from "../kael-usage/model-pricing.ts";
import type {
  AICacheStatus,
  AIMessageContent,
  AIProvider,
  AIRequest,
  AIResponse,
  AITextContent,
  ProviderRequestSpec,
} from "../types.ts";

export type ProviderCapabilities = {
  readonly vision: boolean;
  readonly webSearch: boolean;
  readonly jsonMode: boolean;
  readonly promptCache: boolean;
};

export type ProviderAdapterBuildInput = {
  readonly request: AIRequest;
  readonly apiKey: string;
};

export type ProviderAdapterResponseInput = {
  readonly request: AIRequest;
  readonly data: Record<string, unknown>;
  readonly latencyMs: number;
  readonly model: string;
  readonly pricingAt: Date;
  readonly unknownModelPolicy: "throw" | "safe-high";
};

export type ProviderAdapterCostInput = {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens?: number;
  readonly cacheReadInputTokens?: number;
  readonly cacheHitInputTokens?: number;
  readonly cacheMissInputTokens?: number;
  readonly searchContextSize?: SearchContextSize;
  readonly providerReportedCostUsd?: number;
  readonly pricingAt: Date;
  readonly unknownModelPolicy: "throw" | "safe-high";
};

export type ProviderFailureInput = {
  readonly httpStatus?: number;
  readonly timedOut?: boolean;
};

export type ProviderAdapter = {
  readonly capabilities: ProviderCapabilities;
  buildRequest(input: ProviderAdapterBuildInput): ProviderRequestSpec;
  parseResponse(input: ProviderAdapterResponseInput): AIResponse;
  cost(input: ProviderAdapterCostInput): number;
  classifyFailure(input: ProviderFailureInput): CircuitFailureKind | null;
};

const ANTHROPIC_ADAPTER: ProviderAdapter = {
  capabilities: {
    vision: true,
    webSearch: false,
    jsonMode: false,
    promptCache: true,
  },
  buildRequest: ({ request, apiKey }) => {
    const promptCacheEnabled = readKaelOptimizationFlags()
      .KAEL_OPT_PROMPT_CACHE_ENABLED;
    const systemContent = request.messages.find((message) => message.role === "system")
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
        ...(request.effort
          ? { output_config: { effort: request.effort } }
          : {}),
        ...(anthropicRejectsSamplingParameters(request.model)
          ? {}
          : { temperature: request.temperature ?? 0.7 }),
        messages: request.messages
          .filter((message) => message.role !== "system")
          .map((message) => ({ role: message.role, content: message.content })),
        system: anthropicSystemContent(systemContent, promptCacheEnabled),
      },
    };
  },
  parseResponse: ({ data, latencyMs, model, pricingAt, unknownModelPolicy }) => {
    const content = requireProviderContent(anthropicTextContent(data));
    const inputTokens = providerTokenCount(getPath(data, ["usage", "input_tokens"]));
    const outputTokens = providerTokenCount(getPath(data, ["usage", "output_tokens"]));
    const cacheCreationInputTokens = providerTokenCount(
      getPath(data, ["usage", "cache_creation_input_tokens"]),
    );
    const cacheReadInputTokens = providerTokenCount(
      getPath(data, ["usage", "cache_read_input_tokens"]),
    );
    const promptCacheEnabled = readKaelOptimizationFlags()
      .KAEL_OPT_PROMPT_CACHE_ENABLED;
    const cacheStatus = promptCacheEnabled
      ? inferAnthropicCacheStatus(cacheCreationInputTokens, cacheReadInputTokens)
      : undefined;
    return {
      success: true as const,
      content,
      usage: {
        inputTokens,
        outputTokens,
        costUsd: ANTHROPIC_ADAPTER.cost({
          model,
          inputTokens,
          outputTokens,
          cacheCreationInputTokens,
          cacheReadInputTokens,
          pricingAt,
          unknownModelPolicy,
        }),
        cacheCreationInputTokens,
        cacheReadInputTokens,
        cacheStatus,
      },
      latencyMs,
    };
  },
  cost: (input) => calculateAdapterCost("anthropic", input),
  classifyFailure: classifyTransportFailure,
};

function anthropicRejectsSamplingParameters(model: string): boolean {
  return model === "claude-sonnet-5" || model === "claude-opus-4-8";
}

const DEEPSEEK_ADAPTER: ProviderAdapter = {
  capabilities: {
    vision: false,
    webSearch: false,
    jsonMode: true,
    promptCache: false,
  },
  buildRequest: ({ request, apiKey }) => openAiCompatibleRequest({
    request,
    apiKey,
    url: "https://api.deepseek.com/chat/completions",
    provider: "deepseek",
  }),
  parseResponse: (input) => parseOpenAiCompatibleResponse(input, DEEPSEEK_ADAPTER),
  cost: (input) => calculateAdapterCost("deepseek", input),
  classifyFailure: classifyTransportFailure,
};

const PERPLEXITY_ADAPTER: ProviderAdapter = {
  capabilities: {
    vision: false,
    webSearch: true,
    jsonMode: false,
    promptCache: false,
  },
  buildRequest: ({ request, apiKey }) => openAiCompatibleRequest({
    request,
    apiKey,
    url: "https://api.perplexity.ai/v1/sonar",
    provider: "perplexity",
  }),
  parseResponse: (input) => parseOpenAiCompatibleResponse(input, PERPLEXITY_ADAPTER),
  cost: (input) => calculateAdapterCost("perplexity", input),
  classifyFailure: classifyTransportFailure,
};

const PROVIDER_ADAPTERS: Record<AIProvider, ProviderAdapter> = {
  anthropic: ANTHROPIC_ADAPTER,
  deepseek: DEEPSEEK_ADAPTER,
  perplexity: PERPLEXITY_ADAPTER,
};

export function providerAdapterFor(provider: AIProvider): ProviderAdapter {
  return PROVIDER_ADAPTERS[provider];
}

function openAiCompatibleRequest(input: {
  request: AIRequest;
  apiKey: string;
  url: string;
  provider: "deepseek" | "perplexity";
}): ProviderRequestSpec {
  const { request, apiKey, url, provider } = input;
  const deepseekThinkingEnabled = request.model === "deepseek-v4-pro" &&
    request.purpose === "post_job_learning";
  return {
    url,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: {
      model: request.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.2,
      ...(provider === "deepseek"
        ? {
          thinking: { type: deepseekThinkingEnabled ? "enabled" : "disabled" },
          ...(deepseekThinkingEnabled ? { reasoning_effort: "high" } : {}),
          response_format: { type: "json_object" },
        }
        : {}),
      ...(provider === "perplexity" ? perplexitySearchOptions(request) : {}),
      messages: request.messages.map((message) => ({
        role: message.role,
        content: aiMessageContentToText(message.content),
      })),
    },
  };
}

function parseOpenAiCompatibleResponse(
  { data, latencyMs, model, pricingAt, unknownModelPolicy, request }: ProviderAdapterResponseInput,
  adapter: ProviderAdapter,
): AIResponse {
  const content = requireProviderContent(
    getPath(data, ["choices", 0, "message", "content"]),
  );
  const inputTokens = providerTokenCount(getPath(data, ["usage", "prompt_tokens"]));
  const outputTokens = providerTokenCount(getPath(data, ["usage", "completion_tokens"]));
  const cacheHitInputTokens = providerTokenCount(
    getPath(data, ["usage", "prompt_cache_hit_tokens"]),
  );
  const cacheMissInputTokens = providerTokenCount(
    getPath(data, ["usage", "prompt_cache_miss_tokens"]),
  );
  const providerReportedCostUsd = optionalProviderMoney(
    getPath(data, ["usage", "cost", "total_cost"]),
  );
  const requestCostUsd = optionalProviderMoney(
    getPath(data, ["usage", "cost", "request_cost"]),
  );
  const responseSearchContextSize = searchContextSizeOrUndefined(
    getPath<unknown>(data, ["usage", "search_context_size"]),
  );
  const citations = Array.isArray(data.citations)
    ? data.citations.filter((item): item is string => typeof item === "string")
    : undefined;
  return {
    success: true,
    content,
    usage: {
      inputTokens,
      outputTokens,
      costUsd: adapter.cost({
        model,
        inputTokens,
        outputTokens,
        cacheHitInputTokens,
        cacheMissInputTokens,
        searchContextSize: responseSearchContextSize ?? request.searchContextSize,
        providerReportedCostUsd,
        pricingAt,
        unknownModelPolicy,
      }),
      ...(adapter === DEEPSEEK_ADAPTER ? { cacheHitInputTokens, cacheMissInputTokens } : {}),
      ...(typeof providerReportedCostUsd === "number" ? { providerReportedCostUsd } : {}),
      ...(typeof requestCostUsd === "number" ? { requestCostUsd } : {}),
    },
    latencyMs,
    citations,
  };
}

function calculateAdapterCost(
  provider: AIProvider,
  input: ProviderAdapterCostInput,
): number {
  return calculateModelCostUsd({
    provider,
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cacheCreationInputTokens: input.cacheCreationInputTokens,
    cacheReadInputTokens: input.cacheReadInputTokens,
    cacheHitInputTokens: input.cacheHitInputTokens,
    cacheMissInputTokens: input.cacheMissInputTokens,
    searchContextSize: input.searchContextSize,
    providerReportedCostUsd: input.providerReportedCostUsd,
    at: input.pricingAt,
    unknownModelPolicy: input.unknownModelPolicy,
  });
}

function classifyTransportFailure(input: ProviderFailureInput): CircuitFailureKind | null {
  if (input.httpStatus === 402) return "credit";
  if (input.httpStatus === 429) return "rate_limit";
  if (typeof input.httpStatus === "number" && input.httpStatus >= 500) return "server";
  return input.timedOut ? "timeout" : null;
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

function perplexitySearchOptions(request: AIRequest): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  const webSearchOptions: Record<string, unknown> = {};
  if (request.searchDomainFilter?.length) {
    options.search_domain_filter = [...request.searchDomainFilter];
  }
  if (request.searchRecencyFilter) {
    options.search_recency_filter = request.searchRecencyFilter;
  }
  if (request.searchMode) {
    webSearchOptions.search_mode = request.searchMode;
  }
  if (request.searchContextSize) {
    webSearchOptions.search_context_size = request.searchContextSize;
  }
  if (Object.keys(webSearchOptions).length > 0) {
    options.web_search_options = webSearchOptions;
  }
  return options;
}

function searchContextSizeOrUndefined(value: unknown): SearchContextSize | undefined {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : undefined;
}

function requireProviderContent(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("AI_PROVIDER_RESPONSE_INVALID");
  }
  return value;
}

function anthropicTextContent(data: Record<string, unknown>): string | undefined {
  const blocks = data.content;
  if (!Array.isArray(blocks)) return undefined;
  const text = blocks
    .filter((block): block is Record<string, unknown> =>
      typeof block === "object" && block !== null && !Array.isArray(block)
    )
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .filter((value) => value.trim().length > 0)
    .join("\n");
  return text || undefined;
}

function providerTokenCount(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("AI_PROVIDER_RESPONSE_INVALID");
  }
  return Math.trunc(value);
}

function optionalProviderMoney(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("AI_PROVIDER_RESPONSE_INVALID");
  }
  return value;
}

function aiMessageContentToText(content: AIMessageContent | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((block): block is AITextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
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
