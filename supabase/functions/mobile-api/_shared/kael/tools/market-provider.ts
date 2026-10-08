import { z } from "zod";
import type {
  AICacheStatus,
  ComplexityLevel,
  EdgeAiSecrets,
  MarketPriceResult,
  MarketSourceEvidenceResult,
  ServiceType,
} from "../contracts/types.ts";
import {
  marketPriceResultSchema,
  marketSourceEvidenceResultSchema,
} from "../contracts/types.ts";
import type { KaelSpendGate } from "../kael-guardrails/spend-gate.ts";
import { appendKnowledgeContextToMessages, buildPricingMessages } from "../prompts/prompts.ts";
import {
  callStructuredAI,
  type StructuredAIResponse,
  type StructuredSchema,
} from "../kael-providers/structured-call.ts";
import { readKaelOptimizationFlags } from "../kael-usage/cost-tracking.ts";
import { maxTokensForPurpose } from "../kael-providers/routing.config.ts";
import type { ProviderChoice } from "../kael-providers/routing.ts";
import type { KaelKnowledgeContext } from "./knowledge.ts";
import {
  sourceTrustHighValueThresholdVnd,
  validateCitations,
  type CitationValidationResult,
  type TrustedPerplexityMarketConfig,
} from "../evidence/source-trust.ts";
import { aggregateTrustedMarketSources } from "../evidence/source-trust-aggregation.ts";

const MARKET_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const MARKET_RANGE_ORDER_INVALID = "MARKET_RANGE_ORDER_INVALID";
const insufficientTrustedDataSchema = z.object({
  error: z.literal("insufficient_trusted_data"),
}).strict();
export const marketStructuredResponseSchema = z.union([
  insufficientTrustedDataSchema,
  marketPriceResultSchema.refine(
    (value) => value.market_range_max >= value.market_range_min,
    { path: ["market_range_max"], message: MARKET_RANGE_ORDER_INVALID },
  ),
]);
export const trustedMarketStructuredResponseSchema = z.union([
  insufficientTrustedDataSchema,
  marketSourceEvidenceResultSchema,
]);
type MarketProviderResponse = z.infer<typeof marketStructuredResponseSchema> |
  z.infer<typeof trustedMarketStructuredResponseSchema>;

