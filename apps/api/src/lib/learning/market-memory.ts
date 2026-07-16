import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@nestscout/shared'
import type { LearningHookInput, PricePriorPayload } from './types'
import { ROLLING_WINDOW_DAYS } from './evidence-gate'
import { recordLearningObservation } from './observation-rpc'

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

export function confidenceFromIqr(p25: number, p75: number, median: number): number {
  if (median <= 0) return 0
  const iqr = Math.max(0, p75 - p25)
  const rawConfidence = 1 - iqr / median
  return Math.max(0, Math.min(0.95, rawConfidence))
}

export function classifyDirection(
  baselineMid: number,
  observedMedian: number,
  tolerance = 0.1,
): 'underestimate' | 'overestimate' | 'noisy' {
  if (baselineMid <= 0) return 'noisy'
  const delta = (observedMedian - baselineMid) / baselineMid
  if (delta > tolerance) return 'underestimate'
  if (delta < -tolerance) return 'overestimate'
  return 'noisy'
}

export type PriceObservation = {
  finalPrice: number
  estimateMin: number
  estimateMax: number
  reviewedAt: string
}

export function computePricePriorPayload(
  scope: PricePriorPayload['scope'],
  baselineUsedMin: number,
  baselineUsedMax: number,
  observations: PriceObservation[],
  _windowDays: number = ROLLING_WINDOW_DAYS,
): PricePriorPayload {
  const finalPrices = observations.map((observation) => observation.finalPrice)
  const estimateMins = observations.map((observation) => observation.estimateMin)
  const estimateMaxes = observations.map((observation) => observation.estimateMax)

  const final = quantiles(finalPrices)
  const estMinQ = quantiles(estimateMins)
  const estMaxQ = quantiles(estimateMaxes)
  const baselineMid = (baselineUsedMin + baselineUsedMax) / 2
  const baselineSpread = baselineUsedMax - baselineUsedMin
  const direction = classifyDirection(baselineMid, final.median)

  let newMin: number
  let newMax: number
  if (direction === 'noisy') {
    newMin = baselineUsedMin
    newMax = baselineUsedMax
  } else {
    newMin = Math.max(1, Math.round(final.median - baselineSpread / 2))
    newMax = Math.max(newMin + 1, Math.round(final.median + baselineSpread / 2))
  }

  const reviewedTimes = observations.map((observation) => observation.reviewedAt).sort()
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
      shift_min: newMin - baselineUsedMin,
      shift_max: newMax - baselineUsedMax,
      new_min: newMin,
      new_max: newMax,
      direction,
    },
    window: { from_ts: fromTs, to_ts: toTs },
  }
}

export type ObserveResult =
  | { ok: true; candidateId: string; isNew: boolean; confidence: number; evidenceCount: number }
  | { ok: false; reason: string }

export async function observeFinalPrice(
  supabase: SupabaseClient<Database>,
  input: LearningHookInput,
): Promise<ObserveResult> {
  if (input.finalPrice === null || input.finalPrice <= 0) {
    return { ok: false, reason: 'no_final_price' }
  }

  // Scope changes are not clean price-drift evidence; CaseReview records them.
  if (input.scopeChangeRequested) {
    return { ok: false, reason: 'scope_changed' }
  }

  return recordLearningObservation(supabase, 'price_prior_update', input)
}
