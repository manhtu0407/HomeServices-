/**
 * CaseReviewService — STRUCTURES.md §10B
 *
 * Reviews completed jobs for analysis signal: estimate accuracy, missing
 * clarifications, scope-change patterns, customer rating quality. Produces
 * `analysis_rule` candidates.
 *
 * Phase 1 scope: only `raise_complexity_prior` suggestion kind. The
 * `add_clarification` and `add_advisory` paths are stubbed for future iteration
 * — they require a template registry not yet built.
 *
 * Same SELECT-then-UPDATE pattern as market-memory.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, ComplexityLevel } from '@home-services/shared'
import { withDbTimeout } from '@/lib/db/query'
import type { LearningHookInput, AnalysisRulePayload, AnalysisRuleSuggestion } from './types'

// =============================================================================
// Aggregator types
// =============================================================================

export type CaseObservation = {
  rating: number                       // 1..5
  scopeChangeRequested: boolean
  reviewTags: string[]
}

// =============================================================================
// Pure helpers (testable)
// =============================================================================

/**
 * Average rating across observations. Returns 0 for empty input.
 */
export function avgRating(observations: CaseObservation[]): number {
  if (observations.length === 0) return 0
  const sum = observations.reduce((acc, o) => acc + o.rating, 0)
  return sum / observations.length
}

/**
 * Fraction of observations that requested scope change (0..1).
 */
export function scopeChangeRate(observations: CaseObservation[]): number {
  if (observations.length === 0) return 0
  const count = observations.filter((o) => o.scopeChangeRequested).length
  return count / observations.length
}

/**
 * Top N most-common tags across all reviews. Stable order (frequency desc,
 * then alphabetical for ties).
 */
export function commonTags(observations: CaseObservation[], topN = 3): string[] {
  const freq = new Map<string, number>()
  for (const o of observations) {
    for (const tag of o.reviewTags) {
      freq.set(tag, (freq.get(tag) ?? 0) + 1)
    }
  }
  const sorted = Array.from(freq.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return a[0].localeCompare(b[0])
  })
  return sorted.slice(0, topN).map(([tag]) => tag)
}

/**
 * Decide which suggestion kind fits the observed pattern.
 * Phase 1 only emits `raise_complexity_prior` when scope-change rate is high
 * and current complexity hint is below 'large'.
 */
export function chooseSuggestion(
  observations: CaseObservation[],
  currentComplexity: ComplexityLevel,
): AnalysisRuleSuggestion | null {
  const rate = scopeChangeRate(observations)
  // Threshold: >=40% of jobs had scope change ⇒ Kael under-classified complexity.
  if (rate >= 0.4) {
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
    // current = 'large' — already at ceiling, no suggestion.
    return null
  }
  // Future iterations: add_clarification or add_advisory paths go here.
  return null
}

/**
 * Confidence formula for analysis rules:
 *   - high scope-change rate + low rating variance ⇒ high confidence
 *   - low scope-change rate (close to threshold) ⇒ low confidence
 * Capped at 0.95.
 */
export function caseConfidence(observations: CaseObservation[]): number {
  if (observations.length === 0) return 0
  const rate = scopeChangeRate(observations)
  // Linear ramp: rate=0.4 ⇒ confidence=0.5; rate=0.8 ⇒ confidence=0.9.
  // Below 0.4 returns confidence=0 (no suggestion fires anyway).
  if (rate < 0.4) return 0
  const conf = 0.5 + (rate - 0.4)         // rate 0.4..1.0 → conf 0.5..1.1, capped below
  return Math.min(0.95, conf)
}

// =============================================================================
// Compose payload (pure)
// =============================================================================

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

// =============================================================================
// Result + side-effect
// =============================================================================

export type ObserveResult =
  | { ok: true; candidateId: string; isNew: boolean; confidence: number; evidenceCount: number }
  | { ok: false; reason: string }

/**
 * Record one review/scope-change observation for the given scope.
 * Same SELECT-then-INSERT-or-UPDATE pattern as market-memory.ts.
 */
