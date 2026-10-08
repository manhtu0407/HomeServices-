import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { synthesizePrice } from '../../../../../../supabase/functions/mobile-api/_shared/kael/tools/synthesis'
import { hasValidatedKaelPriceEvidence } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-evidence'
import { priceEvidenceGapReply } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/price-gap-reply'
import { serializeKaelEstimate } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/serialize'
import { buildEstimateCardOutput } from '../../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/output-pipeline'

export const PILLAR = {
  id: 'P345-kael-market-anchored-price',
  invariant:
    'when no governed baseline is verified, the customer price is the verified market aggregate and never a blend with an unsourced seed row; auto-quote accepts that live evidence only under the two high-trust source rule; verified source links survive Edge serialization; and a case without enough sources gets a specific, non-repeating explanation instead of a price',
  authority: [
    'governance/RULES.md #4 (auto-quote prices require a server-validated Kael policy decision)',
    'governance/RULES.md #8 (no fabricated price data, no silent degradation)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/tools/synthesis.ts',
  layer: 'unit',
  siblings: ['P343-kael-live-price-research', 'P344-kael-price-knowledge-reuse', 'P337-kael-price-evidence-not-ready'],
  mutation:
    'remove the marketAnchored branch in synthesizePrice — the verified 155k-310k range is blended with the 400k-900k seed row and the anchored case turns red; omit market_sources from serializePriceReasoningReceipt or allow an unsafe URL through it — the public source-link assertion turns red',
} as const satisfies PillarManifest

const VERIFIED_MARKET = {
  market_range_min: 155_400,
  market_range_max: 309_600,
  confidence: 0.7,
}

const LIVE_POLICY = {
  minimumSourceCount: 2,
  minimumHighTrustSourceCount: 2,
  requiresActiveBaseline: false,
  allowLiveMarketEvidence: true,
}

describe('P345 market-anchored price', () => {
  it('prices from the verified market aggregate when the baseline has no source receipt', () => {
    const price = synthesizePrice({
      baselineMin: 400_000,
      baselineMax: 900_000,
      market: VERIFIED_MARKET,
      complexityHint: 'small',
      marketAnchored: true,
    })
    expect(price, pillarWhy(PILLAR, 'an unsourced seed row must not move the customer price')).toEqual({
      price_min: 155_000,
      price_max: 310_000,
      confidence: 0.7,
    })
  })

  it('keeps the governed blend when the baseline itself is source-verified', () => {
    const price = synthesizePrice({
      baselineMin: 150_000,
      baselineMax: 300_000,
      market: VERIFIED_MARKET,
      complexityHint: 'medium',
    })
    expect(price.price_min).toBe(153_000)
    expect(price.price_max).toBe(305_000)
  })

  it('returns only verified market source links in the serialized estimate', () => {
    const estimate = {
      service_type: 'plumbing' as const,
      problem_category: 'pipe_leak',
      problem_summary: 'Rò nước dưới bồn rửa bếp.',
      complexity: 'small' as const,
      price_min: 155_000,
      price_max: 310_000,
      confidence: 0.7,
      advisory: null,
      disclaimer: 'Ước tính từ dữ liệu đã kiểm chứng.',
    }
    const card = buildEstimateCardOutput({
      estimate,
      baselineUsed: null,
      priceSource: 'perplexity_validated',
      marketEvidence: {
        acceptedSourceCount: 2,
        highTrustSourceCount: 2,
        quorumMet: true,
        sources: [{ domain: 'market-a.example', url: 'https://market-a.example/prices' }],
      },
      analysisEvidence: {
        photoCount: 0,
        videoFrameCount: 0,
        voiceTranscriptCount: 0,
        skipped: true,
      },
      visionAnalysis: {
        analysisStatus: 'not_provided',
        problemSummary: estimate.problem_summary,
        severityIndicators: [],
      },
    })
    card.card.price_reasoning_receipt.fairness.market_sources = [
      { domain: 'market-a.example', url: 'https://market-a.example/prices' },
      { domain: 'market-b.example', url: 'https://user:secret@market-b.example/prices' },
      { domain: 'market-c.example', url: 'http://market-c.example/prices' },
      { domain: 'market-d.example', url: 'https://market-d.example/prices?session=secret' },
      { domain: 'market-e.example', url: 'https://other.example/prices' },
      { domain: 'market-f.example', url: 'https://market-f.example/prices#fragment' },
    ]
    const serialized = serializeKaelEstimate(estimate, card)

    expect(
      serialized?.price_reasoning_receipt?.fairness.market_sources,
      pillarWhy(PILLAR, 'trusted source links must reach the customer estimate payload'),
    ).toEqual([{ domain: 'market-a.example', url: 'https://market-a.example/prices' }])
  })

  it('accepts live market evidence for auto-quote only with two high-trust sources', () => {
    const twoHighTrust = { acceptedSourceCount: 2, highTrustSourceCount: 2, quorumMet: true }
    const oneHighTrust = { acceptedSourceCount: 2, highTrustSourceCount: 1, quorumMet: true }
    expect(hasValidatedKaelPriceEvidence({ marketEvidence: twoHighTrust, requirements: LIVE_POLICY }),
      pillarWhy(PILLAR, 'a live two-source quorum is a valid auto-quote basis')).toBe(true)
    expect(hasValidatedKaelPriceEvidence({ marketEvidence: oneHighTrust, requirements: LIVE_POLICY }),
      pillarWhy(PILLAR, 'live evidence carries the stricter high-trust floor')).toBe(false)
    expect(hasValidatedKaelPriceEvidence({
      marketEvidence: twoHighTrust,
      requirements: { ...LIVE_POLICY, requiresActiveBaseline: true, allowLiveMarketEvidence: false },
    }), pillarWhy(PILLAR, 'a baseline-only policy still refuses market evidence')).toBe(false)
  })

  it('explains a missing price from what the search found and what would let Kael search again', () => {
    const reply = priceEvidenceGapReply({
      language: 'vi',
      stageLogs: [{
        stage: 'market',
        latencyMs: 10,
        success: false,
        fallbackUsed: true,
        safeMetadata: {
          source_trust_tier_1_2_count: 1,
          source_trust_source_rejections: [{ domain: '1fix.vn', reason: 'mixed_unit' }],
        },
      }] as never,
    })
    expect(reply.text, pillarWhy(PILLAR, 'the customer must hear the real reason')).toContain('đơn vị khác nhau')
    expect(reply.text, pillarWhy(PILLAR, 'the customer must hear how to unblock the case')).toContain('Kael sẽ tìm lại')
    expect(reply.text, pillarWhy(PILLAR, 'no number may appear without sources')).not.toMatch(/\d{3}\.?\d{3}\s?(?:đ|VND)/)
    expect(reply.metadata).toMatchObject({ price_gap_reason: 'mixed_units', price_gap_cached: false })
  })

  it('does not claim that a search finished when the market provider timed out', () => {
    const reply = priceEvidenceGapReply({
      language: 'vi',
      stageLogs: [{
        stage: 'market',
        latencyMs: 10,
        success: false,
        fallbackUsed: true,
        safeMetadata: { kael_price_knowledge_gap_reason: 'TIMEOUT' },
      }] as never,
    })

    expect(reply.text).toContain('chưa hoàn tất')
    expect(reply.text).not.toContain('đã tìm trong các bảng giá')
  })

  it('answers a follow-up from the remembered gap instead of repeating the first message', () => {
    const first = priceEvidenceGapReply({
      language: 'vi',
      stageLogs: [{ stage: 'market', latencyMs: 10, success: false, fallbackUsed: true, safeMetadata: {} }] as never,
    })
    const followUp = priceEvidenceGapReply({
      language: 'vi',
      stageLogs: [{
        stage: 'market',
        latencyMs: 1,
        success: false,
        fallbackUsed: true,
        safeMetadata: { kael_price_knowledge_result: 'recent_gap', kael_price_knowledge_gap_reason: 'insufficient_trusted_data' },
      }] as never,
    })
    expect(followUp.text, pillarWhy(PILLAR, 'the same canned sentence three times is the loop this fixes')).not.toBe(first.text)
    expect(followUp.text).toContain('kết quả chưa thay đổi')
    expect(followUp.metadata.price_gap_cached).toBe(true)
  })
})
