import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ServiceType, ComplexityLevel } from '@nestscout/shared'
import { withDbTimeout } from '@/lib/db/query'
import { applyLearnedPriceRule } from '@/lib/learning/apply-price-rule'

export type BaselineResult =
  | {
      success: true
      priceMin: number
      priceMax: number
      matchedDistrict: string
      serviceProblemId: string
      /** Set when a learned rule shifted the baseline. Absent => raw baseline. */
      learnedRuleId?: string
      learnedRuleVersion?: number
    }
  | { success: false; error: string }

const CITYWIDE_DISTRICT = 'hcmc_all'

/**
 * Fetch the most specific baseline row for (service, complexity, district).
 *
 * Strategy:
 *   1. Run baseline query AND learned-price-rule lookup in parallel — same
 *      latency as before (Promise.all). Rule lookup is a no-op when
 *      LEARNING_ENABLED=false (returns null immediately).
 *   2. If a valid learned rule exists, its suggested range overrides the
 *      raw baseline (with `learnedRuleId` set so callers can audit).
 *   3. Otherwise fall back to existing behavior: prefer exact district, then
 *      citywide, else NO_BASELINE.
 *
 * The rule application is read-side only — it cannot fabricate a baseline
 * when none exists. If the underlying price_baselines query fails or returns
 * empty, we return NO_BASELINE regardless of any rule (Rule #8 honored).
 */
export async function fetchBaseline(
  supabase: SupabaseClient<Database>,
  serviceType: ServiceType,
  problemSlug: string,
  complexity: ComplexityLevel,
  district: string,
): Promise<BaselineResult> {
  const districts = district === CITYWIDE_DISTRICT ? [CITYWIDE_DISTRICT] : [district, CITYWIDE_DISTRICT]

  const [problemResult, learnedRule] = await Promise.all([
    withDbTimeout(
      supabase
        .from('service_problems')
        .select('id')
        .eq('service_type', serviceType)
        .eq('slug', problemSlug),
    ),
    applyLearnedPriceRule(supabase, serviceType, problemSlug, district),
  ])

  const { data: problems, error: problemError } = problemResult
  if (problemError) {
    console.warn('Baseline problem lookup failed', { serviceType, problemSlug, errorCode: problemError.code })
    return {
      success: false,
      error: `Service problem lookup failed for ${serviceType}/${problemSlug}`,
    }
  }

  const problemId = problems?.[0]?.id
  if (!problemId) {
    return {
      success: false,
      error: `No service problem found for ${serviceType}/${problemSlug}`,
    }
  }

  const baselineResult = await withDbTimeout(
    supabase
      .from('price_baselines')
      .select('price_min, price_max, district_code')
      .eq('service_problem_id', problemId)
      .eq('service_type', serviceType)
      .eq('complexity', complexity)
      .in('district_code', districts),
  )

  const { data, error } = baselineResult

  if (error) {
    console.warn('Baseline query failed', { serviceType, complexity, district, errorCode: error.code })
    return {
      success: false,
      error: `Baseline query failed for ${serviceType}/${complexity}/${district}`,
    }
  }

  if (!data || data.length === 0) {
    return {
      success: false,
      error: `No price baseline found for ${serviceType}/${complexity}/${district}`,
    }
  }

  // Prefer exact-district match; fall back to citywide.
  const exact = data.find((row) => row.district_code === district)
  const citywide = data.find((row) => row.district_code === CITYWIDE_DISTRICT)
  const chosen = exact ?? citywide

  if (!chosen) {
    return {
      success: false,
      error: `No matching baseline found for ${serviceType}/${complexity}/${district}`,
    }
  }

  const rawPriceMin = positiveNumberFrom(chosen.price_min)
  const rawPriceMax = positiveNumberFrom(chosen.price_max)
  if (rawPriceMin === null || rawPriceMax === null || rawPriceMax < rawPriceMin) {
    console.warn('Baseline row failed price validation', { serviceType, complexity, district })
    return {
      success: false,
      error: `Invalid price baseline found for ${serviceType}/${complexity}/${district}`,
    }
  }

  // Learned rule overrides raw baseline when present.
  if (learnedRule) {
    return {
      success: true,
      priceMin: learnedRule.priceMin,
      priceMax: learnedRule.priceMax,
      matchedDistrict: chosen.district_code,
      serviceProblemId: problemId,
      learnedRuleId: learnedRule.ruleId,
      learnedRuleVersion: learnedRule.ruleVersion,
    }
  }

  return {
    success: true,
    priceMin: rawPriceMin,
    priceMax: rawPriceMax,
    matchedDistrict: chosen.district_code,
    serviceProblemId: problemId,
  }
}

function positiveNumberFrom(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}
