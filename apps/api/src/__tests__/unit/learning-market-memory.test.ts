import { describe, it, expect } from 'vitest'
import {
  quantiles,
  confidenceFromIqr,
  classifyDirection,
  computePricePriorPayload,
  type PriceObservation,
} from '@/lib/learning/market-memory'

// =============================================================================
// quantiles
// =============================================================================

describe('quantiles', () => {
  it('returns zeros for empty input', () => {
    expect(quantiles([])).toEqual({ p25: 0, median: 0, p75: 0 })
  })

  it('computes p25/median/p75 for known sample', () => {
    // Sample: [10, 20, 30, 40, 50]. Sorted indexes (nearest-rank):
    //   p25 = ceil(0.25 * 5) - 1 = 1 → 20
    //   p50 = ceil(0.5 * 5) - 1 = 2 → 30
    //   p75 = ceil(0.75 * 5) - 1 = 3 → 40
    expect(quantiles([10, 20, 30, 40, 50])).toEqual({ p25: 20, median: 30, p75: 40 })
  })

  it('handles unsorted input', () => {
    expect(quantiles([50, 10, 30, 20, 40])).toEqual({ p25: 20, median: 30, p75: 40 })
  })

  it('handles single-element input', () => {
    expect(quantiles([42])).toEqual({ p25: 42, median: 42, p75: 42 })
  })

  it('handles duplicates', () => {
    expect(quantiles([100, 100, 100, 100, 100])).toEqual({ p25: 100, median: 100, p75: 100 })
  })
})

// =============================================================================
// confidenceFromIqr
// =============================================================================

describe('confidenceFromIqr', () => {
  it('returns 0 when median is 0', () => {
    expect(confidenceFromIqr(0, 0, 0)).toBe(0)
  })

  it('returns ~0.95 (cap) for very tight distribution', () => {
    expect(confidenceFromIqr(100, 100, 100)).toBe(0.95)
  })

  it('worked example from plan: 360/390 around median 375 → 0.92', () => {
    const c = confidenceFromIqr(360_000, 390_000, 375_000)
    expect(c).toBeCloseTo(0.92, 2)
  })

  it('returns 0 when IQR equals median (wide spread)', () => {
    expect(confidenceFromIqr(0, 100, 100)).toBe(0)
  })

  it('clamps negative confidence to 0 (impossible IQR > median)', () => {
    expect(confidenceFromIqr(0, 200, 100)).toBe(0)
  })

  it('cap is exactly 0.95 even with iqr=0 (defensive)', () => {
    expect(confidenceFromIqr(50, 50, 50)).toBeLessThanOrEqual(0.95)
  })
})

// =============================================================================
// classifyDirection
// =============================================================================

describe('classifyDirection', () => {
  it('returns noisy when baseline mid is 0 or negative', () => {
    expect(classifyDirection(0, 100)).toBe('noisy')
    expect(classifyDirection(-100, 100)).toBe('noisy')
  })

  it('returns underestimate when observed > baseline by more than tolerance', () => {
    // baseline mid 100, observed 120 → delta=0.2 > 0.1 default
    expect(classifyDirection(100, 120)).toBe('underestimate')
  })

  it('returns overestimate when observed < baseline by more than tolerance', () => {
    expect(classifyDirection(100, 80)).toBe('overestimate')
  })

  it('returns noisy within tolerance band', () => {
    expect(classifyDirection(100, 105)).toBe('noisy')
    expect(classifyDirection(100, 95)).toBe('noisy')
  })

  it('respects custom tolerance', () => {
    // delta=0.05 < tolerance=0.02? no, 0.05 > 0.02 → underestimate
    expect(classifyDirection(100, 105, 0.02)).toBe('underestimate')
  })
})

// =============================================================================
// computePricePriorPayload — composition
// =============================================================================

