import { describe, expect, it } from 'vitest'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { reconcileSavedWorkerFallback } from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/matching-preference-fallback'
import { buildMatchingReceipt } from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/matching-receipt'
import type { DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'

export const PILLAR = {
  id: 'P113-saved-worker-fallback-runtime',
  invariant: 'Governed saved-worker fallback queues one validated durable command and never runs legacy claim or inline broadcast on success or failure',
  authority: ['governance/RULES.md #7 and #8', 'approved Production Agentic Transaction Readiness plan'],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/matching-preference-fallback.ts',
  layer: 'integration',
  siblings: ['P112-saved-worker-fallback-sql', 'P83-worker-cancellation-recovery'],
  mutation: 'Restore the legacy fallback path; the durable-only command and no-inline-delivery cases fail',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()
const jobId = 'd1130000-0000-4000-8000-000000000001'
const workerId = 'd1130000-0000-4000-8000-000000000002'
const receipt = {
  claimed: true, reason: 'saved_worker_declined', job_id: jobId, state: 'queued', broadcast_sent: false,
  operation_id: 'd1130000-0000-4000-8000-000000000003',
  confirmation_operation_id: 'd1130000-0000-4000-8000-000000000004',
  parent_operation_id: 'd1130000-0000-4000-8000-000000000005',
  request_id: 'd1130000-0000-4000-8000-000000000006',
  support_code: 'P1130001', created_at: '2026-09-05T09:00:00Z', updated_at: '2026-09-05T09:00:00Z',
}
function clientFor(data: unknown, failed = false) {
  const client = makeSequenceClient([], {
    request_job_saved_worker_fallback_atomic: [{ data, error: failed ? { message: 'transport lost' } : null }],
  }, { jobs: [{ data: { id: jobId, quote_mode: 'rfq' }, error: null }] })
  return client as unknown as DbClient & Pick<typeof client, 'calls'>
}
describe('Saved-worker fallback durable runtime', () => {
  it('shows queued fallback as general search without inventing a sent batch', () => {
    expect(buildMatchingReceipt({ broadcasts: [], events: [], operationState: 'queued', status: 'broadcasting',
      preference: { strategy: 'saved_worker_first', auto_general: true, fallback_at: '2026-09-05T09:00:00Z' },
    })).toMatchObject({ stage: 'general_search', batch: null })
  })
  it('queues only the atomic command with no inline broadcast or fake delivery', async () => {
    const client = clientFor(receipt)
    await expect(reconcileSavedWorkerFallback(client, { jobId, expectedWorkerId: workerId, reason: 'saved_worker_declined' }),
      pillarWhy(PILLAR)).resolves.toMatchObject({ started: true, broadcast_sent: false, reasonCode: 'QUEUED' })
    expect(client.calls.filter(call => call.table.startsWith('rpc:')).map(call => call.table))
      .toEqual(['rpc:request_job_saved_worker_fallback_atomic'])
    expect(client.calls.some(call => ['job_broadcasts', 'worker_profiles', 'notifications'].includes(call.table))).toBe(false)
  })
  it('keeps an ambiguous commit recoverable without falling through to legacy matching', async () => {
    const client = clientFor(null, true)
    await expect(reconcileSavedWorkerFallback(client, { jobId, expectedWorkerId: workerId, reason: 'saved_worker_declined' }))
      .resolves.toMatchObject({ started: false, reasonCode: 'DB_ERROR' })
    expect(client.calls.filter(call => call.table.startsWith('rpc:')).map(call => call.table))
      .toEqual(['rpc:request_job_saved_worker_fallback_atomic'])
  })
  it.each([
    { ...receipt, job_id: workerId },
    { ...receipt, broadcast_sent: true },
    { ...receipt, operation_id: receipt.parent_operation_id },
    { ...receipt, reason: 'customer_retry' },
  ])('rejects an unbound or dishonest receipt', async data => {
    await expect(reconcileSavedWorkerFallback(clientFor(data), { jobId, expectedWorkerId: workerId, reason: 'saved_worker_declined' }))
      .resolves.toMatchObject({ started: false, reasonCode: 'DB_ERROR' })
  })
  it('preserves a server refusal without attempting broader matching', async () => {
    const client = clientFor({ claimed: false, error_code: 'MATCHING_FALLBACK_CONSENT_REQUIRED' })
    await expect(reconcileSavedWorkerFallback(client, { jobId, expectedWorkerId: workerId, reason: 'saved_worker_expired' }))
      .resolves.toMatchObject({ started: false, reasonCode: 'MATCHING_FALLBACK_CONSENT_REQUIRED' })
    expect(client.calls.some(call => call.table === 'job_broadcasts')).toBe(false)
  })
})
