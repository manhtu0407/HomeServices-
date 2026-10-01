import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from './pillar-manifest'
import * as shared from '../contracts/ambassador'
import * as edge from '../../../../supabase/functions/_shared/contracts/ambassador'

export const PILLAR = {
  id: 'P265-ambassador-contract-twins',
  invariant:
    'the shared and Edge ambassador request contracts are twins: every redeem, referral-claim and program-draft payload that one accepts the other accepts, and every payload one refuses the other refuses',
  authority: [
    'CLAUDE.md Architecture <-> Structure invariant 3 (contract twins change together)',
    'governance/RULES.md #7 (money-impacting input is validated at the Edge boundary)',
  ],
  target: 'supabase/functions/_shared/contracts/ambassador.ts',
  layer: 'static-type',
  siblings: ['P262-redemption-idempotent-balance-sql', 'P261-milestone-cap-sql'],
  mutation:
    'drop .strict() from the Edge ambassadorRedeemSchema, or widen multiplier_bps to 15000 in only one twin — the extra-field or out-of-range case disagrees and turns red',
} as const satisfies PillarManifest

const milestone = { rank: 1, title_vi: 'Khởi động', title_en: 'Starter', points_required: 10, reward_vnd: 20000 }
const program = {
  commission_vnd_per_point: 10000,
  customer_vnd_per_point: 10000,
  link_months: 12,
  network_window_days: 90,
  rebook_min_jobs: 2,
  invite_claim_days: 7,
  milestones: [milestone],
  multipliers: [{ min_active_customers: 5, multiplier_bps: 11000 }],
}

const cases: Array<[name: string, schema: 'ambassadorRedeemSchema' | 'referralClaimSchema' | 'ambassadorProgramDraftSchema', payload: unknown, accepted: boolean]> = [
  ['redeem valid', 'ambassadorRedeemSchema', { milestone_id: '0b8a2f3e-4d7c-4e1a-9b2c-3d4e5f6a7b8c', client_request_id: '11111111-1111-4111-8111-111111111111' }, true],
  ['redeem v1 request id', 'ambassadorRedeemSchema', { milestone_id: '0b8a2f3e-4d7c-4e1a-9b2c-3d4e5f6a7b8c', client_request_id: '11111111-1111-1111-8111-111111111111' }, false],
  ['redeem extra field', 'ambassadorRedeemSchema', { milestone_id: '0b8a2f3e-4d7c-4e1a-9b2c-3d4e5f6a7b8c', client_request_id: '11111111-1111-4111-8111-111111111111', reward_vnd: 1 }, false],
  ['claim valid', 'referralClaimSchema', { code: ' ABCD2345 ' }, true],
  ['claim too short', 'referralClaimSchema', { code: 'AB' }, false],
  ['program valid', 'ambassadorProgramDraftSchema', program, true],
  ['program multiplier above 1.2x', 'ambassadorProgramDraftSchema', { ...program, multipliers: [{ min_active_customers: 5, multiplier_bps: 12001 }] }, false],
  ['program multiplier of 1.0x', 'ambassadorProgramDraftSchema', { ...program, multipliers: [{ min_active_customers: 5, multiplier_bps: 10000 }] }, false],
  ['program without milestones', 'ambassadorProgramDraftSchema', { ...program, milestones: [] }, false],
  ['program fractional reward', 'ambassadorProgramDraftSchema', { ...program, milestones: [{ ...milestone, reward_vnd: 20000.5 }] }, false],
  ['program extra field', 'ambassadorProgramDraftSchema', { ...program, cap_bps: 9000 }, false],
]

describe(`${PILLAR.id}: shared and Edge ambassador contracts agree`, () => {
  it.each(cases)('%s', (_name, schema, payload, accepted) => {
    const sharedResult = shared[schema].safeParse(payload).success
    const edgeResult = edge[schema].safeParse(payload).success
    expect(sharedResult, pillarWhy(PILLAR, 'shared twin verdict')).toBe(accepted)
    expect(edgeResult, pillarWhy(PILLAR, 'Edge twin verdict')).toBe(accepted)
  })
})
