import { act, renderHook } from '@testing-library/react-native'
import type { LocalDeal } from '@nestscout/shared'

const mockWorkerKaelChatCreate = jest.fn()
const mockWorkerKaelChatGet = jest.fn()
const mockWorkerKaelChatList = jest.fn()
const mockWorkerKaelChatStreamTurn = jest.fn()
const mockReadSessionCatalog = jest.fn()
const mockWriteSessionCatalog = jest.fn()
const mockRequestMediaPermission = jest.fn()
const mockLaunchImageLibrary = jest.fn()
let mockWorkerId = 'worker-a'

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({
    session: {
      user: {
        app_metadata: {},
        id: mockWorkerId,
      },
    },
  }),
}))

jest.mock('@/lib/services', () => ({
  workerKaelChatService: {
    create: (...args: unknown[]) => mockWorkerKaelChatCreate(...args),
    get: (...args: unknown[]) => mockWorkerKaelChatGet(...args),
    list: (...args: unknown[]) => mockWorkerKaelChatList(...args),
    streamTurn: (...args: unknown[]) => mockWorkerKaelChatStreamTurn(...args),
  },
}))

jest.mock('../chat/session-catalog-cache', () => ({
  readWorkerKaelSessionCatalog: (...args: unknown[]) => mockReadSessionCatalog(...args),
  writeWorkerKaelSessionCatalog: (...args: unknown[]) => mockWriteSessionCatalog(...args),
}))

jest.mock('@/lib/media-upload', () => ({
  uploadJobMediaDrafts: jest.fn(),
}))

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestMediaPermission(...args),
}))

import { useWorkerV5KaelOrbChat } from '../chat/use-kael-orb-chat'

