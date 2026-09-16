import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { acceptBroadcast } from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/accept'

export const PILLAR = {
  id: 'P187-worker-offer-accept',
  invariant:
    'an authenticated Worker accepts an eligible broadcast only through the actor-bound durable RPC and receives a pending customer-confirmation state',
  authority: [
    'governance/RULES.md #0 (workflow-sensitive writes stay behind the mobile-api Edge boundary)',
    'governance/RULES.md #8 (unknown workflow receipts do not become success)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/accept.ts',
  layer: 'integration',
  siblings: ['P21-matching-guard-liveness', 'P49-durable-matching-delivery', 'P186-worker-offer-lifecycle'],
  mutation:
    'replace ctx.user.id with a client worker id or expose an ineligible accept as a customer-confirmable candidate; the accept cases turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const WORKER_ID = '18700000-0000-4000-8000-000000000001'
const JOB_ID = '18700000-0000-4000-8000-000000000002'
const QUOTE_ID = '18700000-0000-4000-8000-000000000003'

function workerContext(client: ReturnType<typeof makeSequenceClient>): MobileApiContext {
  return {
    success: true,
    user: { id: WORKER_ID },
    role: 'worker',
    supabase: client,
  }
}

describe('worker offer accept', () => {
  it('accepts an eligible broadcast through one durable RPC and returns only pending customer confirmation', async () => {
    const client = makeSequenceClient([{
      data: [{
        ok: true,
        error_code: null,
        job_status: 'worker_candidate_pending',
        candidate_id: 'candidate-187',
        already_applied: true,
      }],
      error: null,
    }])

    const result = await acceptBroadcast(workerContext(client), JOB_ID, QUOTE_ID)

    expect(result, pillarWhy(PILLAR, 'an eligible accept must return the durable candidate receipt')).toEqual({
      job_id: JOB_ID,
      status: 'worker_candidate_pending',
      candidate_id: 'candidate-187',
      awaiting_customer_confirmation: true,
      already_applied: true,
    })
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].operations).toContainEqual([
      'rpc',
      'accept_priced_broadcast_durable_atomic',
      {
        p_job_id: JOB_ID,
        p_worker_id: WORKER_ID,
        p_quote_id: QUOTE_ID,
      },
    ])
  })

  it('rejects an ineligible accept receipt without exposing candidate state', async () => {
    const client = makeSequenceClient([{
      data: [{
        ok: false,
        error_code: 'WORKER_NOT_ELIGIBLE',
        job_status: null,
        address_building: null,
        address_unit: null,
        address_floor: null,
        address_district: null,
      }],
      error: null,
    }])

    await expect(acceptBroadcast(workerContext(client), JOB_ID, QUOTE_ID)).rejects.toMatchObject({
      code: 'WORKER_NOT_ELIGIBLE',
      status: 403,
    })
    expect(client.calls).toHaveLength(1)
  })
})
