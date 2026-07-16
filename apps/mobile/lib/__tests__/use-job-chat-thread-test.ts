import { act, renderHook, waitFor } from '@testing-library/react-native'

const mockListMessages = jest.fn()
const mockSendMessage = jest.fn()
const mockUnsubscribe = jest.fn(async () => undefined)

jest.mock('../services', () => ({
  jobService: {
    listMessages: (...args: unknown[]) => mockListMessages(...args),
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  },
}))

jest.mock('../realtime', () => ({
  subscribeToJobMessages: jest.fn(() => ({ unsubscribe: mockUnsubscribe })),
}))

import { useJobChatThread } from '../use-job-chat-thread'

type JobChatProps = { jobId: string }
type JobChatThread = ReturnType<typeof useJobChatThread>

function message(jobId: string, content: string) {
  return {
    content,
    created_at: '2026-07-14T00:00:00.000Z',
    id: `${jobId}-${content}`,
    is_read: true,
    job_id: jobId,
    sender_id: 'customer-1',
    sender_role: 'customer' as const,
  }
}

function listResult(jobId: string, content: string) {
  return Promise.resolve({
    data: { job_id: jobId, messages: [message(jobId, content)] },
    status: 200,
    success: true as const,
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('useJobChatThread job isolation', () => {
  beforeEach(() => {
    mockListMessages.mockReset()
    mockSendMessage.mockReset()
    mockUnsubscribe.mockClear()
  })

  it('clears the previous job messages while the next job is loading', async () => {
    const nextJob = deferred<Awaited<ReturnType<typeof listResult>>>()
    mockListMessages.mockImplementation((jobId: string) =>
      jobId === 'job-a' ? listResult('job-a', 'message-a') : nextJob.promise
    )
    const { result, rerender } = renderHook<JobChatThread, JobChatProps>(
      ({ jobId }) => useJobChatThread(jobId, true),
      { initialProps: { jobId: 'job-a' } },
    )
    await waitFor(() => expect(result.current.messages).toEqual([message('job-a', 'message-a')]))

    rerender({ jobId: 'job-b' })

    expect(result.current.messages).toEqual([])
    expect(result.current.loading).toBe(true)

    await act(async () => {
      nextJob.resolve(await listResult('job-b', 'message-b'))
    })
    await waitFor(() => expect(result.current.messages).toEqual([message('job-b', 'message-b')]))
  })

  it('ignores a send result from a job that is no longer active', async () => {
    let jobAListCount = 0
    mockListMessages.mockImplementation((jobId: string) => {
      if (jobId === 'job-b') return listResult('job-b', 'message-b')
      jobAListCount += 1
      return listResult('job-a', jobAListCount === 1 ? 'message-a' : 'late-message-a')
    })
    const pendingSend = deferred<{
      data: { message: ReturnType<typeof message> }
      status: number
      success: true
    }>()
    mockSendMessage.mockReturnValue(pendingSend.promise)
    const { result, rerender } = renderHook<JobChatThread, JobChatProps>(
      ({ jobId }) => useJobChatThread(jobId, true),
      { initialProps: { jobId: 'job-a' } },
    )
    await waitFor(() => expect(result.current.messages).toEqual([message('job-a', 'message-a')]))

    let sendPromise!: Promise<boolean>
    act(() => {
      sendPromise = result.current.send('reply-a')
    })
    rerender({ jobId: 'job-b' })
    await waitFor(() => expect(result.current.messages).toEqual([message('job-b', 'message-b')]))

    await act(async () => {
      pendingSend.resolve({
        data: { message: message('job-a', 'reply-a') },
        status: 201,
        success: true,
      })
      await sendPromise
    })

    expect(result.current.messages).toEqual([message('job-b', 'message-b')])
  })

  it('allows only one in-flight send for a chat thread', async () => {
    mockListMessages.mockImplementation(() => listResult('job-a', 'message-a'))
    const pendingSend = deferred<{
      data: { message: ReturnType<typeof message> }
      status: number
      success: true
    }>()
    mockSendMessage.mockReturnValue(pendingSend.promise)
    const { result } = renderHook(() => useJobChatThread('job-a', true))
    await waitFor(() => expect(result.current.messages).toEqual([message('job-a', 'message-a')]))

    let first!: Promise<boolean>
    let second!: Promise<boolean>
    act(() => {
      first = result.current.send('reply-a')
      second = result.current.send('reply-a')
    })

    await expect(second).resolves.toBe(false)
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    await act(async () => {
      pendingSend.resolve({
        data: { message: message('job-a', 'reply-a') },
        status: 201,
        success: true,
      })
      await first
    })
  })

  it('settles loading when the message service rejects unexpectedly', async () => {
    mockListMessages.mockRejectedValueOnce(new Error('network crashed'))
    const { result } = renderHook(() => useJobChatThread('job-a', true))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Không thể tải tin nhắn. Vui lòng thử lại.')
    expect(result.current.messages).toEqual([])
  })

  it('settles sending and releases the in-flight guard after an unexpected rejection', async () => {
    mockListMessages.mockImplementation(() => listResult('job-a', 'message-a'))
    mockSendMessage
      .mockRejectedValueOnce(new Error('network crashed'))
      .mockResolvedValueOnce({
        data: { message: message('job-a', 'reply-a') },
        status: 201,
        success: true,
      })
    const { result } = renderHook(() => useJobChatThread('job-a', true))
    await waitFor(() => expect(result.current.messages).toEqual([message('job-a', 'message-a')]))

    await act(async () => {
      await expect(result.current.send('first attempt')).resolves.toBe(false)
    })
    expect(result.current.sending).toBe(false)
    expect(result.current.error).toBe('Không thể gửi tin nhắn. Vui lòng thử lại.')

    await act(async () => {
      await expect(result.current.send('retry')).resolves.toBe(true)
    })
    expect(mockSendMessage).toHaveBeenCalledTimes(2)
  })

  it('rejects an oversized message before calling the service', async () => {
    mockListMessages.mockImplementation(() => listResult('job-a', 'message-a'))
    const { result } = renderHook(() => useJobChatThread('job-a', true))
    await waitFor(() => expect(result.current.messages).toEqual([message('job-a', 'message-a')]))

    await act(async () => {
      await expect(result.current.send('x'.repeat(5_001))).resolves.toBe(false)
    })
    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(result.current.error).toBe('Tin nhắn không được dài quá 5.000 ký tự.')
  })

  it('does not expose a Vietnamese service error in English mode', async () => {
    mockListMessages.mockResolvedValue({
      error: 'Không thể tải tin nhắn này.',
      status: 503,
      success: false,
    })
    const { result } = renderHook(() => useJobChatThread('job-a', true, 'en'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Could not load messages. Try again.')
    expect(result.current.error).not.toMatch(/[^\x00-\x7f]/)
  })

  it('uses the English message-length error in English mode', async () => {
    mockListMessages.mockImplementation(() => listResult('job-a', 'message-a'))
    const { result } = renderHook(() => useJobChatThread('job-a', true, 'en'))
    await waitFor(() => expect(result.current.messages).toEqual([message('job-a', 'message-a')]))

    await act(async () => {
      await expect(result.current.send('x'.repeat(5_001))).resolves.toBe(false)
    })
    expect(result.current.error).toBe('Messages cannot exceed 5,000 characters.')
  })

  it('does not expose a provider send error in Vietnamese mode', async () => {
    mockListMessages.mockImplementation(() => listResult('job-a', 'message-a'))
    mockSendMessage.mockResolvedValue({
      code: 'INTERNAL_DETAIL',
      error: 'private provider detail 42',
      status: 503,
      success: false,
    })
    const { result } = renderHook(() => useJobChatThread('job-a', true, 'vi'))
    await waitFor(() => expect(result.current.messages).toEqual([message('job-a', 'message-a')]))

    await act(async () => {
      await expect(result.current.send('xin chào')).resolves.toBe(false)
    })
    expect(result.current.error).toBe('Không thể gửi tin nhắn. Vui lòng thử lại.')
    expect(result.current.error).not.toContain('private provider detail')
  })
})
