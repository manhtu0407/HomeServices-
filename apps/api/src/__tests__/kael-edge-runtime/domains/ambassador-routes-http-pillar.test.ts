import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
} from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P266-ambassador-edge-routes',
  invariant:
    'the ambassador routes act only for their own actor role, call the program RPCs through the service client keyed to the authenticated user, refuse a malformed or over-specified body before any RPC, turn every RPC refusal into a named 4xx, and fail a malformed RPC number with a 500 instead of showing the worker a zero',
  authority: [
    'governance/RULES.md #0, #7, #8',
    'supabase/migrations/20260928112000_ambassador_points_and_redemptions.sql',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/program/worker-ambassador.ts',
  layer: 'integration',
  siblings: ['P262-redemption-idempotent-balance-sql', 'P265-ambassador-contract-twins'],
  mutation:
    'replace workflowDb(ctx) with ctx.userSupabase in redeemAmbassadorMilestone, or map an unknown redeem error_code to a 200 — the service-client or named-refusal case turns red',
} as const satisfies PillarManifest

const WORKER = 'a2170000-0000-4000-8000-000000000001'
const CUSTOMER = 'a2170000-0000-4000-8000-000000000002'
const OPERATOR = 'a2170000-0000-4000-8000-000000000003'
const MILESTONE = '0b8a2f3e-4d7c-4e1a-9b2c-3d4e5f6a7b8c'
const REQUEST_ID = '11111111-1111-4111-8111-111111111111'

const program = {
  id: 'program-1', version: 1, status: 'approved', commission_vnd_per_point: 10000, customer_vnd_per_point: 10000,
  link_months: 12, network_window_days: 90, rebook_min_jobs: 2, invite_claim_days: 7,
  approved_at: '2026-09-25T00:00:00Z', updated_at: '2026-09-25T00:00:00Z',
  milestones: [{ id: MILESTONE, rank: 1, title_vi: 'Khởi động', title_en: 'Starter', points_required: 10, reward_vnd: 20000 }],
  multipliers: [{ min_active_customers: 5, multiplier_bps: 11000 }],
}

const summary = {
  program, referral_code: 'ABCD2345', points_milli: 12500, linked_customers: 3, active_customers: 2,
  multiplier_bps: 10000, redemption_frozen_until: null, network_frozen_until: null, tax_policy_ready: true,
  recent_entries: [], redemptions: [],
}

type RpcResults = Parameters<typeof makeSequenceClient>[1]

function setup(role: 'worker' | 'customer' | 'admin_operator', rpc: RpcResults, operatorCapabilities: string[] = []) {
  const service = makeSequenceClient([], rpc, {
    synthetic_matching_cohort_members: [{ data: null, error: null }, { data: null, error: null }],
    admin_operator_accounts: [{ data: { capabilities: operatorCapabilities, status: 'active' }, error: null }],
  })
  const user = makeSequenceClient([], {}, {})
  const id = role === 'worker' ? WORKER : role === 'customer' ? CUSTOMER : OPERATOR
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
  const rpcCalls = (client: ReturnType<typeof makeSequenceClient>, name: string) =>
    client.calls.filter((entry) => entry.table === `rpc:${name}`).flatMap((entry) => entry.operations)
  return { call, service, user, rpcCalls }
}

