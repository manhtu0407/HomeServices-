import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { memoryDb } from '../harness/memory-db'
import { applyEvidenceGapRfqFallback } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/evidence-gap-fallback'
import { buildInitialDiagnosisScopeArtifact } from '../../../../../../supabase/functions/mobile-api/_shared/kael/contracts/artifact-contract'

export const PILLAR = {
  id: 'P365-kael-rfq-fallback-edge',
  invariant:
    'when an auto-quote case has no validated price and the active policy allows it, a customer request turns the case into an RFQ review awaiting the customer’s own rfq_request confirmation, records which policy allowed it, and never creates a job; without the policy, the gap or the required details it refuses',
  authority: [
    'governance/RULES.md #4 (worker quote path; no Kael price without evidence)',
    'governance/RULES.md #7 (customer confirms before matching; Kael decisions are server-validated)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/evidence-gap-fallback.ts',
  layer: 'unit',
  siblings: ['P366-kael-rfq-fallback-confirm-sql', 'P364-kael-evidence-gap-options'],
  mutation:
    'skip the evidence_unavailable_fallback check — the policy-disallows case turns red; skip the price-gap check — the no-gap case turns red; record quote_mode_fallback before order eligibility — the missing-detail case turns red',
} as const satisfies PillarManifest

const SESSION_ID = 'session-shelf'
const PROBLEM_ID = 'problem-shelf'

function policy(evidence: Record<string, unknown>, tierA = ['service_type', 'problem_slug', 'address_district', 'address_label', 'scheduled_at', 'description_min']) {
  return {
    id: 'policy-shelf-v3',
    version: 3,
    service_problem_id: PROBLEM_ID,
    status: 'active',
    quote_mode: 'kael_auto_quote',
    tier_a_fields: tierA,
    tier_b_slots: [],
    question_overrides: {},
    safety_requirements: ['handyman_structural_or_concealed_service_risk', 'handyman_specialist_boundary'],
    capability_requirements: ['safe_drilling_and_mounting'],
    evidence_requirements: {
      minimum_source_count: 2,
      minimum_high_trust_source_count: 2,
      requires_active_baseline: false,
      allow_live_market_evidence: true,
      ...evidence,
    },
  }
}

function seed(options: {
  evidence?: Record<string, unknown>
  quoteReadiness?: string
  scheduledAt?: string | null
} = {}) {
  const artifact = buildInitialDiagnosisScopeArtifact({
    serviceType: 'handyman',
    customerGoal: 'Khoan lắp kệ gỗ 30x20cm, nặng khoảng 1kg lên tường.',
  })
  return memoryDb({
    kael_chat_sessions: [{
      id: SESSION_ID,
      customer_id: 'customer-1',
      service_type: 'handyman',
      status: 'active',
      case_phase: 'analysis',
      total_turns: 9,
      total_cost_usd: 0,
      scheduled_at: options.scheduledAt === undefined ? '2026-10-13T02:00:00.000Z' : options.scheduledAt,
      diagnosis_scope: { ...artifact, facts: { ...artifact.facts, latest_customer_detail: 'Khoan lắp kệ gỗ 30x20cm, nặng khoảng 1kg lên tường.' } },
      safe_metadata: { address_district: 'Quận 1', address_label: 'Tòa S1', problem_chips: ['Khoan/lắp kệ'], language: 'vi' },
    }],
    kael_chat_turns: [{
      id: 'turn-9',
      session_id: SESSION_ID,
      turn_index: 9,
      role: 'kael',
      safe_metadata: {
        quote_readiness: options.quoteReadiness ?? 'validated_price_evidence_unavailable',
        service_problem_id: PROBLEM_ID,
        price_gap_reason: 'no_published_price',
        price_knowledge_id: 'knowledge-gap-1',
      },
    }],
    service_problems: [{ id: PROBLEM_ID, slug: 'drill_or_mount_shelf' }],
    service_intake_policies: [policy(options.evidence ?? { evidence_unavailable_fallback: 'rfq' })],
  })
}

function session(db: ReturnType<typeof memoryDb>) {
  return db.tables.kael_chat_sessions[0]
}

describe(`${PILLAR.id}: a worker quote is the honest way forward when no price is validated`, () => {
  it('prepares an RFQ review and records the policy that allowed it', async () => {
    const db = seed()
    const outcome = await applyEvidenceGapRfqFallback({
      client: db.client as never,
      sessionId: SESSION_ID,
      session: { ...session(db) },
      language: 'vi',
    })
    expect(outcome, pillarWhy(PILLAR, 'policy allows, gap recorded, details complete')).toEqual({ status: 'applied' })
    const metadata = session(db).safe_metadata as Record<string, Record<string, unknown>>
    expect(metadata.quote_mode_fallback, pillarWhy(PILLAR, 'the confirm RPC re-checks exactly this record')).toMatchObject({
      mode: 'rfq',
      policy_id: 'policy-shelf-v3',
      policy_version: 3,
      gap_reason: 'no_published_price',
      gap_knowledge_id: 'knowledge-gap-1',
      source: 'customer_request',
    })
    expect(metadata.intake_coverage, pillarWhy(PILLAR, 'the app confirms with rfq_request')).toMatchObject({
      quote_mode: 'rfq',
      confirmation_kind: 'rfq_request',
      order_eligible: true,
    })
    expect(session(db).status).toBe('estimate_ready')
    expect(session(db).case_phase).toBe('offer_review')
    expect(db.tables.jobs ?? [], pillarWhy(PILLAR, 'only the customer confirmation may create a job')).toHaveLength(0)
    const reply = db.tables.kael_chat_turns.at(-1)
    expect((reply?.safe_metadata as Record<string, unknown>).quote_readiness).toBe('worker_quote_or_inspection_ready')
  })

  it('refuses when the active policy does not allow a worker-quote fallback', async () => {
    const db = seed({ evidence: {} })
    const outcome = await applyEvidenceGapRfqFallback({ client: db.client as never, sessionId: SESSION_ID, session: { ...session(db) }, language: 'vi' })
    expect(outcome, pillarWhy(PILLAR, 'policy without evidence_unavailable_fallback')).toEqual({ status: 'not_eligible', reason: 'policy_disallows' })
    expect((session(db).safe_metadata as Record<string, unknown>).quote_mode_fallback).toBeUndefined()
  })

  it('refuses when the case is not in a price gap', async () => {
    const db = seed({ quoteReadiness: 'tier_a_incomplete' })
    const outcome = await applyEvidenceGapRfqFallback({ client: db.client as never, sessionId: SESSION_ID, session: { ...session(db) }, language: 'vi' })
    expect(outcome, pillarWhy(PILLAR, 'no validated-price gap was reported')).toEqual({ status: 'not_eligible', reason: 'no_price_gap' })
  })

  it('asks for the missing required detail instead of recording a fallback', async () => {
    const db = seed({ scheduledAt: null })
    const outcome = await applyEvidenceGapRfqFallback({ client: db.client as never, sessionId: SESSION_ID, session: { ...session(db) }, language: 'vi' })
    expect(outcome, pillarWhy(PILLAR, 'scheduled_at is a Tier A field')).toEqual({ status: 'needs_detail' })
    expect((session(db).safe_metadata as Record<string, unknown>).quote_mode_fallback).toBeUndefined()
    expect(session(db).status).toBe('active')
  })
})
