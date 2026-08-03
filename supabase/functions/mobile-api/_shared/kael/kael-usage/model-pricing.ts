import type { AIMessageContent, AIProvider, AIRequest } from "../contracts/types.ts";

export type UnknownModelPolicy = "throw" | "safe-high";
export type SearchContextSize = "low" | "medium" | "high";

export type ModelPricePeriod = {
  readonly provider: AIProvider;
  readonly inputUsdPerMTok: number;
  readonly outputUsdPerMTok: number;
  readonly cachedInputUsdPerMTok?: number;
  readonly cacheWriteMultiplier?: number;
  readonly cacheReadMultiplier?: number;
  readonly perRequestUsd?: number;
  readonly perRequestUsdBySearchContext?: Readonly<
    Record<SearchContextSize, number>
  >;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly verifiedAt: string;
  readonly sourceUrl: string;
};

export type ResolvedModelPrice = ModelPricePeriod & {
  readonly model: string;
  readonly fallback: boolean;
};

const VERIFIED_AT = "2026-07-10";
const ANTHROPIC_SOURCE =
  "https://platform.claude.com/docs/en/about-claude/pricing";
const DEEPSEEK_SOURCE = "https://api-docs.deepseek.com/quick_start/pricing/";
const PERPLEXITY_SOURCE =
  "https://docs.perplexity.ai/docs/getting-started/pricing";
const ANTHROPIC_MESSAGE_BATCH_MULTIPLIER = 0.5;

const anthropicPrice = (
  inputUsdPerMTok: number,
  outputUsdPerMTok: number,
  effective?: Pick<ModelPricePeriod, "effectiveFrom" | "effectiveUntil">,
): ModelPricePeriod =>
  Object.freeze({
    provider: "anthropic",
    inputUsdPerMTok,
    outputUsdPerMTok,
    cacheWriteMultiplier: 1.25,
    cacheReadMultiplier: 0.1,
    verifiedAt: VERIFIED_AT,
    sourceUrl: ANTHROPIC_SOURCE,
    ...effective,
  });

const deepseekPrice = (
  inputUsdPerMTok: number,
  outputUsdPerMTok: number,
  cachedInputUsdPerMTok: number,
): ModelPricePeriod =>
  Object.freeze({
    provider: "deepseek",
    inputUsdPerMTok,
    outputUsdPerMTok,
    cachedInputUsdPerMTok,
    verifiedAt: VERIFIED_AT,
    sourceUrl: DEEPSEEK_SOURCE,
  });

const perplexityPrice = (
  inputUsdPerMTok: number,
  outputUsdPerMTok: number,
  fees: Readonly<Record<SearchContextSize, number>>,
): ModelPricePeriod =>
  Object.freeze({
    provider: "perplexity",
    inputUsdPerMTok,
    outputUsdPerMTok,
    perRequestUsd: fees.low,
    perRequestUsdBySearchContext: Object.freeze({ ...fees }),
    verifiedAt: VERIFIED_AT,
    sourceUrl: PERPLEXITY_SOURCE,
  });

const SONNET_5_INTRO_PRICE = anthropicPrice(2, 10, {
  effectiveFrom: "2026-06-30T00:00:00.000Z",
  effectiveUntil: "2026-09-01T00:00:00.000Z",
});
const SONNET_5_STANDARD_PRICE = anthropicPrice(3, 15, {
  effectiveFrom: "2026-09-01T00:00:00.000Z",
});

// Canonical §40 M0 / §41 P2 registry. Each model stays a one-row extension
// point; the one known time-based price transition is resolved separately.
export const MODEL_PRICE_TABLE: Readonly<Record<string, ModelPricePeriod>> =
  Object.freeze({
    "claude-sonnet-4-6": anthropicPrice(3, 15),
    "claude-sonnet-5": SONNET_5_INTRO_PRICE,
    "claude-opus-4-8": anthropicPrice(5, 25),
    "claude-haiku-4-5-20251001": anthropicPrice(1, 5),
    "deepseek-v4-flash": deepseekPrice(0.14, 0.28, 0.0028),
    "deepseek-v4-pro": deepseekPrice(0.435, 0.87, 0.003625),
    sonar: perplexityPrice(1, 1, {
      low: 0.005,
      medium: 0.008,
      high: 0.012,
    }),
    "sonar-pro": perplexityPrice(3, 15, {
      low: 0.006,
      medium: 0.01,
      high: 0.014,
    }),
  });

