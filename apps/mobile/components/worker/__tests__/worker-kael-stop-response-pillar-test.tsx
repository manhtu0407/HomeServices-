import { fireEvent, render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { WorkerKaelChatResponse } from '@/lib/api-types'

import { createWorkerKaelOrbSendAction } from '../chat/kael-orb-send-action'
import type { WorkerV5KaelOrbLocalTurn } from '../chat/kael-orb-chat-model'
import { WorkerV5KaelOrbComposer } from '../chat/orb-screen-surfaces'

export const PILLAR = {
  id: 'P296-worker-kael-stop-response',
  invariant: 'the worker Chat send button turns into a stop button while Kael answers; stopping aborts the real request, drops the local bubble when nothing committed, shows the committed reply when the server already stored one, says the outcome is uncertain when only the question committed, and never sends after a stop during upload',
  authority: ['governance/RULES.md #8 (no fake UI: a stop button must stop the request)', 'Customer Kael composer stop behaviour (customer-kael-normal-turn-send.ts)'],
  target: 'apps/mobile/components/worker/chat/kael-orb-send-action.ts',
  layer: 'unit',
  siblings: ['P294-worker-kael-general-chat-photo', 'P254-customer-kael-uncertain-turn-media'],
  mutation: 'drop the signal from streamTurn, keep the bubble on a stop, or treat a stop as a failure — the abort, bubble or error assertion turns red',
} as const satisfies PillarManifest

const QUESTION = 'Ổ cắm này có an toàn không?'
const REF = 'supabase://kael-chat-media/worker-1/kael-chat/model_vision/photo.jpg'
const mockStreamTurn = jest.fn()
const mockGet = jest.fn()
const mockUpload = jest.fn()
const mockCleanup = jest.fn(async () => undefined)

jest.mock('@/lib/media-upload', () => ({
  cleanupKaelChatMediaRefs: (...args: unknown[]) => mockCleanup(...(args as [])),
  uploadJobMediaDrafts: jest.fn(),
  uploadKaelChatMediaDrafts: (...args: unknown[]) => mockUpload(...args),
}))

jest.mock('@/lib/services', () => ({
  workerKaelChatService: {
    create: jest.fn(),
    get: (...args: unknown[]) => mockGet(...args),
    sendTurn: jest.fn(),
    streamTurn: (...args: unknown[]) => mockStreamTurn(...args),
  },
}))

function turn(id: string, role: 'worker' | 'kael', text: string, turnIndex: number) {
  return {
    content_type: 'text' as const,
    created_at: '2026-09-29T00:00:00.000Z',
    id,
    media_refs: [],
    role,
    safety_notes: [],
    session_id: 'session-1',
    text_content: text,
    turn_index: turnIndex,
  }
}

function sessionResponse(turns: ReturnType<typeof turn>[]) {
  return {
    session: {
      closed_at: null,
      id: 'session-1',
      job_id: null,
      mode: 'normal' as const,
      pinned_at: null,
      progress: null,
      started_at: '2026-09-29T00:00:00.000Z',
      status: 'active' as const,
      title: null,
      total_turns: turns.length,
      worker_id: 'worker-1',
    },
    turns,
  } as unknown as WorkerKaelChatResponse
}

// The stream only ends when the stop aborts it, like a long Kael answer on a real connection.
function streamUntilStopped() {
  mockStreamTurn.mockImplementation((_id: string, _input: unknown, _handlers: unknown, signal: AbortSignal) => new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve({ success: false, code: 'REQUEST_CANCELLED', error: 'stopped', status: 0 }))
  }))
}

function startSend({ media = false }: { media?: boolean } = {}) {
  let turns: WorkerV5KaelOrbLocalTurn[] = []
  const abortControllerRef = { current: null as AbortController | null }
  const setError = jest.fn()
  const reasoning = { applyStreamEvent: jest.fn(), begin: jest.fn(), fail: jest.fn(), reset: jest.fn() }
  const noop = () => undefined
  const promise = createWorkerKaelOrbSendAction({
    abortControllerRef,
    activeJobIdRef: { current: null },
    activeModeRef: { current: 'normal' },
    activeOwnerRef: { current: { key: 'worker-1' } },
    advisoryUnavailableReply: '',
    busy: false,
    cacheSessionResponse: noop,
    canUseKaelSession: true,
    commitSessionSummary: noop,
    getCachedSessionResponse: () => sessionResponse([]),
    isLocalVisualAuditSession: false,
    language: 'vi',
    locallyCreatedSessionIdsRef: { current: new Set() },
    mediaItems: media ? [{ fileName: 'photo.jpg', uri: 'file:///photo.jpg' }] : [],
    mode: 'normal',
    openingSessionId: null,
    owner: { key: 'worker-1' },
    reasoningActions: reasoning as never,
    sendRequestRef: { current: 0 },
    sessionJobId: null,
    sessionRef: { current: { jobId: null, mode: 'normal', sessionId: 'session-1' } },
    setActiveSessionId: noop,
    setBusy: noop,
    setError,
    setMediaItems: noop,
    setProgress: noop,
    setStreamingReply: noop,
    setTurns: (next) => { turns = typeof next === 'function' ? next(turns) : next },
  })(QUESTION)
  return { abortControllerRef, getTurns: () => turns, promise, reasoning, setError }
}

