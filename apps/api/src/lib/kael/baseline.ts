import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ServiceType, ComplexityLevel } from '@home-services/shared'
import { withDbTimeout } from '@/lib/db/query'
import { applyLearnedPriceRule } from '@/lib/learning/apply-price-rule'

export type BaselineResult =
  | {
      success: true
      priceMin: number
      priceMax: number
      matchedDistrict: string
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

  const [baselineResult, learnedRule] = await Promise.all([
    withDbTimeout(
      supabase
        .from('price_baselines')
        .select('price_min, price_max, district_code')
        .eq('service_type', serviceType)
        .eq('complexity', complexity)
        .in('district_code', districts),
    ),
    applyLearnedPriceRule(supabase, serviceType, problemSlug, district),
  ])

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

  // Learned rule overrides raw baseline when present.
  if (learnedRule) {
    return {
      success: true,
      priceMin: learnedRule.priceMin,
      priceMax: learnedRule.priceMax,
      matchedDistrict: chosen.district_code,
      learnedRuleId: learnedRule.ruleId,
      learnedRuleVersion: learnedRule.ruleVersion,
    }
  }

  return {
    success: true,
    priceMin: chosen.price_min,
    priceMax: chosen.price_max,
    matchedDistrict: chosen.district_code,
  }
}
