import { describe, expect, it, vi } from 'vitest'

import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
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

function processorClient(data: unknown) {
  return makeSequenceClient([], {
    claim_confirmation_matching_outbox_batch: [{ data: [{
      outbox_id: claim.outboxId, lease_token: claim.leaseToken, operation_id: claim.operationId,
      customer_id: claim.customerId, session_id: claim.sessionId, job_id: claim.jobId,
      diagnosis_scope: null, preferred_worker_id: null, attempt_count: 1,
    }], error: null }],
    activate_confirmation_matching_outbox_claim: [{ data, error: null }],
    settle_confirmation_matching_outbox_claim: [{ data: 'completed', error: null }],
  })
}

function broadcastReceipt() {
  return {
    state: 'broadcasting', job_id: claim.jobId, confirmation_operation_id: claim.operationId,
    matching_operation_id: '58100000-0000-4000-8000-000000000007',
    service_type: 'plumbing', district: 'q7', problem_summary: 'Kiểm tra đường ống bị rò nước.',
    expires_at: new Date(Date.now() + 300_000).toISOString(),
    targets: [{ worker_id: '58100000-0000-4000-8000-000000000008',
      broadcast_id: '58100000-0000-4000-8000-000000000009',
      delivery_id: '58100000-0000-4000-8000-000000000010',
      operation_id: '58100000-0000-4000-8000-000000000007' }],
  }
}

describe('confirmation matching outbox dispatcher', () => {
  it('processes a committed RFQ receipt without a diagnosis or price and notifies only its recipient', async () => {
    const receipt = broadcastReceipt()
    const client = processorClient(receipt)
    const result = await dispatchConfirmationMatchingOutbox(client as never, {}, {
      dispatcherId: 'matching-maintainer:p58-rfq',
    })
    expect(result).toMatchObject({ claimed: 1, completed: 1 })
    expect(client.calls.filter((call) => call.table === 'rpc:insert_notification_atomic')).toHaveLength(1)
    expect(client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')?.operations[0][2])
      .toMatchObject({ p_user_id: receipt.targets[0].worker_id, p_job_id: claim.jobId,
        p_safe_metadata: { broadcast_id: receipt.targets[0].broadcast_id, expires_at: receipt.expires_at } })
    expect(client.calls.find((call) => call.table === 'rpc:settle_confirmation_matching_outbox_claim')?.operations[0][2])
      .toMatchObject({ p_state: 'broadcasting', p_error_code: null })
    expect(client.calls.some((call) => call.table === 'rpc:activate_job_broadcast_batch_durable_atomic_v2'
      || call.table === 'rpc:begin_job_matching_preference_atomic')).toBe(false)
  })

  it.each(['foreign_job', 'foreign_confirmation', 'foreign_matching', 'duplicate', 'empty', 'expired', 'unknown'])(
    'never enriches or notifies a %s activation receipt', async (fault) => {
      const receipt = broadcastReceipt()
      if (fault === 'foreign_job') receipt.job_id = claim.sessionId
      if (fault === 'foreign_confirmation') receipt.confirmation_operation_id = claim.sessionId
      if (fault === 'foreign_matching') receipt.targets[0].operation_id = claim.sessionId
      if (fault === 'duplicate') receipt.targets.push({ ...receipt.targets[0] })
      if (fault === 'empty') receipt.targets = []
      if (fault === 'expired') receipt.expires_at = new Date(Date.now() - 1).toISOString()
      if (fault === 'unknown') receipt.state = 'fake_success'
      const client = processorClient(receipt)
      await dispatchConfirmationMatchingOutbox(client as never, {}, { dispatcherId: 'matching-maintainer:p58-invalid' })
      expect(client.calls.filter((call) => !call.table.startsWith('rpc:'))).toEqual([])
      expect(client.calls.some((call) => call.table === 'rpc:insert_notification_atomic')).toBe(false)
      expect(client.calls.find((call) => call.table === 'rpc:settle_confirmation_matching_outbox_claim')?.operations[0][2])
        .toMatchObject({ p_state: 'recovery_required', p_error_code: 'MATCHING_RECONCILIATION_FAILED' })
    },
  )

  it.each(['candidate_ready', 'official_match', 'stopped'])('lets SQL settlement retain %s authority without notifications', async (state) => {
    const client = processorClient({ state })
    await dispatchConfirmationMatchingOutbox(client as never, {}, { dispatcherId: 'matching-maintainer:p58-terminal' })
    expect(client.calls.filter((call) => !call.table.startsWith('rpc:'))).toEqual([])
    expect(client.calls.some((call) => call.table === 'rpc:insert_notification_atomic')).toBe(false)
  })
  it.each(['no_reachable_worker', 'recovery_required', 'lease_lost'] as const)(
    'uses the real processor with a lease-bound activation for %s, without legacy matching', async (state) => {
      const client = makeSequenceClient([], {
        claim_confirmation_matching_outbox_batch: [{ data: [{
          outbox_id: claim.outboxId, lease_token: claim.leaseToken, operation_id: claim.operationId,
          customer_id: claim.customerId, session_id: claim.sessionId, job_id: claim.jobId,
          diagnosis_scope: null, preferred_worker_id: null, attempt_count: 1,
        }], error: null }],
        activate_confirmation_matching_outbox_claim: [{ data: state === 'recovery_required'
          ? { state, error_code: 'MATCHING_PREFERENCE_PENDING' } : { state }, error: null }],
        settle_confirmation_matching_outbox_claim: [{ data: state === 'recovery_required' ? 'retry_scheduled' : 'completed', error: null }],
      })
      const result = await dispatchConfirmationMatchingOutbox(client as never, {}, {
        dispatcherId: 'matching-maintainer:p58-real-processor',
      })
      expect(client.calls.find((call) => call.table === 'rpc:activate_confirmation_matching_outbox_claim')?.operations)
        .toEqual([['rpc', 'activate_confirmation_matching_outbox_claim', {
          p_outbox_id: claim.outboxId, p_lease_token: claim.leaseToken, p_operation_id: claim.operationId,
        }]])
      expect(client.calls.filter((call) => !call.table.startsWith('rpc:'))).toEqual([])
      const settlements = client.calls.filter((call) => call.table === 'rpc:settle_confirmation_matching_outbox_claim')
      if (state === 'lease_lost') {
        expect(settlements).toHaveLength(0)
        expect(result.leaseLost).toBe(1)
      } else {
        expect(settlements[0].operations[0][2]).toMatchObject({
          p_state: state, p_error_code: state === 'recovery_required' ? 'MATCHING_PREFERENCE_PENDING' : null,
        })
        expect(result).toMatchObject(state === 'recovery_required' ? { retryScheduled: 1 } : { completed: 1 })
      }
    },
  )

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
