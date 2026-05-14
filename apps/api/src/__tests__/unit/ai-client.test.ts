import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { AIProviderError } from '@/lib/ai/types'
import type { AIResponse, AIRequest } from '@/lib/ai/types'

vi.mock('@/lib/env', () => ({
  env: {
    anthropicApiKey: 'test-key',
    perplexityApiKey: 'test-key',
    deepseekApiKey: 'test-key',
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
  },
  ensureServerEnv: vi.fn(),
}))

vi.mock('@/lib/ai/providers/anthropic', () => ({
  callAnthropic: vi.fn(),
}))
vi.mock('@/lib/ai/providers/perplexity', () => ({
  callPerplexity: vi.fn(),
}))
vi.mock('@/lib/ai/providers/deepseek', () => ({
  callDeepSeek: vi.fn(),
}))

import { callAI } from '@/lib/ai/client'
import { callAnthropic } from '@/lib/ai/providers/anthropic'
import { callPerplexity } from '@/lib/ai/providers/perplexity'
import { callDeepSeek } from '@/lib/ai/providers/deepseek'

const mockAnthropic = callAnthropic as Mock
const mockPerplexity = callPerplexity as Mock
const mockDeepSeek = callDeepSeek as Mock

const successResponse: AIResponse = {
  content: 'Vấn đề của bạn là ổ cắm bị cháy do quá tải',
  usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
  latencyMs: 200,
  success: true,
}

const makeRequest = (
  provider: 'anthropic' | 'perplexity' | 'deepseek' = 'anthropic',
): AIRequest => ({
  provider,
  model: provider === 'anthropic' ? 'claude-sonnet-4-6' : 'test-model',
  messages: [{ role: 'user', content: 'Ổ cắm phòng khách bị cháy' }],
})

