import { describe, expect, it } from 'vitest'

import { serializeKaelEstimate } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/serialize'
import { buildEstimateCardOutput } from '../../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/output-pipeline'

const estimate = {
  service_type: 'plumbing' as const,
  problem_category: 'pipe_leak',
  problem_summary: 'Rò nước dưới bồn rửa bếp.',
  complexity: 'small' as const,
  price_min: 250_000,
  price_max: 450_000,
  confidence: 0.72,
  advisory: null,
  disclaimer: 'Ước tính được chốt từ dữ liệu hiện có.',
}

function buildCard() {
  return buildEstimateCardOutput({
    analysisEvidence: {
      photoCount: 0,
      skipped: true,
      videoFrameCount: 0,
      voiceTranscriptCount: 0,
    },
    estimate,
    marketEvidence: {
      acceptedSourceCount: 3,
      highTrustSourceCount: 2,
      quorumMet: true,
    },
    priceSource: 'baseline_with_market',
    baselineUsed: 'plumbing:pipe_leak:small',
    visionAnalysis: {
      analysisStatus: 'not_provided',
      problemSummary: 'Rò nước dưới bồn rửa bếp.',
      recommendedScope: 'Kiểm tra điểm rò, siết hoặc thay gioăng khi cần.',
      remainingUncertainty: 'Chưa thấy phần ống phía sau tủ.',
      severityIndicators: ['Nước rò đều dưới bồn rửa.'],
    },
  })
}

describe('Kael price reasoning receipt', () => {
  it('reconciles public low and high scenarios to the deterministic estimate without inventing component prices', () => {
    const output = buildCard()
    const receipt = Reflect.get(output.card, 'price_reasoning_receipt')

    expect(receipt).toMatchObject({
      schema_version: 'price_reasoning_receipt.v1',
      problem: {
        confirmed_facts: expect.any(Array),
        possible_causes: expect.any(Array),
        unknowns: expect.any(Array),
      },
      scope: {
        included: expect.any(Array),
        conditional: expect.any(Array),
        excluded: expect.any(Array),
      },
      costs: {
        currency: 'VND',
        total_min: estimate.price_min,
        total_max: estimate.price_max,
        reconciliation: 'package_total',
        components: expect.arrayContaining([
          expect.objectContaining({
            kind: 'service_package',
            status: 'priced',
            amount_min: estimate.price_min,
            amount_max: estimate.price_max,
          }),
          expect.objectContaining({
            kind: 'labor',
            status: 'included_unitemized',
            amount_min: null,
            amount_max: null,
          }),
          expect.objectContaining({
            kind: 'replacement_parts',
            status: 'conditional_unpriced',
            amount_min: null,
            amount_max: null,
          }),
        ]),
      },
      scenarios: {
        low: expect.objectContaining({ total: estimate.price_min }),
        high: expect.objectContaining({ total: estimate.price_max }),
      },
      fairness: expect.objectContaining({
        price_source: 'baseline_with_market',
        cap_statement: expect.any(String),
      }),
    })
    expect(JSON.stringify(receipt)).not.toMatch(/provider|model|prompt|token/i)
  })

  it('surfaces the same validated receipt in the public estimate payload', () => {
    const serialized = serializeKaelEstimate(estimate, buildCard())
    const receipt = serialized && Reflect.get(serialized, 'price_reasoning_receipt')

    expect(receipt).toMatchObject({
      schema_version: 'price_reasoning_receipt.v1',
      costs: {
        total_min: estimate.price_min,
        total_max: estimate.price_max,
      },
    })
  })

  it('fails closed if a stored receipt assigns an unverified amount to labor', () => {
    const persisted = JSON.parse(JSON.stringify(buildCard())) as {
      card: {
        price_reasoning_receipt: {
          costs: { components: Array<Record<string, unknown>> }
        }
      }
    }
    const labor = persisted.card.price_reasoning_receipt.costs.components.find(
      (component) => component.kind === 'labor',
    )
    if (!labor) throw new Error('expected labor component')
    labor.status = 'priced'
    labor.amount_min = 80_000
    labor.amount_max = 120_000

    expect(() => serializeKaelEstimate(estimate, persisted)).toThrow()
  })

  it('fails closed if an exact receipt tries to itemize labor separately', () => {
    const persisted = JSON.parse(JSON.stringify(buildCard())) as {
      card: {
        price_reasoning_receipt: {
          costs: { reconciliation: string; components: Array<Record<string, unknown>> }
        }
      }
    }
    persisted.card.price_reasoning_receipt.costs.reconciliation = 'exact'
    persisted.card.price_reasoning_receipt.costs.components = [{
      kind: 'labor',
      status: 'priced',
      amount_min: estimate.price_min,
      amount_max: estimate.price_max,
      explanation: 'This would invent a separate labor amount.',
    }]

    expect(() => serializeKaelEstimate(estimate, persisted)).toThrow()
  })

  it('fails closed if a stored receipt contains provider internals', () => {
    const persisted = JSON.parse(JSON.stringify(buildCard())) as {
      card: {
        price_reasoning_receipt: { fairness: Record<string, unknown> }
      }
    }
    persisted.card.price_reasoning_receipt.fairness.cap_statement =
      'DeepSeek selected this price.'

    expect(() => serializeKaelEstimate(estimate, persisted)).toThrow()
  })

  it('fails closed if a stored receipt introduces an unverified price in text', () => {
    const persisted = JSON.parse(JSON.stringify(buildCard())) as {
      card: {
        price_reasoning_receipt: { fairness: Record<string, unknown> }
      }
    }
    persisted.card.price_reasoning_receipt.fairness.cap_statement =
      'Giá linh kiện có thể là 250000.'

    expect(() => serializeKaelEstimate(estimate, persisted)).toThrow()
  })
})
