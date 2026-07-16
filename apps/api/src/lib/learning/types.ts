/**
 * Type definitions for Kael's evidence-gated self-learning system.
 *
 * Per STRUCTURES.md §10A/§10B, two candidate types exist:
 *   - price_prior_update:  produced by MarketMemoryService
 *   - analysis_rule:       produced by CaseReviewService
 *
 * Both store their payload in learning_candidates.suggested_payload (jsonb)
 * and learning_rules.rule_payload (jsonb). Schemas below define the exact
 * shape so callers can typecheck instead of `any`.
 *
 * Rule #9 audit: every field below is either an enum, a slug, an integer
 * price (VND, no decimal), a count, an average, or a timestamp. NO phone,
 * CCCD, full address, bank account, or raw chat content.
 */

import {
  COMPLEXITY_LEVELS,
  SERVICE_TYPES,
  type ComplexityLevel,
  type ServiceType,
} from '@nestscout/shared'

// =============================================================================
// Candidate type discriminator (also matches DB candidate_type / rule_type column)
// =============================================================================

export type CandidateType = 'price_prior_update' | 'analysis_rule'

// =============================================================================
// MarketMemoryService payload — price drift detection
// =============================================================================

export type PricePriorPayload = {
  candidate_type: 'price_prior_update'
  scope: {
    service_type: ServiceType
    problem_slug: string
    district_code: string              // canonical via normalizeDistrict
    complexity: ComplexityLevel
  }
  observed: {
    sample_size: number                // count of completed jobs in window
    baseline_used_min: number          // baseline at estimate time (VND int)
    baseline_used_max: number
    median_final_price: number
    p25_final_price: number
    p75_final_price: number
    median_estimate_min: number        // median of kael_price_min across observations
    median_estimate_max: number
  }
  suggested: {
    shift_min: number                  // signed delta from baseline (VND int)
    shift_max: number
    new_min: number                    // baseline_used_min + shift_min (must be > 0)
    new_max: number                    // baseline_used_max + shift_max (must be >= new_min)
    direction: 'underestimate' | 'overestimate' | 'noisy'
  }
  window: {
    from_ts: string                    // ISO timestamp inclusive lower bound
    to_ts: string                      // ISO timestamp inclusive upper bound
  }
}

// =============================================================================
// CaseReviewService payload — analysis rule candidates
// =============================================================================

export type AnalysisRuleSuggestion =
  | {
      kind: 'raise_complexity_prior'
      from: Exclude<ComplexityLevel, 'large'>   // 'small' | 'medium'
      to: Exclude<ComplexityLevel, 'small'>     // 'medium' | 'large'
      rationale: string
    }
  | {
      kind: 'add_advisory'
      advisory_template_id: string
      rationale: string
    }
  | {
      kind: 'add_clarification'
      question_template_id: string
      rationale: string
    }

export type AnalysisRulePayload = {
  candidate_type: 'analysis_rule'
  scope: {
    service_type: ServiceType
    problem_slug: string
    district_code: string
  }
  observed: {
    sample_size: number
    scope_change_rate: number          // 0..1 — fraction of jobs that requested scope change
    avg_rating: number                 // 1..5
    common_tags: string[]              // from reviews.tags (Vietnamese, already non-PII)
  }
  suggested: AnalysisRuleSuggestion
}

// =============================================================================
// Union helpers
// =============================================================================

export type LearningCandidatePayload = PricePriorPayload | AnalysisRulePayload

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isServiceType(value: unknown): value is ServiceType {
  return typeof value === 'string' && SERVICE_TYPES.includes(value as ServiceType)
}

function isComplexityLevel(value: unknown): value is ComplexityLevel {
  return typeof value === 'string' && COMPLEXITY_LEVELS.includes(value as ComplexityLevel)
}

