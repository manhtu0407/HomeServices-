import { beforeEach, describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import {
  resetSourceTrustRegistryCacheForTest,
  trustedPerplexityMarketConfigForClient,
} from '../../../../../../supabase/functions/mobile-api/_shared/kael/evidence/source-trust'
import { aggregateTrustedMarketSources } from '../../../../../../supabase/functions/mobile-api/_shared/kael/evidence/source-trust-aggregation'

export const PILLAR = {
  id: 'P343-kael-live-price-research',
  invariant:
    'live price research searches the verified providers reviewed for the requested service, describes the case with its Vietnamese problem and photo findings, and lets same-unit per-point or per-item price tables reach the Tier 1-2 quorum while mixed units never combine',
  authority: [
    'governance/RULES.md #8 (no fabricated price data when market data fails)',
    'governance/Plan.md §59 Phase 1 (live research must be able to succeed)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/evidence/source-trust.ts',
  layer: 'unit',
  siblings: ['P50-kael-market-source-filter', 'P338-kael-market-lookup-always-recorded'],
  mutation:
    'restore the tier-1-only filter in searchDomainsForService — the Tier 2 electrical provider drops out of the search and the service-scope case turns red',
} as const satisfies PillarManifest

function registryRow(domain: string, autoTier: 1 | 2, serviceTypes: string[]) {
  return {
    domain,
    tier: autoTier === 1 ? 'tier_1' : 'tier_2',
    auto_tier: autoTier,
    entity_type: 'direct_service_provider',
    region: 'hcmc',
    criteria_met: { A: true, B: true, C: true, D: true, E: true, F: true, G: true },
    trust_score: 0.9,
    last_reviewed_at: new Date().toISOString(),
    is_active: true,
    effective_until: null,
    service_types: serviceTypes,
  }
}

function clientReturning(rows: readonly unknown[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [...rows], error: null }),
      }),
    }),
  }
}

const REGISTRY = [
  registryRow('be.com.vn', 1, ['cleaning']),
  registryRow('1fix.vn', 1, ['electrical', 'plumbing']),
  registryRow('thoviet.com.vn', 2, ['electrical', 'plumbing']),
  registryRow('tuoitre.vn', 1, []),
]

