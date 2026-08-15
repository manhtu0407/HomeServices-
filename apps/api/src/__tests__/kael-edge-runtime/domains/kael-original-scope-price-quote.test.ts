import { describe, expect, it } from 'vitest'

import {
  parseOriginalScopePriceQuote,
  projectOriginalScopePriceQuote,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/original-scope-price-quote'

const quote = {
  schema_version: 'original_scope_price_quote.v1',
  quote_id: 'a1510000-0000-4000-8000-000000000001',
  job_id: 'a1520000-0000-4000-8000-000000000001',
  worker_id: 'a1530000-0000-4000-8000-000000000001',
  broadcast_id: 'a1540000-0000-4000-8000-000000000001',
  reference_price_min: 150_000,
  reference_price_max: 250_000,
  customer_total: 200_000,
  platform_fee: 20_000,
  worker_net: 180_000,
  commission_level: 2,
  commission_rate_bps: 1_000,
  price_source: 'baseline_with_market',
  selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
  worker_confirmation_required: true,
  customer_confirmation_required: true,
  worker_confirmed_at: '2026-08-15T04:00:00.000Z',
  expires_at: '2026-08-15T04:10:00.000Z',
  reasoning_receipt: {
    schema_version: 'price_reasoning_receipt.v1',
    receipt_id: 'price_reasoning:a1550000-0000-4000-8000-000000000001',
    scenarios: {
      low: { total: 150_000 },
      high: { total: 250_000 },
    },
    fairness: {
      price_source: 'baseline_with_market',
      confidence: 'medium',
      baseline_evidence: null,
      market_source_count: 3,
      high_trust_source_count: 2,
      quorum_met: true,
      cap_statement: 'Khoảng giá chỉ dùng các kết quả định giá đã kiểm chứng.',
    },
  },
}

describe('original-scope price quote', () => {
  it('projects one exact bilateral amount without leaking the raw evidence receipt', () => {
    const parsed = parseOriginalScopePriceQuote(quote, {
      broadcastId: quote.broadcast_id,
      jobId: quote.job_id,
      requireWorkerConfirmation: true,
      workerId: quote.worker_id,
    })

    expect(parsed).not.toBeNull()
    expect(projectOriginalScopePriceQuote(parsed!)).toEqual({
      schema_version: 'original_scope_price_quote.v1',
      quote_id: quote.quote_id,
      reference_price_min: 150_000,
      reference_price_max: 250_000,
      customer_total: 200_000,
      platform_fee: 20_000,
      worker_net: 180_000,
      commission_level: 2,
      commission_rate_bps: 1_000,
      price_source: 'baseline_with_market',
      selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
      worker_confirmation_required: true,
      customer_confirmation_required: true,
      worker_confirmed_at: '2026-08-15T04:00:00.000Z',
      expires_at: '2026-08-15T04:10:00.000Z',
      evidence_summary: {
        confidence: 'medium',
        baseline_source_count: 0,
        market_source_count: 3,
        high_trust_source_count: 2,
        quorum_met: true,
        cap_statement: 'Khoảng giá chỉ dùng các kết quả định giá đã kiểm chứng.',
      },
    })
    expect(JSON.stringify(projectOriginalScopePriceQuote(parsed!))).not.toContain('reasoning_receipt')
  })

  it('fails closed when arithmetic or the displayed evidence range drifts', () => {
    expect(parseOriginalScopePriceQuote({ ...quote, worker_net: 170_000 }, {
      broadcastId: quote.broadcast_id,
      jobId: quote.job_id,
      requireWorkerConfirmation: true,
      workerId: quote.worker_id,
    })).toBeNull()

    expect(parseOriginalScopePriceQuote({
      ...quote,
      reasoning_receipt: {
        ...quote.reasoning_receipt,
        scenarios: { low: { total: 100_000 }, high: { total: 250_000 } },
      },
    }, {
      broadcastId: quote.broadcast_id,
      jobId: quote.job_id,
      requireWorkerConfirmation: true,
      workerId: quote.worker_id,
    })).toBeNull()
  })
})
