import { describe, expect, it, vi } from 'vitest'
import {
  recordWorkerCancellationReview,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/agentic/case-3-worker-cancel'
import {
  recordCustomerCancellationReview,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/agentic/case-4-customer-cancel'

function rpcOnlyClient() {
  const rpc = vi.fn(async () => ({
    data: [{ applied: true }],
    error: null,
  }))
  return {
    client: {
      from: vi.fn(() => {
        throw new Error('memory mutations must not read and merge rows in Edge')
      }),
      rpc,
    },
    rpc,
  }
}

describe('atomic Kael memory runtime wiring', () => {
  it('records worker cancellation memory through one idempotent RPC', async () => {
    const { client, rpc } = rpcOnlyClient()

    await recordWorkerCancellationReview(client as never, {
      jobId: '11111111-1111-4111-8111-111111111111',
      workerId: '22222222-2222-4222-8222-222222222222',
      cancellationId: '33333333-3333-4333-8333-333333333333',
      subCase: 'explicit_cancel',
    })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith(
      'record_worker_cancellation_memory_atomic',
      expect.objectContaining({
        p_cancellation_id: '33333333-3333-4333-8333-333333333333',
        p_job_id: '11111111-1111-4111-8111-111111111111',
        p_worker_id: '22222222-2222-4222-8222-222222222222',
      }),
    )
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('0901234567')
  })

  it('records customer cancellation memory through one idempotent RPC', async () => {
    const { client, rpc } = rpcOnlyClient()

    await recordCustomerCancellationReview(client as never, {
      jobId: '11111111-1111-4111-8111-111111111111',
      customerId: '44444444-4444-4444-8444-444444444444',
      cancellationId: '55555555-5555-4555-8555-555555555555',
    })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith(
      'record_customer_cancellation_memory_atomic',
      expect.objectContaining({
        p_cancellation_id: '55555555-5555-4555-8555-555555555555',
        p_customer_id: '44444444-4444-4444-8444-444444444444',
        p_job_id: '11111111-1111-4111-8111-111111111111',
      }),
    )
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('0901234567')
  })
})
