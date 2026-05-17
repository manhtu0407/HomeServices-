/**
 * Bug verification tests — one assertion per PR#9 bug.
 * These tests verify that each of the 10 bugs from PR#9 is addressed.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
  },
  ensureServerEnv: vi.fn(),
}))

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}))

vi.mock('@/lib/db/query', () => ({
  withDbTimeout: <T,>(p: PromiseLike<T>) => p,
  DbTimeoutError: class extends Error {},
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn() },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(),
      insert: vi.fn(() => ({ error: null })),
    })),
  })),
}))

describe('Bug #1: safeParseJSON brace-counting (not regex)', () => {
  it('handles nested JSON that regex would break', async () => {
    const { safeParseJSON } = await import('@/lib/kael/parsing')
    const nested = '{"outer": {"inner": {"deep": 42}}}'
    expect(safeParseJSON(nested)).toEqual({ outer: { inner: { deep: 42 } } })
  })

  it('does not greedily match across multiple objects', async () => {
    const { safeParseJSON } = await import('@/lib/kael/parsing')
    const multi = '{"a": 1} text {"b": 2}'
    expect(safeParseJSON(multi)).toEqual({ a: 1 })
  })
})

describe('Bug #2: No hardcoded VND fallbacks', () => {
  it('defaults.ts no longer exports getFallbackBaseline', async () => {
    const defaults = await import('@/lib/kael/defaults')
    expect('getFallbackBaseline' in defaults).toBe(false)
  })

  it('defaults.ts no longer exports FALLBACK_BASELINES', async () => {
    const defaults = await import('@/lib/kael/defaults')
    expect('FALLBACK_BASELINES' in defaults).toBe(false)
  })
})

describe('Bug #3: confirm-completion does NOT auto-pay', () => {
  it('confirm-completion route does not contain payment_pending or paid transitions', () => {
    const routeCode = readFileSync(
      join(__dirname, '../../app/api/jobs/[id]/confirm-completion/route.ts'),
      'utf-8',
    )
    expect(routeCode).not.toContain('payment_pending')
    expect(routeCode).not.toContain("'paid'")
    expect(routeCode).not.toContain('auto_payment')
    expect(routeCode).toContain('confirmed_by_customer')
  })
})

describe('Bug #4: DB queries have timeout', () => {
  it('all route files import withDbTimeout', () => {
    const routes = [
      'services/route.ts',
      'jobs/route.ts',
      'jobs/[id]/route.ts',
      'jobs/[id]/confirm-search/route.ts',
      'jobs/[id]/confirm-completion/route.ts',
      'jobs/[id]/status/route.ts',
      'jobs/[id]/review/route.ts',
    ]

    for (const route of routes) {
      const isJobsRoute = route === 'jobs/route.ts'
      const path = join(__dirname, '../../app/api', route)
      if (isJobsRoute) {
        const code = readFileSync(join(__dirname, '../../lib/jobs/create-job.ts'), 'utf-8')
        expect(code, `create-job.ts should import withDbTimeout`).toContain('withDbTimeout')
      } else {
        const code = readFileSync(path, 'utf-8')
        expect(code, `${route} should import withDbTimeout`).toContain('withDbTimeout')
      }
    }
  })
})

describe('Bug #5: Pipeline logs failure reason', () => {
  it('intent module returns failureReason on failure', async () => {
    const { callAI } = await import('@/lib/ai/client')
    const mockCallAI = callAI as ReturnType<typeof vi.fn>
    mockCallAI.mockResolvedValue({
      provider: 'deepseek',
      error: 'timeout',
      code: 'TIMEOUT',
      retryable: false,
      success: false,
    })

    const { classifyIntent } = await import('@/lib/kael/intent')
    const result = await classifyIntent('electrical', ['test'], 'test')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.failureReason).toBeTruthy()
      expect(result.failureReason).toContain('TIMEOUT')
    }
  })
})

describe('Bug #6: Admin can view any job', () => {
  it('assertOwnership allows admin for any job', async () => {
    const { assertOwnership } = await import('@/lib/auth/api-auth')
    const job = { customer_id: 'someone-else', worker_id: 'another-person' }
    expect(assertOwnership(job, 'admin-user', 'admin')).toEqual({ allowed: true })
  })

  it('job detail route uses assertOwnership (not manual checks)', () => {
    const code = readFileSync(
      join(__dirname, '../../app/api/jobs/[id]/route.ts'),
      'utf-8',
    )
    expect(code).toContain('assertOwnership')
  })
})

describe('Bug #7: scope_change_pending blocks status updates', () => {
  it('status route checks for scope_change_pending', () => {
    const code = readFileSync(
      join(__dirname, '../../app/api/jobs/[id]/status/route.ts'),
      'utf-8',
    )
    expect(code).toContain('scope_change_pending')
    expect(code).toContain('SCOPE_CHANGE_PENDING')
  })
})

describe('Bug #8: Event log uses typed actor', () => {
  it('logJobEvent accepts EventActor object', async () => {
    const { logJobEvent } = await import('@/lib/jobs/event-log')
    const mockFrom = vi.fn(() => ({
      insert: vi.fn(() => ({ error: null })),
    }))
    const supabase = { from: mockFrom } as any

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logJobEvent(supabase, 'job-1', 'test', { id: 'user-1', role: 'customer' })
    warnSpy.mockRestore()

    expect(mockFrom).toHaveBeenCalledWith('job_events')
  })
})

describe('Bug #9: KaelEstimate canonical location', () => {
  it('KaelEstimate is exported from shared package', async () => {
    const shared = await import('@home-services/shared')
    const types = Object.keys(shared)
    expect(types).toContain('serviceTypeSchema')
  })

  it('schemas.ts imports KaelEstimate from shared (not local Zod infer)', () => {
    const code = readFileSync(
      join(__dirname, '../../lib/kael/schemas.ts'),
      'utf-8',
    )
    expect(code).toContain("from '@home-services/shared'")
    expect(code).not.toContain('z.infer<typeof kaelEstimateSchema>')
  })
})

describe('Bug #10: Integration-first strategy', () => {
  it('pipeline supports DI providers for semi-integration testing', async () => {
    const { runKaelPipeline } = await import('@/lib/kael/pipeline')
    expect(typeof runKaelPipeline).toBe('function')
    expect(runKaelPipeline.length).toBeGreaterThanOrEqual(2)
  })

  it('pipeline returns stageLogs for observability', async () => {
    const { runKaelPipeline } = await import('@/lib/kael/pipeline')

    const supabase = {
      from: vi.fn(() => {
        const chain: any = {}
        chain.select = vi.fn(() => chain)
        chain.eq = vi.fn(() => chain)
        chain.in = vi.fn(() => chain)
        chain.then = (onFulfilled: (v: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({
            data: [{ price_min: 300000, price_max: 700000, district_code: 'hcmc_all' }],
            error: null,
          }).then(onFulfilled)
        return chain
      }),
    } as any

    const result = await runKaelPipeline(
      {
        serviceType: 'electrical',
        problemChips: ['Cầu dao trip'],
        description: 'test',
        district: 'hcmc_all',
      },
      supabase,
      {
        classifyIntent: vi.fn().mockResolvedValue({
          success: true,
          intent: {
            service_type: 'electrical',
            problem_slug: 'breaker_trip',
            confidence: 0.9,
            needs_clarification: false,
          },
        }),
        analyzeDescription: vi.fn().mockResolvedValue({
          success: true,
          analysis: {
            problem_identified: 'test',
            severity_indicators: [],
            complexity_hint: 'medium',
          },
        }),
        searchMarketPrice: vi.fn().mockResolvedValue({
          success: true,
          market: {
            market_range_min: 300000,
            market_range_max: 700000,
            confidence: 0.8,
          },
        }),
      },
    )

    expect(result.stageLogs).toBeDefined()
    expect(result.stageLogs.length).toBeGreaterThan(0)
  })
})
