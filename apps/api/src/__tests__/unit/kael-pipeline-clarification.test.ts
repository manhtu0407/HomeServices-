import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
  },
  ensureServerEnv: vi.fn(),
}))

vi.mock('@/lib/db/query', () => ({
  withDbTimeout: vi.fn(<T>(p: PromiseLike<T>) => p),
}))

import { runKaelPipeline } from '@/lib/kael/pipeline'
import type { IntentClassifyResult } from '@/lib/kael/intent'
import type { VisionAnalysisResult } from '@/lib/kael/vision'
import type { PriceSearchResult } from '@/lib/kael/pricing'

// Minimal price-baseline Supabase stub for estimate paths.
function makeMockSupabase(baselineData: { price_min: number; price_max: number } | null) {
  const serviceProblemId = 'problem-breaker-trip'
  const serviceProblems = [{ id: serviceProblemId, service_type: 'electrical', slug: 'breaker_trip' }]
  const baselineRows = baselineData
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
      const tableRows = table === 'service_problems' ? serviceProblems : table === 'price_baselines' ? baselineRows : []
      const filteredRows = () =>
        tableRows.filter((row: Record<string, unknown>) =>
          filters.every((f) =>
            f.kind === 'in'
              ? Array.isArray(f.value) && f.value.includes(row[f.column])
              : row[f.column] === f.value,
          ),
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
      chain.then = (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: filteredRows(), error: null }).then(onFulfilled)
      return chain
    }),
  } as any
}

const BASE_INPUT = {
  serviceType: 'electrical',
  problemChips: [] as string[],
  description: 'nhà bị hư cái đó rồi',
  district: 'hcmc_all',
  intakeDiagnosisEnabled: true,
}

const VISION_OK: VisionAnalysisResult = {
  success: true,
  analysis: { problem_identified: 'Cầu dao bị trip', severity_indicators: [], complexity_hint: 'medium' },
}
const MARKET_OK: PriceSearchResult = {
  success: true,
  market: { market_range_min: 300000, market_range_max: 700000, confidence: 0.8 },
}

function diagnosis(intent: Record<string, unknown>): IntentClassifyResult {
  return { success: true, intent } as unknown as IntentClassifyResult
}

