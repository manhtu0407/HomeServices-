import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { requestWorkerCancellation } from '../../../../../../supabase/functions/mobile-api/_shared/domains/worker/cancellation'
import { dispatchWorkerReplacementOutbox } from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/replacement-outbox'

const notifications = vi.hoisted(() => ({ workers: vi.fn(), customer: vi.fn() }))
vi.mock('../../../../../../supabase/functions/mobile-api/_shared/domains/notification/notifications.ts', async (original) => ({
  ...await original<Record<string, unknown>>(),
  notifyBroadcastWorkers: notifications.workers,
  notifyCustomerWorkerReplacementSearch: notifications.customer,
}))

export const PILLAR = {
  id: 'P83-worker-cancellation-recovery',
  invariant: 'committed Worker cancellation survives HTTP failure, recovers its durable replacement receipt, and dispatches only leased persisted recipients without inline matching',
  authority: ['approved Production Agentic Transaction Readiness plan', 'governance/RULES.md #7 and #8'],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/cancellation.ts',
  layer: 'integration',
  siblings: ['P58-confirmation-outbox-dispatcher', 'P84-worker-cancellation-matching-outbox'],
  mutation: 'remove approved-retry recovery or restore inline broadcasts; committed-failure and no-inline cases fail; falsely settle failed activation as completed and retry cases fail',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()
beforeEach(() => {
  notifications.workers.mockReset()
  notifications.customer.mockReset()
})

const approved = {
  id: 'cancellation-1', status: 'approved', created_at: '2026-09-05T10:20:00Z',
  reason_code: 'vehicle_breakdown_with_photo', reason_category: 'legit_auto_approve',
  admin_review_required: false, fallback_options: [], abuse_signals: [],
}
const cancelledRow = {
  ...approved, ok: true, cancellation_id: approved.id, cancellation_status: 'approved',
  job_status: 'broadcasting', created_at_ts: approved.created_at, worker_id_out: 'worker-1',
}
const receipt = { job_status: 'broadcasting', replacement_state: 'queued', broadcast_sent: false }
const input = { reason: 'Emergency reason that prevents continuing the job', evidence_photo_urls: [] }

function context(client: ReturnType<typeof makeSequenceClient>): MobileApiContext {
  return { success: true, user: { id: 'worker-1' }, role: 'worker', supabase: client }
}

function cancellationClient(options: { detached?: boolean; recoveryError?: boolean; mutationError?: boolean } = {}) {
  return makeSequenceClient([], {
    request_worker_cancellation_atomic: [{ data: options.mutationError ? null : [cancelledRow], error: options.mutationError ? { message: 'database unavailable' } : null }],
    recover_worker_cancellation_replacement: [{ data: options.recoveryError ? null : [receipt], error: options.recoveryError ? { message: 'response lost after commit' } : null }],
    record_worker_cancellation_memory_atomic: [{ data: [{ applied: false }], error: null }],
  }, {
    jobs: [{ data: { id: 'job-1', status: options.detached ? 'broadcasting' : 'worker_on_way', customer_id: 'customer-1', worker_id: options.detached ? null : 'worker-1' }, error: null }],
    worker_cancellation_requests: [{ data: options.detached ? approved : null, error: null }],
  })
}

describe('Worker cancellation recovery runtime', () => {
  it('queues approved cancellation without running matching or claiming delivery in the HTTP request', async () => {
    const client = cancellationClient()
    await expect(requestWorkerCancellation(context(client), 'job-1', input), pillarWhy(PILLAR)).resolves.toMatchObject({
      cancellation_id: approved.id, status: 'approved', job_status: 'broadcasting', broadcast_sent: false,
      message: 'Đã hủy việc. Yêu cầu tìm thợ thay thế đã được lưu.',
    })
    expect(client.calls.filter((call) => call.table === 'rpc:request_worker_cancellation_atomic')).toHaveLength(1)
    expect(client.calls.filter((call) => call.table === 'rpc:recover_worker_cancellation_replacement')).toHaveLength(1)
    expect(client.calls.some((call) => /activate_job_broadcast|job_broadcasts|worker_profiles|insert_notification/.test(call.table))).toBe(false)
    expect(notifications.workers).not.toHaveBeenCalled()
  })

  it('rejects precommit database failure without inventing an approved cancellation', async () => {
    const client = cancellationClient({ mutationError: true })
    await expect(requestWorkerCancellation(context(client), 'job-1', input)).rejects.toMatchObject({ code: 'DB_ERROR' })
    expect(client.calls.some((call) => call.table === 'rpc:recover_worker_cancellation_replacement')).toBe(false)
  })

  it('recovers the same cancellation after commit succeeded but the response was lost and Worker is detached', async () => {
    const first = cancellationClient({ recoveryError: true })
    await expect(requestWorkerCancellation(context(first), 'job-1', input)).rejects.toMatchObject({ code: 'DB_ERROR' })
    expect(first.calls.some((call) => call.table === 'rpc:request_worker_cancellation_atomic')).toBe(true)
    const restarted = cancellationClient({ detached: true })
    await expect(requestWorkerCancellation(context(restarted), 'job-1', input)).resolves.toMatchObject({
      cancellation_id: approved.id, status: 'approved', broadcast_sent: false,
    })
    expect(restarted.calls.some((call) => call.table === 'rpc:request_worker_cancellation_atomic')).toBe(false)
    expect(restarted.calls.find((call) => call.table === 'rpc:recover_worker_cancellation_replacement')?.operations)
      .toContainEqual(['rpc', 'recover_worker_cancellation_replacement', { p_cancellation_id: approved.id, p_worker_id: 'worker-1' }])
  })

  it('does not fabricate success if an approved cancellation has no readable durable receipt', async () => {
    const client = cancellationClient({ detached: true, recoveryError: true })
    await expect(requestWorkerCancellation(context(client), 'job-1', input)).rejects.toMatchObject({ code: 'DB_ERROR' })
    expect(client.calls.some((call) => call.table === 'rpc:request_worker_cancellation_atomic')).toBe(false)
  })
})

const claim = { outbox_id: 'outbox-1', lease_token: 'lease-1' }
const activation = {
  state: 'broadcasting', job_id: 'job-1', customer_id: 'customer-1', service_type: 'plumbing', district: 'q7',
  expires_at: '2026-09-05T10:25:00Z',
  targets: [{ worker_id: 'replacement-1', broadcast_id: 'broadcast-1', delivery_id: 'delivery-1', operation_id: 'matching-1' }],
}

function dispatcherClient(options: { activation?: Record<string, unknown>; activationFailure?: boolean; settlement?: string; settlementFailure?: boolean } = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'claim_worker_replacement_outbox_batch') return { data: [claim], error: null }
    if (name === 'activate_worker_replacement_outbox_claim') {
      return { data: options.activationFailure ? null : options.activation ?? activation, error: options.activationFailure ? { message: 'timeout' } : null }
    }
    if (name === 'settle_worker_replacement_outbox_claim') {
      if (options.settlementFailure) throw new Error('settlement transport lost')
      return { data: options.settlement ?? 'completed', error: null }
    }
    throw new Error(`unexpected RPC: ${name}`)
  })
  return { rpc }
}