describe(`${PILLAR.id}: ambassador routes`, () => {
  installEdgeRuntimeTestHooks()

  it('reads the worker summary through the service client for the signed-in worker', async () => {
    const { call, service, user, rpcCalls } = setup('worker', { get_worker_ambassador_summary: [{ data: summary, error: null }] })
    const response = await call('GET', '/workers/me/ambassador')
    const body = await response.json()
    expect(response.status, pillarWhy(PILLAR, JSON.stringify(body))).toBe(200)
    expect(body).toMatchObject({ points_milli: 12500, referral_code: 'ABCD2345', program: { milestones: [{ reward_vnd: 20000 }] } })
    expect(rpcCalls(service, 'get_worker_ambassador_summary')).toContainEqual(['rpc', 'get_worker_ambassador_summary', { p_worker_id: WORKER }])
    expect(user.calls, pillarWhy(PILLAR, 'the caller-token client is never used')).toHaveLength(0)
  })

  it('fails a malformed point balance instead of reporting zero', async () => {
    const { call } = setup('worker', { get_worker_ambassador_summary: [{ data: { ...summary, points_milli: 'abc' }, error: null }] })
    const response = await call('GET', '/workers/me/ambassador')
    expect(response.status, pillarWhy(PILLAR, 'a malformed number is a server fault')).toBe(500)
    expect(await response.json()).toMatchObject({ code: 'DB_ERROR' })
  })

  it('redeems through the service client with the client request id', async () => {
    const receipt = { ok: true, error_code: null, redemption_id: 'r-1', reward_vnd: 20000, tax_withheld_vnd: 0, net_vnd: 20000, points_left_milli: 2500, replayed: false }
    const { call, service, rpcCalls } = setup('worker', { redeem_ambassador_milestone: [{ data: [receipt], error: null }] })
    const response = await call('POST', '/workers/me/ambassador/redemptions', { milestone_id: MILESTONE, client_request_id: REQUEST_ID })
    expect(response.status, pillarWhy(PILLAR, JSON.stringify(await response.clone().json()))).toBe(201)
    expect(await response.json()).toMatchObject({ net_vnd: 20000, replayed: false })
    expect(rpcCalls(service, 'redeem_ambassador_milestone')).toContainEqual(['rpc', 'redeem_ambassador_milestone', {
      p_worker_id: WORKER, p_milestone_id: MILESTONE, p_client_request_id: REQUEST_ID,
    }])
  })

  it.each([
    ['BONUS_TAX_POLICY_MISSING', 409, 'BONUS_TAX_POLICY_MISSING'],
    ['INSUFFICIENT_POINTS', 409, 'INSUFFICIENT_POINTS'],
    ['REDEMPTION_FROZEN', 409, 'REDEMPTION_FROZEN'],
    ['CLIENT_REQUEST_MISMATCH', 409, 'IDEMPOTENCY_CONFLICT'],
  ])('turns the %s refusal into a named %i', async (errorCode, status, code) => {
    const refusal = { ok: false, error_code: errorCode, redemption_id: null, reward_vnd: null, tax_withheld_vnd: null, net_vnd: null, points_left_milli: 0, replayed: false }
    const { call } = setup('worker', { redeem_ambassador_milestone: [{ data: [refusal], error: null }] })
    const response = await call('POST', '/workers/me/ambassador/redemptions', { milestone_id: MILESTONE, client_request_id: REQUEST_ID })
    expect(response.status, pillarWhy(PILLAR, errorCode)).toBe(status)
    expect(await response.json()).toMatchObject({ code })
  })

  it('refuses an over-specified redeem body before any RPC', async () => {
    const { call, service, rpcCalls } = setup('worker', {})
    const response = await call('POST', '/workers/me/ambassador/redemptions', {
      milestone_id: MILESTONE, client_request_id: REQUEST_ID, reward_vnd: 99999999,
    })
    expect(response.status, pillarWhy(PILLAR, 'the client cannot name an amount')).toBe(400)
    expect(rpcCalls(service, 'redeem_ambassador_milestone')).toHaveLength(0)
  })

  it('keeps worker and customer routes to their own role', async () => {
    const asCustomer = setup('customer', {})
    expect((await asCustomer.call('GET', '/workers/me/ambassador')).status).toBe(403)
    const asWorker = setup('worker', {})
    expect((await asWorker.call('POST', '/me/referral-claims', { code: 'ABCD2345' })).status).toBe(403)
  })

  it('claims an invite code for the signed-in customer', async () => {
    const { call, service, rpcCalls } = setup('customer', {
      claim_referral_code: [{ data: [{ outcome: 'LINKED', link_id: 'link-1', worker_id: WORKER }], error: null }],
    })
    const response = await call('POST', '/me/referral-claims', { code: ' abcd2345 ' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ outcome: 'LINKED', linked_worker_id: WORKER })
    expect(rpcCalls(service, 'claim_referral_code')).toContainEqual(['rpc', 'claim_referral_code', { p_customer_id: CUSTOMER, p_code: 'abcd2345' }])
  })

  it('refuses a Sub Admin without the bonus capability before any program RPC', async () => {
    const { call, service, rpcCalls } = setup('admin_operator', {}, ['workers.manage'])
    const response = await call('GET', '/admin/ambassador-program')
    expect(response.status, pillarWhy(PILLAR, 'workers.bonus.manage is required')).toBe(403)
    expect(rpcCalls(service, 'admin_get_ambassador_program')).toHaveLength(0)
  })

  it('reports an over-cap draft as 422, not a server error', async () => {
    const { call } = setup('admin_operator', {
      admin_save_ambassador_program_draft: [{ data: null, error: { code: '23514', message: 'AMBASSADOR_PROGRAM_INVALID' } }],
    }, ['workers.bonus.manage'])
    const response = await call('PUT', '/admin/ambassador-program/draft', {
      commission_vnd_per_point: 10000, customer_vnd_per_point: 10000, link_months: 12, network_window_days: 90,
      rebook_min_jobs: 2, invite_claim_days: 7, multipliers: [],
      milestones: [{ rank: 1, title_vi: 'Khởi động', title_en: 'Starter', points_required: 10, reward_vnd: 99000 }],
    })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ code: 'PROGRAM_INVALID' })
  })
})
