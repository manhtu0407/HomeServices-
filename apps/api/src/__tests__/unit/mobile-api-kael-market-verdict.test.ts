import { describe, expect, it } from 'vitest'

import { evaluateMarketVerdict } from '../../../../../supabase/functions/mobile-api/_shared/kael/market/market-verdict'
import { buildEstimateCardOutput } from '../../../../../supabase/functions/mobile-api/_shared/kael/stages/output-pipeline'

describe('Kael deterministic market verdict', () => {
  it('marks current, consistent per-visit evidence reasonable', () => {
    const result = evaluateMarketVerdict({
      baselineMin: 150_000,
      baselineMax: 300_000,
      market: market([
        source('btaskee.com', 160_000, 250_000),
        source('jupviec.vn', 170_000, 260_000),
      ]),
      now: new Date('2026-07-10T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      verdict: 'reasonable',
      needsInspection: false,
      checks: {
        baseline: true,
        units: true,
        agreement: true,
        freshness: true,
        range: true,
      },
    })
  })

  it('keeps a market signal but marks it suspicious when it materially conflicts with the baseline', () => {
    const result = evaluateMarketVerdict({
      baselineMin: 150_000,
      baselineMax: 300_000,
      market: market([
        source('btaskee.com', 920_000, 1_100_000),
        source('jupviec.vn', 940_000, 1_120_000),
      ], 930_000, 1_110_000),
      now: new Date('2026-07-10T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      verdict: 'suspicious',
      needsInspection: true,
      reasons: expect.arrayContaining(['outside_baseline_band']),
    })
  })

  it('keeps a weak-quorum market signal at 50/50 but requires inspection', () => {
    const result = evaluateMarketVerdict({
      baselineMin: 150_000,
      baselineMax: 300_000,
      market: market([
        source('btaskee.com', 160_000, 250_000),
        source('jupviec.vn', 170_000, 260_000),
      ]),
      weakEvidence: true,
      now: new Date('2026-07-10T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      verdict: 'suspicious',
      needsInspection: true,
      reasons: expect.arrayContaining(['insufficient_trusted_quorum']),
    })
  })

  it('rejects stale evidence even when a provider payload claims the market is reasonable', () => {
    const poisonedPayload = {
      ...market([
        source('btaskee.com', 160_000, 250_000, '2023-07-09'),
        source('jupviec.vn', 170_000, 260_000, '2023-07-09'),
      ]),
      verdict: 'reasonable',
    }
    const result = evaluateMarketVerdict({
      baselineMin: 150_000,
      baselineMax: 300_000,
      market: poisonedPayload,
      now: new Date('2026-07-10T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      verdict: 'reject',
      needsInspection: true,
      reasons: expect.arrayContaining(['stale_source_evidence']),
    })
  })

  it('passes only the deterministic inspection decision to Estimate Card v3', () => {
    const verdict = evaluateMarketVerdict({
      baselineMin: 150_000,
      baselineMax: 300_000,
      market: market([
        source('btaskee.com', 160_000, 250_000, '2023-07-09'),
        source('jupviec.vn', 170_000, 260_000, '2023-07-09'),
      ]),
      now: new Date('2026-07-10T00:00:00.000Z'),
    })
    const output = buildEstimateCardOutput({
      estimate: {
        service_type: 'plumbing',
        problem_category: 'pipe_leak',
        problem_summary: 'Ống nước bị rò.',
        complexity: 'medium',
        price_min: 150_000,
        price_max: 300_000,
        confidence: 0.4,
        advisory: null,
        disclaimer: 'Đây là ước tính.',
      },
      priceSource: 'inspection_required',
      baselineUsed: 'plumbing:pipe_leak:medium',
      marketSignals: 'Dữ liệu giá cần được thợ kiểm tra trực tiếp trước khi chốt phạm vi.',
      needsInspectionReason: 'Dữ liệu giá cần được thợ kiểm tra trực tiếp trước khi chốt phạm vi.',
    })

    expect(verdict.needsInspection).toBe(true)
    expect(output.card).toMatchObject({
      needs_inspection: true,
      price_source: 'inspection_required',
      kael_reasoning: {
        needs_inspection_reason: 'Dữ liệu giá cần được thợ kiểm tra trực tiếp trước khi chốt phạm vi.',
      },
    })
  })
})

function market(
  sources: Array<ReturnType<typeof source>>,
  market_range_min = 160_000,
  market_range_max = 260_000,
) {
  return {
    market_range_min,
    market_range_max,
    confidence: 0.75,
    sources,
  }
}

function source(
  domain: string,
  price_min: number,
  price_max: number,
  date = '2026-07-09',
) {
  return { domain, price_min, price_max, unit: 'per_visit' as const, date }
}
