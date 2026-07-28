import { describe, expect, it } from 'vitest'

import {
  buildKaelOptimizationMetricRows,
  calculateKaelCostProjection,
  enabledKaelOptimizationOptions,
  estimateProviderCostUsd,
  readKaelOptimizationFlags,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-usage/cost-tracking'

describe('mobile-api Kael Q1 cost tracking', () => {
  it('keeps all optimization flags disabled by default and toggles independently', () => {
    const defaults = readKaelOptimizationFlags(() => undefined)
// The configuration surface includes KAEL_OPT_LLM_CLARIFICATION_ENABLED.
    expect(Object.values(defaults)).toEqual([false, false, false, false, false, false])

    const flags = readKaelOptimizationFlags((name) =>
      name === 'KAEL_OPT_MARKET_CACHE_ENABLED' ? 'true' : undefined
    )
    expect(enabledKaelOptimizationOptions(flags)).toEqual(['KAEL_OPT_MARKET_CACHE_ENABLED'])
  })

  it('builds one optimization metric row for one provider log row', () => {
    const rows = buildKaelOptimizationMetricRows([
      {
        request_id: 'request-1',
        job_id: '00000000-0000-0000-0000-000000000000',
        purpose: 'market_lookup',
        provider: 'perplexity',
        model: 'sonar',
        input_tokens: 100,
        output_tokens: 50,
        cost_usd: 0.00015,
        latency_ms: 1234,
        success: true,
        safe_metadata: { surface: 'kael_chat', raw_customer_text: 'must not copy' },
      },
    ], readKaelOptimizationFlags(() => undefined))

    expect(rows).toEqual([
      expect.objectContaining({
        request_id: 'request-1',
        purpose: 'market_lookup',
        provider: 'perplexity',
        enabled_options: [],
        cost_before_estimate: 0.00015,
        cost_actual: 0.00015,
        quality_pass: true,
        quality_signal: 'provider_success',
        safe_metadata: {
          metric_version: 'q1.2026-05-26',
          surface: 'kael_chat',
          cache_status: null,
        },
      }),
    ])
  })

  it('calculates provider cost estimates and per-job projections', () => {
    expect(estimateProviderCostUsd({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      inputTokens: 1000,
      outputTokens: 100,
    })).toBe(0.0045)

    expect(estimateProviderCostUsd({
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      inputTokens: 1000,
      outputTokens: 100,
    })).toBe(0.0075)

    expect(estimateProviderCostUsd({
      provider: 'perplexity',
      model: 'sonar',
      inputTokens: 1000,
      outputTokens: 100,
      searchContextSize: 'low',
    })).toBe(0.0061)

    expect(calculateKaelCostProjection({
      totalCostUsd: 0.25,
      sampleJobs: 50,
      targetJobs: 1000,
    })).toEqual({
      costPerJobUsd: 0.005,
      projectedCostUsd: 5,
    })
  })
})
