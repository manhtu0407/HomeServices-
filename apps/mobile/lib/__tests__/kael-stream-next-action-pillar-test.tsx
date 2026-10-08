import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { isCustomerKaelStreamResult } from '../kael-stream-validation'

export const PILLAR = {
  id: 'P341-kael-stream-accepts-governed-next-actions',
  invariant:
    'a Kael Work stream result is accepted for every next action the server contract can send, including the governed intake actions (collect_required, rfq_review, inspection_review, offer_review, blocked, confirm_intake, reconcile_confirmation), and still rejects an unknown action',
  authority: [
    'governance/RULES.md #8 (a valid result must not surface as a failure)',
    'packages/shared/src/types/api-responses.ts KaelChatNextAction (the contract union)',
  ],
  target: 'apps/mobile/lib/kael-stream-validation.ts',
  layer: 'unit',
  siblings: ['P46-stage1-customer-intake-mode', 'P55-stage1-release-cohort-canary'],
  mutation:
    'drop rfq_review (or any governed action) from the next-action set — the worker-quote result is rejected and this case turns red',
} as const satisfies PillarManifest

const session = {
  id: 'c0000000-0000-4000-8000-0000000000a1',
  job_id: null,
  customer_id: '0b6f5c3e-1a2b-4c3d-8e9f-0a1b2c3d4e5a',
  service_type: 'electrical',
  status: 'estimate_ready',
  case_phase: 'offer_review',
  diagnosis_scope: null,
  scheduled_at: null,
  estimate: null,
  started_at: '2026-10-08T00:00:00.000Z',
  estimate_ready_at: null,
  total_turns: 0,
  total_cost_usd: 0,
  next_action: 'rfq_review',
}

describe('P341 stream result next actions', () => {
  it.each([
    'rfq_review', 'inspection_review', 'offer_review', 'collect_required',
    'blocked', 'confirm_intake', 'reconcile_confirmation',
  ])('accepts the governed action %s', (nextAction) => {
    withPillarContext(PILLAR, () => {
      expect(isCustomerKaelStreamResult({ session: { ...session, next_action: nextAction }, turns: [] })).toBe(true)
    }, 'a governed intake result must reach the screen instead of a generic failure')
  })

  it('still rejects an action outside the contract', () => {
    expect(isCustomerKaelStreamResult({ session: { ...session, next_action: 'wait' }, turns: [] })).toBe(false)
  })
})
