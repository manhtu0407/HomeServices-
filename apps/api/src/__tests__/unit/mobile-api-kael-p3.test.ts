import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { KAEL_PURPOSES } from '../../../../../supabase/functions/mobile-api/_shared/kael'
import { KAEL_ROUTING_CONFIG } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/routing.config'
import { chooseCircuitAwareProvider, chooseCircuitAwareProviderOrNull, chooseProvider, providerCandidatesForPurpose, shouldSkipProviderSiblingModels } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/routing'
import { createKaelCircuitBreaker, KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/circuit-breaker'
import { classifyIntent } from '../../../../../supabase/functions/mobile-api/_shared/kael/intent'
import { runKaelParallel, runKaelPurposeStage } from '../../../../../supabase/functions/mobile-api/_shared/kael/orchestrator'
import { updateKaelProgress } from '../../../../../supabase/functions/mobile-api/_shared/kael/streaming'
import { callAI } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/provider-client'
import { allowKaelSpendForTest } from './kael-spend-test-helper'

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

  it('uses the §40 M1 model roster while keeping escalation separate from failover', () => {
    expect(KAEL_ROUTING_CONFIG.vision_analysis).toMatchObject({
      primary: { provider: 'anthropic', model: 'claude-sonnet-5' },
      modelFallback: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
      escalation: { provider: 'anthropic', model: 'claude-opus-4-8' },
      escalationTrigger: { minConfidence: 0.82 },
    })
    expect(KAEL_ROUTING_CONFIG.scope_change).toMatchObject({
      primary: { provider: 'anthropic', model: 'claude-sonnet-5' },
      escalation: { provider: 'anthropic', model: 'claude-opus-4-8' },
      escalationTrigger: { minConfidence: 0.82, highStakes: true },
    })
    expect(KAEL_ROUTING_CONFIG.market_lookup).toMatchObject({
      primary: { provider: 'perplexity', model: 'sonar' },
      escalation: { provider: 'perplexity', model: 'sonar-pro' },
      escalationTrigger: { minConfidence: 0.82 },
    })
    expect(KAEL_ROUTING_CONFIG.market_lookup.fallback).toBeUndefined()
    expect(KAEL_ROUTING_CONFIG.post_job_learning.primary).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
    })
    expect(KAEL_ROUTING_CONFIG.clarification.fallback).toMatchObject({
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    })
    expect(KAEL_ROUTING_CONFIG.vision_analysis.fallback).toBeUndefined()
    expect(providerCandidatesForPurpose('vision_analysis').map(({ provider, model, role }) => ({ provider, model, role }))).toEqual([
      { provider: 'anthropic', model: 'claude-sonnet-5', role: 'primary' },
      { provider: 'anthropic', model: 'claude-haiku-4-5-20251001', role: 'fallback' },
    ])
    const pipelineSource = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/kael/pipeline.ts', import.meta.url),
      'utf8',
    )
    expect(pipelineSource).toContain(
      'visionResult.model ?? KAEL_ROUTING_CONFIG.vision_analysis.primary.model',
    )
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
      model: 'claude-sonnet-5',
      role: 'fallback',
    })
  })

  it('routes interactive DeepSeek work through Flash then Pro before cross-provider fallback', async () => {
    expect(providerCandidatesForPurpose('intent_classification').map(({ provider, model }) => ({
      provider,
      model,
    }))).toEqual([
      { provider: 'deepseek', model: 'deepseek-v4-flash' },
      { provider: 'deepseek', model: 'deepseek-v4-pro' },
      { provider: 'anthropic', model: 'claude-sonnet-5' },
    ])

    const requestedModels: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string }
      requestedModels.push(body.model ?? 'unknown')
      if (body.model === 'deepseek-v4-flash') {
        return new Response('{"error":"flash unavailable"}', { status: 503 })
      }
      if (body.model !== 'deepseek-v4-pro') {
        throw new Error(`unexpected model ${body.model ?? 'unknown'}`)
      }
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              service_type: 'electrical',
              problem_slug: 'outlet_or_switch_broken',
              confidence: 0.91,
              needs_clarification: false,
            }),
          },
        }],
        usage: { prompt_tokens: 40, completion_tokens: 12 },
      }))
    }))

    await expect(classifyIntent(
      'electrical',
      ['Ổ cắm/công tắc hỏng'],
      'Ổ cắm không hoạt động.',
      { deepseekApiKey: 'deepseek-test', anthropicApiKey: 'anthropic-test' },
      allowKaelSpendForTest('customer-1'),
    )).resolves.toMatchObject({ success: true })
    expect(requestedModels).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])
  })

  it('skips sibling models for provider-wide failures but keeps model failover for model-scoped failures', () => {
    expect(shouldSkipProviderSiblingModels('HTTP_402')).toBe(true)
    expect(shouldSkipProviderSiblingModels('HTTP_429')).toBe(true)
    expect(shouldSkipProviderSiblingModels('KEY_MISSING')).toBe(true)
    expect(shouldSkipProviderSiblingModels('OPEN_CIRCUIT')).toBe(true)
    expect(shouldSkipProviderSiblingModels('HTTP_503')).toBe(false)
    expect(shouldSkipProviderSiblingModels('TIMEOUT')).toBe(false)
    expect(shouldSkipProviderSiblingModels('SCHEMA_INVALID')).toBe(false)
  })

  it('lets the intent failover ladder own its provider deadlines without a competing outer timeout', () => {
    const pipelineSource = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/kael/pipeline.ts', import.meta.url),
      'utf8',
    )

    expect(pipelineSource).not.toContain('providerFailoverEnvelopeMsForPurpose')
    expect(pipelineSource).not.toMatch(/label: "intent"[\s\S]{0,180}timeoutMs:/)
  })

  it('uses the measured DeepSeek intent budget through the provider route', () => {
    const intentSource = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/kael/intent.ts', import.meta.url),
      'utf8',
    )

    expect(KAEL_ROUTING_CONFIG.intent_classification.latencyBudgetMs).toBe(4_000)
    expect(intentSource).toContain('timeoutMs: route.latencyBudgetMs')
    expect(intentSource).not.toContain('timeoutMs: 1_000')
  })

  it('lets the bounded Vision model ladder own its deadlines without a competing outer timeout', () => {
    const pipelineSource = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/kael/pipeline.ts', import.meta.url),
      'utf8',
    )

    expect(pipelineSource).not.toMatch(/label: "vision"[\s\S]{0,180}timeoutMs:/)
  })

  it('gives interactive educational responses enough time to finish before model failover', () => {
    expect(KAEL_ROUTING_CONFIG.educational_response).toMatchObject({
      primary: { provider: 'deepseek', model: 'deepseek-v4-flash' },
      modelFallback: { provider: 'deepseek', model: 'deepseek-v4-pro' },
      fallback: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
      latencyBudgetMs: 6_000,
    })
  })

  it('keeps scope-change on the locked Anthropic roster with a provider-safe deadline', () => {
    expect(KAEL_ROUTING_CONFIG.scope_change).toMatchObject({
      primary: { provider: 'anthropic', model: 'claude-sonnet-5' },
      escalation: { provider: 'anthropic', model: 'claude-opus-4-8' },
      latencyBudgetMs: 20_000,
    })
    expect(KAEL_ROUTING_CONFIG.scope_change.modelFallback).toBeUndefined()
    expect(KAEL_ROUTING_CONFIG.scope_change.fallback).toBeUndefined()
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
  it('allows an internally bounded provider ladder to run without a second stage timer', async () => {
    vi.useFakeTimers()
    const pending = runKaelPurposeStage({
      label: 'intent',
      purpose: 'intent_classification',
      run: () => delayedValue('provider-result', 50),
    })

    await vi.advanceTimersByTimeAsync(50)

    await expect(pending).resolves.toMatchObject({
      status: 'ok',
      value: 'provider-result',
      fallbackUsed: false,
    })
  })

  it('wires post-intent estimate stages through the parallel orchestrator', () => {
    const pipelineSource = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/kael/pipeline.ts', import.meta.url),
      'utf8',
    )

    expect(pipelineSource).toMatch(/runKaelParallel(?:<[^>]+>)?\(\[/)
    expect(pipelineSource).toMatch(/label: "vision"[\s\S]*label: "market"[\s\S]*label: "baseline"/)
    expect(pipelineSource).not.toContain('provider: KAEL_ROUTING_CONFIG.intent_classification.primary.provider')
    expect(pipelineSource).toContain('attempts: []')
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
      status: 'degraded',
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