async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

beforeEach(() => {
  mockStreamTurn.mockReset()
  mockGet.mockReset()
  mockUpload.mockReset()
  mockCleanup.mockClear()
})

describe('worker Kael stop response', () => {
  it('aborts the real stream and drops the local bubble when nothing committed', async () => {
    streamUntilStopped()
    mockGet.mockResolvedValue({ success: true, data: sessionResponse([]) })
    const { abortControllerRef, getTurns, promise, reasoning, setError } = startSend()
    await flush()
    expect(getTurns().map((item) => item.text)).toEqual([QUESTION])
    abortControllerRef.current?.abort()
    withPillarContext(
      PILLAR,
      () => {
        expect((mockStreamTurn.mock.calls[0]?.[3] as AbortSignal).aborted).toBe(true)
      },
      'the stop button must cancel the network request, not only hide the spinner',
    )
    await expect(promise).resolves.toBe(false)
    withPillarContext(
      PILLAR,
      () => {
        expect(getTurns()).toEqual([])
        expect(setError).toHaveBeenLastCalledWith(null)
        expect(reasoning.fail).not.toHaveBeenCalled()
        expect(abortControllerRef.current).toBeNull()
      },
      'a stop is the worker choice, not a failure: no error and the draft stays in the composer',
    )
  })

  it('shows the reply when the server committed it before the stop arrived', async () => {
    streamUntilStopped()
    mockGet.mockResolvedValue({
      success: true,
      data: sessionResponse([turn('t-1', 'worker', QUESTION, 0), turn('t-2', 'kael', 'Ngắt CB trước khi kiểm tra.', 1)]),
    })
    const { abortControllerRef, getTurns, promise } = startSend()
    await flush()
    abortControllerRef.current?.abort()
    await expect(promise).resolves.toBe(true)
    expect(getTurns().map((item) => item.text)).toEqual([QUESTION, 'Ngắt CB trước khi kiểm tra.'])
  })

  it('says the outcome is uncertain when only the question committed', async () => {
    streamUntilStopped()
    mockGet.mockResolvedValue({ success: true, data: sessionResponse([turn('t-1', 'worker', QUESTION, 0)]) })
    const { abortControllerRef, getTurns, promise, setError } = startSend()
    await flush()
    abortControllerRef.current?.abort()
    await expect(promise).resolves.toBe(false)
    withPillarContext(
      PILLAR,
      () => {
        expect(getTurns().map((item) => item.text)).toEqual([QUESTION])
        expect(setError).toHaveBeenLastCalledWith(expect.stringContaining('Chưa xác nhận được Kael đã nhận tin nhắn'))
      },
      'a question the server stored must not vanish from the screen as if it was never sent',
    )
  })

  it('sends nothing and releases the photo when stopped during the upload', async () => {
    let finishUpload: (value: unknown) => void = () => undefined
    mockUpload.mockReturnValue(new Promise((resolve) => { finishUpload = resolve }))
    const { abortControllerRef, getTurns, promise } = startSend({ media: true })
    await flush()
    abortControllerRef.current?.abort()
    finishUpload({ success: true, mediaRefs: [REF] })
    await expect(promise).resolves.toBe(false)
    expect(mockStreamTurn).not.toHaveBeenCalled()
    expect(mockCleanup).toHaveBeenCalledWith([REF])
    expect(getTurns()).toEqual([])
  })
})

describe('worker Kael composer stop button', () => {
  function mountComposer({ sending, stopAvailable }: { sending: boolean; stopAvailable: boolean }) {
    const onStop = jest.fn()
    const onSend = jest.fn(async () => true)
    render(
      <WorkerV5KaelOrbComposer
        busy={sending}
        language="vi"
        mediaCount={0}
        mode="normal"
        onPickMedia={() => undefined}
        onSend={onSend}
        onStop={onStop}
        reduceMotion
        reduceTransparency={false}
        sending={sending}
        stopAvailable={stopAvailable}
      />,
    )
    return { onSend, onStop }
  }

  it('turns the send arrow into a stop square that stops Kael while it answers', () => {
    const { onSend, onStop } = mountComposer({ sending: true, stopAvailable: true })
    const button = screen.getByTestId('worker-v5-kael-orb-send')
    withPillarContext(
      PILLAR,
      () => {
        expect(screen.getByTestId('worker-v5-kael-orb-stop-square')).toBeOnTheScreen()
        expect(screen.queryByTestId('worker-v5-kael-orb-send-arrow')).toBeNull()
        expect(button.props.accessibilityLabel).toBe('Dừng phản hồi')
        expect(button.props.accessibilityState).toMatchObject({ disabled: false })
      },
      'while Kael answers the same button offers stop, matching the Customer composer',
    )
    fireEvent.press(button)
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('keeps a disabled arrow where stop is not offered', () => {
    mountComposer({ sending: true, stopAvailable: false })
    expect(screen.getByTestId('worker-v5-kael-orb-send-arrow')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-orb-stop-square')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-orb-send').props.accessibilityState).toMatchObject({ disabled: true })
  })
})
