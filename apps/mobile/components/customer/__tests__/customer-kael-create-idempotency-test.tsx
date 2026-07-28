import { useRef } from 'react'
import { act, renderHook } from '@testing-library/react-native'
import type { LocalDeal, ServiceType } from '@nestscout/shared'

const mockCleanupKaelChatMediaRefs = jest.fn()
const mockKaelChatCreate = jest.fn()
const mockKaelChatGet = jest.fn()
const mockKaelChatRestSendTurn = jest.fn()
const mockKaelChatSendTurn = jest.fn()
const mockCatalogSendTurn = jest.fn()
const mockJobIncidentSend = jest.fn()
const mockUploadKaelChatMediaDrafts = jest.fn()

jest.mock('@/lib/services', () => ({
  jobService: {},
  kaelAssistantService: { ask: jest.fn() },
  kaelChatService: {
    create: (...args: unknown[]) => mockKaelChatCreate(...args),
    get: (...args: unknown[]) => mockKaelChatGet(...args),
    sendTurn: (...args: unknown[]) => mockKaelChatRestSendTurn(...args),
  },
  kaelChatStreamService: {
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
import { useCustomerKaelChatUiState } from '../kael-chat/use-customer-kael-chat-ui-state'
import { useCustomerKaelConversationState } from '../kael-chat/use-customer-kael-conversation-state'
import { useCustomerKaelMessageActions } from '../kael-chat/use-customer-kael-message-actions'
import { useCustomerKaelRequestGuard } from '../kael-chat/customer-kael-state-scope'

function kaelChatResponse() {
  return {
    session: {
      case_phase: 'analysis' as const,
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
      startEvidenceProcessLines: () => undefined,
      startProcessLines: async () => undefined,
      stopProcessLines: () => undefined,
      updateEvidenceProcessProgress: () => undefined,
    },
    requestOwnerKey: ownerKey,
    selectedService: 'electrical',
    selectedServiceRef,
  })
  return { chatUi, conversation, messageActions }
}

function useLinkedCaseMessageHarness(replyReveal: Promise<void>) {
  const chatUi = useCustomerKaelChatUiState()
  const conversation = useCustomerKaelConversationState({
    initialLoading: false,
    initialMode: 'case',
    pendingDraft: null,
  })
  const kaelRequestGuard = useCustomerKaelRequestGuard('customer-a:case')
  const selectedServiceRef = useRef<ServiceType | null>('electrical')
  const messageActions = useCustomerKaelMessageActions({
    chatUi,
    conversation,
    conversations: {
      sendConversationTurn: (...args: unknown[]) => mockCatalogSendTurn(...args),
      sessionsError: null,
    } as unknown as NonNullable<Parameters<typeof useCustomerKaelMessageActions>[0]['conversations']>,
    deal: {
      draft: { mediaCount: 0, serviceType: 'electrical' },
      estimate: null,
      id: 'job-a',
    } as unknown as LocalDeal,
    hasSharedJobIncident: true,
    jobIncidentThread: {
      error: null,
      send: (...args: unknown[]) => mockJobIncidentSend(...args),
    } as unknown as Parameters<typeof useCustomerKaelMessageActions>[0]['jobIncidentThread'],
    kaelRequestGuard,
    language: 'vi',
    mode: 'case',
    processController: {
      processLines: null,
      startProcessLines: () => replyReveal,
      stopProcessLines: jest.fn(),
    } as unknown as Parameters<typeof useCustomerKaelMessageActions>[0]['processController'],
    requestOwnerKey: 'customer-a:case',
    selectedService: 'electrical',
    selectedServiceRef,
  })
  return { chatUi, conversation, messageActions }
}

describe('customer Kael create idempotency', () => {
  beforeEach(() => {
    mockCleanupKaelChatMediaRefs.mockReset()
    mockCatalogSendTurn.mockReset()
    mockJobIncidentSend.mockReset()
    mockCleanupKaelChatMediaRefs.mockResolvedValue(true)
    mockKaelChatCreate.mockReset()
    mockKaelChatGet.mockReset()
    mockKaelChatRestSendTurn.mockReset()
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

  it('keeps an active Case Work turn on the canonical Agentic session and reveals Kael after Process Lines', async () => {
    let resolveReplyReveal!: () => void
    const replyReveal = new Promise<void>((resolve) => {
      resolveReplyReveal = resolve
    })
    let resolveTurn!: (value: { data: ReturnType<typeof kaelChatResponse>; success: true }) => void
    mockKaelChatSendTurn.mockImplementationOnce(() => new Promise((resolve) => {
      resolveTurn = resolve
    }))
    const { result } = renderHook(() => useLinkedCaseMessageHarness(replyReveal))
    const activeChat = {
      ...kaelChatResponse(),
      session: {
        ...kaelChatResponse().session,
        job_id: 'job-a',
        status: 'active' as const,
      },
    }
    act(() => {
      result.current.conversation.setChat(activeChat)
      result.current.conversation.setTurns(activeChat.turns)
      result.current.chatUi.setDraft('Ở căn hộ tầng 37. Nằm ở phòng khách')
    })

    let send!: Promise<void>
    act(() => {
      send = result.current.messageActions.sendMessage()
    })

    expect(result.current.chatUi.draft).toBe('')
    expect(mockKaelChatSendTurn).toHaveBeenCalledWith(
      'session-a',
      expect.objectContaining({ message: 'Ở căn hộ tầng 37. Nằm ở phòng khách' }),
    )
    expect(mockKaelChatRestSendTurn).not.toHaveBeenCalled()
    expect(mockCatalogSendTurn).not.toHaveBeenCalled()
    expect(mockJobIncidentSend).not.toHaveBeenCalled()

    const completedChat = {
      ...activeChat,
      turns: [{ id: 'kael-next', role: 'kael', text_content: 'Ổ cắm có vết cháy hoặc phát tia lửa không?' }],
    } as unknown as ReturnType<typeof kaelChatResponse>
    await act(async () => {
      resolveTurn({ data: completedChat, success: true })
      await Promise.resolve()
    })
    expect(result.current.conversation.chat?.turns).toEqual([])

    await act(async () => {
      resolveReplyReveal()
      await send
    })
    expect(result.current.conversation.chat?.turns).toEqual(completedChat.turns)
  })

  it('recovers the authoritative turns when the stream result is lost after Edge committed them', async () => {
    const activeChat = {
      ...kaelChatResponse(),
      session: { ...kaelChatResponse().session, total_turns: 2 },
    }
    const recoveredChat = {
      ...activeChat,
      session: { ...activeChat.session, total_turns: 4 },
      turns: [
        {
          id: 'customer-next',
          role: 'customer',
          text_content: 'Nghĩa là sao? Giải thích thêm đi',
          turn_index: 3,
        },
        {
          id: 'kael-next',
          role: 'kael',
          text_content: 'Kael cần biết hạng mục cụ thể để chọn đúng quy trình kiểm tra.',
          turn_index: 4,
        },
      ],
    } as unknown as ReturnType<typeof kaelChatResponse>
    mockKaelChatSendTurn.mockResolvedValue({
      code: 'STREAM_RESULT_INVALID',
      error: 'invalid stream result',
      status: 200,
      success: false,
    })
    mockKaelChatGet.mockResolvedValue({ data: recoveredChat, status: 200, success: true })
    const { result } = renderHook(() => useCustomerKaelCreateHarness())
    act(() => {
      result.current.conversation.setChat(activeChat)
      result.current.conversation.setTurns(activeChat.turns)
      result.current.chatUi.setDraft('Nghĩa là sao? Giải thích thêm đi')
    })

    await act(async () => {
      await result.current.messageActions.sendMessage()
    })

    expect(mockKaelChatGet).toHaveBeenCalledWith('session-a')
    expect(result.current.conversation.error).toBeNull()
    expect(result.current.chatUi.draft).toBe('')
    expect(result.current.conversation.chat?.turns).toEqual(recoveredChat.turns)
  })
})
