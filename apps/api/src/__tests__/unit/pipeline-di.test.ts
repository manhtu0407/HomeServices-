import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
  },
  ensureServerEnv: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn() },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  })),
}))

vi.mock('@/lib/db/query', () => ({
  withDbTimeout: vi.fn(<T>(p: PromiseLike<T>) => p),
}))

import { runKaelPipeline } from '@/lib/kael/pipeline'
import type { IntentClassifyResult } from '@/lib/kael/intent'
import type { VisionAnalysisResult } from '@/lib/kael/vision'
import type { PriceSearchResult } from '@/lib/kael/pricing'

function makeMockSupabase(baselineData: { price_min: number; price_max: number } | null) {
  const serviceProblemId = 'problem-breaker-trip'
  const serviceProblems: Array<Record<string, unknown>> = [
    { id: serviceProblemId, service_type: 'electrical', slug: 'breaker_trip' },
  ]
  const baselineRows: Array<Record<string, unknown>> = baselineData
    ? (['small', 'medium', 'large'] as const).map((complexity) => ({
        service_problem_id: serviceProblemId,
        service_type: 'electrical',
        complexity,
        price_min: baselineData.price_min,
        price_max: baselineData.price_max,
        district_code: 'hcmc_all',
      }))
    : []

  return {
    from: vi.fn((table: string) => {
      const filters: Array<{ column: string; value: unknown; kind: 'eq' | 'in' }> = []
      const tableRows: Array<Record<string, unknown>> = table === 'service_problems'
        ? serviceProblems
        : table === 'price_baselines'
          ? baselineRows
          : []

      const filteredRows = () =>
        tableRows.filter((row) =>
          filters.every((filter) => {
            const rowValue = row[filter.column]
            return filter.kind === 'in'
              ? Array.isArray(filter.value) && filter.value.includes(rowValue)
              : rowValue === filter.value
          }),
        )

      const chain: any = {}
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn((column: string, value: unknown) => {
        filters.push({ column, value, kind: 'eq' })
        return chain
      })
      chain.in = vi.fn((column: string, value: unknown[]) => {
        filters.push({ column, value, kind: 'in' })
        return chain
      })
      chain.then = (onFulfilled: (v: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
        Promise.resolve({ data: filteredRows(), error: null }).then(onFulfilled)
      return chain
    }),
  } as any
}

const INPUT = {
  serviceType: 'electrical',
  problemChips: ['Cầu dao trip'],
  description: 'Cầu dao bị trip liên tục',
  district: 'hcmc_all',
}

const MOCK_INTENT_SUCCESS: IntentClassifyResult = {
  success: true,
  intent: {
    service_type: 'electrical',
    problem_slug: 'breaker_trip',
    confidence: 0.9,
    needs_clarification: false,
  },
}

const MOCK_VISION_SUCCESS: VisionAnalysisResult = {
  success: true,
  analysis: {
    problem_identified: 'Cầu dao bị trip do quá tải',
    severity_indicators: [],
    complexity_hint: 'medium',
  },
}

const MOCK_MARKET_SUCCESS: PriceSearchResult = {
  success: true,
  market: {
    market_range_min: 300000,
    market_range_max: 700000,
    confidence: 0.8,
  },
}

describe('runKaelPipeline with DI providers', () => {
  it('succeeds with all stages passing', async () => {
    const supabase = makeMockSupabase({ price_min: 300000, price_max: 700000 })

    const result = await runKaelPipeline(INPUT, supabase, {
      classifyIntent: vi.fn().mockResolvedValue(MOCK_INTENT_SUCCESS),
      analyzeDescription: vi.fn().mockResolvedValue(MOCK_VISION_SUCCESS),
      searchMarketPrice: vi.fn().mockResolvedValue(MOCK_MARKET_SUCCESS),
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.estimate.service_type).toBe('electrical')
      expect(result.estimate.problem_category).toBe('breaker_trip')
      expect(result.serviceProblemId).toBe('problem-breaker-trip')
      expect(result.estimate.price_min).toBeGreaterThan(0)
      expect(result.estimate.price_max).toBeGreaterThan(result.estimate.price_min)
      expect(result.estimate.disclaimer).toContain('ước tính')
      expect(result.fallbackUsed).toBe(false)
    }
  })

  it('returns stage logs for every stage', async () => {
    const supabase = makeMockSupabase({ price_min: 300000, price_max: 700000 })

    const result = await runKaelPipeline(INPUT, supabase, {
      classifyIntent: vi.fn().mockResolvedValue(MOCK_INTENT_SUCCESS),
      analyzeDescription: vi.fn().mockResolvedValue(MOCK_VISION_SUCCESS),
      searchMarketPrice: vi.fn().mockResolvedValue(MOCK_MARKET_SUCCESS),
    })

    expect(result.stageLogs.length).toBe(5)
    expect(result.stageLogs.map((s) => s.stage)).toEqual([
      'intent', 'vision', 'baseline', 'market', 'synthesis',
    ])
  })

  it('records failureReason in stage logs when stage fails (Bug #5)', async () => {
    const supabase = makeMockSupabase({ price_min: 300000, price_max: 700000 })

    const result = await runKaelPipeline(INPUT, supabase, {
      classifyIntent: vi.fn().mockResolvedValue({
        success: false,
        fallback: MOCK_INTENT_SUCCESS.intent,
        failureReason: 'AI call failed: TIMEOUT — timeout',
      } as IntentClassifyResult),
      analyzeDescription: vi.fn().mockResolvedValue(MOCK_VISION_SUCCESS),
      searchMarketPrice: vi.fn().mockResolvedValue(MOCK_MARKET_SUCCESS),
    })

    expect(result.success).toBe(true)
    const intentLog = result.stageLogs.find((s) => s.stage === 'intent')
    expect(intentLog?.success).toBe(false)
    expect(intentLog?.failureReason).toContain('TIMEOUT')
    expect(intentLog?.fallbackUsed).toBe(true)
  })

  it('returns UNSUPPORTED for services outside electrical/plumbing/cleaning', async () => {
    const supabase = makeMockSupabase(null)

    const result = await runKaelPipeline(
      { ...INPUT, serviceType: 'hvac' as 'electrical' },
      supabase,
      {
        classifyIntent: vi.fn().mockResolvedValue({
          success: true,
          intent: {
            service_type: 'unsupported',
            problem_slug: 'unsupported',
            confidence: 0.95,
            needs_clarification: false,
          },
        } as IntentClassifyResult),
        analyzeDescription: vi.fn(),
        searchMarketPrice: vi.fn(),
      },
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UNSUPPORTED')
    }
  })

  it('returns NO_BASELINE when DB has no price data (Bug #2)', async () => {
    const supabase = makeMockSupabase(null)

    const result = await runKaelPipeline(INPUT, supabase, {
      classifyIntent: vi.fn().mockResolvedValue(MOCK_INTENT_SUCCESS),
      analyzeDescription: vi.fn().mockResolvedValue(MOCK_VISION_SUCCESS),
      searchMarketPrice: vi.fn(),
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NO_BASELINE')
      expect(result.error).toContain('dữ liệu giá')
    }
  })

  it('still succeeds when market price fails but baseline exists', async () => {
    const supabase = makeMockSupabase({ price_min: 300000, price_max: 700000 })

    const result = await runKaelPipeline(INPUT, supabase, {
      classifyIntent: vi.fn().mockResolvedValue(MOCK_INTENT_SUCCESS),
      analyzeDescription: vi.fn().mockResolvedValue(MOCK_VISION_SUCCESS),
      searchMarketPrice: vi.fn().mockResolvedValue({
        success: false,
        failureReason: 'Perplexity timeout',
      } as PriceSearchResult),
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.fallbackUsed).toBe(true)
      expect(result.estimate.price_min).toBe(300000)
      expect(result.estimate.price_max).toBe(700000)
    }
  })

  it('estimate always has disclaimer (Rule #4)', async () => {
    const supabase = makeMockSupabase({ price_min: 100000, price_max: 300000 })

    const result = await runKaelPipeline(INPUT, supabase, {
      classifyIntent: vi.fn().mockResolvedValue(MOCK_INTENT_SUCCESS),
      analyzeDescription: vi.fn().mockResolvedValue(MOCK_VISION_SUCCESS),
      searchMarketPrice: vi.fn().mockResolvedValue(MOCK_MARKET_SUCCESS),
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.estimate.disclaimer).toBeTruthy()
      expect(result.estimate.disclaimer).toContain('ước tính')
      expect(result.estimate.disclaimer).toContain('xác nhận')
    }
  })

  it('includes advisory for high-severity indicators', async () => {
    const supabase = makeMockSupabase({ price_min: 300000, price_max: 700000 })

    const result = await runKaelPipeline(INPUT, supabase, {
      classifyIntent: vi.fn().mockResolvedValue(MOCK_INTENT_SUCCESS),
      analyzeDescription: vi.fn().mockResolvedValue({
        success: true,
        analysis: {
          problem_identified: 'Mùi khét từ ổ cắm',
          severity_indicators: ['mùi khét', 'nguy hiểm'],
          complexity_hint: 'large',
        },
      } as VisionAnalysisResult),
      searchMarketPrice: vi.fn().mockResolvedValue(MOCK_MARKET_SUCCESS),
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.estimate.advisory).not.toBeNull()
      expect(result.estimate.advisory).toContain('nghiêm trọng')
    }
  })

  it('no advisory for low-severity indicators', async () => {
    const supabase = makeMockSupabase({ price_min: 300000, price_max: 700000 })

    const result = await runKaelPipeline(INPUT, supabase, {
      classifyIntent: vi.fn().mockResolvedValue(MOCK_INTENT_SUCCESS),
      analyzeDescription: vi.fn().mockResolvedValue({
        success: true,
        analysis: {
          problem_identified: 'Đèn chập chờn',
          severity_indicators: ['nhấp nháy nhẹ'],
          complexity_hint: 'small',
        },
      } as VisionAnalysisResult),
      searchMarketPrice: vi.fn().mockResolvedValue(MOCK_MARKET_SUCCESS),
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.estimate.advisory).toBeNull()
    }
  })
})
