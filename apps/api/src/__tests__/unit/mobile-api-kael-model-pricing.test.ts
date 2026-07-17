import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  anthropicMessageBatchCostUsd,
  calculateModelCostUsd,
  estimateModelRequestCostUsd,
  MODEL_PRICE_TABLE,
  resolveModelPrice,
  runtimeUnknownModelPolicy,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/provider/model-pricing'
import { callAI } from '../../../../../supabase/functions/mobile-api/_shared/kael/provider/provider-client'

const CURRENT_PRICING_AT = new Date('2026-07-10T00:00:00.000Z')

describe('mobile-api Kael per-model pricing registry', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('covers every current route and every model planned by Plan section 40 M0', () => {
    expect(Object.keys(MODEL_PRICE_TABLE)).toEqual(expect.arrayContaining([
      'claude-haiku-4-5-20251001',
      'claude-opus-4-8',
      'claude-sonnet-4-6',
      'claude-sonnet-5',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'sonar',
      'sonar-pro',
    ]))
  })

  it.each([
    ['anthropic', 'claude-sonnet-4-6', 18],
    ['anthropic', 'claude-sonnet-5', 12],
    ['anthropic', 'claude-opus-4-8', 30],
    ['anthropic', 'claude-haiku-4-5-20251001', 6],
    ['deepseek', 'deepseek-v4-flash', 0.42],
    ['deepseek', 'deepseek-v4-pro', 1.305],
    ['perplexity', 'sonar', 2.005],
    ['perplexity', 'sonar-pro', 18.006],
  ] as const)('calculates official token and low-context request cost for %s/%s', (
    provider,
    model,
    expectedCostUsd,
  ) => {
    expect(calculateModelCostUsd({
      provider,
      model,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      searchContextSize: 'low',
      at: CURRENT_PRICING_AT,
      unknownModelPolicy: 'throw',
    })).toBeCloseTo(expectedCostUsd, 9)
  })

  it('switches Claude Sonnet 5 from introductory to standard pricing on 2026-09-01', () => {
    expect(calculateModelCostUsd({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      at: new Date('2026-08-31T23:59:59.999Z'),
      unknownModelPolicy: 'throw',
    })).toBe(12)
    expect(calculateModelCostUsd({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      at: new Date('2026-09-01T00:00:00.000Z'),
      unknownModelPolicy: 'throw',
    })).toBe(18)
  })

  it('applies the official 50% Anthropic Message Batch token discount', () => {
    const realtimeCost = calculateModelCostUsd({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      at: CURRENT_PRICING_AT,
      unknownModelPolicy: 'throw',
    })

    expect(realtimeCost).toBe(12)
    expect(anthropicMessageBatchCostUsd(realtimeCost)).toBe(6)
  })

  it('keeps Anthropic cache writes and reads tied to the selected model price period', () => {
    expect(calculateModelCostUsd({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      inputTokens: 100,
      outputTokens: 100,
      cacheCreationInputTokens: 100,
      cacheReadInputTokens: 100,
      at: CURRENT_PRICING_AT,
      unknownModelPolicy: 'throw',
    })).toBeCloseTo(0.00147, 9)
  })

  it('uses DeepSeek cache hit and miss token prices instead of charging every input token as a miss', () => {
    expect(calculateModelCostUsd({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      inputTokens: 1_000,
      outputTokens: 100,
      cacheHitInputTokens: 400,
      cacheMissInputTokens: 600,
      at: CURRENT_PRICING_AT,
      unknownModelPolicy: 'throw',
    })).toBeCloseTo(0.00011312, 12)
  })

  it('uses provider-reported Perplexity total cost when present', () => {
    expect(calculateModelCostUsd({
      provider: 'perplexity',
      model: 'sonar-pro',
      inputTokens: 52,
      outputTokens: 38,
      searchContextSize: 'medium',
      providerReportedCostUsd: 0.010726,
      at: CURRENT_PRICING_AT,
      unknownModelPolicy: 'throw',
    })).toBe(0.010726)
  })

  it('fails loud for unknown models in dev/test and selects the safe-high row in production', () => {
    expect(runtimeUnknownModelPolicy(() => undefined)).toBe('throw')
    expect(runtimeUnknownModelPolicy((name) =>
      name === 'DENO_DEPLOYMENT_ID' ? 'project_function_1' : undefined
    )).toBe('safe-high')

    expect(() => resolveModelPrice({
      provider: 'anthropic',
      model: 'claude-unknown',
      at: CURRENT_PRICING_AT,
      unknownModelPolicy: 'throw',
    })).toThrow(/UNKNOWN_MODEL_PRICE/)

    const safeHigh = resolveModelPrice({
      provider: 'anthropic',
      model: 'claude-unknown',
      at: CURRENT_PRICING_AT,
      unknownModelPolicy: 'safe-high',
    })
    expect(safeHigh.fallback).toBe(true)
    expect(safeHigh.inputUsdPerMTok).toBeGreaterThanOrEqual(5)
    expect(safeHigh.outputUsdPerMTok).toBeGreaterThanOrEqual(25)
  })

  it('rejects an unknown model before fetch in the test runtime', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await expect(callAI({
      provider: 'anthropic',
      model: 'claude-unknown',
      messages: [{ role: 'user', content: 'safe metadata only' }],
      maxRetries: 0,
    }, { anthropicApiKey: 'sk-test' })).rejects.toThrow(/UNKNOWN_MODEL_PRICE/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('estimates at least the Perplexity request fee before the network call', () => {
    expect(estimateModelRequestCostUsd({
      provider: 'perplexity',
      model: 'sonar-pro',
      messages: [{ role: 'user', content: 'Market price in HCMC.' }],
      maxTokens: 38,
      searchContextSize: 'medium',
      at: CURRENT_PRICING_AT,
      unknownModelPolicy: 'throw',
    })).toBeGreaterThan(0.01)
  })

  it('reserves from the model table and reconciles the provider-reported Perplexity cost', async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ fn, args })
      if (fn === 'reserve_kael_ai_spend') {
        return {
          data: [{ allowed: true, blocked_scope: null, reservation_id: 7 }],
          error: null,
        }
      }
      return { data: null, error: null }
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: {
        prompt_tokens: 52,
        completion_tokens: 38,
        cost: { total_cost: 0.010726, request_cost: 0.01 },
        search_context_size: 'medium',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const result = await callAI({
      purpose: 'market_lookup',
      provider: 'perplexity',
      model: 'sonar-pro',
      messages: [{ role: 'user', content: 'Market price in HCMC.' }],
      maxTokens: 38,
      maxRetries: 0,
      searchContextSize: 'medium',
    }, { perplexityApiKey: 'pplx-test' }, { client: { rpc }, actorId: 'actor-1' })

    expect(result.success).toBe(true)
    expect(rpc).toHaveBeenCalledWith('reserve_kael_ai_spend', expect.objectContaining({
      p_estimated_usd: expect.any(Number),
    }))
    const reserveArgs = rpcCalls.find((call) => call.fn === 'reserve_kael_ai_spend')?.args
    expect(Number(reserveArgs?.p_estimated_usd)).toBeGreaterThan(0.01)
    expect(rpc).toHaveBeenCalledWith('finalize_kael_ai_spend', expect.objectContaining({
      p_actual_usd: 0.010726,
    }))
  })
})
