import { describe, expect, it, vi } from 'vitest'

import { installEdgeRuntimeTestHooks } from '../harness'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import {
  dispatchConfirmationMatchingOutbox,
  type ConfirmationOutboxClaim,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/confirmation-outbox-dispatcher'

export const PILLAR = {
  id: 'P58-confirmation-outbox-dispatcher',
  invariant:
    'a committed customer confirmation is leased by one bounded dispatcher, retried with backoff, dead-lettered after the cap, and reaches matching without a customer operation poll',
  authority: [
    'approved Stage 1 implementation plan (durable confirmation and matching)',
    'governance/RULES.md #7 (matching only follows explicit customer confirmation)',
    'governance/RULES.md #8 (provider or database failure cannot become fake success)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/confirmation-outbox-dispatcher.ts',
  layer: 'integration',
  siblings: ['P48-durable-confirmation-operation', 'P49-durable-matching-delivery'],
  mutation:
    'remove bounded claim dispatch, concurrent processing, or distinct retry/dead-letter/lease-lost accounting; the dispatcher result cases turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const claim: ConfirmationOutboxClaim = {
  outboxId: '58100000-0000-4000-8000-000000000001',
  leaseToken: '58100000-0000-4000-8000-000000000002',
  operationId: '58100000-0000-4000-8000-000000000003',
  customerId: '58100000-0000-4000-8000-000000000004',
  sessionId: '58100000-0000-4000-8000-000000000005',
  jobId: '58100000-0000-4000-8000-000000000006',
  diagnosisScope: null,
  preferredWorkerId: null,
  attemptCount: 1,
}

describe('confirmation matching outbox dispatcher', () => {
  it('claims one bounded batch and reports only lease-token-settled work as completed', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        outbox_id: claim.outboxId,
        lease_token: claim.leaseToken,
        operation_id: claim.operationId,
        customer_id: claim.customerId,
        session_id: claim.sessionId,
        job_id: claim.jobId,
        diagnosis_scope: null,
        preferred_worker_id: null,
        attempt_count: 1,
      }],
      error: null,
    })
    const processClaim = vi.fn().mockResolvedValue('completed')

    await expect(dispatchConfirmationMatchingOutbox(
      { rpc } as never,
      {},
      {
        dispatcherId: 'matching-maintainer:58100000-0000-4000-8000-000000000058',
        limit: 7,
        leaseSeconds: 30,
        processClaim,
      },
    )).resolves.toEqual({ claimed: 1, completed: 1, retryScheduled: 0, deadLettered: 0, leaseLost: 0 })

    expect(rpc).toHaveBeenCalledWith('claim_confirmation_matching_outbox_batch', {
      p_dispatcher_id: 'matching-maintainer:58100000-0000-4000-8000-000000000058',
      p_limit: 7,
      p_lease_seconds: 30,
    })
    expect(processClaim).toHaveBeenCalledWith(claim, expect.objectContaining({
      client: expect.anything(),
      secrets: {},
    }))
  })

  it.each([
    ['retry_scheduled', { retryScheduled: 1 }],
    ['dead_letter', { deadLettered: 1 }],
    ['lease_lost', { leaseLost: 1 }],
  ] as const)('keeps %s distinct from completion', async (outcome, expected) => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: [{
          outbox_id: claim.outboxId,
          lease_token: claim.leaseToken,
          operation_id: claim.operationId,
          customer_id: claim.customerId,
          session_id: claim.sessionId,
          job_id: claim.jobId,
          diagnosis_scope: null,
          preferred_worker_id: null,
          attempt_count: 8,
        }],
        error: null,
      }),
    }
    const result = await dispatchConfirmationMatchingOutbox(client as never, {}, {
      dispatcherId: 'matching-maintainer:58100000-0000-4000-8000-000000000058',
      processClaim: async () => outcome,
    })

    expect(result.completed, pillarWhy(PILLAR, 'a retry/dead letter/lease loss cannot be counted as delivered')).toBe(0)
    expect(result).toMatchObject(expected)
  })

  it('does not let one slow claim serialize the rest of a bounded batch', async () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({
      outbox_id: `58100000-0000-4000-8000-0000000001${index}`,
      lease_token: `58100000-0000-4000-8000-0000000002${index}`,
      operation_id: `58100000-0000-4000-8000-0000000003${index}`,
      customer_id: `58100000-0000-4000-8000-0000000004${index}`,
      session_id: `58100000-0000-4000-8000-0000000005${index}`,
      job_id: `58100000-0000-4000-8000-0000000006${index}`,
      diagnosis_scope: null,
      preferred_worker_id: null,
      attempt_count: 1,
    }))
    let active = 0
    let maximumActive = 0
    const processClaim = vi.fn(async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await Promise.resolve()
      active -= 1
      return 'completed' as const
    })

    const result = await dispatchConfirmationMatchingOutbox({
      rpc: vi.fn().mockResolvedValue({ data: rows, error: null }),
    } as never, {}, {
      dispatcherId: 'matching-maintainer:58100000-0000-4000-8000-000000000058',
      concurrency: 4,
      processClaim,
    })

    expect(maximumActive, pillarWhy(PILLAR, 'an unrelated slow operation must not consume the whole SLO')).toBe(4)
    expect(result).toMatchObject({ claimed: 4, completed: 4 })
  })

})
