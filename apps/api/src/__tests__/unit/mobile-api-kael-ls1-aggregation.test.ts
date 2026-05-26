import { describe, expect, it } from 'vitest'

import {
  buildLS1Aggregation,
  median,
  rejectOutliersMedianSigma,
  weightedMedian,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/skills/LS1-aggregation'
import { buildLS1MarketMemoryCandidate } from '../../../../../supabase/functions/mobile-api/_shared/kael/skills/LS1-market-memory'

describe('Kael F26 LS1 aggregation', () => {
  it('computes a median and weighted median for price samples', () => {
    expect(median([300000, 100000, 200000])).toBe(200000)
    expect(weightedMedian([
      { value: 100000, weight: 0.1 },
      { value: 220000, weight: 1 },
      { value: 900000, weight: 0.1 },
    ])).toBe(220000)
  })

  it('rejects midpoint outliers with median +/- 2 sigma', () => {
    const filtered = rejectOutliersMedianSigma([
      { midpoint: 210000 },
      { midpoint: 220000 },
      { midpoint: 230000 },
      { midpoint: 240000 },
      { midpoint: 1200000 },
    ])

    expect(filtered.map((item) => item.midpoint)).toEqual([
      210000,
      220000,
      230000,
      240000,
    ])
  })

  it('builds LS1 weighted aggregation while preserving PR #12 candidate shape', () => {
    const aggregation = buildLS1Aggregation([
      {
        market_range_min: 180000,
        market_range_max: 320000,
        confidence: 0.8,
        effective_trust_score: 1,
      },
      {
        market_range_min: 190000,
        market_range_max: 340000,
        confidence: 0.9,
        effective_trust_score: 0.9,
      },
      {
        market_range_min: 200000,
        market_range_max: 360000,
        confidence: 0.7,
        effective_trust_score: 0.8,
      },
      {
        market_range_min: 2000000,
        market_range_max: 2600000,
        confidence: 0.2,
        effective_trust_score: 0.2,
      },
    ])

    expect(aggregation).toMatchObject({
      method: 'median_2sigma_weighted',
      evidence_count: 3,
      rejected_outlier_count: 1,
      suggested_min: 190000,
      suggested_max: 340000,
    })

    const candidate = buildLS1MarketMemoryCandidate({
      service_type: 'cleaning',
      problem_slug: 'standard_home_cleaning',
      district_code: 'q7',
      complexity: 'medium',
      baseline_min: 160000,
      baseline_max: 300000,
      final_price: 260000,
      market_samples: [
        { market_range_min: 180000, market_range_max: 320000, confidence: 0.8 },
        { market_range_min: 190000, market_range_max: 340000, confidence: 0.9 },
      ],
    })

    expect(candidate).toMatchObject({
      skill_id: 'LS1',
      candidate_type: 'price_prior_update',
      target: 'price_prior',
      payload: {
        suggested: {
          signal: 'price_prior_candidate',
          aggregation: {
            method: 'median_2sigma_weighted',
            evidence_count: 2,
          },
        },
      },
    })
  })
})
