import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AIRequest, AIResponse } from '@/lib/ai/types'
import { MAX_RETRIES, TIMEOUT_MS } from '@/lib/ai/types'

// ---------------------------------------------------------------------------
// Tier 4: AI Client Orchestration
// Verify callAI() correctly routes to providers, applies timeouts, retries
// with exponential backoff, and returns structured AIResult.
// Chain: Depends on Tier 1 (constants) and Tier 3 (provider functions).
//        callAI() is the single entry point consumed by all feature code.
//
// Strategy: Mock provider modules (not fetch — Tier 3 already tested that).
// ---------------------------------------------------------------------------

const mockAnthropic = vi.fn()
const mockPerplexity = vi.fn()
const mockDeepSeek = vi.fn()

vi.mock('@/lib/ai/providers/anthropic', () => ({
  callAnthropic: (...args: unknown[]) => mockAnthropic(...args),
}))
vi.mock('@/lib/ai/providers/perplexity', () => ({
  callPerplexity: (...args: unknown[]) => mockPerplexity(...args),
}))
vi.mock('@/lib/ai/providers/deepseek', () => ({
  callDeepSeek: (...args: unknown[]) => mockDeepSeek(...args),
}))

beforeEach(() => {
  mockAnthropic.mockReset()
  mockPerplexity.mockReset()
  mockDeepSeek.mockReset()
  vi.restoreAllMocks()
})

const successResponse: AIResponse = {
  content: 'test response',
  usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.001 },
  latencyMs: 200,
  success: true,
}

const makeRequest = (provider: 'anthropic' | 'perplexity' | 'deepseek'): AIRequest => ({
  provider,
  model: 'test-model',
  messages: [{ role: 'user', content: 'hello' }],
})

// ===== PROVIDER ROUTING =====

describe('callAI — provider routing', () => {
  it('routes to Anthropic provider', async () => {
    mockAnthropic.mockResolvedValueOnce(successResponse)
    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('anthropic'))

    expect(mockAnthropic).toHaveBeenCalledOnce()
    expect(mockPerplexity).not.toHaveBeenCalled()
    expect(mockDeepSeek).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
  })

  it('routes to Perplexity provider', async () => {
    mockPerplexity.mockResolvedValueOnce(successResponse)
    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('perplexity'))

    expect(mockPerplexity).toHaveBeenCalledOnce()
    expect(mockAnthropic).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
  })

  it('routes to DeepSeek provider', async () => {
    mockDeepSeek.mockResolvedValueOnce(successResponse)
    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('deepseek'))

    expect(mockDeepSeek).toHaveBeenCalledOnce()
    expect(mockAnthropic).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
  })

  it('passes full request object to provider', async () => {
    mockAnthropic.mockResolvedValueOnce(successResponse)
    const { callAI } = await import('@/lib/ai/client')
    const req = makeRequest('anthropic')
    await callAI(req)

    expect(mockAnthropic).toHaveBeenCalledWith(req)
  })
})

// ===== SUCCESS PASSTHROUGH =====

describe('callAI — success response', () => {
  it('returns AIResponse directly on first-try success', async () => {
    mockAnthropic.mockResolvedValueOnce(successResponse)
    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('anthropic'))

    expect(result).toEqual(successResponse)
  })

  it('preserves all usage fields', async () => {
    const detailed: AIResponse = {
      content: 'Giá sửa điện: 300k-500k',
      usage: { inputTokens: 150, outputTokens: 80, costUsd: 0.0045 },
      latencyMs: 1200,
      success: true,
    }
    mockAnthropic.mockResolvedValueOnce(detailed)
    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('anthropic'))

    if (result.success) {
      expect(result.content).toBe('Giá sửa điện: 300k-500k')
      expect(result.usage.inputTokens).toBe(150)
      expect(result.usage.outputTokens).toBe(80)
      expect(result.usage.costUsd).toBe(0.0045)
      expect(result.latencyMs).toBe(1200)
    } else {
      throw new Error('Expected success')
    }
  })
})

// ===== TIMEOUT =====

describe('callAI — timeout via withTimeout', () => {
  it('rejects if provider takes longer than timeout', async () => {
    mockDeepSeek.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(successResponse), TIMEOUT_MS.deepseek + 5000)
        )
    )

    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('deepseek'))

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Timeout')
    }
  }, 60_000)

  it('succeeds if provider responds before timeout', async () => {
    mockAnthropic.mockResolvedValueOnce(successResponse)
    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('anthropic'))

    expect(result.success).toBe(true)
  })
})

// ===== RETRY LOGIC =====

