export function testBaselineEvidenceDocument() {
  return {
    schema_version: 'baseline_price_evidence.v1',
    sources: [
      {
        domain: 'suachuatainha.com.vn',
        url: 'https://suachuatainha.com.vn/thay-sua-ray-truot-ban-le-phu-kien-tu-go/',
        observed_at: '2026-08-14',
        price_min: 120000,
        price_max: 250000,
        unit: 'per_cabinet_door',
        verification: testVerifiedSource({
          sourcePublishedAt: '2025-12-14',
          priceHash: '251989BF6C0164DECCFAADEC460901340D68C90E1B98C9007D5FFB12F67BF35B',
          identityHash: 'F20C6FBCBC2183ED1A26CF38A2DC7F979711F1CA1C2A4EA146F41376C5161668',
        }),
        signals: testVerifiedSourceSignals(),
      },
      {
        domain: 'nhabepsaigon.vn',
        url: 'https://nhabepsaigon.vn/bao-gia-sua-tu-bep-moi-nhat',
        observed_at: '2026-08-14',
        price_min: 160000,
        price_max: 500000,
        unit: 'per_cabinet_door',
        verification: testVerifiedSource({
          sourcePublishedAt: '2026-06-04',
          priceHash: '0AB71E27B74DFBB137E15FBD611FB8122B3E653A354ADFED1A9C0B8DD8C145CD',
          identityHash: '568479BCAF5746026273EF18D4C66F53F36F1337B2244FDA34206DE5BECB658E',
        }),
        normalization: {
          original_price_min: 80000,
          original_price_max: 250000,
          original_unit: 'per_item',
          quantity: 2,
          calculation: '2 cabinet hinges x published per-item range',
        },
        signals: testVerifiedSourceSignals(),
      },
    ],
  }
}

function testVerifiedSourceSignals() {
  return {
    identity_verified: true,
    source_type: 'direct_pricing',
    hcmc_relevant: true,
    clear_price_and_unit: true,
    integrity_verified: true,
    review_overdue: false,
    price_jump_suspected: false,
  }
}

function testVerifiedSource(input: {
  sourcePublishedAt: string
  priceHash: string
  identityHash: string
}) {
  return {
    source_published_at: input.sourcePublishedAt,
    verified_at: '2026-08-14',
    verified_by: 'codex_agentic_e2e_price_audit',
    ledger_ref: 'docs/foundation/source-trust-samples/price-baseline-hinge-20260814-ledger.json',
    price_snapshot_sha256: input.priceHash,
    identity_snapshot_sha256: input.identityHash,
  }
}

export function testSourceTrustRegistryRows() {
  return ['suachuatainha.com.vn', 'nhabepsaigon.vn'].map((domain) => ({
    domain,
    tier: 'tier_1',
    auto_tier: 1,
    entity_type: 'direct_service_provider',
    region: 'hcmc',
    criteria_met: { A: true, B: true, C: true, D: true, E: true, F: true, G: true },
    trust_score: 1,
    last_reviewed_at: '2026-08-13T00:00:00.000Z',
    is_active: true,
    effective_until: null,
  }))
}
