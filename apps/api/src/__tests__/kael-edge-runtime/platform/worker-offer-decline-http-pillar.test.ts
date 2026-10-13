import { describe, expect, it, vi } from 'vitest'

import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P362-worker-offer-decline-authenticated-http',
  invariant:
    'The public offer-decline route passes the exact path job and authenticated Worker context to the service, and refuses a Customer before dispatch',
  authority: [
    'governance/RULES.md #0 (workflow-sensitive writes stay behind the mobile-api Edge boundary)',
    'governance/STRUCTURES.md §7 B3 (Worker offer response route)',
  ],
  target: 'supabase/functions/mobile-api/_shared/http/routes/job.ts',
  layer: 'integration',
  siblings: ['P49-durable-matching-delivery', 'P186-worker-offer-lifecycle', 'P188-worker-offer-decline'],
  mutation:
    'remove the Worker/Admin decline route guard or dispatch a caller-supplied job identity; the Customer refusal or exact path/context assertion turns red',
} as const satisfies PillarManifest

const WORKER_ID = '36200000-0000-4000-8000-000000000001'
const JOB_ID = '36200000-0000-4000-8000-000000000002'

function setup(role: 'worker' | 'customer') {
  const client = makeSequenceClient([])
  const declineBroadcast = vi.fn(async (_ctx: MobileApiContext, jobId: string) => ({
    job_id: jobId,
    declined: true as const,
  }))
  const services = Object.assign(createEdgeServices({}), { declineBroadcast })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true as const,
      user: { id: WORKER_ID },
      role,
      supabase: client,
      privilegedSupabase: client,
      userSupabase: client,
    }),
    services,
  })

  return {
    declineBroadcast,
    send: () => handler(new Request(`https://edge.test/jobs/${JOB_ID}/decline`, { method: 'POST' })),
  }
}

describe('Worker offer decline public route', () => {
  installEdgeRuntimeTestHooks()

  it('dispatches the exact path job with the authenticated Worker context', async () => {
    const { send, declineBroadcast } = setup('worker')
    const response = await send()

    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toEqual({ job_id: JOB_ID, declined: true })
    expect(declineBroadcast).toHaveBeenCalledTimes(1)
    expect(declineBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: WORKER_ID }, role: 'worker' }),
      JOB_ID,
    )
  })

  it('refuses a Customer before calling the decline service', async () => {
    const { send, declineBroadcast } = setup('customer')
    const response = await send()

    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'CAPABILITY_FORBIDDEN' })
    expect(declineBroadcast).not.toHaveBeenCalled()
  })
})
