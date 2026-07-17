import { describe, expect, it } from 'vitest'
import { classifySourceTrustTier } from '../../../../../supabase/functions/mobile-api/_shared/kael/source-trust/source-tier-rulebook'

const trustedDirectEvidence = {
  knownSource: true,
  blocked: false,
  identityVerified: true,
  sourceType: 'direct_pricing' as const,
  hcmcRelevant: true,
  clearPriceAndUnit: true,
  priceAgeMonths: 6,
  integrityVerified: true,
  evidenceVerified: true,
  reviewOverdue: false,
  priceJumpSuspected: false,
}

describe('Kael source-trust rulebook', () => {
  it('classifies the T1–T5 evidence decision table deterministically', () => {
    expect(classifySourceTrustTier(trustedDirectEvidence)).toMatchObject({ tier: 1, legacyTier: 'tier_1' })
    expect(classifySourceTrustTier({
      ...trustedDirectEvidence,
      sourceType: 'materials',
      hcmcRelevant: false,
    })).toMatchObject({ tier: 2, legacyTier: 'tier_2' })
    expect(classifySourceTrustTier({
      ...trustedDirectEvidence,
      sourceType: 'reference',
      hcmcRelevant: false,
      clearPriceAndUnit: false,
      integrityVerified: false,
      evidenceVerified: false,
      priceAgeMonths: 18,
    })).toMatchObject({ tier: 3, legacyTier: 'tier_3' })
    expect(classifySourceTrustTier({
      ...trustedDirectEvidence,
      clearPriceAndUnit: false,
    })).toMatchObject({ tier: 4, legacyTier: 'tier_3' })
    expect(classifySourceTrustTier({
      ...trustedDirectEvidence,
      knownSource: false,
    })).toMatchObject({ tier: 5, legacyTier: 'blocked' })
  })

  it('ignores an LLM-claimed T1 label when the evidence is quarantined', () => {
    const claimed = {
      ...trustedDirectEvidence,
      knownSource: false,
      claimedTier: 1,
    }

    expect(classifySourceTrustTier(claimed)).toMatchObject({
      tier: 5,
      reasons: expect.arrayContaining(['UNKNOWN_SOURCE_QUARANTINED']),
    })
  })

  it('degrades expired reviews and suspicious price jumps before a source can influence pricing', () => {
    expect(classifySourceTrustTier({
      ...trustedDirectEvidence,
      reviewOverdue: true,
    })).toMatchObject({ tier: 2, reasons: ['REVIEW_OVERDUE_DEGRADED'] })

    expect(classifySourceTrustTier({
      ...trustedDirectEvidence,
      priceJumpSuspected: true,
    })).toMatchObject({ tier: 4, reasons: ['PRICE_JUMP_QUARANTINED'] })
  })
})
