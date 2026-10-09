import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import {
  hasVerifiedMarketQuorum,
  marketResultFromKnowledge,
  readPriceKnowledgeState,
  recordCaseKnowledge,
  recordPriceKnowledgeOutcome,
  researchFingerprint,
  type ActivePriceKnowledge,
  type PriceKnowledgeClient,
} from '../../../../../../supabase/functions/mobile-api/_shared/kael/evidence/live-price-knowledge'

export const PILLAR = {
  id: 'P344-kael-price-knowledge-reuse',
  invariant:
    'only a live lookup that met the Tier 1-2 quorum becomes reusable price knowledge, a stored result prices the next case without a provider call, a failed lookup is remembered without a price, and case knowledge never stores a photo reference',
  authority: [
    'governance/RULES.md #7 (autonomous Kael decisions are server-validated and audited)',
    'governance/RULES.md #8 (no fabricated price data)',
    'governance/RULES.md Multimodal Evidence Privacy',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/evidence/live-price-knowledge.ts',
  layer: 'unit',
  siblings: ['P343-kael-live-price-research', 'P337-kael-price-evidence-not-ready'],
  mutation:
    'drop the source_trust_quorum_met check in activeRowFromResult — a weak-quorum lookup is stored as active knowledge and the weak-quorum case turns red',
} as const satisfies PillarManifest

type Write = { table: string; op: 'insert' | 'update'; row: Record<string, unknown> }

function recordingClient(reads: Record<string, unknown> = {}) {
  const writes: Write[] = []
  const client: PriceKnowledgeClient = {
    from(table: string) {
      let pending: Write | null = null
      let statusFilter: unknown = null
      const query = {
        select: () => query,
        insert(row: unknown) {
          pending = { table, op: 'insert', row: row as Record<string, unknown> }
          writes.push(pending)
          return query
        },
        update(row: unknown) {
          pending = { table, op: 'update', row: row as Record<string, unknown> }
          writes.push(pending)
          return query
        },
        eq(column: string, value: unknown) {
          if (column === 'status') statusFilter = value
          return query
        },
        gt: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: () => query,
        then(resolve?: ((value: unknown) => unknown) | null) {
          const key = pending ? `${table}:write` : `${table}:${String(statusFilter ?? '')}`
          const data = pending ? { id: 'knowledge-1' } : reads[key] ?? reads[table] ?? null
          return Promise.resolve({ data, error: null }).then(resolve ?? undefined)
        },
      }
      return query as never
    },
  }
  return { client, writes }
}

function quorumResult(overrides: Record<string, unknown> = {}) {
  return {
    success: true as const,
    market: {
      market_range_min: 155_000,
      market_range_max: 310_000,
      confidence: 0.7,
      citations: ['https://1fix.vn/bang-gia', 'https://thoviet.com.vn/bang-gia'],
      sources: [],
    },
    provider: 'perplexity' as const,
    model: 'sonar',
    inputTokens: 900,
    outputTokens: 300,
    costUsd: 0.009,
    safeMetadata: {
      source_trust_quorum_met: true,
      source_trust_tier_1_2_count: 2,
      source_trust_required_quorum: 2,
      source_trust_aggregation_unit: 'per_repair_point',
      source_trust_accepted_sources: [
        { domain: '1fix.vn', price_min: 150_000, price_max: 300_000, unit: 'per_repair_point', date: '2026-09-20', auto_tier: 1 },
        { domain: 'thoviet.com.vn', price_min: 160_000, price_max: 320_000, unit: 'per_repair_point', date: '2026-09-01', auto_tier: 2 },
      ],
      ...overrides,
    },
  }
}

const ACTIVE: ActivePriceKnowledge = {
  id: 'knowledge-active',
  unit: 'per_repair_point',
  aggregateMin: 155_000,
  aggregateMax: 310_000,
  acceptedSourceCount: 2,
  highTrustSourceCount: 2,
  requiredQuorum: 2,
  sources: [
    { domain: '1fix.vn', url: 'https://1fix.vn/bang-gia', price_min: 150_000, price_max: 300_000, unit: 'per_repair_point', date: '2026-09-20', auto_tier: 1 },
    { domain: 'thoviet.com.vn', url: 'https://thoviet.com.vn/bang-gia', price_min: 160_000, price_max: 320_000, unit: 'per_repair_point', date: '2026-09-01', auto_tier: 2 },
  ],
  confidence: 0.7,
  reuseCount: 3,
  verifiedAt: '2026-10-08T00:00:00.000Z',
}

describe('P344 Kael price knowledge', () => {
  it('preserves the www host of a trusted source through storage and reuse', async () => {
    const { client, writes } = recordingClient()
    const result = quorumResult()
    result.market.citations[1] = 'https://www.thoviet.com.vn/bang-gia?tracking=1#price'
    result.market.citations.unshift('http://thoviet.com.vn/unsafe-first')
    await recordPriceKnowledgeOutcome(client, {
      serviceType: 'electrical', problemSlug: 'breaker_trip', serviceProblemId: null,
      fingerprint: 'd'.repeat(64), result, existingGap: null,
      now: new Date('2026-10-08T00:00:00.000Z'),
    })
    const sources = writes.find(write => write.op === 'insert')?.row.sources as ActivePriceKnowledge['sources']
    expect(sources[1].url, pillarWhy(PILLAR, 'the same trusted www citation must survive persistence')).toBe('https://www.thoviet.com.vn/bang-gia')
    const reused = marketResultFromKnowledge({ ...ACTIVE, sources })
    expect(reused.success && reused.safeMetadata?.source_trust_accepted_sources).toEqual(
      expect.arrayContaining([expect.objectContaining({ verified_domain: 'thoviet.com.vn', verified_url: 'https://www.thoviet.com.vn/bang-gia' })]),
    )
  })

  it.each(['https://thoviet.com.vn.attacker.example/prices', 'https://unknown.thoviet.com.vn/prices', 'http://www.thoviet.com.vn/prices', 'https://user:secret@www.thoviet.com.vn/prices'])(
    'does not expose an unverified or unsafe cached URL: %s', url => {
      const reused = marketResultFromKnowledge({ ...ACTIVE, sources: [ACTIVE.sources[0], { ...ACTIVE.sources[1], url }] })
      const sources = reused.success ? reused.safeMetadata?.source_trust_accepted_sources as Array<Record<string, unknown>> : []
      expect(sources[1]).not.toHaveProperty('verified_url')
    },
  )

  it('stores a quorum-backed lookup as active knowledge with its sources and an audit trail', async () => {
    const { client, writes } = recordingClient()
    const outcome = await recordPriceKnowledgeOutcome(client, {
      serviceType: 'electrical',
      problemSlug: 'breaker_trip',
      serviceProblemId: '76618460-1c99-4e42-bebc-49b8fa910903',
      fingerprint: 'a'.repeat(64),
      result: quorumResult(),
      existingGap: null,
      now: new Date('2026-10-08T00:00:00.000Z'),
    })
    expect(outcome.status).toBe('active')
    const inserted = writes.find((write) => write.op === 'insert')?.row
    expect(inserted, pillarWhy(PILLAR, 'a verified lookup must become reusable knowledge')).toMatchObject({
      status: 'active',
      unit: 'per_repair_point',
      aggregate_min: 155_000,
      aggregate_max: 310_000,
      accepted_source_count: 2,
      high_trust_source_count: 2,
      policy_id: 'kael.live_price_research.v1',
      safe_metadata: expect.objectContaining({ decision_actor: 'kael_system', reversible: true }),
    })
    expect((inserted?.sources as Array<{ url: string }>).map((source) => source.url)).toEqual([
      'https://1fix.vn/bang-gia',
      'https://thoviet.com.vn/bang-gia',
    ])
    expect(writes[0], pillarWhy(PILLAR, 'the previous active row is superseded before the new one lands')).toMatchObject({
      op: 'update',
      row: expect.objectContaining({ status: 'superseded' }),
    })
  })

  it('remembers a weak-quorum lookup as a gap, never as a price', async () => {
    const { client, writes } = recordingClient()
    const outcome = await recordPriceKnowledgeOutcome(client, {
      serviceType: 'electrical',
      problemSlug: 'breaker_trip',
      serviceProblemId: null,
      fingerprint: 'b'.repeat(64),
      // Two Tier 1-2 rows can still fail the quorum when the range crosses the high-value line.
      result: quorumResult({ source_trust_quorum_met: false }),
      existingGap: null,
    })
    expect(outcome.status, pillarWhy(PILLAR, 'a lookup that missed its quorum is not a price')).toBe('insufficient')
    const inserted = writes.find((write) => write.op === 'insert')?.row
    expect(inserted).toMatchObject({ status: 'insufficient', failure_reason: 'weak_quorum' })
    expect(inserted).not.toHaveProperty('aggregate_min')
  })

  it('prices the next case from stored knowledge with no provider cost', () => {
    const result = marketResultFromKnowledge(ACTIVE)
    expect(result, pillarWhy(PILLAR, 'a stored result must not buy another search')).toMatchObject({
      success: true,
      costUsd: 0,
      cacheStatus: 'hit',
      market: { market_range_min: 155_000, market_range_max: 310_000 },
    })
    expect(hasVerifiedMarketQuorum(result), pillarWhy(PILLAR, 'the evidence gate must accept reused knowledge')).toBe(true)
    expect(result.success && result.safeMetadata).toMatchObject({
      source_trust_accepted_source_count: 2,
      source_trust_tier_1_2_count: 2,
      kael_price_knowledge_result: 'hit',
    })
  })

  it('only restores a cached source link when its host matches the trusted source domain', () => {
    const result = marketResultFromKnowledge({
      ...ACTIVE,
      sources: [
        { ...ACTIVE.sources[0], url: 'https://untrusted.example/prices' },
        ACTIVE.sources[1],
      ],
    })
    const accepted = result.success
      ? result.safeMetadata?.source_trust_accepted_sources as Array<Record<string, unknown>> | undefined ?? []
      : []

    expect(accepted[0]).not.toHaveProperty('verified_url')
    expect(accepted[1]).toMatchObject({
      verified_domain: 'thoviet.com.vn',
      verified_url: 'https://thoviet.com.vn/bang-gia',
    })
  })

  it('never writes a reused result back as new knowledge', async () => {
    const { client, writes } = recordingClient()
    const outcome = await recordPriceKnowledgeOutcome(client, {
      serviceType: 'electrical',
      problemSlug: 'breaker_trip',
      serviceProblemId: null,
      fingerprint: 'c'.repeat(64),
      result: marketResultFromKnowledge(ACTIVE),
      existingGap: null,
    })
    expect(outcome.status).toBe('skipped')
    expect(writes).toHaveLength(0)
  })

  it('keys the gap cache on the evidence that can change the answer, not on the chat text', async () => {
    const first = await researchFingerprint({ serviceType: 'electrical', problemSlug: 'breaker_trip', photoCount: 1 })
    const sameEvidence = await researchFingerprint({ serviceType: 'electrical', problemSlug: 'breaker_trip', photoCount: 1 })
    const newPhoto = await researchFingerprint({ serviceType: 'electrical', problemSlug: 'breaker_trip', photoCount: 2 })
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(sameEvidence, pillarWhy(PILLAR, 'a follow-up question must not re-buy the same empty search')).toBe(first)
    expect(newPhoto, pillarWhy(PILLAR, 'a new photo is new evidence and earns a new search')).not.toBe(first)
  })

  it('reads active knowledge and the Vietnamese problem label for the next case', async () => {
    const { client } = recordingClient({
      service_problems: { id: 'problem-1', label_vi: 'Cầu dao trip' },
      'kael_price_knowledge:active': {
        id: 'knowledge-active',
        unit: 'per_repair_point',
        aggregate_min: 155_000,
        aggregate_max: 310_000,
        accepted_source_count: 2,
        high_trust_source_count: 2,
        required_quorum: 2,
        sources: ACTIVE.sources,
        reuse_count: 3,
        verified_at: '2026-10-08T00:00:00.000Z',
        safe_metadata: { confidence: 0.7 },
      },
      'kael_price_knowledge:insufficient': null,
      kael_case_knowledge: [{ finding: 'Aptomat cũ nhảy do quá tải' }],
    })
    const state = await readPriceKnowledgeState(client, 'electrical', 'breaker_trip')
    expect(state.problemLabelVi).toBe('Cầu dao trip')
    expect(state.active?.aggregateMin).toBe(155_000)
    expect(state.priorFindings).toEqual(['Aptomat cũ nhảy do quá tải'])
  })

  it('keeps photo references and personal details out of case knowledge', async () => {
    const { client, writes } = recordingClient()
    await recordCaseKnowledge(client, {
      serviceType: 'electrical',
      problemSlug: 'breaker_trip',
      analysis: {
        problem_identified: 'Aptomat cháy sém, gọi 0901234567 để hỏi',
        severity_indicators: ['cháy sém'],
        complexity_hint: 'small',
        recommended_scope: 'Thay 1 aptomat',
      },
      complexity: 'small',
      priceKnowledgeId: null,
    })
    const row = writes.find((write) => write.table === 'kael_case_knowledge')?.row ?? {}
    expect(Object.keys(row).some((key) => key.includes('media') || key.includes('photo') || key.includes('url')),
      pillarWhy(PILLAR, 'a finding must not point back to a customer photo')).toBe(false)
    expect(String(row.finding), pillarWhy(PILLAR, 'phone numbers read from a photo are scrubbed')).not.toContain('0901234567')
  })
})
