import type { ComplexityLevel, MarketPriceResult, ServiceType, SupabaseLike } from "../contracts/types.ts";
import { FALLBACK_PROBLEM_SLUG_BY_SERVICE, PROBLEM_SLUGS_BY_SERVICE } from "../contracts/types.ts";
import {
  baselinePriceEvidenceCitationUrls,
  validateBaselinePriceEvidence,
  type BaselinePriceEvidenceReceipt,
} from "../evidence/baseline-price-evidence.ts";
import {
  sourceTrustHighValueThresholdVnd,
  validateCitations,
} from "../evidence/source-trust.ts";
import { positiveNumberFrom, withDbTimeout } from "../pipeline/utils.ts";

const COMPLEXITIES: ComplexityLevel[] = ["small", "medium", "large"];
const MARKET_BLEND_WEIGHT = 0.5;
const INSPECTION_BAND_EXPANSION_FACTOR = 0.15;
const MARKET_PRICE_MAX_DEVIATION_FACTOR = 4;

export type BaselinePrice = {
  districtCode: string;
  evidenceReceipt?: BaselinePriceEvidenceReceipt | null;
  priceMin: number;
  priceMax: number;
  source: string | null;
};

export type BaselineResult =
  | {
    success: true;
    priceMin: number;
    priceMax: number;
    serviceProblemId: string;
    matchedDistrict: string;
    evidenceReceipt: BaselinePriceEvidenceReceipt | null;
    source: string | null;
    marketAnchored?: true;
  }
  | {
    success: false;
    error: string;
  };