const MODEL_PRICE_SCHEDULE: Readonly<
  Record<string, readonly ModelPricePeriod[]>
> = Object.freeze({
  "claude-sonnet-5": Object.freeze([
    SONNET_5_INTRO_PRICE,
    SONNET_5_STANDARD_PRICE,
  ]),
});

export function runtimeUnknownModelPolicy(
  getEnv: (name: string) => string | undefined = readRuntimeEnv,
): UnknownModelPolicy {
  const nodeEnv = getEnv("NODE_ENV")?.trim().toLowerCase();
  if (nodeEnv === "production" || getEnv("DENO_DEPLOYMENT_ID")) {
    return "safe-high";
  }
  return "throw";
}

export function resolveModelPrice(input: {
  readonly provider: AIProvider;
  readonly model: string;
  readonly at?: Date;
  readonly unknownModelPolicy?: UnknownModelPolicy;
}): ResolvedModelPrice {
  const at = input.at ?? new Date();
  const period = pricePeriods(input.model)?.find((candidate) =>
    candidate.provider === input.provider && isEffective(candidate, at)
  );
  if (period) return { ...period, model: input.model, fallback: false };

  const policy = input.unknownModelPolicy ?? runtimeUnknownModelPolicy();
  if (policy === "throw") {
    throw new Error(`UNKNOWN_MODEL_PRICE:${input.provider}:${input.model}`);
  }
  return safeHighPrice(input.provider, input.model, at);
}

export function calculateModelCostUsd(input: {
  readonly provider: AIProvider;
  readonly model: string;
  readonly inputTokens?: number | null;
  readonly outputTokens?: number | null;
  readonly cacheCreationInputTokens?: number | null;
  readonly cacheReadInputTokens?: number | null;
  readonly cacheHitInputTokens?: number | null;
  readonly cacheMissInputTokens?: number | null;
  readonly searchContextSize?: SearchContextSize;
  readonly providerReportedCostUsd?: number | null;
  readonly at?: Date;
  readonly unknownModelPolicy?: UnknownModelPolicy;
}): number {
  const price = resolveModelPrice(input);
  const inputTokens = nonNegative(input.inputTokens);
  const outputTokens = nonNegative(input.outputTokens);

  if (input.provider === "perplexity") {
    const reported = finiteNonNegativeOrNull(input.providerReportedCostUsd);
    if (reported !== null) return reported;
    return tokenCost(inputTokens, price.inputUsdPerMTok) +
      tokenCost(outputTokens, price.outputUsdPerMTok) +
      requestFee(price, input.searchContextSize ?? "low");
  }

  if (input.provider === "deepseek") {
    const hit = nonNegative(input.cacheHitInputTokens);
    const explicitMiss = nonNegative(input.cacheMissInputTokens);
    const classified = hit + explicitMiss;
    const miss = explicitMiss + Math.max(inputTokens - classified, 0);
    return tokenCost(
      hit,
      price.cachedInputUsdPerMTok ?? price.inputUsdPerMTok,
    ) +
      tokenCost(miss, price.inputUsdPerMTok) +
      tokenCost(outputTokens, price.outputUsdPerMTok);
  }

  return tokenCost(inputTokens, price.inputUsdPerMTok) +
    tokenCost(
      nonNegative(input.cacheCreationInputTokens),
      price.inputUsdPerMTok * (price.cacheWriteMultiplier ?? 1),
    ) +
    tokenCost(
      nonNegative(input.cacheReadInputTokens),
      price.inputUsdPerMTok * (price.cacheReadMultiplier ?? 1),
    ) +
    tokenCost(outputTokens, price.outputUsdPerMTok);
}

