import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkRateLimit,
  resetRateLimit,
  AI_SESSION_LIMIT,
  AI_GLOBAL_LIMIT,
  type RateLimitConfig,
} from '@/lib/rate-limit'

const testConfig: RateLimitConfig = {
  maxTokens: 3,
  refillRate: 1,
  refillIntervalMs: 1000,
}

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    resetRateLimit('test')
    resetRateLimit('a')
    resetRateLimit('b')
    vi.useRealTimers()
  })

  it('allows first request (fresh bucket)', () => {
    const result = checkRateLimit('test', testConfig)
    expect(result.allowed).toBe(true)
    expect(result.retryAfterMs).toBe(0)
  })

  it('drains tokens on repeated calls', () => {
    checkRateLimit('test', testConfig) // 3→2
    checkRateLimit('test', testConfig) // 2→1
    checkRateLimit('test', testConfig) // 1→0
    const result = checkRateLimit('test', testConfig) // 0→blocked
    expect(result.allowed).toBe(false)
  })

  it('returns retryAfterMs when blocked', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('test', testConfig)
    const result = checkRateLimit('test', testConfig)
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBe(1000) // need 1 token, 1 refill/interval
  })

  it('refills tokens after interval', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('test', testConfig)
    expect(checkRateLimit('test', testConfig).allowed).toBe(false)

    vi.advanceTimersByTime(1100)
    expect(checkRateLimit('test', testConfig).allowed).toBe(true)
  })

  it('refills multiple tokens over multiple intervals', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('test', testConfig)
    expect(checkRateLimit('test', testConfig).allowed).toBe(false)

    vi.advanceTimersByTime(2100) // 2 refills
    checkRateLimit('test', testConfig) // first allowed
    expect(checkRateLimit('test', testConfig).allowed).toBe(true) // second allowed
  })

  it('does not exceed maxTokens on refill', () => {
    checkRateLimit('test', testConfig) // 3→2
    vi.advanceTimersByTime(10000) // would refill 10 tokens, capped at maxTokens=3

    checkRateLimit('test', testConfig) // 3→2
    checkRateLimit('test', testConfig) // 2→1
    checkRateLimit('test', testConfig) // 1→0
    expect(checkRateLimit('test', testConfig).allowed).toBe(false)
  })

  it('respects cost parameter', () => {
    const result = checkRateLimit('test', testConfig, 2) // 3-2=1
    expect(result.allowed).toBe(true)

    const result2 = checkRateLimit('test', testConfig, 2) // 1 < 2 needed
    expect(result2.allowed).toBe(false)
  })

  it('cost=0 always succeeds but consumes nothing', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('test', testConfig)
    expect(checkRateLimit('test', testConfig, 0).allowed).toBe(true)
  })

  it('isolates different keys', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('a', testConfig)
    expect(checkRateLimit('a', testConfig).allowed).toBe(false)
    expect(checkRateLimit('b', testConfig).allowed).toBe(true)
  })

  it('calculates retryAfterMs proportional to deficit', () => {
    const bigCostConfig: RateLimitConfig = {
      maxTokens: 5,
      refillRate: 2,
      refillIntervalMs: 1000,
    }
    for (let i = 0; i < 5; i++) checkRateLimit('test', bigCostConfig)
    const result = checkRateLimit('test', bigCostConfig, 3)
    // deficit = 3-0 = 3, refillsNeeded = ceil(3/2) = 2, retryAfter = 2*1000
    expect(result.retryAfterMs).toBe(2000)
  })

  it('does not evict an exhausted long-window bucket during five-minute cleanup', () => {
    const hourConfig: RateLimitConfig = {
      maxTokens: 20,
      refillRate: 20,
      refillIntervalMs: 3_600_000,
    }
    for (let index = 0; index < 20; index += 1) {
      expect(checkRateLimit('hour-window', hourConfig).allowed).toBe(true)
    }
    expect(checkRateLimit('hour-window', hourConfig).allowed).toBe(false)

    vi.advanceTimersByTime(6 * 60_000)
    checkRateLimit('cleanup-trigger', testConfig)

    expect(checkRateLimit('hour-window', hourConfig).allowed).toBe(false)
    resetRateLimit('hour-window')
    resetRateLimit('cleanup-trigger')
  })
})

describe('resetRateLimit', () => {
  it('clears entry allowing fresh start', () => {
    const config: RateLimitConfig = { maxTokens: 1, refillRate: 1, refillIntervalMs: 60000 }
    checkRateLimit('reset-test', config) // exhaust
    expect(checkRateLimit('reset-test', config).allowed).toBe(false)

    resetRateLimit('reset-test')
    expect(checkRateLimit('reset-test', config).allowed).toBe(true)
    resetRateLimit('reset-test')
  })

  it('is idempotent (resetting non-existent key is safe)', () => {
    expect(() => resetRateLimit('nonexistent')).not.toThrow()
  })
})

describe('pre-configured limits', () => {
  it('AI_SESSION_LIMIT: 10 tokens, 1/min refill', () => {
    expect(AI_SESSION_LIMIT.maxTokens).toBe(10)
    expect(AI_SESSION_LIMIT.refillRate).toBe(1)
    expect(AI_SESSION_LIMIT.refillIntervalMs).toBe(60_000)
  })

  it('AI_GLOBAL_LIMIT: 100 tokens, 10/min refill', () => {
    expect(AI_GLOBAL_LIMIT.maxTokens).toBe(100)
    expect(AI_GLOBAL_LIMIT.refillRate).toBe(10)
    expect(AI_GLOBAL_LIMIT.refillIntervalMs).toBe(60_000)
  })

  it('session limit is more restrictive than global', () => {
    expect(AI_SESSION_LIMIT.maxTokens).toBeLessThan(AI_GLOBAL_LIMIT.maxTokens)
  })
})
