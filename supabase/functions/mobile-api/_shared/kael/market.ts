import { z } from "zod";
import type {
  AICacheStatus,
  ComplexityLevel,
  EdgeAiSecrets,
  MarketPriceResult,
  MarketSourceEvidenceResult,
  ServiceType,
} from "./types.ts";
import type { KaelSpendGate } from "./kael-guardrails/spend-gate.ts";
import {
  marketPriceResultSchema,
  marketSourceEvidenceResultSchema,
} from "./types.ts";
import { appendKnowledgeContextToMessages, buildPricingMessages } from "./prompts.ts";
import {
  callStructuredAI,
  hasStructuredValidationIssue,
  type StructuredSchema,
} from "./structured-call.ts";
import { readKaelOptimizationFlags } from "./kael-usage/cost-tracking.ts";
import { maxTokensForPurpose } from "./kael-providers/routing.config.ts";
import { circuitAwareProviderCandidatesForPurpose } from "./kael-providers/routing.ts";
import { logKaelEscalation, selectKaelEscalation } from "./escalation.ts";
import {
  retrieveKaelKnowledgeContextIfEnabled,
  type KaelKnowledgeContext,
} from "./knowledge.ts";
import {
  isSourceTrustPerplexityFilterEnabled,
  sourceTrustHighValueThresholdVnd,
  trustedPerplexityMarketConfig,
  trustedPerplexityMarketConfigForClient,
  validateCitations,
  type CitationValidationResult,
  type TrustedPerplexityMarketConfig,
} from "./source-trust.ts";
import { aggregateTrustedMarketSources } from "./source-trust-aggregation.ts";

const MARKET_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MARKET_RANGE_ORDER_INVALID = "MARKET_RANGE_ORDER_INVALID";
const insufficientTrustedDataSchema = z.object({
  error: z.literal("insufficient_trusted_data"),
}).strict();
const marketStructuredResponseSchema = z.union([
  insufficientTrustedDataSchema,
  marketPriceResultSchema.refine(
    (value) => value.market_range_max >= value.market_range_min,
    { path: ["market_range_max"], message: MARKET_RANGE_ORDER_INVALID },
  ),
]);
const trustedMarketStructuredResponseSchema = z.union([
  insufficientTrustedDataSchema,
  marketSourceEvidenceResultSchema,
]);
type MarketProviderResponse = z.infer<typeof marketStructuredResponseSchema> |
  z.infer<typeof trustedMarketStructuredResponseSchema>;

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

export function marketLookupTelemetry(input: {
  serviceType: ServiceType;
  problem: string;
  complexity: ComplexityLevel;
  district: string;
  secrets: EdgeAiSecrets;
}): {
  provider: "perplexity";
  model: string;
  timeoutMs?: number;
  safeMetadata?: Record<string, unknown>;
} {
  if (isSourceTrustPerplexityFilterEnabledForSecrets(input.secrets)) {
    const trustedConfig = trustedPerplexityMarketConfig(input);
    return {
      provider: "perplexity",
      model: trustedConfig.model,
      timeoutMs: trustedConfig.timeoutMs,
      safeMetadata: trustedConfig.safeMetadata,
    };
  }
  return { provider: "perplexity", model: "sonar" };
}

export async function searchMarketPrice(
  serviceType: ServiceType,
  problem: string,
  complexity: ComplexityLevel,
  district: string,
  secrets: EdgeAiSecrets,
  supabase?: unknown,
  options: { knowledgeContext?: KaelKnowledgeContext; gate?: KaelSpendGate } = {},
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
    safeMetadata?: Record<string, unknown>;
  } | {
    success: false;
    failureReason: string;
    provider?: "anthropic" | "perplexity" | "deepseek";
    model?: string;
    safeMetadata?: Record<string, unknown>;
  }