export async function observeReview(
  supabase: SupabaseClient<Database>,
  input: LearningHookInput,
): Promise<ObserveResult> {
  const scope: AnalysisRulePayload['scope'] = {
    service_type: input.serviceType,
    problem_slug: input.problemSlug,
    district_code: input.districtCode,
  }

  const thisObservation: CaseObservation = {
    rating: input.rating,
    scopeChangeRequested: input.scopeChangeRequested,
    reviewTags: input.reviewTags,
  }

  // Look up existing pending candidate.
  const { data: existing, error: selErr } = await withDbTimeout(
    supabase
      .from('learning_candidates')
      .select('id, suggested_payload, evidence_count, confidence')
      .eq('candidate_type', 'analysis_rule')
      .eq('affected_service', input.serviceType)
      .eq('affected_problem', input.problemSlug)
      .eq('affected_district', input.districtCode)
      .in('status', ['created', 'pending_evidence'])
      .limit(1)
      .maybeSingle(),
  )

  if (selErr) {
    return { ok: false, reason: `select_failed:${selErr.code}` }
  }

  let observations: CaseObservation[]
  if (existing && typeof existing.suggested_payload === 'object' && existing.suggested_payload) {
    const priorPayload = existing.suggested_payload as AnalysisRulePayload
    const priorCount = existing.evidence_count
    // Same approximation as MarketMemory: reconstruct synthetic prior observations
    // from stored aggregates. Good enough at small n.
    const priorRate = priorPayload.observed.scope_change_rate
    const priorAvgRating = priorPayload.observed.avg_rating
    observations = [
      ...Array.from({ length: priorCount }, (_, i): CaseObservation => ({
        rating: priorAvgRating,
        scopeChangeRequested: i < Math.round(priorRate * priorCount),
        reviewTags: priorPayload.observed.common_tags,
      })),
      thisObservation,
    ]
  } else {
    observations = [thisObservation]
  }

  const suggestion = chooseSuggestion(observations, input.complexityHint)
  if (!suggestion) {
    // No suggestion fires yet (scope-change rate below threshold or already at
    // 'large' complexity). Still record observation as 'created' state so
    // future observations can accumulate.
    if (existing) {
      const updPayload: AnalysisRulePayload = {
        candidate_type: 'analysis_rule',
        scope,
        observed: {
          sample_size: observations.length,
          scope_change_rate: scopeChangeRate(observations),
          avg_rating: avgRating(observations),
          common_tags: commonTags(observations),
        },
        // Carry forward prior suggestion (if any) so we don't lose state when
        // the threshold dips. If never had one, store a placeholder using
        // raise_complexity_prior with same-to (no-op flag for callers).
        suggested: (existing.suggested_payload as AnalysisRulePayload).suggested ?? {
          kind: 'raise_complexity_prior',
          from: 'small',
          to: 'medium',
          rationale: 'placeholder — no clear pattern yet',
        },
      }
      const { error: updErr } = await withDbTimeout(
        supabase
          .from('learning_candidates')
          .update({
            suggested_payload: updPayload as never,
            evidence_count: observations.length,
            confidence: 0,
            status: 'created',
            audit_reason: `appended observation from job ${input.jobId} — no pattern yet`,
          })
          .eq('id', existing.id),
      )
      if (updErr) return { ok: false, reason: `update_failed:${updErr.code}` }
      return {
        ok: true,
        candidateId: existing.id,
        isNew: false,
        confidence: 0,
        evidenceCount: observations.length,
      }
    }
    // No existing candidate, no suggestion to make — skip. The customer's
    // review still succeeds via the route handler.
    return { ok: false, reason: 'no_signal_yet' }
  }

  const payload = computeAnalysisPayload(scope, observations, suggestion)
  const confidence = caseConfidence(observations)
  const newStatus: Database['public']['Enums']['learning_candidate_status'] =
    observations.length >= 5 ? 'pending_evidence' : 'created'

  if (existing) {
    const { error: updErr } = await withDbTimeout(
      supabase
        .from('learning_candidates')
        .update({
          suggested_payload: payload as never,
          evidence_count: observations.length,
          confidence,
          status: newStatus,
          audit_reason: `appended observation from job ${input.jobId}`,
        })
        .eq('id', existing.id),
    )
    if (updErr) return { ok: false, reason: `update_failed:${updErr.code}` }
    return {
      ok: true,
      candidateId: existing.id,
      isNew: false,
      confidence,
      evidenceCount: observations.length,
    }
  }

  const { data: inserted, error: insErr } = await withDbTimeout(
    supabase
      .from('learning_candidates')
      .insert({
        candidate_type: 'analysis_rule',
        affected_service: input.serviceType,
        affected_problem: input.problemSlug,
        affected_district: input.districtCode,
        suggested_payload: payload as never,
        evidence_count: 1,
        confidence,
        status: 'created',
        audit_reason: `initial observation from job ${input.jobId}`,
      })
      .select('id')
      .single(),
  )

  if (insErr || !inserted) {
    return { ok: false, reason: `insert_failed:${insErr?.code ?? 'no_row'}` }
  }

  return { ok: true, candidateId: inserted.id, isNew: true, confidence, evidenceCount: 1 }
}