describe('P343 live price research', () => {
  beforeEach(() => {
    resetSourceTrustRegistryCacheForTest()
  })

  it('searches the Tier 1-2 providers reviewed for the service and leaves other services out', async () => {
    const config = await trustedPerplexityMarketConfigForClient(
      { serviceType: 'electrical', problem: 'breaker_trip', complexity: 'small', district: 'thu_duc' },
      clientReturning(REGISTRY),
    )
    expect(config.searchDomainFilter, pillarWhy(PILLAR, 'a reviewed Tier 2 electrical price table must be searchable')).toContain('thoviet.com.vn')
    expect(config.searchDomainFilter).toContain('1fix.vn')
    expect(config.searchDomainFilter, pillarWhy(PILLAR, 'a cleaning-only provider cannot price an electrical repair')).not.toContain('be.com.vn')
    expect(config.searchDomainFilter.indexOf('1fix.vn'), pillarWhy(PILLAR, 'scoped providers come before unscoped fill')).toBeLessThan(
      config.searchDomainFilter.indexOf('tuoitre.vn'),
    )
    expect(config.searchRecencyFilter, pillarWhy(PILLAR, 'price tables are rarely edited within a month')).toBe('year')
  })

  it('describes the case with the Vietnamese problem, the customer detail and the photo findings', async () => {
    const config = await trustedPerplexityMarketConfigForClient(
      {
        serviceType: 'electrical',
        problem: 'breaker_trip',
        complexity: 'small',
        district: 'thu_duc',
        research: {
          problemLabelVi: 'Cầu dao trip',
          customerDetail: 'Bật cầu dao xong thì tự động tắt',
          visualFindings: ['Aptomat 32A bị cháy sém ở cực đấu dây'],
          recommendedScope: 'Kiểm tra và thay 1 aptomat',
          priorFindings: ['Aptomat cũ nhảy do quá tải'],
        },
      },
      clientReturning(REGISTRY),
    )
    const userPrompt = config.messages.find((message) => message.role === 'user')?.content ?? ''
    expect(userPrompt, pillarWhy(PILLAR, 'a slug alone made every electrical lookup come back empty')).toContain('Cầu dao trip')
    expect(userPrompt).toContain('Bật cầu dao xong thì tự động tắt')
    expect(userPrompt, pillarWhy(PILLAR, 'the photo reading shapes what price is searched')).toContain('Aptomat 32A')
    expect(userPrompt).toContain('Aptomat cũ nhảy do quá tải')
    expect(config.safeMetadata.research_context_fields).toBe(5)
  })

  it('lets per-repair-point price tables reach the quorum on their own', () => {
    const result = aggregateTrustedMarketSources({
      sources: [
        source('1fix.vn', 150_000, 300_000, 'per_repair_point'),
        source('thoviet.com.vn', 160_000, 320_000, 'per_repair_point'),
      ],
      acceptedCitations: [citation('1fix.vn', 1), citation('thoviet.com.vn', 2)],
      highValueThresholdVnd: 1_000_000,
      now: new Date('2026-10-08T00:00:00.000Z'),
    })
    expect(result, pillarWhy(PILLAR, 'electrical repairs are priced per point, not per visit')).toMatchObject({
      success: true,
      quorumMet: true,
      unit: 'per_repair_point',
      tier1Tier2Count: 2,
    })
  })

  it('omits an oversized citation link instead of truncating it into another URL', () => {
    const result = aggregateTrustedMarketSources({
      sources: [
        source('1fix.vn', 150_000, 300_000, 'per_visit'),
        source('thoviet.com.vn', 160_000, 320_000, 'per_visit'),
      ],
      acceptedCitations: [
        citation('1fix.vn', 1, `https://1fix.vn/${'a'.repeat(2_000)}`),
        citation('thoviet.com.vn', 2),
      ],
      highValueThresholdVnd: 1_000_000,
      now: new Date('2026-10-08T00:00:00.000Z'),
    })
    const sources = result.safeMetadata.source_trust_accepted_sources as Array<{
      domain: string
      verified_url: string | null
    }>

    expect(result.success).toBe(true)
    expect(sources.find((item) => item.domain === '1fix.vn')?.verified_url).toBeNull()
    expect(sources.find((item) => item.domain === 'thoviet.com.vn')?.verified_url).toBe(
      'https://thoviet.com.vn/bang-gia',
    )
  })

  it('never combines a per-visit package with a per-point rate', () => {
    const result = aggregateTrustedMarketSources({
      sources: [
        source('1fix.vn', 150_000, 300_000, 'per_repair_point'),
        source('thoviet.com.vn', 400_000, 600_000, 'per_visit'),
      ],
      acceptedCitations: [citation('1fix.vn', 1), citation('thoviet.com.vn', 2)],
      highValueThresholdVnd: 1_000_000,
      now: new Date('2026-10-08T00:00:00.000Z'),
    })
    expect(result, pillarWhy(PILLAR, 'two units are two different prices')).toMatchObject({
      success: true,
      quorumMet: false,
      rejected: [expect.objectContaining({ reason: 'mixed_unit' })],
    })
  })

  it('treats price tables older than 12 months as stale', () => {
    const result = aggregateTrustedMarketSources({
      sources: [
        source('1fix.vn', 150_000, 300_000, 'per_visit', '2025-09-01'),
        source('thoviet.com.vn', 160_000, 320_000, 'per_visit', '2026-09-01'),
      ],
      acceptedCitations: [citation('1fix.vn', 1), citation('thoviet.com.vn', 2)],
      highValueThresholdVnd: 1_000_000,
      now: new Date('2026-10-08T00:00:00.000Z'),
    })
    expect(result.rejected, pillarWhy(PILLAR, 'the freshness window matches the governed baseline rule')).toEqual(
      expect.arrayContaining([expect.objectContaining({ domain: '1fix.vn', reason: 'stale_price_evidence' })]),
    )
  })
})

function source(
  domain: string,
  price_min: number,
  price_max: number,
  unit: 'per_visit' | 'per_repair_point' | 'per_item',
  date = '2026-09-20',
) {
  return {
    domain,
    price_min,
    price_max,
    unit,
    date,
    signals: {
      identity_verified: true,
      source_type: 'direct_pricing' as const,
      hcmc_relevant: true,
      clear_price_and_unit: true,
      integrity_verified: true,
      evidence_verified: true,
      review_overdue: false,
      price_jump_suspected: false,
    },
  }
}

function citation(domain: string, autoTier: 1 | 2, url = `https://${domain}/bang-gia`) {
  return {
    url,
    domain,
    matchedDomain: domain,
    tier: autoTier === 1 ? 'tier_1' as const : 'tier_2' as const,
    autoTier,
    trustScore: 0.9,
    effectiveTrustScore: 0.9,
    entityType: 'direct_service_provider',
    region: 'hcmc',
    criteriaMet: { A: true, B: true, C: true, D: true, E: true, F: true, G: true },
  }
}
