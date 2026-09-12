import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P120-candidate-rejection-durability',
  invariant: 'Customer rejection performs one durable command and reads its outcome without inline matching or best-effort workflow writes',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8'],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/candidate.ts',
  layer: 'integration',
  siblings: ['P119-candidate-rejection-durability-sql', 'P21-matching-guard-liveness'],
  mutation: 'Restore notification, proposal or matching writes after the rejection RPC; the single-command assertion fails',
} as const satisfies PillarManifest

const JOB = 'c1200000-0000-4000-8000-000000000001'
const CUSTOMER = 'c1200000-0000-4000-8000-000000000002'
const WORKER = 'c1200000-0000-4000-8000-000000000003'
const CANDIDATE = 'c1200000-0000-4000-8000-000000000004'
const OPERATION = 'c1200000-0000-4000-8000-000000000005'
const stamp = '2026-09-06T00:00:00Z'
const success = { ok: true, error_code: null, job_status: 'broadcasting', candidate_id: CANDIDATE,
  worker_id: WORKER, already_applied: false }
const auditCalls = new Set(['rpc:begin_harness_run', 'rpc:append_harness_event', 'rpc:finish_harness_run',
  'rpc:finish_harness_authorized_request', 'rpc:record_harness_privileged_operation'])

function setup(options: { role?: 'customer' | 'worker' | 'admin'; rpcData?: unknown;
  error?: { code: string; message: string }; state?: string; operationError?: boolean } = {}) {
  const client = makeSequenceClient([], {
    reject_worker_candidate_atomic: [{ data: options.error ? null : options.rpcData ?? [success], error: options.error ?? null }],
  }, {
    jobs: [{ data: { id: JOB, customer_id: CUSTOMER, status: 'broadcasting', worker_id: null,
      service_type: 'plumbing', address_district: 'q7' }, error: null }],
    job_worker_candidates: [{ data: { id: CANDIDATE, job_id: JOB, worker_id: WORKER, status: 'customer_declined',
      proposed_at: stamp, customer_decided_at: stamp }, error: null }],
    worker_profiles: [{ data: { id: WORKER, total_jobs: 0, years_experience: 5,
      rating: null, verification_status: 'approved' }, error: null }],
    profiles: [{ data: { full_name: 'Thợ kiểm thử', avatar_url: null }, error: null }],
    customer_favorite_workers: [{ data: null, error: null }],
    matching_operations: [{ data: options.operationError ? null : { id: OPERATION, state: options.state ?? 'queued',
      updated_at: stamp }, error: options.operationError ? { code: '08006', message: 'private detail' } : null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({ success: true, user: { id: CUSTOMER }, role: options.role ?? 'customer',
      supabase: client, userSupabase: client, privilegedSupabase: client }),
    services: createEdgeServices({}),
  })
  return { client, run: () => handler(new Request(
    `https://edge.test/jobs/${JOB}/candidates/${CANDIDATE}/reject`, { method: 'POST' })) }
}

describe('durable candidate rejection boundary', () => {
  installEdgeRuntimeTestHooks()

  it('does not perform a second workflow write or provider dispatch after commit', async () => {
    const { client, run } = setup()
    const response = await run()
    expect(client.calls.filter((call) => call.table.startsWith('rpc:') && !auditCalls.has(call.table))
      .map((call) => call.table), pillarWhy(PILLAR)).toEqual(['rpc:reject_worker_candidate_atomic'])
    expect(client.calls.flatMap((call) => call.operations).some((operation) =>
      ['insert', 'update', 'delete', 'upsert'].includes(String(operation[0]))), pillarWhy(PILLAR)).toBe(false)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ job_id: JOB, broadcast_sent: false,
      candidate: { candidate_id: CANDIDATE, status: 'customer_declined' },
      operation: { operation_id: OPERATION, state: 'queued' } })
  })

  it.each(['worker', 'admin'] as const)('denies %s before mutation', async (role) => {
    const { client, run } = setup({ role })
    expect((await run()).status).toBe(403)
    expect(client.calls.some((call) => call.table==='rpc:reject_worker_candidate_atomic')).toBe(false)
  })

  it.each([
    ['queued', 'chờ xử lý'], ['no_reachable_worker', 'chưa có thợ'],
    ['recovery_required', 'kiểm tra lại'],
  ])('projects %s without inventing a sent offer', async (state, message) => {
    const { run } = setup({ state })
    const response = await run()
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.broadcast_sent).toBe(false)
    expect(result.message).toContain(message)
  })

  it.each([
    { rpcData: [] }, { rpcData: [{ ...success, ok: 'true' }] },
    { rpcData: [{ ...success, candidate_id: JOB }] },
    { rpcData: [{ ...success, already_applied: true, job_status: 'invented' }] },
    { error: { code: '08006', message: 'private detail' } }, { operationError: true },
  ])('keeps an uncertain outcome recoverable and does not disclose database errors: %j', async (options) => {
    const { run } = setup(options)
    const response = await run()
    expect(response.status).toBe(503)
    const result = await response.json()
    expect(result).toMatchObject({ code: 'CANDIDATE_DECISION_OUTCOME_UNKNOWN', reconcile_required: true })
    expect(JSON.stringify(result)).not.toContain('private detail')
    expect(response.headers.get('x-support-code')).toBeTruthy()
    expect(response.headers.get('x-trace-id')).toBeTruthy()
  })
})
