/**
 * MarketMemoryService — STRUCTURES.md §10A
 *
 * Observes Kael estimate vs actual final price for each completed transaction.
 * Detects baseline drift by (service, problem, district, complexity). Produces
 * `price_prior_update` candidates with median/IQR-based confidence.
 *
 * Trigger: called from `runLearningHook` when a job reaches `reviewed` status.
 * Phase 1 fire-and-forget: failures here never block the review request.
 *
 * Concurrency note: this uses SELECT-then-INSERT-or-UPDATE (no unique partial
 * index yet — deferred to Tier 3). Two concurrent reviews for the same scope
 * could race and produce duplicate candidate rows. At pre-revenue scale this
 * is acceptable; mitigate with row lock in Tier 3.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@home-services/shared'
import { withDbTimeout } from '@/lib/db/query'
import type { LearningHookInput, PricePriorPayload } from './types'
import { ROLLING_WINDOW_DAYS } from './evidence-gate'

// =============================================================================
// Pure math helpers (exported for unit testing)
// =============================================================================

/**
 * Compute p25, p50 (median), p75 from a numeric sample.
 * Uses nearest-rank method — predictable for small n.
 */
export function quantiles(values: number[]): {
  p25: number
  median: number
  p75: number
} {
  if (values.length === 0) return { p25: 0, median: 0, p75: 0 }
  const sorted = values.toSorted((a, b) => a - b)
  const at = (q: number): number => {
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1))
    return sorted[idx]
  }
  return { p25: at(0.25), median: at(0.5), p75: at(0.75) }
}

/**
 * Confidence from interquartile-range-relative spread.
 * Tight observed distribution => high confidence. Capped at 0.95 to prevent
 * cocky promotions at n=5.
 */
export function confidenceFromIqr(p25: number, p75: number, median: number): number {
  if (median <= 0) return 0
  const iqr = Math.max(0, p75 - p25)
  const rawConfidence = 1 - iqr / median
  return Math.max(0, Math.min(0.95, rawConfidence))
}

/**
 * Direction classification — which way the baseline is wrong, if at all.
 * Tolerance band of 10% around baseline midpoint => 'noisy' (i.e. no clear shift).
 */
export function classifyDirection(
  baselineMid: number,
  observedMedian: number,
  tolerance = 0.1,
): 'underestimate' | 'overestimate' | 'noisy' {
  if (baselineMid <= 0) return 'noisy'
  const delta = (observedMedian - baselineMid) / baselineMid
  if (delta > tolerance) return 'underestimate'   // observed > baseline => Kael underestimated
  if (delta < -tolerance) return 'overestimate'
  return 'noisy'
}

// =============================================================================
// Single observation = one job's (estimate, final_price) data point
// =============================================================================

export type PriceObservation = {
  finalPrice: number
  estimateMin: number
  estimateMax: number
  reviewedAt: string
}

/**
 * Recompute candidate payload from accumulated observations.
 * Pure function — no DB, fully testable.
 */
export function computePricePriorPayload(
  scope: PricePriorPayload['scope'],
  baselineUsedMin: number,
  baselineUsedMax: number,
  observations: PriceObservation[],
  _windowDays: number = ROLLING_WINDOW_DAYS,
): PricePriorPayload {
  const finalPrices = observations.map((o) => o.finalPrice)
  const estimateMins = observations.map((o) => o.estimateMin)
  const estimateMaxes = observations.map((o) => o.estimateMax)

  const final = quantiles(finalPrices)
  const estMinQ = quantiles(estimateMins)
  const estMaxQ = quantiles(estimateMaxes)

  // Shift the baseline range so the new midpoint equals observed median.
  // Preserve baseline spread proportionally — we only learn the level, not the width.
  const baselineMid = (baselineUsedMin + baselineUsedMax) / 2
  const baselineSpread = baselineUsedMax - baselineUsedMin
  const direction = classifyDirection(baselineMid, final.median)

  let newMin: number
  let newMax: number
  if (direction === 'noisy') {
    // No clear shift; suggest baseline unchanged. Candidate still records the
    // observation but `new_min == baseline_used_min` etc.
    newMin = baselineUsedMin
    newMax = baselineUsedMax
  } else {
    // Center the new range around observed median while keeping baseline spread.
    newMin = Math.max(1, Math.round(final.median - baselineSpread / 2))
    newMax = Math.max(newMin + 1, Math.round(final.median + baselineSpread / 2))
  }

  const shiftMin = newMin - baselineUsedMin
  const shiftMax = newMax - baselineUsedMax
  // Window: oldest observation timestamp to newest.
  const reviewedTimes = observations.map((o) => o.reviewedAt).sort()
  const fromTs = reviewedTimes[0] ?? new Date().toISOString()
  const toTs = reviewedTimes[reviewedTimes.length - 1] ?? fromTs

  return {
    candidate_type: 'price_prior_update',
    scope,
    observed: {
      sample_size: observations.length,
      baseline_used_min: baselineUsedMin,
      baseline_used_max: baselineUsedMax,
      median_final_price: final.median,
      p25_final_price: final.p25,
      p75_final_price: final.p75,
      median_estimate_min: estMinQ.median,
      median_estimate_max: estMaxQ.median,
    },
    suggested: {
      shift_min: shiftMin,
      shift_max: shiftMax,
      new_min: newMin,
      new_max: newMax,
      direction,
    },
    window: { from_ts: fromTs, to_ts: toTs },
  }
}

