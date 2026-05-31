import { describe, expect, it } from 'vitest'

import {
  KAEL_PRICE_DISCLAIMER_V3,
  estimateCardV3Schema,
  scopeChangeCustomerCardSchema,
  scopeChangeWorkerChallengeSchema,
  workerBriefSchema,
} from '../../kael/schemas'
import {
  sanitizeKaelText,
  stripVndPatterns,
  scrubPiiText,
} from '../../kael/sanitizers'
import {
  buildEstimateCardFallback,
  buildScopeChangeCustomerCardFallback,
  buildWorkerBriefFallback,
} from '../../kael/fallbacks'
import {
  renderEstimateCardV3,
  renderWorkerBrief,
} from '../../kael/renderers'
import {
  calculateScopeChangeAnomaly,
  calculateScopeChangeMargin,
  matchSuspiciousScopeKeywords,
} from '../../kael/anti-fraud'

const validEstimateCard = {
  service_type: 'plumbing' as const,
  problem_summary: 'Ống nước dưới lavabo bị rò và cần kiểm tra tại chỗ',
  complexity: 'medium' as const,
  price_min: 250000,
  price_max: 450000,
  confidence: 'medium' as const,
  needs_inspection: false,
  price_source: 'baseline_with_market' as const,
  kael_reasoning: {
    vision_findings: 'Ảnh cho thấy khu vực dưới lavabo bị ẩm.',
    market_signals: 'Khoảng giá sửa rò nước nhẹ trong căn hộ TP.HCM.',
    baseline_used: 'plumbing:pipe_leak:medium',
    complexity_reasoning: 'Có dấu hiệu rò nhưng chưa thấy vỡ ống chính.',
  },
  advisory: 'Khóa van nước trước khi thợ đến nếu nước rò liên tục.',
  disclaimer: KAEL_PRICE_DISCLAIMER_V3,
}

describe('Kael P4 output schemas', () => {
  it('accepts valid Estimate Card v3 and rejects invalid cross-field output', () => {
    expect(estimateCardV3Schema.parse(validEstimateCard)).toMatchObject({
      service_type: 'plumbing',
      price_source: 'baseline_with_market',
    })

    expect(estimateCardV3Schema.safeParse({
      ...validEstimateCard,
      price_min: 500000,
      price_max: 300000,
    }).success).toBe(false)

    expect(estimateCardV3Schema.safeParse({
      ...validEstimateCard,
      unexpected_raw_ai: 'raw provider prose',
    }).success).toBe(false)
  })

  it('requires inspection cards to be low confidence with an advisory', () => {
    const parsed = estimateCardV3Schema.parse({
      ...validEstimateCard,
      confidence: 'low',
      needs_inspection: true,
      price_source: 'inspection_required',
      advisory: 'Cần thợ kiểm tra trực tiếp trước khi chốt phạm vi.',
      kael_reasoning: {
        ...validEstimateCard.kael_reasoning,
        needs_inspection_reason: 'Ảnh và mô tả chưa đủ để phân biệt rò nhẹ hay hỏng ống âm.',
      },
    })

    expect(parsed.needs_inspection).toBe(true)
    expect(parsed.confidence).toBe('low')
    expect(parsed.advisory).toBeTruthy()

    expect(estimateCardV3Schema.safeParse({
      ...validEstimateCard,
      needs_inspection: true,
      price_source: 'inspection_required',
      confidence: 'high',
      advisory: undefined,
    }).success).toBe(false)
  })

  it('validates Worker Brief and Scope-Change card contracts strictly', () => {
    expect(workerBriefSchema.safeParse(buildWorkerBriefFallback({
      stage: 'core',
      serviceType: 'electrical',
      district: 'Quận 7',
      problemSummary: 'Ổ cắm có dấu hiệu cháy cần kiểm tra.',
      fullAddress: null,
    })).success).toBe(true)

    expect(scopeChangeWorkerChallengeSchema.safeParse({
      schema_version: 'scope_change_worker_challenge.v1',
      challenge_required: true,
      challenge_reason: 'Mức tăng cao và thiếu ảnh hiện trường.',
      requested_evidence: ['Ảnh cận cảnh phần hỏng', 'Giải thích phần phát sinh'],
      worker_message: 'Kael cần thêm bằng chứng trước khi ra quyết định phạm vi.',
    }).success).toBe(true)

    expect(scopeChangeCustomerCardSchema.safeParse(
      buildScopeChangeCustomerCardFallback({
        serviceType: 'plumbing',
        originalPriceMax: 300000,
        newPriceMin: 450000,
        newPriceMax: 650000,
        problemSummary: 'Thợ báo phát sinh phần ống chính.',
      }),
    ).success).toBe(true)
  })
})

