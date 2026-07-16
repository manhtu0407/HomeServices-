import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    anthropicApiKey: 'test-key',
    deepseekApiKey: 'test-key',
    perplexityApiKey: 'test-key',
  },
}))

import { callAnthropic } from '@/lib/ai/providers/anthropic'
import { callDeepSeek } from '@/lib/ai/providers/deepseek'
import { callPerplexity } from '@/lib/ai/providers/perplexity'

const request = {
  provider: 'anthropic' as const,
  model: 'test-model',
  messages: [{ role: 'user' as const, content: 'test' }],
}

describe('legacy AI provider response bounds', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', {
      headers: { 'content-length': '99999999', 'content-type': 'application/json' },
    })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['anthropic', () => callAnthropic(request)],
    ['deepseek', () => callDeepSeek({ ...request, provider: 'deepseek' as const })],
    ['perplexity', () => callPerplexity({ ...request, provider: 'perplexity' as const })],
  ])('rejects an oversized %s response before buffering it', async (_provider, invoke) => {
    await expect(invoke()).rejects.toThrow('AI_PROVIDER_RESPONSE_TOO_LARGE')
  })

  it.each([
    ['anthropic', () => callAnthropic(request)],
    ['deepseek', () => callDeepSeek({ ...request, provider: 'deepseek' as const })],
    ['perplexity', () => callPerplexity({ ...request, provider: 'perplexity' as const })],
  ])('rejects redirects on credentialed %s calls', async (_provider, invoke) => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', {
      headers: { 'content-length': '99999999' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(invoke()).rejects.toThrow('AI_PROVIDER_RESPONSE_TOO_LARGE')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'error' }),
    )
  })

  it.each([
    ['anthropic', () => callAnthropic(request), {
      content: [{ text: { private: 'unexpected' } }],
      usage: { input_tokens: 'not-a-number', output_tokens: 2 },
    }],
    ['deepseek', () => callDeepSeek({ ...request, provider: 'deepseek' as const }), {
      choices: [{ message: { content: { private: 'unexpected' } } }],
      usage: { prompt_tokens: 'not-a-number', completion_tokens: 2 },
    }],
    ['perplexity', () => callPerplexity({ ...request, provider: 'perplexity' as const }), {
      choices: [{ message: { content: { private: 'unexpected' } } }],
      usage: { prompt_tokens: 'not-a-number', completion_tokens: 2 },
    }],
  ])('rejects a malformed successful %s contract', async (_provider, invoke, payload) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), {
      headers: { 'content-type': 'application/json' },
    })))

    await expect(invoke()).rejects.toThrow('AI_PROVIDER_RESPONSE_INVALID')
  })
})