export type MarketCacheClient = {
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

export type MarketCacheRow = {
  id?: unknown;
  market_range_min?: unknown;
  market_range_max?: unknown;
  confidence?: unknown;
  sources_summary?: unknown;
};

export type MarketLookupResult =
  | {
    success: true;
    market: MarketPriceResult;
    provider: "anthropic" | "perplexity" | "deepseek";
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    cacheStatus?: AICacheStatus;
    safeMetadata?: Record<string, unknown>;
  }
  | {
    success: false;
    failureReason: string;
    provider?: "anthropic" | "perplexity" | "deepseek";
    model?: string;
    safeMetadata?: Record<string, unknown>;
  };

export async function callMarketProvider(input: {
  route: Pick<ProviderChoice, "provider" | "model">;
  serviceType: ServiceType;
  problem: string;
  complexity: ComplexityLevel;
  district: string;
  secrets: EdgeAiSecrets;
  knowledgeContext: KaelKnowledgeContext | undefined;
  trustedConfig: TrustedPerplexityMarketConfig | null;
  responseSchema: StructuredSchema<MarketProviderResponse>;
  gate: KaelSpendGate | undefined;
  timeoutMs: number;
}) {
  return callStructuredAI({
    purpose: "market_lookup",
    provider: input.route.provider,
    model: input.trustedConfig?.model ?? input.route.model,
    messages: input.trustedConfig?.messages
      ? appendKnowledgeContextToMessages(
        input.trustedConfig.messages,
        input.knowledgeContext?.promptContext,
      )
      : buildPricingMessages(
        input.serviceType,
        input.problem,
        input.complexity,
        input.district,
        input.knowledgeContext?.promptContext,
      ),
    maxTokens: input.trustedConfig?.maxTokens ?? maxTokensForPurpose("market_lookup", 300),
    temperature: 0.1,
    timeoutMs: input.timeoutMs,
    maxRetries: 0,
    searchDomainFilter: input.trustedConfig?.searchDomainFilter,
    searchRecencyFilter: input.trustedConfig?.searchRecencyFilter,
    searchMode: input.trustedConfig?.searchMode,
    searchContextSize: input.trustedConfig?.searchContextSize,
  }, input.responseSchema, input.secrets, input.gate);
}

export async function finalizeMarketRouteResult(input: {
  cacheClient: MarketCacheClient | undefined;
  cacheKey: ReturnType<typeof normalizeMarketCacheKey>;
  serviceType: ServiceType;
  trustedConfig: TrustedPerplexityMarketConfig | null;
  knowledgeContext: KaelKnowledgeContext | undefined;
  routeSafeMetadata: Record<string, unknown> | undefined;
  escalationMetadata: Record<string, unknown> | undefined;
  selectedResult: StructuredAIResponse<MarketProviderResponse>;
  selectedRoute: Pick<ProviderChoice, "provider" | "model">;
  route: Pick<ProviderChoice, "provider" | "model">;
}): Promise<MarketLookupResult | null> {
  if (isInsufficientTrustedData(input.selectedResult.data)) {
    const failureReason = `${input.route.provider}:insufficient_trusted_data`;
    // An empty lookup is still a lookup: without this row nothing records which cases the
    // trusted registry cannot cover, so the evidence gap never becomes reviewable.
    await maybeWriteMarketArtifact(input.cacheClient, {
      key: input.cacheKey,
      serviceType: input.serviceType,
      provider: input.selectedRoute.provider,
      market: null,
      failureReason,
      safeMetadata: marketArtifactMetadata(
        mergeMarketSafeMetadata(input.trustedConfig?.safeMetadata, input.routeSafeMetadata),
        mergeCitations(input.selectedResult.citations),
        null,
      ),
    });
    return input.trustedConfig
      ? trustedMarketFailure(failureReason, input.trustedConfig, input.routeSafeMetadata)
      : null;
  }
  const trustedEvidence = input.trustedConfig
    ? await buildTrustedEvidenceMarket({
      data: input.selectedResult.data,
      providerCitations: input.selectedResult.citations,
      cacheClient: input.cacheClient,
    })
    : null;
  const citationValidation = trustedEvidence?.citationValidation ?? null;
  const safeMetadata = mergeMarketSafeMetadata(
    input.trustedConfig?.safeMetadata,
    input.knowledgeContext?.safeMetadata,
    trustedEvidence?.safeMetadata,
    citationValidation?.safeMetadata,
    input.escalationMetadata,
  );
  if (input.trustedConfig && (!trustedEvidence || !trustedEvidence.success)) {
    const failureReason = `${input.route.provider}:${trustedEvidence?.failureReason ?? "invalid_source_evidence"}`;
    const evidenceCitations = trustedEvidence?.citations ?? [];
    await maybeWriteMarketArtifact(input.cacheClient, {
      key: input.cacheKey,
      serviceType: input.serviceType,
      provider: input.selectedRoute.provider,
      market: null,
      failureReason,
      safeMetadata: marketArtifactMetadata(safeMetadata, evidenceCitations, citationValidation),
    });
    return trustedMarketFailure(failureReason, input.trustedConfig, safeMetadata);
  }
  const marketWithCitations = trustedEvidence?.success
    ? trustedEvidence.market
    : attachCitations(
      input.selectedResult.data as MarketPriceResult,
      input.selectedResult.citations,
    );
  const cacheStatus = await maybeWriteMarketCache(
    input.cacheClient,
    input.cacheKey,
    input.selectedRoute.provider,
    marketWithCitations,
    input.selectedResult.content,
  );
  if (input.trustedConfig || marketWithCitations.citations?.length) {
    await maybeWriteMarketArtifact(input.cacheClient, {
      key: input.cacheKey,
      serviceType: input.serviceType,
      provider: input.selectedRoute.provider,
      market: marketWithCitations,
      failureReason: null,
      safeMetadata: marketArtifactMetadata(
        safeMetadata,
        marketWithCitations.citations ?? [],
        citationValidation,
      ),
    });
  }
  return {
    success: true,
    market: marketWithCitations,
    provider: input.selectedRoute.provider,
    model: input.selectedRoute.model,
    inputTokens: input.selectedResult.usage.inputTokens,
    outputTokens: input.selectedResult.usage.outputTokens,
    costUsd: input.selectedResult.usage.costUsd,
    cacheStatus,
    safeMetadata,
  };
}

export function isInsufficientTrustedData(
  value: unknown,
): value is { error: "insufficient_trusted_data" } {
  return typeof value === "object" && value !== null &&
    (value as Record<string, unknown>).error === "insufficient_trusted_data";
}

type TrustedEvidenceMarketOutcome =
  | {
    success: true;
    market: MarketPriceResult;
    citations: string[];
    citationValidation: CitationValidationResult;
    safeMetadata: Record<string, unknown>;
  }
  | {
    success: false;
    failureReason: string;
    citations: string[];
    citationValidation: CitationValidationResult | null;
    safeMetadata: Record<string, unknown>;
  };

async function buildTrustedEvidenceMarket(input: {
  data: MarketProviderResponse;
  providerCitations: readonly string[] | undefined;
  cacheClient: MarketCacheClient | undefined;
}): Promise<TrustedEvidenceMarketOutcome> {
  if (!isMarketSourceEvidenceResult(input.data)) {
    return {
      success: false,
      failureReason: "invalid_source_evidence",
      citations: mergeCitations(input.providerCitations),
      citationValidation: null,
      safeMetadata: { source_trust_aggregation_result: "invalid_source_evidence" },
    };
  }

  const highValueThresholdVnd = sourceTrustHighValueThresholdVnd();
  const citations = mergeCitations(input.data.citations, input.providerCitations);
  if (highValueThresholdVnd === null) {
    return {
      success: false,
      failureReason: "source_trust_quorum_config_invalid",
      citations,
      citationValidation: null,
      safeMetadata: { source_trust_aggregation_result: "source_trust_quorum_config_invalid" },
    };
  }

  const sourceValidation = await validateCitations(citations, input.cacheClient, 0, {
    maxAutoTier: 4,
    quorumAutoTierMax: 2,
  });
  const aggregation = aggregateTrustedMarketSources({
    sources: input.data.sources,
    acceptedCitations: sourceValidation.accepted,
    highValueThresholdVnd,
  });
  if (!aggregation.success) {
    const evidenceMetadata = mergeMarketSafeMetadata(
      sourceValidation.safeMetadata,
      aggregation.safeMetadata,
      {
        source_trust_raw_source_count: input.data.sources.length,
        source_trust_source_rejections: aggregation.rejected,
      },
    ) ?? {};
    return {
      success: false,
      failureReason: aggregation.failureReason,
      citations,
      citationValidation: sourceValidation,
      safeMetadata: evidenceMetadata,
    };
  }

  const effectiveTierByDomain = new Map(
    aggregation.effectiveTiers.map((item) => [item.domain, item.autoTier]),
  );
  const citationValidation: CitationValidationResult = {
    ...sourceValidation,
    quorumMet: aggregation.quorumMet,
    quorum: aggregation.requiredQuorum,
    accepted: sourceValidation.accepted.map((item) => ({
      ...item,
      autoTier: effectiveTierByDomain.get(item.matchedDomain) ?? item.autoTier,
    })),
    safeMetadata: {
      ...sourceValidation.safeMetadata,
      source_trust_citation_result: aggregation.quorumMet ? "passed" : "weak_quorum",
      source_trust_citation_quorum: aggregation.requiredQuorum,
      source_trust_quorum_eligible_citations: aggregation.tier1Tier2Count,
      source_trust_quorum_met: aggregation.quorumMet,
    },
  };
  const evidenceMetadata = mergeMarketSafeMetadata(
    citationValidation.safeMetadata,
    aggregation.safeMetadata,
    {
      source_trust_raw_source_count: input.data.sources.length,
      source_trust_source_rejections: aggregation.rejected,
    },
  ) ?? {};

  return {
    success: true,
    market: aggregation.market,
    citations: aggregation.market.citations ?? [],
    citationValidation,
    safeMetadata: evidenceMetadata,
  };
}

function isMarketSourceEvidenceResult(
  value: MarketProviderResponse,
): value is MarketSourceEvidenceResult {
  return "sources" in value && !("market_range_min" in value);
}

export function trustedMarketFailure(
  failureReason: string,
  trustedConfig: TrustedPerplexityMarketConfig,
  safeMetadata = trustedConfig.safeMetadata,
) {
  return {
    success: false as const,
    failureReason,
    provider: "perplexity" as const,
    model: trustedConfig.model,
    safeMetadata,
  };
}

function attachCitations(
  market: MarketPriceResult,
  providerCitations: readonly string[] | undefined,
): MarketPriceResult {
  const citations = mergeCitations(market.citations, providerCitations);
  return citations.length > 0 ? { ...market, citations } : market;
}

function mergeCitations(
  ...parts: Array<readonly string[] | undefined>
): string[] {
  return [...new Set(parts.flatMap((part) => part ?? []).filter((item) =>
    typeof item === "string" && item.length > 0
  ))].slice(0, 10);
}

export function mergeMarketSafeMetadata(
  ...parts: Array<Record<string, unknown> | undefined | null>
): Record<string, unknown> | undefined {
  const merged = parts.reduce<Record<string, unknown>>((acc, part) => {
    if (!part) return acc;
    return { ...acc, ...part };
  }, {});
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function marketArtifactMetadata(
  safeMetadata: Record<string, unknown> | undefined,
  citations: readonly string[],
  validation: CitationValidationResult | null,
): Record<string, unknown> {
  return {
    ...(safeMetadata ?? {}),
    citations: citations.map((url) => {
      const accepted = validation?.accepted.find((item) => item.url === url);
      if (accepted) {
        return {
          url,
          domain: accepted.domain,
          matched_domain: accepted.matchedDomain,
          tier: accepted.tier,
          trust_score: accepted.trustScore,
          effective_trust_score: accepted.effectiveTrustScore,
          accepted: true,
        };
      }
      const rejected = validation?.rejected.find((item) => item.url === url);
      return {
        url,
        domain: rejected?.domain ?? null,
        accepted: false,
        reason: rejected?.reason ?? "not_validated",
      };
    }),
  };
}

export function normalizeMarketCacheKey(
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

async function maybeWriteMarketArtifact(
  supabase: MarketCacheClient | undefined,
  input: {
    key: ReturnType<typeof normalizeMarketCacheKey>;
    serviceType: ServiceType;
    provider: "anthropic" | "perplexity" | "deepseek";
    market: MarketPriceResult | null;
    failureReason: string | null;
    safeMetadata: Record<string, unknown>;
  },
) {
  if (!supabase || input.provider !== "perplexity") return;
  try {
    const result = await supabase
      .from("kael_market_artifacts")
      .insert({
        service_type: input.serviceType,
        service_problem_id: null,
        problem_slug: input.key.problem_slug,
        district_code: input.key.district_code,
        complexity: input.key.complexity,
        provider: input.provider,
        market_range_min: input.market?.market_range_min ?? null,
        market_range_max: input.market?.market_range_max ?? null,
        confidence: input.market?.confidence ?? null,
        sources_summary: input.market?.sources_summary ?? null,
        failure_reason: input.failureReason,
        safe_metadata: input.safeMetadata,
      }) as { error?: { code?: string } | null };
    if (result.error) {
      console.warn("kael market artifact insert failed", {
        errorCode: result.error.code ?? "DB_ERROR",
      });
    }
  } catch {
    console.warn("kael market artifact insert failed", {
      errorCode: "MARKET_ARTIFACT_WRITE_REJECTED",
    });
  }
}
