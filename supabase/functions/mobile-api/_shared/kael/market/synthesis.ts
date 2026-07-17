import type { ComplexityLevel, MarketPriceResult, ServiceType, SupabaseLike } from "../types.ts";
import { FALLBACK_PROBLEM_SLUG_BY_SERVICE, PROBLEM_SLUGS_BY_SERVICE } from "../types.ts";
import { positiveNumberFrom, withDbTimeout } from "../_runtime/utils.ts";

const COMPLEXITIES: ComplexityLevel[] = ["small", "medium", "large"];
const MARKET_BLEND_WEIGHT = 0.5;
const INSPECTION_BAND_EXPANSION_FACTOR = 0.15;
export const MARKET_PRICE_MAX_DEVIATION_FACTOR = 4;

type BaselinePrice = {
  priceMin: number;
  priceMax: number;
};

export type BaselineResult =
  | {
    success: true;
    priceMin: number;
    priceMax: number;
    serviceProblemId: string;
  }
  | {
    success: false;
    error: string;
  };

export type BaselineCandidatesResult =
  | {
    success: true;
    serviceProblemId: string;
    byComplexity: Partial<Record<ComplexityLevel, BaselinePrice>>;
  }
  | {
    success: false;
    error: string;
  };

export function normalizeProblemSlugForService(
  serviceType: ServiceType,
  problemSlug: string,
): { slug: string; normalized: boolean } {
  const allowed = PROBLEM_SLUGS_BY_SERVICE[serviceType];
  const trimmed = problemSlug.trim();
  const variants = [
    trimmed,
    trimmed.toLowerCase(),
    trimmed.toLowerCase().replace(/\s+/g, "_"),
  ];
  const match = variants.find((variant) => allowed.includes(variant));
  if (match) return { slug: match, normalized: match !== problemSlug };
  return {
    slug: FALLBACK_PROBLEM_SLUG_BY_SERVICE[serviceType],
    normalized: true,
  };
}

export function synthesizePrice(input: {
  baselineMin: number;
  baselineMax: number;
  market: MarketPriceResult | null;
  complexityHint: ComplexityLevel;
  needsInspection?: boolean;
}): { price_min: number; price_max: number; confidence: number } {
  const market = clampMarketPriceToBaseline(input.market, {
    priceMin: input.baselineMin,
    priceMax: input.baselineMax,
  });
  if (input.market && !market) {
    console.warn("market price clamp rejected source-trust market range", {
      maxDeviationFactor: MARKET_PRICE_MAX_DEVIATION_FACTOR,
    });
  }
  if (!market) {
    const baseline = inspectionAdjustedBand(
      input.baselineMin,
      input.baselineMax,
      input.needsInspection === true,
    );
    return {
      price_min: baseline.priceMin,
      price_max: baseline.priceMax,
      confidence: 0.4,
    };
  }

  // The baseline row is already selected for the effective complexity. Market
  // lookup runs in parallel at medium complexity, so only its half of the blend
  // needs the small/large adjustment.
  const marketComplexityMultiplier = input.complexityHint === "large"
    ? 1.2
    : input.complexityHint === "small"
    ? 0.85
    : 1;
  let priceMin = Math.round(
    market.market_range_min * marketComplexityMultiplier * MARKET_BLEND_WEIGHT +
      input.baselineMin * (1 - MARKET_BLEND_WEIGHT),
  );
  let priceMax = Math.round(
    market.market_range_max * marketComplexityMultiplier * MARKET_BLEND_WEIGHT +
      input.baselineMax * (1 - MARKET_BLEND_WEIGHT),
  );

  priceMin = Math.round(priceMin / 1000) * 1000;
  priceMax = Math.round(priceMax / 1000) * 1000;
  if (priceMax <= priceMin) priceMax = priceMin + 50_000;
  const inspectionAdjusted = inspectionAdjustedBand(
    priceMin,
    priceMax,
    input.needsInspection === true,
  );
  return {
    price_min: inspectionAdjusted.priceMin,
    price_max: inspectionAdjusted.priceMax,
    confidence:
      Math.round(
        Math.min(
          input.needsInspection ? 0.44 : 0.85,
          (market.confidence + 0.5) / 2,
        ) * 100,
      ) /
      100,
  };
}

export function clampMarketPriceToBaseline(
  market: MarketPriceResult | null,
  baseline: { priceMin: number; priceMax: number },
): MarketPriceResult | null {
  if (!market) return null;
  if (!(baseline.priceMin > 0) || !(baseline.priceMax > 0)) return market;
  const minOutOfBand =
    market.market_range_min < baseline.priceMin / MARKET_PRICE_MAX_DEVIATION_FACTOR ||
    market.market_range_min > baseline.priceMin * MARKET_PRICE_MAX_DEVIATION_FACTOR;
  const maxOutOfBand =
    market.market_range_max < baseline.priceMax / MARKET_PRICE_MAX_DEVIATION_FACTOR ||
    market.market_range_max > baseline.priceMax * MARKET_PRICE_MAX_DEVIATION_FACTOR;
  return minOutOfBand || maxOutOfBand ? null : market;
}

