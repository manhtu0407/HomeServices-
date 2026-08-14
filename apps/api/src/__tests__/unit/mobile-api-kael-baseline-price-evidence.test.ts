import { describe, expect, it } from 'vitest'

import {
  validateBaselinePriceEvidence,
  type BaselinePriceEvidenceDocument,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/evidence/baseline-price-evidence'
import type { CitationValidationResult } from '../../../../../supabase/functions/mobile-api/_shared/kael/evidence/source-trust'

const trustedCitations: CitationValidationResult['accepted'] = [
  {
    url: 'https://suachuatainha.com.vn/thay-sua-ray-truot-ban-le-phu-kien-tu-go/',
    domain: 'suachuatainha.com.vn',
    matchedDomain: 'suachuatainha.com.vn',
    tier: 'tier_1',
    autoTier: 1,
    trustScore: 1,
    effectiveTrustScore: 1,
    entityType: 'direct_service_provider',
    region: 'hcmc',
    criteriaMet: { A: true, B: true, C: true, D: true, E: true, F: true, G: true },
  },
  {
    url: 'https://nhabepsaigon.vn/bao-gia-sua-tu-bep-moi-nhat',
    domain: 'nhabepsaigon.vn',
    matchedDomain: 'nhabepsaigon.vn',
    tier: 'tier_1',
    autoTier: 1,
    trustScore: 1,
    effectiveTrustScore: 1,
    entityType: 'direct_service_provider',
    region: 'hcmc',
    criteriaMet: { A: true, B: true, C: true, D: true, E: true, F: true, G: true },
  },
]

const verifiedEvidence: BaselinePriceEvidenceDocument = {
  schema_version: 'baseline_price_evidence.v1',
  sources: [
    {
      domain: 'suachuatainha.com.vn',
      url: trustedCitations[0].url,
      observed_at: '2026-08-14',
      price_min: 120_000,
      price_max: 250_000,
      unit: 'per_cabinet_door',
      verification: verifiedSource({
        publishedAt: '2025-12-14',
        priceHash: '251989BF6C0164DECCFAADEC460901340D68C90E1B98C9007D5FFB12F67BF35B',
        identityHash: 'F20C6FBCBC2183ED1A26CF38A2DC7F979711F1CA1C2A4EA146F41376C5161668',
      }),
      signals: verifiedSignals(),
    },
    {
      domain: 'nhabepsaigon.vn',
      url: trustedCitations[1].url,
      observed_at: '2026-08-14',
      price_min: 160_000,
      price_max: 500_000,
      unit: 'per_cabinet_door',
      verification: verifiedSource({
        publishedAt: '2026-06-04',
        priceHash: '0AB71E27B74DFBB137E15FBD611FB8122B3E653A354ADFED1A9C0B8DD8C145CD',
        identityHash: '568479BCAF5746026273EF18D4C66F53F36F1337B2244FDA34206DE5BECB658E',
      }),
      normalization: {
        original_price_min: 80_000,
        original_price_max: 250_000,
        original_unit: 'per_item',
        quantity: 2,
        calculation: '2 cabinet hinges x published per-item range',
      },
      signals: verifiedSignals(),
    },
  ],
}

describe('Kael baseline price evidence', () => {
  it('accepts two independent fresh T1 sources only when their aggregate exactly reconciles to the baseline', () => {
    expect(validateBaselinePriceEvidence({
      baselinePriceMin: 140_000,
      baselinePriceMax: 375_000,
      document: verifiedEvidence,
      highValueThresholdVnd: 1_000_000,
      registryCitations: trustedCitations,
      now: new Date('2026-08-14T12:00:00.000Z'),
    })).toEqual({
      success: true,
      receipt: {
        schema_version: 'baseline_price_evidence_receipt.v1',
        accepted_source_count: 2,
        aggregate_price_min: 140_000,
        aggregate_price_max: 375_000,
        high_trust_source_count: 2,
        quorum_met: true,
        required_quorum: 2,
        unit: 'per_cabinet_door',
        sources: [
          expect.objectContaining({
            domain: 'suachuatainha.com.vn',
            effective_tier: 1,
          }),
          expect.objectContaining({
            domain: 'nhabepsaigon.vn',
            effective_tier: 1,
            normalization: {
              original_price_min: 80_000,
              original_price_max: 250_000,
              original_unit: 'per_item',
              quantity: 2,
              calculation: '2 cabinet hinges x published per-item range',
            },
          }),
        ],
      },
    })
  })

  it('fails closed when a stored baseline does not equal the source aggregate', () => {
    expect(validateBaselinePriceEvidence({
      baselinePriceMin: 240_000,
      baselinePriceMax: 360_000,
      document: verifiedEvidence,
      highValueThresholdVnd: 1_000_000,
      registryCitations: trustedCitations,
      now: new Date('2026-08-14T12:00:00.000Z'),
    })).toEqual({ success: false, error: 'baseline does not reconcile to source aggregate' })
  })

  it('treats a verification made on the current HCMC calendar date as non-future', () => {
    expect(validateBaselinePriceEvidence({
      baselinePriceMin: 140_000,
      baselinePriceMax: 375_000,
      document: verifiedEvidence,
      highValueThresholdVnd: 1_000_000,
      registryCitations: trustedCitations,
      now: new Date('2026-08-13T17:15:00.000Z'),
    }).success).toBe(true)
  })

  it('rejects source claims that have no immutable ledger and snapshot hashes', () => {
    expect(validateBaselinePriceEvidence({
      baselinePriceMin: 140_000,
      baselinePriceMax: 375_000,
      document: {
        ...verifiedEvidence,
        sources: verifiedEvidence.sources.map(({ verification: _verification, ...source }) => source),
      },
      highValueThresholdVnd: 1_000_000,
      registryCitations: trustedCitations,
      now: new Date('2026-08-14T12:00:00.000Z'),
    })).toEqual({ success: false, error: 'baseline price evidence invalid' })
  })

  it.each([
    [
      'duplicate domains',
      {
        ...verifiedEvidence,
        sources: [
          verifiedEvidence.sources[0],
          {
            ...verifiedEvidence.sources[0],
            url: 'https://suachuatainha.com.vn/another-price-page',
          },
        ],
      },
      'duplicate source domain',
    ],
    [
      'stale evidence',
      {
        ...verifiedEvidence,
        sources: verifiedEvidence.sources.map((source) => ({
          ...source,
          verification: {
            ...source.verification,
            source_published_at: '2024-01-01',
          },
        })),
      },
      'stale price evidence',
    ],
    [
      'mixed price units',
      {
        ...verifiedEvidence,
        sources: [
          verifiedEvidence.sources[0],
          {
            ...verifiedEvidence.sources[1],
            unit: 'per_item' as const,
            normalization: undefined,
          },
        ],
      },
      'mixed source units',
    ],
  ])('rejects %s', (_label, document, error) => {
    expect(validateBaselinePriceEvidence({
      baselinePriceMin: 140_000,
      baselinePriceMax: 375_000,
      document,
      highValueThresholdVnd: 1_000_000,
      registryCitations: trustedCitations,
      now: new Date('2026-08-14T12:00:00.000Z'),
    })).toEqual({ success: false, error })
  })

  it('requires three independent T1/T2 sources for a high-value baseline', () => {
    expect(validateBaselinePriceEvidence({
      baselinePriceMin: 140_000,
      baselinePriceMax: 375_000,
      document: verifiedEvidence,
      highValueThresholdVnd: 200_000,
      registryCitations: trustedCitations,
      now: new Date('2026-08-14T12:00:00.000Z'),
    })).toEqual({ success: false, error: 'trusted source quorum not met' })
  })

  it('accepts a high-value HCMC diagnostic baseline only with three fresh sources', () => {
    const diagnosticCitations: CitationValidationResult['accepted'] = [
      ['1fix.vn', 1],
      ['aloviecnha.com', 2],
      ['thoviet.com.vn', 2],
    ].map(([domain, autoTier]) => ({
      url: `https://${domain}/price`,
      domain: String(domain),
      matchedDomain: String(domain),
      tier: autoTier === 1 ? 'tier_1' as const : 'tier_2' as const,
      autoTier: Number(autoTier) as 1 | 2,
      trustScore: 0.8,
      effectiveTrustScore: 0.8,
      entityType: 'direct_service_provider',
      region: 'hcmc',
      criteriaMet: { A: true, B: true, C: true, D: true, E: true, F: true, G: true },
    }))
    const diagnosticEvidence: BaselinePriceEvidenceDocument = {
      schema_version: 'baseline_price_evidence.v1',
      sources: [
        ['1fix.vn', 500_000, 1_200_000, '2026-08-12'],
        ['aloviecnha.com', 800_000, 1_200_000, '2026-07-18'],
        ['thoviet.com.vn', 800_000, 1_200_000, '2026-08-01'],
      ].map(([domain, priceMin, priceMax, publishedAt]) => ({
        domain: String(domain),
        url: `https://${domain}/price`,
        observed_at: '2026-08-14',
        price_min: Number(priceMin),
        price_max: Number(priceMax),
        unit: 'per_visit' as const,
        verification: verifiedSource({
          publishedAt: String(publishedAt),
          priceHash: 'A'.repeat(64),
          identityHash: 'B'.repeat(64),
        }),
        signals: verifiedSignals(),
      })),
    }

    const result = validateBaselinePriceEvidence({
      baselinePriceMin: 700_000,
      baselinePriceMax: 1_200_000,
      document: diagnosticEvidence,
      highValueThresholdVnd: 1_000_000,
      registryCitations: diagnosticCitations,
      now: new Date('2026-08-14T12:00:00.000Z'),
    })

    expect(result).toMatchObject({
      success: true,
      receipt: {
        accepted_source_count: 3,
        aggregate_price_min: 700_000,
        aggregate_price_max: 1_200_000,
        required_quorum: 3,
        unit: 'per_visit',
      },
    })
  })
})

function verifiedSignals() {
  return {
    identity_verified: true,
    source_type: 'direct_pricing' as const,
    hcmc_relevant: true,
    clear_price_and_unit: true,
    integrity_verified: true,
    review_overdue: false,
    price_jump_suspected: false,
  }
}

function verifiedSource(input: {
  publishedAt: string
  priceHash: string
  identityHash: string
}) {
  return {
    source_published_at: input.publishedAt,
    verified_at: '2026-08-14',
    verified_by: 'codex_agentic_e2e_price_audit',
    ledger_ref: 'docs/foundation/source-trust-samples/price-baseline-hinge-20260814-ledger.json',
    price_snapshot_sha256: input.priceHash,
    identity_snapshot_sha256: input.identityHash,
  }
}
