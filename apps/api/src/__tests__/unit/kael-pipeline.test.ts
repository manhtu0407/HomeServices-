import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AIResponse, AIError } from '@nestscout/shared'

vi.mock('@/lib/env', () => ({
  env: {
    anthropicApiKey: 'test-key',
    perplexityApiKey: 'test-key',
    deepseekApiKey: 'test-key',
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
  },
  ensureServerEnv: vi.fn(),
}))

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}))

import { callAI } from '@/lib/ai/client'
import { classifyIntent } from '@/lib/kael/intent'
import { analyzeDescription } from '@/lib/kael/vision'
import { searchMarketPrice, synthesizePrice } from '@/lib/kael/pricing'
import { fetchBaseline } from '@/lib/kael/baseline'

const mockCallAI = callAI as ReturnType<typeof vi.fn>

function mockAISuccess(content: string): AIResponse {
  return {
    content,
    usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
    latencyMs: 200,
    success: true,
  }
}

function mockAIFailure(): AIError {
  return {
    provider: 'deepseek',
    error: 'timeout',
    code: 'TIMEOUT',
    retryable: false,
    success: false,
  }
}

describe('kael-pipeline — classifyIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns parsed intent on AI success', async () => {
    mockCallAI.mockResolvedValue(mockAISuccess(JSON.stringify({
      service_type: 'electrical',
      problem_slug: 'breaker_trip',
      confidence: 0.9,
      needs_clarification: false,
    })))

    const result = await classifyIntent('electrical', ['Cầu dao trip'], 'Cầu dao bị trip liên tục')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.intent.service_type).toBe('electrical')
      expect(result.intent.problem_slug).toBe('breaker_trip')
    }
  })

  it('returns fallback on AI failure', async () => {
    mockCallAI.mockResolvedValue(mockAIFailure())

    const result = await classifyIntent('electrical', ['Cầu dao trip'], 'Cầu dao bị trip')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.fallback.service_type).toBe('electrical')
      expect(result.fallback.problem_slug).toBe('breaker_trip')
      expect(result.fallback.confidence).toBeLessThan(0.5)
    }
  })

  it('uses Anthropic intent fallback before local heuristic fallback when DeepSeek fails', async () => {
    mockCallAI
      .mockResolvedValueOnce(mockAIFailure())
      .mockResolvedValueOnce(mockAISuccess(JSON.stringify({
        service_type: 'plumbing',
        problem_slug: 'pipe_leak',
        confidence: 0.85,
        needs_clarification: false,
      })))

    const result = await classifyIntent('plumbing', ['Ống rò rỉ'], 'Ống nước rò rỉ')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.intent.problem_slug).toBe('pipe_leak')
    }
    expect(mockCallAI).toHaveBeenNthCalledWith(1, expect.objectContaining({ provider: 'deepseek' }))
    expect(mockCallAI).toHaveBeenNthCalledWith(2, expect.objectContaining({ provider: 'anthropic' }))
  })

  it('returns fallback on invalid JSON response', async () => {
    mockCallAI.mockResolvedValue(mockAISuccess('This is not JSON'))

    const result = await classifyIntent('plumbing', ['Ống rò rỉ'], 'Ống nước rò rỉ')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.fallback.service_type).toBe('plumbing')
      expect(result.fallback.problem_slug).toBe('pipe_leak')
    }
  })

  it('returns fallback on schema validation failure', async () => {
    mockCallAI.mockResolvedValue(mockAISuccess(JSON.stringify({
      service_type: 'electrical',
      confidence: 'high',
    })))

    const result = await classifyIntent('electrical', ['Cầu dao trip'], 'test')
    expect(result.success).toBe(false)
  })

  it('maps known problem chips to slugs in fallback', async () => {
    mockCallAI.mockResolvedValue(mockAIFailure())

    const cases = [
      { chip: 'Mất điện một phòng', slug: 'power_outage_one_room' },
      { chip: 'Mất điện toàn căn', slug: 'power_outage_whole_unit' },
      { chip: 'Ổ cắm/công tắc hỏng', slug: 'outlet_or_switch_broken' },
      { chip: 'Tắc cống/bồn', slug: 'clogged_drain_or_sink' },
      { chip: 'Vòi hỏng', slug: 'faucet_broken' },
      { chip: 'Toilet không xả', slug: 'toilet_flush_issue' },
    ]

    for (const { chip, slug } of cases) {
      const serviceType = ['Mất điện một phòng', 'Mất điện toàn căn', 'Ổ cắm/công tắc hỏng'].includes(chip)
        ? 'electrical'
        : 'plumbing'

      const result = await classifyIntent(serviceType, [chip], 'test description for testing')
      if (!result.success) {
        expect(result.fallback.problem_slug).toBe(slug)
      }
    }
  })

  it('uses other_electrical for unknown electrical chips', async () => {
    mockCallAI.mockResolvedValue(mockAIFailure())

    const result = await classifyIntent('electrical', ['Vấn đề khác'], 'Something unknown')
    if (!result.success) {
      expect(result.fallback.problem_slug).toBe('other_electrical')
    }
  })

  it('uses other_plumbing for unknown plumbing chips', async () => {
    mockCallAI.mockResolvedValue(mockAIFailure())

    const result = await classifyIntent('plumbing', ['Vấn đề khác'], 'Something unknown')
    if (!result.success) {
      expect(result.fallback.problem_slug).toBe('other_plumbing')
    }
  })

  it('handles cleaning service type in fallback', async () => {
    mockCallAI.mockResolvedValue(mockAIFailure())

    const result = await classifyIntent('cleaning', ['test'], 'test desc for service')
    if (!result.success) {
      expect(result.fallback.service_type).toBe('cleaning')
      expect(result.fallback.problem_slug).toBe('other_cleaning')
    }
  })
})