describe('Kael P4 sanitizers, fallbacks, and renderers', () => {
  it('scrubs PII and exact VND text from user-visible Kael text', () => {
    const text = 'SĐT 0901234567, căn 12A tầng 9, giá 350.000 VND cần gọi lại.'

    const sanitized = sanitizeKaelText(text)

    expect(sanitized).not.toContain('0901234567')
    expect(sanitized).not.toContain('12A')
    expect(sanitized.toLowerCase()).not.toContain('vnd')
    expect(stripVndPatterns('Tăng thêm 500000đ')).not.toMatch(/500000|đ/i)
    expect(scrubPiiText('email test@example.com và CCCD 001234567890')).not.toContain('test@example.com')
  })

  it('returns deterministic valid fallbacks and sanitized rendered output', () => {
    const fallback = buildEstimateCardFallback({
      serviceType: 'cleaning',
      problemSummary: 'Khách cần tổng vệ sinh căn hộ sau sửa chữa.',
      complexity: 'medium',
      priceMin: 300000,
      priceMax: 600000,
      baselineUsed: 'cleaning:deep_cleaning:medium',
    })

    expect(estimateCardV3Schema.safeParse(fallback).success).toBe(true)
    expect(renderEstimateCardV3(fallback).disclaimer).toBe(KAEL_PRICE_DISCLAIMER_V3)
    expect(renderEstimateCardV3({
      ...fallback,
      advisory: 'Không báo giá 600.000 VND trong ghi chú.',
    }).advisory).not.toMatch(/600|vnd/i)
  })

  it('keeps Worker Brief pre-accept district-only and post-accept address-visible', () => {
    const preAccept = buildWorkerBriefFallback({
      stage: 'core',
      serviceType: 'electrical',
      district: 'Quận 1',
      problemSummary: 'Cầu dao thường xuyên bị trip.',
      fullAddress: {
        building: 'Landmark 81',
        floor: '12',
        unit: '1205',
        district: 'Bình Thạnh',
      },
    })

    const postAccept = buildWorkerBriefFallback({
      stage: 'guidance',
      serviceType: 'electrical',
      district: 'Quận 1',
      problemSummary: 'Cầu dao thường xuyên bị trip.',
      fullAddress: {
        building: 'Landmark 81',
        floor: '12',
        unit: '1205',
        district: 'Bình Thạnh',
      },
    })

    const preRendered = JSON.stringify(renderWorkerBrief(preAccept))
    const postRendered = JSON.stringify(renderWorkerBrief(postAccept))

    expect(preAccept.visibility).toBe('pre_accept')
    expect(preRendered).not.toContain('Landmark 81')
    expect(preRendered).not.toContain('1205')
    expect(postAccept.visibility).toBe('post_accept')
    expect(postRendered).toContain('Landmark 81')
    expect(postRendered).toContain('1205')
  })
})

describe('Kael P4 scope-change anti-fraud', () => {
  it('calculates anomaly score, challenge threshold, and admin flag threshold', () => {
    const result = calculateScopeChangeAnomaly({
      originalPriceMax: 100000,
      newPriceMax: 350000,
      hasPhotos: false,
      description: 'Phải đào tường vì vấn đề lớn hơn dự kiến',
      reason: 'Không thể xử lý như ban đầu',
      workerScopeChangeRate: 0.4,
      suspiciousKeywords: [
        'phải đào tường',
        'vấn đề lớn hơn dự kiến',
      ],
    })

    expect(result.driftRatio).toBe(3.5)
    expect(result.score).toBeCloseTo(1)
    expect(result.challengeRequired).toBe(true)
    expect(result.adminFlagRequired).toBe(true)
    expect(result.matchedKeywords).toEqual(['phải đào tường', 'vấn đề lớn hơn dự kiến'])
  })

  it('calculates fair_price_max from injected admin-tunable config', () => {
    const margin = calculateScopeChangeMargin({
      newComplexity: 'medium',
      newPriceMax: 800000,
      config: {
        complexityHours: { small: 1, medium: 3, large: 6 },
        hcmcHourlyRateVnd: 100000,
        baseMultiplier: 1.5,
      },
    })

    expect(margin.fairPriceMax).toBe(450000)
    expect(margin.assessment).toBe('high_increase')
    expect(margin.adminAlert).toBe(false)
  })

  it('classifies suspicious Vietnamese scope-change keywords', () => {
    expect(matchSuspiciousScopeKeywords(
      'Thợ nói phải thay hết vì đường ống chính hỏng.',
      ['phải thay hết', 'đường ống chính'],
    )).toEqual(['phải thay hết', 'đường ống chính'])
  })
})
