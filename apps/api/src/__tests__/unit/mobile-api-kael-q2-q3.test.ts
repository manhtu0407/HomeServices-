import { afterEach, describe, expect, it, vi } from 'vitest'

import { callAI } from '../../../../../supabase/functions/mobile-api/_shared/kael/provider-client'
import { maxTokensForPurpose } from '../../../../../supabase/functions/mobile-api/_shared/kael/routing.config'
import { marketLookupTelemetry, searchMarketPrice } from '../../../../../supabase/functions/mobile-api/_shared/kael/market'
import {
  effectiveTrustScore,
  isSourceTrustPerplexityFilterEnabled,
  lookupTrustScore,
  resetSourceTrustRegistryCacheForTest,
  SOURCE_TRUST_VERSION,
  TIER_1_SOURCE_TRUST_DOMAINS,
  validateCitations,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/source-trust'

describe('mobile-api Kael Q2/Q3 cost optimization', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetSourceTrustRegistryCacheForTest()
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
        citations: [
          'https://btaskee.com/bang-gia-ve-sinh',
          'https://jupviec.vn/bang-gia',
        ],
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
        source_trust_citation_result: 'passed',
        accepted_citations: 2,
      })
      expect(result.market.citations).toEqual([
        'https://btaskee.com/bang-gia-ve-sinh',
        'https://jupviec.vn/bang-gia',
      ])
    }
  })

  it('loads F26 source trust scores from DB rows', async () => {
    const { client, calls } = makeSourceTrustClient([
      registryRow('btaskee.com', 1),
      registryRow('jupviec.vn', 0.9),
      registryRow('untrusted.test', 0.2, 'tier_3'),
    ])

    const result = await lookupTrustScore(
      'https://www.btaskee.com/cleaning',
      client,
      { now: new Date('2026-05-26T12:00:00.000Z') },
    )

    expect(result).toMatchObject({
      requestedDomain: 'btaskee.com',
      matchedDomain: 'btaskee.com',
      tier: 'tier_1',
      trustScore: 1,
      effectiveTrustScore: 1,
      source: 'db',
    })
    expect(calls.filter((call) => call.table === 'source_trust_registry')).toHaveLength(1)
  })

  it('applies F26 trust score decay and blocks unknown domains', async () => {
    expect(effectiveTrustScore({
      trustScore: 1,
      lastReviewedAt: '2026-01-01T00:00:00.000Z',
      effectiveUntil: null,
      isActive: true,
    }, new Date('2026-05-26T00:00:00.000Z'))).toBe(0.9)

    const unknown = await lookupTrustScore(
      'https://unknown.example/price',
      makeSourceTrustClient([registryRow('btaskee.com', 1)]).client,
      { now: new Date('2026-05-26T00:00:00.000Z') },
    )

    expect(unknown).toMatchObject({
      tier: 'blocked',
      trustScore: 0,
      effectiveTrustScore: 0,
    })
  })

  it('validates trusted citation quorum from distinct Tier 1 domains', async () => {
    const { client } = makeSourceTrustClient([
      registryRow('btaskee.com', 1),
      registryRow('jupviec.vn', 0.95),
    ])

    const pass = await validateCitations([
      'https://btaskee.com/source-a',
      'https://jupviec.vn/source-b',
    ], client, 2, { now: new Date('2026-05-26T00:00:00.000Z') })
    const fail = await validateCitations([
      'https://btaskee.com/source-a',
      'https://facebook.com/group-post',
    ], client, 2, { now: new Date('2026-05-26T00:00:00.000Z') })

    expect(pass.quorumMet).toBe(true)
    expect(pass.safeMetadata).toMatchObject({
      source_trust_citation_result: 'passed',
      accepted_citations: 2,
    })
    expect(fail.quorumMet).toBe(false)
    expect(fail.safeMetadata).toMatchObject({
      source_trust_citation_result: 'insufficient_trusted_citations',
      accepted_citations: 1,
    })
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

  it('persists F26 trusted citations into kael_market_artifacts metadata', async () => {
    stubDenoEnv({ KAEL_TRUST_PERPLEXITY_FILTER_ENABLED: 'true' })
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({
        choices: [{
          message: {
            content: JSON.stringify({
              market_range_min: 160000,
              market_range_max: 280000,
              confidence: 0.84,
              sources_summary: '2 trusted Vietnamese domains.',
            }),
          },
        }],
        usage: { prompt_tokens: 52, completion_tokens: 38 },
        citations: [
          'https://btaskee.com/bang-gia',
          'https://jupviec.vn/gia-dich-vu',
        ],
      })
    ))
    const { client, calls } = makeMarketTrustClient()

    const result = await searchMarketPrice(
      'cleaning',
      'standard_home_cleaning',
      'medium',
      'q7',
      { perplexityApiKey: 'pplx-test', sourceTrustPerplexityFilterEnabled: true },
      client,
    )

    expect(result.success).toBe(true)
    const artifactInsert = calls.find((call) =>
      call.table === 'kael_market_artifacts' &&
      call.operations.some((operation) => operation[0] === 'insert')
    )
    expect(JSON.stringify(artifactInsert)).toContain('https://btaskee.com/bang-gia')
    expect(JSON.stringify(artifactInsert)).toContain('"accepted":true')
    expect(JSON.stringify(artifactInsert)).toContain('source_trust_citation_result')
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

function registryRow(domain: string, trustScore: number, tier = 'tier_1') {
  return {
    domain,
    tier,
    trust_score: trustScore,
    is_active: true,
    last_reviewed_at: '2026-05-26T00:00:00.000Z',
    effective_until: null,
  }
}

function makeSourceTrustClient(rows: Array<Record<string, unknown>>) {
  const calls: Array<{ table: string; operations: unknown[][] }> = []
  return {
    calls,
    client: {
      from: (table: string) => makeTableQuery(
        table,
        calls,
        table === 'source_trust_registry' ? rows : null,
      ),
    },
  }
}

function makeMarketTrustClient() {
  const calls: Array<{ table: string; operations: unknown[][] }> = []
  return {
    calls,
    client: {
      from: (table: string) => makeTableQuery(
        table,
        calls,
        table === 'source_trust_registry'
          ? [registryRow('btaskee.com', 1), registryRow('jupviec.vn', 0.95)]
          : null,
      ),
      rpc: () => thenable({ data: null, error: null }),
    },
  }
}

function makeTableQuery(
  table: string,
  calls: Array<{ table: string; operations: unknown[][] }>,
  data: unknown,
) {
  const call = { table, operations: [] as unknown[][] }
  calls.push(call)
  let mode: 'select' | 'insert' | 'upsert' = 'select'
  const query = {
    select: (columns?: string) => {
      call.operations.push(['select', columns])
      return query
    },
    insert: (value: unknown) => {
      mode = 'insert'
      call.operations.push(['insert', value])
      return query
    },
    update: (value: unknown) => {
      call.operations.push(['update', value])
      return query
    },
    upsert: (value: unknown, options?: unknown) => {
      mode = 'upsert'
      call.operations.push(['upsert', value, options])
      return query
    },
    eq: (column: string, value: unknown) => {
      call.operations.push(['eq', column, value])
      return query
    },
    gt: (column: string, value: unknown) => {
      call.operations.push(['gt', column, value])
      return query
    },
    is: (column: string, value: unknown) => {
      call.operations.push(['is', column, value])
      return query
    },
    maybeSingle: () => query,
    then: <TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(
      mode === 'insert' || mode === 'upsert'
        ? { data: null, error: null }
        : { data, error: null },
    ).then(onfulfilled, onrejected),
  }
  return query
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