describe('runKaelPipeline — intake-diagnosis short-circuit', () => {
  it('short-circuits to NEEDS_CLARIFICATION with a contextual question, before vision', async () => {
    const analyzeDescription = vi.fn()
    const searchMarketPrice = vi.fn()
    const result = await runKaelPipeline(BASE_INPUT, makeMockSupabase(null), {
      diagnoseIntake: vi.fn().mockResolvedValue(
        diagnosis({
          service_type: 'electrical',
          problem_slug: 'other_electrical',
          confidence: 0.35,
          needs_clarification: true,
          missing_slots: ['symptom'],
          clarification_question_vi: 'Cầu dao có tự nhảy lại sau khi bạn bật lên không?',
          scope_signal: 'in_scope',
          customer_sentiment: 'neutral',
        }),
      ),
      analyzeDescription,
      searchMarketPrice,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NEEDS_CLARIFICATION')
      expect(result.clarification?.question).toContain('Cầu dao')
      expect(result.clarification?.missingSlots).toEqual(['symptom'])
    }
    // Short-circuit must happen before any downstream AI cost.
    expect(analyzeDescription).not.toHaveBeenCalled()
    expect(searchMarketPrice).not.toHaveBeenCalled()
  })

  it('short-circuits to SERVICE_MISMATCH with a suggested service', async () => {
    const result = await runKaelPipeline(
      { ...BASE_INPUT, serviceType: 'cleaning', description: 'Ổ cắm trong bếp bị cháy đen' },
      makeMockSupabase(null),
      {
        diagnoseIntake: vi.fn().mockResolvedValue(
          diagnosis({
            service_type: 'electrical',
            problem_slug: 'outlet_or_switch_broken',
            confidence: 0.7,
            needs_clarification: false,
            scope_signal: 'service_mismatch',
            suggested_service: 'electrical',
          }),
        ),
        analyzeDescription: vi.fn(),
        searchMarketPrice: vi.fn(),
      },
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('SERVICE_MISMATCH')
      expect(result.suggestedService).toBe('electrical')
    }
  })

  it('returns UNSUPPORTED when scope_signal is out_of_scope', async () => {
    const result = await runKaelPipeline(BASE_INPUT, makeMockSupabase(null), {
      diagnoseIntake: vi.fn().mockResolvedValue(
        diagnosis({
          service_type: 'electrical',
          problem_slug: 'other_electrical',
          confidence: 0.6,
          needs_clarification: false,
          scope_signal: 'out_of_scope',
        }),
      ),
      analyzeDescription: vi.fn(),
      searchMarketPrice: vi.fn(),
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('UNSUPPORTED')
  })

  it('keeps English clarification and unsupported fallbacks in English', async () => {
    const clarification = await runKaelPipeline(
      { ...BASE_INPUT, language: 'en' },
      makeMockSupabase(null),
      {
        diagnoseIntake: vi.fn().mockResolvedValue(
          diagnosis({
            service_type: 'electrical',
            problem_slug: 'other_electrical',
            confidence: 0.3,
            needs_clarification: true,
            missing_slots: ['symptom'],
            clarification_question_vi: 'Cầu dao có tự nhảy lại không?',
            scope_signal: 'in_scope',
          }),
        ),
        analyzeDescription: vi.fn(),
        searchMarketPrice: vi.fn(),
      },
    )
    expect(clarification).toMatchObject({
      success: false,
      code: 'NEEDS_CLARIFICATION',
      clarification: {
        question: 'Please describe the issue in a little more detail for Kael.',
      },
    })

    const unsupported = await runKaelPipeline(
      { ...BASE_INPUT, language: 'en' },
      makeMockSupabase(null),
      {
        diagnoseIntake: vi.fn().mockResolvedValue(
          diagnosis({
            service_type: 'unsupported',
            problem_slug: 'unsupported',
            confidence: 0.9,
            needs_clarification: false,
            scope_signal: 'out_of_scope',
          }),
        ),
        analyzeDescription: vi.fn(),
        searchMarketPrice: vi.fn(),
      },
    )
    expect(unsupported).toMatchObject({
      success: false,
      code: 'UNSUPPORTED',
      error: expect.stringContaining('NestScout supports'),
    })
  })

  it('keeps asking one focused question instead of forcing a best-effort estimate after an arbitrary count', async () => {
    const analyzeDescription = vi.fn()
    const result = await runKaelPipeline(
      { ...BASE_INPUT, clarificationCount: 99 },
      makeMockSupabase({ price_min: 300000, price_max: 700000 }),
      {
        diagnoseIntake: vi.fn().mockResolvedValue(
          diagnosis({
            service_type: 'electrical',
            problem_slug: 'breaker_trip',
            confidence: 0.4,
            needs_clarification: true,
            clarification_question_vi: 'còn câu hỏi nữa?',
            scope_signal: 'in_scope',
            customer_sentiment: 'pressure',
          }),
        ),
        analyzeDescription,
        searchMarketPrice: vi.fn().mockResolvedValue(MARKET_OK),
      },
    )

    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('NEEDS_CLARIFICATION')
    expect(analyzeDescription).not.toHaveBeenCalled()
  })

  it('uses classifyIntent (not diagnoseIntake) and ignores clarification when the flag is off', async () => {
    const diagnoseIntake = vi.fn()
    const classifyIntent = vi.fn().mockResolvedValue({
      success: true,
      intent: { service_type: 'electrical', problem_slug: 'breaker_trip', confidence: 0.9, needs_clarification: true },
    } as IntentClassifyResult)

    const result = await runKaelPipeline(
      { ...BASE_INPUT, intakeDiagnosisEnabled: false },
      makeMockSupabase({ price_min: 300000, price_max: 700000 }),
      {
        classifyIntent,
        diagnoseIntake,
        analyzeDescription: vi.fn().mockResolvedValue(VISION_OK),
        searchMarketPrice: vi.fn().mockResolvedValue(MARKET_OK),
      },
    )

    expect(result.success).toBe(true)
    expect(classifyIntent).toHaveBeenCalledTimes(1)
    expect(diagnoseIntake).not.toHaveBeenCalled()
  })

  it('localizes English estimate summary fields and passes language into vision', async () => {
    const analyzeDescription = vi.fn().mockResolvedValue({
      success: true,
      analysis: {
        problem_identified: 'The breaker trips after the outlet sparks',
        severity_indicators: ['burning smell'],
        complexity_hint: 'medium',
      },
    } satisfies VisionAnalysisResult)
    const result = await runKaelPipeline(
      { ...BASE_INPUT, language: 'en' },
      makeMockSupabase({ price_min: 300000, price_max: 700000 }),
      {
        diagnoseIntake: vi.fn().mockResolvedValue(
          diagnosis({
            service_type: 'electrical',
            problem_slug: 'breaker_trip',
            confidence: 0.9,
            needs_clarification: false,
            scope_signal: 'in_scope',
          }),
        ),
        analyzeDescription,
        searchMarketPrice: vi.fn().mockResolvedValue(MARKET_OK),
      },
    )

    expect(analyzeDescription).toHaveBeenCalledWith(
      expect.any(String),
      'electrical: breaker_trip',
      [],
      'en',
    )
    expect(result).toMatchObject({
      success: true,
      estimate: {
        problem_summary: 'The breaker trips after the outlet sparks',
        advisory: expect.stringContaining('serious issue'),
        disclaimer: expect.stringContaining("Kael's estimate"),
      },
    })
  })
})
