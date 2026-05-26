import type { AICacheStatus, ComplexityLevel, EdgeAiSecrets, MarketPriceResult, ServiceType } from "./types.ts";
import { marketPriceResultSchema } from "./types.ts";
import { buildPricingMessages } from "./prompts.ts";
import { callAI } from "./provider-client.ts";
import { readKaelOptimizationFlags } from "./cost-tracking.ts";
import { maxTokensForPurpose } from "./routing.config.ts";
import { providerCandidatesForPurpose } from "./routing.ts";
import { safeParseJSON } from "./utils.ts";

const MARKET_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type MarketCacheClient = {
  from(table: string): MarketCacheQuery;
  rpc?(name: string, args?: Record<string, unknown>): PromiseLike<unknown>;
};

type MarketCacheQuery = {
  select(columns?: string, options?: unknown): MarketCacheQuery;
  insert(value: unknown): MarketCacheQuery;
  update(value: unknown): MarketCacheQuery;
  upsert(value: unknown, options?: unknown): MarketCacheQuery;
  eq(column: string, value: unknown): MarketCacheQuery;
  gt(column: string, value: unknown): MarketCacheQuery;
  is(column: string, value: unknown): MarketCacheQuery;
  maybeSingle(): MarketCacheQuery;
  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

type MarketCacheRow = {
  id?: unknown;
  market_range_min?: unknown;
  market_range_max?: unknown;
  confidence?: unknown;
  sources_summary?: unknown;
};

export async function searchMarketPrice(
  serviceType: ServiceType,
  problem: string,
  complexity: ComplexityLevel,
  district: string,
  secrets: EdgeAiSecrets,
  supabase?: unknown,
): Promise<
  {
    success: true;
    market: MarketPriceResult;
    provider: "anthropic" | "perplexity" | "deepseek";
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    cacheStatus?: AICacheStatus;
  } | {
    success: false;
    failureReason: string;
    provider?: "anthropic" | "perplexity" | "deepseek";
    model?: string;
  }
> {
  const cacheClient = asMarketCacheClient(supabase);
  const cacheKey = normalizeMarketCacheKey(
    serviceType,
    problem,
    complexity,
    district,
  );

  if (
    readKaelOptimizationFlags().KAEL_OPT_MARKET_CACHE_ENABLED &&
    cacheClient
  ) {
    const cached = await readMarketCache(cacheClient, cacheKey);
    if (cached) {
      await incrementMarketCacheHit(cacheClient, cached.id);
      return {
        success: true,
        market: cached.market,
        provider: "perplexity",
        model: "kael-market-cache",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        cacheStatus: "hit",
      };
    }
  }

  const failures: string[] = [];
  for (const route of providerCandidatesForPurpose("market_lookup")) {
    const result = await callAI({
      purpose: "market_lookup",
      provider: route.provider,
      model: route.model,
      messages: buildPricingMessages(serviceType, problem, complexity, district),
      maxTokens: maxTokensForPurpose("market_lookup", 300),
      temperature: 0.1,
      timeoutMs: route.latencyBudgetMs,
      maxRetries: 0,
    }, secrets);

    if (!result.success) {
      failures.push(`${route.provider}:AI call failed: ${result.code}`);
      continue;
    }

    const parsed = safeParseJSON(result.content);
    const validated = parsed ? marketPriceResultSchema.safeParse(parsed) : null;
    if (!validated?.success) {
      failures.push(`${route.provider}:AI market JSON validation failed`);
      continue;
    }
    if (validated.data.market_range_max < validated.data.market_range_min) {
      failures.push(`${route.provider}:market_range_max < market_range_min`);
      continue;
    }
    const cacheStatus = await maybeWriteMarketCache(
      cacheClient,
      cacheKey,
      route.provider,
      validated.data,
      result.content,
    );
    return {
      success: true,
      market: validated.data,
      provider: route.provider,
      model: route.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      costUsd: result.usage.costUsd,
      cacheStatus,
    };
  }
  return { success: false, failureReason: failures.join("; ") || "NO_PROVIDER_AVAILABLE" };
}

function asMarketCacheClient(value: unknown): MarketCacheClient | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const maybe = value as { from?: unknown };
  return typeof maybe.from === "function"
    ? value as MarketCacheClient
    : undefined;
}

function normalizeMarketCacheKey(
  serviceType: ServiceType,
  problem: string,
  complexity: ComplexityLevel,
  district: string,
) {
  return {
    district_code: district.trim().toLowerCase(),
    service_type: serviceType,
    problem_slug: normalizeProblemSlug(problem),
    complexity,
  };
}

function normalizeProblemSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

async function readMarketCache(
  supabase: MarketCacheClient,
  key: ReturnType<typeof normalizeMarketCacheKey>,
): Promise<{ id: string; market: MarketPriceResult } | null> {
  const { data, error } = await supabase
    .from("kael_market_cache")
    .select("id, market_range_min, market_range_max, confidence, sources_summary")
    .eq("district_code", key.district_code)
    .eq("service_type", key.service_type)
    .eq("problem_slug", key.problem_slug)
    .eq("complexity", key.complexity)
    .is("invalidated_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle() as { data?: MarketCacheRow | null; error?: { message?: string } | null };
  if (error || !data) return null;

  const market = {
    market_range_min: numberOrNull(data.market_range_min),
    market_range_max: numberOrNull(data.market_range_max),
    confidence: numberOrNull(data.confidence),
    sources_summary: typeof data.sources_summary === "string"
      ? data.sources_summary
      : undefined,
  };
  const validated = marketPriceResultSchema.safeParse(market);
  const id = typeof data.id === "string" ? data.id : null;
  return id && validated.success ? { id, market: validated.data } : null;
}

async function incrementMarketCacheHit(
  supabase: MarketCacheClient,
  cacheId: string,
) {
  if (!supabase.rpc) return;
  await supabase.rpc("increment_kael_market_cache_hit", {
    p_cache_id: cacheId,
  }).then(() => null, () => null);
}

async function maybeWriteMarketCache(
  supabase: MarketCacheClient | undefined,
  key: ReturnType<typeof normalizeMarketCacheKey>,
  provider: "anthropic" | "perplexity" | "deepseek",
  market: MarketPriceResult,
  rawContent: string,
): Promise<AICacheStatus | undefined> {
  if (
    !supabase ||
    !readKaelOptimizationFlags().KAEL_OPT_MARKET_CACHE_ENABLED ||
    provider !== "perplexity"
  ) {
    return undefined;
  }

  const { error } = await supabase
    .from("kael_market_cache")
    .upsert({
      ...key,
      market_range_min: market.market_range_min,
      market_range_max: market.market_range_max,
      confidence: market.confidence,
      sources_summary: market.sources_summary ?? null,
      perplexity_raw: {
        response_summary: rawContent.slice(0, 4000),
      },
      expires_at: new Date(Date.now() + MARKET_CACHE_TTL_MS).toISOString(),
      invalidated_at: null,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "district_code,service_type,problem_slug,complexity",
    }) as { error?: { message?: string } | null };
  return error ? "miss" : "write";
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
