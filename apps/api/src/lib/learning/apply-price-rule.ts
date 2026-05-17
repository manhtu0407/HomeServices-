/**
 * Read-side rule application for the Kael pipeline's `fetchBaseline` step.
 *
 * Behind the `LEARNING_ENABLED` env flag. When enabled, queries `learning_rules`
 * for an active `price_prior_update` rule matching (service, problem, district).
 * Prefers exact-district match; falls back to citywide ('hcmc_all'). If a valid
 * rule is found, returns its suggested range — caller substitutes this for the
 * raw baseline.
 *
 * Per Rule #8 (no fake data), any payload that fails validation is logged and
 * skipped. We never return a partially-valid rule.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ServiceType } from '@home-services/shared'
import { withDbTimeout } from '@/lib/db/query'
import { env } from '@/lib/env'
import { isPricePriorPayload } from './types'

const CITYWIDE_DISTRICT = 'hcmc_all'

export type AppliedPriceRule = {
  priceMin: number
  priceMax: number
  ruleId: string
  ruleVersion: number
}

/**
 * Look up an active learned price rule for the given scope.
 *
 * Returns null in all of the following safe-fallback cases:
 *   - LEARNING_ENABLED flag is off
 *   - DB error
 *   - no matching active rule
 *   - rule payload fails validation (bad shape, non-positive prices, max < min)
 */
export async function applyLearnedPriceRule(
  supabase: SupabaseClient<Database>,
  serviceType: ServiceType,
  problemSlug: string,
  district: string,
): Promise<AppliedPriceRule | null> {
  if (!env.learningEnabled) return null

  const districts = district === CITYWIDE_DISTRICT ? [CITYWIDE_DISTRICT] : [district, CITYWIDE_DISTRICT]

  const { data: rows, error } = await withDbTimeout(
    supabase
      .from('learning_rules')
      .select('id, active_version, rule_payload, affected_district')
      .eq('rule_type', 'price_prior_update')
      .eq('affected_service', serviceType)
      .eq('affected_problem', problemSlug)
      .in('affected_district', districts)
      .eq('status', 'active'),
  )

  if (error) {
    console.warn('applyLearnedPriceRule: query failed', { errorCode: error.code })
    return null
  }

  if (!rows || rows.length === 0) return null

  // Prefer exact-district match; fall back to citywide.
  const exact = rows.find((r) => r.affected_district === district)
  const citywide = rows.find((r) => r.affected_district === CITYWIDE_DISTRICT)
  const chosen = exact ?? citywide
  if (!chosen) return null

  // Defensive: validate payload shape and bounds.
  if (!isPricePriorPayload(chosen.rule_payload)) {
    console.warn('applyLearnedPriceRule: payload shape invalid', { ruleId: chosen.id })
    return null
  }

  const { new_min, new_max } = chosen.rule_payload.suggested
  if (!Number.isInteger(new_min) || !Number.isInteger(new_max)) {
    console.warn('applyLearnedPriceRule: non-integer price in rule', { ruleId: chosen.id })
    return null
  }
  if (new_min <= 0 || new_max <= 0 || new_max < new_min) {
    console.warn('applyLearnedPriceRule: invalid price range', { ruleId: chosen.id })
    return null
  }

  return {
    priceMin: new_min,
    priceMax: new_max,
    ruleId: chosen.id,
    ruleVersion: chosen.active_version,
  }
}
