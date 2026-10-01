import type { WorkerKaelChatMode } from '@nestscout/shared'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { createWorkerKaelOrbSendAction } from '../chat/kael-orb-send-action'

export const PILLAR = {
  id: 'P294-worker-kael-general-chat-photo',
  invariant: 'a worker photo in general Chat is uploaded to the worker Kael chat media and its refs ride the turn; a job conversation files photos with the job; a intake conversation with no job refuses photos before any upload; a failed upload sends no turn',
  authority: ['governance/RULES.md #8 (no fake success: a shown camera must reach Kael)', 'governance/RULES.md #6-#7 (server-side vision, trusted media refs only)'],
  target: 'apps/mobile/components/worker/chat/kael-orb-send-action.ts',
  layer: 'unit',
  siblings: ['P254-customer-kael-uncertain-turn-media', 'P291-kael-vision-image-privacy'],
  mutation: 'route job-less photos through uploadJobMediaDrafts, drop media_refs from the turn, or restore the job-only guard for normal mode — the general-chat case turns red',
} as const satisfies PillarManifest

const GENERAL_REF = 'supabase://kael-chat-media/worker-1/kael-chat/model_vision/photo.jpg'
const mockUploadKaelChat = jest.fn()
const mockUploadJob = jest.fn()
const mockStreamTurn = jest.fn()

jest.mock('@/lib/media-upload', () => ({
  uploadJobMediaDrafts: (...args: unknown[]) => mockUploadJob(...args),
  uploadKaelChatMediaDrafts: (...args: unknown[]) => mockUploadKaelChat(...args),
}))

jest.mock('@/lib/services', () => ({
  workerKaelChatService: {
    create: jest.fn(),
    get: jest.fn(),
    sendTurn: jest.fn(),
    streamTurn: (...args: unknown[]) => mockStreamTurn(...args),
  },
}))

function send({ jobId = null, mode = 'normal' }: { jobId?: string | null; mode?: WorkerKaelChatMode } = {}) {
  const setError = jest.fn()
  const noop = () => undefined
  const action = createWorkerKaelOrbSendAction({
    abortControllerRef: { current: null },
    activeJobIdRef: { current: jobId },
    activeModeRef: { current: mode },
    activeOwnerRef: { current: { key: 'worker-1' } },
    advisoryUnavailableReply: '',
    busy: false,
    cacheSessionResponse: noop,
    canUseKaelSession: true,
    commitSessionSummary: noop,
    getCachedSessionResponse: () => undefined,
    isLocalVisualAuditSession: false,
    language: 'vi',
    locallyCreatedSessionIdsRef: { current: new Set() },
    mediaItems: [{ fileName: 'photo.jpg', uri: 'file:///photo.jpg' }],
    mode,
    openingSessionId: null,
    owner: { key: 'worker-1' },
    reasoningActions: { applyStreamEvent: noop, begin: noop, fail: noop, reset: noop } as never,
    sendRequestRef: { current: 0 },
    sessionJobId: jobId,
    sessionRef: { current: { jobId, mode, sessionId: 'session-1' } },
    setActiveSessionId: noop,
    setBusy: noop,
    setError,
    setMediaItems: noop,
    setProgress: noop,
    setStreamingReply: noop,
    setTurns: noop,
  })
  return { promise: action('Ổ cắm này bị cháy xém'), setError }
}

beforeEach(() => {
  mockUploadKaelChat.mockReset().mockResolvedValue({ success: true, mediaRefs: [GENERAL_REF] })
  mockUploadJob.mockReset().mockResolvedValue({ success: true, mediaRefs: ['supabase://job-media/job-1/photo.jpg'] })
  mockStreamTurn.mockReset().mockResolvedValue({ success: false, code: 'INVALID_INPUT', error: 'stop', status: 400 })
})

describe('worker Kael general chat photos', () => {
  it('uploads a general-chat photo to Kael chat media and sends its ref with the turn', async () => {
    await send().promise
    withPillarContext(
      PILLAR,
      () => {
        expect(mockUploadKaelChat).toHaveBeenCalledWith([{ fileName: 'photo.jpg', type: 'image', uri: 'file:///photo.jpg' }])
        expect(mockUploadJob).not.toHaveBeenCalled()
        expect(mockStreamTurn).toHaveBeenCalledWith('session-1', expect.objectContaining({ media_refs: [GENERAL_REF] }), expect.any(Object), expect.any(AbortSignal))
      },
      'TestFlight 46: the worker composer had no camera in Chat; a camera that never reaches Kael would be fake UI',
    )
  })

  it('files a job conversation photo with the job', async () => {
    await send({ jobId: 'job-1', mode: 'intake' }).promise
    expect(mockUploadJob).toHaveBeenCalledWith('job-1', expect.any(Array), 'kael_reference')
    expect(mockUploadKaelChat).not.toHaveBeenCalled()
  })

  it('refuses a photo in a intake conversation that has no job, before any upload', async () => {
    const { promise, setError } = send({ mode: 'intake' })
    await promise
    withPillarContext(
      PILLAR,
      () => {
        expect(mockUploadKaelChat).not.toHaveBeenCalled()
        expect(mockUploadJob).not.toHaveBeenCalled()
        expect(mockStreamTurn).not.toHaveBeenCalled()
        expect(setError).toHaveBeenCalledWith('Ảnh chỉ dùng trong cuộc trò chuyện theo công việc.')
      },
      'only general Chat may carry job-less photos; the server refuses them for every other mode',
    )
  })

  it('sends no turn when the photo upload fails', async () => {
    mockUploadKaelChat.mockResolvedValueOnce({ success: false, error: 'Ảnh có vị trí GPS' })
    const { promise, setError } = send()
    expect(await promise).toBe(false)
    expect(mockStreamTurn).not.toHaveBeenCalled()
    expect(setError).toHaveBeenCalledWith('Ảnh có vị trí GPS')
  })
})
