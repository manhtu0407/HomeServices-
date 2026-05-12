import { describe, it, expect } from 'vitest'
import { AIProviderError, TIMEOUT_MS, MAX_RETRIES } from '@/lib/ai/types'
import type { AIProvider, AIResult, AIResponse, AIError } from '@/lib/ai/types'

describe('AIProviderError', () => {
  it('sets provider, statusCode, responseBody', () => {
    const err = new AIProviderError('anthropic', 429, '{"error":"rate_limit"}')
    expect(err.provider).toBe('anthropic')
    expect(err.statusCode).toBe(429)
    expect(err.responseBody).toBe('{"error":"rate_limit"}')
  })

  it('has name "AIProviderError"', () => {
    const err = new AIProviderError('anthropic', 500, '')
    expect(err.name).toBe('AIProviderError')
  })

  it('message format: "{provider} API {statusCode}"', () => {
    const err = new AIProviderError('perplexity', 503, 'body')
    expect(err.message).toBe('perplexity API 503')
  })

  it('extends Error', () => {
    const err = new AIProviderError('deepseek', 400, '')
    expect(err).toBeInstanceOf(Error)
  })

  it('has stack trace', () => {
    const err = new AIProviderError('anthropic', 500, '')
    expect(err.stack).toBeDefined()
  })

  describe('retryable getter', () => {
    it.each([429, 500, 502, 503, 504])(
      'returns true for HTTP %d (server error / rate limit)',
      (status) => {
        expect(new AIProviderError('anthropic', status, '').retryable).toBe(true)
      }
    )

    it.each([400, 401, 403, 404, 422])(
      'returns false for HTTP %d (client error)',
      (status) => {
        expect(new AIProviderError('anthropic', status, '').retryable).toBe(false)
      }
    )

    it('works for all providers', () => {
      const providers: AIProvider[] = ['anthropic', 'perplexity', 'deepseek']
      for (const p of providers) {
        expect(new AIProviderError(p, 429, '').retryable).toBe(true)
        expect(new AIProviderError(p, 401, '').retryable).toBe(false)
      }
    })
  })
})

describe('TIMEOUT_MS constants (per RULES.md Rule #10)', () => {
  it('anthropic = 20,000ms', () => {
    expect(TIMEOUT_MS.anthropic).toBe(20_000)
  })

  it('perplexity = 15,000ms', () => {
    expect(TIMEOUT_MS.perplexity).toBe(15_000)
  })

  it('deepseek = 10,000ms', () => {
    expect(TIMEOUT_MS.deepseek).toBe(10_000)
  })

  it('covers all providers', () => {
    const providers: AIProvider[] = ['anthropic', 'perplexity', 'deepseek']
    for (const p of providers) {
      expect(TIMEOUT_MS[p]).toBeGreaterThan(0)
    }
  })
})

describe('MAX_RETRIES (per RULES.md Rule #10)', () => {
  it('is 2', () => {
    expect(MAX_RETRIES).toBe(2)
  })
})

describe('AIResult discriminated union', () => {
  it('AIResponse has success: true', () => {
    const response: AIResponse = {
      content: 'test',
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      latencyMs: 100,
      success: true,
    }
    expect(response.success).toBe(true)
  })

  it('AIError has success: false', () => {
    const error: AIError = {
      provider: 'anthropic',
      error: 'failed',
      code: 'TEST',
      retryable: false,
      success: false,
    }
    expect(error.success).toBe(false)
  })

  it('discriminates with success check', () => {
    const result: AIResult = {
      content: 'ok',
      usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.001 },
      latencyMs: 50,
      success: true,
    }
    if (result.success) {
      expect(result.content).toBe('ok')
    }
  })
})