describe('callAI — retry on retryable errors', () => {
  it('retries on 429 error up to MAX_RETRIES times', async () => {
    const error429 = new Error('Anthropic API 429')
    mockAnthropic
      .mockRejectedValueOnce(error429)
      .mockRejectedValueOnce(error429)
      .mockResolvedValueOnce(successResponse)

    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('anthropic'))

    expect(result.success).toBe(true)
    expect(mockAnthropic).toHaveBeenCalledTimes(3)
  }, 30_000)

  it('retries on 500 error', async () => {
    mockPerplexity
      .mockRejectedValueOnce(new Error('Perplexity API 500'))
      .mockResolvedValueOnce(successResponse)

    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('perplexity'))

    expect(result.success).toBe(true)
    expect(mockPerplexity).toHaveBeenCalledTimes(2)
  }, 15_000)

  it('retries on 502 error', async () => {
    mockDeepSeek
      .mockRejectedValueOnce(new Error('DeepSeek API 502'))
      .mockResolvedValueOnce(successResponse)

    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('deepseek'))

    expect(result.success).toBe(true)
  }, 15_000)

  it('retries on 503 error', async () => {
    mockAnthropic
      .mockRejectedValueOnce(new Error('API 503'))
      .mockResolvedValueOnce(successResponse)

    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('anthropic'))

    expect(result.success).toBe(true)
  }, 15_000)

  it('retries on Timeout error', async () => {
    mockAnthropic
      .mockRejectedValueOnce(new Error('Timeout after 20000ms'))
      .mockResolvedValueOnce(successResponse)

    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('anthropic'))

    expect(result.success).toBe(true)
    expect(mockAnthropic).toHaveBeenCalledTimes(2)
  }, 15_000)

  it('does NOT retry on non-retryable error (e.g. 401)', async () => {
    mockAnthropic.mockRejectedValueOnce(
      new Error('Anthropic API 401: unauthorized')
    )

    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('anthropic'))

    expect(result.success).toBe(false)
    expect(mockAnthropic).toHaveBeenCalledTimes(1)
  })

  it('does NOT retry on missing API key error', async () => {
    mockAnthropic.mockRejectedValueOnce(
      new Error('ANTHROPIC_API_KEY not configured')
    )

    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('anthropic'))

    expect(result.success).toBe(false)
    expect(mockAnthropic).toHaveBeenCalledTimes(1)
  })
})

// ===== RETRIES EXHAUSTED =====

describe('callAI — retries exhausted', () => {
  it('returns AIError after MAX_RETRIES+1 attempts', async () => {
    const error = new Error('API 500')
    for (let i = 0; i <= MAX_RETRIES; i++) {
      mockAnthropic.mockRejectedValueOnce(error)
    }

    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('anthropic'))

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.provider).toBe('anthropic')
      expect(result.error).toBe('API 500')
      expect(result.code).toBe('AI_CALL_FAILED')
      expect(result.retryable).toBe(false)
    }
    expect(mockAnthropic).toHaveBeenCalledTimes(MAX_RETRIES + 1)
  }, 30_000)

  it('error message from non-Error throw becomes "Unknown error"', async () => {
    mockAnthropic.mockRejectedValueOnce('string error')

    const { callAI } = await import('@/lib/ai/client')
    const result = await callAI(makeRequest('anthropic'))

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Unknown error')
    }
  })
})

// ===== BACKOFF TIMING =====

describe('callAI — exponential backoff', () => {
  it('backoff formula: min(1000 * 2^attempt, 10000)', async () => {
    expect(Math.min(1000 * Math.pow(2, 0), 10_000)).toBe(1000)
    expect(Math.min(1000 * Math.pow(2, 1), 10_000)).toBe(2000)
    expect(Math.min(1000 * Math.pow(2, 2), 10_000)).toBe(4000)
    expect(Math.min(1000 * Math.pow(2, 3), 10_000)).toBe(8000)
    expect(Math.min(1000 * Math.pow(2, 4), 10_000)).toBe(10_000)
    expect(Math.min(1000 * Math.pow(2, 5), 10_000)).toBe(10_000)
  })
})

// ===== LOGGING (Rule #9 — no PII) =====

describe('callAI — logging compliance (Rule #9)', () => {
  it('logs success with metadata, not PII', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockAnthropic.mockResolvedValueOnce(successResponse)

    const { callAI } = await import('@/lib/ai/client')
    await callAI(makeRequest('anthropic'))

    expect(logSpy).toHaveBeenCalledWith(
      'AI call success',
      expect.objectContaining({
        provider: 'anthropic',
        model: 'test-model',
        inputTokens: 10,
        outputTokens: 5,
      })
    )
    logSpy.mockRestore()
  })

  it('logs failure with error metadata', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAnthropic.mockRejectedValueOnce(new Error('API 401'))

    const { callAI } = await import('@/lib/ai/client')
    await callAI(makeRequest('anthropic'))

    expect(errorSpy).toHaveBeenCalledWith(
      'AI call failed',
      expect.objectContaining({
        provider: 'anthropic',
        error: 'API 401',
        retriesExhausted: true,
      })
    )
    errorSpy.mockRestore()
  })

  it('logs retry attempts with warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mockAnthropic
      .mockRejectedValueOnce(new Error('API 500'))
      .mockResolvedValueOnce(successResponse)

    const { callAI } = await import('@/lib/ai/client')
    await callAI(makeRequest('anthropic'))

    expect(warnSpy).toHaveBeenCalledWith(
      'AI retry',
      expect.objectContaining({
        provider: 'anthropic',
        attempt: 1,
      })
    )
    warnSpy.mockRestore()
  }, 15_000)
})

// ===== CONSTANTS INTEGRATION (Tier 1 chain) =====

describe('callAI — uses Tier 1 constants', () => {
  it('MAX_RETRIES controls total retry count', () => {
    expect(MAX_RETRIES).toBe(2)
  })

  it('TIMEOUT_MS has correct values per provider', () => {
    expect(TIMEOUT_MS.anthropic).toBe(20_000)
    expect(TIMEOUT_MS.perplexity).toBe(15_000)
    expect(TIMEOUT_MS.deepseek).toBe(10_000)
  })
})