// =============================================================================
// Result type
// =============================================================================

export type ObserveResult =
  | { ok: true; candidateId: string; isNew: boolean; confidence: number; evidenceCount: number }
  | { ok: false; reason: string }

// =============================================================================
// observeFinalPrice — side-effect: upsert candidate row
// =============================================================================

/**
 * Record one (estimate, final_price) observation for the given scope.
 *
 * Side effects:
 *   - If no existing pending candidate: INSERT a new row with sample_size=1.
 *   - If existing pending candidate: SELECT its current observations from the
 *     accumulated payload, append this observation, recompute payload, UPDATE.
 *
 * The candidate payload always reflects the latest n observations. Evidence
 * gate runs separately (caller's responsibility) after this returns.
 */
export async function observeFinalPrice(
  supabase: SupabaseClient<Database>,
  input: LearningHookInput,
): Promise<ObserveResult> {
  // Skip cleanly if final_price is missing (Failure mode #2).
  if (input.finalPrice === null || input.finalPrice <= 0) {
    return { ok: false, reason: 'no_final_price' }
  }

  // Skip if scope-changed jobs — those are not clean signal for baseline drift.
  // Phase 1: we still record analysis_rule observation in case-review.ts.
  if (input.scopeChangeRequested) {
    return { ok: false, reason: 'scope_changed' }
  }

  const scope: PricePriorPayload['scope'] = {
    service_type: input.serviceType,
    problem_slug: input.problemSlug,
    district_code: input.districtCode,
    complexity: input.complexityHint,
  }

  const thisObservation: PriceObservation = {
    finalPrice: input.finalPrice,
    estimateMin: input.baselineMin,
    estimateMax: input.baselineMax,
    reviewedAt: input.reviewedAt,
  }

  // Look up existing pending candidate for this scope (status 'created' or 'pending_evidence').
  const { data: existing, error: selErr } = await withDbTimeout(
    supabase
      .from('learning_candidates')
      .select('id, suggested_payload, evidence_count, confidence')
      .eq('candidate_type', 'price_prior_update')
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

  let observations: PriceObservation[]
  if (existing && typeof existing.suggested_payload === 'object' && existing.suggested_payload) {
    // Extract prior observations from stored payload. We don't store the raw
    // list in payload (only aggregates), so this is an approximation: we
    // reconstruct one synthetic observation per evidence_count using the stored
    // medians. This is good enough at small n; if it becomes a problem we'll
    // add a learning_observations table in Tier 3.
    const priorPayload = existing.suggested_payload as PricePriorPayload
    const priorCount = existing.evidence_count
    observations = [
      ...Array.from({ length: priorCount }, (): PriceObservation => ({
        finalPrice: priorPayload.observed.median_final_price,
        estimateMin: priorPayload.observed.median_estimate_min,
        estimateMax: priorPayload.observed.median_estimate_max,
        reviewedAt: priorPayload.window.to_ts,
      })),
      thisObservation,
    ]
  } else {
    observations = [thisObservation]
  }

  const payload = computePricePriorPayload(
    scope,
    input.baselineMin,
    input.baselineMax,
    observations,
  )

  // Pending_evidence until we hit MIN_EVIDENCE (gate evaluates separately).
  const newStatus: Database['public']['Enums']['learning_candidate_status'] =
    observations.length >= 5 ? 'pending_evidence' : 'created'

  if (existing) {
    const { error: updErr } = await withDbTimeout(
      supabase
        .from('learning_candidates')
        .update({
          suggested_payload: payload as never,
          evidence_count: observations.length,
          confidence: payload.suggested.direction === 'noisy' ? 0 : payload.observed.sample_size > 0
            ? confidenceFromIqr(payload.observed.p25_final_price, payload.observed.p75_final_price, payload.observed.median_final_price)
            : 0,
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
      confidence: payload.observed.sample_size > 0
        ? confidenceFromIqr(payload.observed.p25_final_price, payload.observed.p75_final_price, payload.observed.median_final_price)
        : 0,
      evidenceCount: observations.length,
    }
  }

  const { data: inserted, error: insErr } = await withDbTimeout(
    supabase
      .from('learning_candidates')
      .insert({
        candidate_type: 'price_prior_update',
        affected_service: input.serviceType,
        affected_problem: input.problemSlug,
        affected_district: input.districtCode,
        suggested_payload: payload as never,
        evidence_count: 1,
        confidence: 0,                 // first observation — no spread yet
        status: 'created',
        audit_reason: `initial observation from job ${input.jobId}`,
      })
      .select('id')
      .single(),
  )

  if (insErr || !inserted) {
    return { ok: false, reason: `insert_failed:${insErr?.code ?? 'no_row'}` }
  }

  return { ok: true, candidateId: inserted.id, isNew: true, confidence: 0, evidenceCount: 1 }
}
