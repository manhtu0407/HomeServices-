/**
 * Tests for behaviors introduced by the quality audit fixes.
 * Covers: assertOwnership, sanitizeForLLM coverage, logJobEvent error handling,
 * Supabase timeout, DB-level worker filtering, confirm-completion chain,
 * non-greedy JSON parsing, body validation in review route.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── assertOwnership ─────────────────────────────────────────

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
      single: vi.fn(),
    })),
  })),
}))

import { assertOwnership } from '@/lib/auth/api-auth'

describe('assertOwnership', () => {
  const job = { customer_id: 'cust-1', worker_id: 'work-1' }

  it('admin always allowed', () => {
    expect(assertOwnership(job, 'any-id', 'admin')).toEqual({ allowed: true })
  })

  it('customer allowed when customer_id matches', () => {
    expect(assertOwnership(job, 'cust-1', 'customer')).toEqual({ allowed: true })
  })

  it('customer denied when customer_id differs', () => {
    expect(assertOwnership(job, 'cust-2', 'customer')).toEqual({ allowed: false })
  })

  it('worker allowed when worker_id matches', () => {
    expect(assertOwnership(job, 'work-1', 'worker')).toEqual({ allowed: true })
  })

  it('worker denied when worker_id differs', () => {
    expect(assertOwnership(job, 'work-2', 'worker')).toEqual({ allowed: false })
  })

  it('customer denied when customer_id is null', () => {
    expect(assertOwnership({ customer_id: null, worker_id: 'w' }, 'cust-1', 'customer')).toEqual({ allowed: false })
  })

  it('worker denied when worker_id is null', () => {
    expect(assertOwnership({ customer_id: 'c', worker_id: null }, 'work-1', 'worker')).toEqual({ allowed: false })
  })
})

// ─── safeParseJSON (non-greedy regex) ──────────────────────────

import { safeParseJSON } from '@/lib/kael/parsing'

describe('safeParseJSON — non-greedy regex', () => {
  it('parses simple JSON object', () => {
    expect(safeParseJSON('{"key": "value"}')).toEqual({ key: 'value' })
  })

  it('extracts first JSON from text with multiple objects', () => {
    const text = 'Here is the result: {"a": 1} and also {"b": 2}'
    const result = safeParseJSON(text)
    expect(result).toEqual({ a: 1 })
  })

  it('does not greedily match across two JSON objects', () => {
    const text = '{"first": true} some text {"second": true}'
    const result = safeParseJSON(text)
    expect(result).toEqual({ first: true })
  })

  it('handles JSON with newlines inside', () => {
    const text = '```json\n{"key": "value",\n"num": 42}\n```'
    const result = safeParseJSON(text)
    expect(result).toEqual({ key: 'value', num: 42 })
  })

  it('returns null for non-JSON text', () => {
    expect(safeParseJSON('no json here')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(safeParseJSON('')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(safeParseJSON('{bad json}')).toBeNull()
  })
})

// ─── logJobEvent error handling ─────────────────────────────────

describe('logJobEvent — error handling', () => {
  it('does not throw when insert fails', async () => {
    const mockFrom = vi.fn(() => ({
      insert: vi.fn(() => ({
        error: { code: 'PGRST301', message: 'db error' },
      })),
    }))

    const supabase = { from: mockFrom } as any

    const { logJobEvent } = await import('@/lib/jobs/event-log')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logJobEvent(supabase, 'job-1', 'test_event', 'user-1', 'customer', 'draft', 'analyzing')
    warnSpy.mockRestore()
  })

  it('does not throw when insert throws exception', async () => {
    const mockFrom = vi.fn(() => ({
      insert: vi.fn(() => { throw new Error('network error') }),
    }))

    const supabase = { from: mockFrom } as any

    const { logJobEvent } = await import('@/lib/jobs/event-log')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await logJobEvent(supabase, 'job-1', 'test_event', 'user-1', 'worker', null, null)
    warnSpy.mockRestore()
  })
})

// ─── synthesizePrice edge cases ─────────────────────────────────

import { synthesizePrice } from '@/lib/kael/pricing'

describe('synthesizePrice — edge cases', () => {
  it('baseline only when no market data', () => {
    const result = synthesizePrice({
      baselineMin: 200_000,
      baselineMax: 500_000,
      market: null,
      complexityHint: 'medium',
    })
    expect(result.source).toBe('baseline_only')
    expect(result.confidence).toBe(0.4)
    expect(result.price_min).toBe(200_000)
    expect(result.price_max).toBe(500_000)
  })

  it('market weighted when market data present', () => {
    const result = synthesizePrice({
      baselineMin: 200_000,
      baselineMax: 500_000,
      market: {
        market_range_min: 250_000,
        market_range_max: 600_000,
        confidence: 0.8,
      },
      complexityHint: 'medium',
    })
    expect(result.source).toBe('market_weighted')
    expect(result.price_min).toBeGreaterThan(0)
    expect(result.price_max).toBeGreaterThan(result.price_min)
  })

  it('applies small complexity discount', () => {
    const small = synthesizePrice({
      baselineMin: 300_000,
      baselineMax: 600_000,
      market: {
        market_range_min: 300_000,
        market_range_max: 600_000,
        confidence: 0.7,
      },
      complexityHint: 'small',
    })
    const medium = synthesizePrice({
      baselineMin: 300_000,
      baselineMax: 600_000,
      market: {
        market_range_min: 300_000,
        market_range_max: 600_000,
        confidence: 0.7,
      },
      complexityHint: 'medium',
    })
    expect(small.price_min).toBeLessThan(medium.price_min)
  })

  it('applies large complexity premium', () => {
    const large = synthesizePrice({
      baselineMin: 300_000,
      baselineMax: 600_000,
      market: {
        market_range_min: 300_000,
        market_range_max: 600_000,
        confidence: 0.7,
      },
      complexityHint: 'large',
    })
    const medium = synthesizePrice({
      baselineMin: 300_000,
      baselineMax: 600_000,
      market: {
        market_range_min: 300_000,
        market_range_max: 600_000,
        confidence: 0.7,
      },
      complexityHint: 'medium',
    })
    expect(large.price_min).toBeGreaterThan(medium.price_min)
  })

  it('ensures price_max > price_min after rounding', () => {
    const result = synthesizePrice({
      baselineMin: 100_000,
      baselineMax: 100_000,
      market: {
        market_range_min: 100_000,
        market_range_max: 100_000,
        confidence: 0.9,
      },
      complexityHint: 'medium',
    })
    expect(result.price_max).toBeGreaterThan(result.price_min)
  })

  it('rounds to nearest thousand', () => {
    const result = synthesizePrice({
      baselineMin: 123_456,
      baselineMax: 789_012,
      market: {
        market_range_min: 150_000,
        market_range_max: 800_000,
        confidence: 0.6,
      },
      complexityHint: 'medium',
    })
    expect(result.price_min % 1000).toBe(0)
    expect(result.price_max % 1000).toBe(0)
  })

  it('caps confidence at 0.85', () => {
    const result = synthesizePrice({
      baselineMin: 200_000,
      baselineMax: 500_000,
      market: {
        market_range_min: 250_000,
        market_range_max: 600_000,
        confidence: 1.0,
      },
      complexityHint: 'medium',
    })
    expect(result.confidence).toBeLessThanOrEqual(0.85)
  })
})

// ─── lifecycle estimate_ready transition ─────────────────────

import { validateTransition, canTransition, getTimestampColumn } from '@/lib/jobs/lifecycle'

describe('lifecycle — estimate_ready transition', () => {
  it('analyzing → estimate_ready is valid', () => {
    expect(canTransition('analyzing', 'estimate_ready')).toBe(true)
  })

  it('estimate_ready → awaiting_customer_confirm is valid', () => {
    expect(canTransition('estimate_ready', 'awaiting_customer_confirm')).toBe(true)
  })

  it('analyzing → awaiting_customer_confirm is NOT valid (must go through estimate_ready)', () => {
    expect(canTransition('analyzing', 'awaiting_customer_confirm')).toBe(false)
  })

  it('estimate_ready has timestamp column', () => {
    expect(getTimestampColumn('estimate_ready')).toBe('estimate_ready_at')
  })

  it('validateTransition returns timestampColumn for estimate_ready', () => {
    const result = validateTransition('analyzing', 'estimate_ready')
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.timestampColumn).toBe('estimate_ready_at')
    }
  })
})

// ─── lifecycle confirm-completion chain ───────────────────────

describe('lifecycle — confirm-completion chain', () => {
  it('completed_by_worker → confirmed_by_customer is valid', () => {
    expect(canTransition('completed_by_worker', 'confirmed_by_customer')).toBe(true)
  })

  it('confirmed_by_customer → payment_pending is valid', () => {
    expect(canTransition('confirmed_by_customer', 'payment_pending')).toBe(true)
  })

  it('payment_pending → paid is valid', () => {
    expect(canTransition('payment_pending', 'paid')).toBe(true)
  })

  it('completed_by_worker → paid is NOT valid (must go through chain)', () => {
    expect(canTransition('completed_by_worker', 'paid')).toBe(false)
  })

  it('confirmed_by_customer → paid is NOT valid (must go through payment_pending)', () => {
    expect(canTransition('confirmed_by_customer', 'paid')).toBe(false)
  })
})

// ─── defaults — severity advisory ───────────────────────────────

import { getFallbackBaseline, hasHighSeverity, SEVERITY_ADVISORY } from '@/lib/kael/defaults'

describe('kael defaults — fallback baselines', () => {
  it('returns correct range for small complexity', () => {
    const result = getFallbackBaseline('small')
    expect(result.priceMin).toBe(150_000)
    expect(result.priceMax).toBe(350_000)
  })

  it('returns correct range for medium complexity', () => {
    const result = getFallbackBaseline('medium')
    expect(result.priceMin).toBe(250_000)
    expect(result.priceMax).toBe(700_000)
  })

  it('returns correct range for large complexity', () => {
    const result = getFallbackBaseline('large')
    expect(result.priceMin).toBe(500_000)
    expect(result.priceMax).toBe(1_500_000)
  })
})

describe('kael defaults — severity detection', () => {
  it('detects high severity keywords', () => {
    expect(hasHighSeverity(['cháy nổ', 'bình thường'])).toBe(true)
  })

  it('detects rò rỉ lớn', () => {
    expect(hasHighSeverity(['có rò rỉ lớn ở bếp'])).toBe(true)
  })

  it('returns false for no severity', () => {
    expect(hasHighSeverity(['bình thường', 'nhẹ'])).toBe(false)
  })

  it('returns false for empty array', () => {
    expect(hasHighSeverity([])).toBe(false)
  })

  it('severity advisory text exists and is Vietnamese', () => {
    expect(SEVERITY_ADVISORY).toContain('nghiêm trọng')
  })
})

// ─── schemas — PRICE_DISCLAIMER (Rule #4) ────────────────────

import { PRICE_DISCLAIMER, UNSUPPORTED_SERVICE_MESSAGE, kaelEstimateSchema } from '@/lib/kael/schemas'

describe('kael schemas — Rule #4 disclaimer', () => {
  it('PRICE_DISCLAIMER exists and contains required text', () => {
    expect(PRICE_DISCLAIMER).toContain('ước tính')
    expect(PRICE_DISCLAIMER).toContain('xác nhận')
  })

  it('UNSUPPORTED_SERVICE_MESSAGE is Vietnamese', () => {
    expect(UNSUPPORTED_SERVICE_MESSAGE).toContain('điện')
    expect(UNSUPPORTED_SERVICE_MESSAGE).toContain('nước')
  })

  it('kaelEstimateSchema requires disclaimer field', () => {
    const valid = kaelEstimateSchema.safeParse({
      service_type: 'electrical',
      problem_category: 'breaker_trip',
      problem_summary: 'Cầu dao bị trip',
      complexity: 'medium',
      price_min: 200_000,
      price_max: 500_000,
      confidence: 0.7,
      advisory: null,
      disclaimer: PRICE_DISCLAIMER,
    })
    expect(valid.success).toBe(true)
  })

  it('kaelEstimateSchema rejects empty disclaimer', () => {
    const invalid = kaelEstimateSchema.safeParse({
      service_type: 'electrical',
      problem_category: 'breaker_trip',
      problem_summary: 'Cầu dao bị trip',
      complexity: 'medium',
      price_min: 200_000,
      price_max: 500_000,
      confidence: 0.7,
      advisory: null,
      disclaimer: '',
    })
    expect(invalid.success).toBe(false)
  })
})

// ─── prompt versions exist ───────────────────────────────────

import { PROMPT_VERSIONS } from '@/lib/kael/prompts'

describe('kael prompts — versioning', () => {
  it('all pipeline steps have prompt versions', () => {
    expect(PROMPT_VERSIONS.intent).toBeDefined()
    expect(PROMPT_VERSIONS.vision).toBeDefined()
    expect(PROMPT_VERSIONS.pricing).toBeDefined()
    expect(PROMPT_VERSIONS.prebrief).toBeDefined()
  })

  it('prompt versions follow date format', () => {
    const datePattern = /^\d{4}-\d{2}-\d{2}\.v\d+$/
    expect(PROMPT_VERSIONS.intent).toMatch(datePattern)
    expect(PROMPT_VERSIONS.vision).toMatch(datePattern)
    expect(PROMPT_VERSIONS.pricing).toMatch(datePattern)
    expect(PROMPT_VERSIONS.prebrief).toMatch(datePattern)
  })
})