describe('Worker replacement outbox dispatcher runtime', () => {
  it('Saved-worker fallback dispatches without claiming an assigned Worker cancelled', async () => {
    const client = dispatcherClient({ activation: { ...activation, matching_reason: 'saved_worker_fallback' } })
    await expect(dispatchWorkerReplacementOutbox(client as never, { dispatcherId: 'test:saved-fallback' }))
      .resolves.toMatchObject({ completed: 1 })
    expect(notifications.workers).toHaveBeenCalledTimes(1)
    expect(notifications.customer).not.toHaveBeenCalled()
    expect(client.rpc).toHaveBeenCalledWith('settle_worker_replacement_outbox_claim',
      expect.objectContaining({ p_state: 'broadcasting', p_error_code: null }))
  })

  it('dispatches a Customer retry without inventing a Worker cancellation notification', async () => {
    const client = dispatcherClient({ activation: { ...activation, matching_reason: 'customer_retry' } })
    await expect(dispatchWorkerReplacementOutbox(client as never, { dispatcherId: 'test:customer-retry' }))
      .resolves.toMatchObject({ completed: 1 })
    expect(notifications.workers).toHaveBeenCalledTimes(1)
    expect(notifications.customer, pillarWhy(PILLAR, 'Customer retry did not cancel an assigned Worker')).not.toHaveBeenCalled()
  })

  it('rejects an unknown matching reason before any notification', async () => {
    const client = dispatcherClient({ activation: { ...activation, matching_reason: 'untrusted_reason' }, settlement: 'retry_scheduled' })
    await expect(dispatchWorkerReplacementOutbox(client as never, { dispatcherId: 'test:invalid-reason' }))
      .resolves.toMatchObject({ retryScheduled: 1 })
    expect(notifications.workers).not.toHaveBeenCalled()
    expect(notifications.customer).not.toHaveBeenCalled()
    expect(client.rpc).toHaveBeenCalledWith('settle_worker_replacement_outbox_claim',
      expect.objectContaining({ p_state: 'recovery_required', p_error_code: 'REPLACEMENT_DISPATCH_FAILED' }))
  })

  it('notifies only receipt-backed targets and settles the owned lease', async () => {
    const client = dispatcherClient()
    await expect(dispatchWorkerReplacementOutbox(client as never, { dispatcherId: 'test:replacement', limit: 3 }))
      .resolves.toEqual({ claimed: 1, completed: 1, retryScheduled: 0, deadLettered: 0, leaseLost: 0 })
    expect(client.rpc).toHaveBeenCalledWith('claim_worker_replacement_outbox_batch', { p_dispatcher_id: 'test:replacement', p_limit: 3, p_lease_seconds: 45 })
    expect(notifications.workers).toHaveBeenCalledWith(client, 'job-1', 'plumbing', 'q7', activation.expires_at, [{
      workerId: 'replacement-1', broadcastId: 'broadcast-1', deliveryId: 'delivery-1', operationId: 'matching-1',
    }])
    expect(client.rpc).toHaveBeenCalledWith('settle_worker_replacement_outbox_claim', {
      p_outbox_id: claim.outbox_id, p_lease_token: claim.lease_token, p_state: 'broadcasting', p_error_code: null,
    })
  })

  it('reuses persisted recipient identity after notification failure instead of creating inline replacement work', async () => {
    notifications.workers.mockRejectedValueOnce(new Error('interrupted notification'))
    const first = dispatcherClient({ settlement: 'retry_scheduled' })
    await expect(dispatchWorkerReplacementOutbox(first as never, { dispatcherId: 'test:replacement' })).resolves.toMatchObject({ retryScheduled: 1, completed: 0 })
    const retry = dispatcherClient()
    await expect(dispatchWorkerReplacementOutbox(retry as never, { dispatcherId: 'test:replacement' })).resolves.toMatchObject({ completed: 1 })
    expect(notifications.workers.mock.calls[0]?.slice(1)).toEqual(notifications.workers.mock.calls[1]?.slice(1))
    expect(retry.rpc.mock.calls.every(([name]) => ['claim_worker_replacement_outbox_batch', 'activate_worker_replacement_outbox_claim', 'settle_worker_replacement_outbox_claim'].includes(name))).toBe(true)
  })

  it('keeps database activation failure retryable and never claims a delivered replacement', async () => {
    const client = dispatcherClient({ activationFailure: true, settlement: 'retry_scheduled' })
    await expect(dispatchWorkerReplacementOutbox(client as never, { dispatcherId: 'test:replacement' })).resolves.toMatchObject({ retryScheduled: 1, completed: 0 })
    expect(notifications.workers).not.toHaveBeenCalled()
    expect(client.rpc).toHaveBeenCalledWith('settle_worker_replacement_outbox_claim', expect.objectContaining({ p_state: 'recovery_required', p_error_code: 'REPLACEMENT_DISPATCH_FAILED' }))
  })

  it.each(['lease_lost', 'stopped', 'no_reachable_worker', 'candidate_ready', 'official_match'])('does not notify for %s', async (state) => {
    const client = dispatcherClient({ activation: { state } })
    await dispatchWorkerReplacementOutbox(client as never, { dispatcherId: 'test:replacement' })
    expect(notifications.workers).not.toHaveBeenCalled()
    expect(notifications.customer).not.toHaveBeenCalled()
    if (state === 'lease_lost') expect(client.rpc).not.toHaveBeenCalledWith('settle_worker_replacement_outbox_claim', expect.anything())
  })

  it('reports legacy audited recovery as dead-letter, not a successful replacement', async () => {
    const client = dispatcherClient({ activation: { state: 'recovery_required', error_code: 'LEGACY_MATCHING_REQUIRES_REVIEW' }, settlement: 'dead_letter' })
    await expect(dispatchWorkerReplacementOutbox(client as never, { dispatcherId: 'test:replacement' })).resolves.toMatchObject({ deadLettered: 1, completed: 0 })
    expect(notifications.workers).not.toHaveBeenCalled()
  })

  it('does not let an unacknowledged settlement falsely complete or abort sibling claims', async () => {
    const client = dispatcherClient({ settlementFailure: true })
    await expect(dispatchWorkerReplacementOutbox(client as never, { dispatcherId: 'test:replacement' })).resolves.toMatchObject({ leaseLost: 1, completed: 0 })
  })

  it('rejects malformed recipients before sending notifications', async () => {
    const client = dispatcherClient({ activation: { ...activation, targets: [{ worker_id: 'replacement-1' }] }, settlement: 'retry_scheduled' })
    await expect(dispatchWorkerReplacementOutbox(client as never, { dispatcherId: 'test:replacement' })).resolves.toMatchObject({ retryScheduled: 1 })
    expect(notifications.workers).not.toHaveBeenCalled()
  })
})
