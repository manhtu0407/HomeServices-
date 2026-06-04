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

import { runKaelPipeline, CLARIFICATION_CAP } from '@/lib/kael/pipeline'
import type { IntentClassifyResult } from '@/lib/kael/intent'
import type { VisionAnalysisResult } from '@/lib/kael/vision'
import type { PriceSearchResult } from '@/lib/kael/pricing'

// Minimal price-baseline supabase stub (only needed by the cap-proceeds path).
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

  it('proceeds to an estimate (no clarification loop) once the cap is reached', async () => {
    const analyzeDescription = vi.fn().mockResolvedValue(VISION_OK)
    const result = await runKaelPipeline(
      { ...BASE_INPUT, clarificationCount: CLARIFICATION_CAP },
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

    expect(result.success).toBe(true)
    // Cap reached → it must move on to a best-effort estimate, i.e. run vision.
    expect(analyzeDescription).toHaveBeenCalled()
    // Sentiment is surfaced for the demanding-customer LLM-assist (one-turn lag).
    if (result.success) expect(result.customerSentiment).toBe('pressure')
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
})
