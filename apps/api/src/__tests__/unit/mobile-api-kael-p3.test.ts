import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KAEL_PURPOSES } from '../../../../../supabase/functions/mobile-api/_shared/kael'
import { KAEL_ROUTING_CONFIG } from '../../../../../supabase/functions/mobile-api/_shared/kael/routing.config'
import { chooseCircuitAwareProvider, chooseCircuitAwareProviderOrNull, chooseProvider } from '../../../../../supabase/functions/mobile-api/_shared/kael/routing'
import { createKaelCircuitBreaker, KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/circuit-breaker'
import { runKaelParallel, runKaelPurposeStage } from '../../../../../supabase/functions/mobile-api/_shared/kael/orchestrator'
import { updateKaelProgress } from '../../../../../supabase/functions/mobile-api/_shared/kael/streaming'
import { callAI } from '../../../../../supabase/functions/mobile-api/_shared/kael/provider-client'

describe('mobile-api Kael P3 routing foundation', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    KAEL_CIRCUIT_BREAKER.reset()
  })

  it('defines routable config for all 11 Kael purposes', () => {
    expect(Object.keys(KAEL_ROUTING_CONFIG).sort()).toEqual([...KAEL_PURPOSES].sort())
    expect(KAEL_ROUTING_CONFIG.intent_classification.primary.provider).toBe('deepseek')
    expect(KAEL_ROUTING_CONFIG.intent_classification.fallback?.provider).toBe('anthropic')
    expect(KAEL_ROUTING_CONFIG.vision_analysis.primary.provider).toBe('anthropic')
    expect(KAEL_ROUTING_CONFIG.vision_analysis.fallback).toBeUndefined()
    expect(KAEL_ROUTING_CONFIG.price_synthesis.primary.provider).toBe('anthropic')
    expect(KAEL_ROUTING_CONFIG.price_synthesis.fallback).toBeUndefined()
    expect(KAEL_ROUTING_CONFIG.scope_change.primary.provider).toBe('anthropic')
  })

  it('chooses primary provider first and Anthropic insurance when DeepSeek is unavailable', () => {
    expect(chooseProvider('intent_classification')).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      role: 'primary',
    })
    expect(chooseProvider('intent_classification', {
      blockedProviders: ['deepseek'],
    })).toMatchObject({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      role: 'fallback',
    })
  })

  it('uses the measured DeepSeek intent budget through the provider route', () => {
    const intentSource = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/kael/intent.ts', import.meta.url),
      'utf8',
    )

    expect(KAEL_ROUTING_CONFIG.intent_classification.latencyBudgetMs).toBe(2_500)
    expect(intentSource).toContain('timeoutMs: route.latencyBudgetMs')
    expect(intentSource).not.toContain('timeoutMs: 1_000')
  })

  it('rejects invalid purposes and over-budget calls before provider selection', () => {
    expect(() => chooseProvider('unknown_purpose')).toThrow(/INVALID_PURPOSE/)
    expect(() =>
      chooseProvider('intent_classification', {
        estimatedCostUsd: KAEL_ROUTING_CONFIG.intent_classification.costCeilingUsd + 0.001,
      }),
    ).toThrow(/COST_CEILING_EXCEEDED/)
  })

  it('uses circuit-aware provider selection for fallback and all-open no-provider cases', () => {
    const now = new Date('2026-07-02T08:00:00.000Z')
    KAEL_CIRCUIT_BREAKER.recordFailure({
      purpose: 'worker_assist',
      provider: 'deepseek',
      errorCode: 'HTTP_402',
      now,
    })

    expect(chooseCircuitAwareProvider('worker_assist', { now })).toMatchObject({
      provider: 'anthropic',
      role: 'fallback',
    })

    KAEL_CIRCUIT_BREAKER.recordFailure({
      purpose: 'worker_assist',
      provider: 'anthropic',
      errorCode: 'HTTP_402',
      now,
    })
    expect(chooseCircuitAwareProviderOrNull('worker_assist', { now })).toBeNull()
  })

  it('blocks direct provider calls before network when the circuit is open', async () => {
    const now = new Date('2026-07-02T08:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    KAEL_CIRCUIT_BREAKER.recordFailure({
      purpose: 'worker_assist',
      provider: 'deepseek',
      errorCode: 'HTTP_402',
      now,
    })

    await expect(callAI({
      purpose: 'worker_assist',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: 'safe metadata only' }],
      maxRetries: 0,
    }, { deepseekApiKey: 'test-key' })).resolves.toMatchObject({
      success: false,
      provider: 'deepseek',
      code: 'OPEN_CIRCUIT',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('mobile-api Kael P3 circuit breaker', () => {
  it('opens immediately for provider credit failure and closes after the open window', () => {
    const now = new Date('2026-05-25T10:00:00.000Z')
    const breaker = createKaelCircuitBreaker()

    breaker.recordFailure({
      purpose: 'intent_classification',
      provider: 'deepseek',
      errorCode: 'HTTP_402',
      now,
    })

    expect(breaker.isOpen('intent_classification', 'deepseek', now)).toBe(true)
    expect(breaker.isOpen(
      'intent_classification',
      'deepseek',
      new Date('2026-05-25T11:01:00.000Z'),
    )).toBe(false)
  })

  it('opens after three rate-limit failures inside one minute', () => {
    const breaker = createKaelCircuitBreaker()
    const now = new Date('2026-05-25T10:00:00.000Z')

    for (let index = 0; index < 2; index++) {
      breaker.recordFailure({
        purpose: 'market_lookup',
        provider: 'perplexity',
        errorCode: 'HTTP_429',
        now: new Date(now.getTime() + index * 10_000),
      })
    }
    expect(breaker.isOpen('market_lookup', 'perplexity', new Date('2026-05-25T10:00:30.000Z'))).toBe(false)

    breaker.recordFailure({
      purpose: 'market_lookup',
      provider: 'perplexity',
      errorCode: 'HTTP_429',
      now: new Date('2026-05-25T10:00:40.000Z'),
    })
    expect(breaker.isOpen('market_lookup', 'perplexity', new Date('2026-05-25T10:00:41.000Z'))).toBe(true)
  })
})

describe('mobile-api Kael P3 orchestrator and streaming', () => {
  it('wires post-intent estimate stages through the parallel orchestrator', () => {
    const pipelineSource = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/kael/pipeline.ts', import.meta.url),
      'utf8',
    )

    expect(pipelineSource).toMatch(/runKaelParallel(?:<[^>]+>)?\(\[/)
    expect(pipelineSource).toMatch(/label: "vision"[\s\S]*label: "market"[\s\S]*label: "baseline"/)
    expect(pipelineSource).toContain('provider: KAEL_ROUTING_CONFIG.intent_classification.primary.provider')
    expect(pipelineSource).not.toMatch(
      /const visionStage = await runKaelPurposeStage[\s\S]*const baselineStage = await runKaelPurposeStage[\s\S]*const marketStage = await runKaelPurposeStage/,
    )
  })

  it('runs parallel stages with Promise.all semantics instead of serial latency', async () => {
    vi.useFakeTimers()
    const pending = runKaelParallel([
      {
        label: 'vision',
        purpose: 'vision_analysis',
        timeoutMs: 100,
        run: () => delayedValue('vision-ok', 80),
      },
      {
        label: 'market',
        purpose: 'market_lookup',
        timeoutMs: 100,
        run: () => delayedValue('market-ok', 80),
      },
    ])

    await vi.advanceTimersByTimeAsync(80)
    const result = await pending

    expect(result.elapsedMs).toBeLessThanOrEqual(85)
    expect(result.results.map((stage) => stage.value)).toEqual(['vision-ok', 'market-ok'])
  })

  it('continues with fallback when one purpose times out', async () => {
    vi.useFakeTimers()
    const pending = runKaelPurposeStage({
      label: 'market',
      purpose: 'market_lookup',
      timeoutMs: 25,
      run: () => delayedValue('too-late', 100),
      fallback: () => 'baseline-only',
    })

    await vi.advanceTimersByTimeAsync(25)
    const result = await pending

    expect(result).toMatchObject({
      success: true,
      value: 'baseline-only',
      fallbackUsed: true,
      failureReason: 'TIMEOUT',
    })
  })

  it('updates jobs.kael_progress with safe per-stage progress', async () => {
    const updates: Array<Record<string, unknown>> = []
    const client = {
      from(table: string) {
        expect(table).toBe('jobs')
        return {
          update(payload: Record<string, unknown>) {
            updates.push(payload)
            return this
          },
          eq(column: string, value: unknown) {
            expect(column).toBe('id')
            expect(value).toBe('job-1')
            return Promise.resolve({ data: null, error: null })
          },
        }
      },
    }

    await updateKaelProgress(client, 'job-1', {
      stage: 'vision_analysis',
      status: 'running',
      progress: 0.4,
    })

    expect(updates).toEqual([
      {
        kael_progress: expect.objectContaining({
          current_stage: 'vision_analysis',
          status: 'running',
          progress: 0.4,
        }),
      },
    ])
  })

  it('updates kael_chat_sessions.kael_progress when given a session progress target', async () => {
    const updates: Array<{ table: string; payload: Record<string, unknown>; id: unknown }> = []
    const client = {
      from(table: string) {
        return {
          update(payload: Record<string, unknown>) {
            return {
              eq(column: string, value: unknown) {
                expect(column).toBe('id')
                updates.push({ table, payload, id: value })
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
        }
      },
    }

    await updateKaelProgress(client, { table: 'kael_chat_sessions', id: 'session-1' }, {
      stage: 'market_lookup',
      status: 'running',
      progress: 0.32,
    })

    expect(updates).toEqual([
      {
        table: 'kael_chat_sessions',
        id: 'session-1',
        payload: {
          kael_progress: expect.objectContaining({
            current_stage: 'market_lookup',
            status: 'running',
            progress: 0.32,
          }),
        },
      },
    ])
  })

  it('updates scope_change_requests.kael_progress for scope-change perceived performance', async () => {
    const updates: Array<{ table: string; payload: Record<string, unknown>; id: unknown }> = []
    const client = {
      from(table: string) {
        return {
          update(payload: Record<string, unknown>) {
            return {
              eq(column: string, value: unknown) {
                expect(column).toBe('id')
                updates.push({ table, payload, id: value })
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
        }
      },
    }

    await updateKaelProgress(client, { table: 'scope_change_requests', id: 'scope-1' }, {
      stage: 'scope_estimating',
      status: 'running',
      progress: 0.68,
    })

    expect(updates).toEqual([
      {
        table: 'scope_change_requests',
        id: 'scope-1',
        payload: {
          kael_progress: expect.objectContaining({
            current_stage: 'scope_estimating',
            status: 'running',
            progress: 0.68,
          }),
        },
      },
    ])
  })

  it('lets chat sessions carry pipeline stage progress without writing jobs', () => {
    const pipelineSource = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/kael/pipeline.ts', import.meta.url),
      'utf8',
    )

    expect(pipelineSource).toContain('const progressTarget = input.progressTarget ?? input.progressJobId')
    expect(pipelineSource).not.toMatch(/updateKaelProgress\(supabase, input\.progressJobId/)
  })
})

function delayedValue<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}
