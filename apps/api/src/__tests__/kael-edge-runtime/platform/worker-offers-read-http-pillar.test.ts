import { describe, expect, it } from 'vitest'

import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P361-worker-offers-read-authenticated-http',
  invariant:
    'The public Worker offers route dispatches once with the authenticated Worker context and refuses a Customer before the offers service runs',
  authority: [
    'governance/RULES.md #0 (workflow-sensitive reads stay behind the mobile-api Edge boundary)',
    'governance/STRUCTURES.md §7 B3 (Worker incoming request route)',
  ],
  target: 'supabase/functions/mobile-api/_shared/http/routes/worker.ts',
  layer: 'integration',
  siblings: ['P47-stage1-worker-delivery', 'P49-durable-matching-delivery', 'P186-worker-offer-lifecycle'],
  mutation:
    'remove the Worker/Admin offers route guard or dispatch with a caller-supplied identity; the Customer refusal or actor-bound DB query assertion turns red',
} as const satisfies PillarManifest

const WORKER_ID = '36100000-0000-4000-8000-000000000001'
const BROADCAST_ID = '36100000-0000-4000-8000-000000000002'
const JOB_ID = '36100000-0000-4000-8000-000000000003'

function setup(role: 'worker' | 'customer') {
  const expiresAt = new Date(Date.now() + 60_000).toISOString()
  const client = makeSequenceClient(
    [],
    { expire_worker_matching_deliveries: [{ data: null, error: null }] },
    {
      job_broadcasts: [{
        data: [{
          id: BROADCAST_ID,
          job_id: JOB_ID,
          status: 'sent',
          sent_at: new Date().toISOString(),
          expires_at: expiresAt,
          jobs: {
            status: 'broadcasting',
            service_type: 'electrical',
            quote_mode: 'inspection_only',
            problem_chips: ['Ổ cắm mất điện'],
            description: 'Kiểm tra một ổ cắm mất điện.',
            address_district: 'q1',
            scheduled_at: '2026-10-20T08:00:00.000Z',
            photo_urls: [],
          },
        }],
        error: null,
      }],
    },
  )
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
    send: () => handler(new Request('https://edge.test/workers/me/broadcasts')),
  }
}

describe('Worker offers authenticated read route', () => {
  installEdgeRuntimeTestHooks()

  it('dispatches the offers list once with the authenticated Worker context', async () => {
    const { send, client } = setup('worker')
    const response = await send()

    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    const body = await response.json() as { broadcasts: Array<Record<string, unknown>> }
    expect(body.broadcasts, pillarWhy(PILLAR, 'the Worker reads the active delivery through the public route')).toMatchObject([{
      broadcast_id: BROADCAST_ID,
      job_id: JOB_ID,
      status: 'sent',
      service_type: 'electrical',
      proposal_action: 'submit_inspection_scope',
    }])
    const expirationCalls = client.calls.filter(call => call.table === 'rpc:expire_worker_matching_deliveries')
    expect(expirationCalls).toHaveLength(1)
    expect(expirationCalls[0].operations).toContainEqual([
      'rpc',
      'expire_worker_matching_deliveries',
      expect.objectContaining({ p_worker_id: WORKER_ID }),
    ])
    const listCalls = client.calls.filter(call =>
      call.table === 'job_broadcasts' && call.operations.some(operation => operation[0] === 'select'))
    expect(listCalls).toHaveLength(1)
    const listCall = listCalls[0]
    expect(listCall?.operations).toContainEqual(['eq', 'worker_id', WORKER_ID])
  })

  it('refuses a Customer before dispatching the offers service', async () => {
    const { send, client } = setup('customer')
    const response = await send()

    expect(response.status, pillarWhy(PILLAR)).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'CAPABILITY_FORBIDDEN' })
    expect(client.calls).toEqual([])
  })
})
