import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
} from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P280-compensation-edge-routes',
  invariant:
    'each side of a compensation negotiation acts only as itself: the customer opens and answers from the customer routes, the worker answers from the worker route, the role and actor id sent to the database come from the session, a counter without an amount is refused before any RPC, claim photos are issued and accepted only under the own case prefix of the customer, an admin reads the refund account and records a payout only with workers.discipline.manage, and a balance that cannot cover the amount is a named 409',
  authority: [
    'governance/RULES.md #0, #7, #8',
    'Tu 2026-09-28: compensation by agreement both sides accept; NestScout never advances money',
    'supabase/migrations/20260928126000_compensation_mediation.sql',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/program/compensation.ts',
  layer: 'integration',
  siblings: ['P281-compensation-mediation-sql', 'P270-discipline-edge-routes'],
  mutation:
    'send p_actor_role from the request body instead of the session role, or drop INSUFFICIENT_WORKER_BALANCE from NAMED_FAILURES — the role or balance case turns red',
} as const satisfies PillarManifest

const WORKER = 'a2310000-0000-4000-8000-000000000001'
const CUSTOMER = 'a2310000-0000-4000-8000-000000000002'
const OPERATOR = 'a2310000-0000-4000-8000-000000000003'
const CASE_ID = 'c2310000-0000-4000-8000-000000000001'
const NEGOTIATION_ID = 'd2310000-0000-4000-8000-000000000001'
const JOB_ID = 'b2310000-0000-4000-8000-000000000001'

const policy = { min_vnd: 10000, max_vnd: 50000000, response_days: 3, max_offers: 4 }
const negotiation = {
  id: NEGOTIATION_ID, case_id: CASE_ID, job_id: JOB_ID, violation_code: 'intentional_damage', worker_name: 'Thợ A',
  status: 'awaiting_worker', current_amount_vnd: 800000, respond_by: '2026-10-01T00:00:00Z', offers_left: 3,
  agreed_at: null, payout: null, evidence_paths: [`compensation/${'a2310000-0000-4000-8000-000000000002'}/${'c2310000-0000-4000-8000-000000000001'}/e2310000-0000-4000-8000-000000000001.jpg`],
  offers: [{ actor_role: 'customer', action: 'claim', amount_vnd: 800000, note: 'Vỡ bồn rửa, có hóa đơn thay mới', created_at: '2026-09-28T00:00:00Z' }],
}

type RpcResults = Parameters<typeof makeSequenceClient>[1]

function setup(role: 'worker' | 'customer' | 'admin_operator', rpc: RpcResults, operatorCapabilities: string[] = []) {
  const service = makeSequenceClient([], rpc, {
    synthetic_matching_cohort_members: [{ data: null, error: null }, { data: null, error: null }],
    admin_operator_accounts: [{ data: { capabilities: operatorCapabilities, status: 'active' }, error: null }],
  })
  const storageCalls: Array<[string, string, string]> = []
  Object.assign(service, {
    storage: {
      from(bucket: string) {
        return {
          async createSignedUrl(path: string) {
            storageCalls.push(['read', bucket, path])
            return { data: { signedUrl: `https://storage.test/${path}?read` }, error: null }
          },
          async createSignedUploadUrl(path: string) {
            storageCalls.push(['upload', bucket, path])
            return { data: { signedUrl: `https://storage.test/${path}?upload`, token: 'upload-token' }, error: null }
          },
        }
      },
    },
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
    headers: { 'content-type': 'application/json', 'idempotency-key': 'mobile:33333333-3333-4333-8333-333333333333' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }))
  const rpcCalls = (name: string) =>
    service.calls.filter((entry) => entry.table === `rpc:${name}`).flatMap((entry) => entry.operations)
  return { call, user, rpcCalls, storageCalls }
}

