import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
} from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P270-discipline-edge-routes',
  invariant:
    'the discipline routes act only for their own actor role, reach the discipline RPCs through the service client keyed to the authenticated user, refuse a malformed body before any RPC, never show the accused worker the reporter statement, extend a withdrawal hold only with an authority reference, let a Sub Admin decide only with workers.discipline.manage, and turn every named RPC refusal into a precise 4xx instead of a 500',
  authority: [
    'governance/RULES.md #0, #7, #8',
    'governance/structures/do-not-build-now.md §21',
    'supabase/migrations/20260925122000_worker_discipline_decisions.sql',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/program/admin-discipline.ts',
  layer: 'integration',
  siblings: ['P267-no-penalty-without-admin-sql', 'P268-appeal-restores-exactly-sql', 'P266-ambassador-edge-routes'],
  mutation:
    'drop requireAdminCapability from decideAdminViolationCase, or remove CASE_ALREADY_DECIDED from NAMED_FAILURES — the capability or named-refusal case turns red',
} as const satisfies PillarManifest

const WORKER = 'a2210000-0000-4000-8000-000000000001'
const CUSTOMER = 'a2210000-0000-4000-8000-000000000002'
const OPERATOR = 'a2210000-0000-4000-8000-000000000003'
const CASE_ID = 'c2210000-0000-4000-8000-000000000001'
const JOB_ID = 'b2210000-0000-4000-8000-000000000001'

const violationCase = {
  id: CASE_ID, violation_code: 'off_app_dealing', level: 3, source: 'customer_report', statement: 'Thợ xin số riêng để làm ngoài app',
  status: 'confirmed', decision_deadline_at: '2026-09-28T00:00:00Z', decided_at: '2026-09-26T00:00:00Z',
  decision_reason: 'Có bằng chứng trong chat', appeal_status: 'none', appeal_deadline_at: '2999-01-01T00:00:00Z',
  suspended_pending_review: false, created_at: '2026-09-25T00:00:00Z',
  consequences: [{ entry_kind: 'points_forfeit', effective_until: null, restored: false, detail: { points_milli: 12000 } }],
}

const policy = { l1_matching_days: 7, l2_points_debit: 20, l2_network_freeze_days: 30, l3_freeze_days: 90, strike_window_months: 12, appeal_window_days: 7, withdrawal_hold_days: 90 }

type RpcResults = Parameters<typeof makeSequenceClient>[1]
type TableResults = Parameters<typeof makeSequenceClient>[2]

function setup(role: 'worker' | 'customer' | 'admin_operator', rpc: RpcResults, operatorCapabilities: string[] = [], tables: TableResults = {}) {
  const service = makeSequenceClient([], rpc, {
    synthetic_matching_cohort_members: [{ data: null, error: null }, { data: null, error: null }],
    admin_operator_accounts: [{ data: { capabilities: operatorCapabilities, status: 'active' }, error: null }],
    worker_discipline_policy: [{ data: policy, error: null }, { data: policy, error: null }],
    ...tables,
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
    headers: { 'content-type': 'application/json', 'idempotency-key': 'mobile:22222222-2222-4222-8222-222222222222' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }))
  const rpcCalls = (name: string) =>
    service.calls.filter((entry) => entry.table === `rpc:${name}`).flatMap((entry) => entry.operations)
  return { call, service, user, rpcCalls }
}

