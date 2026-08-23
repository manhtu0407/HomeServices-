import { describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  draftAdminIntakePolicy,
  previewAdminIntakePolicy,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/admin/policy-governance'
import { hasValidatedKaelPriceEvidence } from '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/estimate-support'

export const PILLAR = {
  id: 'P51-admin-intake-policy-governance',
  invariant:
    'Admin policy writes carry an actor, reason, optimistic revision, and evidence threshold through the service-role RPC; preview stays honest and auto-quote enforces the active baseline threshold',
  authority: [
    'governance/RULES.md #7 (validated server decisions and audit metadata)',
    'governance/RULES.md #8 (no fake price or silent success)',
    'governance/structures/admin-workflow.md (pricing controls remain auditable and reversible)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/admin/policy-governance.ts',
  layer: 'security-negative',
  siblings: ['P34-admin-finance-bank-reference'],
  mutation:
    'drop expected_revision or actor_id from the draft RPC arguments, or return a numeric preview price; the transport or honesty assertion turns red',
} as const satisfies PillarManifest

function ownerContext(rpc: ReturnType<typeof vi.fn>) {
  return {
    role: 'admin',
    supabase: { rpc },
    user: { id: '11111111-1111-4111-8111-111111111111' },
  } as never
}

const draft = {
  capability_requirements: ['electrical_fault_isolation'],
  expected_revision: 3,
  evidence_requirements: {
    minimum_high_trust_source_count: 0,
    minimum_source_count: 0,
    requires_active_baseline: false,
  },
  problem_id: '22222222-2222-4222-8222-222222222222',
  question_overrides: {
    breaker_state: { en: 'What is the breaker state?', vi: 'Aptomat đang ở trạng thái nào?' },
  },
  quote_mode: 'rfq' as const,
  reason: 'Chuyển ca mất điện sang mời thợ báo giá.',
  safety_requirements: ['electrical_immediate_hazard'],
  tier_a_fields: ['service_type', 'problem_slug', 'address_district', 'scheduled_at', 'description_min'],
  tier_b_slots: [{ enabled: true, key: 'breaker_state', required_for_quote: false }],
}

describe('P51 Admin intake policy governance', () => {
  it('binds owner identity, reason, and optimistic revision to the draft RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        id: '33333333-3333-4333-8333-333333333333',
        revision: 4,
        status: 'draft',
        version: 2,
      }],
      error: null,
    }))

    await draftAdminIntakePolicy(ownerContext(rpc), draft)

    expect(rpc, pillarWhy(PILLAR, 'the Edge boundary must use the atomic service-role RPC')).toHaveBeenCalledWith(
      'admin_draft_service_intake_policy',
      expect.objectContaining({
        p_actor_id: '11111111-1111-4111-8111-111111111111',
        p_expected_revision: 3,
        p_evidence_requirements: draft.evidence_requirements,
        p_reason: draft.reason,
      }),
    )
  })

  it('derives preview completeness from policy fields and never returns a price', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        capability_requirements: draft.capability_requirements,
        evidence_requirements: draft.evidence_requirements,
        policy_id: '33333333-3333-4333-8333-333333333333',
        problem_slug: 'power_outage_one_room',
        quote_mode: 'rfq',
        revision: 4,
        safety_requirements: draft.safety_requirements,
        service_type: 'electrical',
        tier_a_fields: draft.tier_a_fields,
        tier_b_slots: draft.tier_b_slots,
        version: 2,
      }],
      error: null,
    }))

    const result = await previewAdminIntakePolicy(ownerContext(rpc), {
      problem_id: draft.problem_id,
      provided_fields: ['service_type', 'problem_slug', 'address_district'],
      provided_slots: [],
      version: 2,
    })

    expect(result.missing_tier_a, pillarWhy(PILLAR, 'the preview names blockers instead of claiming readiness')).toEqual([
      'scheduled_at',
      'description_min',
    ])
    expect(result.missing_tier_b, pillarWhy(PILLAR, 'optional enrichment stays visible but does not become a price')).toEqual([
      'breaker_state',
    ])
    expect(result.order_eligible).toBe(false)
    expect(result.evidence_requirements).toEqual(draft.evidence_requirements)
    expect(JSON.stringify(result), pillarWhy(PILLAR, 'RFQ preview must not fabricate price_min or price_max')).not.toMatch(/price_(?:min|max)/)
  })

  it('does not let generic market quorum bypass an active-baseline policy', () => {
    expect(hasValidatedKaelPriceEvidence({
      baselineEvidence: null,
      marketEvidence: {
        acceptedSourceCount: 3,
        highTrustSourceCount: 2,
        quorumMet: true,
      },
      requirements: {
        minimumSourceCount: 2,
        minimumHighTrustSourceCount: 1,
        requiresActiveBaseline: true,
      },
    }), pillarWhy(PILLAR, 'policy evidence locks are runtime gates, not Admin-only display metadata')).toBe(false)
  })
})
