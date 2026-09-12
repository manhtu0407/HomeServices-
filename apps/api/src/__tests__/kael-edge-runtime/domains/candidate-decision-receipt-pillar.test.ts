import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P134-candidate-decision-receipt',
  invariant: 'Only the owning Customer can read an exact candidate decision; missing evidence is never a successful choice',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8'],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/candidate.ts',
  layer: 'integration',
  siblings: ['P133-candidate-decision-receipt-sql', 'P120-candidate-rejection-durability'],
  mutation: 'Remove exact candidate identity validation; a foreign candidate receipt is returned successfully',
} as const satisfies PillarManifest

const JOB = 'c1340000-0000-4000-8000-000000000001'
const CUSTOMER = 'c1340000-0000-4000-8000-000000000002'
const WORKER = 'c1340000-0000-4000-8000-000000000003'
const CANDIDATE = 'c1340000-0000-4000-8000-000000000004'
const stamp = '2026-09-08T00:00:00Z'
const confirmed = { id: CANDIDATE, job_id: JOB, worker_id: WORKER, status: 'customer_confirmed',
  customer_decision_kind: 'confirm', customer_decided_at: stamp }

function setup(options: { role?: 'customer' | 'worker' | 'admin'; owner?: string;
  row?: Record<string, unknown> | null; error?: boolean } = {}) {
  const client = makeSequenceClient([], {}, {
    jobs: [{ data: { id: JOB, customer_id: options.owner ?? CUSTOMER, status: 'cancelled', worker_id: null }, error: null }],
    job_worker_candidates: [{ data: options.error ? null : options.row === undefined ? confirmed : options.row,
      error: options.error ? { code: '08006', message: 'private database detail' } : null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({ success: true, user: { id: CUSTOMER }, role: options.role ?? 'customer',
      supabase: client, userSupabase: client, privilegedSupabase: client }),
    services: createEdgeServices({}),
  })
  return { client, run: () => handler(new Request(`https://edge.test/jobs/${JOB}/candidates/${CANDIDATE}/decision`)) }
}

describe('exact Customer candidate decision recovery', () => {
  installEdgeRuntimeTestHooks()

  it('reads a historical confirmation even after the job no longer has an official Worker', async () => {
    const { client, run } = setup()
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toEqual({ job_id: JOB, candidate_id: CANDIDATE, worker_id: WORKER,
      candidate_status: 'customer_confirmed', receipt: { job_id: JOB, candidate_id: CANDIDATE,
        worker_id: WORKER, decision: 'confirm', decided_at: stamp } })
    const calls = client.calls.filter((call) => !call.table.startsWith('rpc:'))
    expect(calls.map((call) => call.table)).toEqual(['jobs', 'job_worker_candidates'])
    expect(calls[1].operations).toContainEqual(['eq', 'id', CANDIDATE])
    expect(calls[1].operations).toContainEqual(['eq', 'job_id', JOB])
    expect(client.calls.some((call) => call.table === 'rpc:expire_worker_candidate_atomic')).toBe(false)
  })

  it('reads explicit rejection without looking up the next candidate or a Worker profile', async () => {
    const { run } = setup({ row: { ...confirmed, status: 'customer_declined', customer_decision_kind: 'reject' } })
    const response = await run()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ candidate_status: 'customer_declined', receipt: { decision: 'reject' } })
  })

  it.each(['proposed', 'expired', 'withdrawn', 'customer_declined', 'customer_confirmed'])(
    'does not invent a decision for %s without explicit audit provenance', async (status) => {
      const { run } = setup({ row: { ...confirmed, status, customer_decision_kind: null,
        customer_decided_at: status.startsWith('customer_') ? stamp : null } })
      const response = await run()
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ candidate_status: status, receipt: null })
    })

  it.each(['worker', 'admin'] as const)('denies %s before reading candidate details', async (role) => {
    const { client, run } = setup({ role })
    expect((await run()).status).toBe(403)
    expect(client.calls.some((call) => call.table === 'job_worker_candidates')).toBe(false)
  })

  it('does not disclose another Customer decision', async () => {
    const { client, run } = setup({ owner: WORKER })
    expect((await run()).status).toBe(404)
    expect(client.calls.some((call) => call.table === 'job_worker_candidates')).toBe(false)
  })

  it.each([
    { ...confirmed, id: JOB }, { ...confirmed, job_id: WORKER },
    { ...confirmed, worker_id: '' }, { ...confirmed, customer_decided_at: null },
    { ...confirmed, customer_decided_at: 'invalid' }, { ...confirmed, customer_decision_kind: 'reject' },
    { ...confirmed, customer_decision_kind: undefined }, { ...confirmed, status: 'invented' },
  ])('rejects malformed or cross-context read results: %j', async (row) => {
    const { run } = setup({ row })
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'CANDIDATE_DECISION_OUTCOME_UNKNOWN', reconcile_required: true })
    expect(response.headers.get('x-support-code')).toBeTruthy()
  })

  it('keeps database failure distinct from a missing candidate and does not leak details', async () => {
    const failed = await setup({ error: true }).run()
    expect(failed.status).toBe(503)
    expect(await failed.text()).not.toContain('private database detail')
    const missing = await setup({ row: null }).run()
    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({ code: 'NOT_FOUND' })
  })
})
