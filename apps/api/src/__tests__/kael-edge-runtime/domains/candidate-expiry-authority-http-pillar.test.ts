import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P97-candidate-expiry-authority-http',
  invariant: 'Reading an expired candidate performs one server-owned expiry command, never a Customer decision or inline matching, and returns a durable operation or a recoverable unknown outcome',
  authority: ['governance/RULES.md #7', 'approved Production Agentic Transaction Readiness plan (Customer authority and recovery)'],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/candidate.ts',
  layer: 'integration',
  siblings: ['P96-matching-candidate-capacity-sql', 'P121-candidate-decision-durability-sql'],
  mutation: 'Use the confirm or reject RPC during candidate reads; clock-skew cases observe a Customer-decision call and fail',
} as const satisfies PillarManifest

const JOB = 'f9700000-0000-4000-8000-000000000001'
const CUSTOMER = 'f9700000-0000-4000-8000-000000000002'
const CANDIDATE = 'f9700000-0000-4000-8000-000000000003'
const WORKER = 'f9700000-0000-4000-8000-000000000004'
const OPERATION = 'f9700000-0000-4000-8000-000000000005'
const auditCalls = new Set(['rpc:begin_harness_run', 'rpc:append_harness_event', 'rpc:finish_harness_run',
  'rpc:finish_harness_authorized_request', 'rpc:record_harness_privileged_operation'])

