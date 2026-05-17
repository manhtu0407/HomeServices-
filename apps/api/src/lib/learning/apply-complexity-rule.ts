/**
 * Read-side rule application after Kael's vision stage.
 *
 * Behind `LEARNING_ENABLED`. Queries `learning_rules` for an active
 * `analysis_rule` with `raise_complexity_prior` suggestion matching scope.
 * If found, returns the raised complexity level; caller substitutes it for
 * the vision-stage hint.
 *
 * Only the `raise_complexity_prior` kind is honored in Phase 1. Other kinds
 * (`add_clarification`, `add_advisory`) are recorded by the write side but
 * not yet applied at read time — that requires a template registry not
 * built yet.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ServiceType, ComplexityLevel } from '@home-services/shared'
import { withDbTimeout } from '@/lib/db/query'
import { env } from '@/lib/env'
import { isAnalysisRulePayload } from './types'

const CITYWIDE_DISTRICT = 'hcmc_all'

export type AppliedComplexityRule = {
  newComplexity: ComplexityLevel
  ruleId: string
  ruleVersion: number
  fromComplexity: ComplexityLevel
}

/**
 * If an active rule matches scope AND the current complexity is at or below
 * the rule's `from` level, raise to the rule's `to` level.
 *
 * Returns null on any safe-fallback path (flag off, DB error, no rule, invalid
 * payload, rule's `from` higher than current — i.e. rule doesn't apply).
 */
export async function applyLearnedComplexityRule(
  supabase: SupabaseClient<Database>,
  serviceType: ServiceType,
  problemSlug: string,
  district: string,
  currentComplexity: ComplexityLevel,
): Promise<AppliedComplexityRule | null> {
  if (!env.learningEnabled) return null

  const districts = district === CITYWIDE_DISTRICT ? [CITYWIDE_DISTRICT] : [district, CITYWIDE_DISTRICT]

  const { data: rows, error } = await withDbTimeout(
    supabase
      .from('learning_rules')
      .select('id, active_version, rule_payload, affected_district')
      .eq('rule_type', 'analysis_rule')
      .eq('affected_service', serviceType)
      .eq('affected_problem', problemSlug)
      .in('affected_district', districts)
      .eq('status', 'active'),
  )

  if (error) {
    console.warn('applyLearnedComplexityRule: query failed', { errorCode: error.code })
    return null
  }

  if (!rows || rows.length === 0) return null

  const exact = rows.find((r) => r.affected_district === district)
  const citywide = rows.find((r) => r.affected_district === CITYWIDE_DISTRICT)
  const chosen = exact ?? citywide
  if (!chosen) return null

  if (!isAnalysisRulePayload(chosen.rule_payload)) {
    console.warn('applyLearnedComplexityRule: payload shape invalid', { ruleId: chosen.id })
    return null
  }

  const suggestion = chosen.rule_payload.suggested
  if (suggestion.kind !== 'raise_complexity_prior') {
    // Other suggestion kinds (add_clarification, add_advisory) are not yet
    // applied at read time — they're recorded for admin review only.
    return null
  }

  // Apply only if current complexity is at or below the rule's `from` level.
  // Otherwise the rule would lower complexity, which we never do.
  const rank: Record<ComplexityLevel, number> = { small: 0, medium: 1, large: 2 }
  if (rank[currentComplexity] > rank[suggestion.from]) {
    return null
  }

  return {
    newComplexity: suggestion.to,
    ruleId: chosen.id,
    ruleVersion: chosen.active_version,
    fromComplexity: currentComplexity,
  }
}
