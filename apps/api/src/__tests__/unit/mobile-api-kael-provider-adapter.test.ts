import { describe, expect, it } from 'vitest'

import {
  providerAdapterFor,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/provider-adapter'
import type { AIRequest } from '../../../../../supabase/functions/mobile-api/_shared/kael/types'

const pricingAt = new Date('2026-07-10T00:00:00.000Z')

function requestFor(provider: AIRequest['provider']): AIRequest {
  return {
    provider,
    model: provider === 'anthropic'
      ? 'claude-sonnet-5'
      : provider === 'deepseek'
      ? 'deepseek-v4-flash'
      : 'sonar-pro',
    messages: [
      { role: 'system', content: 'System rule.' },
      { role: 'user', content: 'Safe provider adapter test.' },
    ],
    maxTokens: 64,
    temperature: 0.1,
    searchDomainFilter: provider === 'perplexity' ? ['example.com'] : undefined,
    searchContextSize: provider === 'perplexity' ? 'medium' : undefined,
  }
}

describe('mobile-api Kael provider adapters', () => {
  it('declares the current provider capabilities without adding a provider', () => {
    expect(providerAdapterFor('anthropic').capabilities).toEqual({
      vision: true,
      webSearch: false,
      jsonMode: false,
      promptCache: true,
    })
    expect(providerAdapterFor('deepseek').capabilities).toEqual({
      vision: false,
      webSearch: false,
      jsonMode: true,
      promptCache: false,
    })
    expect(providerAdapterFor('perplexity').capabilities).toEqual({
      vision: false,
      webSearch: true,
      jsonMode: false,
      promptCache: false,
    })
  })

  it('preserves provider request endpoints and provider-specific payload fields', () => {
    const anthropic = providerAdapterFor('anthropic').buildRequest({
      request: requestFor('anthropic'),
      apiKey: 'anthropic-key',
    })
    const deepseek = providerAdapterFor('deepseek').buildRequest({
      request: requestFor('deepseek'),
      apiKey: 'deepseek-key',
    })
    const perplexity = providerAdapterFor('perplexity').buildRequest({
      request: requestFor('perplexity'),
      apiKey: 'perplexity-key',
    })

    expect(anthropic).toMatchObject({
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': 'anthropic-key' },
      body: { model: 'claude-sonnet-5', max_tokens: 64 },
    })
    expect(deepseek).toMatchObject({
      url: 'https://api.deepseek.com/chat/completions',
      headers: { Authorization: 'Bearer deepseek-key' },
      body: { thinking: { type: 'disabled' }, response_format: { type: 'json_object' } },
    })
    expect(perplexity).toMatchObject({
      url: 'https://api.perplexity.ai/v1/sonar',
      headers: { Authorization: 'Bearer perplexity-key' },
      body: { search_domain_filter: ['example.com'] },
    })
  })

  it('keeps the Pro intake fallback non-thinking while preserving reasoning for learning work', () => {
    const adapter = providerAdapterFor('deepseek')
    const intent = adapter.buildRequest({
      request: {
        ...requestFor('deepseek'),
        model: 'deepseek-v4-pro',
        purpose: 'intent_classification',
      },
      apiKey: 'deepseek-key',
    })
    const learning = adapter.buildRequest({
      request: {
        ...requestFor('deepseek'),
        model: 'deepseek-v4-pro',
        purpose: 'post_job_learning',
      },
      apiKey: 'deepseek-key',
    })

    expect(intent.body).toMatchObject({ thinking: { type: 'disabled' } })
    expect(intent.body).not.toHaveProperty('reasoning_effort')
    expect(learning.body).toMatchObject({
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
    })
  })

  it('omits unsupported sampling parameters from current Sonnet and Opus requests', () => {
    const adapter = providerAdapterFor('anthropic')
    const sonnet = adapter.buildRequest({
      request: requestFor('anthropic'),
      apiKey: 'anthropic-key',
    })
    const opus = adapter.buildRequest({
      request: { ...requestFor('anthropic'), model: 'claude-opus-4-8' },
      apiKey: 'anthropic-key',
    })

    expect(sonnet.body).not.toHaveProperty('temperature')
    expect(opus.body).not.toHaveProperty('temperature')
  })

  it('parses provider responses through the model-price registry', () => {
    const request = requestFor('perplexity')
    const response = providerAdapterFor('perplexity').parseResponse({
      request,
      data: {
        choices: [{ message: { content: '{"answer":"safe"}' } }],
        citations: ['https://example.com/source'],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 7,
          cost: { total_cost: 0.0123, request_cost: 0.01 },
          search_context_size: 'medium',
        },
      },
      latencyMs: 12,
      model: request.model,
      pricingAt,
      unknownModelPolicy: 'throw',
    })

    expect(response).toMatchObject({
      success: true,
      content: '{"answer":"safe"}',
      usage: { inputTokens: 12, outputTokens: 7, costUsd: 0.0123 },
      citations: ['https://example.com/source'],
    })
  })

  it('extracts Anthropic text after adaptive-thinking blocks without exposing reasoning', () => {
    const request = requestFor('anthropic')
    const response = providerAdapterFor('anthropic').parseResponse({
      request,
      data: {
        content: [
          { type: 'thinking', thinking: '', signature: 'opaque-signature' },
          { type: 'text', text: '{"answer":"safe"}' },
        ],
        usage: {
          input_tokens: 24,
          output_tokens: 12,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
      latencyMs: 18,
      model: request.model,
      pricingAt,
      unknownModelPolicy: 'throw',
    })

    expect(response).toMatchObject({
      success: true,
      content: '{"answer":"safe"}',
      usage: { inputTokens: 24, outputTokens: 12 },
    })
    expect(response.content).not.toContain('opaque-signature')
  })

  it.each([
    ['anthropic', {
      content: [{ text: { private: 'unexpected' } }],
      usage: { input_tokens: 'bad', output_tokens: 2 },
    }],
    ['deepseek', {
      choices: [{ message: { content: { private: 'unexpected' } } }],
      usage: { prompt_tokens: 'bad', completion_tokens: 2 },
    }],
    ['perplexity', {
      choices: [{ message: { content: { private: 'unexpected' } } }],
      usage: { prompt_tokens: 'bad', completion_tokens: 2 },
    }],
  ] as const)('rejects a malformed successful %s response before cost accounting', (provider, data) => {
    const request = requestFor(provider)

    expect(() => providerAdapterFor(provider).parseResponse({
      request,
      data,
      latencyMs: 12,
      model: request.model,
      pricingAt,
      unknownModelPolicy: 'throw',
    })).toThrow('AI_PROVIDER_RESPONSE_INVALID')
  })

  it('keeps current circuit failure classifications stable', () => {
    const adapter = providerAdapterFor('deepseek')
    expect(adapter.classifyFailure({ httpStatus: 402 })).toBe('credit')
    expect(adapter.classifyFailure({ httpStatus: 429 })).toBe('rate_limit')
    expect(adapter.classifyFailure({ httpStatus: 500 })).toBe('server')
    expect(adapter.classifyFailure({ timedOut: true })).toBe('timeout')
    expect(adapter.classifyFailure({ httpStatus: 400 })).toBeNull()
  })
})
