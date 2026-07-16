import { useRef } from 'react'
import { act, renderHook } from '@testing-library/react-native'
import type { ServiceType } from '@nestscout/shared'

const mockCleanupKaelChatMediaRefs = jest.fn()
const mockKaelChatCreate = jest.fn()
const mockKaelChatSendTurn = jest.fn()
const mockUploadKaelChatMediaDrafts = jest.fn()

jest.mock('@/lib/services', () => ({
  jobService: {},
  kaelAssistantService: { ask: jest.fn() },
  kaelChatService: {
    create: (...args: unknown[]) => mockKaelChatCreate(...args),
    sendTurn: (...args: unknown[]) => mockKaelChatSendTurn(...args),
  },
}))

jest.mock('@/lib/media-upload', () => ({
  cleanupKaelChatMediaRefs: (...args: unknown[]) => mockCleanupKaelChatMediaRefs(...args),
  localizeMediaUploadFailure: jest.fn((failure: { error: string }) => failure.error),
  uploadKaelChatMediaDrafts: (...args: unknown[]) => mockUploadKaelChatMediaDrafts(...args),
}))

jest.mock('@/lib/realtime', () => ({
  subscribeToJobMessages: jest.fn(() => null),
}))

import { useJobChatThread } from '@/lib/use-job-chat-thread'
import { useCustomerKaelChatUiState } from '../v21/use-customer-kael-chat-ui-state'
import { useCustomerKaelConversationState } from '../v21/use-customer-kael-conversation-state'
import { useCustomerKaelMessageActions } from '../v21/use-customer-kael-message-actions'
import { useCustomerKaelRequestGuard } from '../v21/customer-kael-state-scope'

function kaelChatResponse() {
  return {
    session: {
      case_phase: 'intake' as const,
      customer_id: 'customer-a',
      diagnosis_scope: null,
      estimate: null,
      estimate_ready_at: null,
      id: 'session-a',
      job_id: null,
      next_action: 'ask_question' as const,
      scheduled_at: null,
      service_type: 'electrical' as const,
      started_at: '2026-07-15T00:00:00.000Z',
      status: 'active' as const,
      total_cost_usd: 0,
      total_turns: 0,
    },
    turns: [],
  }
}

function useCustomerKaelCreateHarness(ownerKey = 'customer-a:normal') {
  const chatUi = useCustomerKaelChatUiState()
  const conversation = useCustomerKaelConversationState({
    initialLoading: false,
    initialMode: 'normal',
    pendingDraft: null,
  })
  const jobIncidentThread = useJobChatThread(null, false)
  const kaelRequestGuard = useCustomerKaelRequestGuard(ownerKey)
  const selectedServiceRef = useRef<ServiceType | null>('electrical')
  const messageActions = useCustomerKaelMessageActions({
    chatUi,
    conversation,
    deal: null,
    hasSharedJobIncident: false,
    jobIncidentThread,
    kaelRequestGuard,
    language: 'vi',
    mode: 'normal',
    processController: {
      processLines: null,
      startProcessLines: async () => undefined,
      stopProcessLines: () => undefined,
    },
    requestOwnerKey: ownerKey,
    selectedService: 'electrical',
    selectedServiceRef,
  })
  return { chatUi, conversation, messageActions }
}

describe('customer Kael create idempotency', () => {
  beforeEach(() => {
    mockCleanupKaelChatMediaRefs.mockReset()
    mockCleanupKaelChatMediaRefs.mockResolvedValue(true)
    mockKaelChatCreate.mockReset()
    mockKaelChatSendTurn.mockReset()
    mockUploadKaelChatMediaDrafts.mockReset()
  })

  it('reuses the create key for the same manual retry and rotates it when the input changes', async () => {
    mockKaelChatCreate.mockResolvedValue({
      code: 'NETWORK_ERROR',
      error: 'ambiguous failure',
      status: 0,
      success: false,
    })
    const { result } = renderHook(() => useCustomerKaelCreateHarness())
    act(() => result.current.chatUi.setVoiceTranscript('broken outlet'))

    await act(async () => {
      await result.current.messageActions.sendMessage()
      await result.current.messageActions.sendMessage()
    })
    act(() => result.current.chatUi.setVoiceTranscript('burned power wire'))
    await act(async () => {
      await result.current.messageActions.sendMessage()
    })

    const firstKey = mockKaelChatCreate.mock.calls[0][0].client_request_id
    const retryKey = mockKaelChatCreate.mock.calls[1][0].client_request_id
    const changedInputKey = mockKaelChatCreate.mock.calls[2][0].client_request_id
    expect(retryKey).toBe(firstKey)
    expect(changedInputKey).not.toBe(firstKey)
  })

  it('reuses uploaded evidence and the exact create payload after an ambiguous failure', async () => {
    const mediaRef = 'supabase://kael-chat-media/customer-a/kael-chat/model_vision/photo-a.jpg'
    mockUploadKaelChatMediaDrafts.mockResolvedValue({
      evidenceItems: [{ kind: 'photo', model_eligible: true, ref: mediaRef }],
      mediaRefs: [mediaRef],
      success: true,
      urls: [],
    })
    mockKaelChatCreate
      .mockResolvedValueOnce({
        code: 'NETWORK_ERROR',
        error: 'ambiguous failure',
        status: 0,
        success: false,
      })
      .mockResolvedValueOnce({
        data: kaelChatResponse(),
        status: 200,
        success: true,
      })
    const { result } = renderHook(() => useCustomerKaelCreateHarness())
    act(() => result.current.conversation.setComposerMediaDrafts([{
      fileName: 'photo-a.jpg',
      type: 'image',
      uri: 'file:///photo-a.jpg',
    }]))

    await act(async () => {
      await result.current.messageActions.sendMessage()
      await result.current.messageActions.sendMessage()
    })

    expect(mockUploadKaelChatMediaDrafts).toHaveBeenCalledTimes(1)
    expect(mockCleanupKaelChatMediaRefs).not.toHaveBeenCalled()
    expect(mockKaelChatCreate.mock.calls[1][0]).toEqual(mockKaelChatCreate.mock.calls[0][0])
  })

  it('starts only one Kael request when send is called twice in one render', async () => {
    let resolveCreate!: (value: { code: string; error: string; status: number; success: false }) => void
    mockKaelChatCreate.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))
    const { result } = renderHook(() => useCustomerKaelCreateHarness())
    act(() => result.current.chatUi.setVoiceTranscript('broken outlet'))
    let firstSend!: Promise<void>
    let secondSend!: Promise<void>

    act(() => {
      firstSend = result.current.messageActions.sendMessage()
      secondSend = result.current.messageActions.sendMessage()
    })

    expect(mockKaelChatCreate).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveCreate({ code: 'NETWORK_ERROR', error: 'ambiguous failure', status: 0, success: false })
      await Promise.all([firstSend, secondSend])
    })
  })

  it('releases Kael send state after a thrown request and allows a retry', async () => {
    mockKaelChatCreate
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({
        code: 'NETWORK_ERROR',
        error: 'ambiguous failure',
        status: 0,
        success: false,
      })
    const { result } = renderHook(() => useCustomerKaelCreateHarness())
    act(() => result.current.chatUi.setVoiceTranscript('broken outlet'))

    await act(async () => {
      await result.current.messageActions.sendMessage()
    })

    expect(result.current.conversation.loading).toBe(false)
    expect(result.current.conversation.error).toBe('Kael đang không kết nối được. Vui lòng thử lại.')
    await act(async () => {
      await result.current.messageActions.sendMessage()
    })
    expect(mockKaelChatCreate).toHaveBeenCalledTimes(2)
  })
})
