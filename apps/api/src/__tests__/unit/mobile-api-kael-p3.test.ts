import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KAEL_PURPOSES } from '../../../../../supabase/functions/mobile-api/_shared/kael'
import { KAEL_ROUTING_CONFIG } from '../../../../../supabase/functions/mobile-api/_shared/kael/routing.config'
import { chooseProvider } from '../../../../../supabase/functions/mobile-api/_shared/kael/routing'
import { createKaelCircuitBreaker } from '../../../../../supabase/functions/mobile-api/_shared/kael/circuit-breaker'
import { runKaelParallel, runKaelPurposeStage } from '../../../../../supabase/functions/mobile-api/_shared/kael/orchestrator'
import { updateKaelProgress } from '../../../../../supabase/functions/mobile-api/_shared/kael/streaming'

describe('mobile-api Kael P3 routing foundation', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('defines routable config for all 11 Kael purposes', () => {
    expect(Object.keys(KAEL_ROUTING_CONFIG).sort()).toEqual([...KAEL_PURPOSES].sort())
    expect(KAEL_ROUTING_CONFIG.intent_classification.primary.provider).toBe('deepseek')
    expect(KAEL_ROUTING_CONFIG.intent_classification.fallback?.provider).toBe('anthropic')
    expect(KAEL_ROUTING_CONFIG.vision_analysis.primary.provider).toBe('anthropic')
    expect(KAEL_ROUTING_CONFIG.vision_analysis.fallback).toBeUndefined()
    expect(KAEL_ROUTING_CONFIG.price_synthesis.primary.provider).toBe('perplexity')
    expect(KAEL_ROUTING_CONFIG.price_synthesis.fallback?.provider).toBe('anthropic')
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
})

function delayedValue<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}
