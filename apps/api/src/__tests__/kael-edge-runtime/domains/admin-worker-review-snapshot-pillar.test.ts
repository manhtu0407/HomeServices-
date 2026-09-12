import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P172-admin-worker-review-snapshot',
  invariant: 'A KYC decision targets the queue and profile revision actually reviewed, including retry after the queue is resolved',
  authority: ['governance/RULES.md #0', 'governance/structures/admin-workflow.md'],
  target: 'supabase/functions/mobile-api/_shared/domains/admin/worker-review.ts',
  layer: 'security-negative',
  siblings: ['P171-admin-worker-review-receipt'],
  mutation: 'choose the newest open profile queue instead of the submitted review snapshot; replay and stale-round cases fail',
} as const satisfies PillarManifest

const ADMIN = 'd7500000-0000-4000-8000-000000000001'
const WORKER = 'd7500000-0000-4000-8000-000000000002'
const APPLICATION = 'd7500000-0000-4000-8000-000000000003'
const QUEUE = 'd7500000-0000-4000-8000-000000000004'
const REVISION = '2026-09-10T12:00:00.123456+00:00'
const RPC = 'admin_review_worker_profile_snapshot_atomic'
const INPUT = { decision: 'approve', profile_review_queue_id: QUEUE, expected_profile_updated_at: REVISION }

installEdgeRuntimeTestHooks()

function request(input: unknown = INPUT, code: string | null = null, databaseFailure = false) {
  const row = {
    ok: code === null, error_code: code, queue_id: QUEUE, worker_id: WORKER,
    decision: 'approve', verification_status: code ? null : 'approved',
    decided_at: code ? null : '2026-09-10T12:30:00.000001+00:00',
  }
  const client = makeSequenceClient([], { [RPC]: [{ data: [row], error: null }] }, {
    kael_admin_queue: [{ data: { actor_id: WORKER }, error: databaseFailure ? { code: '08006', message: 'PRIVATE_DB_SENTINEL' } : null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({ success: true, user: { id: ADMIN, authProvider: 'email' }, role: 'admin', supabase: client, privilegedSupabase: client, userSupabase: client }),
    services: createEdgeServices({}),
  })
  return { client, response: handler(new Request(`https://edge.test/admin/worker-applications/${APPLICATION}/profile-decision`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  })) }
}

describe('Admin KYC exact review snapshot HTTP contract', () => {
  it('replays the selected queue without querying only open queues or substituting a new round', async () => {
    const { response, client } = request()
    expect((await response).status, pillarWhy(PILLAR)).toBe(200)
    expect(client.calls.filter(call => call.table === 'kael_admin_queue')).toHaveLength(1)
    expect(client.calls.find(call => call.table === `rpc:${RPC}`)?.operations).toEqual([['rpc', RPC, {
      p_queue_id: QUEUE, p_admin_id: ADMIN, p_application_id: APPLICATION,
      p_expected_profile_updated_at: REVISION, p_decision: 'approve', p_reason: null,
    }]])
  })

  it.each([
    { decision: 'approve' },
    { ...INPUT, profile_review_queue_id: undefined },
    { ...INPUT, expected_profile_updated_at: undefined },
    { ...INPUT, profile_review_queue_id: 'newest' },
    { ...INPUT, expected_profile_updated_at: '2026-02-30T00:00:00Z' },
  ])('refuses a missing or malformed snapshot before database mutation %#', async (input) => {
    const { response, client } = request(input)
    expect((await response).status).toBe(400)
    expect(client.calls.filter(call => call.table === 'kael_admin_queue' || call.table.startsWith('rpc:admin_review_worker_'))).toEqual([])
  })

  it.each(['STALE_REVIEW', 'ALREADY_REVIEWED', 'IDEMPOTENCY_CONFLICT'])('preserves %s without a success acknowledgement', async (code) => {
    const response = await request(INPUT, code).response
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code })
    expect(response.headers.get('x-support-code')).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('reports database outage rather than claiming that the application does not exist', async () => {
    const { response, client } = request(INPUT, null, true)
    const result = await response
    expect(result.status).toBe(500)
    expect(await result.json()).toMatchObject({ code: 'DB_ERROR' })
    expect(client.calls.some(call => call.table.startsWith('rpc:admin_review_worker_'))).toBe(false)
  })
})
