import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import {
  finalizeMarketRouteResult,
  normalizeMarketCacheKey,
  type MarketCacheClient,
} from '../../../../../../supabase/functions/mobile-api/_shared/kael/tools/market-provider'

export const PILLAR = {
  id: 'P338-kael-market-lookup-always-recorded',
  invariant:
    'every trusted Perplexity price lookup leaves one auditable market artifact, including a lookup that found no trusted data, and an empty lookup never becomes a market price',
  authority: [
    'governance/RULES.md #8 (no silent degradation; log enough safe metadata to debug the failure)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/tools/market-provider.ts',
  layer: 'unit',
  siblings: ['P337-kael-price-evidence-not-ready'],
  mutation:
    'drop the artifact write from the insufficient_trusted_data branch — the empty-lookup case records nothing and turns red',
} as const satisfies PillarManifest

function recordingClient() {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = []
  const client: MarketCacheClient = {
    from(table: string) {
      const query = {
        insert(row: unknown) {
          inserts.push({ table, row: row as Record<string, unknown> })
          return query
        },
        select: () => query,
        update: () => query,
        upsert: () => query,
        eq: () => query,
        gt: () => query,
        is: () => query,
        maybeSingle: () => query,
        then: (resolve?: ((value: unknown) => unknown) | null) =>
          Promise.resolve({ data: null, error: null }).then(resolve ?? undefined),
      }
      return query as never
    },
  }
  return { client, inserts }
}

const trustedConfig = {
  model: 'sonar',
  maxTokens: 600,
  timeoutMs: 6_000,
  searchDomainFilter: ['thosaigon.vn'],
  searchRecencyFilter: 'month',
  searchMode: 'web',
  searchContextSize: 'medium',
  messages: [],
  safeMetadata: { source_trust_enabled: true },
} as const

describe('P338 market lookup artifact', () => {
  it('records a trusted lookup that found no trusted data, without a price', async () => {
    const { client, inserts } = recordingClient()
    const result = await finalizeMarketRouteResult({
      cacheClient: client,
      cacheKey: normalizeMarketCacheKey('electrical', 'breaker_trip', 'medium', 'thu_duc'),
      serviceType: 'electrical',
      trustedConfig: trustedConfig as never,
      knowledgeContext: undefined,
      routeSafeMetadata: undefined,
      escalationMetadata: undefined,
      selectedResult: {
        data: { error: 'insufficient_trusted_data' },
        content: '{"error":"insufficient_trusted_data"}',
        citations: ['https://example.vn/bang-gia-sua-dien'],
        usage: { inputTokens: 935, outputTokens: 9, costUsd: 0.009 },
      } as never,
      selectedRoute: { provider: 'perplexity', model: 'sonar' },
      route: { provider: 'perplexity', model: 'sonar' },
    })

    expect(result?.success, pillarWhy(PILLAR, 'an empty lookup is not a market price')).toBe(false)
    const artifacts = inserts.filter((insert) => insert.table === 'kael_market_artifacts')
    expect(artifacts, pillarWhy(PILLAR, 'the empty lookup must leave exactly one auditable row')).toHaveLength(1)
    expect(artifacts[0].row).toMatchObject({
      service_type: 'electrical',
      problem_slug: 'breaker_trip',
      complexity: 'medium',
      provider: 'perplexity',
      market_range_min: null,
      market_range_max: null,
      failure_reason: 'perplexity:insufficient_trusted_data',
    })
    expect(artifacts[0].row.safe_metadata).toMatchObject({
      source_trust_enabled: true,
      citations: [{ url: 'https://example.vn/bang-gia-sua-dien', accepted: false }],
    })
    expect(inserts.some((insert) => insert.table === 'kael_market_cache'),
      pillarWhy(PILLAR, 'an empty lookup must never be cached as a price')).toBe(false)
  })
})
