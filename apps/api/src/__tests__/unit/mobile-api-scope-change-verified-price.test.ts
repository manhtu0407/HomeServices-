import { describe, expect, it } from 'vitest'

import {
  resolveVerifiedScopeChangePrice,
  type BaselineCandidatesResult,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/tools/synthesis'
import {
  bindAcceptedScopeChangeWorkerQuote,
  buildScopeChangeWorkerQuote,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/job/scope-change/worker-quote'
import type { PricedScopeChangeEstimate } from '../../../../../supabase/functions/mobile-api/_shared/domains/job/scope-change/effects-contracts'

const baselineEvidence = {
  schema_version: 'baseline_price_evidence_receipt.v1',
  accepted_source_count: 2,
  aggregate_price_min: 140_000,
  aggregate_price_max: 375_000,
  high_trust_source_count: 2,
  quorum_met: true,
  required_quorum: 2,
  unit: 'per_cabinet_door',
  sources: [
    {
      domain: 'suachuatainha.com.vn',
      url: 'https://suachuatainha.com.vn/thay-sua-ray-truot-ban-le-phu-kien-tu-go/',
      observed_at: '2026-08-13',
      price_min: 120_000,
      price_max: 250_000,
      unit: 'per_cabinet_door',
      effective_tier: 1,
      weight: 1,
    },
    {
      domain: 'nhabepsaigon.vn',
      url: 'https://nhabepsaigon.vn/bao-gia-sua-tu-bep-moi-nhat',
      observed_at: '2026-08-13',
      price_min: 160_000,
      price_max: 500_000,
      unit: 'per_cabinet_door',
      effective_tier: 1,
      weight: 1,
      normalization: {
        original_price_min: 80_000,
        original_price_max: 250_000,
        original_unit: 'per_item',
        quantity: 2,
        calculation: '2 cabinet hinges x published per-item range',
      },
    },
  ],
} as const

const verifiedHingeCandidates: BaselineCandidatesResult = {
  success: true,
  serviceProblemId: 'problem-hinge-replacement',
  defaultComplexity: 'small',
  byComplexity: {
    small: {
      districtCode: 'hcmc_all',
      evidenceReceipt: baselineEvidence,
      priceMin: 140_000,
      priceMax: 375_000,
      source: 'multi_source_hcmc_cabinet_door_2026_08',
    },
  },
}

const verifiedDiagnosticEvidence = {
  schema_version: 'baseline_price_evidence_receipt.v1',
  accepted_source_count: 3,
  aggregate_price_min: 700_000,
  aggregate_price_max: 1_200_000,
  high_trust_source_count: 3,
  quorum_met: true,
  required_quorum: 3,
  unit: 'per_visit',
  sources: [
    {
      domain: '1fix.vn',
      url: 'https://1fix.vn/dich-vu-do-tim-ro-ri-nuoc-ro-ri-nuoc-am-nen-nha-am-tuong',
      observed_at: '2026-08-14',
      price_min: 500_000,
      price_max: 1_200_000,
      unit: 'per_visit',
      effective_tier: 1,
      weight: 1,
    },
    {
      domain: 'aloviecnha.com',
      url: 'https://www.aloviecnha.com/do-tim-ro-ri-nuoc',
      observed_at: '2026-08-14',
      price_min: 800_000,
      price_max: 1_200_000,
      unit: 'per_visit',
      effective_tier: 2,
      weight: 1,
    },
    {
      domain: 'thoviet.com.vn',
      url: 'https://thoviet.com.vn/do-nuoc-ri',
      observed_at: '2026-08-14',
      price_min: 800_000,
      price_max: 1_200_000,
      unit: 'per_visit',
      effective_tier: 2,
      weight: 1,
    },
  ],
} as const

const verifiedPipeRepairEvidence = {
  schema_version: 'baseline_price_evidence_receipt.v1',
  accepted_source_count: 2,
  aggregate_price_min: 150_000,
  aggregate_price_max: 375_000,
  high_trust_source_count: 2,
  quorum_met: true,
  required_quorum: 2,
  unit: 'per_repair_point',
  sources: [
    {
      domain: '1fix.vn',
      url: 'https://1fix.vn/dich-vu-sua-ong-nuoc-tai-nha',
      observed_at: '2026-08-14',
      price_min: 150_000,
      price_max: 400_000,
      unit: 'per_repair_point',
      effective_tier: 1,
      weight: 1,
    },
    {
      domain: 'kythuatdiennuochaphat.com',
      url: 'https://kythuatdiennuochaphat.com/tho-sua-dien-nuoc-phuong-long-phuoc',
      observed_at: '2026-08-14',
      price_min: 150_000,
      price_max: 350_000,
      unit: 'per_repair_point',
      effective_tier: 2,
      weight: 1,
    },
  ],
} as const

const verifiedPipeRepairCandidates: BaselineCandidatesResult = {
  success: true,
  serviceProblemId: 'problem-pipe-leak',
  defaultComplexity: 'medium',
  byComplexity: {
    medium: {
      districtCode: 'hcmc_all',
      evidenceReceipt: verifiedPipeRepairEvidence,
      priceMin: 150_000,
      priceMax: 375_000,
      source: 'multi_source_hcmc_hidden_pipe_repair_point_2026_08',
    },
  },
}

const verifiedEstimate = {
  baseline_evidence: baselineEvidence,
  baseline_source: 'multi_source_hcmc_cabinet_door_2026_08',
  baseline_used: 'handyman:replace_cabinet_hinges:small:hcmc_all',
  fallback_used: false,
  price_max: 258_000,
  price_min: 258_000,
  pricing_basis: {
    calculation: 'neutral midpoint of verified one-door scope 140000-375000 VND = 258000 VND',
    quantity: 1,
    unit: 'cabinet_door_scope',
    unit_price_max: 258_000,
    unit_price_min: 258_000,
  },
  reference_price_max: 375_000,
  reference_price_min: 140_000,
  selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
  stakeholder_balance: {
    commission_level: 1,
    commission_rate_bps: 1500,
    customer_confirmation_required: true,
    customer_total: 258_000,
    platform_fee: 38_700,
    worker_confirmation_required: true,
    worker_net: 219_300,
  },
} as unknown as PricedScopeChangeEstimate

describe('scope-change verified baseline pricing', () => {
  it('locks the total to the exact sourced baseline and records the two-hinge calculation', () => {
    const result = resolveVerifiedScopeChangePrice({
      candidates: verifiedHingeCandidates,
      commissionTier: { level: 1, rateBps: 1500 },
      complexity: 'small',
      district: 'Quận 7',
      pricingFactors: {
        accessCondition: 'normal',
        materialTier: 'standard',
        quantity: 2,
        secondaryDamage: 'none_confirmed',
      },
      problemSlug: 'replace_cabinet_hinges',
      serviceType: 'handyman',
    })

    expect(result).toEqual({
      success: true,
      baselineDistrict: 'hcmc_all',
      baselineEvidence,
      baselineSource: 'multi_source_hcmc_cabinet_door_2026_08',
      baselineUsed: 'handyman:replace_cabinet_hinges:small:hcmc_all',
      priceMin: 258_000,
      priceMax: 258_000,
      priceSource: 'verified_baseline',
      pricingBasis: {
        calculation: 'neutral midpoint of verified one-door scope 140000-375000 VND = 258000 VND',
        quantity: 1,
        unit: 'cabinet_door_scope',
        unitPriceMax: 258_000,
        unitPriceMin: 258_000,
      },
      pricingMode: 'full_scope_total',
      problemSlug: 'replace_cabinet_hinges',
      referencePriceMax: 375_000,
      referencePriceMin: 140_000,
      selectionRule: 'verified_neutral_midpoint_with_bilateral_confirmation',
      serviceProblemId: 'problem-hinge-replacement',
      stakeholderBalance: {
        commissionLevel: 1,
        commissionRateBps: 1500,
        customerConfirmationRequired: true,
        customerTotal: 258_000,
        platformFee: 38_700,
        workerConfirmationRequired: true,
        workerNet: 219_300,
      },
    })
  })

  it('adds the verified diagnostic visit and one repair point into one bilateral full-scope total', () => {
    const result = resolveVerifiedScopeChangePrice({
      candidates: verifiedPipeRepairCandidates,
      commissionTier: { level: 1, rateBps: 1500 },
      complexity: 'medium',
      district: 'Quận 7',
      originalScope: {
        evidenceReceipt: verifiedDiagnosticEvidence,
        priceMin: 700_000,
        priceMax: 1_200_000,
      },
      pricingFactors: {
        accessCondition: 'normal',
        materialTier: 'unknown',
        quantity: 1,
        secondaryDamage: 'none_confirmed',
      },
      problemSlug: 'pipe_leak',
      scopeExclusions: {
        materialsExcluded: true,
        surfaceFinishExcluded: true,
      },
      serviceType: 'plumbing',
    })

    expect(result).toMatchObject({
      success: true,
      priceMin: 1_213_000,
      priceMax: 1_213_000,
      referencePriceMin: 850_000,
      referencePriceMax: 1_575_000,
      pricingBasis: {
        calculation: 'verified diagnostic midpoint 700000-1200000 VND = 950000 VND + verified one-point repair labor midpoint 150000-375000 VND = 263000 VND; full accepted scope total = 1213000 VND',
        quantity: 1,
        unit: 'accepted_scope',
        unitPriceMin: 1_213_000,
        unitPriceMax: 1_213_000,
      },
      pricingComponents: [
        {
          kind: 'original_confirmed_scope',
          priceMin: 700_000,
          priceMax: 1_200_000,
          selectedPrice: 950_000,
          evidenceReceipt: verifiedDiagnosticEvidence,
        },
        {
          kind: 'approved_scope_change',
          priceMin: 150_000,
          priceMax: 375_000,
          selectedPrice: 263_000,
          evidenceReceipt: verifiedPipeRepairEvidence,
        },
      ],
      stakeholderBalance: {
        customerTotal: 1_213_000,
        platformFee: 181_950,
        workerNet: 1_031_050,
      },
    })
  })

  it.each([
    ['missing original verified receipt', undefined, { materialsExcluded: true, surfaceFinishExcluded: true }],
    ['materials included or ambiguous', { evidenceReceipt: verifiedDiagnosticEvidence, priceMin: 700_000, priceMax: 1_200_000 }, { materialsExcluded: false, surfaceFinishExcluded: true }],
    ['surface finishing included or ambiguous', { evidenceReceipt: verifiedDiagnosticEvidence, priceMin: 700_000, priceMax: 1_200_000 }, { materialsExcluded: true, surfaceFinishExcluded: false }],
  ] as const)('fails closed for pipe repair when %s', (_label, originalScope, scopeExclusions) => {
    expect(resolveVerifiedScopeChangePrice({
      candidates: verifiedPipeRepairCandidates,
      commissionTier: { level: 1, rateBps: 1500 },
      complexity: 'medium',
      district: 'Quận 7',
      originalScope,
      pricingFactors: {
        accessCondition: 'normal',
        materialTier: 'unknown',
        quantity: 1,
        secondaryDamage: 'none_confirmed',
      },
      problemSlug: 'pipe_leak',
      scopeExclusions,
      serviceType: 'plumbing',
    })).toMatchObject({ success: false })
  })

  it('fails closed when the AI classification has no exact complexity baseline', () => {
    expect(resolveVerifiedScopeChangePrice({
      candidates: verifiedHingeCandidates,
      commissionTier: { level: 1, rateBps: 1500 },
      complexity: 'medium',
      district: 'Quận 7',
      pricingFactors: {
        accessCondition: 'normal',
        materialTier: 'standard',
        quantity: 2,
        secondaryDamage: 'none_confirmed',
      },
      problemSlug: 'replace_cabinet_hinges',
      serviceType: 'handyman',
    })).toEqual({ success: false, error: 'no exact verified baseline' })
  })

  it('fails closed when the baseline has no source provenance', () => {
    expect(resolveVerifiedScopeChangePrice({
      candidates: {
        success: true,
        serviceProblemId: 'problem-hinge-replacement',
        defaultComplexity: 'small',
        byComplexity: {
          small: {
            districtCode: 'hcmc_all',
            priceMin: 240_000,
            priceMax: 360_000,
            source: null,
          },
        },
      },
      commissionTier: { level: 1, rateBps: 1500 },
      complexity: 'small',
      district: 'Quận 7',
      pricingFactors: {
        accessCondition: 'normal',
        materialTier: 'standard',
        quantity: 2,
        secondaryDamage: 'none_confirmed',
      },
      problemSlug: 'replace_cabinet_hinges',
      serviceType: 'handyman',
    })).toEqual({ success: false, error: 'baseline provenance missing' })
  })

  it('rejects a problem slug outside the selected service instead of normalizing it', () => {
    expect(resolveVerifiedScopeChangePrice({
      candidates: verifiedHingeCandidates,
      commissionTier: { level: 1, rateBps: 1500 },
      complexity: 'small',
      district: 'Quận 7',
      pricingFactors: {
        accessCondition: 'normal',
        materialTier: 'standard',
        quantity: 2,
        secondaryDamage: 'none_confirmed',
      },
      problemSlug: 'pipe_leak',
      serviceType: 'handyman',
    })).toEqual({ success: false, error: 'problem slug is outside selected service' })
  })

  it.each([
    [{ accessCondition: 'unknown', materialTier: 'standard', quantity: 2, secondaryDamage: 'none_confirmed' }, 'access condition is not confirmed'],
    [{ accessCondition: 'normal', materialTier: 'unknown', quantity: 2, secondaryDamage: 'none_confirmed' }, 'material tier is not confirmed'],
    [{ accessCondition: 'normal', materialTier: 'standard', quantity: 2, secondaryDamage: 'unknown' }, 'secondary damage is not ruled out'],
    [{ accessCondition: 'normal', materialTier: 'standard', quantity: 3, secondaryDamage: 'none_confirmed' }, 'scope quantity does not match baseline'],
  ] as const)('fails closed instead of choosing a price when a critical case fact is unresolved', (pricingFactors, error) => {
    expect(resolveVerifiedScopeChangePrice({
      candidates: verifiedHingeCandidates,
      commissionTier: { level: 1, rateBps: 1500 },
      complexity: 'small',
      district: 'Quận 7',
      pricingFactors,
      problemSlug: 'replace_cabinet_hinges',
      serviceType: 'handyman',
    })).toEqual({ success: false, error })
  })

  it('fails closed when the worker commission tier cannot be projected', () => {
    expect(resolveVerifiedScopeChangePrice({
      candidates: verifiedHingeCandidates,
      commissionTier: null,
      complexity: 'small',
      district: 'Quận 7',
      pricingFactors: {
        accessCondition: 'normal',
        materialTier: 'standard',
        quantity: 2,
        secondaryDamage: 'none_confirmed',
      },
      problemSlug: 'replace_cabinet_hinges',
      serviceType: 'handyman',
    })).toEqual({ success: false, error: 'worker commission tier unavailable' })
  })

  it('binds the exact worker-accepted quote to the customer receipt', () => {
    const quote = buildScopeChangeWorkerQuote({
      estimate: verifiedEstimate,
      expiresAt: '2026-08-13T08:15:00.000Z',
      incidentId: 'a7500000-0000-4000-8000-000000000011',
      jobId: 'a7500000-0000-4000-8000-000000000012',
      quoteId: 'a7500000-0000-4000-8000-000000000010',
    })

    expect(bindAcceptedScopeChangeWorkerQuote({
      estimate: verifiedEstimate,
      quoteId: quote.quote_id,
      storedQuote: quote,
      confirmedAt: '2026-08-13T08:05:00.000Z',
    })).toMatchObject({
      worker_price_confirmation: {
        confirmed: true,
        confirmed_at: '2026-08-13T08:05:00.000Z',
        quote_id: quote.quote_id,
      },
    })
  })

  it.each([
    ['changed customer total', { customer_total: 310_000 }],
    ['changed platform fee', { platform_fee: 40_000, worker_net: 260_000 }],
    ['changed commission tier', { commission_level: 2 }],
    ['changed source', { baseline_source: 'unverified-source' }],
  ])('rejects a worker confirmation when the %s no longer matches', (_label, change) => {
    const quote = buildScopeChangeWorkerQuote({
      estimate: verifiedEstimate,
      expiresAt: '2026-08-13T08:15:00.000Z',
      incidentId: 'a7500000-0000-4000-8000-000000000011',
      jobId: 'a7500000-0000-4000-8000-000000000012',
      quoteId: 'a7500000-0000-4000-8000-000000000010',
    })

    expect(bindAcceptedScopeChangeWorkerQuote({
      estimate: verifiedEstimate,
      quoteId: quote.quote_id,
      storedQuote: { ...quote, ...change },
      confirmedAt: '2026-08-13T08:05:00.000Z',
    })).toBeNull()
  })

  it('rejects an expired worker quote', () => {
    const quote = buildScopeChangeWorkerQuote({
      estimate: verifiedEstimate,
      expiresAt: '2026-08-13T08:15:00.000Z',
      incidentId: 'a7500000-0000-4000-8000-000000000011',
      jobId: 'a7500000-0000-4000-8000-000000000012',
      quoteId: 'a7500000-0000-4000-8000-000000000010',
    })

    expect(bindAcceptedScopeChangeWorkerQuote({
      estimate: verifiedEstimate,
      quoteId: quote.quote_id,
      storedQuote: quote,
      confirmedAt: quote.expires_at,
    })).toBeNull()
  })
})
