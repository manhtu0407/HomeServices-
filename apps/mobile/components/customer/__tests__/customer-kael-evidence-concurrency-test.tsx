import { act, renderHook } from '@testing-library/react-native'

import { createCustomerKaelRequestGuard } from '../v21/customer-kael-state-scope'
import { useCustomerKaelEvidenceActions } from '../v21/use-customer-kael-evidence-actions'

const mockCleanupKaelChatMediaRefs = jest.fn()
const mockHydrateRemoteJobById = jest.fn()
const mockRequestMediaLibraryPermissions = jest.fn()
const mockLaunchImageLibrary = jest.fn()
const mockSubmitEvidence = jest.fn()

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
  requestMediaLibraryPermissionsAsync: () => mockRequestMediaLibraryPermissions(),
}))

jest.mock('@/lib/media-upload', () => ({
  cleanupKaelChatMediaRefs: (...args: unknown[]) => mockCleanupKaelChatMediaRefs(...args),
  localizeMediaUploadFailure: jest.fn(() => 'media upload failed'),
  uploadJobMediaDrafts: jest.fn(),
  uploadKaelChatMediaDrafts: jest.fn(),
}))

jest.mock('@/lib/services', () => ({
  jobService: { sendMessage: jest.fn() },
  kaelChatService: {
    sendTurn: jest.fn(),
    submitEvidence: (...args: unknown[]) => mockSubmitEvidence(...args),
  },
}))

function evidenceHarness() {
  const caseUi = {
    clearCaseEvidenceDraft: jest.fn(),
    setSubmittingCaseEvidence: jest.fn(),
    submittingCaseEvidence: false,
  } as any
  const chatUi = {
    agenticEvidenceReason: '',
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
    setTurns: jest.fn(),
    turns: [],
  } as any
  const processController = {
    startProcessLines: jest.fn(async () => undefined),
    stopProcessLines: jest.fn(),
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
    mode: 'case' as const,
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
    mockSubmitEvidence.mockReset()
  })

  it('starts one agentic evidence request per session and releases the lane after rejection', async () => {
    let rejectSubmit!: (reason?: unknown) => void
    mockSubmitEvidence.mockImplementationOnce(() => new Promise((_, reject) => {
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

    expect(mockSubmitEvidence).toHaveBeenCalledTimes(1)
    await act(async () => {
      rejectSubmit(new Error('network unavailable'))
      await Promise.all([firstSubmit, duplicateSubmit])
    })
    expect(harness.conversation.setError).toHaveBeenCalledWith('Chưa thể gửi bằng chứng lúc này. Vui lòng thử lại.')
    expect(harness.chatUi.setSubmittingAgenticEvidence).toHaveBeenLastCalledWith(false)

    mockSubmitEvidence.mockResolvedValueOnce({ code: 'UNAVAILABLE', error: 'not saved', success: false })
    await act(async () => {
      await result.current.submitAgenticEvidence('skipped')
    })
    expect(mockSubmitEvidence).toHaveBeenCalledTimes(2)
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

  it('turns a rejected media permission lookup into a retryable UI error', async () => {
    mockRequestMediaLibraryPermissions.mockRejectedValueOnce(new Error('permission bridge unavailable'))
    const harness = evidenceHarness()
    const { result } = renderHook(() => useCustomerKaelEvidenceActions(harness.input))

    await act(async () => {
      await result.current.pickComposerMedia()
    })

    expect(harness.conversation.setError).toHaveBeenCalledWith('Chưa thể mở thư viện ảnh/video lúc này. Vui lòng thử lại.')
    await act(async () => {
      await result.current.pickComposerMedia()
    })
    expect(mockRequestMediaLibraryPermissions).toHaveBeenCalledTimes(2)
    expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1)
  })
})