describe(`${PILLAR.id}: discipline routes`, () => {
  installEdgeRuntimeTestHooks()

  it('lists the signed-in worker\'s own cases through the service client', async () => {
    const { call, user, rpcCalls } = setup('worker', { get_worker_violations: [{ data: [violationCase], error: null }] })
    const response = await call('GET', '/workers/me/violations')
    const body = await response.json()
    expect(response.status, pillarWhy(PILLAR, JSON.stringify(body))).toBe(200)
    expect(body.cases[0]).toMatchObject({ id: CASE_ID, level: 3, consequences: [{ entry_kind: 'points_forfeit', restored: false }] })
    expect(body.policy, pillarWhy(PILLAR, 'the rules screen reads the live policy row')).toEqual(policy)
    expect(body.cases[0].statement, pillarWhy(PILLAR, 'the reporter statement never reaches the accused worker')).toBeNull()
    expect(rpcCalls('get_worker_violations')).toContainEqual(['rpc', 'get_worker_violations', { p_worker_id: WORKER }])
    expect(user.calls, pillarWhy(PILLAR, 'the caller-token client is never used')).toHaveLength(0)
  })

  it('fails a malformed case row instead of showing the worker a half case', async () => {
    const { call } = setup('worker', { get_worker_violations: [{ data: [{ ...violationCase, status: 'mystery' }], error: null }] })
    const response = await call('GET', '/workers/me/violations')
    expect(response.status, pillarWhy(PILLAR, 'an unknown status is a server fault')).toBe(500)
  })

  it('submits an appeal for the signed-in worker with the evidence paths', async () => {
    const path = `appeals/${WORKER}/${CASE_ID}/d2210000-0000-4000-8000-000000000001.jpg`
    const { call, rpcCalls } = setup('worker', {
      submit_violation_appeal: [{ data: { ...violationCase, appeal_status: 'submitted' }, error: null }],
    })
    const response = await call('POST', `/workers/me/violations/${CASE_ID}/appeal`, {
      reason: 'Tôi chỉ nhắn số để báo đến trễ, không hẹn làm ngoài app.', evidence_paths: [path],
    })
    expect(response.status, pillarWhy(PILLAR, JSON.stringify(await response.clone().json()))).toBe(200)
    const appealed = await response.json()
    expect(appealed).toMatchObject({ appeal_status: 'submitted' })
    expect(appealed.statement, pillarWhy(PILLAR, 'the appeal echo hides the reporter statement too')).toBeNull()
    expect(rpcCalls('submit_violation_appeal')).toContainEqual(['rpc', 'submit_violation_appeal', {
      p_worker_id: WORKER, p_case_id: CASE_ID, p_reason: 'Tôi chỉ nhắn số để báo đến trễ, không hẹn làm ngoài app.', p_evidence_paths: [path],
    }])
  })

  it('refuses a too-short appeal before any RPC', async () => {
    const { call, rpcCalls } = setup('worker', {})
    const response = await call('POST', `/workers/me/violations/${CASE_ID}/appeal`, { reason: 'oan', evidence_paths: [] })
    expect(response.status).toBe(400)
    expect(rpcCalls('submit_violation_appeal')).toHaveLength(0)
  })

  it('names a closed appeal window as 409, not a server error', async () => {
    const { call } = setup('worker', {
      submit_violation_appeal: [{ data: null, error: { code: 'P0001', message: 'APPEAL_WINDOW_CLOSED' } }],
    })
    const response = await call('POST', `/workers/me/violations/${CASE_ID}/appeal`, {
      reason: 'Tôi có bằng chứng cho thấy mình không vi phạm.', evidence_paths: [],
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'APPEAL_WINDOW_CLOSED' })
  })

  it('lets a customer report the worker on their own job, and only a customer', async () => {
    const { call, rpcCalls } = setup('customer', {
      create_worker_report: [{ data: { case_id: CASE_ID, level: 5, status: 'proposed' }, error: null }],
    })
    const response = await call('POST', `/jobs/${JOB_ID}/worker-reports`, { violation_code: 'theft', statement: 'Mất đồng hồ sau khi thợ về.' })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ case_id: CASE_ID, level: 5, status: 'proposed' })
    expect(rpcCalls('create_worker_report')).toContainEqual(['rpc', 'create_worker_report', {
      p_customer_id: CUSTOMER, p_job_id: JOB_ID, p_violation_code: 'theft', p_statement: 'Mất đồng hồ sau khi thợ về.',
    }])
    const asWorker = setup('worker', {})
    expect((await asWorker.call('POST', `/jobs/${JOB_ID}/worker-reports`, { violation_code: 'theft', statement: 'Mất đồng hồ sau khi thợ về.' })).status).toBe(403)
  })

  it('refuses a report code a customer cannot file', async () => {
    const { call, rpcCalls } = setup('customer', {})
    const response = await call('POST', `/jobs/${JOB_ID}/worker-reports`, { violation_code: 'late_arrival', statement: 'Thợ đến trễ mười phút.' })
    expect(response.status, pillarWhy(PILLAR, 'late arrival is a detector signal, not a customer report')).toBe(400)
    expect(rpcCalls('create_worker_report')).toHaveLength(0)
  })

  it('refuses a Sub Admin without the discipline capability before any decision RPC', async () => {
    const { call, rpcCalls } = setup('admin_operator', {}, ['workers.manage'])
    const response = await call('POST', `/admin/discipline/cases/${CASE_ID}/decision`, {
      decision: 'dismiss', reason: 'Không đủ bằng chứng.',
    })
    expect(response.status, pillarWhy(PILLAR, 'workers.discipline.manage is required')).toBe(403)
    expect(rpcCalls('admin_decide_violation_case')).toHaveLength(0)
  })

  it('records a dismissal with the admin as actor and no blocklist', async () => {
    const { call, rpcCalls } = setup('admin_operator', {
      admin_decide_violation_case: [{ data: { ...violationCase, status: 'dismissed' }, error: null }],
    }, ['workers.discipline.manage'])
    const response = await call('POST', `/admin/discipline/cases/${CASE_ID}/decision`, {
      decision: 'dismiss', reason: 'Không đủ bằng chứng.',
    })
    expect(response.status).toBe(200)
    expect(rpcCalls('admin_decide_violation_case')).toContainEqual(['rpc', 'admin_decide_violation_case', {
      p_actor_id: OPERATOR, p_case_id: CASE_ID, p_decision: 'dismiss', p_reason: 'Không đủ bằng chứng.', p_clawback_vnd: 0, p_blocklist: [],
    }])
  })

  it.each([
    ['CASE_ALREADY_DECIDED', 409, 'INVALID_STATUS'],
    ['CASE_NOT_FOUND', 404, 'NOT_FOUND'],
    ['NOT_A_CUSTOMER_REPORT', 400, 'VALIDATION'],
  ])('turns the %s refusal into a named %i', async (marker, status, code) => {
    const { call } = setup('admin_operator', {
      admin_decide_violation_case: [{ data: null, error: { code: 'P0001', message: marker } }],
    }, ['workers.discipline.manage'])
    const response = await call('POST', `/admin/discipline/cases/${CASE_ID}/decision`, {
      decision: 'fabricated_report', reason: 'Báo cáo không khớp dữ liệu.',
    })
    expect(response.status, pillarWhy(PILLAR, marker)).toBe(status)
    expect(await response.json()).toMatchObject({ code })
  })

  it('refuses a client-chosen consequence field before any RPC', async () => {
    const { call, rpcCalls } = setup('admin_operator', {}, ['workers.discipline.manage'])
    const response = await call('POST', `/admin/discipline/cases/${CASE_ID}/decision`, {
      decision: 'confirm', reason: 'Có bằng chứng rõ ràng.', points_debit: 999,
    })
    expect(response.status, pillarWhy(PILLAR, 'the level decides the consequence, not the request')).toBe(400)
    expect(rpcCalls('admin_decide_violation_case')).toHaveLength(0)
  })

  it('extends a withdrawal hold only with an authority reference and a bounded date', async () => {
    const holdUntil = '2027-03-01T00:00:00.000Z'
    const { call, rpcCalls } = setup('admin_operator', {
      admin_extend_withdrawal_hold: [{ data: { ...violationCase, level: 5 }, error: null }],
    }, ['workers.discipline.manage'])
    const refused = await call('POST', `/admin/discipline/cases/${CASE_ID}/hold-extension`, { hold_until: holdUntil })
    expect(refused.status, pillarWhy(PILLAR, 'no authority reference, no longer hold')).toBe(400)
    expect(rpcCalls('admin_extend_withdrawal_hold')).toHaveLength(0)
    const response = await call('POST', `/admin/discipline/cases/${CASE_ID}/hold-extension`, {
      authority_reference: 'CA-Q7-2026/118', hold_until: holdUntil,
    })
    expect(response.status, pillarWhy(PILLAR, JSON.stringify(await response.clone().json()))).toBe(200)
    expect(rpcCalls('admin_extend_withdrawal_hold')).toContainEqual(['rpc', 'admin_extend_withdrawal_hold', {
      p_actor_id: OPERATOR, p_case_id: CASE_ID, p_authority_reference: 'CA-Q7-2026/118', p_hold_until: holdUntil,
    }])
  })

  it('names a hold that cannot be extended as 409', async () => {
    const { call } = setup('admin_operator', {
      admin_extend_withdrawal_hold: [{ data: null, error: { code: 'P0001', message: 'HOLD_NOT_EXTENDABLE' } }],
    }, ['workers.discipline.manage'])
    const response = await call('POST', `/admin/discipline/cases/${CASE_ID}/hold-extension`, {
      authority_reference: 'CA-Q7-2026/118', hold_until: '2027-03-01T00:00:00.000Z',
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'INVALID_STATUS' })
  })

  it('rejects an unknown queue filter before any RPC', async () => {
    const { call, rpcCalls } = setup('admin_operator', {}, ['workers.discipline.manage'])
    const response = await call('GET', '/admin/discipline/cases?status=everything')
    expect(response.status).toBe(400)
    expect(rpcCalls('admin_list_violation_cases')).toHaveLength(0)
  })
})
