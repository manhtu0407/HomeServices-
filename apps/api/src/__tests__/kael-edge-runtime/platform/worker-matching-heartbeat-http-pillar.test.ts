import { describe, expect, it } from 'vitest'

import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P363-worker-matching-heartbeat-authenticated-http',
  invariant:
    'The public matching-heartbeat route records a server receipt for the authenticated Worker and refuses non-Worker actors before the heartbeat RPC',
  authority: [
    'governance/RULES.md #0 (workflow-sensitive writes stay behind the mobile-api Edge boundary)',
    'governance/STRUCTURES.md §7 B2 (Worker availability and matching reachability)',
  ],
  target: 'supabase/functions/mobile-api/_shared/http/routes/worker.ts',
  layer: 'integration',
  siblings: ['P50-reachable-cohort-matching', 'P57-stage1-provider-push-receipt', 'P362-worker-offer-decline-authenticated-http'],
  mutation:
    'remove the Worker role requirement or substitute a client-provided Worker id in the heartbeat RPC; the refusal or actor-bound RPC assertion turns red',
} as const satisfies PillarManifest

const WORKER_ID = '36300000-0000-4000-8000-000000000001'
const SERVER_TIME = '2026-10-12T00:00:00.000Z'
const ACTIVE_UNTIL = '2026-10-12T00:01:00.000Z'

function setup(role: 'worker' | 'customer') {
  const client = makeSequenceClient([], {
    record_worker_matching_heartbeat: [{
      data: [{ server_time: SERVER_TIME, active_until: ACTIVE_UNTIL }],
      error: null,
    }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true as const,
      user: { id: WORKER_ID },
      role,
      supabase: client,
      privilegedSupabase: client,
      userSupabase: client,
    }),
    services: createEdgeServices({}),
  })

  return {
    client,
    send: () => handler(new Request('https://edge.test/workers/me/matching-heartbeat', { method: 'POST' })),
  }
}

describe('Worker matching heartbeat public route', () => {
  installEdgeRuntimeTestHooks()

  it('records a server receipt for the authenticated Worker', async () => {
    const { send, client } = setup('worker')
    const response = await send()

    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toEqual({ server_time: SERVER_TIME, active_until: ACTIVE_UNTIL })
    const heartbeatCalls = client.calls.filter(call => call.table === 'rpc:record_worker_matching_heartbeat')
    expect(heartbeatCalls).toHaveLength(1)
    expect(heartbeatCalls[0].operations).toContainEqual([
      'rpc',
      'record_worker_matching_heartbeat',
      expect.objectContaining({ p_worker_id: WORKER_ID }),
    ])
  })

  it('refuses a Customer before calling the heartbeat RPC', async () => {
    const { send, client } = setup('customer')
    const response = await send()

    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'CAPABILITY_FORBIDDEN' })
    expect(client.calls.filter(call => call.table === 'rpc:record_worker_matching_heartbeat')).toEqual([])
  })
})