describe(`${PILLAR.id}: compensation routes`, () => {
  installEdgeRuntimeTestHooks()

  it('lists the signed-in customer\'s own eligible cases through the service client', async () => {
    const { call, user, rpcCalls } = setup('customer', {
      get_customer_compensation: [{ data: { policy, refund_account_ready: true, items: [{ case_id: CASE_ID, job_id: JOB_ID, violation_code: 'intentional_damage', worker_name: 'Thợ A', decided_at: '2026-09-27T00:00:00Z', negotiation: null }] }, error: null }],
    })
    const response = await call('GET', '/me/compensation')
    const body = await response.json()
    expect(response.status, pillarWhy(PILLAR, JSON.stringify(body))).toBe(200)
    expect(body).toMatchObject({ policy, refund_account_ready: true, items: [{ case_id: CASE_ID, negotiation: null }] })
    expect(rpcCalls('get_customer_compensation')).toContainEqual(['rpc', 'get_customer_compensation', { p_customer_id: CUSTOMER }])
    expect(user.calls, pillarWhy(PILLAR, 'the caller-token client is never used')).toHaveLength(0)
  })

  it('opens a claim with its photos and returns them behind signed read URLs', async () => {
    const { call, rpcCalls, storageCalls } = setup('customer', { open_compensation_claim: [{ data: negotiation, error: null }] })
    const photo = negotiation.evidence_paths[0]
    const response = await call('POST', `/me/compensation/cases/${CASE_ID}`, { amount_vnd: 800000, note: 'Vỡ bồn rửa, có hóa đơn thay mới', evidence_paths: [photo] })
    const body = await response.json()
    expect(response.status, pillarWhy(PILLAR, JSON.stringify(body))).toBe(201)
    expect(rpcCalls('open_compensation_claim')).toContainEqual(['rpc', 'open_compensation_claim', {
      p_customer_id: CUSTOMER, p_case_id: CASE_ID, p_amount_vnd: 800000, p_note: 'Vỡ bồn rửa, có hóa đơn thay mới', p_evidence_paths: [photo],
    }])
    expect(body.evidence).toEqual([{ path: photo, signed_url: `https://storage.test/${photo}?read` }])
    expect(storageCalls).toContainEqual(['read', 'discipline-evidence', photo])
  })

  it('refuses a fourth photo before any RPC', async () => {
    const { call, rpcCalls } = setup('customer', {})
    const response = await call('POST', `/me/compensation/cases/${CASE_ID}`, { amount_vnd: 800000, note: 'Vỡ bồn rửa, có hóa đơn thay mới', evidence_paths: ['a', 'b', 'c', 'd'] })
    expect(response.status).toBe(400)
    expect(rpcCalls('open_compensation_claim')).toHaveLength(0)
  })

  it('hands out upload URLs only under the signed-in customer and the case in the path', async () => {
    const { call, storageCalls } = setup('customer', {})
    const response = await call('POST', `/me/compensation/cases/${CASE_ID}/uploads`, { content_type: 'image/png' })
    const body = await response.json()
    expect(response.status, pillarWhy(PILLAR, JSON.stringify(body))).toBe(201)
    expect(body.path, pillarWhy(PILLAR, 'the claim RPC re-checks this prefix')).toMatch(new RegExp(`^compensation/${CUSTOMER}/${CASE_ID}/[0-9a-f-]{36}\\.png$`))
    expect(storageCalls[0]?.[0]).toBe('upload')
    const video = await call('POST', `/me/compensation/cases/${CASE_ID}/uploads`, { content_type: 'video/mp4' })
    expect(video.status, pillarWhy(PILLAR, 'claims take photos only')).toBe(400)
  })

  it('shows the admin the customer refund account only through the capability-checked payee route', async () => {
    const denied = setup('admin_operator', {}, ['workers.manage'])
    expect((await denied.call('GET', `/admin/discipline/compensation/${NEGOTIATION_ID}/payee`)).status).toBe(403)
    expect(denied.rpcCalls('admin_get_compensation_payee')).toHaveLength(0)
    const allowed = setup('admin_operator', {
      admin_get_compensation_payee: [{ data: { account: { bank_name: 'Vietcombank', account_holder_name: 'NGUYEN VAN KHACH', bank_account: '0123456789', verified: false } }, error: null }],
    }, ['workers.discipline.manage'])
    const response = await allowed.call('GET', `/admin/discipline/compensation/${NEGOTIATION_ID}/payee`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ account: { bank_name: 'Vietcombank', account_holder_name: 'NGUYEN VAN KHACH', bank_account: '0123456789', verified: false } })
    expect(allowed.rpcCalls('admin_get_compensation_payee')).toContainEqual(['rpc', 'admin_get_compensation_payee', { p_actor_id: OPERATOR, p_negotiation_id: NEGOTIATION_ID }])
  })

  it('refuses a counter offer without an amount before any RPC', async () => {
    const { call, rpcCalls } = setup('worker', {})
    const response = await call('POST', `/workers/me/compensation/${NEGOTIATION_ID}/response`, { action: 'counter' })
    expect(response.status).toBe(400)
    expect(rpcCalls('respond_compensation')).toHaveLength(0)
  })

  it('sends the session role and id, never a role from the request', async () => {
    const { call, rpcCalls } = setup('worker', {
      respond_compensation: [{ data: { ...negotiation, status: 'awaiting_customer', current_amount_vnd: 500000 }, error: null }],
    })
    const response = await call('POST', `/workers/me/compensation/${NEGOTIATION_ID}/response`, { action: 'counter', amount_vnd: 500000, note: 'Tôi chịu phần vật tư' })
    expect(response.status).toBe(200)
    expect(rpcCalls('respond_compensation'), pillarWhy(PILLAR, 'the worker answers as the worker')).toContainEqual(['rpc', 'respond_compensation', {
      p_actor_id: WORKER, p_actor_role: 'worker', p_negotiation_id: NEGOTIATION_ID, p_action: 'counter', p_amount_vnd: 500000, p_note: 'Tôi chịu phần vật tư',
    }])
    const smuggled = await call('POST', `/workers/me/compensation/${NEGOTIATION_ID}/response`, { action: 'accept', actor_role: 'customer' })
    expect(smuggled.status, pillarWhy(PILLAR, 'an extra role field is refused')).toBe(400)
  })

  it('keeps each side on its own routes', async () => {
    const asWorker = setup('worker', {})
    expect((await asWorker.call('POST', `/me/compensation/cases/${CASE_ID}`, { amount_vnd: 800000, note: 'Tự mở đề nghị bồi thường' })).status).toBe(403)
    const asCustomer = setup('customer', {})
    expect((await asCustomer.call('GET', '/workers/me/compensation')).status).toBe(403)
  })

  it('names a balance that cannot cover the amount as a 409', async () => {
    const { call } = setup('customer', {
      respond_compensation: [{ data: null, error: { code: 'P0001', message: 'INSUFFICIENT_WORKER_BALANCE' } }],
    })
    const response = await call('POST', `/me/compensation/${NEGOTIATION_ID}/response`, { action: 'accept' })
    expect(response.status, pillarWhy(PILLAR, 'NestScout never advances the difference')).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'INSUFFICIENT_BALANCE' })
  })

  it('records a payout only for an admin with the discipline capability', async () => {
    const denied = setup('admin_operator', {}, ['workers.manage'])
    const refused = await denied.call('POST', `/admin/discipline/compensation/${NEGOTIATION_ID}/paid`, { transfer_reference: 'VCB-123456' })
    expect(refused.status).toBe(403)
    expect(denied.rpcCalls('admin_record_compensation_paid')).toHaveLength(0)

    const allowed = setup('admin_operator', {
      admin_record_compensation_paid: [{ data: { ...negotiation, status: 'agreed', agreed_at: '2026-09-28T01:00:00Z', payout: { status: 'paid', amount_vnd: 500000, paid_at: '2026-09-28T02:00:00Z' } }, error: null }],
    }, ['workers.discipline.manage'])
    const response = await allowed.call('POST', `/admin/discipline/compensation/${NEGOTIATION_ID}/paid`, { transfer_reference: 'VCB-123456' })
    expect(response.status).toBe(200)
    expect(allowed.rpcCalls('admin_record_compensation_paid')).toContainEqual(['rpc', 'admin_record_compensation_paid', {
      p_actor_id: OPERATOR, p_negotiation_id: NEGOTIATION_ID, p_transfer_reference: 'VCB-123456',
    }])
  })

  it('fails a malformed negotiation row instead of showing half an offer', async () => {
    const { call } = setup('worker', {
      get_worker_compensation: [{ data: { policy, withdrawable_vnd: 900000, negotiations: [{ ...negotiation, status: 'haggling' }] }, error: null }],
    })
    expect((await call('GET', '/workers/me/compensation')).status).toBe(500)
  })
})
