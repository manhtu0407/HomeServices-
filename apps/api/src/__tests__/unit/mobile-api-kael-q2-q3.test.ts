import { afterEach, describe, expect, it, vi } from 'vitest'

import { callAI } from '../../../../../supabase/functions/mobile-api/_shared/kael/provider-client'
import { maxTokensForPurpose } from '../../../../../supabase/functions/mobile-api/_shared/kael/routing.config'
import { marketLookupTelemetry, searchMarketPrice } from '../../../../../supabase/functions/mobile-api/_shared/kael/market'
import {
  isSourceTrustPerplexityFilterEnabled,
  SOURCE_TRUST_VERSION,
  TIER_1_SOURCE_TRUST_DOMAINS,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/source-trust'

describe('mobile-api Kael Q2/Q3 cost optimization', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps output caps behind KAEL_OPT_CAP_OUTPUT_ENABLED', () => {
    expect(maxTokensForPurpose('vision_analysis', 500, () => undefined)).toBe(500)
    expect(maxTokensForPurpose(
      'vision_analysis',
      500,
      (name) => name === 'KAEL_OPT_CAP_OUTPUT_ENABLED' ? 'true' : undefined,
    )).toBe(320)
    expect(maxTokensForPurpose(
      'market_lookup',
      900,
      (name) => name === 'KAEL_OPT_CAP_OUTPUT_ENABLED' ? '1' : undefined,
    )).toBe(300)
  })

  it('adds Anthropic prompt cache control and records cache usage only when enabled', async () => {
    stubDenoEnv({ KAEL_OPT_PROMPT_CACHE_ENABLED: 'true' })
    let body: Record<string, unknown> | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      body = JSON.parse(String((init as RequestInit).body))
      return jsonResponse({
        content: [{ type: 'text', text: '{"ok":true}' }],
        usage: {
          input_tokens: 100,
          output_tokens: 12,
          cache_creation_input_tokens: 80,
          cache_read_input_tokens: 0,
        },
      })
    }))

    const result = await callAI({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      messages: [
        { role: 'system', content: 'Stable Kael system prompt.' },
        { role: 'user', content: 'Estimate a safe repair.' },
      ],
      maxTokens: 120,
    }, { anthropicApiKey: 'sk-test' })

    expect((body?.system as Array<Record<string, unknown>>)[0]).toMatchObject({
      type: 'text',
      cache_control: { type: 'ephemeral' },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.usage.cacheCreationInputTokens).toBe(80)
      expect(result.usage.cacheStatus).toBe('write')
    }
  })

  it('passes Perplexity source-search options through the Edge provider client', async () => {
    let body: Record<string, unknown> | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      body = JSON.parse(String((init as RequestInit).body))
      return jsonResponse({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
        citations: ['https://example.test/source'],
      })
    }))

    const result = await callAI({
      provider: 'perplexity',
      model: 'sonar',
      messages: [{ role: 'user', content: 'Market price in HCMC.' }],
      searchDomainFilter: ['example.test'],
      searchRecencyFilter: 'month',
      searchMode: 'web',
      searchContextSize: 'low',
    }, { perplexityApiKey: 'pplx-test' })

    expect(body).toMatchObject({
      search_domain_filter: ['example.test'],
      search_recency_filter: 'month',
      web_search_options: {
        search_mode: 'web',
        search_context_size: 'low',
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.citations).toEqual(['https://example.test/source'])
    }
  })

  it('parses the Section 25 R2 source trust flag with rollback-safe truthy values', () => {
    expect(isSourceTrustPerplexityFilterEnabled(() => '1')).toBe(true)
    expect(isSourceTrustPerplexityFilterEnabled(() => ' true ')).toBe(true)
    expect(isSourceTrustPerplexityFilterEnabled(() => 'on')).toBe(true)
    expect(isSourceTrustPerplexityFilterEnabled((name) =>
      name === 'KAEL_OPT_SOURCE_TRUST_ENABLED' ? 'yes' : undefined
    )).toBe(true)
    expect(isSourceTrustPerplexityFilterEnabled(() => 'false')).toBe(false)
    expect(isSourceTrustPerplexityFilterEnabled(() => undefined)).toBe(false)
  })

  it('keeps Section 25 R2 Perplexity allowlist config behind the env flag', async () => {
    stubDenoEnv({ KAEL_TRUST_PERPLEXITY_FILTER_ENABLED: 'false' })
    let body: Record<string, unknown> | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      body = JSON.parse(String((init as RequestInit).body))
      return jsonResponse({
        choices: [{
          message: {
            content: JSON.stringify({
              market_range_min: 130000,
              market_range_max: 240000,
              confidence: 0.78,
              sources_summary: 'Legacy Perplexity market sources.',
            }),
          },
        }],
        usage: { prompt_tokens: 44, completion_tokens: 31 },
      })
    }))

    const result = await searchMarketPrice(
      'electrical',
      'breaker trip',
      'medium',
      'q7',
      { perplexityApiKey: 'pplx-test', sourceTrustPerplexityFilterEnabled: false },
    )

    expect(result.success).toBe(true)
    expect(body?.search_domain_filter).toBeUndefined()
    if (result.success) {
      expect(result.model).toBe('sonar')
      expect(result.safeMetadata).toBeUndefined()
    }
  })

  it('applies Section 25 R2 trusted Perplexity allowlist, recency, prompt, and safe metadata', async () => {
    stubDenoEnv({ KAEL_TRUST_PERPLEXITY_FILTER_ENABLED: 'false' })
    let body: Record<string, unknown> | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      body = JSON.parse(String((init as RequestInit).body))
      return jsonResponse({
        choices: [{
          message: {
            content: JSON.stringify({
              market_range_min: 150000,
              market_range_max: 260000,
              confidence: 0.82,
              sources_summary: '2 trusted Vietnamese domains.',
            }),
          },
        }],
        usage: { prompt_tokens: 52, completion_tokens: 38 },
      })
    }))

    const result = await searchMarketPrice(
      'plumbing',
      'pipe leak',
      'small',
      'q7',
      { perplexityApiKey: 'pplx-test', sourceTrustPerplexityFilterEnabled: true },
    )

    expect(body).toMatchObject({
      model: 'sonar-pro',
      max_tokens: 600,
      search_domain_filter: [...TIER_1_SOURCE_TRUST_DOMAINS],
      search_recency_filter: 'month',
      web_search_options: {
        search_mode: 'web',
        search_context_size: 'medium',
      },
    })
    expect(body?.search_domain_filter).toHaveLength(20)
    const messages = body?.messages as Array<Record<string, unknown>>
    expect(messages[0]?.content).toContain('trusted Vietnamese domains')
    expect(messages[0]?.content).toContain('insufficient_trusted_data')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.model).toBe('sonar-pro')
      expect(result.safeMetadata).toMatchObject({
        source_trust_enabled: true,
        source_trust_version: SOURCE_TRUST_VERSION,
        search_domain_filter_count: 20,
        search_recency_filter: 'month',
        search_mode: 'web',
        search_context_size: 'medium',
        latency_budget_ms: 6000,
      })
    }
  })

  it('fails safely when trusted Perplexity says data is insufficient', async () => {
    stubDenoEnv({ KAEL_TRUST_PERPLEXITY_FILTER_ENABLED: 'true' })
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: '{"error":"insufficient_trusted_data"}' } }],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchMarketPrice(
      'cleaning',
      'window cleaning',
      'small',
      'q7',
      { perplexityApiKey: 'pplx-test', sourceTrustPerplexityFilterEnabled: true },
    )

    expect(result.success).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    if (!result.success) {
      expect(result.failureReason).toContain('insufficient_trusted_data')
      expect(result.provider).toBe('perplexity')
      expect(result.model).toBe('sonar-pro')
      expect(result.safeMetadata).toMatchObject({
        source_trust_enabled: true,
        source_trust_version: SOURCE_TRUST_VERSION,
      })
    }
  })

  it('precomputes Section 25 R2 market telemetry for outer stage timeouts', () => {
    const telemetry = marketLookupTelemetry({
      serviceType: 'plumbing',
      problem: 'pipe_leak',
      complexity: 'medium',
      district: 'q7',
      secrets: { sourceTrustPerplexityFilterEnabled: true },
    })

    expect(telemetry).toMatchObject({
      provider: 'perplexity',
      model: 'sonar-pro',
      timeoutMs: 6000,
      safeMetadata: {
        source_trust_enabled: true,
        search_domain_filter_count: 20,
        latency_budget_ms: 6000,
      },
    })
  })

  it('serves Q3 market lookup from cache without a provider call', async () => {
    stubDenoEnv({ KAEL_OPT_MARKET_CACHE_ENABLED: 'true' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { client, calls } = makeMarketCacheClient({
      id: '11111111-1111-4111-8111-111111111111',
      market_range_min: 150000,
      market_range_max: 260000,
      confidence: 0.82,
      sources_summary: 'Cached HCMC market evidence.',
    })

    const result = await searchMarketPrice(
      'electrical',
      'Breaker Trip',
      'medium',
      'Q7',
      { perplexityApiKey: 'pplx-test' },
      client,
    )

    expect(result).toMatchObject({
      success: true,
      provider: 'perplexity',
      model: 'kael-market-cache',
      cacheStatus: 'hit',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(calls).toContainEqual(expect.objectContaining({
      op: 'rpc',
      name: 'increment_kael_market_cache_hit',
    }))
  })

  it('writes successful Perplexity market lookup results into Q3 cache', async () => {
    stubDenoEnv({ KAEL_OPT_MARKET_CACHE_ENABLED: 'true' })
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({
        choices: [{
          message: {
            content: JSON.stringify({
              market_range_min: 120000,
              market_range_max: 220000,
              confidence: 0.76,
              sources_summary: 'Perplexity market sources.',
            }),
          },
        }],
        usage: { prompt_tokens: 40, completion_tokens: 30 },
      })
    ))
    const { client, calls } = makeMarketCacheClient(null)

    const result = await searchMarketPrice(
      'plumbing',
      'pipe leak',
      'small',
      'q7',
      { perplexityApiKey: 'pplx-test' },
      client,
    )

    expect(result).toMatchObject({
      success: true,
      provider: 'perplexity',
      cacheStatus: 'write',
    })
    const upsert = calls.find((call) => call.op === 'upsert')
    expect(upsert).toMatchObject({
      table: 'kael_market_cache',
      value: expect.objectContaining({
        district_code: 'q7',
        service_type: 'plumbing',
        problem_slug: 'pipe_leak',
        complexity: 'small',
        market_range_min: 120000,
        market_range_max: 220000,
      }),
      options: { onConflict: 'district_code,service_type,problem_slug,complexity' },
    })
  })
})

