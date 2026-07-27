import { describe, expect, it } from 'vitest'

import {
  buildEstimateCardOutput,
  buildScopeChangeOutputs,
  buildWorkerBriefOutput,
  runKaelOutputPipeline,
  sanitizeKaelText,
  scrubKaelPiiText,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/output-pipeline'
import {
  KAEL_PRICE_DISCLAIMER_V3,
  calculateScopeChangeAnomaly,
  calculateScopeChangeMargin,
  matchSuspiciousScopeKeywords,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/scope-change'
import { kaelArtifactProposalSchema } from '../../../../../supabase/functions/mobile-api/_shared/kael/artifact-contract'

describe('mobile-api Kael P4 output pipeline', () => {
  it('renders a sanitized Estimate Card v3 from a pipeline estimate', () => {
    const output = buildEstimateCardOutput({
      estimate: {
        service_type: 'plumbing',
        problem_category: 'pipe_leak',
        problem_summary: 'Ống nước dưới lavabo rò, SĐT 0901234567, giá 450.000 VND',
        complexity: 'medium',
        price_min: 250000,
        price_max: 450000,
        confidence: 0.62,
        advisory: 'Khóa van nếu nước rò liên tục.',
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
      },
      priceSource: 'baseline_with_market',
      baselineUsed: 'plumbing:pipe_leak:medium',
    })

    expect(output.schema_version).toBe('estimate_card.v3')
    expect(output.card.disclaimer).toBe(KAEL_PRICE_DISCLAIMER_V3)
    expect(output.card.problem_summary).not.toContain('0901234567')
    expect(output.card.problem_summary.toLowerCase()).not.toContain('vnd')
    expect(kaelArtifactProposalSchema.parse(output.artifact_proposal)).toMatchObject({
      artifact_type: 'estimate',
      visibility: 'customer_review',
      may_transition: false,
    })
  })

  it('does not invent an inspection blocker from low price confidence alone', () => {
    const output = buildEstimateCardOutput({
      estimate: {
        service_type: 'electrical',
        problem_category: 'outlet_or_switch_broken',
        problem_summary: 'Một ổ cắm âm tường bị xém, cầu dao nhánh đã ngắt.',
        complexity: 'medium',
        price_min: 300000,
        price_max: 700000,
        confidence: 0.4,
        advisory: null,
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
        needs_inspection: false,
      },
      priceSource: 'baseline_only',
      baselineUsed: 'electrical:outlet_or_switch_broken:medium',
    })

    expect(output.card.confidence).toBe('low')
    expect(output.card.needs_inspection).toBe(false)
    expect(output.card.price_source).toBe('baseline_only')
    expect(output.artifact_proposal.missing_fields).toEqual([])
  })

  it('marks missing inspection information without allowing AI to transition workflow', () => {
    const output = buildEstimateCardOutput({
      estimate: {
        service_type: 'electrical',
        problem_category: 'unknown',
        problem_summary: 'Ổ cắm nóng bất thường nhưng chưa có ảnh hiện trạng.',
        complexity: 'medium',
        price_min: 200000,
        price_max: 350000,
        confidence: 0.28,
        advisory: null,
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
      },
      priceSource: 'inspection_required',
      baselineUsed: null,
      needsInspectionReason: 'Thiếu ảnh và vị trí ổ cắm.',
    })

    const artifact = kaelArtifactProposalSchema.parse(output.artifact_proposal)
    expect(artifact.missing_fields).toContain('inspection')
    expect(artifact.recommended_next_question).toBeDefined()
    expect(artifact.may_transition).toBe(false)
  })

  it('uses the generic Schema + Sanitizer + Fallback + Renderer pipeline', () => {
    const fallback: { value: string; disclaimer: string } = {
      value: 'safe fallback',
      disclaimer: KAEL_PRICE_DISCLAIMER_V3,
    }

    const result = runKaelOutputPipeline<
      typeof fallback,
      typeof fallback,
      typeof fallback
    >({
      raw: {
        value: 'Có số 0901234567 và giá 300000đ',
        disclaimer: KAEL_PRICE_DISCLAIMER_V3,
      },
      fallback,
      schema: {
        safeParse(value: unknown) {
          return typeof value === 'object' && value !== null && 'value' in value
            ? { success: true as const, data: value as typeof fallback }
            : { success: false as const }
        },
      },
      sanitize(value) {
        return {
          ...value,
          value: value.value.replace(/\d/g, ''),
        }
      },
      render(value) {
        return value
      },
    })

    expect(result.fallback_used).toBe(false)
    expect(result.output.value).not.toMatch(/\d/)
  })

  it('removes hidden controls before PII matching and truncates Unicode safely', () => {
    expect(sanitizeKaelText('SĐT 0901\u200B234567')).toBe('SĐT [phone]')
    expect(sanitizeKaelText('safe\u0085\u00AD\u202E\u2066text')).toBe('safetext')
    expect(scrubKaelPiiText('STK 1234567890123456')).not.toContain('1234567890123456')
    expect(sanitizeKaelText('A😀', 2)).toBe('A')
    expect(sanitizeKaelText('abcdef', -1)).toBe('')
    expect(sanitizeKaelText('a'.repeat(600), Number.POSITIVE_INFINITY)).toHaveLength(500)
  })

  it('builds Worker Brief core without address and guidance with address after accept', () => {
    const core = buildWorkerBriefOutput({
      stage: 'core',
      serviceType: 'electrical',
      problemSummary: 'Cầu dao thường xuyên bị trip.',
      district: 'Quận 7',
      fullAddress: {
        building: 'Sunrise City',
        floor: '18',
        unit: '18.02',
        district: 'Quận 7',
      },
      estimatedEarningMin: 180000,
      estimatedEarningMax: 300000,
      knowledgeSafetyGuidance: ['Safety warning: Khoa nuoc khu vuc lien quan truoc khi thao tac.'],
    })
    const guidance = buildWorkerBriefOutput({
      stage: 'guidance',
      serviceType: 'electrical',
      problemSummary: 'Cầu dao thường xuyên bị trip.',
      district: 'Quận 7',
      fullAddress: {
        building: 'Sunrise City',
        floor: '18',
        unit: '18.02',
        district: 'Quận 7',
      },
      estimatedEarningMin: 180000,
      estimatedEarningMax: 300000,
    })

    expect(JSON.stringify(core.brief)).not.toContain('Sunrise City')
    expect(JSON.stringify(core.brief)).not.toContain('18.02')
    expect(core.brief.sections.safety[0]).toContain('Khoa nuoc')
    expect(JSON.stringify(guidance.brief)).toContain('Sunrise City')
    expect(JSON.stringify(guidance.brief)).toContain('18.02')
    expect(guidance.brief.sections.safety).toContain('Không bắt đầu phần phát sinh khi khách chưa xác nhận đề xuất đổi phạm vi trong ứng dụng.')
    expect(guidance.brief.sections.guidance).toContain(
      'Nếu phát sinh thêm, gửi đề xuất đổi phạm vi kèm lý do; thêm ảnh nếu có. Chỉ làm khi khách xác nhận trong ứng dụng.',
    )
  })

  it('normalizes legacy knowledge guidance so Kael never owns a customer scope decision', () => {
    const output = buildWorkerBriefOutput({
      stage: 'guidance',
      serviceType: 'plumbing',
      problemSummary: 'Cần kiểm tra đường ống sau tường.',
      district: 'Quận 1',
      knowledgeSafetyGuidance: [
        'Nếu cần đục tường, tháo gạch hoặc mở trần, dừng để gửi scope-change kèm lý do và ảnh; không làm trước khi Kael quyết định.',
      ],
    })

    expect(output.brief.sections.safety).toContain(
      'Nếu cần đục tường, tháo gạch hoặc mở trần, dừng để gửi đề xuất đổi phạm vi kèm lý do; thêm ảnh nếu có. Không làm trước khi khách xác nhận đề xuất trong ứng dụng.',
    )
    expect(JSON.stringify(output.brief)).not.toContain('Kael quyết định')
  })

  it('builds scope-change worker challenge and customer card together', () => {
    const outputs = buildScopeChangeOutputs({
      serviceType: 'plumbing',
      originalPriceMax: 200000,
      newPriceMin: 500000,
      newPriceMax: 750000,
      newComplexity: 'large',
      hasPhotos: false,
      workerDescription: 'Phải đào tường vì đường ống chính hỏng.',
      workerReason: 'Vấn đề lớn hơn dự kiến.',
      workerScopeChangeRate: 0.4,
      riskConfig: {
        complexityHours: { small: 1, medium: 3, large: 6 },
        hcmcHourlyRateVnd: 100000,
        baseMultiplier: 1.5,
      },
    })

    expect(outputs.worker_challenge.challenge_required).toBe(true)
    expect(outputs.customer_card.price_change.new_price_max).toBe(750000)
    expect(outputs.customer_card.disclaimer).toBe(KAEL_PRICE_DISCLAIMER_V3)
    expect(outputs.anti_fraud.admin_flag_required).toBe(true)
  })
})

describe('mobile-api Kael P4 anti-fraud helpers', () => {
  it('keeps anomaly and margin calculations available from Edge scope-change module', () => {
    expect(calculateScopeChangeAnomaly({
      originalPriceMax: 100000,
      newPriceMax: 220000,
      hasPhotos: false,
      workerScopeChangeRate: 0.1,
      description: 'Cần thay đoạn nhỏ',
      reason: 'Có ảnh hiện trường',
    }).score).toBeCloseTo(0.5)

    expect(calculateScopeChangeMargin({
      newComplexity: 'small',
      newPriceMax: 400000,
      config: {
        complexityHours: { small: 1, medium: 3, large: 6 },
        hcmcHourlyRateVnd: 100000,
        baseMultiplier: 1.5,
      },
    }).assessment).toBe('requires_attention')
  })

  it('fails closed with finite output for malformed scope-risk numbers', () => {
    const anomaly = calculateScopeChangeAnomaly({
      originalPriceMax: Number.POSITIVE_INFINITY,
      newPriceMax: Number.NaN,
      hasPhotos: true,
      workerScopeChangeRate: Number.NaN,
      description: 'Scope changed.',
      reason: 'Needs review.',
    })

    expect(Number.isFinite(anomaly.driftRatio)).toBe(true)
    expect(anomaly).toMatchObject({
      score: 1,
      challengeRequired: true,
      adminFlagRequired: true,
      reasons: ['invalid_scope_change_risk_input'],
    })

    const margin = calculateScopeChangeMargin({
      newComplexity: 'medium',
      newPriceMax: Number.POSITIVE_INFINITY,
      config: {
        complexityHours: { small: 1, medium: Number.NaN, large: 6 },
        hcmcHourlyRateVnd: 100000,
        baseMultiplier: 1.5,
      },
    })
    expect(Number.isFinite(margin.fairPriceMax)).toBe(true)
    expect(margin).toEqual({
      fairPriceMax: 0,
      assessment: 'requires_attention',
      adminAlert: true,
    })
  })

  it('ignores blank and duplicate suspicious keyword configuration', () => {
    expect(matchSuspiciousScopeKeywords(
      'A normal scope update.',
      [' ', 'scope', ' scope '],
    )).toEqual(['scope'])
  })

  it('matches Vietnamese suspicious scope phrases with or without diacritics', () => {
    expect(matchSuspiciousScopeKeywords('phai thay het duong ong nay')).toContain('phải thay hết')
    expect(matchSuspiciousScopeKeywords('Phải thay hết đường ống này')).toContain('phải thay hết')
  })
})
