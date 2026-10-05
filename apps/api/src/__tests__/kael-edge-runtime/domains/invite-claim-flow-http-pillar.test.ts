import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
} from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P308-invite-claim-edge-flow',
  invariant:
    'the membership route passes the invite-claim status through unchanged, reads a summary without it as null so a newer Edge keeps working on an older database, fails an unknown status with a 500 instead of guessing, and the worker-code, customer-claim and membership routes carry one code from the worker to a linked customer through the service client of each signed-in actor',
  authority: [
    'governance/RULES.md #0, #8',
    'supabase/migrations/20261005100000_customer_membership_invite_claim_status.sql',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/program/customer-membership.ts',
  layer: 'integration',
  siblings: ['P266-ambassador-edge-routes', 'P307-customer-invite-claim-status-sql'],
  mutation:
    'make parseInviteClaim call malformed when the field is missing, or accept any status string — the older-database case or the unknown-status case turns red',
} as const satisfies PillarManifest

const WORKER = 'a3080000-0000-4000-8000-000000000001'
const CUSTOMER = 'a3080000-0000-4000-8000-000000000002'

type RpcResults = Parameters<typeof makeSequenceClient>[1]

function setup(role: 'worker' | 'customer', rpc: RpcResults) {
  const service = makeSequenceClient([], rpc, {
    synthetic_matching_cohort_members: [{ data: null, error: null }, { data: null, error: null }],
  })
  const user = makeSequenceClient([], {}, {})
  const id = role === 'worker' ? WORKER : CUSTOMER
  const handler = createMobileApiHandler({
    authenticate: async (_request, allowedRoles): Promise<MobileApiAuthResult> => {
      if (allowedRoles && !allowedRoles.includes(role)) {
        return { success: false, error: 'Bạn không có quyền thực hiện hành động này', status: 403 }
      }
      return { success: true, user: { id }, role, supabase: service, privilegedSupabase: service, userSupabase: user }
    },
    services: createEdgeServices({}),
  })
  const call = (method: string, path: string, body?: unknown) => handler(new Request(`https://edge.test${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'idempotency-key': 'mobile:11111111-1111-4111-8111-111111111111' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }))
  const rpcCalls = (name: string) =>
    service.calls.filter((entry) => entry.table === `rpc:${name}`).flatMap((entry) => entry.operations)
  return { call, rpcCalls, user }
}

const openClaim = { status: 'open', closes_at: '2026-10-12T00:00:00+00:00', claim_days: 7, link_months: 12 }

function membership(overrides: Record<string, unknown> = {}) {
  return {
    points: 0,
    customer_vnd_per_point: 10000,
    linked_worker: null,
    invite_claim: openClaim,
    recent_entries: [],
    ...overrides,
  }
}

describe(`${PILLAR.id}: invite claim through the Edge`, () => {
  installEdgeRuntimeTestHooks()

  it('passes the invite-claim status through for the signed-in customer', async () => {
    const { call, rpcCalls, user } = setup('customer', { get_customer_membership_summary: [{ data: membership(), error: null }] })
    const response = await call('GET', '/me/membership')
    const body = await response.json()
    expect(response.status, pillarWhy(PILLAR, JSON.stringify(body))).toBe(200)
    expect(body.invite_claim).toEqual(openClaim)
    expect(rpcCalls('get_customer_membership_summary')).toContainEqual(['rpc', 'get_customer_membership_summary', { p_customer_id: CUSTOMER }])
    expect(user.calls, pillarWhy(PILLAR, 'the caller-token client is never used')).toHaveLength(0)
  })

  it('reads a summary from the older database as an unknown claim status, not an error', async () => {
    const legacy: Record<string, unknown> = membership()
    delete legacy.invite_claim
    const { call } = setup('customer', { get_customer_membership_summary: [{ data: legacy, error: null }] })
    const response = await call('GET', '/me/membership')
    expect(response.status, pillarWhy(PILLAR, 'Edge may ship before the migration')).toBe(200)
    expect((await response.json()).invite_claim).toBeNull()
  })

  it('fails an unknown claim status instead of guessing', async () => {
    const { call } = setup('customer', {
      get_customer_membership_summary: [{ data: membership({ invite_claim: { ...openClaim, status: 'maybe' } }), error: null }],
    })
    const response = await call('GET', '/me/membership')
    expect(response.status, pillarWhy(PILLAR, 'an unknown status is a server fault')).toBe(500)
    expect(await response.json()).toMatchObject({ code: 'DB_ERROR' })
  })

  it('carries one code from the worker to a linked customer', async () => {
    const worker = setup('worker', { ensure_worker_referral_code: [{ data: 'ABCD2345', error: null }] })
    const created = await worker.call('POST', '/workers/me/ambassador/code', {})
    const { referral_code: code } = await created.json()
    expect(created.status, pillarWhy(PILLAR, 'the worker gets a code')).toBe(200)
    expect(worker.rpcCalls('ensure_worker_referral_code')).toContainEqual(['rpc', 'ensure_worker_referral_code', { p_worker_id: WORKER }])

    const customer = setup('customer', {
      claim_referral_code: [{ data: [{ outcome: 'LINKED', link_id: 'link-1', worker_id: WORKER }], error: null }],
      get_customer_membership_summary: [{
        data: membership({
          linked_worker: { worker_id: WORKER, display_name: 'Thợ Minh', source: 'invite_code', expires_at: '2027-10-05T00:00:00+00:00' },
          invite_claim: { ...openClaim, status: 'linked' },
        }),
        error: null,
      }],
    })
    const claimed = await customer.call('POST', '/me/referral-claims', { code })
    expect(await claimed.json()).toEqual({ outcome: 'LINKED', linked_worker_id: WORKER })
    expect(customer.rpcCalls('claim_referral_code')).toContainEqual(['rpc', 'claim_referral_code', { p_customer_id: CUSTOMER, p_code: 'ABCD2345' }])

    const after = await (await customer.call('GET', '/me/membership')).json()
    expect(after.invite_claim.status, pillarWhy(PILLAR, 'the claim shows as linked')).toBe('linked')
    expect(after.linked_worker).toMatchObject({ worker_id: WORKER, source: 'invite_code' })
  })
})