function stubDenoEnv(values: Record<string, string>) {
  vi.stubGlobal('Deno', {
    env: {
      get: (name: string) => values[name],
    },
  })
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeMarketCacheClient(cacheRow: Record<string, unknown> | null) {
  const calls: Array<Record<string, unknown>> = []
  const client = {
    from: (table: string) => makeQuery(table, calls, cacheRow),
    rpc: (name: string, args?: Record<string, unknown>) => {
      calls.push({ op: 'rpc', name, args })
      return thenable({ data: null, error: null })
    },
  }
  return { client, calls }
}

function makeQuery(
  table: string,
  calls: Array<Record<string, unknown>>,
  cacheRow: Record<string, unknown> | null,
) {
  let mode: 'select' | 'upsert' = 'select'
  const query = {
    select: (columns?: string) => {
      calls.push({ op: 'select', table, columns })
      return query
    },
    insert: (value: unknown) => {
      calls.push({ op: 'insert', table, value })
      return query
    },
    update: (value: unknown) => {
      calls.push({ op: 'update', table, value })
      return query
    },
    upsert: (value: unknown, options?: unknown) => {
      mode = 'upsert'
      calls.push({ op: 'upsert', table, value, options })
      return query
    },
    eq: (column: string, value: unknown) => {
      calls.push({ op: 'eq', table, column, value })
      return query
    },
    gt: (column: string, value: unknown) => {
      calls.push({ op: 'gt', table, column, value })
      return query
    },
    is: (column: string, value: unknown) => {
      calls.push({ op: 'is', table, column, value })
      return query
    },
    maybeSingle: () => query,
    then: <TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(
      mode === 'upsert'
        ? { data: null, error: null }
        : { data: cacheRow, error: null },
    ).then(onfulfilled, onrejected),
  }
  return query
}

function thenable(value: unknown) {
  return {
    then: <TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(value).then(onfulfilled, onrejected),
  }
}
