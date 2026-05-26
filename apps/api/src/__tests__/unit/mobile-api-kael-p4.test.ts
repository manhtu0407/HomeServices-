import { describe, expect, it } from 'vitest'

import {
  buildEstimateCardOutput,
  buildScopeChangeOutputs,
  buildWorkerBriefOutput,
  runKaelOutputPipeline,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/output-pipeline'
import {
  KAEL_PRICE_DISCLAIMER_V3,
  calculateScopeChangeAnomaly,
  calculateScopeChangeMargin,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/scope-change'

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
    expect(JSON.stringify(guidance.brief)).toContain('Sunrise City')
    expect(JSON.stringify(guidance.brief)).toContain('18.02')
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
})
