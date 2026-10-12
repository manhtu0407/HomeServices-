import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import {
  evidenceGapTurnContent,
  parseReferencePriceNote,
  referencePriceFromMarketMetadata,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/evidence-gap-response'
import { kaelNextActionsSchema } from '../../../../../../supabase/functions/_shared/contracts/kael-next-actions'

export const PILLAR = {
  id: 'P364-kael-evidence-gap-options',
  invariant:
    'a case without a validated price always gets next steps; a market reference is shown only from at least two real cited sources sharing one unit, carries the RULES #4 disclaimer and a not-a-quote notice, and never becomes an estimate',
  authority: [
    'governance/RULES.md #4 (price content carries the disclaimer)',
    'governance/RULES.md #8 (no fabricated price; real sources only)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/evidence-gap-response.ts',
  layer: 'unit',
  siblings: ['P337-kael-price-evidence-not-ready', 'P365-kael-rfq-fallback-edge'],
  mutation:
    'lower MIN_REFERENCE_SOURCES to 1 — the single-source case shows a number and turns red; drop the disclaimer from referencePriceText — the disclaimer case turns red; return [] from buildEvidenceGapNextActions — the next-steps case turns red',
} as const satisfies PillarManifest

const source = (domain: string, min: number, max: number, unit = 'per_item') => ({
  domain,
  verified_url: `https://${domain}/bang-gia`,
  price_min: min,
  price_max: max,
  unit,
  date: '2026-08-01',
})

const marketLog = (metadata: Record<string, unknown>) => [{
  stage: 'market' as const,
  latencyMs: 10,
  success: false,
  fallbackUsed: true,
  safeMetadata: { source_trust_aggregation_result: 'insufficient_tier_1_2_quorum', ...metadata },
}]

describe(`${PILLAR.id}: a price gap is a starting point, not a dead end`, () => {
  it('shows a labelled reference from two real sources sharing a unit, with the disclaimer', () => {
    const content = evidenceGapTurnContent({
      stageLogs: marketLog({
        source_trust_reference_sources: [
          source('thosuachua.vn', 150_000, 250_000),
          source('dichvu.vn', 200_000, 400_000),
          source('khac.vn', 90_000, 120_000, 'per_visit'),
        ],
      }),
      language: 'vi',
      rfqAvailable: true,
      hasPhoto: true,
    })
    expect(content.text, pillarWhy(PILLAR, 'reference range from the two per_item sources')).toContain('150.000–400.000 đ/món')
    expect(content.text, pillarWhy(PILLAR, 'RULES #4 disclaimer travels with any price content')).toContain('Đây là ước tính do Kael tính theo dữ liệu hiện có.')
    expect(content.text, pillarWhy(PILLAR, 'the customer must know it cannot be booked')).toContain('Đây không phải báo giá')
    expect(content.metadata.reference_price).toMatchObject({ price_min: 150_000, price_max: 400_000, unit: 'per_item', source_count: 2 })
    expect(content.metadata, pillarWhy(PILLAR, 'a reference is never an estimate')).not.toHaveProperty('estimate')
  })

  it('shows no number when fewer than two real sources agree on a unit', () => {
    const single = referencePriceFromMarketMetadata({
      source_trust_reference_sources: [source('thosuachua.vn', 150_000, 250_000), source('khac.vn', 90_000, 120_000, 'per_visit')],
    })
    expect(single, pillarWhy(PILLAR, 'one source per unit is not a reference')).toBeNull()
    const content = evidenceGapTurnContent({ stageLogs: marketLog({}), language: 'vi', rfqAvailable: false, hasPhoto: false })
    expect(content.metadata).not.toHaveProperty('reference_price')
    expect(content.text).not.toMatch(/\d{2,3}\.000/)
  })

  it('always offers next steps, and a worker quote only when the policy allows it', () => {
    const withRfq = evidenceGapTurnContent({ stageLogs: marketLog({}), language: 'vi', rfqAvailable: true, hasPhoto: false })
    const kinds = (withRfq.metadata.next_actions as Array<{ kind: string }>).map((action) => action.kind)
    expect(kinds, pillarWhy(PILLAR, 'the dead end in Production had no action at all')).toEqual(['request_worker_quote', 'attach_photo', 'provide_detail', 'ask_question'])
    expect(kaelNextActionsSchema.safeParse(withRfq.metadata.next_actions).success).toBe(true)
    expect(withRfq.text).toContain('thợ phù hợp xem ảnh và báo giá')
    const withoutRfq = evidenceGapTurnContent({ stageLogs: marketLog({}), language: 'en', rfqAvailable: false, hasPhoto: true })
    expect((withoutRfq.metadata.next_actions as Array<{ kind: string }>).map((action) => action.kind)).toEqual(['provide_detail', 'ask_question'])
  })

  it('rejects a stored reference that does not meet the same bar', () => {
    expect(parseReferencePriceNote({ price_min: 1, price_max: 2, unit: 'per_item', source_count: 1 })).toBeNull()
    expect(parseReferencePriceNote({ price_min: 5, price_max: 2, unit: 'per_item', source_count: 2 })).toBeNull()
    expect(parseReferencePriceNote({ price_min: 1, price_max: 2, unit: 'per_hour', source_count: 2 })).toBeNull()
  })
})
