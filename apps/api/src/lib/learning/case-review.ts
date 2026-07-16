import type { SupabaseClient } from '@supabase/supabase-js'
import type { ComplexityLevel, Database } from '@nestscout/shared'
import type { AnalysisRulePayload, AnalysisRuleSuggestion, LearningHookInput } from './types'
import { recordLearningObservation } from './observation-rpc'

export type CaseObservation = {
  rating: number
  scopeChangeRequested: boolean
  reviewTags: string[]
}

export function avgRating(observations: CaseObservation[]): number {
  if (observations.length === 0) return 0
  const sum = observations.reduce((acc, observation) => acc + observation.rating, 0)
  return sum / observations.length
}

export function scopeChangeRate(observations: CaseObservation[]): number {
  if (observations.length === 0) return 0
  const count = observations.filter((observation) => observation.scopeChangeRequested).length
  return count / observations.length
}

export function commonTags(observations: CaseObservation[], topN = 3): string[] {
  const frequencies = new Map<string, number>()
  for (const observation of observations) {
    for (const tag of observation.reviewTags) {
      frequencies.set(tag, (frequencies.get(tag) ?? 0) + 1)
    }
  }
  return Array.from(frequencies.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, topN)
    .map(([tag]) => tag)
}

export function chooseSuggestion(
  observations: CaseObservation[],
  currentComplexity: ComplexityLevel,
): AnalysisRuleSuggestion | null {
  const rate = scopeChangeRate(observations)
  if (rate < 0.4) return null
  if (currentComplexity === 'small') {
    return {
      kind: 'raise_complexity_prior',
      from: 'small',
      to: 'medium',
      rationale: `scope_change_rate=${rate.toFixed(2)} (n=${observations.length})`,
    }
  }
  if (currentComplexity === 'medium') {
    return {
      kind: 'raise_complexity_prior',
      from: 'medium',
      to: 'large',
      rationale: `scope_change_rate=${rate.toFixed(2)} (n=${observations.length})`,
    }
  }
  return null
}

export function caseConfidence(observations: CaseObservation[]): number {
  if (observations.length === 0) return 0
  const rate = scopeChangeRate(observations)
  if (rate < 0.4) return 0
  return Math.min(0.95, 0.5 + rate - 0.4)
}

export function computeAnalysisPayload(
  scope: AnalysisRulePayload['scope'],
  observations: CaseObservation[],
  suggestion: AnalysisRuleSuggestion,
): AnalysisRulePayload {
  return {
    candidate_type: 'analysis_rule',
    scope,
    observed: {
      sample_size: observations.length,
      scope_change_rate: scopeChangeRate(observations),
      avg_rating: avgRating(observations),
      common_tags: commonTags(observations),
    },
    suggested: suggestion,
  }
}

export type ObserveResult =
  | { ok: true; candidateId: string; isNew: boolean; confidence: number; evidenceCount: number }
  | { ok: false; reason: string }

export async function observeReview(
  supabase: SupabaseClient<Database>,
  input: LearningHookInput,
): Promise<ObserveResult> {
  return recordLearningObservation(supabase, 'analysis_rule', input)
}