type RenderSnapshot = {
  activeSessionId: string | null
  busy: boolean
  mediaCount: number
  turnTexts: string[]
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function workerDeal(jobId: string): LocalDeal {
  return {
    backendStatus: 'worker_matched',
    broadcast: {
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'Quận 1',
      jobId,
      prebrief: [],
      problemSummary: 'Kiểm tra điện',
      secondsRemaining: null,
      serviceType: 'electrical',
      status: 'accepted',
    },
    draft: {
      addressLabel: '',
      description: 'Kiểm tra điện',
      districtLabel: 'Quận 1',
      inferredProblemLabel: null,
      mediaCount: 0,
      needsServiceChoice: false,
      problemChips: [],
      serviceType: 'electrical',
      source: 'booking',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: null,
    id: `deal-${jobId}`,
    scopeChange: null,
    status: 'worker_matched',
  }
}

function workerChatSuccess(sessionId: string, jobId: string, workerId = mockWorkerId) {
  return {
    data: {
      session: {
        closed_at: null,
        id: sessionId,
        job_id: jobId,
        mode: 'intake' as const,
        pinned_at: null,
        progress: null,
        started_at: '2026-07-15T00:00:00.000Z',
        status: 'active' as const,
        title: null,
        total_turns: 1,
        worker_id: workerId,
      },
      turns: [{
        content_type: 'text' as const,
        created_at: '2026-07-15T00:00:01.000Z',
        id: `${sessionId}-turn`,
        media_refs: [],
        role: 'kael' as const,
        safety_notes: [],
        session_id: sessionId,
        text_content: `reply-${jobId}`,
        turn_index: 0,
      }],
    },
    status: 200,
    success: true as const,
  }
}

function snapshot(result: ReturnType<typeof useWorkerV5KaelOrbChat>): RenderSnapshot {
  return {
    activeSessionId: result.activeSessionId,
    busy: result.busy,
    mediaCount: result.mediaCount,
    turnTexts: result.liveTurns.map((turn) => turn.text),
  }
}

describe('worker Kael orb owner isolation', () => {
  beforeEach(() => {
    mockWorkerId = 'worker-a'
    mockWorkerKaelChatCreate.mockReset()
    mockWorkerKaelChatGet.mockReset()
    mockWorkerKaelChatList.mockReset().mockReturnValue(new Promise(() => undefined))
    mockWorkerKaelChatStreamTurn.mockReset()
    mockReadSessionCatalog.mockReset().mockResolvedValue(null)
    mockWriteSessionCatalog.mockReset().mockResolvedValue(undefined)
    mockRequestMediaPermission.mockReset().mockResolvedValue({ granted: true })
    mockLaunchImageLibrary.mockReset().mockResolvedValue({
      assets: [{ fileName: 'evidence.jpg', uri: 'file:///evidence.jpg' }],
      canceled: false,
    })
  })

  it('keeps general chat creation available without an active job', () => {
    const { result } = renderHook(() =>
      useWorkerV5KaelOrbChat(null, 'vi', 'normal', true),
    )

    expect(result.current.canCreateSession).toBe(true)
  })

  it('keeps job intake creation locked without an active job', () => {
    const { result } = renderHook(() =>
      useWorkerV5KaelOrbChat(null, 'vi', 'intake', true),
    )

    expect(result.current.canCreateSession).toBe(false)
  })

  it('creates a general conversation without sending a job id', async () => {
    mockWorkerKaelChatCreate.mockResolvedValue({
      data: {
        session: {
          closed_at: null,
          id: 'session-general',
          job_id: null,
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-23T00:00:00.000Z',
          status: 'active',
          title: null,
          total_turns: 0,
          worker_id: mockWorkerId,
        },
        turns: [],
      },
      status: 200,
      success: true,
    })
    const { result } = renderHook(() =>
      useWorkerV5KaelOrbChat(null, 'vi', 'normal', true),
    )

    let created = false
    await act(async () => {
      created = await result.current.startNewSession()
    })

    expect(created).toBe(true)
    expect(mockWorkerKaelChatCreate).toHaveBeenCalledWith(expect.objectContaining({
      language: 'vi',
      mode: 'normal',
    }))
    expect(mockWorkerKaelChatCreate.mock.calls[0][0]).not.toHaveProperty('job_id')
    expect(result.current.activeSessionId).toBe('session-general')
  })

  it('hides the previous job state in the first render for the next job', async () => {
    mockWorkerKaelChatCreate.mockResolvedValue(workerChatSuccess('session-a', 'job-a'))
    const renders: RenderSnapshot[] = []
    const { result, rerender } = renderHook<
      ReturnType<typeof useWorkerV5KaelOrbChat>,
      { deal: LocalDeal }
    >(({ deal }) => {
      const chat = useWorkerV5KaelOrbChat(deal, 'vi', 'intake', true)
      renders.push(snapshot(chat))
      return chat
    }, { initialProps: { deal: workerDeal('job-a') } })

    await act(async () => {
      await result.current.startNewSession()
      await result.current.pickMedia()
    })
    expect(snapshot(result.current)).toEqual({
      activeSessionId: 'session-a',
      busy: false,
      mediaCount: 1,
      turnTexts: ['reply-job-a'],
    })

    const renderCountBeforeSwitch = renders.length
    rerender({ deal: workerDeal('job-b') })

    expect(renders[renderCountBeforeSwitch]).toEqual({
      activeSessionId: null,
      busy: false,
      mediaCount: 0,
      turnTexts: [],
    })
  })

  it('hides the previous worker state in the first render after an account switch', async () => {
    mockWorkerKaelChatCreate.mockResolvedValue(workerChatSuccess('session-a', 'job-a'))
    const renders: RenderSnapshot[] = []
    const { result, rerender } = renderHook(() => {
      const chat = useWorkerV5KaelOrbChat(workerDeal('job-a'), 'vi', 'intake', true)
      renders.push(snapshot(chat))
      return chat
    })

    await act(async () => {
      await result.current.startNewSession()
      await result.current.pickMedia()
    })
    const renderCountBeforeSwitch = renders.length
    mockWorkerId = 'worker-b'
    rerender(undefined)

    expect(renders[renderCountBeforeSwitch]).toEqual({
      activeSessionId: null,
      busy: false,
      mediaCount: 0,
      turnTexts: [],
    })
  })

  it('rejects a late A1 response after switching A to B to A', async () => {
    const firstA = deferred<ReturnType<typeof workerChatSuccess>>()
    mockWorkerKaelChatCreate.mockReturnValueOnce(firstA.promise)
    const { result, rerender } = renderHook<
      ReturnType<typeof useWorkerV5KaelOrbChat>,
      { deal: LocalDeal }
    >(
      ({ deal }) => useWorkerV5KaelOrbChat(deal, 'vi', 'intake', true),
      { initialProps: { deal: workerDeal('job-a') } },
    )
    let pendingStart!: Promise<boolean>

    await act(async () => {
      pendingStart = result.current.startNewSession()
      await Promise.resolve()
    })
    rerender({ deal: workerDeal('job-b') })
    rerender({ deal: workerDeal('job-a') })

    await act(async () => {
      firstA.resolve(workerChatSuccess('session-a1', 'job-a'))
      await pendingStart
    })
    expect(snapshot(result.current)).toEqual({
      activeSessionId: null,
      busy: false,
      mediaCount: 0,
      turnTexts: [],
    })
  })
})
