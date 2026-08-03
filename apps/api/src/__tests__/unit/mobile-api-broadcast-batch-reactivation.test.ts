import { describe, expect, it, vi } from 'vitest'

import {
  activateBroadcastBatch,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/matching/broadcasts.ts'

function makeClient(result: {
  data: Array<Record<string, unknown>> | null
  error: { code?: string; message?: string } | null
}) {
  return {
    from: vi.fn(),
    rpc: vi.fn().mockResolvedValue(result),
  } as any
}

describe('activateBroadcastBatch', () => {
  it('uses one atomic RPC that can reactivate an expired job-worker row', async () => {
    const client = makeClient({
      data: [{ id: 'broadcast-old', worker_id: 'worker-1' }],
      error: null,
    })

    const result = await activateBroadcastBatch(client, {
      jobId: 'job-1',
      workerIds: ['worker-1'],
      batchId: 'batch-1',
      sentAt: '2026-07-22T04:30:00.000Z',
      expiresAt: '2026-07-22T04:31:00.000Z',
    })

    expect(client.rpc).toHaveBeenCalledWith('activate_job_broadcast_batch_atomic', {
      p_job_id: 'job-1',
      p_worker_ids: ['worker-1'],
      p_batch_id: 'batch-1',
      p_sent_at: '2026-07-22T04:30:00.000Z',
      p_expires_at: '2026-07-22T04:31:00.000Z',
    })
    expect(result).toEqual({
      success: true,
      targets: [{ broadcastId: 'broadcast-old', workerId: 'worker-1' }],
    })
  })

  it('fails closed when no row was inserted or safely reactivated', async () => {
    const client = makeClient({ data: [], error: null })

    await expect(activateBroadcastBatch(client, {
      jobId: 'job-1',
      workerIds: ['worker-1'],
      batchId: 'batch-1',
      sentAt: '2026-07-22T04:30:00.000Z',
      expiresAt: '2026-07-22T04:31:00.000Z',
    })).resolves.toEqual({
      success: false,
      reasonCode: 'NO_WORKER',
      reason: 'Không còn thợ phù hợp để gửi lại yêu cầu',
    })
  })

  it('returns a sanitized DB error when the atomic write fails', async () => {
    const client = makeClient({ data: null, error: { code: '23505' } })

    await expect(activateBroadcastBatch(client, {
      jobId: 'job-1',
      workerIds: ['worker-1'],
      batchId: 'batch-1',
      sentAt: '2026-07-22T04:30:00.000Z',
      expiresAt: '2026-07-22T04:31:00.000Z',
    })).resolves.toEqual({
      success: false,
      reasonCode: 'DB_ERROR',
      reason: 'Lỗi khi gửi yêu cầu đến thợ',
    })
  })
})
