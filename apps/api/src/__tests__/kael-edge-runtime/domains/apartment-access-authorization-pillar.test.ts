import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { projectAddressAccess } from '../../../../../../supabase/functions/mobile-api/_shared/domains/worker/apartment-access'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P128-apartment-access-authorization',
  invariant: 'Only the owning Customer can authorize the exact current worker check-in through one atomic command and a validated receipt',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8', 'governance/RULES.md #9'],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/apartment-access.ts',
  layer: 'integration',
  siblings: ['P127-worker-brief-recovery'],
  mutation: 'Ignore the expected check-in and use the legacy job-id-only update; stale intent succeeds without an atomic receipt',
} as const satisfies PillarManifest

const JOB = 'c1280000-0000-4000-8000-000000000001'
const CUSTOMER = 'c1280000-0000-4000-8000-000000000002'
const WORKER = 'c1280000-0000-4000-8000-000000000003'
const CHECK_IN = '2026-09-08T01:00:00.000Z'
const intent = { expected_worker_id: WORKER, expected_check_in_at: CHECK_IN }
const receipt = { ok: true, error_code: null, job_id: JOB, worker_id: WORKER,
  checked_in_at: CHECK_IN, authorized_at: '2026-09-08T01:01:00.000Z', already_authorized: false }

function setup(result: unknown = [receipt], role: 'customer' | 'worker' | 'admin' = 'customer', error = false) {
  const client = makeSequenceClient([], {
    authorize_apartment_access_atomic: [error
      ? { data: null, error: { code: 'DB_TIMEOUT', message: 'SECRET_DATABASE_DETAILS' } }
      : { data: result, error: null }],
  }, { jobs: [{ data: { id: JOB, customer_id: CUSTOMER, worker_id: WORKER, status: 'arrived',
    apartment_access_state: { worker_checked_in: true,
      check_in: { worker_id: WORKER, checked_in_at: CHECK_IN } } }, error: null },
    { data: { id: JOB }, error: null }] })
  const handler = createMobileApiHandler({ authenticate: async () => ({ success: true,
    role, user: { id: role === 'worker' ? WORKER : CUSTOMER }, supabase: client,
    userSupabase: client, privilegedSupabase: client }), services: createEdgeServices({}) })
  return { client, run: (body: unknown = intent) => handler(new Request(`https://edge.test/jobs/${JOB}/access/authorize`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })) }
}

