import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { AIRequest } from '@/lib/ai/types'

// ---------------------------------------------------------------------------
// Tier 3: Provider Functions
// Verify each provider: correct API endpoint, headers, body construction,
// response parsing, cost calculation, and error handling.
// Chain: Depends on Tier 1 types. These providers are consumed by Tier 4 client.
//
// All tests mock global.fetch — no real API calls.
// ---------------------------------------------------------------------------

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.PERPLEXITY_API_KEY
  delete process.env.DEEPSEEK_API_KEY
})

const baseRequest: AIRequest = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello' },
  ],
  maxTokens: 500,
  temperature: 0.5,
}

// ===== ANTHROPIC =====

describe('Anthropic provider', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key'
  })

  it('throws if ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { callAnthropic } = await import('@/lib/ai/providers/anthropic')
    await expect(callAnthropic(baseRequest)).rejects.toThrow(
      'ANTHROPIC_API_KEY not configured'
    )
  })

  it('calls correct endpoint with correct headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: 'Hi' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    })

    const { callAnthropic } = await import('@/lib/ai/providers/anthropic')
    await callAnthropic(baseRequest)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(options.method).toBe('POST')
    expect(options.headers['x-api-key']).toBe('sk-ant-test-key')
    expect(options.headers['anthropic-version']).toBe('2023-06-01')
    expect(options.headers['Content-Type']).toBe('application/json')
  })

  it('extracts system message and filters from messages array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: 'response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    })

    const { callAnthropic } = await import('@/lib/ai/providers/anthropic')
    await callAnthropic(baseRequest)

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.system).toBe('You are helpful.')
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }])
    expect(body.messages.some((m: { role: string }) => m.role === 'system')).toBe(false)
  })

  it('sends model, max_tokens, temperature in body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '' }],
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    })

    const { callAnthropic } = await import('@/lib/ai/providers/anthropic')
    await callAnthropic(baseRequest)

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.model).toBe('claude-sonnet-4-6')
    expect(body.max_tokens).toBe(500)
    expect(body.temperature).toBe(0.5)
  })

  it('returns correct AIResponse structure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: 'Test response' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    })

    const { callAnthropic } = await import('@/lib/ai/providers/anthropic')
    const result = await callAnthropic(baseRequest)

    expect(result.success).toBe(true)
    expect(result.content).toBe('Test response')
    expect(result.usage.inputTokens).toBe(100)
    expect(result.usage.outputTokens).toBe(50)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('calculates Sonnet cost correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '' }],
        usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      }),
    })

    const { callAnthropic } = await import('@/lib/ai/providers/anthropic')
    const result = await callAnthropic({
      ...baseRequest,
      model: 'claude-sonnet-4-6',
    })

    // Sonnet: $3/M input + $15/M output = $18
    expect(result.usage.costUsd).toBeCloseTo(18, 2)
  })

  it('calculates Haiku cost correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '' }],
        usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      }),
    })

    const { callAnthropic } = await import('@/lib/ai/providers/anthropic')
    const result = await callAnthropic({
      ...baseRequest,
      model: 'claude-haiku-4-5-20251001',
    })

    // Haiku: $0.25/M input + $1.25/M output = $1.50
    expect(result.usage.costUsd).toBeCloseTo(1.5, 2)
  })

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    })

    const { callAnthropic } = await import('@/lib/ai/providers/anthropic')
    await expect(callAnthropic(baseRequest)).rejects.toThrow(
      'Anthropic API 429'
    )
  })

  it('uses defaults when maxTokens/temperature not provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: '' }],
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    })

    const { callAnthropic } = await import('@/lib/ai/providers/anthropic')
    await callAnthropic({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.max_tokens).toBe(1024)
    expect(body.temperature).toBe(0.7)
  })
})

// ===== PERPLEXITY =====