describe('kael-pipeline — analyzeDescription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns parsed analysis on AI success', async () => {
    mockCallAI.mockResolvedValue(mockAISuccess(JSON.stringify({
      problem_identified: 'Ống nước bị rò rỉ tại mối nối',
      severity_indicators: ['rò rỉ liên tục'],
      complexity_hint: 'small',
    })))

    const result = await analyzeDescription('Nước chảy dưới bồn', 'plumbing: pipe_leak')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.analysis.problem_identified).toContain('rò rỉ')
      expect(result.analysis.complexity_hint).toBe('small')
    }
  })

  it('returns fallback on AI failure', async () => {
    mockCallAI.mockResolvedValue(mockAIFailure())

    const result = await analyzeDescription('test description', 'electrical: breaker_trip')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.fallback.complexity_hint).toBe('medium')
    }
  })

  it('returns fallback with intent context on failure', async () => {
    mockCallAI.mockResolvedValue(mockAIFailure())

    const result = await analyzeDescription('test', 'plumbing: pipe_leak')
    if (!result.success) {
      expect(result.fallback.problem_identified).toBe('plumbing: pipe_leak')
    }
  })
})

describe('kael-pipeline — searchMarketPrice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns parsed market price on AI success', async () => {
    mockCallAI.mockResolvedValue(mockAISuccess(JSON.stringify({
      market_range_min: 200000,
      market_range_max: 400000,
      confidence: 0.8,
      sources_summary: 'Local repair shops HCMC',
    })))

    const result = await searchMarketPrice('electrical', 'breaker_trip', 'medium', 'quan_1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.market.market_range_min).toBe(200000)
      expect(result.market.market_range_max).toBe(400000)
    }
  })

  it('returns failure on AI error', async () => {
    mockCallAI.mockResolvedValue(mockAIFailure())

    const result = await searchMarketPrice('plumbing', 'pipe_leak', 'small', 'quan_7')
    expect(result.success).toBe(false)
  })

  it('rejects when max < min', async () => {
    mockCallAI.mockResolvedValue(mockAISuccess(JSON.stringify({
      market_range_min: 500000,
      market_range_max: 200000,
      confidence: 0.5,
    })))

    const result = await searchMarketPrice('electrical', 'breaker_trip', 'medium', 'quan_1')
    expect(result.success).toBe(false)
  })
})

describe('kael-pipeline — fetchBaseline', () => {
  it('rejects invalid raw baseline rows instead of returning zero prices', async () => {
    const supabase = makeSequenceSupabase([
      { data: [{ id: 'pipe-problem' }], error: null },
      { data: [{ price_min: null, price_max: 250000, district_code: 'q7' }], error: null },
    ]).supabase

    const result = await fetchBaseline(supabase, 'plumbing', 'pipe_leak', 'medium', 'q7')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Invalid price baseline')
    }
  })
})