export function estimateModelRequestCostUsd(
  input:
    & Pick<
      AIRequest,
      "provider" | "model" | "messages" | "maxTokens" | "searchContextSize"
    >
    & {
      readonly at?: Date;
      readonly unknownModelPolicy?: UnknownModelPolicy;
    },
): number {
  return calculateModelCostUsd({
    provider: input.provider,
    model: input.model,
    inputTokens: conservativeTextTokenEstimate(input.messages),
    outputTokens: Math.max(input.maxTokens ?? 1024, 0),
    searchContextSize: input.searchContextSize,
    at: input.at,
    unknownModelPolicy: input.unknownModelPolicy,
  });
}

export function anthropicMessageBatchCostUsd(realtimeCostUsd: number): number {
  return Math.max(realtimeCostUsd, 0) * ANTHROPIC_MESSAGE_BATCH_MULTIPLIER;
}

function safeHighPrice(
  provider: AIProvider,
  model: string,
  at: Date,
): ResolvedModelPrice {
  const rows = Object.keys(MODEL_PRICE_TABLE)
    .map((model) =>
      pricePeriods(model)?.find((period) => isEffective(period, at))
    )
    .filter((period): period is ModelPricePeriod => period !== undefined);
  const max = (select: (row: ModelPricePeriod) => number | undefined) =>
    Math.max(...rows.map((row) => select(row) ?? 0));
  const contextFee = (context: SearchContextSize) =>
    max((row) =>
      row.perRequestUsdBySearchContext?.[context] ?? row.perRequestUsd
    );
  return {
    provider,
    model,
    fallback: true,
    inputUsdPerMTok: max((row) => row.inputUsdPerMTok),
    outputUsdPerMTok: max((row) => row.outputUsdPerMTok),
    cachedInputUsdPerMTok: max((row) => row.inputUsdPerMTok),
    cacheWriteMultiplier: Math.max(1, max((row) => row.cacheWriteMultiplier)),
    cacheReadMultiplier: 1,
    perRequestUsd: contextFee("low"),
    perRequestUsdBySearchContext: Object.freeze({
      low: contextFee("low"),
      medium: contextFee("medium"),
      high: contextFee("high"),
    }),
    verifiedAt: VERIFIED_AT,
    sourceUrl: "safe-high:max-known-registry-price",
  };
}

function pricePeriods(model: string): readonly ModelPricePeriod[] | undefined {
  const scheduled = MODEL_PRICE_SCHEDULE[model];
  if (scheduled) return scheduled;
  const current = MODEL_PRICE_TABLE[model];
  return current ? [current] : undefined;
}

function requestFee(
  price: ModelPricePeriod,
  context: SearchContextSize,
): number {
  return price.perRequestUsdBySearchContext?.[context] ??
    price.perRequestUsd ?? 0;
}

function conservativeTextTokenEstimate(
  messages: readonly { readonly content: AIMessageContent }[],
): number {
  return messages.reduce(
    (total, message) => total + 16 + textLength(message.content),
    0,
  );
}

function textLength(content: AIMessageContent): number {
  if (typeof content === "string") return Array.from(content).length;
  return content.reduce(
    (total, block) =>
      total + (block.type === "text" ? Array.from(block.text).length : 0),
    0,
  );
}

function isEffective(period: ModelPricePeriod, at: Date): boolean {
  const time = at.getTime();
  return (!period.effectiveFrom || time >= Date.parse(period.effectiveFrom)) &&
    (!period.effectiveUntil || time < Date.parse(period.effectiveUntil));
}

function tokenCost(tokens: number, usdPerMTok: number): number {
  return tokens * usdPerMTok / 1_000_000;
}

function nonNegative(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(value, 0)
    : 0;
}

function finiteNonNegativeOrNull(
  value: number | null | undefined,
): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function readRuntimeEnv(name: string): string | undefined {
  const denoGet = (globalThis as {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  }).Deno?.env?.get;
  const denoValue = denoGet?.(name);
  if (denoValue !== undefined) return denoValue;
  return (globalThis as {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env?.[name];
}