function isLearningScope(value: unknown, includeComplexity: boolean): boolean {
  if (!isRecord(value)) return false
  return (
    isServiceType(value.service_type) &&
    isNonEmptyString(value.problem_slug) &&
    isNonEmptyString(value.district_code) &&
    (!includeComplexity || isComplexityLevel(value.complexity))
  )
}

// Narrow + validate at runtime (defensive parsing for jsonb roundtrips).
export function isPricePriorPayload(p: unknown): p is PricePriorPayload {
  if (!isRecord(p) || !isLearningScope(p.scope, true)) return false
  const observed = p.observed
  const suggested = p.suggested
  const window = p.window
  if (!isRecord(observed) || !isRecord(suggested) || !isRecord(window)) return false

  return (
    p.candidate_type === 'price_prior_update' &&
    Number.isInteger(observed.sample_size) &&
    (observed.sample_size as number) > 0 &&
    isFiniteNumber(observed.baseline_used_min) &&
    isFiniteNumber(observed.baseline_used_max) &&
    isFiniteNumber(observed.median_final_price) &&
    isFiniteNumber(observed.p25_final_price) &&
    isFiniteNumber(observed.p75_final_price) &&
    isFiniteNumber(observed.median_estimate_min) &&
    isFiniteNumber(observed.median_estimate_max) &&
    isFiniteNumber(suggested.shift_min) &&
    isFiniteNumber(suggested.shift_max) &&
    isFiniteNumber(suggested.new_min) &&
    isFiniteNumber(suggested.new_max) &&
    suggested.direction !== undefined &&
    ['underestimate', 'overestimate', 'noisy'].includes(String(suggested.direction)) &&
    isNonEmptyString(window.from_ts) &&
    isNonEmptyString(window.to_ts)
  )
}

export function isAnalysisRulePayload(p: unknown): p is AnalysisRulePayload {
  if (!isRecord(p) || !isLearningScope(p.scope, false)) return false
  const observed = p.observed
  const suggested = p.suggested
  if (!isRecord(observed) || !isRecord(suggested)) return false
  const kind = suggested.kind
  const validSuggestion =
    kind === 'raise_complexity_prior'
      ? isComplexityLevel(suggested.from) &&
        isComplexityLevel(suggested.to) &&
        suggested.from !== 'large' &&
        suggested.to !== 'small' &&
        isNonEmptyString(suggested.rationale)
      : kind === 'add_advisory'
        ? isNonEmptyString(suggested.advisory_template_id) &&
          isNonEmptyString(suggested.rationale)
        : kind === 'add_clarification'
          ? isNonEmptyString(suggested.question_template_id) &&
            isNonEmptyString(suggested.rationale)
          : false

  return (
    p.candidate_type === 'analysis_rule' &&
    Number.isInteger(observed.sample_size) &&
    (observed.sample_size as number) > 0 &&
    isFiniteNumber(observed.scope_change_rate) &&
    observed.scope_change_rate >= 0 &&
    observed.scope_change_rate <= 1 &&
    isFiniteNumber(observed.avg_rating) &&
    observed.avg_rating >= 0 &&
    observed.avg_rating <= 5 &&
    Array.isArray(observed.common_tags) &&
    observed.common_tags.every((tag) => typeof tag === 'string') &&
    validSuggestion
  )
}

// =============================================================================
// Hook input (data fetched once per job, passed to both services)
// =============================================================================

export type LearningHookInput = {
  jobId: string
  serviceType: ServiceType
  problemSlug: string                  // from jobs.kael_problem_identified or service_problems lookup
  districtCode: string                 // canonical
  complexityHint: ComplexityLevel      // from jobs.kael_complexity
  baselineMin: number                  // jobs.kael_price_min
  baselineMax: number                  // jobs.kael_price_max
  finalPrice: number | null            // jobs.final_price — may be null if never set
  rating: number                       // reviews.rating (1-5)
  reviewTags: string[]                 // reviews.tags
  scopeChangeRequested: boolean        // any scope_change_requests row exists
  reviewedAt: string                   // jobs.reviewed_at
}
