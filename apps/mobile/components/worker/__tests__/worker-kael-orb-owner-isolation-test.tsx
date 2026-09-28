import { act, renderHook } from '@testing-library/react-native'
import type { LocalDeal } from '@nestscout/shared'

const mockWorkerKaelChatCreate = jest.fn()
const mockWorkerKaelChatArchive = jest.fn()
const mockWorkerKaelChatGet = jest.fn()
const mockWorkerKaelChatList = jest.fn()
const mockWorkerKaelChatPin = jest.fn()
const mockWorkerKaelChatRename = jest.fn()
const mockWorkerKaelChatSendTurn = jest.fn()
const mockWorkerKaelChatStreamTurn = jest.fn()
const mockReadSessionCatalog = jest.fn()
const mockWriteSessionCatalog = jest.fn()
const mockRequestMediaPermission = jest.fn()
const mockLaunchImageLibrary = jest.fn()
let mockWorkerId = 'worker-a'
let mockWorkerAuthProvider: string | undefined

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({
    session: {
      user: {
        app_metadata: mockWorkerAuthProvider ? { provider: mockWorkerAuthProvider } : {},
        id: mockWorkerId,
      },
    },
  }),
}))

jest.mock('@/lib/services', () => ({
  workerKaelChatService: {
    archive: (...args: unknown[]) => mockWorkerKaelChatArchive(...args),
    create: (...args: unknown[]) => mockWorkerKaelChatCreate(...args),
    get: (...args: unknown[]) => mockWorkerKaelChatGet(...args),
    list: (...args: unknown[]) => mockWorkerKaelChatList(...args),
    setPinned: (...args: unknown[]) => mockWorkerKaelChatPin(...args),
    rename: (...args: unknown[]) => mockWorkerKaelChatRename(...args),
    sendTurn: (...args: unknown[]) => mockWorkerKaelChatSendTurn(...args),
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

function workerNormalChatSuccess(sessionId = 'session-general', turns: unknown[] = []) {
  return {
    data: {
      session: {
        closed_at: null,
        id: sessionId,
        job_id: null,
        mode: 'normal' as const,
        pinned_at: null,
        progress: null,
        started_at: '2026-07-23T00:00:00.000Z',
        status: 'active' as const,
        title: null,
        total_turns: turns.length > 0 ? 1 : 0,
        worker_id: mockWorkerId,
      },
      turns,
    },
    status: 200,
    success: true as const,
  }
}

function workerTurn(id: string, role: 'worker' | 'kael', text: string, turnIndex: number) {
  return {
    content_type: 'text' as const,
    created_at: `2026-07-23T00:00:0${turnIndex + 1}.000Z`,
    id,
    media_refs: [],
    role,
    safety_notes: [],
    session_id: 'session-general',
    text_content: text,
    turn_index: turnIndex,
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
    mockWorkerAuthProvider = undefined
    mockWorkerKaelChatCreate.mockReset()
    mockWorkerKaelChatArchive.mockReset()
    mockWorkerKaelChatGet.mockReset()
    mockWorkerKaelChatList.mockReset().mockReturnValue(new Promise(() => undefined))
    mockWorkerKaelChatPin.mockReset()
    mockWorkerKaelChatRename.mockReset()
    mockWorkerKaelChatSendTurn.mockReset()
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

  it('keeps Worker Preview session pin, rename, and archive local without calling the deployed API', async () => {
    mockWorkerAuthProvider = 'local-visual-audit'
    mockWorkerId = 'local-visual-audit-worker'
    mockWorkerKaelChatCreate.mockResolvedValue({
      code: 'AUTH_MISSING',
      error: 'Vui lòng đăng nhập',
      status: 401,
      success: false,
    })
    mockWorkerKaelChatList.mockResolvedValue({
      code: 'AUTH_MISSING',
      error: 'Vui lòng đăng nhập',
      status: 401,
      success: false,
    })
    mockWorkerKaelChatPin.mockResolvedValue({
      code: 'AUTH_MISSING',
      error: 'Vui lòng đăng nhập',
      status: 401,
      success: false,
    })
    mockWorkerKaelChatRename.mockResolvedValue({
      code: 'AUTH_MISSING',
      error: 'Vui lòng đăng nhập',
      status: 401,
      success: false,
    })
    mockWorkerKaelChatArchive.mockResolvedValue({
      code: 'AUTH_MISSING',
      error: 'Vui lòng đăng nhập',
      status: 401,
      success: false,
    })
    const { result } = renderHook(() => useWorkerV5KaelOrbChat(null, 'vi', 'normal', true))
    let sessionId = ''

    await act(async () => {
      expect(await result.current.startNewSession()).toBe(true)
    })
    sessionId = result.current.activeSessionId!
    expect(sessionId).not.toBe('')
    expect(result.current.sessions.map((session) => session.id)).toContain(sessionId)
    let sent = true
    await act(async () => {
      sent = await result.current.send('Preview audit send should stay local')
    })
    expect(sent).toBe(false)
    expect(result.current.error).toContain('Chế độ xem trước chỉ dùng để kiểm tra giao diện')
    expect(result.current.liveTurns).toEqual([])
    await act(async () => {
      expect(await result.current.setSessionPinned(sessionId, true)).toBe(true)
    })
    expect(result.current.sessions.find((item) => item.id === sessionId)?.pinned_at).not.toBeNull()

    await act(async () => {
      expect(await result.current.renameSession(sessionId, 'Kitchen follow-up')).toBe(true)
    })
    expect(result.current.sessions.find((item) => item.id === sessionId)?.title).toBe('Kitchen follow-up')

    await act(async () => {
      expect(await result.current.archiveSession(sessionId)).toBe(true)
    })
    expect(result.current.sessions.map((item) => item.id)).not.toContain(sessionId)
    expect(result.current.activeSessionId).toBeNull()
    expect(mockWorkerKaelChatCreate).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatList).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatPin).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatRename).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatArchive).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatStreamTurn).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatSendTurn).not.toHaveBeenCalled()
  })

  it('does not treat an existing session GET as success after a definitive 426 send rejection', async () => {
    mockWorkerKaelChatCreate.mockResolvedValue(workerNormalChatSuccess())
    mockWorkerKaelChatStreamTurn.mockResolvedValue({
      code: 'CLIENT_UPDATE_REQUIRED',
      error: 'client compatibility rejected',
      status: 426,
      success: false,
    })
    const { result } = renderHook(() => useWorkerV5KaelOrbChat(null, 'vi', 'normal', true))
    await act(async () => {
      expect(await result.current.startNewSession()).toBe(true)
    })

    let sent = true
    await act(async () => {
      sent = await result.current.send('Xin chào Kael')
    })

    expect(sent).toBe(false)
    expect(mockWorkerKaelChatGet).not.toHaveBeenCalled()
    expect(result.current.error).toContain('chưa tương thích với dịch vụ')
  })

  it('does not accept stale session history as a reply after an ambiguous stream failure', async () => {
    const previous = workerNormalChatSuccess('session-general', [
      workerTurn('old-worker-turn', 'worker', 'Câu hỏi cũ', 0),
      workerTurn('old-kael-turn', 'kael', 'Phản hồi cũ', 1),
    ])
    mockWorkerKaelChatCreate.mockResolvedValue(previous)
    mockWorkerKaelChatStreamTurn.mockResolvedValue({
      code: 'NETWORK_ERROR',
      error: 'network unavailable',
      status: 0,
      success: false,
    })
    mockWorkerKaelChatGet.mockResolvedValue(previous)
    const { result } = renderHook(() => useWorkerV5KaelOrbChat(null, 'vi', 'normal', true))
    await act(async () => {
      expect(await result.current.startNewSession()).toBe(true)
    })

    let sent = true
    await act(async () => {
      sent = await result.current.send('Câu hỏi mới')
    })

    expect(sent).toBe(false)
    expect(mockWorkerKaelChatGet).toHaveBeenCalledWith('session-general')
    expect(result.current.error).toContain('kiểm tra trước khi gửi lại')
    expect(result.current.liveTurns.map((turn) => turn.text)).toEqual(['Câu hỏi cũ', 'Phản hồi cũ', 'Câu hỏi mới'])
  })

  it('falls back to the regular turn endpoint when streaming is unsupported', async () => {
    mockWorkerKaelChatCreate.mockResolvedValue(workerNormalChatSuccess())
    mockWorkerKaelChatStreamTurn.mockResolvedValue({
      code: 'STREAM_UNSUPPORTED',
      error: 'streaming is unsupported',
      status: 0,
      success: false,
    })
    mockWorkerKaelChatSendTurn.mockResolvedValue(workerNormalChatSuccess('session-general', [
      workerTurn('new-worker-turn', 'worker', 'Hello Kael', 0),
      workerTurn('new-kael-turn', 'kael', 'Hello. How can I help?', 1),
    ]))
    const { result } = renderHook(() => useWorkerV5KaelOrbChat(null, 'vi', 'normal', true))
    await act(async () => {
      expect(await result.current.startNewSession()).toBe(true)
    })

    let sent = false
    await act(async () => {
      sent = await result.current.send('Hello Kael')
    })

    expect(sent).toBe(true)
    expect(mockWorkerKaelChatSendTurn).toHaveBeenCalledWith('session-general', expect.objectContaining({ message: 'Hello Kael' }))
    expect(mockWorkerKaelChatSendTurn.mock.calls[0][1].client_request_id)
      .toBe(mockWorkerKaelChatStreamTurn.mock.calls[0][1].client_request_id)
    expect(result.current.liveTurns.map((turn) => turn.text)).toContain('Hello. How can I help?')
  })

  it('restores session state and names the Production compatibility block for pin, rename, and delete', async () => {
    const rejected = {
      code: 'CLIENT_UPDATE_REQUIRED',
      error: 'client compatibility rejected',
      status: 426,
      success: false as const,
    }
    mockWorkerKaelChatCreate.mockResolvedValue(workerChatSuccess('session-a', 'job-a'))
    mockWorkerKaelChatPin.mockResolvedValue(rejected)
    mockWorkerKaelChatRename.mockResolvedValue(rejected)
    mockWorkerKaelChatArchive.mockResolvedValue(rejected)
    const { result } = renderHook(() => useWorkerV5KaelOrbChat(workerDeal('job-a'), 'vi', 'intake', true))
    await act(async () => {
      expect(await result.current.startNewSession()).toBe(true)
    })

    await act(async () => {
      expect(await result.current.setSessionPinned('session-a', true)).toBe(false)
    })
    expect(result.current.sessions.find((item) => item.id === 'session-a')?.pinned_at).toBeNull()
    expect(result.current.sessionsError).toContain('chưa tương thích với dịch vụ')

    await act(async () => {
      expect(await result.current.renameSession('session-a', 'Nhà bếp')).toBe(false)
    })
    expect(result.current.sessions.find((item) => item.id === 'session-a')?.title).toBeNull()
    expect(result.current.sessionsError).toContain('chưa tương thích với dịch vụ')

    await act(async () => {
      expect(await result.current.archiveSession('session-a')).toBe(false)
    })
    expect(result.current.sessions.map((item) => item.id)).toContain('session-a')
    expect(result.current.sessionsError).toContain('chưa tương thích với dịch vụ')
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