export type BaselineCandidatesResult =
  | {
    success: true;
    serviceProblemId: string;
    defaultComplexity?: ComplexityLevel;
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
  marketAnchored?: boolean;
}): { price_min: number; price_max: number; confidence: number } {
  if (input.marketAnchored && input.market) {
    return marketAnchoredPrice(input.market, input.needsInspection === true);
  }
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

// Without a source-verified baseline, the only grounded numbers are the verified market
// sources. Blending them with an unverified seed row would put an unsourced half into the
// customer's price, so the aggregate is used as researched for the case's own complexity.
function marketAnchoredPrice(
  market: MarketPriceResult,
  needsInspection: boolean,
): { price_min: number; price_max: number; confidence: number } {
  const priceMin = Math.round(market.market_range_min / 1000) * 1000;
  let priceMax = Math.round(market.market_range_max / 1000) * 1000;
  if (priceMax < priceMin) priceMax = priceMin;
  const band = inspectionAdjustedBand(priceMin, priceMax, needsInspection);
  return {
    price_min: band.priceMin,
    price_max: band.priceMax,
    confidence: Math.round(Math.min(needsInspection ? 0.44 : 0.85, market.confidence) * 100) / 100,
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
      .select("id, default_complexity")
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
  const defaultComplexity = complexityLevelFrom(problems?.[0]?.default_complexity);

  const { data, error } = await withDbTimeout<
    {
      data: Array<Record<string, unknown>> | null;
      error: { code?: string; message?: string } | null;
    }
  >(
    supabase
      .from("price_baselines")
      .select("complexity, price_min, price_max, district_code, source, price_evidence")
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
    const districtCode = typeof chosen.district_code === "string"
      ? chosen.district_code
      : "hcmc_all";
    const source = typeof chosen.source === "string" && chosen.source.trim().length > 0
      ? chosen.source.trim()
      : null;
    const evidenceReceipt = await validateStoredBaselineEvidence({
      priceEvidence: chosen.price_evidence,
      priceMin,
      priceMax,
      supabase,
    });
    byComplexity[complexity] = {
      districtCode,
      evidenceReceipt,
      priceMin,
      priceMax,
      source,
    };
  }

  if (Object.keys(byComplexity).length === 0) {
    return { success: false, error: "invalid baseline" };
  }

  return {
    success: true,
    serviceProblemId: problemId,
    ...(defaultComplexity ? { defaultComplexity } : {}),
    byComplexity,
  };
}

function complexityLevelFrom(value: unknown): ComplexityLevel | undefined {
  return typeof value === "string" &&
      (COMPLEXITIES as readonly string[]).includes(value)
    ? value as ComplexityLevel
    : undefined;
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
    matchedDistrict: chosen.districtCode,
    evidenceReceipt: chosen.evidenceReceipt ?? null,
    source: chosen.source,
  };
}

async function validateStoredBaselineEvidence(input: {
  priceEvidence: unknown;
  priceMin: number;
  priceMax: number;
  supabase: SupabaseLike;
}): Promise<BaselinePriceEvidenceReceipt | null> {
  const citationUrls = baselinePriceEvidenceCitationUrls(input.priceEvidence);
  const highValueThresholdVnd = sourceTrustHighValueThresholdVnd();
  if (citationUrls.length === 0 || highValueThresholdVnd === null) return null;
  const registry = await validateCitations(citationUrls, input.supabase, 1, {
    maxAutoTier: 4,
    quorumAutoTierMax: 2,
  });
  const validation = validateBaselinePriceEvidence({
    baselinePriceMin: input.priceMin,
    baselinePriceMax: input.priceMax,
    document: input.priceEvidence,
    highValueThresholdVnd,
    registryCitations: registry.accepted,
  });
  if (!validation.success) {
    console.warn("Baseline price evidence rejected", {
      reason: validation.error,
    });
    return null;
  }
  return validation.receipt;
}

type VerifiedScopeChangePricingBasis = {
  calculation: string;
  quantity: number | null;
  unit: "cabinet_door_scope" | "accepted_scope";
  unitPriceMin: number | null;
  unitPriceMax: number | null;
};

type VerifiedScopeChangePricingComponent = {
  evidenceReceipt: BaselinePriceEvidenceReceipt;
  kind: "approved_scope_change" | "original_confirmed_scope";
  priceMax: number;
  priceMin: number;
  selectedPrice: number;
};

export type VerifiedScopeChangePriceResult =
  | {
    success: true;
    baselineDistrict: string;
    baselineEvidence: BaselinePriceEvidenceReceipt;
    baselineSource: string;
    baselineUsed: string;
    priceMin: number;
    priceMax: number;
    priceSource: "verified_baseline";
    pricingBasis: VerifiedScopeChangePricingBasis;
    pricingComponents?: readonly VerifiedScopeChangePricingComponent[];
    pricingMode: "full_scope_total";
    problemSlug: string;
    referencePriceMax: number;
    referencePriceMin: number;
    selectionRule: "verified_neutral_midpoint_with_bilateral_confirmation";
    serviceProblemId: string;
    stakeholderBalance: {
      commissionLevel: number;
      commissionRateBps: number;
      customerConfirmationRequired: true;
      customerTotal: number;
      platformFee: number;
      workerConfirmationRequired: true;
      workerNet: number;
    };
  }
  | { success: false; error: string };

export function resolveVerifiedScopeChangePrice(input: {
  candidates: BaselineCandidatesResult;
  complexity: ComplexityLevel;
  district: string;
  commissionTier: {
    level: number;
    rateBps: number;
  } | null;
  originalScope?: {
    evidenceReceipt: BaselinePriceEvidenceReceipt;
    priceMax: number;
    priceMin: number;
  };
  pricingFactors: {
    accessCondition: "normal" | "restricted" | "unknown";
    materialTier: "standard" | "specialty" | "unknown";
    quantity: number;
    secondaryDamage: "none_confirmed" | "present" | "unknown";
  };
  problemSlug: string;
  scopeExclusions?: {
    materialsExcluded: boolean;
    surfaceFinishExcluded: boolean;
  };
  serviceType: ServiceType;
}): VerifiedScopeChangePriceResult {
  if (!PROBLEM_SLUGS_BY_SERVICE[input.serviceType].includes(input.problemSlug)) {
    return { success: false, error: "problem slug is outside selected service" };
  }
  if (!input.candidates.success) {
    return { success: false, error: input.candidates.error };
  }
  const exact = input.candidates.byComplexity[input.complexity];
  if (!exact) {
    return { success: false, error: "no exact verified baseline" };
  }
  if (!exact.source || !exact.evidenceReceipt) {
    return { success: false, error: "baseline provenance missing" };
  }
  if (!input.commissionTier) {
    return { success: false, error: "worker commission tier unavailable" };
  }
  if (input.problemSlug === "pipe_leak") {
    return resolveVerifiedPipeLeakScopeChange({
      candidates: input.candidates,
      commissionTier: input.commissionTier,
      complexity: input.complexity,
      exact,
      originalScope: input.originalScope,
      pricingFactors: input.pricingFactors,
      problemSlug: input.problemSlug,
      scopeExclusions: input.scopeExclusions,
      serviceType: input.serviceType,
    });
  }
  if (input.problemSlug !== "replace_cabinet_hinges") {
    return { success: false, error: "case pricing strategy missing" };
  }
  if (exact.evidenceReceipt.unit !== "per_cabinet_door") {
    return { success: false, error: "case pricing unit does not match scope" };
  }
  if (input.pricingFactors.quantity !== 2) {
    return { success: false, error: "scope quantity does not match baseline" };
  }
  if (input.pricingFactors.accessCondition !== "normal") {
    return { success: false, error: "access condition is not confirmed" };
  }
  if (input.pricingFactors.secondaryDamage !== "none_confirmed") {
    return { success: false, error: "secondary damage is not ruled out" };
  }
  if (input.pricingFactors.materialTier !== "standard") {
    return { success: false, error: "material tier is not confirmed" };
  }
  const pricingBasis = scopeChangePricingBasis(
    input.problemSlug,
    exact.priceMin,
    exact.priceMax,
    exact.evidenceReceipt,
  );
  const customerTotal = pricingBasis.unitPriceMin! * (pricingBasis.quantity ?? 1);
  const platformFee = Math.round(
    customerTotal * input.commissionTier.rateBps / 10_000,
  );
  return {
    success: true,
    baselineDistrict: exact.districtCode,
    baselineEvidence: exact.evidenceReceipt,
    baselineSource: exact.source,
    baselineUsed: [
      input.serviceType,
      input.problemSlug,
      input.complexity,
      exact.districtCode,
    ].join(":"),
    priceMin: customerTotal,
    priceMax: customerTotal,
    priceSource: "verified_baseline",
    pricingBasis,
    pricingMode: "full_scope_total",
    problemSlug: input.problemSlug,
    referencePriceMax: exact.priceMax,
    referencePriceMin: exact.priceMin,
    selectionRule: "verified_neutral_midpoint_with_bilateral_confirmation",
    serviceProblemId: input.candidates.serviceProblemId,
    stakeholderBalance: {
      commissionLevel: input.commissionTier.level,
      commissionRateBps: input.commissionTier.rateBps,
      customerConfirmationRequired: true,
      customerTotal,
      platformFee,
      workerConfirmationRequired: true,
      workerNet: customerTotal - platformFee,
    },
  };
}

function resolveVerifiedPipeLeakScopeChange(input: {
  commissionTier: { level: number; rateBps: number };
  complexity: ComplexityLevel;
  exact: BaselinePrice;
  originalScope?: {
    evidenceReceipt: BaselinePriceEvidenceReceipt;
    priceMax: number;
    priceMin: number;
  };
  pricingFactors: {
    accessCondition: "normal" | "restricted" | "unknown";
    materialTier: "standard" | "specialty" | "unknown";
    quantity: number;
    secondaryDamage: "none_confirmed" | "present" | "unknown";
  };
  problemSlug: string;
  scopeExclusions?: {
    materialsExcluded: boolean;
    surfaceFinishExcluded: boolean;
  };
  serviceType: ServiceType;
  candidates: Extract<BaselineCandidatesResult, { success: true }>;
}): VerifiedScopeChangePriceResult {
  const repairEvidence = input.exact.evidenceReceipt;
  if (!repairEvidence || repairEvidence.unit !== "per_repair_point") {
    return { success: false, error: "case pricing unit does not match scope" };
  }
  if (input.pricingFactors.quantity !== 1) {
    return { success: false, error: "scope quantity does not match baseline" };
  }
  if (input.pricingFactors.accessCondition !== "normal") {
    return { success: false, error: "access condition is not confirmed" };
  }
  if (input.pricingFactors.secondaryDamage !== "none_confirmed") {
    return { success: false, error: "secondary damage is not ruled out" };
  }
  if (input.pricingFactors.materialTier !== "unknown") {
    return { success: false, error: "material exclusion does not match pricing factors" };
  }
  if (!input.scopeExclusions?.materialsExcluded) {
    return { success: false, error: "materials must be explicitly excluded" };
  }
  if (!input.scopeExclusions.surfaceFinishExcluded) {
    return { success: false, error: "surface finishing must be explicitly excluded" };
  }
  const original = input.originalScope;
  if (
    !original || original.evidenceReceipt.unit !== "per_visit" ||
    original.evidenceReceipt.aggregate_price_min !== original.priceMin ||
    original.evidenceReceipt.aggregate_price_max !== original.priceMax
  ) {
    return { success: false, error: "original verified scope receipt missing" };
  }
  const originalSelected = neutralMidpoint(original.priceMin, original.priceMax);
  const repairSelected = neutralMidpoint(input.exact.priceMin, input.exact.priceMax);
  const customerTotal = originalSelected + repairSelected;
  const platformFee = Math.round(
    customerTotal * input.commissionTier.rateBps / 10_000,
  );
  return {
    success: true,
    baselineDistrict: input.exact.districtCode,
    baselineEvidence: repairEvidence,
    baselineSource: input.exact.source!,
    baselineUsed: [
      input.serviceType,
      input.problemSlug,
      input.complexity,
      input.exact.districtCode,
    ].join(":"),
    priceMin: customerTotal,
    priceMax: customerTotal,
    priceSource: "verified_baseline",
    pricingBasis: {
      calculation:
        `verified diagnostic midpoint ${original.priceMin}-${original.priceMax} VND = ${originalSelected} VND + verified one-point repair labor midpoint ${input.exact.priceMin}-${input.exact.priceMax} VND = ${repairSelected} VND; full accepted scope total = ${customerTotal} VND`,
      quantity: 1,
      unit: "accepted_scope",
      unitPriceMin: customerTotal,
      unitPriceMax: customerTotal,
    },
    pricingComponents: [
      {
        evidenceReceipt: original.evidenceReceipt,
        kind: "original_confirmed_scope",
        priceMax: original.priceMax,
        priceMin: original.priceMin,
        selectedPrice: originalSelected,
      },
      {
        evidenceReceipt: repairEvidence,
        kind: "approved_scope_change",
        priceMax: input.exact.priceMax,
        priceMin: input.exact.priceMin,
        selectedPrice: repairSelected,
      },
    ],
    pricingMode: "full_scope_total",
    problemSlug: input.problemSlug,
    referencePriceMax: original.priceMax + input.exact.priceMax,
    referencePriceMin: original.priceMin + input.exact.priceMin,
    selectionRule: "verified_neutral_midpoint_with_bilateral_confirmation",
    serviceProblemId: input.candidates.serviceProblemId,
    stakeholderBalance: {
      commissionLevel: input.commissionTier.level,
      commissionRateBps: input.commissionTier.rateBps,
      customerConfirmationRequired: true,
      customerTotal,
      platformFee,
      workerConfirmationRequired: true,
      workerNet: customerTotal - platformFee,
    },
  };
}

function neutralMidpoint(priceMin: number, priceMax: number): number {
  return Math.round(((priceMin + priceMax) / 2) / 1000) * 1000;
}

function scopeChangePricingBasis(
  problemSlug: string,
  priceMin: number,
  priceMax: number,
  evidence: BaselinePriceEvidenceReceipt,
): VerifiedScopeChangePricingBasis {
  if (
    problemSlug === "replace_cabinet_hinges" &&
    evidence.unit === "per_cabinet_door"
  ) {
    const selectedScopePrice = neutralMidpoint(priceMin, priceMax);
    return {
      calculation: `neutral midpoint of verified one-door scope ${priceMin}-${priceMax} VND = ${selectedScopePrice} VND`,
      quantity: 1,
      unit: "cabinet_door_scope",
      unitPriceMin: selectedScopePrice,
      unitPriceMax: selectedScopePrice,
    };
  }
  return {
    calculation: `verified baseline total = ${priceMin}-${priceMax} VND`,
    quantity: null,
    unit: "accepted_scope",
    unitPriceMin: null,
    unitPriceMax: null,
  };
}