function setup(mode: string, expiry: 'not_expired' | 'expired' | 'race' | 'error', role: 'customer' | 'admin' = 'customer',
  options: { state?: string; rpcData?: unknown; operationError?: boolean;
    confirmFailure?: 'EXPIRED' | 'WORKER_NOT_ELIGIBLE' } = {}) {
  const row = { ok: expiry === 'expired' || expiry === 'race',
    error_code: expiry === 'not_expired' ? 'NOT_EXPIRED' : null,
    candidate_id: CANDIDATE, worker_id: WORKER,
    job_status: expiry === 'expired' ? 'broadcasting' : 'worker_candidate_pending', already_applied: expiry === 'race' }
  const confirmation = { ok: false, error_code: options.confirmFailure, job_status: 'broadcasting',
    candidate_id: CANDIDATE, worker_id: WORKER, already_applied: false }
  const client = makeSequenceClient([], {
    expire_worker_candidate_atomic: [{ data: options.rpcData ?? [row], error: expiry === 'error' ? { code: '08006' } : null }],
    confirm_worker_matching_proposal_atomic: [{ data: [confirmation], error: null }],
    confirm_worker_candidate_atomic: [{ data: [confirmation], error: null }],
    reject_worker_candidate_atomic: [{ data: [{ ok: true, job_status: 'broadcasting' }], error: null }],
  }, {
    jobs: [{ data: { id: JOB, customer_id: CUSTOMER, status: 'worker_candidate_pending', quote_mode: mode }, error: null },
      { data: { id: JOB, customer_id: CUSTOMER, status: 'broadcasting' }, error: null }],
    job_worker_candidates: [{ data: { id: CANDIDATE, worker_id: WORKER, status: 'proposed', expires_at: '2000-01-01T00:00:00Z' }, error: null }],
    matching_operations: [{ data: { id: OPERATION, state: options.state ?? 'no_reachable_worker',
      updated_at: '2026-09-06T00:00:00Z' }, error: options.operationError ? { code: '08006', message: 'private detail' } : null }],
    job_broadcasts: [{ data: [], error: null }, { data: [{ id: 'remaining', expires_at: '2099-01-01T00:00:00Z' }], error: null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({ success: true, user: { id: CUSTOMER }, role,
      supabase: client, privilegedSupabase: client, userSupabase: client }),
    services: createEdgeServices({}),
  })
  return { client, run: () => handler(new Request(`https://edge.test/jobs/${JOB}/candidate`)),
    confirm: () => handler(new Request(`https://edge.test/jobs/${JOB}/candidates/${CANDIDATE}/confirm`, { method: 'POST' })) }
}

describe('candidate read authority under clock skew', () => {
  installEdgeRuntimeTestHooks()

  it.each(['rfq', 'inspection_only', 'kael_auto_quote'])('does not choose or decline a live %s candidate when Edge thinks it expired', async (mode) => {
    const { client, run } = setup(mode, 'not_expired')
    const response = await run()
    expect(client.calls.filter((call) => /^rpc:(confirm_worker|reject_worker)/.test(call.table)), pillarWhy(PILLAR)).toEqual([])
    expect(client.calls.filter((call) => call.table === 'rpc:expire_worker_candidate_atomic')).toHaveLength(1)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'STATUS_CHANGED' })
    expect(response.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
    expect(client.calls.some((call) => call.table === 'job_events' || call.table === 'rpc:insert_notification_atomic')).toBe(false)
  })

  it.each(['rfq', 'inspection_only', 'kael_auto_quote'])('projects %s expiry without post-commit workflow writes', async (mode) => {
    const { client, run } = setup(mode, 'expired')
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ status: 'broadcasting', candidate: null,
      operation: { operation_id: OPERATION, state: 'no_reachable_worker' } })
    expect(body).not.toHaveProperty('broadcast_sent')
    expect(client.calls.filter((call) => call.table.startsWith('rpc:') && !auditCalls.has(call.table))
      .map((call) => call.table), pillarWhy(PILLAR)).toEqual(['rpc:expire_worker_candidate_atomic'])
    expect(client.calls.flatMap((call) => call.operations).some((operation) =>
      ['insert', 'update', 'delete', 'upsert'].includes(String(operation[0]))), pillarWhy(PILLAR)).toBe(false)
  })

  it.each(['race', 'error'] as const)('does not report broadcasting after expiry %s', async (outcome) => {
    const { run } = setup('rfq', outcome)
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(outcome === 'error' ? 503 : 409)
    const body = await response.json()
    expect(body).toMatchObject({ code: outcome === 'error' ? 'CANDIDATE_DECISION_OUTCOME_UNKNOWN' : 'STATUS_CHANGED' })
    expect(body).not.toHaveProperty('broadcast_sent')
  })

  it.each(['broadcasting', 'no_reachable_worker', 'recovery_required'])('returns the actual %s operation without inventing a new dispatch', async (state) => {
    const { run } = setup('rfq', 'expired', 'customer', { state })
    const response = await run()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.operation).toMatchObject({ operation_id: OPERATION, state })
    expect(body).not.toHaveProperty('broadcast_sent')
  })

  it.each([{ rpcData: [] }, { rpcData: [{ ok: 'true' }] },
    { rpcData: [{ ok: true, candidate_id: JOB, worker_id: WORKER, job_status: 'broadcasting', error_code: null, already_applied: false }] },
    { operationError: true }])('keeps malformed or unreadable outcomes recoverable: %j', async (options) => {
    const { run } = setup('rfq', 'expired', 'customer', options)
    const response = await run()
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toMatchObject({ code: 'CANDIDATE_DECISION_OUTCOME_UNKNOWN', reconcile_required: true })
    expect(JSON.stringify(body)).not.toContain('private detail')
    expect(response.headers.get('x-support-code')).toBeTruthy()
    expect(response.headers.get('x-trace-id')).toBeTruthy()
  })

  it('denies an Admin read before any expiry mutation', async () => {
    const { client, run } = setup('rfq', 'expired', 'admin')
    expect((await run()).status, pillarWhy(PILLAR)).toBe(403)
    expect(client.calls.filter((call) => call.table.startsWith('rpc:expire_worker'))).toEqual([])
  })

  it.each(['rfq', 'inspection_only', 'kael_auto_quote'].flatMap((mode) =>
    (['EXPIRED', 'WORKER_NOT_ELIGIBLE'] as const).map((reason) => ({ mode, reason }))))
  ('does not dispatch or write after the server refuses $mode confirmation with $reason', async ({ mode, reason }) => {
    const { client, confirm } = setup(mode, 'expired', 'customer', { confirmFailure: reason })
    const response = await confirm()
    expect(response.status).toBe(409)
    expect(client.calls.filter((call) => call.table.startsWith('rpc:') && !auditCalls.has(call.table))
      .map((call) => call.table), pillarWhy(PILLAR)).toEqual([mode === 'kael_auto_quote'
      ? 'rpc:confirm_worker_candidate_atomic' : 'rpc:confirm_worker_matching_proposal_atomic'])
    expect(client.calls.flatMap((call) => call.operations).some((operation) =>
      ['insert', 'update', 'delete', 'upsert'].includes(String(operation[0]))), pillarWhy(PILLAR)).toBe(false)
    expect(response.headers.get('x-support-code')).toBeTruthy()
  })
})
