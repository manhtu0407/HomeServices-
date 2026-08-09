import type {
  ComplexityLevel,
  EdgeAiSecrets,
  MarketPriceResult,
  ServiceType,
} from "../contracts/types.ts";
import type { KaelSpendGate } from "../kael-guardrails/spend-gate.ts";
import { marketPriceResultSchema } from "../contracts/types.ts";
import { hasStructuredValidationIssue } from "../kael-providers/structured-call.ts";
import { readKaelOptimizationFlags } from "../kael-usage/cost-tracking.ts";
import { circuitAwareProviderCandidatesForPurpose } from "../kael-providers/routing.ts";
import { logKaelEscalation, selectKaelEscalation } from "../kael-guardrails/escalation.ts";
import {
  retrieveKaelKnowledgeContextIfEnabled,
  type KaelKnowledgeContext,
} from "./knowledge.ts";
import {
  isSourceTrustPerplexityFilterEnabled,
  trustedPerplexityMarketConfig,
  trustedPerplexityMarketConfigForClient,
} from "../evidence/source-trust.ts";
import {
  MARKET_RANGE_ORDER_INVALID,
  callMarketProvider,
  finalizeMarketRouteResult,
  isInsufficientTrustedData,
  marketStructuredResponseSchema,
  mergeMarketSafeMetadata,
  normalizeMarketCacheKey,
  trustedMarketFailure,
  trustedMarketStructuredResponseSchema,
  type MarketCacheClient,
  type MarketCacheRow,
  type MarketLookupResult,
} from "./market-provider.ts";

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
): Promise<MarketLookupResult> {
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

  const knowledgeContext = options.knowledgeContext ??
    (hasMarketProviderSecrets(secrets)
      ? await retrieveKaelKnowledgeContextIfEnabled(cacheClient, {
        serviceType,
        problemSlug: cacheKey.problem_slug,
        safetyTopic: "worker_safety_advisory",
        legalTopic: "legal_safety_awareness",
      }, secrets)
      : undefined);
  return searchMarketRoutes({
    serviceType,
    problem,
    complexity,
    district,
    secrets,
    cacheClient,
    cacheKey,
    sourceTrustEnabled,
    knowledgeContext,
    options,
  });
}

async function searchMarketRoutes(input: {
  serviceType: ServiceType;
  problem: string;
  complexity: ComplexityLevel;
  district: string;
  secrets: EdgeAiSecrets;
  cacheClient: MarketCacheClient | undefined;
  cacheKey: ReturnType<typeof normalizeMarketCacheKey>;
  sourceTrustEnabled: boolean;
  knowledgeContext: KaelKnowledgeContext | undefined;
  options: { knowledgeContext?: KaelKnowledgeContext; gate?: KaelSpendGate };
}): Promise<MarketLookupResult> {
  const {
    serviceType,
    problem,
    complexity,
    district,
    secrets,
    cacheClient,
    cacheKey,
    sourceTrustEnabled,
    knowledgeContext,
    options,
  } = input;
  const failures: string[] = [];
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
    const result = await callMarketProvider({
      route,
      serviceType,
      problem,
      complexity,
      district,
      secrets,
      knowledgeContext,
      trustedConfig,
      responseSchema,
      gate: options.gate,
      timeoutMs: trustedConfig?.timeoutMs ?? route.latencyBudgetMs,
    });

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
      const escalatedResult = await callMarketProvider({
        route: escalation.route,
        serviceType,
        problem,
        complexity,
        district,
        secrets,
        knowledgeContext,
        trustedConfig,
        responseSchema,
        gate: options.gate,
        timeoutMs: route.latencyBudgetMs,
      });
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

    const finalized = await finalizeMarketRouteResult({
      cacheClient,
      cacheKey,
      serviceType,
      trustedConfig,
      knowledgeContext,
      routeSafeMetadata,
      escalationMetadata,
      selectedResult,
      selectedRoute,
      route,
    });
    if (finalized) return finalized;
    failures.push(`${route.provider}:insufficient_trusted_data`);
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

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
