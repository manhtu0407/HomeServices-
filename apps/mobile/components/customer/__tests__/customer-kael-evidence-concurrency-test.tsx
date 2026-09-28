import { act, renderHook } from '@testing-library/react-native'

import type { KaelResponseStreamState } from '@/lib/kael-response-stream'

import { createCustomerKaelRequestGuard } from '../kael-chat/customer-kael-state-scope'
import { useCustomerKaelEvidenceActions } from '../kael-chat/use-customer-kael-evidence-actions'

const mockCleanupKaelChatMediaRefs = jest.fn()
const mockHydrateRemoteJobById = jest.fn()
const mockRequestMediaLibraryPermissions = jest.fn()
const mockLaunchImageLibrary = jest.fn()
const mockSubmitEvidence = jest.fn()
const mockStreamEvidence = jest.fn()
const mockUploadKaelChatMediaDrafts = jest.fn()

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
  requestMediaLibraryPermissionsAsync: () => mockRequestMediaLibraryPermissions(),
}))

jest.mock('@/lib/media-upload', () => ({
  cleanupKaelChatMediaRefs: (...args: unknown[]) => mockCleanupKaelChatMediaRefs(...args),
  localizeMediaUploadFailure: jest.fn(() => 'media upload failed'),
  uploadJobMediaDrafts: jest.fn(),
  uploadKaelChatMediaDrafts: (...args: unknown[]) => mockUploadKaelChatMediaDrafts(...args),
}))

jest.mock('@/lib/services', () => ({
  jobService: { sendMessage: jest.fn() },
  kaelChatService: {
    sendTurn: jest.fn(),
    submitEvidence: (...args: unknown[]) => mockSubmitEvidence(...args),
  },
  kaelChatStreamService: {
    submitEvidence: (...args: unknown[]) => mockStreamEvidence(...args),
  },
}))

function evidenceHarness(agenticEvidenceReason = 'Không có ảnh hiện trạng lúc này', mode: 'case' | 'normal' = 'case') {
  const caseUi = {
    clearCaseEvidenceDraft: jest.fn(),
    setSubmittingCaseEvidence: jest.fn(),
    submittingCaseEvidence: false,
  } as any
  const chatUi = {
    agenticEvidenceReason,
    setAgenticEvidenceReason: jest.fn(),
    setAgenticEvidenceRejectOpen: jest.fn(),
    setSubmittingAgenticEvidence: jest.fn(),
    setUploadingMedia: jest.fn(),
    setVoiceTranscript: jest.fn(),
    submittingAgenticEvidence: false,
    uploadingMedia: false,
    voiceTranscript: '',
  } as any
  const conversation = {
    chat: {
      session: { id: 'session-a', service_type: 'electrical' },
    },
    composerMediaDrafts: [],
    pendingDraft: null,
    setChat: jest.fn(),
    setComposerMediaDrafts: jest.fn(),
    setError: jest.fn(),
    setLoading: jest.fn(),
    setRouteDraftEvidencePending: jest.fn(),
    setStreamingReply: jest.fn(),
    setTurns: jest.fn(),
    turns: [],
  } as any
  const processController = {
    startEvidenceProcessLines: jest.fn(),
    startProcessLines: jest.fn(async () => undefined),
    stopProcessLines: jest.fn(),
    updateEvidenceProcessProgress: jest.fn(),
  } as any
  const input = {
    agenticEvidenceGateActive: true,
    caseEvidenceGateActive: true,
    caseUi,
    chatUi,
    conversation,
    deal: {
      draft: { mediaCount: 0, serviceType: 'electrical' },
      estimate: null,
      id: 'job-a',
    } as any,
    hydrateRemoteJobById: mockHydrateRemoteJobById,
    kaelRequestGuard: createCustomerKaelRequestGuard('customer-a:session-a'),
    language: 'vi' as const,
    mode,
    pendingDraftLocalizedMessage: null,
    pendingDraftOwnerId: 'customer-a',
    processController,
    selectedService: 'electrical' as const,
  }
  return { caseUi, chatUi, conversation, input, processController }
}