describe('callAI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('success path', () => {
    it('returns success on first try', async () => {
      mockAnthropic.mockResolvedValueOnce(successResponse)
      const result = await callAI(makeRequest())
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.content).toContain('ổ cắm bị cháy')
      }
      expect(mockAnthropic).toHaveBeenCalledTimes(1)
    })

    it('passes request to provider function', async () => {
      mockAnthropic.mockResolvedValueOnce(successResponse)
      const req = makeRequest()
      await callAI(req)
      expect(mockAnthropic).toHaveBeenCalledWith(req)
    })

    it('logs success with usage metrics', async () => {
      mockAnthropic.mockResolvedValueOnce(successResponse)
      await callAI(makeRequest())
      expect(console.log).toHaveBeenCalledWith(
        'AI call success',
        expect.objectContaining({
          provider: 'anthropic',
          inputTokens: 100,
          outputTokens: 50,
        })
      )
    })
  })

  describe('provider routing', () => {
    it('routes to anthropic', async () => {
      mockAnthropic.mockResolvedValueOnce(successResponse)
      await callAI(makeRequest('anthropic'))
      expect(mockAnthropic).toHaveBeenCalledTimes(1)
      expect(mockPerplexity).not.toHaveBeenCalled()
      expect(mockDeepSeek).not.toHaveBeenCalled()
    })

    it('routes to perplexity', async () => {
      mockPerplexity.mockResolvedValueOnce(successResponse)
      await callAI(makeRequest('perplexity'))
      expect(mockPerplexity).toHaveBeenCalledTimes(1)
      expect(mockAnthropic).not.toHaveBeenCalled()
    })

    it('routes to deepseek', async () => {
      mockDeepSeek.mockResolvedValueOnce(successResponse)
      await callAI(makeRequest('deepseek'))
      expect(mockDeepSeek).toHaveBeenCalledTimes(1)
      expect(mockAnthropic).not.toHaveBeenCalled()
    })
  })

  describe('retry on retryable errors', () => {
    it('retries on HTTP 429 then succeeds', async () => {
      mockAnthropic
        .mockRejectedValueOnce(new AIProviderError('anthropic', 429, 'rate limited'))
        .mockResolvedValueOnce(successResponse)

      const promise = callAI(makeRequest())
      await vi.advanceTimersByTimeAsync(2000)
      const result = await promise

      expect(result.success).toBe(true)
      expect(mockAnthropic).toHaveBeenCalledTimes(2)
    })

    it('retries on HTTP 500 then succeeds', async () => {
      mockAnthropic
        .mockRejectedValueOnce(new AIProviderError('anthropic', 500, 'server error'))
        .mockResolvedValueOnce(successResponse)

      const promise = callAI(makeRequest())
      await vi.advanceTimersByTimeAsync(2000)
      const result = await promise

      expect(result.success).toBe(true)
      expect(mockAnthropic).toHaveBeenCalledTimes(2)
    })

    it('retries on timeout error then succeeds', async () => {
      mockAnthropic
        .mockRejectedValueOnce(new Error('Timeout after 20000ms'))
        .mockResolvedValueOnce(successResponse)

      const promise = callAI(makeRequest())
      await vi.advanceTimersByTimeAsync(2000)
      const result = await promise

      expect(result.success).toBe(true)
      expect(mockAnthropic).toHaveBeenCalledTimes(2)
    })

    it('logs retry attempts', async () => {
      mockAnthropic
        .mockRejectedValueOnce(new AIProviderError('anthropic', 429, ''))
        .mockResolvedValueOnce(successResponse)

      const promise = callAI(makeRequest())
      await vi.advanceTimersByTimeAsync(2000)
      await promise

      expect(console.warn).toHaveBeenCalledWith(
        'AI retry',
        expect.objectContaining({ provider: 'anthropic', attempt: 1 })
      )
    })

    it('exhausts MAX_RETRIES (3 total calls) then returns error', async () => {
      mockAnthropic.mockRejectedValue(
        new AIProviderError('anthropic', 429, 'rate limited')
      )

      const promise = callAI(makeRequest())
      await vi.advanceTimersByTimeAsync(15000)
      const result = await promise

      expect(result.success).toBe(false)
      expect(mockAnthropic).toHaveBeenCalledTimes(3) // initial + 2 retries
    })
  })

  describe('no retry on non-retryable errors', () => {
    it('does NOT retry HTTP 401 (unauthorized)', async () => {
      mockAnthropic.mockRejectedValueOnce(
        new AIProviderError('anthropic', 401, 'unauthorized')
      )
      const result = await callAI(makeRequest())
      expect(result.success).toBe(false)
      expect(mockAnthropic).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry HTTP 400 (bad request)', async () => {
      mockAnthropic.mockRejectedValueOnce(
        new AIProviderError('anthropic', 400, 'bad request')
      )
      const result = await callAI(makeRequest())
      expect(result.success).toBe(false)
      expect(mockAnthropic).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry HTTP 403 (forbidden)', async () => {
      mockAnthropic.mockRejectedValueOnce(
        new AIProviderError('anthropic', 403, 'forbidden')
      )
      const result = await callAI(makeRequest())
      expect(result.success).toBe(false)
      expect(mockAnthropic).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry generic errors', async () => {
      mockAnthropic.mockRejectedValueOnce(new Error('network failure'))
      const result = await callAI(makeRequest())
      expect(result.success).toBe(false)
      expect(mockAnthropic).toHaveBeenCalledTimes(1)
    })
  })

  describe('error result shape', () => {
    it('returns correct fields for AIProviderError', async () => {
      mockAnthropic.mockRejectedValueOnce(
        new AIProviderError('anthropic', 401, 'unauthorized')
      )
      const result = await callAI(makeRequest())

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.provider).toBe('anthropic')
        expect(result.error).toBe('anthropic API 401')
        expect(result.code).toBe('HTTP_401')
        expect(result.retryable).toBe(false)
      }
    })

    it('returns AI_CALL_FAILED code for non-AIProviderError', async () => {
      mockAnthropic.mockRejectedValueOnce(new Error('network down'))
      const result = await callAI(makeRequest())

      if (!result.success) {
        expect(result.code).toBe('AI_CALL_FAILED')
        expect(result.error).toBe('network down')
      }
    })

    it('logs failure details', async () => {
      mockAnthropic.mockRejectedValueOnce(
        new AIProviderError('anthropic', 401, '')
      )
      await callAI(makeRequest())

      expect(console.error).toHaveBeenCalledWith(
        'AI call failed',
        expect.objectContaining({
          provider: 'anthropic',
          code: 'HTTP_401',
          retriesExhausted: true,
        })
      )
    })
  })
})
