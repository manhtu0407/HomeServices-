import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P104-customer-matching-retry-http',
  invariant: 'Customer retry accepts one durable command and recovers its receipt without inline matching, actor impersonation or invented delivery',
  authority: ['governance/RULES.md #7', 'approved Production Agentic Transaction Readiness plan (durable recovery)'],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/customer-retry.ts',
  layer: 'integration',
  siblings: ['P103-customer-matching-retry-sql', 'P83-worker-cancellation-recovery'],
  mutation: 'Restore the inline confirm-search dispatcher or ignore request identity; the one-RPC and bound-receipt assertions fail',
} as const satisfies PillarManifest

const JOB = 'dd040000-0000-4000-8000-000000000001'
const CUSTOMER = 'dd040000-0000-4000-8000-000000000002'
const REQUEST = 'dd040000-0000-4000-8000-000000000003'
const PARENT = 'dd040000-0000-4000-8000-000000000004'
const OPERATION = 'dd040000-0000-4000-8000-000000000005'
const input = { client_request_id: REQUEST, expected_matching_operation_id: PARENT }
const receipt = {
  operation_id: OPERATION, confirmation_operation_id: 'dd040000-0000-4000-8000-000000000006',
  job_id: JOB, request_id: REQUEST, parent_operation_id: PARENT, state: 'queued',
  support_code: 'ABCD1234', created_at: '2026-09-05T12:00:00Z', updated_at: '2026-09-05T12:00:00Z',
  broadcast_sent: false,
}

function setup(options: { role?: 'customer' | 'worker' | 'admin'; error?: { code: string; message: string }; data?: unknown; owner?: string } = {}) {
  const result = { data: options.error ? null : options.data ?? receipt, error: options.error ?? null }
  const client = makeSequenceClient([], {
    request_job_matching_retry_atomic: [result],
    get_job_matching_retry_operation: [result],
  }, {
    jobs: [{ data: { id: JOB, status: 'broadcasting', customer_id: options.owner ?? CUSTOMER, worker_id: null }, error: null }],
    matching_operations: [{ data: { id: PARENT, state: 'no_reachable_worker', updated_at: receipt.updated_at }, error: null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({ success: true, user: { id: CUSTOMER }, role: options.role ?? 'customer',
      supabase: client, privilegedSupabase: client, userSupabase: client }),
    services: createEdgeServices({}),
  })
  return { client, run: (method = 'POST', path = 'confirm-search', body: unknown = input) => handler(new Request(
    `https://edge.test/jobs/${JOB}/${path}`, { method, ...(method === 'POST' ? {
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    } : {}) },
  )) }
}

describe('durable Customer matching retry HTTP contract', () => {
  installEdgeRuntimeTestHooks()

  it('accepts one atomic command and does no inline provider, job update or delivery work', async () => {
    const { client, run } = setup()
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(202)
    expect(await response.json()).toMatchObject({ operation: receipt })
    const auditCalls = new Set(['rpc:begin_harness_run', 'rpc:append_harness_event',
      'rpc:finish_harness_run', 'rpc:finish_harness_authorized_request', 'rpc:record_harness_privileged_operation'])
    const calls = client.calls.filter((call) => !auditCalls.has(call.table))
    expect(calls.map((call) => call.table)).toEqual(['rpc:request_job_matching_retry_atomic'])
    expect(calls[0]?.operations).toContainEqual(['rpc', 'request_job_matching_retry_atomic', {
      p_job_id: JOB, p_customer_id: CUSTOMER, p_client_request_id: REQUEST, p_expected_matching_operation_id: PARENT,
    }])
  })

  it.each(['worker', 'admin'] as const)('denies %s before even a privileged RPC', async (role) => {
    const { client, run } = setup({ role })
    expect((await run()).status).toBe(403)
    expect(client.calls.filter((call) => call.table.includes('matching_retry'))).toEqual([])
  })

  it.each([
    [{}, 409, 'CLIENT_UPDATE_REQUIRED'],
    [{ ...input, client_request_id: 'invalid' }, 400, 'VALIDATION'],
    [{ ...input, customer_id: CUSTOMER }, 400, 'VALIDATION'],
  ] as const)('rejects incompatible or forged input %j without matching', async (body, status, code) => {
    const { client, run } = setup()
    const response = await run('POST', 'confirm-search', body)
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({ code })
    expect(client.calls.filter((call) => call.table.includes('matching_retry'))).toEqual([])
  })

  it.each([
    ['55000', 'COVERAGE_UNAVAILABLE', 409, 'COVERAGE_UNAVAILABLE'],
    ['55000', 'MATCHING_RETRY_PARENT_CHANGED', 409, 'MATCHING_RETRY_PARENT_CHANGED'],
    ['42501', 'MATCHING_RETRY_NOT_OWNED', 404, 'NOT_FOUND'],
    ['08006', 'private database detail', 503, 'MATCHING_RETRY_OUTCOME_UNKNOWN'],
  ])('maps %s/%s without exposing database details or claiming a final failure', async (code, message, status, safeCode) => {
    const { run } = setup({ error: { code, message } })
    const response = await run()
    expect(response.status).toBe(status)
    const body = await response.json()
    expect(body).toMatchObject({ code: safeCode })
    expect(JSON.stringify(body)).not.toContain('private database detail')
  })

  it('recovers the same operation after restart without submitting another command', async () => {
    const { client, run } = setup({ data: { ...receipt, state: 'official_match', broadcast_sent: true } })
    const response = await run('GET', `matching-retries/${REQUEST}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ operation: { operation_id: OPERATION, state: 'official_match' } })
    expect(client.calls.filter((call) => call.table.includes('request_job_matching_retry'))).toEqual([])
  })

  it('returns the owned latest operation for the expected-parent fence, not a Worker list or supply claim', async () => {
    const { run } = setup()
    const response = await run('GET', 'matching-operation')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ job_id: JOB, operation: {
      operation_id: PARENT, state: 'no_reachable_worker', updated_at: receipt.updated_at,
    } })
  })

  it.each(['worker', 'admin'] as const)('denies %s receipt reads as well as commands', async (role) => {
    for (const path of ['matching-operation', `matching-retries/${REQUEST}`]) {
      const { client, run } = setup({ role })
      expect((await run('GET', path)).status).toBe(403)
      expect(client.calls.some((call) => call.table === 'matching_operations' || call.table.includes('matching_retry'))).toBe(false)
    }
  })

  it('cannot use an owned session to read another Customer matching parent', async () => {
    const { client, run } = setup({ owner: PARENT })
    expect((await run('GET', 'matching-operation')).status).toBe(404)
    expect(client.calls.some((call) => call.table === 'matching_operations')).toBe(false)
  })

  it.each([
    { ...receipt, request_id: PARENT }, { ...receipt, job_id: PARENT },
    { ...receipt, parent_operation_id: JOB }, { ...receipt, state: 'invented' },
    { ...receipt, broadcast_sent: true }, { ...receipt, parent_operation_id: OPERATION },
  ])('does not trust malformed or misbound RPC receipts', async (data) => {
    const { run } = setup({ data })
    const response = await run()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'MATCHING_RETRY_OUTCOME_UNKNOWN' })
  })
})