> {
  const cacheClient = asMarketCacheClient(supabase);
  const cacheKey = normalizeMarketCacheKey(
    serviceType,
    problem,
    complexity,
    district,
  );
  const sourceTrustEnabled = isSourceTrustPerplexityFilterEnabledForSecrets(
    secrets,
  );

  if (
    readKaelOptimizationFlags().KAEL_OPT_MARKET_CACHE_ENABLED &&
    cacheClient &&
    !sourceTrustEnabled
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
  const knowledgeContext = options.knowledgeContext ??
    (hasMarketProviderSecrets(secrets)
      ? await retrieveKaelKnowledgeContextIfEnabled(cacheClient, {
        serviceType,
        problemSlug: cacheKey.problem_slug,
        safetyTopic: "worker_safety_advisory",
        legalTopic: "legal_safety_awareness",
      }, secrets)
      : undefined);
  let lastAttempt: {
    provider: "anthropic" | "perplexity" | "deepseek";
    model: string;
    safeMetadata?: Record<string, unknown>;
  } | undefined;
  const marketRoutes = circuitAwareProviderCandidatesForPurpose("market_lookup")
    .filter((route) => route.provider === "perplexity");
  for (const route of marketRoutes) {
    const trustedConfig = route.provider === "perplexity" && sourceTrustEnabled
      ? await trustedPerplexityMarketConfigForClient({
        serviceType,
        problem,
        complexity,
        district,
      }, cacheClient)
      : null;
    const routeSafeMetadata = mergeMarketSafeMetadata(
      trustedConfig?.safeMetadata,
      knowledgeContext?.safeMetadata,
    );
    lastAttempt = {
      provider: route.provider,
      model: trustedConfig?.model ?? route.model,
      safeMetadata: routeSafeMetadata,
    };
    const responseSchema = trustedConfig
      ? trustedMarketStructuredResponseSchema
      : marketStructuredResponseSchema;
    const result = await callStructuredAI({
      purpose: "market_lookup",
      provider: route.provider,
      model: trustedConfig?.model ?? route.model,
      messages: trustedConfig?.messages
        ? appendKnowledgeContextToMessages(
          trustedConfig.messages,
          knowledgeContext?.promptContext,
        )
        : buildPricingMessages(
          serviceType,
          problem,
          complexity,
          district,
          knowledgeContext?.promptContext,
        ),
      maxTokens: trustedConfig?.maxTokens ?? maxTokensForPurpose("market_lookup", 300),
      temperature: 0.1,
      timeoutMs: trustedConfig?.timeoutMs ?? route.latencyBudgetMs,
      maxRetries: 0,
      searchDomainFilter: trustedConfig?.searchDomainFilter,
      searchRecencyFilter: trustedConfig?.searchRecencyFilter,
      searchMode: trustedConfig?.searchMode,
      searchContextSize: trustedConfig?.searchContextSize,
    }, responseSchema as StructuredSchema<MarketProviderResponse>, secrets, options.gate);

    if (!result.success) {
      const failureReason = result.code === "SCHEMA_INVALID"
        ? hasStructuredValidationIssue(result, MARKET_RANGE_ORDER_INVALID)
          ? `${route.provider}:market_range_max < market_range_min`
          : `${route.provider}:AI market JSON validation failed`
        : `${route.provider}:AI call failed: ${result.code}`;
      if (trustedConfig && result.code !== "OPEN_CIRCUIT") {
        return trustedMarketFailure(failureReason, trustedConfig, routeSafeMetadata);
      }
      failures.push(failureReason);
      continue;
    }

    let selectedResult = result;
    let selectedRoute = {
      provider: route.provider,
      model: trustedConfig?.model ?? route.model,
    };
    let escalationMetadata: Record<string, unknown> | undefined;
    const escalation = selectKaelEscalation("market_lookup", {
      ...selectedRoute,
      confidence: marketConfidence(selectedResult.data),
    });
    if (escalation && !isInsufficientTrustedData(selectedResult.data)) {
      logKaelEscalation("market_lookup", escalation);
      const escalatedResult = await callStructuredAI({
        purpose: "market_lookup",
        provider: escalation.route.provider,
        model: escalation.route.model,
        messages: trustedConfig?.messages
          ? appendKnowledgeContextToMessages(
            trustedConfig.messages,
            knowledgeContext?.promptContext,
          )
          : buildPricingMessages(
            serviceType,
            problem,
            complexity,
            district,
            knowledgeContext?.promptContext,
          ),
        maxTokens: trustedConfig?.maxTokens ?? maxTokensForPurpose("market_lookup", 300),
        temperature: 0.1,
        timeoutMs: route.latencyBudgetMs,
        maxRetries: 0,
        searchDomainFilter: trustedConfig?.searchDomainFilter,
        searchRecencyFilter: trustedConfig?.searchRecencyFilter,
        searchMode: trustedConfig?.searchMode,
        searchContextSize: trustedConfig?.searchContextSize,
      }, responseSchema as StructuredSchema<MarketProviderResponse>, secrets, options.gate);
      if (escalatedResult.success && !isInsufficientTrustedData(escalatedResult.data)) {
        selectedResult = escalatedResult;
        selectedRoute = escalation.route;
        escalationMetadata = { model_escalation_reason: escalation.reason };
        lastAttempt = {
          provider: selectedRoute.provider,
          model: selectedRoute.model,
          safeMetadata: mergeMarketSafeMetadata(routeSafeMetadata, escalationMetadata),
        };
      }
    }

    if (isInsufficientTrustedData(selectedResult.data)) {
      const failureReason = `${route.provider}:insufficient_trusted_data`;
      if (trustedConfig) {
        return trustedMarketFailure(failureReason, trustedConfig, routeSafeMetadata);
      }
      failures.push(failureReason);
      continue;
    }
    const trustedEvidence = trustedConfig
      ? await buildTrustedEvidenceMarket({
        data: selectedResult.data,
        providerCitations: selectedResult.citations,
        cacheClient,
      })
      : null;
    const citationValidation = trustedEvidence?.citationValidation ?? null;
    const safeMetadata = mergeMarketSafeMetadata(
      trustedConfig?.safeMetadata,
      knowledgeContext?.safeMetadata,
      trustedEvidence?.safeMetadata,
      citationValidation?.safeMetadata,
      escalationMetadata,
    );
    if (trustedConfig && (!trustedEvidence || !trustedEvidence.success)) {
      const failureReason = `${route.provider}:${trustedEvidence?.failureReason ?? "invalid_source_evidence"}`;
      const evidenceCitations = trustedEvidence?.citations ?? [];
      await maybeWriteMarketArtifact(cacheClient, {
        key: cacheKey,
        serviceType,
        provider: selectedRoute.provider,
        market: null,
        failureReason,
        safeMetadata: marketArtifactMetadata(
          safeMetadata,
          evidenceCitations,
          citationValidation,
        ),
      });
      return trustedMarketFailure(failureReason, trustedConfig, safeMetadata);
    }
    const marketWithCitations = trustedEvidence?.success
      ? trustedEvidence.market
      : attachCitations(selectedResult.data as MarketPriceResult, selectedResult.citations);
    const cacheStatus = await maybeWriteMarketCache(
      cacheClient,
      cacheKey,
      selectedRoute.provider,
      marketWithCitations,
      selectedResult.content,
    );
    if (trustedConfig || marketWithCitations.citations?.length) {
      await maybeWriteMarketArtifact(cacheClient, {
        key: cacheKey,
        serviceType,
        provider: selectedRoute.provider,
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
      provider: selectedRoute.provider,
      model: selectedRoute.model,
      inputTokens: selectedResult.usage.inputTokens,
      outputTokens: selectedResult.usage.outputTokens,
      costUsd: selectedResult.usage.costUsd,
      cacheStatus,
      safeMetadata,
    };
  }
  return {
    success: false,
    failureReason: failures.join("; ") || "NO_PROVIDER_AVAILABLE",
    provider: lastAttempt?.provider,
    model: lastAttempt?.model,
    safeMetadata: lastAttempt?.safeMetadata,
  };
}

function marketConfidence(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const confidence = (value as Record<string, unknown>).confidence;
  return typeof confidence === "number" && Number.isFinite(confidence)
    ? confidence
    : null;
}

function isInsufficientTrustedData(
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

function trustedMarketFailure(
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

function mergeMarketSafeMetadata(
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

function isSourceTrustPerplexityFilterEnabledForSecrets(
  secrets: EdgeAiSecrets,
): boolean {
  return secrets.sourceTrustPerplexityFilterEnabled === true ||
    isSourceTrustPerplexityFilterEnabled();
}

function hasMarketProviderSecrets(secrets: EdgeAiSecrets): boolean {
  return Boolean(
    secrets.perplexityApiKey || secrets.anthropicApiKey || secrets.deepseekApiKey,
  );
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
  try {
    const result = await supabase.rpc("increment_kael_market_cache_hit", {
      p_cache_id: cacheId,
    }) as { error?: { code?: string } | null };
    if (result.error) {
      console.warn("kael market cache-hit update failed", {
        errorCode: result.error.code ?? "DB_ERROR",
      });
    }
  } catch {
    console.warn("kael market cache-hit update failed", {
      errorCode: "MARKET_CACHE_HIT_WRITE_REJECTED",
    });
  }
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

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
