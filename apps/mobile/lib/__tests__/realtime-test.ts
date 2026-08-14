const mockRemoveChannel = jest.fn()
const mockSubscribe = jest.fn()
const mockOn = jest.fn()
const mockChannel = jest.fn()

const channel = {
  on: mockOn,
  subscribe: mockSubscribe,
}

jest.mock('../supabase', () => ({
  supabase: {
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}))

import {
  subscribeToJobMessages,
  subscribeToJobStatus,
  subscribeToWorkerBroadcasts,
  subscribeToWorkerEarnings,
} from '../realtime'

describe('mobile realtime subscription boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockChannel.mockReturnValue(channel)
    mockOn.mockReturnValue(channel)
    mockSubscribe.mockReturnValue(channel)
    mockRemoveChannel.mockResolvedValue('ok')
  })

  it('rejects malformed identifiers before building realtime filters', () => {
    expect(subscribeToJobMessages('job_id=neq.null', jest.fn())).toBeNull()
    expect(subscribeToJobStatus('../job', jest.fn())).toBeNull()
    expect(subscribeToWorkerBroadcasts('*', jest.fn())).toBeNull()
    expect(subscribeToWorkerEarnings('worker_id=neq.null', jest.fn())).toBeNull()
    expect(mockChannel).not.toHaveBeenCalled()
  })

  it('subscribes with an exact UUID filter and removes the same channel', async () => {
    const jobId = '11111111-1111-4111-8111-111111111111'
    const handle = subscribeToJobMessages(jobId, jest.fn())

    expect(handle).not.toBeNull()
    expect(mockChannel).toHaveBeenCalledWith(`job-messages:${jobId}`)
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ filter: `job_id=eq.${jobId}` }),
      expect.any(Function),
    )
    await expect(handle?.unsubscribe()).resolves.toBe('ok')
    expect(mockRemoveChannel).toHaveBeenCalledWith(channel)
  })

  it('subscribes to the authenticated worker ledger with an exact worker filter', async () => {
    const workerId = '22222222-2222-4222-8222-222222222222'
    const onChange = jest.fn()
    const handle = subscribeToWorkerEarnings(workerId, onChange)

    expect(handle).not.toBeNull()
    expect(mockChannel).toHaveBeenCalledWith(`worker-earnings:${workerId}`)
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'worker_payment_ledger',
        filter: `worker_id=eq.${workerId}`,
      },
      expect.any(Function),
    )
    await expect(handle?.unsubscribe()).resolves.toBe('ok')
    expect(mockRemoveChannel).toHaveBeenCalledWith(channel)
  })
})