function inspectionAdjustedBand(
  priceMin: number,
  priceMax: number,
  needsInspection: boolean,
): { priceMin: number; priceMax: number } {
  if (!needsInspection) return { priceMin, priceMax };
  return {
    priceMin: Math.round(priceMin * (1 - INSPECTION_BAND_EXPANSION_FACTOR) / 1000) * 1000,
    priceMax: Math.round(priceMax * (1 + INSPECTION_BAND_EXPANSION_FACTOR) / 1000) * 1000,
  };
}

export async function fetchBaseline(
  supabase: SupabaseLike,
  serviceType: ServiceType,
  problemSlug: string,
  complexity: ComplexityLevel,
  district: string,
): Promise<BaselineResult> {
  return pickBaselineCandidate(
    await fetchBaselineCandidates(supabase, serviceType, problemSlug, district),
    complexity,
  );
}

export async function fetchBaselineCandidates(
  supabase: SupabaseLike,
  serviceType: ServiceType,
  problemSlug: string,
  district: string,
): Promise<BaselineCandidatesResult> {
  const districts = district === "hcmc_all"
    ? ["hcmc_all"]
    : [district, "hcmc_all"];
  const { data: problems, error: problemError } = await withDbTimeout<
    {
      data: Array<Record<string, unknown>> | null;
      error: { code?: string; message?: string } | null;
    }
  >(
    supabase
      .from("service_problems")
      .select("id")
      .eq("service_type", serviceType)
      .eq("slug", problemSlug) as PromiseLike<
        {
          data: Array<Record<string, unknown>> | null;
          error: { code?: string; message?: string } | null;
        }
      >,
  );
  if (problemError) {
    console.warn("Baseline problem lookup failed", {
      serviceType,
      problemSlug,
      errorCode: problemError.code,
    });
    return { success: false, error: "baseline problem lookup failed" };
  }
  const problemId = problems?.[0]?.id;
  if (typeof problemId !== "string" || problemId.length === 0) {
    return { success: false, error: "no service problem" };
  }

  const { data, error } = await withDbTimeout<
    {
      data: Array<Record<string, unknown>> | null;
      error: { code?: string; message?: string } | null;
    }
  >(
    supabase
      .from("price_baselines")
      .select("complexity, price_min, price_max, district_code")
      .eq("service_problem_id", problemId)
      .eq("service_type", serviceType)
      .in("district_code", districts) as PromiseLike<
        {
          data: Array<Record<string, unknown>> | null;
          error: { code?: string; message?: string } | null;
        }
      >,
  );

  if (error) {
    console.warn("Baseline query failed", {
      serviceType,
      district,
      errorCode: error.code,
    });
    return { success: false, error: "baseline query failed" };
  }
  if (!data || data.length === 0) {
    return { success: false, error: "no baseline" };
  }

  const byComplexity: Partial<Record<ComplexityLevel, BaselinePrice>> = {};
  for (const complexity of COMPLEXITIES) {
    const exact = data.find((row) =>
      row.complexity === complexity && row.district_code === district
    );
    const citywide = data.find((row) =>
      row.complexity === complexity && row.district_code === "hcmc_all"
    );
    const chosen = exact ?? citywide;
    if (!chosen) continue;
    const priceMin = positiveNumberFrom(chosen.price_min);
    const priceMax = positiveNumberFrom(chosen.price_max);
    if (priceMin === null || priceMax === null || priceMax < priceMin) {
      console.warn("Baseline row failed price validation", {
        serviceType,
        complexity,
        district,
      });
      continue;
    }
    byComplexity[complexity] = { priceMin, priceMax };
  }

  if (Object.keys(byComplexity).length === 0) {
    return { success: false, error: "invalid baseline" };
  }

  return {
    success: true,
    serviceProblemId: problemId,
    byComplexity,
  };
}

export function pickBaselineCandidate(
  candidates: BaselineCandidatesResult,
  complexity: ComplexityLevel,
): BaselineResult {
  if (!candidates.success) return candidates;
  const chosen = candidates.byComplexity[complexity] ??
    candidates.byComplexity.medium ??
    candidates.byComplexity.small ??
    candidates.byComplexity.large;
  if (!chosen) return { success: false, error: "no matching baseline" };
  return {
    success: true,
    priceMin: chosen.priceMin,
    priceMax: chosen.priceMax,
    serviceProblemId: candidates.serviceProblemId,
  };
}
