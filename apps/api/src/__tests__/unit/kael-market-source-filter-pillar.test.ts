import { beforeEach, describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  resetSourceTrustRegistryCacheForTest,
  trustedPerplexityMarketConfig,
  trustedPerplexityMarketConfigForClient,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/evidence/source-trust'

export const PILLAR = {
  id: 'P50-kael-market-source-filter',
  invariant:
    'the market lookup never sends Perplexity more search_domain_filter entries than the provider accepts, and keeps the highest-trust domains when the registry outgrows that limit',
  authority: [
    'https://docs.perplexity.ai/guides/search-domain-filters (maximum 20 domains per request)',
    'governance/RULES.md #4 (Kael output must be grounded, never silently ungrounded)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/evidence/source-trust.ts',
  layer: 'unit',
  siblings: ['P11-kael-routing-conformance', 'P16-ai-spend-envelope'],
  mutation:
    'drop the slice() in buildTrustedPerplexityMarketConfig — the registry case turns red at 25 domains, which is the shape that returned HTTP_400 on every live call',
} as const satisfies PillarManifest

// Perplexity's documented ceiling. Sending more is not a degraded search; the provider rejects
// the whole request, so every price loses its market grounding at once.
const PROVIDER_DOMAIN_LIMIT = 20

const INPUT = {
  serviceType: 'plumbing',
  problem: 'faucet_broken',
  complexity: 'medium',
  district: 'quan_1',
} as const

function registryRow(domain: string, trustScore: number) {
  return {
    domain,
    tier: 'tier_1',
    auto_tier: 1,
    entity_type: 'marketplace',
    region: 'hcmc',
    criteria_met: {},
    trust_score: trustScore,
    last_reviewed_at: new Date().toISOString(),
    is_active: true,
    effective_until: null,
  }
}

// Descending trust, so the domains the cap must keep and the ones it must drop are unambiguous.
const OVERSIZED_REGISTRY = Array.from(
  { length: 25 },
  (_, index) => registryRow(`source-${String(index).padStart(2, '0')}.vn`, 1 - index * 0.02),
)

function clientReturning(rows: readonly unknown[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [...rows], error: null }),
      }),
    }),
  }
}

describe('P50 market source filter', () => {
  beforeEach(() => {
    resetSourceTrustRegistryCacheForTest()
  })

  it('keeps the built-in fallback list inside the provider limit', () => {
    const config = trustedPerplexityMarketConfig(INPUT)
    expect(
      config.searchDomainFilter.length,
      pillarWhy(PILLAR, 'the hardcoded tier-1 list is itself a request body'),
    ).toBeLessThanOrEqual(PROVIDER_DOMAIN_LIMIT)
  })

  it('truncates a registry that has outgrown the provider limit', async () => {
    const config = await trustedPerplexityMarketConfigForClient(
      INPUT,
      clientReturning(OVERSIZED_REGISTRY),
    )
    expect(
      config.searchDomainFilter.length,
      pillarWhy(PILLAR, '25 active tier-1 rows must not become 25 filter entries'),
    ).toBe(PROVIDER_DOMAIN_LIMIT)
  })

  it('drops the least trusted domains rather than an arbitrary tail', async () => {
    const config = await trustedPerplexityMarketConfigForClient(
      INPUT,
      clientReturning(OVERSIZED_REGISTRY),
    )
    expect(
      config.searchDomainFilter,
      pillarWhy(PILLAR, 'the most trusted source must survive truncation'),
    ).toContain('source-00.vn')
    expect(
      config.searchDomainFilter,
      pillarWhy(PILLAR, 'the least trusted source must be the one that is cut'),
    ).not.toContain('source-24.vn')
  })

  // Telemetry reads search_domain_filter_count, not the array. A cap that fixed one and not the
  // other would leave the logs claiming a request shape that was never sent.
  it('reports a count that matches the filter it actually sends', async () => {
    const config = await trustedPerplexityMarketConfigForClient(
      INPUT,
      clientReturning(OVERSIZED_REGISTRY),
    )
    expect(
      config.safeMetadata.search_domain_filter_count,
      pillarWhy(PILLAR, 'metadata and request body must not disagree'),
    ).toBe(config.searchDomainFilter.length)
  })
})
