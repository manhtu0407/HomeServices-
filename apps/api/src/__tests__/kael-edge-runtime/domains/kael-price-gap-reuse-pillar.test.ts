import { afterEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import {
  readPriceKnowledgeState,
  researchFingerprint,
  researchPhotoCount,
  type PriceKnowledgeClient,
} from '../../../../../../supabase/functions/mobile-api/_shared/kael/evidence/live-price-knowledge'
import { runKaelMarketResearchStage } from '../../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/stage-market-research'

export const PILLAR = {
  id: 'P362-kael-price-gap-reuse',
  invariant:
    'a recent price-research gap is found by the fingerprint of the evidence the whole case holds, so a text-only follow-up reuses the gap its earlier photo produced instead of buying the same empty search again',
  authority: [
    'governance/RULES.md #8 (no fabricated price; a known gap is reported, not re-searched)',
    'governance/RULES.md #10 (bounded provider calls)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/evidence/live-price-knowledge.ts',
  layer: 'unit',
  siblings: ['P344-kael-price-knowledge-reuse', 'P337-kael-price-evidence-not-ready'],
  mutation:
    'drop the research_fingerprint filter in readPriceKnowledgeState — the newest gap of other evidence is returned and the filter case turns red; key the fingerprint on prepared.photoUrls.length only — the text-only follow-up researches again and the stage case turns red',
} as const satisfies PillarManifest

type Row = Record<string, unknown>

// A PostgREST stand-in that honours eq/gt filters and the expires_at ordering the reader asks for.
function tableClient(tables: Record<string, Row[]>) {
  const client: PriceKnowledgeClient = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = []
      let single = false
      let descending = false
      const query = {
        select: () => query,
        insert: () => query,
        update: () => query,
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value)
          return query
        },
        gt(column: string, value: unknown) {
          filters.push((row) => String(row[column]) > String(value))
          return query
        },
        order(_column: string, options?: { ascending?: boolean }) {
          descending = options?.ascending === false
          return query
        },
        limit: () => query,
        maybeSingle() {
          single = true
          return query
        },
        then(resolve?: ((value: unknown) => unknown) | null) {
          const rows = (tables[table] ?? []).filter((row) => filters.every((keep) => keep(row)))
          if (descending) rows.sort((a, b) => String(b.expires_at).localeCompare(String(a.expires_at)))
          const data = single ? rows[0] ?? null : rows
          return Promise.resolve({ data, error: null }).then(resolve ?? undefined)
        },
      }
      return query as never
    },
  }
  return client
}

const NOW = new Date('2026-10-12T02:10:00.000Z')

function gapRow(id: string, fingerprint: string, expiresAt: string): Row {
  return {
    id,
    service_type: 'handyman',
    problem_slug: 'drill_or_mount_shelf',
    district_scope: 'hcmc_all',
    status: 'insufficient',
    research_fingerprint: fingerprint,
    failure_reason: 'insufficient_tier_1_2_quorum',
    demand_count: 1,
    expires_at: expiresAt,
    safe_metadata: { checked_source_count: 2, rejection_reasons: ['outlier_over_40_percent'] },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe(`${PILLAR.id}: a known gap is reused for the same case evidence`, () => {
  it('counts the photos the case already holds, not only the ones on this turn', async () => {
    expect(researchPhotoCount(0, 1), pillarWhy(PILLAR, 'text-only follow-up on a case with one photo')).toBe(1)
    expect(researchPhotoCount(2, 1)).toBe(2)
    expect(researchPhotoCount(0)).toBe(0)
    const photoTurn = await researchFingerprint({ serviceType: 'handyman', problemSlug: 'drill_or_mount_shelf', photoCount: researchPhotoCount(1, 1) })
    const textTurn = await researchFingerprint({ serviceType: 'handyman', problemSlug: 'drill_or_mount_shelf', photoCount: researchPhotoCount(0, 1) })
    expect(textTurn, pillarWhy(PILLAR, 'the follow-up must carry the photo turn fingerprint')).toBe(photoTurn)
  })

  it('returns the gap recorded for this evidence even when a newer gap belongs to other evidence', async () => {
    const withPhoto = await researchFingerprint({ serviceType: 'handyman', problemSlug: 'drill_or_mount_shelf', photoCount: 1 })
    const withoutPhoto = await researchFingerprint({ serviceType: 'handyman', problemSlug: 'drill_or_mount_shelf', photoCount: 0 })
    const client = tableClient({
      kael_price_knowledge: [
        gapRow('gap-photo', withPhoto, '2026-10-12T08:08:04.000Z'),
        gapRow('gap-text', withoutPhoto, '2026-10-12T08:09:38.000Z'),
      ],
    })
    const state = await readPriceKnowledgeState(client, 'handyman', 'drill_or_mount_shelf', withPhoto, NOW)
    expect(state.gap?.id, pillarWhy(PILLAR, 'the Production run hit the newer, unrelated gap and researched again')).toBe('gap-photo')
  })

  it('answers a text-only follow-up from the recorded gap without calling a provider', async () => {
    const providerCall = vi.fn(async () => new Response('{}', { status: 500 }))
    vi.stubGlobal('fetch', providerCall)
    const fingerprint = await researchFingerprint({ serviceType: 'handyman', problemSlug: 'drill_or_mount_shelf', photoCount: 1 })
    const client = tableClient({ kael_price_knowledge: [gapRow('gap-photo', fingerprint, '2026-10-12T08:08:04.000Z')] })
    const prepared = {
      input: { serviceType: 'handyman', problemChips: [], description: 'Kệ gỗ 30x20, 1kg', district: 'Quận 9', caseEvidencePhotoCount: 1 },
      supabase: client,
      secrets: {},
      district: 'Quận 9',
      description: 'Kệ gỗ 30x20, 1kg',
      photoUrls: [],
      stageLogs: [],
      progressTarget: undefined,
    }
    const stage = await runKaelMarketResearchStage(prepared as never, {
      serviceType: 'handyman',
      problemSlug: 'drill_or_mount_shelf',
      knowledgeContext: {} as never,
      analysis: { problem_identified: '', severity_indicators: [], complexity_hint: 'small', recommended_scope: null } as never,
      visionAnalyzed: false,
      complexity: 'small',
      knowledgeState: {
        serviceProblemId: 'problem-1',
        problemLabelVi: 'Khoan/lắp kệ',
        active: null,
        gap: {
          id: 'gap-photo',
          researchFingerprint: fingerprint,
          failureReason: 'insufficient_tier_1_2_quorum',
          demandCount: 1,
          checkedSourceCount: 2,
          rejectionReasons: ['outlier_over_40_percent'],
          expiresAt: '2026-10-12T08:08:04.000Z',
          referenceSources: [],
        },
        priorFindings: [],
      },
    })
    const result = stage.value?.kind === 'market' ? stage.value.result : null
    expect(result?.safeMetadata?.kael_price_knowledge_result, pillarWhy(PILLAR, 'the follow-up must be served from the gap')).toBe('recent_gap')
    expect(providerCall, pillarWhy(PILLAR, 'no provider may be reached for a known gap')).not.toHaveBeenCalled()
  })
})