describe('customer Kael evidence concurrency', () => {
  beforeEach(() => {
    mockCleanupKaelChatMediaRefs.mockReset()
    mockCleanupKaelChatMediaRefs.mockResolvedValue(true)
    mockHydrateRemoteJobById.mockReset()
    mockHydrateRemoteJobById.mockResolvedValue(true)
    mockLaunchImageLibrary.mockReset()
    mockLaunchImageLibrary.mockResolvedValue({ assets: [], canceled: true })
    mockRequestMediaLibraryPermissions.mockReset()
    mockRequestMediaLibraryPermissions.mockResolvedValue({ granted: true })
    mockUploadKaelChatMediaDrafts.mockReset()
    mockSubmitEvidence.mockReset()
    mockStreamEvidence.mockReset()
  })

  it('starts one agentic evidence request per session and releases the lane after rejection', async () => {
    let rejectSubmit!: (reason?: unknown) => void
    mockStreamEvidence.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectSubmit = reject
    }))
    const harness = evidenceHarness()
    const { result } = renderHook(() => useCustomerKaelEvidenceActions(harness.input))
    let firstSubmit!: Promise<void>
    let duplicateSubmit!: Promise<void>

    act(() => {
      firstSubmit = result.current.submitAgenticEvidence('skipped')
      duplicateSubmit = result.current.submitAgenticEvidence('skipped')
    })

    expect(mockStreamEvidence).toHaveBeenCalledTimes(1)
    await act(async () => {
      rejectSubmit(new Error('network unavailable'))
      await Promise.all([firstSubmit, duplicateSubmit])
    })
    expect(harness.conversation.setError).toHaveBeenCalledWith('Chưa thể gửi bằng chứng lúc này. Vui lòng thử lại.')
    expect(harness.chatUi.setSubmittingAgenticEvidence).toHaveBeenLastCalledWith(false)

    mockStreamEvidence.mockResolvedValueOnce({ code: 'UNAVAILABLE', error: 'not saved', success: false })
    await act(async () => {
      await result.current.submitAgenticEvidence('skipped')
    })
    expect(mockStreamEvidence).toHaveBeenCalledTimes(2)
  })

  it('requires a short reason before skipping an optional evidence request', async () => {
    const harness = evidenceHarness('   ')
    const { result } = renderHook(() => useCustomerKaelEvidenceActions(harness.input))

    await act(async () => {
      await result.current.submitAgenticEvidence('skipped')
    })

    expect(mockStreamEvidence).not.toHaveBeenCalled()
    expect(harness.conversation.setError).toHaveBeenCalledWith(
      'Nhập lý do ngắn trước khi tiếp tục không có bằng chứng.',
    )
  })

  it('forwards verified evidence stream progress to the process lines', async () => {
    const progress = {
      current_stage: 'vision_analysis',
      failure_reason: null,
      progress: 0.4,
      status: 'running',
      updated_at: '2026-07-27T04:00:00.000Z',
    } as const
    mockStreamEvidence.mockImplementationOnce(async (
      _sessionId: string,
      _input: unknown,
      handlers: { onStage?: (event: { progress: typeof progress }) => void },
    ) => {
      handlers.onStage?.({ progress })
      return { data: { session: {}, turns: [] }, success: true }
    })
    const harness = evidenceHarness()
    const { result } = renderHook(() => useCustomerKaelEvidenceActions(harness.input))

    await act(async () => {
      await result.current.submitAgenticEvidence('skipped')
    })

    expect(harness.processController.startEvidenceProcessLines).toHaveBeenCalledWith({
      hasImage: false,
      hasVideo: false,
      hasVoiceTranscript: false,
      serviceType: 'electrical',
    })
    expect(harness.processController.updateEvidenceProcessProgress).toHaveBeenCalledWith(progress)
  })

  it('keeps an evidence submission current while same-scope hydration refreshes', async () => {
    let resolveUpload!: (value: unknown) => void
    mockUploadKaelChatMediaDrafts.mockImplementationOnce(() => new Promise((resolve) => {
      resolveUpload = resolve
    }))
    mockStreamEvidence.mockResolvedValueOnce({
      data: { session: {}, turns: [] },
      success: true,
    })
    const harness = evidenceHarness()
    harness.conversation.composerMediaDrafts = [{
      fileName: 'hinge.jpg',
      fileSizeBytes: 2_048,
      mimeType: 'image/jpeg',
      type: 'image',
      uri: 'file:///hinge.jpg',
    }]
    const { result } = renderHook(() => useCustomerKaelEvidenceActions(harness.input))
    let submission!: Promise<void>

    act(() => {
      submission = result.current.submitAgenticEvidence('confirmed')
    })
    harness.input.kaelRequestGuard.begin('conversation')
    await act(async () => {
      resolveUpload({
        evidenceItems: [{
          kind: 'photo',
          model_eligible: true,
          ref: 'supabase://kael-chat-media/customer-a/hinge.jpg',
        }],
        mediaRefs: ['supabase://kael-chat-media/customer-a/hinge.jpg'],
        success: true,
        urls: [],
      })
      await submission
    })

    expect(mockStreamEvidence).toHaveBeenCalledTimes(1)
  })

  it('streams the committed Kael estimate response while evidence analysis is still visible', async () => {
    mockStreamEvidence.mockImplementationOnce(async (
      _sessionId: string,
      _input: unknown,
      handlers: {
        onResponseDelta?: (event: { delta: string; turnId: string }) => void
      },
    ) => {
      handlers.onResponseDelta?.({ delta: 'Kael đã hoàn tất ', turnId: 'turn-estimate' })
      handlers.onResponseDelta?.({ delta: 'phân tích.', turnId: 'turn-estimate' })
      return { data: { session: {}, turns: [] }, success: true }
    })
    const harness = evidenceHarness()
    const { result } = renderHook(() => useCustomerKaelEvidenceActions(harness.input))

    await act(async () => {
      await result.current.submitAgenticEvidence('skipped')
    })

    expect(mockStreamEvidence).toHaveBeenCalledWith(
      'session-a',
      expect.any(Object),
      expect.objectContaining({ onResponseDelta: expect.any(Function) }),
    )
    let streamed: KaelResponseStreamState | null = null
    for (const [updater] of harness.conversation.setStreamingReply.mock.calls) {
      if (typeof updater === 'function') streamed = updater(streamed)
    }
    expect(streamed).toMatchObject({
      blocks: {
        'turn-estimate:block:0': {
          text: 'Kael đã hoàn tất phân tích.',
        },
      },
      responseId: 'turn-estimate',
      status: 'completed',
      transport: 'legacy',
    })
  })

  it('starts one case evidence refresh per job and releases the lane after rejection', async () => {
    let rejectHydration!: (reason?: unknown) => void
    mockHydrateRemoteJobById.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectHydration = reject
    }))
    const harness = evidenceHarness()
    const { result } = renderHook(() => useCustomerKaelEvidenceActions(harness.input))
    let firstSubmit!: Promise<void>
    let duplicateSubmit!: Promise<void>

    act(() => {
      firstSubmit = result.current.submitCaseEvidence('skipped')
      duplicateSubmit = result.current.submitCaseEvidence('skipped')
    })

    expect(mockHydrateRemoteJobById).toHaveBeenCalledTimes(1)
    await act(async () => {
      rejectHydration(new Error('network unavailable'))
      await Promise.all([firstSubmit, duplicateSubmit])
    })
    expect(harness.conversation.setError).toHaveBeenCalledWith('Chưa thể gửi bằng chứng lúc này. Vui lòng thử lại.')
    expect(harness.caseUi.setSubmittingCaseEvidence).toHaveBeenLastCalledWith(false)

    mockHydrateRemoteJobById.mockResolvedValueOnce(true)
    await act(async () => {
      await result.current.submitCaseEvidence('skipped')
    })
    expect(mockHydrateRemoteJobById).toHaveBeenCalledTimes(2)
    expect(harness.caseUi.clearCaseEvidenceDraft).toHaveBeenCalledTimes(1)
  })

  it('turns a rejected media-library launch into a retryable UI error', async () => {
    mockLaunchImageLibrary.mockRejectedValueOnce(new Error('media bridge unavailable'))
    const harness = evidenceHarness()
    const { result } = renderHook(() => useCustomerKaelEvidenceActions(harness.input))

    await act(async () => {
      await result.current.pickComposerMedia()
    })

    expect(harness.conversation.setError).toHaveBeenCalledWith('Chưa thể mở thư viện ảnh/video lúc này. Vui lòng thử lại.')
    await act(async () => {
      await result.current.pickComposerMedia()
    })
    expect(mockRequestMediaLibraryPermissions).not.toHaveBeenCalled()
    expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(2)
  })

  it('keeps the case composer media picker available after the evidence gate closes', async () => {
    mockLaunchImageLibrary.mockResolvedValueOnce({
      assets: [{
        duration: null,
        fileName: 'outlet-evidence.png',
        fileSize: 2048,
        mimeType: 'image/png',
        type: 'image',
        uri: 'file:///outlet-evidence.png',
      }],
      canceled: false,
    })
    const harness = evidenceHarness()
    harness.input.agenticEvidenceGateActive = false
    harness.input.caseEvidenceGateActive = false
    const { result } = renderHook(() => useCustomerKaelEvidenceActions(harness.input))

    await act(async () => {
      await result.current.pickComposerMedia()
    })

    expect(mockRequestMediaLibraryPermissions).not.toHaveBeenCalled()
    expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1)
    expect(harness.conversation.setComposerMediaDrafts).toHaveBeenCalledTimes(1)
  })

  it('opens an image-only picker for normal chat and ignores any returned video assets', async () => {
    mockLaunchImageLibrary.mockResolvedValueOnce({
      assets: [
        {
          duration: null,
          fileName: 'room-photo.png',
          fileSize: 2048,
          mimeType: 'image/png',
          type: 'image',
          uri: 'file:///room-photo.png',
        },
        {
          duration: 5000,
          fileName: 'room-video.mp4',
          fileSize: 4096,
          mimeType: 'video/mp4',
          type: 'video',
          uri: 'file:///room-video.mp4',
        },
      ],
      canceled: false,
    })
    const harness = evidenceHarness(undefined, 'normal')
    const { result } = renderHook(() => useCustomerKaelEvidenceActions(harness.input))

    await act(async () => {
      await result.current.pickComposerMedia()
    })

    expect(mockLaunchImageLibrary).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'] }))
    const updateDrafts = harness.conversation.setComposerMediaDrafts.mock.calls[0][0]
    expect(updateDrafts([])).toEqual([expect.objectContaining({ type: 'image', uri: 'file:///room-photo.png' })])
  })
})
