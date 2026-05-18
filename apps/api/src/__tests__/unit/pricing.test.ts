import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
    anthropicApiKey: 'test-key',
    perplexityApiKey: 'test-key',
    deepseekApiKey: 'test-key',
  },
  ensureServerEnv: vi.fn(),
}))

vi.mock('@/lib/ai/client', () => ({
  callAI: vi.fn(),
}))

import { synthesizePrice } from '@/lib/kael/pricing'

describe('pricing — synthesizePrice edge cases', () => {
  it('baseline-only produces correct range for small complexity', () => {
    const result = synthesizePrice({
      baselineMin: 150000,
      baselineMax: 350000,
      market: null,
      complexityHint: 'small',
    })

    expect(result.source).toBe('baseline_only')
    expect(result.price_min).toBe(150000)
    expect(result.price_max).toBe(350000)
  })

  it('baseline-only produces correct range for large complexity', () => {
    const result = synthesizePrice({
      baselineMin: 500000,
      baselineMax: 1500000,
      market: null,
      complexityHint: 'large',
    })

    expect(result.price_min).toBe(500000)
    expect(result.price_max).toBe(1500000)
  })

  it('weighted average is 60% market / 40% baseline', () => {
    const result = synthesizePrice({
      baselineMin: 100000,
      baselineMax: 200000,
      market: {
        market_range_min: 200000,
        market_range_max: 400000,
        confidence: 0.8,
      },
      complexityHint: 'medium',
    })

    // Expected min: 200000 * 0.6 + 100000 * 0.4 = 160000
    // Expected max: 400000 * 0.6 + 200000 * 0.4 = 320000
    expect(result.price_min).toBe(160000)
    expect(result.price_max).toBe(320000)
  })

  it('handles very small prices', () => {
    const result = synthesizePrice({
      baselineMin: 50000,
      baselineMax: 100000,
      market: {
        market_range_min: 50000,
        market_range_max: 100000,
        confidence: 0.5,
      },
      complexityHint: 'small',
    })

    expect(result.price_min).toBeGreaterThan(0)
    expect(result.price_max).toBeGreaterThan(result.price_min)
  })

  it('handles very large prices', () => {
    const result = synthesizePrice({
      baselineMin: 5000000,
      baselineMax: 10000000,
      market: {
        market_range_min: 6000000,
        market_range_max: 12000000,
        confidence: 0.6,
      },
      complexityHint: 'large',
    })

    expect(result.price_min).toBeGreaterThan(5000000)
    expect(result.price_max).toBeGreaterThan(result.price_min)
  })

  it('low market confidence results in lower synthesized confidence', () => {
    const lowConf = synthesizePrice({
      baselineMin: 200000,
      baselineMax: 500000,
      market: {
        market_range_min: 200000,
        market_range_max: 500000,
        confidence: 0.2,
      },
      complexityHint: 'medium',
    })

    const highConf = synthesizePrice({
      baselineMin: 200000,
      baselineMax: 500000,
      market: {
        market_range_min: 200000,
        market_range_max: 500000,
        confidence: 0.9,
      },
      complexityHint: 'medium',
    })

    expect(lowConf.confidence).toBeLessThan(highConf.confidence)
  })
})
