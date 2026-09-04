import { describe, expect, it } from 'vitest'

import { installEdgeRuntimeTestHooks } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import {
  BROADCAST_DELIVERY_TTL_MS,
  projectMatchingDelivery,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/delivery'
import { matchWorkerRoute } from '../../../../../../supabase/functions/mobile-api/_shared/http/routes/worker'

export const PILLAR = {
  id: 'P49-durable-matching-delivery',
  invariant:
    'a recipient exists durably before delivery is counted, follows queued-delivered-seen-accepted-expired states, and uses the server-owned five minute TTL',
  authority: ['docs/dev-suggestion/stage1-intake-quote-admin-proposal.md (durable recipient fan-out)'],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/delivery.ts',
  layer: 'integration',
  siblings: ['P48-durable-confirmation-operation', 'P50-reachable-cohort-matching'],
  mutation: 'restore the sixty second TTL or infer delivered from a push attempt; the receipt and TTL cases turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

describe('durable matching delivery projection', () => {
  it('locks the worker proposal route without replacing the priced-offer accept route', () => {
    expect(matchWorkerRoute(
      '/workers/me/broadcasts/20000000-0000-4000-8000-000000000049/proposal',
      'POST',
    )).toMatchObject({
      kind: 'workers.broadcastProposal',
      successStatus: 201,
      roles: ['worker'],
    })
  })

  it('owns a five minute TTL at the server boundary', () => {
    expect(BROADCAST_DELIVERY_TTL_MS, pillarWhy(PILLAR, 'clients cannot shorten or extend worker exclusivity')).toBe(300_000)
  })

  it('projects only canonical durable delivery fields', () => {
    expect(projectMatchingDelivery({
      id: '10000000-0000-4000-8000-000000000049',
      broadcast_id: '20000000-0000-4000-8000-000000000049',
      job_id: '30000000-0000-4000-8000-000000000049',
      operation_id: '40000000-0000-4000-8000-000000000049',
      status: 'seen',
      expires_at: '2026-08-23T04:05:00.000Z',
      delivered_at: '2026-08-23T04:00:01.000Z',
      seen_at: '2026-08-23T04:00:03.000Z',
      accepted_at: null,
    }, new Date('2026-08-23T04:00:04.000Z'))).toEqual({
      delivery_id: '10000000-0000-4000-8000-000000000049',
      broadcast_id: '20000000-0000-4000-8000-000000000049',
      job_id: '30000000-0000-4000-8000-000000000049',
      operation_id: '40000000-0000-4000-8000-000000000049',
      state: 'seen',
      expires_at: '2026-08-23T04:05:00.000Z',
      delivered_at: '2026-08-23T04:00:01.000Z',
      seen_at: '2026-08-23T04:00:03.000Z',
      accepted_at: null,
      server_time: '2026-08-23T04:00:04.000Z',
    })
  })

  it('refuses unknown delivery states', () => {
    expect(() => projectMatchingDelivery({
      id: 'bad', broadcast_id: 'bad', job_id: 'bad', operation_id: 'bad',
      status: 'push_attempted', expires_at: '2026-08-23T04:05:00.000Z',
    })).toThrow('MATCHING_DELIVERY_INVALID')
  })
})
