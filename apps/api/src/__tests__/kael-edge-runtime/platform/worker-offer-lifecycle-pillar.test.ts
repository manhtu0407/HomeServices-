import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { markWorkerBroadcastSeen } from '../../../../../../supabase/functions/mobile-api/_shared/domains/worker/broadcasts'

export const PILLAR = {
  id: 'P186-worker-offer-lifecycle',
  invariant:
    'an authenticated Worker marks only an actor-owned broadcast delivery seen through an Edge-owned receipt, while an absent receipt fails closed',
  authority: [
    'governance/RULES.md #0 (workflow-sensitive writes stay behind the mobile-api Edge boundary)',
    'governance/RULES.md #8 (unknown workflow receipts do not become success)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/broadcasts.ts',
  layer: 'integration',
  siblings: ['P47-stage1-worker-delivery', 'P49-durable-matching-delivery', 'P60-matching-push-delivery-ack-route'],
  mutation:
    'replace ctx.user.id with a client worker id or turn a missing seen receipt into a successful visibility action; the actor-bound cases turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const WORKER_ID = '18600000-0000-4000-8000-000000000001'
const JOB_ID = '18600000-0000-4000-8000-000000000002'
const BROADCAST_ID = '18600000-0000-4000-8000-000000000003'
const DELIVERY_ID = '18600000-0000-4000-8000-000000000004'

function workerContext(client: ReturnType<typeof makeSequenceClient>): MobileApiContext {
  return {
    success: true,
    user: { id: WORKER_ID },
    role: 'worker',
    supabase: client,
  }
}

describe('worker offer lifecycle', () => {
  it('marks only the authenticated Worker delivery seen through one atomic RPC', async () => {
    const client = makeSequenceClient([], {
      mark_matching_delivery_seen: [{
        data: [{
          id: DELIVERY_ID,
          broadcast_id: BROADCAST_ID,
          job_id: JOB_ID,
          operation_id: '18600000-0000-4000-8000-000000000006',
          status: 'seen',
          expires_at: '2099-01-01T00:00:00.000Z',
          delivered_at: '2026-09-15T08:00:00.000Z',
          seen_at: '2026-09-15T08:01:00.000Z',
          accepted_at: null,
        }],
        error: null,
      }],
    })

    const result = await markWorkerBroadcastSeen(workerContext(client), BROADCAST_ID)

    expect(result.delivery_receipt, pillarWhy(PILLAR, 'a seen action must return the exact delivery receipt')).toMatchObject({
      delivery_id: DELIVERY_ID,
      broadcast_id: BROADCAST_ID,
      job_id: JOB_ID,
      operation_id: '18600000-0000-4000-8000-000000000006',
      state: 'seen',
    })
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].operations).toContainEqual([
      'rpc',
      'mark_matching_delivery_seen',
      { p_broadcast_id: BROADCAST_ID, p_worker_id: WORKER_ID },
    ])
  })

  it('refuses an absent seen receipt without claiming visibility', async () => {
    const client = makeSequenceClient([], {
      mark_matching_delivery_seen: [{ data: [], error: null }],
    })

    await expect(markWorkerBroadcastSeen(workerContext(client), BROADCAST_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
  })
})