describe('computePricePriorPayload', () => {
  const scope = {
    service_type: 'plumbing' as const,
    problem_slug: 'pipe_leak',
    district_code: 'q1',
    complexity: 'medium' as const,
  }

  it('produces full payload from 5 observations matching plan example', () => {
    const observations: PriceObservation[] = [
      { finalPrice: 350_000, estimateMin: 250_000, estimateMax: 350_000, reviewedAt: '2026-01-10T00:00:00Z' },
      { finalPrice: 380_000, estimateMin: 250_000, estimateMax: 350_000, reviewedAt: '2026-01-12T00:00:00Z' },
      { finalPrice: 360_000, estimateMin: 250_000, estimateMax: 350_000, reviewedAt: '2026-01-15T00:00:00Z' },
      { finalPrice: 400_000, estimateMin: 250_000, estimateMax: 350_000, reviewedAt: '2026-01-18T00:00:00Z' },
      { finalPrice: 370_000, estimateMin: 250_000, estimateMax: 350_000, reviewedAt: '2026-01-20T00:00:00Z' },
    ]

    const payload = computePricePriorPayload(scope, 200_000, 400_000, observations)

    expect(payload.candidate_type).toBe('price_prior_update')
    expect(payload.scope).toEqual(scope)
    expect(payload.observed.sample_size).toBe(5)
    expect(payload.observed.baseline_used_min).toBe(200_000)
    expect(payload.observed.baseline_used_max).toBe(400_000)
    // Direction: observed median ~370k, baseline mid 300k, delta ~0.23 > 0.1 → underestimate
    expect(payload.suggested.direction).toBe('underestimate')
    expect(payload.suggested.new_min).toBeGreaterThan(payload.observed.baseline_used_min)
    expect(payload.suggested.new_max).toBeGreaterThan(payload.observed.baseline_used_max)
  })

  it('preserves baseline spread when shifting', () => {
    const observations: PriceObservation[] = [
      { finalPrice: 500_000, estimateMin: 200_000, estimateMax: 400_000, reviewedAt: '2026-01-10T00:00:00Z' },
      { finalPrice: 500_000, estimateMin: 200_000, estimateMax: 400_000, reviewedAt: '2026-01-11T00:00:00Z' },
      { finalPrice: 500_000, estimateMin: 200_000, estimateMax: 400_000, reviewedAt: '2026-01-12T00:00:00Z' },
      { finalPrice: 500_000, estimateMin: 200_000, estimateMax: 400_000, reviewedAt: '2026-01-13T00:00:00Z' },
      { finalPrice: 500_000, estimateMin: 200_000, estimateMax: 400_000, reviewedAt: '2026-01-14T00:00:00Z' },
    ]
    const payload = computePricePriorPayload(scope, 200_000, 400_000, observations)
    const baselineSpread = 400_000 - 200_000
    const newSpread = payload.suggested.new_max - payload.suggested.new_min
    expect(newSpread).toBe(baselineSpread)
  })

  it('returns shift_min=0/shift_max=0 when direction is noisy', () => {
    const observations: PriceObservation[] = [
      { finalPrice: 300_000, estimateMin: 250_000, estimateMax: 350_000, reviewedAt: '2026-01-10T00:00:00Z' },
      { finalPrice: 305_000, estimateMin: 250_000, estimateMax: 350_000, reviewedAt: '2026-01-11T00:00:00Z' },
      { finalPrice: 295_000, estimateMin: 250_000, estimateMax: 350_000, reviewedAt: '2026-01-12T00:00:00Z' },
      { finalPrice: 310_000, estimateMin: 250_000, estimateMax: 350_000, reviewedAt: '2026-01-13T00:00:00Z' },
      { finalPrice: 290_000, estimateMin: 250_000, estimateMax: 350_000, reviewedAt: '2026-01-14T00:00:00Z' },
    ]
    const payload = computePricePriorPayload(scope, 200_000, 400_000, observations)
    expect(payload.suggested.direction).toBe('noisy')
    expect(payload.suggested.shift_min).toBe(0)
    expect(payload.suggested.shift_max).toBe(0)
    expect(payload.suggested.new_min).toBe(200_000)
    expect(payload.suggested.new_max).toBe(400_000)
  })

  it('sets window.from_ts to earliest and to_ts to latest observation', () => {
    const observations: PriceObservation[] = [
      { finalPrice: 100, estimateMin: 1, estimateMax: 1, reviewedAt: '2026-02-15T00:00:00Z' },
      { finalPrice: 100, estimateMin: 1, estimateMax: 1, reviewedAt: '2026-01-10T00:00:00Z' },
      { finalPrice: 100, estimateMin: 1, estimateMax: 1, reviewedAt: '2026-03-05T00:00:00Z' },
    ]
    const payload = computePricePriorPayload(scope, 1, 1, observations)
    expect(payload.window.from_ts).toBe('2026-01-10T00:00:00Z')
    expect(payload.window.to_ts).toBe('2026-03-05T00:00:00Z')
  })

  it('does not include PII fields anywhere in payload (Rule #9 audit)', () => {
    const observations: PriceObservation[] = [
      { finalPrice: 500_000, estimateMin: 200_000, estimateMax: 400_000, reviewedAt: '2026-01-10T00:00:00Z' },
    ]
    const payload = computePricePriorPayload(scope, 200_000, 400_000, observations)
    const json = JSON.stringify(payload)
    expect(json).not.toMatch(/phone|cccd|address|bank|chat/i)
  })
})
