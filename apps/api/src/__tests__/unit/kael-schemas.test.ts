import { describe, it, expect } from 'vitest'
import {
  intentResultSchema,
  visionResultSchema,
  marketPriceResultSchema,
  kaelEstimateSchema,
  workerPrebriefSchema,
  PRICE_DISCLAIMER,
  UNSUPPORTED_SERVICE_MESSAGE,
} from '@/lib/kael/schemas'

describe('kael-schemas — intentResultSchema', () => {
  const validIntent = {
    service_type: 'electrical',
    problem_slug: 'breaker_trip',
    confidence: 0.85,
    needs_clarification: false,
  }

  it('parses valid electrical intent', () => {
    const result = intentResultSchema.safeParse(validIntent)
    expect(result.success).toBe(true)
  })

  it('parses valid plumbing intent', () => {
    const result = intentResultSchema.safeParse({
      ...validIntent,
      service_type: 'plumbing',
      problem_slug: 'pipe_leak',
    })
    expect(result.success).toBe(true)
  })

  it('parses unsupported service type', () => {
    const result = intentResultSchema.safeParse({
      ...validIntent,
      service_type: 'unsupported',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid service type', () => {
    const result = intentResultSchema.safeParse({
      ...validIntent,
      service_type: 'hvac',
    })
    expect(result.success).toBe(false)
  })

  it('rejects confidence > 1', () => {
    const result = intentResultSchema.safeParse({
      ...validIntent,
      confidence: 1.5,
    })
    expect(result.success).toBe(false)
  })

  it('rejects confidence < 0', () => {
    const result = intentResultSchema.safeParse({
      ...validIntent,
      confidence: -0.1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty problem_slug', () => {
    const result = intentResultSchema.safeParse({
      ...validIntent,
      problem_slug: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing fields', () => {
    const result = intentResultSchema.safeParse({
      service_type: 'electrical',
    })
    expect(result.success).toBe(false)
  })
})

describe('kael-schemas — visionResultSchema', () => {
  const validVision = {
    problem_identified: 'Cầu dao bị trip liên tục do quá tải',
    severity_indicators: ['mùi khét', 'cháy đen'],
    complexity_hint: 'medium',
  }

  it('parses valid vision result', () => {
    const result = visionResultSchema.safeParse(validVision)
    expect(result.success).toBe(true)
  })

  it('parses with empty severity indicators', () => {
    const result = visionResultSchema.safeParse({
      ...validVision,
      severity_indicators: [],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty problem_identified', () => {
    const result = visionResultSchema.safeParse({
      ...validVision,
      problem_identified: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid complexity_hint', () => {
    const result = visionResultSchema.safeParse({
      ...validVision,
      complexity_hint: 'huge',
    })
    expect(result.success).toBe(false)
  })

  it('rejects more than 5 severity indicators', () => {
    const result = visionResultSchema.safeParse({
      ...validVision,
      severity_indicators: ['a', 'b', 'c', 'd', 'e', 'f'],
    })
    expect(result.success).toBe(false)
  })
})

describe('kael-schemas — marketPriceResultSchema', () => {
  const validMarket = {
    market_range_min: 200000,
    market_range_max: 500000,
    confidence: 0.7,
  }

  it('parses valid market result', () => {
    const result = marketPriceResultSchema.safeParse(validMarket)
    expect(result.success).toBe(true)
  })

  it('parses with optional sources_summary', () => {
    const result = marketPriceResultSchema.safeParse({
      ...validMarket,
      sources_summary: 'Based on local repair shops',
    })
    expect(result.success).toBe(true)
  })

  it('accepts longer Sonar source summaries without discarding valid price JSON', () => {
    const result = marketPriceResultSchema.safeParse({
      ...validMarket,
      sources_summary: 'Sonar source summary '.repeat(35),
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative price', () => {
    const result = marketPriceResultSchema.safeParse({
      ...validMarket,
      market_range_min: -100,
    })
    expect(result.success).toBe(false)
  })

  it('rejects zero price', () => {
    const result = marketPriceResultSchema.safeParse({
      ...validMarket,
      market_range_min: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-integer price', () => {
    const result = marketPriceResultSchema.safeParse({
      ...validMarket,
      market_range_min: 150000.5,
    })
    expect(result.success).toBe(false)
  })
})

describe('kael-schemas — kaelEstimateSchema', () => {
  const validEstimate = {
    service_type: 'electrical',
    problem_category: 'breaker_trip',
    problem_summary: 'Cầu dao bị trip do quá tải',
    complexity: 'medium',
    price_min: 250000,
    price_max: 500000,
    confidence: 0.7,
    advisory: null,
    disclaimer: PRICE_DISCLAIMER,
  }

  it('parses valid estimate', () => {
    const result = kaelEstimateSchema.safeParse(validEstimate)
    expect(result.success).toBe(true)
  })

  it('parses with advisory', () => {
    const result = kaelEstimateSchema.safeParse({
      ...validEstimate,
      advisory: 'Lưu ý: vấn đề có thể phức tạp hơn dự kiến',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing disclaimer', () => {
    const result = kaelEstimateSchema.safeParse({
      ...validEstimate,
      disclaimer: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects unsupported as estimate service_type', () => {
    const result = kaelEstimateSchema.safeParse({
      ...validEstimate,
      service_type: 'unsupported',
    })
    expect(result.success).toBe(false)
  })
})

describe('kael-schemas — workerPrebriefSchema', () => {
  const validPrebrief = {
    job_id: '550e8400-e29b-41d4-a716-446655440000',
    service_type: 'plumbing',
    problem_summary: 'Ống nước bị rò rỉ dưới bồn rửa',
    customer_description: 'Nước chảy liên tục dưới bồn rửa bát',
    complexity: 'small',
    key_observations: ['Kiểm tra mối nối ống'],
    suggested_tools: ['Kìm nước', 'Băng keo chống thấm'],
    estimated_duration_minutes: 45,
  }

  it('parses valid prebrief', () => {
    const result = workerPrebriefSchema.safeParse(validPrebrief)
    expect(result.success).toBe(true)
  })

  it('rejects invalid UUID for job_id', () => {
    const result = workerPrebriefSchema.safeParse({
      ...validPrebrief,
      job_id: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects duration > 480 minutes', () => {
    const result = workerPrebriefSchema.safeParse({
      ...validPrebrief,
      estimated_duration_minutes: 500,
    })
    expect(result.success).toBe(false)
  })

  it('rejects zero duration', () => {
    const result = workerPrebriefSchema.safeParse({
      ...validPrebrief,
      estimated_duration_minutes: 0,
    })
    expect(result.success).toBe(false)
  })
})

describe('kael-schemas — constants', () => {
  it('PRICE_DISCLAIMER contains required text', () => {
    expect(PRICE_DISCLAIMER).toContain('ước tính')
    expect(PRICE_DISCLAIMER).toContain('Kael')
  })

  it('UNSUPPORTED_SERVICE_MESSAGE mentions electrical, plumbing, and cleaning', () => {
    expect(UNSUPPORTED_SERVICE_MESSAGE).toContain('sửa điện')
    expect(UNSUPPORTED_SERVICE_MESSAGE).toContain('sửa nước')
    expect(UNSUPPORTED_SERVICE_MESSAGE).toContain('vệ sinh')
  })
})