describe('kael-pipeline — synthesizePrice', () => {
  it('returns baseline-only when no market data', () => {
    const result = synthesizePrice({
      baselineMin: 200000,
      baselineMax: 500000,
      market: null,
      complexityHint: 'medium',
    })

    expect(result.price_min).toBe(200000)
    expect(result.price_max).toBe(500000)
    expect(result.source).toBe('baseline_only')
    expect(result.confidence).toBe(0.4)
  })

  it('returns weighted average when market data available', () => {
    const result = synthesizePrice({
      baselineMin: 200000,
      baselineMax: 500000,
      market: {
        market_range_min: 250000,
        market_range_max: 600000,
        confidence: 0.8,
      },
      complexityHint: 'medium',
    })

    expect(result.source).toBe('market_weighted')
    expect(result.price_min).toBeGreaterThan(0)
    expect(result.price_max).toBeGreaterThan(result.price_min)
  })

  it('applies small complexity multiplier', () => {
    const result = synthesizePrice({
      baselineMin: 200000,
      baselineMax: 500000,
      market: {
        market_range_min: 200000,
        market_range_max: 500000,
        confidence: 0.7,
      },
      complexityHint: 'small',
    })

    expect(result.price_min).toBeLessThan(200000)
  })

  it('applies large complexity multiplier', () => {
    const result = synthesizePrice({
      baselineMin: 200000,
      baselineMax: 500000,
      market: {
        market_range_min: 200000,
        market_range_max: 500000,
        confidence: 0.7,
      },
      complexityHint: 'large',
    })

    expect(result.price_min).toBeGreaterThan(200000)
  })

  it('ensures price_max > price_min', () => {
    const result = synthesizePrice({
      baselineMin: 100000,
      baselineMax: 100000,
      market: {
        market_range_min: 100000,
        market_range_max: 100000,
        confidence: 0.5,
      },
      complexityHint: 'small',
    })

    expect(result.price_max).toBeGreaterThan(result.price_min)
  })

  it('rounds prices to thousands', () => {
    const result = synthesizePrice({
      baselineMin: 203456,
      baselineMax: 507890,
      market: {
        market_range_min: 215000,
        market_range_max: 520000,
        confidence: 0.6,
      },
      complexityHint: 'medium',
    })

    expect(result.price_min % 1000).toBe(0)
    expect(result.price_max % 1000).toBe(0)
  })

  it('confidence is capped at 0.85', () => {
    const result = synthesizePrice({
      baselineMin: 200000,
      baselineMax: 500000,
      market: {
        market_range_min: 200000,
        market_range_max: 500000,
        confidence: 1.0,
      },
      complexityHint: 'medium',
    })

    expect(result.confidence).toBeLessThanOrEqual(0.85)
  })
})

describe('kael-pipeline fetchBaseline problem-specific selection', () => {
  it('filters price baselines by service problem slug before choosing a district match', async () => {
    const { supabase, calls } = makeSequenceSupabase([
      { data: [{ id: 'pipe-problem' }], error: null },
      { data: [{ price_min: 150000, price_max: 350000, district_code: 'q7' }], error: null },
    ])

    const result = await fetchBaseline(supabase, 'plumbing', 'pipe_leak', 'small', 'q7')

    expect(result).toMatchObject({
      success: true,
      priceMin: 150000,
      priceMax: 350000,
      matchedDistrict: 'q7',
    })
    expect(calls[0]).toMatchObject({
      table: 'service_problems',
      operations: expect.arrayContaining([
        ['eq', 'service_type', 'plumbing'],
        ['eq', 'slug', 'pipe_leak'],
      ]),
    })
    expect(calls[1]).toMatchObject({
      table: 'price_baselines',
      operations: expect.arrayContaining([
        ['eq', 'service_problem_id', 'pipe-problem'],
        ['eq', 'service_type', 'plumbing'],
        ['eq', 'complexity', 'small'],
      ]),
    })
  })
})

function makeSequenceSupabase(results: Array<{ data: unknown; error: unknown }>) {
  const calls: Array<{ table: string; operations: unknown[][] }> = []
  const supabase = {
    from(table: string) {
      const call = { table, operations: [] as unknown[][] }
      calls.push(call)
      const query = {
        select(columns?: string) {
          call.operations.push(['select', columns])
          return query
        },
        eq(column: string, value: unknown) {
          call.operations.push(['eq', column, value])
          return query
        },
        in(column: string, value: unknown[]) {
          call.operations.push(['in', column, value])
          return query
        },
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): PromiseLike<TResult1 | TResult2> {
          const next = results.shift() ?? { data: null, error: null }
          return Promise.resolve(next).then(onfulfilled, onrejected)
        },
      }
      return query
    },
  } as any
  return { supabase, calls }
}