describe('Customer apartment authorization intent and receipt', () => {
  installEdgeRuntimeTestHooks()

  it('sends the Customer and exact check-in intent to one atomic command with no direct writes', async () => {
    const { client, run } = setup()
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toMatchObject({ job_id: JOB, release_stage: 'unit_released',
      already_authorized: false, worker_id: WORKER, checked_in_at: CHECK_IN, authorized_at: receipt.authorized_at })
    expect(client.calls.filter(call => call.table === 'rpc:authorize_apartment_access_atomic')).toEqual([
      { table: 'rpc:authorize_apartment_access_atomic', operations: [['rpc', 'authorize_apartment_access_atomic', {
        p_job_id: JOB, p_customer_id: CUSTOMER, p_expected_worker_id: WORKER, p_expected_check_in_at: CHECK_IN }]] }])
    expect(client.calls.some(call => call.operations.some(op => ['insert', 'update'].includes(String(op[0]))))).toBe(false)
  })

  it.each(['worker', 'admin'] as const)('rejects %s acting as Customer before reading the job or authorizing access', async role => {
    const { client, run } = setup([receipt], role)
    expect((await run()).status, pillarWhy(PILLAR)).toBe(403)
    expect(client.calls.some(call => call.table === 'jobs' || call.table === 'rpc:authorize_apartment_access_atomic')).toBe(false)
  })

  it('requires an update for a legacy unbound command', async () => {
    const { run, client } = setup()
    const response = await run({})
    expect(response.status, pillarWhy(PILLAR)).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'CLIENT_UPDATE_REQUIRED' })
    expect(client.calls.some(call => call.table === 'rpc:authorize_apartment_access_atomic')).toBe(false)
  })

  it.each([{ ...intent, expected_worker_id: 'bad' }, { ...intent, expected_check_in_at: 'yesterday' },
    { ...intent, customer_id: WORKER }])('rejects malformed or authority-bearing input %j', async body => {
    const { run, client } = setup()
    expect((await run(body)).status).toBe(400)
    expect(client.calls.some(call => call.table === 'rpc:authorize_apartment_access_atomic')).toBe(false)
  })

  it.each(['ACCESS_CONTEXT_CHANGED', 'ACCESS_NOT_READY'])('does not turn %s into authorization', async error_code => {
    const { run } = setup([{ ...receipt, ok: false, error_code, authorized_at: null }])
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(409)
    expect(await response.json()).toMatchObject({ code: error_code })
  })

  it.each([null, [], [receipt, receipt], [{ ...receipt, worker_id: CUSTOMER }],
    [{ ...receipt, checked_in_at: '2026-09-08T00:00:00.000Z' }], [{ ...receipt, authorized_at: null }],
    [{ ...receipt, ok: true, error_code: 'ACCESS_NOT_READY' }]])('does not invent success from an invalid receipt %j', async result => {
    const { run } = setup(result)
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'ACCESS_AUTHORIZATION_OUTCOME_UNKNOWN', reconcile_required: true })
    expect(response.headers.get('x-support-code')).toBeTruthy()
  })

  it('preserves a safe unknown-outcome error on timeout instead of claiming a final failure', async () => {
    const { run } = setup(null, 'customer', true)
    const response = await run()
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.code).toBe('ACCESS_AUTHORIZATION_OUTCOME_UNKNOWN')
    expect(JSON.stringify(body)).not.toContain('SECRET_DATABASE_DETAILS')
  })

  it('recovers a committed authorization through the same stable intent', async () => {
    const { run } = setup([{ ...receipt, already_authorized: true }])
    const response = await run()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ already_authorized: true, authorized_at: receipt.authorized_at })
  })

  it('exposes Customer-only check-in intent and a recoverable receipt from committed state', () => {
    const row = { id: JOB, worker_id: WORKER, status: 'arrived', apartment_access_state: {
      check_in: { worker_id: WORKER, checked_in_at: CHECK_IN }, exact_unit_released: true,
      customer_authorized: true, authorized_worker_id: WORKER, authorized_check_in_at: CHECK_IN,
      customer_authorized_at: receipt.authorized_at } }
    const access = projectAddressAccess(row, 'customer').addressAccess
    expect(access.authorization_context).toEqual(intent)
    expect(access.authorization_receipt).toMatchObject({ job_id: JOB, worker_id: WORKER,
      checked_in_at: CHECK_IN, authorized_at: receipt.authorized_at, already_authorized: true })
    for (const role of ['worker', 'admin'] as const) {
      expect(projectAddressAccess(row, role).addressAccess.authorization_context).toBeNull()
      expect(projectAddressAccess(row, role).addressAccess.authorization_receipt).toBeNull()
    }
    const stale = { ...row, worker_id: CUSTOMER }
    expect(projectAddressAccess(stale, 'customer').addressAccess.authorization_receipt).toBeNull()
    expect(projectAddressAccess(stale, 'customer').addressAccess.authorization_context).toBeNull()
  })

  it('does not present an unbound or cancelled check-in as ready for Customer authorization', () => {
    for (const row of [{ worker_id: WORKER, status: 'arrived', apartment_access_state: { worker_checked_in: true } },
      { worker_id: WORKER, status: 'cancelled', apartment_access_state: { check_in: { worker_id: WORKER, checked_in_at: CHECK_IN } } }]) {
      const access = projectAddressAccess(row, 'customer').addressAccess
      expect(access.worker_checked_in).toBe(false)
      expect(access.authorization_context).toBeNull()
      expect(access.authorization_receipt).toBeNull()
    }
  })
})
