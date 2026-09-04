import { describe, expect, it } from 'vitest'

import { serializeKaelEstimate } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/serialize'
import { hasValidatedKaelPriceEvidence } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-support'
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

const baselineEvidence = {
  schema_version: 'baseline_price_evidence_receipt.v1',
  accepted_source_count: 2,
  aggregate_price_min: 250_000,
  aggregate_price_max: 450_000,
  high_trust_source_count: 2,
  quorum_met: true,
  required_quorum: 2,
  unit: 'per_visit',
  sources: [
    {
      domain: 'source-a.example',
      url: 'https://source-a.example/price',
      observed_at: '2026-08-13',
      price_min: 200_000,
      price_max: 400_000,
      unit: 'per_visit',
      effective_tier: 1,
      weight: 1,
    },
    {
      domain: 'source-b.example',
      url: 'https://source-b.example/price',
      observed_at: '2026-08-13',
      price_min: 300_000,
      price_max: 500_000,
      unit: 'per_visit',
      effective_tier: 2,
      weight: 1,
    },
  ],
} as const

function buildCard() {
  return buildEstimateCardOutput({
    analysisEvidence: {
      photoCount: 0,
      skipped: true,
      videoFrameCount: 0,
      voiceTranscriptCount: 0,
    },
    baselineEvidence,
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
  it('blocks a legacy source label when neither baseline nor market evidence reached quorum', () => {
    expect(hasValidatedKaelPriceEvidence({
      baselineEvidence: null,
      marketEvidence: {
        acceptedSourceCount: null,
        highTrustSourceCount: null,
        quorumMet: null,
      },
    })).toBe(false)
  })

  it('accepts either a validated baseline receipt or trusted market quorum', () => {
    expect(hasValidatedKaelPriceEvidence({
      baselineEvidence,
      marketEvidence: {
        acceptedSourceCount: null,
        highTrustSourceCount: null,
        quorumMet: null,
      },
    })).toBe(true)
    expect(hasValidatedKaelPriceEvidence({
      baselineEvidence: null,
      marketEvidence: {
        acceptedSourceCount: 3,
        highTrustSourceCount: 2,
        quorumMet: true,
      },
    })).toBe(true)
  })

  it('enforces the active policy evidence threshold instead of accepting a generic quorum', () => {
    expect(hasValidatedKaelPriceEvidence({
      baselineEvidence: null,
      marketEvidence: {
        acceptedSourceCount: 3,
        highTrustSourceCount: 2,
        quorumMet: true,
      },
      requirements: {
        minimumSourceCount: 2,
        minimumHighTrustSourceCount: 1,
        requiresActiveBaseline: true,
      },
    })).toBe(false)
    expect(hasValidatedKaelPriceEvidence({
      baselineEvidence,
      marketEvidence: {
        acceptedSourceCount: 3,
        highTrustSourceCount: 2,
        quorumMet: true,
      },
      requirements: {
        minimumSourceCount: 3,
        minimumHighTrustSourceCount: 2,
        requiresActiveBaseline: true,
      },
    })).toBe(false)
  })

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
        baseline_evidence: expect.objectContaining({
          accepted_source_count: 2,
          required_quorum: 2,
          quorum_met: true,
        }),
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

  it('keeps an explicitly unconfirmed replacement outside the priced scope', () => {
    const output = buildEstimateCardOutput({
      estimate: {
        ...estimate,
        service_type: 'handyman',
        problem_category: 'repair_hinge_or_handle',
        problem_summary:
          'One cabinet door has two loose hinges that need tightening and alignment. Replacement is not confirmed.',
      },
      language: 'en',
      customerScopeContext:
        'One cabinet door has two loose hinges that need tightening and alignment. Replacement is not confirmed.',
      priceSource: 'baseline_only',
      baselineUsed: 'handyman:repair_hinge_or_handle:small',
      analysisEvidence: {
        photoCount: 1,
        skipped: false,
        videoFrameCount: 0,
        voiceTranscriptCount: 0,
      },
      visionAnalysis: {
        analysisStatus: 'analyzed',
        problemSummary: 'The hinge may be worn and could require replacement.',
        recommendedScope:
          'Inspect the door, tighten the hinge screws, and align the door. If the screws do not hold, replace the hinges.',
        remainingUncertainty: 'The root cause must be confirmed on site.',
        severityIndicators: ['The hinge appears worn.'],
      },
    })
    const receipt = output.card.price_reasoning_receipt

    expect(receipt.problem.confirmed_facts.join(' ')).toContain('Replacement is not confirmed')
    expect(receipt.scope.included.join(' ')).not.toMatch(/replace/i)
    expect(receipt.scope.conditional.join(' ')).toMatch(/replacement.*scope.change/i)
  })

  it('keeps multi-turn customer facts, unknowns, and explicit diagnostic boundaries in the receipt', () => {
    const output = buildEstimateCardOutput({
      estimate: {
        ...estimate,
        problem_category: 'weak_water_pressure',
        price_min: 700_000,
        price_max: 1_200_000,
      },
      language: 'vi',
      customerScopeContext: [
        'Áp lực nước yếu, hãy chốt giúp tôi giá thấp nhất.',
        'Áp lực yếu đồng thời ở vòi bếp, lavabo và vòi sen; bồn cầu cấp nước chậm.',
        'Đồng hồ nước vẫn quay chậm khi đã khóa mọi thiết bị. Không thấy điểm ẩm. Van tổng tiếp cận bình thường.',
        'Chưa biết loại ống vì đường ống đi âm.',
        'Phạm vi hiện tại chỉ gồm một lần khảo sát, đo áp lực và dò tìm không phá dỡ; không gồm đục mở, sửa ống hay vật tư.',
      ].join(' '),
      priceSource: 'baseline_only',
      baselineEvidence: {
        ...baselineEvidence,
        accepted_source_count: 3,
        aggregate_price_min: 700_000,
        aggregate_price_max: 1_200_000,
        high_trust_source_count: 3,
        required_quorum: 3,
        sources: [
          ...baselineEvidence.sources,
          {
            ...baselineEvidence.sources[1],
            domain: 'source-c.example',
            url: 'https://source-c.example/price',
          },
        ],
      },
      baselineUsed: 'plumbing:weak_water_pressure:medium',
      analysisEvidence: {
        photoCount: 0,
        skipped: true,
        videoFrameCount: 0,
        voiceTranscriptCount: 0,
      },
      visionAnalysis: {
        analysisStatus: 'not_provided',
        problemSummary: 'Áp lực nước yếu cần khảo sát không phá dỡ.',
        recommendedScope: 'Khảo sát và đo áp lực tại chỗ.',
        remainingUncertainty: 'Chưa có hình ảnh để xác nhận phần ống bị che khuất.',
        severityIndicators: [],
      },
    })
    const receipt = output.card.price_reasoning_receipt

    expect(receipt.problem.confirmed_facts).toHaveLength(5)
    expect(receipt.problem.confirmed_facts.join(' ')).toContain('Đồng hồ nước vẫn quay chậm')
    expect(receipt.problem.confirmed_facts.join(' ')).toContain('Van tổng tiếp cận bình thường')
    expect(receipt.problem.confirmed_facts.join(' ')).not.toContain('Chưa biết loại ống')
    expect(receipt.problem.unknowns.join(' ')).toContain('Chưa biết loại ống')
    expect(receipt.problem.unknowns.filter((line) => /hình ảnh/i.test(line))).toHaveLength(1)
    expect(receipt.scope.included.join(' ')).toContain('khảo sát, đo áp lực')
    expect(receipt.scope.excluded.join(' ')).toContain('không gồm đục mở')
    expect(() => serializeKaelEstimate({
      ...estimate,
      problem_category: 'weak_water_pressure',
      price_min: 700_000,
      price_max: 1_200_000,
    }, output)).not.toThrow()
  })

  it('preserves explicit Vietnamese desired-scope and exclusion labels in the receipt', () => {
    const output = buildEstimateCardOutput({
      estimate: {
        ...estimate,
        problem_category: 'pipe_leak',
        price_min: 150_000,
        price_max: 375_000,
      },
      language: 'vi',
      customerScopeContext: [
        'Một lavabo phòng tắm rò tại khớp nối chữ P dưới chậu.',
        'Phạm vi mong muốn: kiểm tra, căn lại và làm kín khớp hoặc thay một gioăng nhỏ.',
        'Loại trừ đục tường/sàn, sửa ống âm và vật tư lớn.',
      ].join(' '),
      priceSource: 'baseline_only',
      baselineEvidence,
      baselineUsed: 'plumbing:pipe_leak:medium',
      analysisEvidence: {
        photoCount: 0,
        skipped: true,
        videoFrameCount: 0,
        voiceTranscriptCount: 0,
      },
      visionAnalysis: {
        analysisStatus: 'not_provided',
        problemSummary: 'Khớp nối chữ P dưới lavabo bị rò nhìn thấy.',
        recommendedScope: 'Kiểm tra và làm kín khớp nối.',
        remainingUncertainty: 'Chưa có ảnh bổ sung.',
        severityIndicators: [],
      },
    })

    expect(output.card.price_reasoning_receipt.scope.included.join(' ')).toContain(
      'Phạm vi mong muốn: kiểm tra, căn lại và làm kín khớp',
    )
    expect(output.card.price_reasoning_receipt.scope.excluded.join(' ')).toContain(
      'Loại trừ đục tường/sàn, sửa ống âm và vật tư lớn',
    )
  })

  it('removes a Vietnamese conditional replacement sentence from the priced scope', () => {
    const output = buildEstimateCardOutput({
      estimate: {
        ...estimate,
        service_type: 'handyman',
        problem_category: 'repair_hinge_or_handle',
        problem_summary: 'Cánh tủ bếp bị xệ do vít bản lề lỏng; cần căn chỉnh và siết vít.',
      },
      language: 'vi',
      customerScopeContext:
        'Một cánh tủ, hai bản lề, vít lỏng; chưa xác nhận cần thay bản lề.',
      priceSource: 'baseline_only',
      baselineUsed: 'handyman:repair_hinge_or_handle:small',
      visionAnalysis: {
        analysisStatus: 'analyzed',
        problemSummary: 'Vít bản lề bị lỏng.',
        recommendedScope:
          'Thợ kiểm tra và siết vít trên hai bản lề. Nếu vít không giữ được, có thể cần thay bản lề.',
        remainingUncertainty: 'Chưa rõ lỗ vít có bị tróc không.',
        severityIndicators: [],
      },
    })

    expect(output.card.price_reasoning_receipt.scope.included.join(' ')).not.toMatch(/thay bản lề/i)
  })

  it('lets a newer customer correction override stale hinge damage and excluded repair scope', () => {
    const output = buildEstimateCardOutput({
      estimate: {
        ...estimate,
        service_type: 'handyman',
        problem_category: 'repair_hinge_or_handle',
        problem_summary: 'Một cánh tủ với hai bản lề cần siết vít và căn chỉnh.',
      },
      language: 'vi',
      customerScopeContext: [
        'Chỉ 1 cánh tủ và đúng 2 bản lề âm kiểu chén.',
        'Gỗ MDF, cánh, khung và lỗ vít còn nguyên, không nứt, mục, cong vênh hay toét.',
        'Phạm vi chỉ gồm kiểm tra, siết vít và căn chỉnh hai bản lề.',
        'Loại trừ thay bản lề, vá gỗ, khoan mới và sửa cánh hoặc khung.',
      ].join(' '),
      priceSource: 'baseline_only',
      baselineUsed: 'handyman:repair_hinge_or_handle:small',
      analysisEvidence: {
        photoCount: 1,
        skipped: false,
        videoFrameCount: 0,
        voiceTranscriptCount: 0,
      },
      previousAnalysisReceipt: {
        schema_version: 'analysis_receipt.v1',
        evidence: {
          analysis_status: 'analyzed',
          findings: [{
            confidence: 'medium',
            evidence_index: 1,
            evidence_kind: 'photo',
            observation: 'Có hai bản lề kim loại và một số lỗ vít cũ.',
            possible_meaning: 'Bản lề hoặc lỗ vít bị lỏng có thể làm cánh tủ bị xệ.',
          }],
        },
        problem: {
          summary: 'Lỗ vít ở khung tủ có dấu hiệu bị nới rộng.',
          recommended_scope:
            'Thợ kiểm tra, siết vít hoặc thay ốc vít; có thể chèn gỗ vá lỗ cũ trước khi lắp lại bản lề.',
          remaining_uncertainty:
            'Không rõ lỗ vít hoặc khung tủ có bị nứt, mục hay hư hại không.',
          severity_indicators: ['Lỗ vít cũ bị rộng hoặc hư.'],
        },
      },
    })

    const receipt = output.card.price_reasoning_receipt
    expect(receipt.scope.included.join(' ')).not.toMatch(/thay|chèn gỗ|vá lỗ/i)
    expect(receipt.problem.unknowns.join(' ')).not.toMatch(/không rõ.*(?:lỗ vít|khung tủ|nứt|mục)/i)
    expect(receipt.problem.unknowns.join(' ')).toContain('Không còn điểm chưa xác định')
    expect(output.card.analysis_receipt?.problem?.summary).toBe(
      'Một cánh tủ với hai bản lề cần siết vít và căn chỉnh',
    )
    expect(output.card.analysis_receipt?.problem?.severity_indicators).toEqual([])
    const replacement = receipt.costs.components.find((component) => component.kind === 'replacement_parts')
    expect(replacement?.status).toBe('excluded')
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