describe('Perplexity provider', () => {
  beforeEach(() => {
    process.env.PERPLEXITY_API_KEY = 'pplx-test-key'
  })

  it('throws if PERPLEXITY_API_KEY is missing', async () => {
    delete process.env.PERPLEXITY_API_KEY
    const { callPerplexity } = await import('@/lib/ai/providers/perplexity')
    await expect(
      callPerplexity({ ...baseRequest, provider: 'perplexity' })
    ).rejects.toThrow('PERPLEXITY_API_KEY not configured')
  })

  it('calls correct endpoint with Bearer auth', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'price data' } }],
        usage: { prompt_tokens: 20, completion_tokens: 30 },
      }),
    })

    const { callPerplexity } = await import('@/lib/ai/providers/perplexity')
    await callPerplexity({ ...baseRequest, provider: 'perplexity' })

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.perplexity.ai/chat/completions')
    expect(options.headers.Authorization).toBe('Bearer pplx-test-key')
  })

  it('sends messages directly (no system extraction)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '' } }],
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      }),
    })

    const { callPerplexity } = await import('@/lib/ai/providers/perplexity')
    await callPerplexity({ ...baseRequest, provider: 'perplexity' })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0].role).toBe('system')
  })

  it('returns correct AIResponse', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'giá sửa điện 300k-500k' } }],
        usage: { prompt_tokens: 50, completion_tokens: 25 },
      }),
    })

    const { callPerplexity } = await import('@/lib/ai/providers/perplexity')
    const result = await callPerplexity({
      ...baseRequest,
      provider: 'perplexity',
    })

    expect(result.success).toBe(true)
    expect(result.content).toBe('giá sửa điện 300k-500k')
    expect(result.usage.inputTokens).toBe(50)
    expect(result.usage.outputTokens).toBe(25)
  })

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'internal error',
    })

    const { callPerplexity } = await import('@/lib/ai/providers/perplexity')
    await expect(
      callPerplexity({ ...baseRequest, provider: 'perplexity' })
    ).rejects.toThrow('Perplexity API 500')
  })

  it('uses default temperature 0.2 (lower for search)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '' } }],
        usage: { prompt_tokens: 0, completion_tokens: 0 },
      }),
    })

    const { callPerplexity } = await import('@/lib/ai/providers/perplexity')
    await callPerplexity({
      provider: 'perplexity',
      model: 'sonar',
      messages: [{ role: 'user', content: 'price check' }],
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.temperature).toBe(0.2)
  })
})

// ===== DEEPSEEK =====

describe('DeepSeek provider', () => {
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = 'sk-ds-test-key'
  })

  it('throws if DEEPSEEK_API_KEY is missing', async () => {
    delete process.env.DEEPSEEK_API_KEY
    const { callDeepSeek } = await import('@/lib/ai/providers/deepseek')
    await expect(
      callDeepSeek({ ...baseRequest, provider: 'deepseek' })
    ).rejects.toThrow('DEEPSEEK_API_KEY not configured')
  })

  it('calls correct endpoint with Bearer auth', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'electrical' } }],
        usage: { prompt_tokens: 15, completion_tokens: 5 },
      }),
    })

    const { callDeepSeek } = await import('@/lib/ai/providers/deepseek')
    await callDeepSeek({ ...baseRequest, provider: 'deepseek' })

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect(options.headers.Authorization).toBe('Bearer sk-ds-test-key')
  })

  it('returns correct AIResponse', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'intent: electrical' } }],
        usage: { prompt_tokens: 30, completion_tokens: 10 },
      }),
    })

    const { callDeepSeek } = await import('@/lib/ai/providers/deepseek')
    const result = await callDeepSeek({
      ...baseRequest,
      provider: 'deepseek',
    })

    expect(result.success).toBe(true)
    expect(result.content).toBe('intent: electrical')
    expect(result.usage.inputTokens).toBe(30)
    expect(result.usage.outputTokens).toBe(10)
  })

  it('calculates DeepSeek cost correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '' } }],
        usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 },
      }),
    })

    const { callDeepSeek } = await import('@/lib/ai/providers/deepseek')
    const result = await callDeepSeek({
      ...baseRequest,
      provider: 'deepseek',
    })

    // $0.14/M input + $0.28/M output = $0.42
    expect(result.usage.costUsd).toBeCloseTo(0.42, 2)
  })

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    })

    const { callDeepSeek } = await import('@/lib/ai/providers/deepseek')
    await expect(
      callDeepSeek({ ...baseRequest, provider: 'deepseek' })
    ).rejects.toThrow('DeepSeek API 503')
  })
})
