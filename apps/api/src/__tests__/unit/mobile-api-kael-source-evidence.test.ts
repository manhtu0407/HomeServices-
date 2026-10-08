import { describe, expect, it } from 'vitest'

import { aggregateTrustedMarketSources } from '../../../../../supabase/functions/mobile-api/_shared/kael/evidence/source-trust-aggregation'
import { marketSourceEvidenceResultSchema } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'

const HIGH_VALUE_THRESHOLD_VND = 1_000_000

describe('Kael trusted per-source market evidence', () => {
  it('drops a price more than 40% from the Tier 1-2 median before aggregation', () => {
    const result = aggregateTrustedMarketSources({
      sources: [
        source('btaskee.com', 100_000, 200_000),
        source('jupviec.vn', 120_000, 220_000),
        source('tuoitre.vn', 900_000, 1_000_000),
      ],
      acceptedCitations: [
        citation('btaskee.com', 1),
        citation('jupviec.vn', 1),
        citation('tuoitre.vn', 3),
      ],
      highValueThresholdVnd: HIGH_VALUE_THRESHOLD_VND,
      now: new Date('2026-07-10T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      success: true,
      market: {
        market_range_min: 110_000,
        market_range_max: 210_000,
        sources_summary: 'Tổng hợp 2 nguồn đã kiểm chứng (T1: 2).',
      },
      safeMetadata: {
        source_trust_accepted_sources: expect.arrayContaining([
          expect.objectContaining({
            verified_domain: 'btaskee.com',
            verified_url: 'https://btaskee.com/price',
          }),
        ]),
      },
      rejected: [expect.objectContaining({
        domain: 'tuoitre.vn',
        reason: 'outlier_over_40_percent',
      })],
    })
  })

  it('does not let stale or mixed-unit evidence satisfy the Tier 1-2 quorum', () => {
    const result = aggregateTrustedMarketSources({
      sources: [
        source('btaskee.com', 100_000, 200_000, '2023-07-09'),
        source('jupviec.vn', 120_000, 220_000, '2026-07-09', 'per_hour'),
        {
          ...source('tuoitre.vn', 110_000, 210_000),
          signals: {
            ...trustedSignals(),
            source_type: 'reference' as const,
            hcmc_relevant: false,
          },
        },
      ],
      acceptedCitations: [
        citation('btaskee.com', 1),
        citation('jupviec.vn', 1),
        citation('tuoitre.vn', 3),
      ],
      highValueThresholdVnd: HIGH_VALUE_THRESHOLD_VND,
      now: new Date('2026-07-10T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      success: false,
      failureReason: 'insufficient_tier_1_2_quorum',
      rejected: expect.arrayContaining([
        expect.objectContaining({ domain: 'btaskee.com', reason: 'stale_price_evidence' }),
        expect.objectContaining({ domain: 'jupviec.vn', reason: 'unsupported_unit' }),
      ]),
    })
  })

  it('accepts evidence dated on the current HCMC calendar day before UTC midnight', () => {
    const result = aggregateTrustedMarketSources({
      sources: [
        source('btaskee.com', 180_000, 400_000, '2026-08-14'),
        source('jupviec.vn', 200_000, 420_000, '2026-08-14'),
      ],
      acceptedCitations: [citation('btaskee.com', 1), citation('jupviec.vn', 1)],
      highValueThresholdVnd: HIGH_VALUE_THRESHOLD_VND,
      now: new Date('2026-08-13T17:30:00.000Z'),
    })

    expect(result).toMatchObject({
      success: true,
      quorumMet: true,
      requiredQuorum: 2,
      tier1Tier2Count: 2,
    })
  })

  it('requires three Tier 1-2 sources when the deterministic market range reaches the configured high-value threshold', () => {
    const result = aggregateTrustedMarketSources({
      sources: [
        source('btaskee.com', 900_000, 1_100_000),
        source('jupviec.vn', 950_000, 1_150_000),
      ],
      acceptedCitations: [citation('btaskee.com', 1), citation('jupviec.vn', 2)],
      highValueThresholdVnd: HIGH_VALUE_THRESHOLD_VND,
      now: new Date('2026-07-10T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      success: true,
      quorumMet: false,
      requiredQuorum: 3,
      tier1Tier2Count: 2,
      safeMetadata: {
        source_trust_aggregation_result: 'weak_quorum',
      },
    })
  })

  it('does not let provider evidence or an LLM tier claim promote the registry tier', () => {
    const providerPayload = marketSourceEvidenceResultSchema.parse({
      sources: [{
        ...source('weak.example', 100_000, 200_000),
        claimed_tier: 1,
        signals: trustedSignals(),
      }],
    })
    const result = aggregateTrustedMarketSources({
      sources: providerPayload.sources,
      acceptedCitations: [citation('weak.example', 4)],
      highValueThresholdVnd: HIGH_VALUE_THRESHOLD_VND,
      now: new Date('2026-07-10T00:00:00.000Z'),
    })

    expect(result).toMatchObject({
      success: false,
      failureReason: 'insufficient_tier_1_2_quorum',
      tier1Tier2Count: 0,
    })
    expect(providerPayload.sources[0]).not.toHaveProperty('claimed_tier')
  })
})

function source(
  domain: string,
  price_min: number,
  price_max: number,
  date = '2026-07-09',
  unit: 'per_visit' | 'per_hour' | 'per_m2' = 'per_visit',
) {
  return { domain, price_min, price_max, unit, date, signals: trustedSignals() }
}

function trustedSignals() {
  return {
    identity_verified: true,
    source_type: 'direct_pricing' as const,
    hcmc_relevant: true,
    clear_price_and_unit: true,
    integrity_verified: true,
    evidence_verified: true,
    review_overdue: false,
    price_jump_suspected: false,
  }
}

function citation(domain: string, autoTier: 1 | 2 | 3 | 4) {
  return {
    url: `https://${domain}/price`,
    domain,
    matchedDomain: domain,
    tier: 'tier_1' as const,
    autoTier,
    trustScore: 1,
    effectiveTrustScore: 1,
    entityType: 'direct_pricing',
    region: autoTier === 2 ? 'hcmc' : null,
    criteriaMet: {
      A: true,
      B: true,
      C: true,
      D: true,
      E: true,
      F: true,
      G: true,
    },
  }
}
