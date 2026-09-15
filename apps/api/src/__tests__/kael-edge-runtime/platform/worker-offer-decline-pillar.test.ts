import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { declineBroadcast } from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/decline'

export const PILLAR = {
  id: 'P188-worker-offer-decline',
  invariant:
    'an authenticated Worker declines only an actor-owned active broadcast and stale offer receipts become an explicit expiry refusal',
  authority: [
    'governance/RULES.md #0 (workflow-sensitive writes stay behind the mobile-api Edge boundary)',
    'governance/RULES.md #8 (unknown workflow receipts do not become success)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/decline.ts',
  layer: 'integration',
  siblings: ['P50-reachable-cohort-matching', 'P186-worker-offer-lifecycle', 'P187-worker-offer-accept'],
  mutation:
    'remove the actor filter, turn an expired broadcast into a successful decline, or claim a decline after the guarded update is absent; the decline cases turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const WORKER_ID = '18800000-0000-4000-8000-000000000001'
const JOB_ID = '18800000-0000-4000-8000-000000000002'
const BROADCAST_ID = '18800000-0000-4000-8000-000000000003'

function workerContext(client: ReturnType<typeof makeSequenceClient>): MobileApiContext {
  return {
    success: true,
    user: { id: WORKER_ID },
    role: 'worker',
    supabase: client,
  }
}

describe('worker offer decline', () => {
  it('declines a sent broadcast through an actor-scoped update and returns a durable refusal', async () => {
    const client = makeSequenceClient([], {}, {
      job_broadcasts: [
        {
          data: {
            id: BROADCAST_ID,
            status: 'sent',
            expires_at: '2099-01-01T00:00:00.000Z',
            jobs: { status: 'broadcasting' },
          },
          error: null,
        },
        { data: { id: BROADCAST_ID }, error: null },
      ],
      job_events: [{ data: null, error: null }],
      kael_rule_lifecycle_log: [{ data: null, error: null }],
      jobs: [{ data: null, error: null }],
    })

    const result = await declineBroadcast(workerContext(client), JOB_ID)

    expect(result, pillarWhy(PILLAR, 'an active decline must return only its durable action receipt')).toEqual({
      job_id: JOB_ID,
      declined: true,
    })
    const broadcastCalls = client.calls.filter((call) => call.table === 'job_broadcasts')
    expect(broadcastCalls).toHaveLength(2)
    expect(broadcastCalls[0].operations).toContainEqual(['eq', 'worker_id', WORKER_ID])
    expect(broadcastCalls[1].operations).toContainEqual(['update', expect.objectContaining({ status: 'declined' })])
    expect(broadcastCalls[1].operations).toContainEqual(['eq', 'id', BROADCAST_ID])
    expect(broadcastCalls[1].operations).toContainEqual(['eq', 'status', 'sent'])
  })

  it('refuses a stale decline without claiming a successful offer action', async () => {
    const client = makeSequenceClient([], {}, {
      job_broadcasts: [{
        data: {
          id: BROADCAST_ID,
          status: 'sent',
          expires_at: '2000-01-01T00:00:00.000Z',
          jobs: { status: 'broadcasting' },
        },
        error: null,
      }, { data: { id: BROADCAST_ID }, error: null }],
      jobs: [{ data: null, error: null }],
    })

    await expect(declineBroadcast(workerContext(client), JOB_ID)).rejects.toMatchObject({
      code: 'EXPIRED',
      status: 410,
    })
    expect(client.calls.some((call) => call.table === 'job_broadcasts' &&
      call.operations.some((operation) => operation[0] === 'update' &&
        (operation[1] as { status?: string })?.status === 'declined'))).toBe(false)
  })
})
