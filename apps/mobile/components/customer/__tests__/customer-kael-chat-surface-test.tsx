import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { LOCAL_DEAL_ID, type LocalDeal } from '@nestscout/shared'

let mockRouteParams: Record<string, string | string[] | undefined>
let mockWorkflowValue: any
const mockReplace = jest.fn()
const mockConfirmRemoteSearch = jest.fn(async () => true)
const mockJobChatSend = jest.fn(async () => true)
const mockJobServiceSendMessage = jest.fn()
const mockDecideScopeChange = jest.fn(async () => true)
const mockHydrateRemoteJobById = jest.fn(async () => false)
const mockKaelAssistantAsk = jest.fn()
const mockKaelChatConfirm = jest.fn()
const mockKaelChatCreate = jest.fn()
const mockKaelChatGet = jest.fn()
const mockKaelChatSendTurn = jest.fn()
const mockKaelChatSubmitEvidence = jest.fn()
const mockLaunchImageLibraryAsync = jest.fn()
const mockRequestMediaLibraryPermissionsAsync = jest.fn()
const mockClearPendingKaelChatDraft = jest.fn()
const mockReadPendingKaelChatDraft = jest.fn()
const mockTakePendingKaelChatDraft = jest.fn()
const mockUploadJobMediaDrafts = jest.fn()
const mockUploadKaelChatMediaDrafts = jest.fn()

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  useRouter: () => ({ replace: mockReplace }),
}))

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({
    session: {
      access_token: 'test_access_token',
      user: { id: 'customer_test_1', user_metadata: {} },
    },
  }),
}))

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => mockWorkflowValue,
}))

jest.mock('@/lib/services', () => ({
  __esModule: true,
  jobService: {
    sendMessage: (jobId: string, input: { content: string }) => mockJobServiceSendMessage(jobId, input),
  },
  kaelAssistantService: {
    ask: (...args: unknown[]) => mockKaelAssistantAsk(...args),
  },
  kaelChatService: {
    confirm: (...args: unknown[]) => mockKaelChatConfirm(...args),
    create: (...args: unknown[]) => mockKaelChatCreate(...args),
    get: (...args: unknown[]) => mockKaelChatGet(...args),
    sendTurn: (...args: unknown[]) => mockKaelChatSendTurn(...args),
    submitEvidence: (...args: unknown[]) => mockKaelChatSubmitEvidence(...args),
  },
}))

jest.mock('@/lib/media-upload', () => ({
  __esModule: true,
  uploadJobMediaDrafts: (...args: unknown[]) => mockUploadJobMediaDrafts(...args),
  uploadKaelChatMediaDrafts: (...args: unknown[]) => mockUploadKaelChatMediaDrafts(...args),
}))

jest.mock('@/lib/use-job-chat-thread', () => ({
  useJobChatThread: () => ({
    error: null,
    loading: false,
    messages: [],
    reload: jest.fn(),
    send: mockJobChatSend,
    sending: false,
  }),
}))

jest.mock('expo-audio', () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
  RecordingPresets: {
    HIGH_QUALITY: {},
  },
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioRecorder: () => ({
    getURI: jest.fn(() => null),
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
  }),
  useAudioRecorderState: () => ({
    isRecording: false,
    durationMillis: 0,
  }),
}))

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images', Videos: 'Videos' },
  launchImageLibraryAsync: (options: unknown) => mockLaunchImageLibraryAsync(options),
  requestMediaLibraryPermissionsAsync: () => mockRequestMediaLibraryPermissionsAsync(),
}))

jest.mock('../kael-chat/pending-intake', () => ({
  clearPendingKaelChatDraft: () => mockClearPendingKaelChatDraft(),
  peekPendingKaelChatDraft: () => mockTakePendingKaelChatDraft(),
  readPendingKaelChatDraft: () => mockReadPendingKaelChatDraft(),
  takePendingKaelChatDraft: () => mockTakePendingKaelChatDraft(),
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => 'vi',
  }
})

import { KaelChatSurface } from '../kael-chat/kael-chat-surface'
import { buildKaelProcessSequence } from '../v21/kael-process-lines'

function buildDeal(): LocalDeal {
  return {
    backendStatus: 'worker_matched',
    broadcast: {
      broadcastId: 'broadcast_test_1',
      fullAddressLabel: 'Tòa A, Quận 1',
      fullAddressVisible: true,
      generalArea: 'Quận 1',
      jobId: 'job_test_1',
      prebrief: ['Kael đã tóm tắt phạm vi.'],
      problemSummary: 'Ổ cắm chập chờn',
      secondsRemaining: null,
      serviceType: 'electrical',
      status: 'accepted',
    },
    completionNotes: null,
    completionPhotoUrls: [],
    draft: {
      addressLabel: 'Tòa A, Quận 1',
      description: 'Ổ cắm phòng khách chập chờn và có mùi khét nhẹ',
      districtLabel: 'Quận 1',
      inferredProblemLabel: null,
      mediaCount: 1,
      needsServiceChoice: false,
      problemChips: ['Ổ cắm/công tắc hỏng'],
      serviceType: 'electrical',
      source: 'kael',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    displayCode: '#MOH-260001',
    estimate: {
      advisory: 'Kael có thể cập nhật nếu bằng chứng phạm vi thay đổi.',
      complexity: 'medium',
      confidenceLabel: '84%',
      disclaimer: 'Ước tính dựa trên bằng chứng hiện tại.',
      hasVndPrice: true,
      priceRangeLabel: '180.000đ - 260.000đ',
      problemLabel: 'Ổ cắm chập chờn',
    },
    finalPrice: null,
    id: 'job_test_1',
    payment: null,
    scopeChange: null,
    status: 'worker_matched',
  }
}

function buildLocalSessionDeal(): LocalDeal {
  const deal = buildDeal()
  return {
    ...deal,
    backendStatus: undefined,
    broadcast: null,
    displayCode: null,
    estimate: null,
    id: LOCAL_DEAL_ID,
    status: 'draft',
    draft: {
      ...deal.draft,
      addressLabel: 'Tòa S1.07 Chung Cư Vinhomes Grand Park, Phường Long Thạnh Mỹ, Thành Phố Thủ Đức',
      description: 'Ống nước ở bồn rửa chén bị rò rỉ nước.',
      districtLabel: 'Thành Phố Thủ Đức',
      mediaCount: 0,
      problemChips: ['Ống rò rỉ'],
      serviceType: 'plumbing',
      source: 'booking',
      timeChoice: 'now',
    },
  }
}

function buildDealWithPayment(): LocalDeal {
  const deal = buildDeal()
  deal.payment = {
    amountReceived: 260000,
    expiresAt: null,
    grossAmount: 260000,
    paymentCode: 'PAY_JOB_TEST_1',
    platformFee: 20000,
    provider: 'sepay_vietqr',
    qrImageUrl: null,
    receivedAt: '2026-06-25T09:00:00.000Z',
    status: 'received',
    transferContent: 'NSC job_test_1',
    updatedAt: '2026-06-25T09:00:00.000Z',
    workerNet: 240000,
  }
  return deal
}

function buildWorkflow(deal: LocalDeal | null) {
  mockWorkflowValue = {
    actions: {
      confirmRemoteSearch: mockConfirmRemoteSearch,
      decideScopeChange: mockDecideScopeChange,
      hydrateRemoteJobById: mockHydrateRemoteJobById,
    },
    customerKaelMemory: null,
    customerProfileInsights: null,
    dispatch: jest.fn(),
    notificationUnreadCount: 0,
    notifications: [],
    selectors: {},
    state: {
      deal,
      lastError: null,
      lastRemoteSyncAt: null,
      workerGate: 'remote_backend',
    },
  }
}

beforeEach(() => {
  mockRouteParams = {}
  mockReplace.mockClear()
  mockConfirmRemoteSearch.mockClear()
  mockDecideScopeChange.mockClear()
  mockJobChatSend.mockClear()
  mockJobServiceSendMessage.mockReset()
  mockHydrateRemoteJobById.mockClear()
  mockKaelAssistantAsk.mockReset()
  mockKaelChatConfirm.mockReset()
  mockKaelChatCreate.mockReset()
  mockKaelChatGet.mockReset()
  mockKaelChatSendTurn.mockReset()
  mockKaelChatSubmitEvidence.mockReset()
  mockLaunchImageLibraryAsync.mockReset()
  mockRequestMediaLibraryPermissionsAsync.mockReset()
  mockClearPendingKaelChatDraft.mockReset()
  mockReadPendingKaelChatDraft.mockReset()
  mockTakePendingKaelChatDraft.mockReset()
  mockUploadJobMediaDrafts.mockReset()
  mockUploadKaelChatMediaDrafts.mockReset()
  mockTakePendingKaelChatDraft.mockReturnValue(null)
  mockReadPendingKaelChatDraft.mockResolvedValue(null)
  mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
  mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] })
  mockUploadJobMediaDrafts.mockResolvedValue({ success: true, mediaRefs: [] })
  mockUploadKaelChatMediaDrafts.mockResolvedValue({ success: true, urls: [], mediaRefs: [] })
  buildWorkflow(null)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('KaelChatSurface v2.1', () => {
  it('keeps normal chat separate from case work and uses a zip-style send arrow', () => {
    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-screen-2.4-chat-normal')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-chat-canvas-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-top-title')).not.toHaveTextContent(/^Kael$/)
    expect(screen.getByTestId('customer-v21-top-title')).not.toHaveTextContent(/Trò chuyện thường|Xử lý công việc/)
    expect(screen.getByTestId('customer-v21-top-title')).not.toHaveTextContent(/để Kael lo|xử lý gọn|theo sát đến khi xong|sẵn sàng hỗ trợ/)
    expect(screen.queryByTestId('customer-v21-top-subtitle')).toBeNull()
    expect(screen.queryByText('Trò chuyện thường')).toBeNull()
    expect(screen.getByTestId('customer-v21-chat-mode-menu-button')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-chat-mode-menu-button')).toHaveTextContent('⇄')
    expect(screen.getByLabelText('Chuyển chế độ chat')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-chat-mode-menu')).toBeNull()
    expect(screen.queryByTestId('customer-v21-chat-mode-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-chat-boundary-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-chat-boundary-notice')).toBeNull()
    expect(screen.queryByTestId('customer-v21-chat-boundary-icon-aura')).toBeNull()
    expect(screen.getByTestId('customer-v21-chat-composer-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-chat-disclaimer')).toHaveTextContent('Kael có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.')
    expect(screen.getByTestId('customer-v21-kael-thread').props.showsVerticalScrollIndicator).toBe(false)
    expect(screen.queryByText('Không ghi quyết định vào Xử lý công việc')).toBeNull()
    expect(screen.getByText('Chào bạn, mình là Kael. Bạn muốn hỏi gì hôm nay?')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-chat-service-electrical')).toBeNull()
    expect(screen.queryByTestId('customer-v21-chat-service-plumbing')).toBeNull()
    expect(screen.queryByTestId('customer-v21-chat-service-cleaning')).toBeNull()
    expect(screen.queryByTestId('customer-v21-chat-quick-actions')).toBeNull()
    expect(screen.queryByTestId('customer-v21-chat-empty-panel')).toBeNull()
    expect(screen.getByTestId('customer-v21-kael-media-picker')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-media-camera-icon')).toHaveStyle({ height: 20, width: 20 })
    expect(screen.getByLabelText('Gửi tin nhắn cho Kael')).toHaveTextContent('↑')
    expect(screen.queryByText(/máy lạnh|AC|Nguyễn Văn Minh|4\.9/i)).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-chat-mode-menu-button'))
    expect(screen.getByTestId('customer-v21-chat-mode-menu')).toBeOnTheScreen()
    const menuStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-chat-mode-menu').props.style) as Record<string, unknown>
    expect(menuStyle).toMatchObject({ flexDirection: 'column', paddingTop: 7, right: 21, top: 68, width: 172 })
    const transcriptOpenStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-kael-thread').props.contentContainerStyle) as Record<string, unknown>
    expect(transcriptOpenStyle).toMatchObject({ paddingTop: 94 })
    const normalTabStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-chat-tab-normal').props.style) as Record<string, unknown>
    expect(normalTabStyle).toMatchObject({ borderWidth: 1, minHeight: 34, width: '100%' })
    expect(screen.getByTestId('customer-v21-chat-mode-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-chat-tab-normal').props.accessibilityState).toMatchObject({ selected: true })

    fireEvent.press(screen.getByTestId('customer-v21-chat-tab-case-work'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case')
  })

  it('sends a plain normal-chat greeting without forcing a visible service choice', async () => {
    mockKaelChatCreate.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_plain_chat',
          job_id: null,
          service_type: 'electrical',
        },
        turns: [
          {
            id: 'turn_plain_customer',
            media_refs: [],
            role: 'customer',
            text_content: 'Hi',
          },
          {
            id: 'turn_plain_kael',
            media_refs: [],
            role: 'assistant',
            text_content: 'Chào bạn, Kael đang nghe.',
          },
        ],
      },
    })

    mockKaelAssistantAsk.mockResolvedValue({
      success: true,
      data: {
        answer: 'Chao ban, Kael dang nghe.',
        boundary: 'answered',
        citations: ['NestScout platform scope'],
        fallback_used: false,
        safety_notes: [],
        suggested_actions: ['open_booking'],
      },
    })

    render(<KaelChatSurface />)

    fireEvent.changeText(screen.getByTestId('customer-v21-kael-input'), 'Hi')
    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-v21-kael-send'))
    })

    expect(screen.queryByText('Chọn dịch vụ.')).toBeNull()
    expect(mockKaelAssistantAsk).toHaveBeenCalledWith(expect.objectContaining({
      language: 'vi',
      message: 'Hi',
      surface: 'customer_normal',
    }))
    expect(mockKaelChatCreate).not.toHaveBeenCalled()
  })

  it('keeps a service-context price question in normal chat instead of opening intake', async () => {
    mockRouteParams = { service: 'electrical' }
    mockKaelAssistantAsk.mockResolvedValue({
      success: true,
      data: {
        answer: 'Kael c\u00f3 th\u1ec3 gi\u1ea3i th\u00edch c\u00e1ch \u01b0\u1edbc t\u00ednh gi\u00e1 theo khu v\u1ef1c.',
        boundary: 'answered',
        citations: ['NestScout pricing guidance'],
        fallback_used: false,
        safety_notes: [],
        suggested_actions: ['ask_district'],
      },
    })

    render(<KaelChatSurface />)

    fireEvent.changeText(screen.getByTestId('customer-v21-kael-input'), 'S\u1eeda \u0111i\u1ec7n th\u00ec gi\u00e1 trung b\u00ecnh \u1edf TP.HCM nh\u01b0 th\u1ebf n\u00e0o?')
    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-v21-kael-send'))
    })

    expect(mockKaelAssistantAsk).toHaveBeenCalledWith(expect.objectContaining({
      language: 'vi',
      message: 'S\u1eeda \u0111i\u1ec7n th\u00ec gi\u00e1 trung b\u00ecnh \u1edf TP.HCM nh\u01b0 th\u1ebf n\u00e0o?',
      surface: 'customer_normal',
    }))
    expect(mockKaelChatCreate).not.toHaveBeenCalled()
    expect(screen.queryByTestId('customer-v21-agentic-evidence-gate')).toBeNull()
    expect(screen.queryByTestId('customer-v21-agentic-estimate-card')).toBeNull()
  })

  it('keeps picked image and video media inside the evidence gate before analysis', async () => {
    mockRouteParams = { service: 'electrical' }
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          fileName: 'socket.jpg',
          fileSize: 1234,
          mimeType: 'image/jpeg',
          type: 'image',
          uri: 'file:///socket.jpg',
        },
        {
          fileName: 'spark.mp4',
          fileSize: 4567,
          mimeType: 'video/mp4',
          type: 'video',
          uri: 'file:///spark.mp4',
        },
      ],
    })
    mockUploadKaelChatMediaDrafts.mockResolvedValue({
      success: true,
      urls: [],
      mediaRefs: [
        'supabase://kael-chat-media/customer_test_1/kael-chat/socket.jpg',
        'supabase://kael-chat-media/customer_test_1/kael-chat/spark.mp4',
      ],
    })
    mockKaelChatCreate.mockResolvedValue({
      success: true,
      data: {
        session: {
          estimate: null,
          id: 'session_test_1',
          job_id: null,
          next_action: 'collect_evidence',
          service_type: 'electrical',
          status: 'collecting_evidence',
        },
        turns: [
          {
            id: 'turn_test_1',
            role: 'customer',
            text_content: 'Ổ cắm có tia lửa.',
            media_refs: [],
          },
        ],
      },
    })

    render(<KaelChatSurface />)

    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-v21-kael-media-picker'))
    })

    expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsMultipleSelection: true,
      mediaTypes: ['images', 'videos'],
      selectionLimit: 5,
    }))
    expect(screen.getByTestId('customer-v21-kael-media-count')).toHaveTextContent('2')

    fireEvent.changeText(screen.getByTestId('customer-v21-kael-input'), 'Ổ cắm có tia lửa.')
    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-v21-kael-send'))
    })

    expect(mockUploadKaelChatMediaDrafts).not.toHaveBeenCalled()
    expect(mockKaelChatCreate).toHaveBeenCalledWith(expect.objectContaining({
      defer_analysis: true,
      message: 'Ổ cắm có tia lửa.',
      photo_urls: [],
      service_type: 'electrical',
    }))
    expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-agentic-evidence-file-count')).toHaveTextContent('2')
  })

  it('waits for evidence confirmation before showing Kael process lines', async () => {
    jest.useFakeTimers()
    mockRouteParams = { service: 'plumbing' }
    let resolveCreate: (value: unknown) => void = () => undefined
    const pendingCreate = new Promise((resolve) => {
      resolveCreate = resolve
    })
    mockKaelChatCreate.mockReturnValue(pendingCreate)
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          fileName: 'pipe.jpg',
          fileSize: 1234,
          mimeType: 'image/jpeg',
          type: 'image',
          uri: 'file:///pipe.jpg',
        },
      ],
    })
    mockUploadKaelChatMediaDrafts.mockResolvedValue({
      success: true,
      urls: [],
      mediaRefs: ['supabase://kael-chat-media/customer_test_1/kael-chat/pipe.jpg'],
    })
    mockKaelChatSubmitEvidence.mockResolvedValue({
      success: true,
      data: {
        session: {
          estimate: {
            advisory: 'Kael giữ phạm vi và cập nhật nếu bằng chứng mới thay đổi.',
            confidence: 0.82,
            confidenceLabel: '82%',
            disclaimer: 'Ước tính cần bạn xác nhận trước khi mở công việc.',
            price_max: null,
            price_min: null,
            priceRangeLabel: null,
            problem_label: 'Đường ống cần kiểm tra',
            service_type: 'plumbing',
          },
          id: 'session_process_1',
          job_id: null,
          next_action: 'confirm_estimate',
          service_type: 'plumbing',
          status: 'estimate_ready',
        },
        turns: [
          {
            id: 'turn_process_customer',
            media_refs: [],
            role: 'customer',
            text_content: 'TÃ´i gá»­i áº£nh/video hiá»‡n tráº¡ng Ä‘Æ°á»ng á»‘ng.',
          },
        ],
      },
    })

    render(<KaelChatSurface />)

    fireEvent.changeText(screen.getByTestId('customer-v21-kael-input'), 'Tôi gửi ảnh/video hiện trạng đường ống.')
    act(() => {
      fireEvent.press(screen.getByTestId('customer-v21-kael-send'))
    })

    expect(screen.queryByTestId('customer-v21-kael-process-lines')).toBeNull()
    expect(mockKaelChatCreate).toHaveBeenCalledWith(expect.objectContaining({
      defer_analysis: true,
      photo_urls: [],
      service_type: 'plumbing',
    }))

    await act(async () => {
      resolveCreate({
        success: true,
        data: {
          session: {
            estimate: null,
            id: 'session_process_1',
            job_id: null,
            next_action: 'collect_evidence',
            service_type: 'plumbing',
            status: 'collecting_evidence',
          },
          turns: [
            {
              id: 'turn_process_customer',
              media_refs: [],
              role: 'customer',
              text_content: 'Tôi gửi ảnh/video hiện trạng đường ống.',
            },
          ],
        },
      })
      await pendingCreate
    })

    expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen()
    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-v21-agentic-evidence-add-media'))
    })
    await waitFor(() => {
      expect(screen.getByTestId('customer-v21-agentic-evidence-file-count')).toHaveTextContent('1')
    })
    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-v21-agentic-evidence-confirm'))
    })

    expect(mockKaelChatSubmitEvidence).toHaveBeenCalledWith('session_process_1', expect.objectContaining({
      decision: 'confirmed',
      media_refs: ['supabase://kael-chat-media/customer_test_1/kael-chat/pipe.jpg'],
      photo_urls: [],
    }))
    expect(screen.getByTestId('customer-v21-kael-process-lines')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-agentic-evidence-gate')).toBeNull()
    expect(screen.getByTestId('customer-v21-kael-process-line-0')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-kael-process-line-1')).toBeNull()
    expect(screen.queryByText('Kael đã nhận thông tin.')).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(4_000)
      await Promise.resolve()
    })
    expect(screen.queryByTestId('customer-v21-kael-process-line-0')).toBeNull()
    expect(screen.getByTestId('customer-v21-kael-process-line-1')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-kael-process-line-2')).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(20_000)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.queryByTestId('customer-v21-kael-process-lines')).toBeNull()
    })
    expect(screen.getByTestId('customer-v21-agentic-estimate-card')).toBeOnTheScreen()
    jest.useRealTimers()
  })

  it('uses price-advice process lines for a normal service pricing question', () => {
    const sequence = buildKaelProcessSequence({
      hasRealCase: false,
      jobType: 'Sửa điện',
      language: 'vi',
      mediaCount: 0,
      message: 'Sửa điện thì giá trung bình ở TP.HCM như thế nào?',
      mode: 'normal',
    })

    const processText = sequence.lines.map((line) => line.text).join(' ')
    expect(sequence.scenarioId).toBe('service_price_advice')
    expect(processText).toMatch(/giá|khu vực|ước tính/)
    expect(processText).not.toMatch(/checklist|ảnh\/video|bằng chứng/i)
    expect(sequence.lines[0].durationMs).toBeGreaterThan(2900)
  })

  it('turns booking drafts into a single evidence gate before Kael analysis runs', async () => {
    jest.useFakeTimers()
    mockRouteParams = {}
    const bookingDescription = 'Ổ cắm phòng khách bị nóng.'
    const bookingDraftMessage = 'D\u1ecbch v\u1ee5: S\u1eeda \u0111i\u1ec7n\nKhu v\u1ef1c: T\u00f2a A, Qu\u1eadn 7\nM\u00f4 t\u1ea3: \u1ed4 c\u1eafm ph\u00f2ng kh\u00e1ch b\u1ecb n\u00f3ng.'
    mockTakePendingKaelChatDraft.mockReturnValue({
      addressLabel: 'T\u00f2a A, Qu\u1eadn 7',
      clientRequestId: 'pending-draft-1',
      createdAt: '2026-06-28T00:00:00.000Z',
      description: bookingDescription,
      districtLabel: 'Qu\u1eadn 7',
      locale: 'vi',
      mediaCount: 1,
      message: bookingDraftMessage,
      photoDrafts: [
        {
          fileName: 'socket.jpg',
          fileSizeBytes: 1234,
          mimeType: 'image/jpeg',
          type: 'image',
          uri: 'file:///socket.jpg',
        },
      ],
      problemChips: ['\u1ed4 c\u1eafm/c\u00f4ng t\u1eafc h\u1ecfng'],
      serviceType: 'electrical',
      source: 'booking',
    })
    mockKaelChatCreate.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_pending_booking',
          customer_id: 'customer_test_1',
          estimate: null,
          estimate_ready_at: null,
          job_id: null,
          next_action: 'collect_evidence',
          service_type: 'electrical',
          status: 'collecting_evidence',
          started_at: '2026-06-28T00:00:00.000Z',
          total_cost_usd: 0,
          total_turns: 1,
        },
        turns: [
          {
            content_type: 'text',
            created_at: '2026-06-28T00:00:00.000Z',
            estimate: null,
            id: 'turn_pending_customer',
            media_refs: [],
            role: 'customer',
            session_id: 'session_pending_booking',
            text_content: bookingDraftMessage,
            turn_index: 1,
          },
          {
            content_type: 'text',
            created_at: '2026-06-28T00:00:01.000Z',
            estimate: null,
            id: 'turn_template_kael',
            media_refs: [],
            role: 'kael',
            session_id: 'session_pending_booking',
            text_content: 'Kael ghi nhận mối lo của bạn. Mỗi tương tác được lưu lại đầy đủ. Nếu cần admin can thiệp, bạn có thể yêu cầu qua nút bên dưới.',
            turn_index: 2,
          },
        ],
      },
    })
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          fileName: 'socket.jpg',
          fileSize: 1234,
          mimeType: 'image/jpeg',
          type: 'image',
          uri: 'file:///socket.jpg',
        },
      ],
    })
    mockUploadKaelChatMediaDrafts.mockResolvedValue({
      success: true,
      urls: [],
      mediaRefs: ['supabase://kael-chat-media/customer_test_1/kael-chat/socket.jpg'],
    })
    mockKaelChatSubmitEvidence.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_pending_booking',
          customer_id: 'customer_test_1',
          estimate: {
            advisory: 'Kael đã phân tích bằng chứng hiện trạng.',
            complexity: 'medium',
            confidence: 0.82,
            disclaimer: 'Ước tính có thể thay đổi theo thực tế.',
            price_max: 260000,
            price_min: 180000,
            problem_category: 'Ổ cắm/công tắc',
            problem_summary: 'Ổ cắm nóng lên.',
            service_type: 'electrical',
          },
          estimate_ready_at: '2026-06-28T00:00:10.000Z',
          job_id: null,
          next_action: 'estimate_ready',
          service_type: 'electrical',
          status: 'estimate_ready',
          started_at: '2026-06-28T00:00:00.000Z',
          total_cost_usd: 0.01,
          total_turns: 3,
        },
        turns: [
          {
            content_type: 'text',
            created_at: '2026-06-28T00:00:00.000Z',
            estimate: null,
            id: 'turn_pending_customer',
            media_refs: [],
            role: 'customer',
            session_id: 'session_pending_booking',
            text_content: bookingDraftMessage,
            turn_index: 1,
          },
          {
            content_type: 'photo_attached',
            created_at: '2026-06-28T00:00:04.000Z',
            estimate: null,
            id: 'turn_evidence_customer',
            media_refs: ['supabase://kael-chat-media/customer_test_1/kael-chat/socket.jpg'],
            role: 'customer',
            session_id: 'session_pending_booking',
            text_content: 'Đã gửi bằng chứng hiện trạng.',
            turn_index: 2,
          },
        ],
      },
    })

    render(<KaelChatSurface />)

    await waitFor(() => {
      expect(mockKaelChatCreate).toHaveBeenCalledWith(expect.objectContaining({
        address_label: 'T\u00f2a A, Qu\u1eadn 7',
        client_request_id: 'pending-draft-1',
        defer_analysis: true,
        message: bookingDescription,
        service_type: 'electrical',
      }))
    })
    expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-screen-2.5-chat-case')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-pending-draft-bubble')).toHaveTextContent(/Tòa A/)
    expect(screen.queryByText(/admin can/)).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-inactive')).toBeNull()
    expect(screen.queryByTestId('customer-v21-kael-input')).toBeNull()
    expect(screen.getByTestId('customer-v21-agentic-evidence-file-count')).toHaveTextContent('1')
    expect(screen.getByTestId('customer-v21-agentic-evidence-confirm').props.accessibilityState).toMatchObject({
      disabled: false,
    })
    expect(screen.queryByTestId('customer-v21-kael-process-lines')).toBeNull()
    expect(mockClearPendingKaelChatDraft).not.toHaveBeenCalled()

    expect(mockUploadKaelChatMediaDrafts).not.toHaveBeenCalled()
    expect(mockKaelChatSubmitEvidence).not.toHaveBeenCalled()
    expect(screen.queryByTestId('customer-v21-agentic-estimate-card')).toBeNull()
  })

  it('keeps the evidence gate when a recovered booking session returns a generic Kael turn', async () => {
    mockRouteParams = { mode: 'case' }
    const bookingDraftMessage = 'D\u1ecbch v\u1ee5: S\u1eeda n\u01b0\u1edbc\nV\u1ea5n \u0111\u1ec1: \u1ed0ng r\u00f2 r\u1ec9\nKhu v\u1ef1c: T\u00f2a S1.07\nM\u00f4 t\u1ea3: \u1ed0ng n\u01b0\u1edbc b\u1ecb r\u00f2.'
    mockTakePendingKaelChatDraft.mockReturnValue({
      addressLabel: 'T\u00f2a S1.07',
      clientRequestId: 'pending-draft-recovered-session',
      createdAt: '2026-06-28T00:00:00.000Z',
      districtLabel: 'Th\u00e0nh ph\u1ed1 Th\u1ee7 \u0110\u1ee9c',
      locale: 'vi',
      mediaCount: 0,
      message: bookingDraftMessage,
      problemChips: ['\u1ed0ng r\u00f2 r\u1ec9'],
      serviceType: 'plumbing',
      source: 'booking',
    })
    mockKaelChatCreate.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_recovered_active',
          customer_id: 'customer_test_1',
          estimate: null,
          estimate_ready_at: null,
          job_id: null,
          next_action: 'await_input',
          service_type: 'plumbing',
          status: 'active',
          started_at: '2026-06-28T00:00:00.000Z',
          total_cost_usd: 0,
          total_turns: 2,
        },
        turns: [
          {
            content_type: 'text',
            created_at: '2026-06-28T00:00:00.000Z',
            estimate: null,
            id: 'turn_recovered_customer',
            media_refs: [],
            role: 'customer',
            session_id: 'session_recovered_active',
            text_content: bookingDraftMessage,
            turn_index: 1,
          },
          {
            content_type: 'clarification',
            created_at: '2026-06-28T00:00:01.000Z',
            estimate: null,
            id: 'turn_recovered_template',
            media_refs: [],
            role: 'kael',
            session_id: 'session_recovered_active',
            text_content: 'Kael ghi nh\u1eadn m\u1ed1i lo c\u1ee7a b\u1ea1n. M\u1ed7i t\u01b0\u01a1ng t\u00e1c \u0111\u01b0\u1ee3c l\u01b0u l\u1ea1i \u0111\u1ea7y \u0111\u1ee7.',
            turn_index: 2,
          },
        ],
      },
    })

    render(<KaelChatSurface />)

    await waitFor(() => {
      expect(mockKaelChatCreate).toHaveBeenCalledWith(expect.objectContaining({
        client_request_id: 'pending-draft-recovered-session',
        defer_analysis: true,
        service_type: 'plumbing',
      }))
    })
    expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-pending-draft-bubble')).toHaveTextContent(/S1\.07/)
    expect(screen.queryByText(/M\u1ed7i t\u01b0\u01a1ng t\u00e1c/)).toBeNull()
    expect(screen.queryByTestId('customer-v21-kael-input')).toBeNull()
    expect(mockClearPendingKaelChatDraft).not.toHaveBeenCalled()
  })

  it('keeps failed evidence uploads in the evidence gate with a mint warning', async () => {
    mockRouteParams = {}
    const bookingDraftMessage = 'D\u1ecbch v\u1ee5: S\u1eeda n\u01b0\u1edbc\nV\u1ea5n \u0111\u1ec1: \u1ed0ng r\u00f2 r\u1ec9\nM\u00f4 t\u1ea3: \u1ed0ng n\u01b0\u1edbc b\u1ecb r\u00f2.'
    const photoDraft = {
      fileName: 'pipe.jpg',
      fileSizeBytes: 1234,
      mimeType: 'image/jpeg',
      type: 'image' as const,
      uri: 'file:///pipe.jpg',
    }
    mockTakePendingKaelChatDraft.mockReturnValue({
      addressLabel: 'T\u00f2a S1.07 Vinhomes',
      clientRequestId: 'pending-draft-upload-failure',
      createdAt: '2026-06-28T00:00:00.000Z',
      districtLabel: 'Th\u00e0nh Ph\u1ed1 Th\u1ee7 \u0110\u1ee9c',
      locale: 'vi',
      mediaCount: 1,
      message: bookingDraftMessage,
      photoDrafts: [photoDraft],
      problemChips: ['\u1ed0ng r\u00f2 r\u1ec9'],
      serviceType: 'plumbing',
      source: 'booking',
    })
    mockKaelChatCreate.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_upload_failure',
          customer_id: 'customer_test_1',
          estimate: null,
          estimate_ready_at: null,
          job_id: null,
          next_action: 'collect_evidence',
          service_type: 'plumbing',
          status: 'collecting_evidence',
          started_at: '2026-06-28T00:00:00.000Z',
          total_cost_usd: 0,
          total_turns: 0,
        },
        turns: [],
      },
    })
    mockUploadKaelChatMediaDrafts.mockResolvedValueOnce({
      success: false,
      error: 'Kh\u00f4ng th\u1ec3 t\u1ea3i \u1ea3nh/video l\u00ean kho media',
    })

    render(<KaelChatSurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen())
    await waitFor(() => {
      expect(screen.getByTestId('customer-v21-agentic-evidence-confirm').props.accessibilityState).toMatchObject({
        busy: false,
        disabled: false,
      })
    })
    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-v21-agentic-evidence-confirm'))
    })

    await waitFor(() => expect(mockUploadKaelChatMediaDrafts).toHaveBeenCalledWith([photoDraft]))
    await waitFor(() => expect(screen.getByTestId('customer-v21-kael-error')).toHaveTextContent('Kh\u00f4ng th\u1ec3 t\u1ea3i \u1ea3nh/video l\u00ean kho media'))
    const uploadErrorStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-kael-error').props.style) as Record<string, unknown>
    expect(uploadErrorStyle.color).toBe('#24B3A1')
    expect(mockKaelChatSubmitEvidence).not.toHaveBeenCalled()
    expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen()
  })

  it('surfaces backend clarification after route draft evidence instead of keeping the evidence gate', async () => {
    jest.useFakeTimers()
    const bookingDraftMessage = [
      'D\u1ecbch v\u1ee5: S\u1eeda n\u01b0\u1edbc',
      'V\u1ea5n \u0111\u1ec1: \u1ed0ng r\u00f2 r\u1ec9',
      'Khu v\u1ef1c: T\u00f2a S1.07 Vinhomes Grand Park',
      'M\u00f4 t\u1ea3: \u1ed0ng n\u01b0\u1edbc b\u1ecb r\u00f2.',
    ].join('\n')
    const photoDraft = {
      fileName: 'pipe.jpg',
      fileSizeBytes: 1234,
      mimeType: 'image/jpeg',
      type: 'image' as const,
      uri: 'file:///pipe.jpg',
    }
    const clarificationText = 'B\u1ea1n cho Kael bi\u1ebft v\u1ecb tr\u00ed r\u00f2 r\u1ec9 r\u00f5 h\u01a1n nh\u00e9.'
    mockTakePendingKaelChatDraft.mockReturnValue({
      addressLabel: 'T\u00f2a S1.07 Vinhomes Grand Park',
      clientRequestId: 'pending-draft-clarification',
      createdAt: '2026-06-28T00:00:00.000Z',
      districtLabel: 'Th\u00e0nh Ph\u1ed1 Th\u1ee7 \u0110\u1ee9c',
      locale: 'vi',
      mediaCount: 1,
      message: bookingDraftMessage,
      photoDrafts: [photoDraft],
      problemChips: ['\u1ed0ng r\u00f2 r\u1ec9'],
      serviceType: 'plumbing',
      source: 'booking',
    })
    mockKaelChatCreate.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_route_clarification',
          customer_id: 'customer_test_1',
          estimate: null,
          estimate_ready_at: null,
          job_id: null,
          next_action: 'collect_evidence',
          service_type: 'plumbing',
          status: 'collecting_evidence',
          started_at: '2026-06-28T00:00:00.000Z',
          total_cost_usd: 0,
          total_turns: 1,
        },
        turns: [
          {
            content_type: 'text',
            created_at: '2026-06-28T00:00:00.000Z',
            estimate: null,
            id: 'turn_route_customer',
            media_refs: [],
            role: 'customer',
            session_id: 'session_route_clarification',
            text_content: bookingDraftMessage,
            turn_index: 1,
          },
        ],
      },
    })
    mockUploadKaelChatMediaDrafts.mockResolvedValue({
      success: true,
      urls: [],
      mediaRefs: ['supabase://kael-chat-media/customer_test_1/kael-chat/pipe.jpg'],
    })
    mockKaelChatSubmitEvidence.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_route_clarification',
          customer_id: 'customer_test_1',
          estimate: null,
          estimate_ready_at: null,
          job_id: null,
          next_action: 'await_input',
          service_type: 'plumbing',
          status: 'active',
          started_at: '2026-06-28T00:00:00.000Z',
          total_cost_usd: 0.01,
          total_turns: 3,
        },
        turns: [
          {
            content_type: 'text',
            created_at: '2026-06-28T00:00:00.000Z',
            estimate: null,
            id: 'turn_route_customer',
            media_refs: [],
            role: 'customer',
            session_id: 'session_route_clarification',
            text_content: bookingDraftMessage,
            turn_index: 1,
          },
          {
            content_type: 'photo_attached',
            created_at: '2026-06-28T00:00:04.000Z',
            estimate: null,
            id: 'turn_route_evidence',
            media_refs: ['supabase://kael-chat-media/customer_test_1/kael-chat/pipe.jpg'],
            role: 'customer',
            session_id: 'session_route_clarification',
            text_content: '\u0110\u00e3 g\u1eedi b\u1eb1ng ch\u1ee9ng hi\u1ec7n tr\u1ea1ng.',
            turn_index: 2,
          },
          {
            clarification: {
              missing_slots: ['location_detail'],
              question: clarificationText,
            },
            content_type: 'clarification',
            created_at: '2026-06-28T00:00:06.000Z',
            estimate: null,
            id: 'turn_route_clarification',
            media_refs: [],
            role: 'kael',
            session_id: 'session_route_clarification',
            text_content: clarificationText,
            turn_index: 3,
          },
        ],
      },
    })

    render(<KaelChatSurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen())
    await waitFor(() => {
      expect(screen.getByTestId('customer-v21-agentic-evidence-confirm').props.accessibilityState).toMatchObject({
        busy: false,
        disabled: false,
      })
    })
    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-v21-agentic-evidence-confirm'))
    })
    await waitFor(() => {
      expect(mockKaelChatSubmitEvidence).toHaveBeenCalledWith('session_route_clarification', expect.objectContaining({
        decision: 'confirmed',
        media_refs: ['supabase://kael-chat-media/customer_test_1/kael-chat/pipe.jpg'],
      }))
    })
    await act(async () => {
      jest.advanceTimersByTime(24_000)
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText(clarificationText)).toBeOnTheScreen())
    expect(screen.queryByTestId('customer-v21-agentic-evidence-gate')).toBeNull()
    expect(screen.queryAllByTestId('customer-v21-pending-draft-bubble')).toHaveLength(1)
    expect(screen.queryAllByText(bookingDraftMessage)).toHaveLength(1)
  })

  it('falls back to a Kael turn when the deployed evidence endpoint is behind the media upload contract', async () => {
    jest.useFakeTimers()
    const bookingDraftMessage = [
      'D\u1ecbch v\u1ee5: S\u1eeda n\u01b0\u1edbc',
      'V\u1ea5n \u0111\u1ec1: \u1ed0ng r\u00f2 r\u1ec9',
      'Khu v\u1ef1c: T\u00f2a S1.07 Vinhomes Grand Park',
      'M\u00f4 t\u1ea3: \u1ed0ng n\u01b0\u1edbc b\u1ecb r\u00f2.',
    ].join('\n')
    mockTakePendingKaelChatDraft.mockReturnValue({
      addressLabel: 'T\u00f2a S1.07 Vinhomes Grand Park',
      clientRequestId: 'pending-draft-legacy-evidence',
      createdAt: '2026-06-28T00:00:00.000Z',
      districtLabel: 'Th\u00e0nh Ph\u1ed1 Th\u1ee7 \u0110\u1ee9c',
      locale: 'vi',
      mediaCount: 1,
      message: bookingDraftMessage,
      photoDrafts: [
        {
          fileName: 'pipe.jpg',
          fileSizeBytes: 1234,
          mimeType: 'image/jpeg',
          type: 'image',
          uri: 'file:///pipe.jpg',
        },
      ],
      problemChips: ['\u1ed0ng r\u00f2 r\u1ec9'],
      serviceType: 'plumbing',
      source: 'booking',
    })
    mockKaelChatCreate.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_legacy_evidence',
          customer_id: 'customer_test_1',
          estimate: null,
          estimate_ready_at: null,
          job_id: null,
          next_action: 'collect_evidence',
          service_type: 'plumbing',
          status: 'collecting_evidence',
          started_at: '2026-06-28T00:00:00.000Z',
          total_cost_usd: 0,
          total_turns: 1,
        },
        turns: [
          {
            content_type: 'text',
            created_at: '2026-06-28T00:00:00.000Z',
            estimate: null,
            id: 'turn_route_customer_legacy',
            media_refs: [],
            role: 'customer',
            session_id: 'session_legacy_evidence',
            text_content: bookingDraftMessage,
            turn_index: 1,
          },
        ],
      },
    })
    mockUploadKaelChatMediaDrafts.mockResolvedValue({
      success: true,
      urls: ['https://storage.example.test/evidence/pipe.jpg'],
      mediaRefs: ['supabase://kael-chat-media/customer_test_1/kael-chat/pipe.jpg'],
      usedDirectUpload: false,
    })
    mockKaelChatSubmitEvidence.mockResolvedValue({
      success: false,
      code: 'VALIDATION',
      error: 'D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7',
      status: 400,
    })
    mockKaelChatSendTurn.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_legacy_evidence',
          customer_id: 'customer_test_1',
          estimate: {
            advisory: 'Kael \u0111\u00e3 ph\u00e2n t\u00edch b\u1eb1ng ch\u1ee9ng hi\u1ec7n tr\u1ea1ng.',
            complexity: 'medium',
            confidence: 0.82,
            disclaimer: '\u01af\u1edbc t\u00ednh c\u00f3 th\u1ec3 thay \u0111\u1ed5i theo th\u1ef1c t\u1ebf.',
            price_max: 260000,
            price_min: 180000,
            problem_category: '\u1ed0ng r\u00f2 r\u1ec9',
            problem_summary: '\u1ed0ng n\u01b0\u1edbc b\u1ecb r\u00f2.',
            service_type: 'plumbing',
          },
          estimate_ready_at: '2026-06-28T00:00:10.000Z',
          job_id: null,
          next_action: 'estimate_ready',
          service_type: 'plumbing',
          status: 'estimate_ready',
          started_at: '2026-06-28T00:00:00.000Z',
          total_cost_usd: 0.01,
          total_turns: 3,
        },
        turns: [
          {
            content_type: 'photo_attached',
            created_at: '2026-06-28T00:00:04.000Z',
            estimate: null,
            id: 'turn_legacy_photo',
            media_refs: ['https://storage.example.test/evidence/pipe.jpg'],
            role: 'customer',
            session_id: 'session_legacy_evidence',
            text_content: '\u0110\u00e3 g\u1eedi b\u1eb1ng ch\u1ee9ng hi\u1ec7n tr\u1ea1ng.',
            turn_index: 2,
          },
        ],
      },
    })

    render(<KaelChatSurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen())
    await waitFor(() => {
      expect(screen.getByTestId('customer-v21-agentic-evidence-confirm').props.accessibilityState).toMatchObject({
        busy: false,
        disabled: false,
      })
    })
    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-v21-agentic-evidence-confirm'))
    })

    expect(mockKaelChatSubmitEvidence).toHaveBeenCalledWith('session_legacy_evidence', expect.objectContaining({
      decision: 'confirmed',
      media_refs: ['supabase://kael-chat-media/customer_test_1/kael-chat/pipe.jpg'],
      photo_urls: ['https://storage.example.test/evidence/pipe.jpg'],
    }))
    expect(mockKaelChatSendTurn).toHaveBeenCalledWith('session_legacy_evidence', expect.objectContaining({
      message: '\u0110\u00e3 g\u1eedi b\u1eb1ng ch\u1ee9ng hi\u1ec7n tr\u1ea1ng.',
      photo_urls: ['https://storage.example.test/evidence/pipe.jpg'],
      problem_chips: ['\u1ed0ng r\u00f2 r\u1ec9'],
    }))

    await act(async () => {
      jest.advanceTimersByTime(40_000)
      await Promise.resolve()
    })

    expect(screen.queryByText('D\u1eef li\u1ec7u kh\u00f4ng h\u1ee3p l\u1ec7')).toBeNull()
    expect(screen.queryByTestId('customer-v21-agentic-evidence-gate')).toBeNull()
    expect(screen.getByTestId('customer-v21-agentic-estimate-card')).toBeOnTheScreen()
  })

  it('keeps one route draft summary and hides backend template turns before a structured agentic outcome', async () => {
    mockRouteParams = { mode: 'case' }
    const bookingDraftMessage = [
      'D\u1ecbch v\u1ee5: S\u1eeda n\u01b0\u1edbc',
      'V\u1ea5n \u0111\u1ec1: \u1ed0ng r\u00f2 r\u1ec9',
      'Khu v\u1ef1c: T\u00f2a S1.07 Chung C\u01b0 Vinhomes Grand Park, Ph\u01b0\u1eddng Long Th\u1ea1nh M\u1ef9, Th\u00e0nh Ph\u1ed1 Th\u1ee7 \u0110\u1ee9c, Th\u00e0nh Ph\u1ed1 H\u1ed3 Ch\u00ed Minh',
      'Th\u1eddi gian: T4 01/07 \u00b7 16:00-18:00',
      'M\u00f4 t\u1ea3: \u1ed0ng n\u01b0\u1edbc ph\u00f2ng t\u1eafm b\u1ecb r\u00f2 r\u1ec9.',
    ].join('\n')
    mockTakePendingKaelChatDraft.mockReturnValue({
      addressLabel: 'T\u00f2a S1.07 Chung C\u01b0 Vinhomes Grand Park, Ph\u01b0\u1eddng Long Th\u1ea1nh M\u1ef9, Th\u00e0nh Ph\u1ed1 Th\u1ee7 \u0110\u1ee9c, Th\u00e0nh Ph\u1ed1 H\u1ed3 Ch\u00ed Minh',
      clientRequestId: 'pending-draft-active-with-template',
      createdAt: '2026-06-28T00:00:00.000Z',
      districtLabel: 'Th\u00e0nh Ph\u1ed1 Th\u1ee7 \u0110\u1ee9c',
      locale: 'vi',
      mediaCount: 0,
      message: bookingDraftMessage,
      problemChips: ['\u1ed0ng r\u00f2 r\u1ec9'],
      serviceType: 'plumbing',
      source: 'booking',
    })
    mockKaelChatCreate.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_active_without_outcome',
          customer_id: 'customer_test_1',
          estimate: null,
          estimate_ready_at: null,
          job_id: null,
          next_action: 'collect_evidence',
          service_type: 'plumbing',
          status: 'active',
          started_at: '2026-06-28T00:00:00.000Z',
          total_cost_usd: 0,
          total_turns: 2,
        },
        turns: [
          {
            content_type: 'text',
            created_at: '2026-06-28T00:00:00.000Z',
            estimate: null,
            id: 'turn_scrubbed_customer',
            media_refs: [],
            role: 'customer',
            session_id: 'session_active_without_outcome',
            text_content: 'D\u1ecbch v\u1ee5: S\u1eeda n\u01b0\u1edbc\nV\u1ea5n \u0111\u1ec1: \u1ed0ng r\u00f2 r\u1ec9\nKhu v\u1ef1c: [unit] Chung C\u01b0 [building], Ph\u01b0\u1eddng Long Th\u1ea1nh M\u1ef9, Th\u00e0nh Ph\u1ed1 Th\u1ee7 \u0110\u1ee9c\nTh\u1eddi gian: T4 01/07 \u00b7 16:00-18:00',
            turn_index: 1,
          },
          {
            content_type: 'text',
            created_at: '2026-06-28T00:00:01.000Z',
            estimate: null,
            id: 'turn_template_kael_active',
            media_refs: [],
            role: 'kael',
            session_id: 'session_active_without_outcome',
            text_content: 'Kael ghi nh\u1eadn m\u1ed1i lo c\u1ee7a b\u1ea1n. M\u1ed7i t\u01b0\u01a1ng t\u00e1c \u0111\u01b0\u1ee3c l\u01b0u l\u1ea1i \u0111\u1ea7y \u0111\u1ee7. N\u1ebfu c\u1ea7n admin can thi\u1ec7p, b\u1ea1n c\u00f3 th\u1ec3 y\u00eau c\u1ea7u qua n\u00fat b\u00ean d\u01b0\u1edbi.',
            turn_index: 2,
          },
        ],
      },
    })

    render(<KaelChatSurface />)

    await waitFor(() => {
      expect(mockKaelChatCreate).toHaveBeenCalledWith(expect.objectContaining({
        client_request_id: 'pending-draft-active-with-template',
        defer_analysis: true,
        message: bookingDraftMessage,
        service_type: 'plumbing',
      }))
    })
    expect(screen.getByTestId('customer-v21-screen-2.5-chat-case')).toBeOnTheScreen()
    expect(screen.queryAllByTestId('customer-v21-pending-draft-bubble')).toHaveLength(1)
    expect(screen.getByTestId('customer-v21-pending-draft-bubble')).toHaveTextContent(/S1\.07/)
    expect(screen.queryByText(/\[unit\]/)).toBeNull()
    expect(screen.queryByText(/admin can/)).toBeNull()
    expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-agentic-estimate-card')).toBeNull()
  })

  it('treats the local workflow placeholder as intake, not a real Case Work job', async () => {
    mockRouteParams = { jobId: LOCAL_DEAL_ID, mode: 'case' }
    buildWorkflow(buildLocalSessionDeal())
    const bookingDraftMessage = [
      'Dịch vụ: Sửa nước',
      'Vấn đề: Ống rò rỉ',
      'Khu vực: Tòa S1.07 Chung Cư Vinhomes Grand Park, Phường Long Thạnh Mỹ, Thành Phố Thủ Đức',
      'Thời gian: T4 01/07 · 16:00-18:00',
      'Mô tả: Ống nước ở bồn rửa chén bị rò rỉ nước.',
    ].join('\n')
    mockTakePendingKaelChatDraft.mockReturnValue({
      addressLabel: 'Tòa S1.07 Chung Cư Vinhomes Grand Park, Phường Long Thạnh Mỹ, Thành Phố Thủ Đức',
      clientRequestId: 'pending-draft-with-local-deal',
      createdAt: '2026-06-28T00:00:00.000Z',
      districtLabel: 'Thành Phố Thủ Đức',
      locale: 'vi',
      mediaCount: 0,
      message: bookingDraftMessage,
      problemChips: ['Ống rò rỉ'],
      serviceType: 'plumbing',
      source: 'booking',
    })
    mockKaelChatCreate.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_local_placeholder',
          customer_id: 'customer_test_1',
          estimate: null,
          estimate_ready_at: null,
          job_id: null,
          next_action: 'collect_evidence',
          service_type: 'plumbing',
          status: 'collecting_evidence',
          started_at: '2026-06-28T00:00:00.000Z',
          total_cost_usd: 0,
          total_turns: 0,
        },
        turns: [],
      },
    })

    render(<KaelChatSurface />)

    await waitFor(() => {
      expect(mockKaelChatCreate).toHaveBeenCalledWith(expect.objectContaining({
        client_request_id: 'pending-draft-with-local-deal',
        defer_analysis: true,
        message: bookingDraftMessage,
        service_type: 'plumbing',
      }))
    })
    expect(mockHydrateRemoteJobById).not.toHaveBeenCalledWith(LOCAL_DEAL_ID)
    expect(mockReplace).not.toHaveBeenCalledWith(expect.stringContaining(LOCAL_DEAL_ID))
    expect(screen.getByTestId('customer-v21-screen-2.5-chat-case')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-pending-draft-bubble')).toHaveTextContent(/S1\.07/)
    expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-overview')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-progress')).toBeNull()
    expect(screen.queryByText(/Kael đang điều hành công việc/)).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-inactive')).toBeNull()
  })

  it('restores a persisted booking draft when route navigation remounts Kael chat', async () => {
    mockRouteParams = {}
    const bookingDraftMessage = 'Dịch vụ: Sửa nước\nVấn đề: Ống rò rỉ\nKhu vực: Tòa S1.07 Vinhomes\nMô tả: Ống nước ở bồn rửa chén bị hư.'
    mockTakePendingKaelChatDraft.mockReturnValue(null)
    mockReadPendingKaelChatDraft.mockResolvedValue({
      addressLabel: 'Tòa S1.07 Vinhomes',
      clientRequestId: 'persisted-draft-1',
      createdAt: '2026-06-28T00:00:00.000Z',
      districtLabel: 'Thủ Đức',
      locale: 'vi',
      mediaCount: 0,
      message: bookingDraftMessage,
      problemChips: ['Ống rò rỉ'],
      serviceType: 'plumbing',
      source: 'booking',
    })
    mockKaelChatCreate.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_persisted_booking',
          customer_id: 'customer_test_1',
          estimate: null,
          estimate_ready_at: null,
          job_id: null,
          next_action: 'collect_evidence',
          service_type: 'plumbing',
          status: 'collecting_evidence',
          started_at: '2026-06-28T00:00:00.000Z',
          total_cost_usd: 0,
          total_turns: 0,
        },
        turns: [],
      },
    })

    render(<KaelChatSurface />)

    await waitFor(() => {
      expect(mockKaelChatCreate).toHaveBeenCalledWith(expect.objectContaining({
        address_label: 'Tòa S1.07 Vinhomes',
        client_request_id: 'persisted-draft-1',
        defer_analysis: true,
        message: bookingDraftMessage,
        service_type: 'plumbing',
      }))
    })
    expect(screen.getByTestId('customer-v21-screen-2.5-chat-case')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-pending-draft-bubble')).toHaveTextContent(/S1\.07/)
    expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-work-inactive')).toBeNull()
  })

  it('hydrates a pending booking draft when an already-mounted chat route switches into case mode', async () => {
    mockRouteParams = {}
    const bookingDraftMessage = 'Dich vu: Sua nuoc\nVan de: Ong ro ri\nKhu vuc: Toa S1.07 Vinhomes\nMo ta: Ong nuoc bi ro.'
    mockReadPendingKaelChatDraft
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        addressLabel: 'Toa S1.07 Vinhomes',
        clientRequestId: 'persisted-route-switch-draft',
        createdAt: '2026-06-28T00:00:00.000Z',
        districtLabel: 'Thu Duc',
        locale: 'vi',
        mediaCount: 0,
        message: bookingDraftMessage,
        problemChips: ['Ong ro ri'],
        serviceType: 'plumbing',
        source: 'booking',
      })
    mockKaelChatCreate.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_route_switch_booking',
          customer_id: 'customer_test_1',
          estimate: null,
          estimate_ready_at: null,
          job_id: null,
          next_action: 'collect_evidence',
          service_type: 'plumbing',
          status: 'collecting_evidence',
          started_at: '2026-06-28T00:00:00.000Z',
          total_cost_usd: 0,
          total_turns: 0,
        },
        turns: [],
      },
    })

    const { rerender } = render(<KaelChatSurface />)

    await waitFor(() => expect(mockReadPendingKaelChatDraft).toHaveBeenCalledTimes(1))
    expect(mockKaelChatCreate).not.toHaveBeenCalled()

    mockRouteParams = { mode: 'case' }
    rerender(<KaelChatSurface />)

    await waitFor(() => {
      expect(mockKaelChatCreate).toHaveBeenCalledWith(expect.objectContaining({
        address_label: 'Toa S1.07 Vinhomes',
        client_request_id: 'persisted-route-switch-draft',
        defer_analysis: true,
        message: bookingDraftMessage,
        service_type: 'plumbing',
      }))
    })
    expect(screen.getByTestId('customer-v21-screen-2.5-chat-case')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-pending-draft-bubble')).toHaveTextContent(/S1\.07/)
    expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen()
  })

  it('keeps the booking summary visible in work handling when Kael create returns without turns', async () => {
    mockRouteParams = { mode: 'case' }
    const bookingDraftMessage = 'D\u1ecbch v\u1ee5: S\u1eeda n\u01b0\u1edbc\nV\u1ea5n \u0111\u1ec1: \u1ed0ng r\u00f2 r\u1ec9\nKhu v\u1ef1c: T\u00f2a S1.07 Chung C\u01b0 Vinhomes\nM\u00f4 t\u1ea3: N\u01b0\u1edbc d\u01b0\u1edbi b\u1ed3n r\u1eeda ch\u00e9n b\u1ecb ch\u1ea3y.'
    mockTakePendingKaelChatDraft.mockReturnValue({
      addressLabel: 'T\u00f2a S1.07 Chung C\u01b0 Vinhomes',
      clientRequestId: 'pending-draft-empty-turns',
      createdAt: '2026-06-28T00:00:00.000Z',
      districtLabel: 'Th\u00e0nh Ph\u1ed1 Th\u1ee7 \u0110\u1ee9c',
      locale: 'vi',
      mediaCount: 0,
      message: bookingDraftMessage,
      problemChips: ['\u1ed0ng r\u00f2 r\u1ec9'],
      serviceType: 'plumbing',
      source: 'booking',
    })
    mockKaelChatCreate.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_empty_turns',
          customer_id: 'customer_test_1',
          estimate: null,
          estimate_ready_at: null,
          job_id: null,
          next_action: 'collect_evidence',
          service_type: 'plumbing',
          status: 'collecting_evidence',
          started_at: '2026-06-28T00:00:00.000Z',
          total_cost_usd: 0,
          total_turns: 0,
        },
        turns: [],
      },
    })

    render(<KaelChatSurface />)

    await waitFor(() => {
      expect(mockKaelChatCreate).toHaveBeenCalledWith(expect.objectContaining({
        address_label: 'T\u00f2a S1.07 Chung C\u01b0 Vinhomes',
        client_request_id: 'pending-draft-empty-turns',
        defer_analysis: true,
        message: bookingDraftMessage,
        service_type: 'plumbing',
      }))
    })
    expect(screen.getByTestId('customer-v21-screen-2.5-chat-case')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-pending-draft-bubble')).toHaveTextContent(/S1\.07/)
    expect(screen.getByTestId('customer-v21-pending-draft-bubble')).toHaveTextContent(/Vinhomes/)
    expect(screen.getByTestId('customer-v21-pending-draft-bubble')).toHaveTextContent(/b\u1ed3n r\u1eeda ch\u00e9n/)
    expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-work-inactive')).toBeNull()
    expect(mockClearPendingKaelChatDraft).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId('customer-v21-chat-mode-menu-button'))
    fireEvent.press(screen.getByTestId('customer-v21-chat-tab-normal'))

    expect(screen.getByTestId('customer-v21-screen-2.4-chat-normal')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-pending-draft-bubble')).toBeNull()
    expect(screen.queryByTestId('customer-v21-agentic-evidence-gate')).toBeNull()
    expect(screen.getByTestId('customer-v21-normal-greeting-bubble')).toBeOnTheScreen()
  })

  it('compresses an estimate-ready Kael session into a confirmable agentic card', async () => {
    jest.useFakeTimers()
    mockRouteParams = { sessionId: 'session_estimate_ready' }
    mockHydrateRemoteJobById.mockResolvedValueOnce(true)
    mockKaelChatGet.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_estimate_ready',
          customer_id: 'customer_test_1',
          estimate: {
            advisory: 'Kael giá»¯ pháº¡m vi vÃ  cáº­p nháº­t khi cÃ³ báº±ng chá»©ng má»›i.',
            complexity: 'medium',
            confidence: 0.82,
            disclaimer: 'Æ¯á»›c tÃ­nh cÃ³ thá»ƒ thay Ä‘á»•i theo thá»±c táº¿.',
            price_max: 260000,
            price_min: 180000,
            problem_category: 'Ã” cáº¯m',
            problem_summary: 'Ã” cáº¯m cháº­p chá»n',
            service_type: 'electrical',
          },
          estimate_ready_at: '2026-06-28T01:00:00.000Z',
          job_id: null,
          next_action: 'estimate_ready',
          service_type: 'electrical',
          started_at: '2026-06-28T00:59:00.000Z',
          status: 'estimate_ready',
          total_cost_usd: 0,
          total_turns: 2,
        },
        turns: [
          {
            content_type: 'text',
            created_at: '2026-06-28T00:59:00.000Z',
            estimate: null,
            id: 'turn_customer_estimate',
            media_refs: [],
            role: 'customer',
            session_id: 'session_estimate_ready',
            text_content: 'Ã” cáº¯m cháº­p chá»n á»Ÿ Quáº­n 1',
            turn_index: 0,
          },
          {
            content_type: 'estimate',
            created_at: '2026-06-28T01:00:00.000Z',
            estimate: {
              advisory: 'Kael giá»¯ pháº¡m vi vÃ  cáº­p nháº­t khi cÃ³ báº±ng chá»©ng má»›i.',
              complexity: 'medium',
              confidence: 0.82,
              disclaimer: 'Æ¯á»›c tÃ­nh cÃ³ thá»ƒ thay Ä‘á»•i theo thá»±c táº¿.',
              price_max: 260000,
              price_min: 180000,
              problem_category: 'Ã” cáº¯m',
              problem_summary: 'Ã” cáº¯m cháº­p chá»n',
              service_type: 'electrical',
            },
            id: 'turn_kael_estimate',
            media_refs: [],
            role: 'kael',
            session_id: 'session_estimate_ready',
            text_content: 'Kael Ä‘Ã£ cÃ³ Æ°á»›c tÃ­nh.',
            turn_index: 1,
          },
        ],
      },
    })
    mockKaelChatConfirm.mockResolvedValue({
      success: true,
      data: {
        broadcast_sent: true,
        job_id: 'job_estimate_ready_1',
        message: 'Kael Ä‘ang tÃ¬m thá»£ phÃ¹ há»£p.',
        session_id: 'session_estimate_ready',
        status: 'broadcasting',
        worker: null,
      },
    })
    let resolveConfirmEstimate: (value: unknown) => void = () => undefined
    const pendingConfirmEstimate = new Promise((resolve) => {
      resolveConfirmEstimate = resolve
    })
    mockKaelChatConfirm.mockReset()
    mockKaelChatConfirm.mockReturnValue(pendingConfirmEstimate)
    mockKaelChatSendTurn.mockResolvedValue({
      success: true,
      data: {
        session: {
          customer_id: 'customer_test_1',
          estimate: {
            advisory: 'Kael đã ghi nhận lý do chỉnh sửa.',
            complexity: 'medium',
            confidence: 0.8,
            disclaimer: 'Ước tính có thể thay đổi theo thực tế.',
            price_max: 240000,
            price_min: 170000,
            problem_category: 'Ổ cắm',
            problem_summary: 'Ổ cắm cần kiểm tra lại phạm vi',
            service_type: 'electrical',
          },
          estimate_ready_at: '2026-06-28T01:01:00.000Z',
          id: 'session_estimate_ready',
          job_id: null,
          next_action: 'estimate_ready',
          service_type: 'electrical',
          status: 'estimate_ready',
          total_turns: 3,
        },
        turns: [],
      },
    })

    render(<KaelChatSurface />)

    await waitFor(() => {
      expect(screen.getByTestId('customer-v21-agentic-estimate-card')).toBeOnTheScreen()
    })
    expect(screen.queryByText('Kael Ä‘Ã£ cÃ³ Æ°á»›c tÃ­nh.')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-agentic-estimate-reject'))
    expect(mockKaelChatConfirm).not.toHaveBeenCalled()
    expect(screen.getByTestId('customer-v21-agentic-reject-reason-input')).toBeOnTheScreen()

    fireEvent.changeText(screen.getByTestId('customer-v21-agentic-reject-reason-input'), 'Cần kiểm tra lại phạm vi.')
    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-v21-agentic-reject-reason-send'))
    })
    expect(mockKaelChatSendTurn).toHaveBeenCalledWith('session_estimate_ready', expect.objectContaining({
      message: 'Cần kiểm tra lại phạm vi.',
      photo_urls: [],
    }))
    expect(screen.getByTestId('customer-v21-kael-process-lines')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-agentic-estimate-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-agentic-reject-reason')).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(40_000)
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.queryByTestId('customer-v21-kael-process-lines')).toBeNull()
    })
    expect(screen.getByTestId('customer-v21-agentic-estimate-card')).toBeOnTheScreen()

    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-v21-agentic-estimate-confirm'))
    })

    expect(mockKaelChatConfirm).toHaveBeenCalledWith('session_estimate_ready')
    expect(screen.getByTestId('customer-v21-kael-process-lines')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-agentic-estimate-card')).toBeNull()
    expect(mockHydrateRemoteJobById).not.toHaveBeenCalledWith('job_estimate_ready_1')
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_estimate_ready_1')

    await act(async () => {
      resolveConfirmEstimate({
        success: true,
        data: {
          broadcast_sent: true,
          job_id: 'job_estimate_ready_1',
          message: 'Kael \u0111ang t\u00ecm th\u1ee3 ph\u00f9 h\u1ee3p.',
          session_id: 'session_estimate_ready',
          status: 'broadcasting',
          worker: null,
        },
      })
      await Promise.resolve()
    })
    await act(async () => {
      jest.advanceTimersByTime(40_000)
      await Promise.resolve()
    })

    expect(mockHydrateRemoteJobById).toHaveBeenCalledWith('job_estimate_ready_1')
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_estimate_ready_1')
    jest.useRealTimers()
  })

  it('asks for more evidence instead of confirming low-confidence agentic estimates', async () => {
    mockRouteParams = { mode: 'case', sessionId: 'session_low_confidence' }
    mockKaelChatGet.mockResolvedValue({
      success: true,
      data: {
        session: {
          id: 'session_low_confidence',
          customer_id: 'customer_test_1',
          estimate: {
            advisory: 'Kael c\u1ea7n th\u00eam hi\u1ec7n tr\u1ea1ng \u0111\u1ec3 t\u00ednh ch\u1eafc h\u01a1n.',
            complexity: 'medium',
            confidence: 0.68,
            disclaimer: '\u01af\u1edbc t\u00ednh c\u00f3 th\u1ec3 thay \u0111\u1ed5i theo th\u1ef1c t\u1ebf.',
            price_max: 620000,
            price_min: 320000,
            problem_category: 'plumbing: pipe_leak',
            problem_summary: 'plumbing: pipe_leak',
            service_type: 'plumbing',
          },
          estimate_ready_at: '2026-06-28T01:00:00.000Z',
          job_id: null,
          next_action: 'estimate_ready',
          service_type: 'plumbing',
          started_at: '2026-06-28T00:59:00.000Z',
          status: 'estimate_ready',
          total_cost_usd: 0,
          total_turns: 3,
        },
        turns: [
          {
            content_type: 'text',
            created_at: '2026-06-28T00:59:00.000Z',
            estimate: null,
            id: 'turn_low_customer',
            media_refs: [],
            role: 'customer',
            session_id: 'session_low_confidence',
            text_content: 'D\u1ecbch v\u1ee5: S\u1eeda n\u01b0\u1edbc\nV\u1ea5n \u0111\u1ec1: \u1ed0ng r\u00f2 r\u1ec9',
            turn_index: 1,
          },
          {
            content_type: 'text',
            created_at: '2026-06-28T00:59:01.000Z',
            estimate: null,
            id: 'turn_low_template',
            media_refs: [],
            role: 'kael',
            session_id: 'session_low_confidence',
            text_content: 'Kael ghi nh\u1eadn m\u1ed1i lo c\u1ee7a b\u1ea1n. M\u1ed7i t\u01b0\u01a1ng t\u00e1c \u0111\u01b0\u1ee3c l\u01b0u l\u1ea1i \u0111\u1ea7y \u0111\u1ee7. N\u1ebfu c\u1ea7n admin can thi\u1ec7p, b\u1ea1n c\u00f3 th\u1ec3 y\u00eau c\u1ea7u qua n\u00fat b\u00ean d\u01b0\u1edbi.',
            turn_index: 2,
          },
          {
            content_type: 'estimate',
            created_at: '2026-06-28T01:00:00.000Z',
            estimate: {
              advisory: 'Kael c\u1ea7n th\u00eam hi\u1ec7n tr\u1ea1ng \u0111\u1ec3 t\u00ednh ch\u1eafc h\u01a1n.',
              complexity: 'medium',
              confidence: 0.68,
              disclaimer: '\u01af\u1edbc t\u00ednh c\u00f3 th\u1ec3 thay \u0111\u1ed5i theo th\u1ef1c t\u1ebf.',
              price_max: 620000,
              price_min: 320000,
              problem_category: 'plumbing: pipe_leak',
              problem_summary: 'plumbing: pipe_leak',
              service_type: 'plumbing',
            },
            id: 'turn_low_estimate',
            media_refs: [],
            role: 'kael',
            session_id: 'session_low_confidence',
            text_content: 'Kael \u0111\u00e3 c\u00f3 \u01b0\u1edbc t\u00ednh.',
            turn_index: 3,
          },
        ],
      },
    })

    render(<KaelChatSurface />)

    await waitFor(() => {
      expect(screen.getByTestId('customer-v21-agentic-estimate-card')).toBeOnTheScreen()
    })
    expect(screen.queryByText(/admin can/)).toBeNull()
    expect(screen.queryByText(/plumbing: pipe_leak/)).toBeNull()
    expect(screen.getByTestId('customer-v21-agentic-estimate-card')).toHaveTextContent(/R\u00f2 n\u01b0\u1edbc/)
    expect(screen.getByTestId('customer-v21-agentic-estimate-price-explanation')).toHaveTextContent(/C\u00e1ch t\u00ednh/)
    expect(screen.getByTestId('customer-v21-agentic-estimate-source-explanation')).toHaveTextContent(/Ngu\u1ed3n gi\u00e1/)
    expect(screen.getByTestId('customer-v21-agentic-estimate-more-info')).toHaveTextContent(/d\u01b0\u1edbi 70%/)
    expect(screen.getByTestId('customer-v21-agentic-estimate-confirm').props.accessibilityState).toMatchObject({
      disabled: true,
    })
    expect(screen.queryByTestId('customer-v21-chat-activity-link')).toBeNull()
  })

  it('selects longer contextual process lines for case payment work without exposing reasoning', () => {
    const sequence = buildKaelProcessSequence({
      caseId: '#NSC-2026-05218',
      complexity: 'large',
      hasRealCase: true,
      jobType: 'Sửa nước',
      language: 'vi',
      mediaCount: 1,
      message: 'Kiểm tra thanh toán và bảo vệ đồng tiền giúp tôi.',
      mode: 'case',
    })

    expect(sequence.scenarioId).toBe('payout_review')
    expect(sequence.lines.length).toBeGreaterThanOrEqual(5)
    expect(sequence.lines[0].durationMs).toBeGreaterThan(1600)
    expect(sequence.lines.map((line) => line.text).join(' ')).toMatch(/thanh toán/)
    expect(sequence.lines.map((line) => line.text).join(' ')).not.toMatch(/reasoning|chain|prompt|system/i)
  })

  it('allows switching from normal chat to the locked work handling view without a fake job', () => {
    render(<KaelChatSurface />)

    fireEvent.press(screen.getByTestId('customer-v21-chat-mode-menu-button'))
    fireEvent.press(screen.getByTestId('customer-v21-chat-tab-case-work'))

    expect(screen.getByTestId('customer-v21-screen-2.5-chat-case')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-media-picker')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-media-picker').props.accessibilityState).toMatchObject({ disabled: true })
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-kael-media-picker').props.style)).toMatchObject({ opacity: 1 })
    expect(screen.getByTestId('customer-v21-kael-input')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-send')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-chat-disclaimer')).toHaveTextContent('Kael có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.')
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case')
    expect(mockJobChatSend).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId('customer-v21-chat-mode-menu-button'))
    fireEvent.press(screen.getByTestId('customer-v21-chat-tab-normal'))

    expect(screen.getByTestId('customer-v21-screen-2.4-chat-normal')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-media-picker')).toBeOnTheScreen()
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=normal')
  })

  it('keeps the chat tabs free when opening directly on the work handling route', () => {
    mockRouteParams = { mode: 'case' }

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-screen-2.5-chat-case')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('customer-v21-chat-mode-menu-button'))
    fireEvent.press(screen.getByTestId('customer-v21-chat-tab-normal'))

    expect(screen.getByTestId('customer-v21-screen-2.4-chat-normal')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-media-picker')).toBeOnTheScreen()
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=normal')

    fireEvent.press(screen.getByTestId('customer-v21-chat-mode-menu-button'))
    fireEvent.press(screen.getByTestId('customer-v21-chat-tab-case-work'))

    expect(screen.getByTestId('customer-v21-screen-2.5-chat-case')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-media-picker')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-media-picker').props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByTestId('customer-v21-kael-input')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-send')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-chat-disclaimer')).toHaveTextContent('Kael có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.')
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case')
  })

  it('opens the direct work handling route as inactive when no real job exists', () => {
    mockRouteParams = { mode: 'case' }

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-screen-2.5-chat-case')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-chat-service-electrical')).toBeNull()
    expect(screen.queryByTestId('customer-v21-chat-evidence-strip')).toBeNull()
    expect(screen.getByTestId('customer-v21-case-work-inactive')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-work-locked-empty')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-locked-shell')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-locked-progress-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-locked-artifacts')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-locked-edit')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-locked-approve')).toBeNull()
    expect(screen.getByTestId('customer-v21-kael-input')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-send')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-media-picker')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-media-picker').props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByTestId('customer-v21-kael-chat-disclaimer')).toHaveTextContent('Kael có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.')
    expect(screen.getByTestId('customer-v21-top-title')).not.toHaveTextContent(/Trò chuyện thường|Xử lý công việc/)
    expect(screen.queryByTestId('customer-v21-top-subtitle')).toBeNull()
    fireEvent.press(screen.getByTestId('customer-v21-chat-mode-menu-button'))
    expect(screen.getByTestId('customer-v21-chat-tab-case-work')).toHaveTextContent('Xử lý công việc')
    expect(screen.getByTestId('customer-v21-chat-tab-case-work').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.queryByText(/máy lạnh|AC|Nguyễn Văn Minh|4\.9|paid_held|Vietcombank/i)).toBeNull()
  })

  it('lets the canonical work mode override a stale normal chat screen param', () => {
    mockRouteParams = { mode: 'case', screen: '2.4-chat-normal' }

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-screen-2.5-chat-case')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-work-inactive')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-screen-2.4-chat-normal')).toBeNull()
  })

  it('keeps inactive work handling cards hidden without a real job while keeping the bottom composer', () => {
    mockRouteParams = { mode: 'case' }

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-case-work-inactive')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-work-locked-shell')).toBeNull()
    expect(screen.getByTestId('customer-v21-kael-input')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-send')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-media-picker')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-media-picker').props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByTestId('customer-v21-kael-chat-disclaimer')).toHaveTextContent('Kael có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.')
    expect(mockKaelChatCreate).not.toHaveBeenCalled()
    expect(mockJobChatSend).not.toHaveBeenCalled()
  })

  it('compresses location and ETA tracking into a Case Work card', () => {
    mockRouteParams = { jobId: 'job_test_1', mode: 'case' }
    const deal = buildDeal()
    buildWorkflow({
      ...deal,
      broadcast: {
        ...deal.broadcast!,
        secondsRemaining: 42 * 60,
      },
      workerProfile: {
        avatarUrl: null,
        fullName: 'Nguyen Van Minh',
        id: 'worker_test_1',
        rating: 0,
        totalJobs: 12,
      },
    })

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-case-eta-card')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-eta-card')).toHaveTextContent(/42/)
    expect(screen.getByTestId('customer-v21-case-eta-card')).toHaveTextContent(/Nguyen Van Minh/)
    expect(screen.getByTestId('customer-v21-case-eta-card')).toHaveTextContent(/thời gian đến/)
    expect(screen.getByTestId('customer-v21-case-eta-card')).not.toHaveTextContent(/ETA/)
    expect(screen.queryByTestId('customer-v21-case-work-live-signal')).toBeNull()
    expect(screen.queryByTestId('customer-v21-location-timeline')).toBeNull()
  })

  it('compresses the live arrival alert into a Case Work card', () => {
    mockRouteParams = { jobId: 'job_test_1', mode: 'case' }
    const deal = buildDeal()
    buildWorkflow({
      ...deal,
      backendStatus: 'worker_on_way',
      broadcast: {
        ...deal.broadcast!,
        secondsRemaining: 13 * 60,
      },
      status: 'worker_on_way',
      workerProfile: {
        avatarUrl: null,
        fullName: 'Worker On Way',
        id: 'worker_test_1',
        rating: 0,
        totalJobs: 12,
      },
    })

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-case-live-alert-card')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-live-alert-card-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-live-alert-card')).toHaveTextContent(/13|Worker On Way/)
    expect(screen.queryByTestId('customer-v21-case-eta-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-live-signal')).toBeNull()
    expect(screen.queryByTestId('customer-v21-live-alert-stage')).toBeNull()
  })

  it('compresses the accepted worker workboard into a Case Work card', () => {
    mockRouteParams = { jobId: 'job_test_1', mode: 'case' }
    const deal = buildDeal()
    buildWorkflow({
      ...deal,
      backendStatus: 'arrived',
      status: 'arrived',
      workerProfile: {
        avatarUrl: null,
        fullName: 'Arrived Worker',
        id: 'worker_test_1',
        rating: 0,
        totalJobs: 12,
      },
    })

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-case-accepted-worker-card')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-accepted-worker-card-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-accepted-worker-card')).toHaveTextContent(/Arrived Worker/)
    expect(screen.queryByTestId('customer-v21-case-live-alert-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-live-signal')).toBeNull()
    expect(screen.queryByTestId('customer-v21-job-accepted-stage')).toBeNull()
  })

  it('compresses job progress and evidence into a Case Work card', () => {
    mockRouteParams = { jobId: 'job_test_1', mode: 'case' }
    const deal = buildDeal()
    buildWorkflow({
      ...deal,
      backendStatus: 'repairing',
      completionNotes: 'Checked outlet load.',
      completionPhotoUrls: ['storage://job_test_1/after.jpg'],
      status: 'repairing',
    })

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-case-job-progress-card')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-job-progress-card-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-job-progress-card')).toHaveTextContent(/Checked outlet load|2/)
    expect(screen.getByTestId('customer-v21-job-progress-bar-fill')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-job-progress-stage')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-live-signal')).toBeNull()
  })

  it('compresses real payment state into a focused Case Work card', () => {
    mockRouteParams = { focus: 'payment', jobId: 'job_test_1', mode: 'case' }
    buildWorkflow(buildDealWithPayment())

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-case-payment-card')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-payment-card-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-payment-card-zip-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-payment-card')).toHaveTextContent(/260\.000/)
    expect(screen.getByTestId('customer-v21-case-payment-card')).toHaveTextContent(/VietQR/)
    expect(screen.getByTestId('customer-v21-case-payment-card')).toHaveTextContent(/240\.000|20\.000/)
    expect(screen.getByTestId('customer-v21-case-payment-ledger')).toHaveTextContent(/PAY_JOB_TEST_1|VietQR/)
    expect(screen.queryByTestId('customer-v21-case-matching-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-options-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-quote-decision-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-eta-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-live-alert-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-accepted-worker-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-job-progress-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-approval-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-recommendation')).toBeNull()
    expect(screen.queryByTestId('customer-v21-payment-review-case')).toBeNull()
    expect(screen.queryByTestId('customer-v21-payment-method-total')).toBeNull()
    expect(screen.queryByTestId('customer-v21-payment-protected-hero')).toBeNull()
  })

  it('hydrates work handling through the workflow provider when a jobId route is opened', async () => {
    mockRouteParams = { jobId: 'job_remote_1', mode: 'case' }

    render(<KaelChatSurface />)

    await waitFor(() => {
      expect(mockHydrateRemoteJobById).toHaveBeenCalledWith('job_remote_1')
    })
    expect(screen.getByTestId('customer-v21-screen-2.5-chat-case')).toBeOnTheScreen()
    expect(screen.queryByText(/520\.000|Nguyễn Văn Minh|4\.9|paid_held/i)).toBeNull()
  })

  it('uses case chat only when a real job exists', async () => {
    mockRouteParams = { jobId: 'job_test_1', mode: 'case' }
    buildWorkflow(buildDeal())
    mockKaelAssistantAsk.mockResolvedValue({
      success: true,
      data: {
        answer: 'Kael da ghi nhan tinh trang cong viec.',
        boundary: 'answered',
        citations: ['Job context'],
        fallback_used: false,
        safety_notes: [],
        suggested_actions: ['check_job'],
      },
    })

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-screen-2.5-chat-case')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-overview')).toHaveTextContent(/#MOH-260001/)
    expect(screen.getByTestId('customer-v21-case-overview')).not.toHaveTextContent(/job_test_1/)
    expect(screen.getByTestId('customer-v21-case-overview')).toHaveTextContent(/180\.000/)
    expect(screen.getByTestId('customer-v21-case-overview')).toHaveTextContent(/84%/)
    expect(screen.getByTestId('customer-v21-case-eta-card')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-eta-card-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-work-live-signal')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-evidence')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-artifacts')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-progress')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-recommendation')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-request-edit')).toBeNull()
    expect(screen.queryByTestId('customer-v21-chat-evidence-strip')).toBeNull()
    expect(screen.getByTestId('customer-v21-kael-input')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-chat-disclaimer')).toHaveTextContent('Kael có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.')

    expect(screen.queryByTestId('customer-v21-chat-activity-link')).toBeNull()

    expect(mockKaelAssistantAsk).not.toHaveBeenCalled()
    expect(mockJobChatSend).not.toHaveBeenCalled()
  })

  it('keeps Case Work questions sendable when the assistant endpoint is not deployed yet', async () => {
    jest.useFakeTimers()
    try {
      mockRouteParams = { jobId: 'job_test_1', mode: 'case' }
      buildWorkflow(buildDeal())
      mockKaelAssistantAsk.mockResolvedValue({
        success: false,
        code: 'NOT_FOUND',
        error: 'Không tìm thấy endpoint',
        status: 404,
      })
      mockJobServiceSendMessage.mockResolvedValueOnce({
        success: true,
        data: {
          message: {
            content: 'Khi nào thì có thợ?',
            created_at: '2026-06-30T04:00:00.000Z',
            id: 'msg_case_question_1',
            is_read: false,
            job_id: 'job_test_1',
            sender_id: 'customer_test_1',
            sender_role: 'customer',
          },
        },
        status: 201,
      })

      render(<KaelChatSurface />)

      fireEvent.changeText(screen.getByTestId('customer-v21-kael-input'), 'Khi nào thì có thợ?')
      await act(async () => {
        fireEvent.press(screen.getByTestId('customer-v21-kael-send'))
        await Promise.resolve()
        await Promise.resolve()
      })
      await act(async () => {
        jest.runOnlyPendingTimers()
        await Promise.resolve()
      })

      expect(mockKaelAssistantAsk).toHaveBeenCalledWith(expect.objectContaining({
        job_id: 'job_test_1',
        message: 'Khi nào thì có thợ?',
        surface: 'customer_case',
      }))
      expect(mockJobServiceSendMessage).toHaveBeenCalledWith('job_test_1', { content: 'Khi nào thì có thợ?' })
      expect(screen.queryByText('Không tìm thấy endpoint')).toBeNull()
      expect(screen.getByText('Khi nào thì có thợ?')).toBeOnTheScreen()
      expect(screen.getByTestId('customer-v21-kael-input').props.value).toBe('')
    } finally {
      jest.useRealTimers()
    }
  })

  it('compresses the matching stage into a Case Work status card', () => {
    mockRouteParams = { jobId: 'job_test_1', mode: 'case' }
    buildWorkflow({
      ...buildDeal(),
      backendStatus: 'broadcasting',
      status: 'broadcasting',
    })

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-case-matching-card')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-matching-card')).toHaveTextContent(/84%|0/)
    expect(screen.getByTestId('customer-v21-case-matching-card')).toHaveTextContent(/thời gian đến/)
    expect(screen.getByTestId('customer-v21-case-matching-card')).not.toHaveTextContent(/ETA/)
    expect(screen.queryByTestId('customer-v21-case-work-live-signal')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-recommendation')).toBeNull()
  })

  it('requires case evidence before revealing matching or quote cards', async () => {
    jest.useFakeTimers()
    mockRouteParams = { jobId: 'job_test_1', mode: 'case' }
    const deal = buildDeal()
    buildWorkflow({
      ...deal,
      backendStatus: 'broadcasting',
      draft: {
        ...deal.draft,
        mediaCount: 0,
      },
      status: 'broadcasting',
    })
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          fileName: 'socket.jpg',
          fileSize: 1234,
          mimeType: 'image/jpeg',
          type: 'image',
          uri: 'file:///socket.jpg',
        },
      ],
    })
    mockUploadJobMediaDrafts.mockResolvedValue({
      mediaRefs: ['storage://job_test_1/before/socket.jpg'],
      success: true,
    })
    mockHydrateRemoteJobById.mockResolvedValue(true)

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-matching-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-quote-decision-card')).toBeNull()

    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-v21-agentic-evidence-add-media'))
    })
    expect(screen.getByTestId('customer-v21-agentic-evidence-file-count')).toHaveTextContent('1')

    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-v21-agentic-evidence-confirm'))
    })

    expect(mockUploadJobMediaDrafts).toHaveBeenCalledWith('job_test_1', expect.any(Array), 'before')
    expect(mockHydrateRemoteJobById).toHaveBeenCalledWith('job_test_1')
    expect(screen.queryByTestId('customer-v21-agentic-evidence-gate')).toBeNull()
    expect(screen.getByTestId('customer-v21-kael-process-lines')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-matching-card')).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(24_000)
      await Promise.resolve()
    })

    expect(screen.queryByTestId('customer-v21-kael-process-lines')).toBeNull()
    expect(screen.getByTestId('customer-v21-case-matching-card')).toBeOnTheScreen()
  })

  it('keeps quote approval blocked behind case evidence when no media exists', async () => {
    jest.useFakeTimers()
    mockRouteParams = { jobId: 'job_test_1', mode: 'case' }
    const deal = buildDeal()
    buildWorkflow({
      ...deal,
      backendStatus: 'awaiting_customer_confirm',
      draft: {
        ...deal.draft,
        mediaCount: 0,
      },
      status: 'awaiting_customer_confirm',
    })
    mockHydrateRemoteJobById.mockResolvedValue(true)

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-agentic-evidence-gate')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-options-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-quote-decision-card')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-agentic-evidence-reject'))
    fireEvent.changeText(screen.getByTestId('customer-v21-agentic-evidence-reason'), 'Không có ảnh lúc này.')

    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-v21-agentic-evidence-skip'))
    })

    expect(mockUploadJobMediaDrafts).not.toHaveBeenCalled()
    expect(mockHydrateRemoteJobById).toHaveBeenCalledWith('job_test_1')
    expect(screen.queryByTestId('customer-v21-agentic-evidence-gate')).toBeNull()
    expect(screen.getByTestId('customer-v21-kael-process-lines')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-options-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-quote-decision-card')).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(24_000)
      await Promise.resolve()
    })

    expect(screen.queryByTestId('customer-v21-kael-process-lines')).toBeNull()
    expect(screen.getByTestId('customer-v21-case-options-card')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-quote-decision-card')).toBeNull()
  })

  it('compresses quote approval into a Case Work decision card', async () => {
    jest.useFakeTimers()
    mockRouteParams = { jobId: 'job_test_1', mode: 'case' }
    buildWorkflow({
      ...buildDeal(),
      backendStatus: 'awaiting_customer_confirm',
      status: 'awaiting_customer_confirm',
    })

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-case-options-card')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-quote-decision-card')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-case-options-continue'))

    expect(screen.getByTestId('customer-v21-case-quote-decision-card')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-quote-decision-card')).toHaveTextContent(/180\.000/)
    expect(screen.getByTestId('customer-v21-case-quote-decision-card')).toHaveTextContent(/84%/)
    expect(screen.queryByTestId('customer-v21-case-work-live-signal')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-recommendation')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-case-quote-confirm'))
    expect(mockConfirmRemoteSearch).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/history?screen=2.9-quotes')

    await act(async () => {
      jest.runOnlyPendingTimers()
    })
  })

  it('keeps quote rejection reason inside the Case Work card before chatting', async () => {
    jest.useFakeTimers()
    mockRouteParams = { jobId: 'job_test_1', mode: 'case' }
    buildWorkflow({
      ...buildDeal(),
      backendStatus: 'awaiting_customer_confirm',
      status: 'awaiting_customer_confirm',
    })
    mockKaelAssistantAsk.mockResolvedValue({
      success: true,
      data: {
        answer: 'Kael se hoi them ly do va dieu chinh de xuat.',
        boundary: 'answered',
        citations: ['Job context'],
        fallback_used: false,
        safety_notes: [],
        suggested_actions: ['adjust_quote'],
      },
    })

    render(<KaelChatSurface />)

    fireEvent.press(screen.getByTestId('customer-v21-case-options-continue'))
    fireEvent.press(screen.getByTestId('customer-v21-case-quote-reject'))
    expect(screen.getByTestId('customer-v21-case-quote-reject-reason')).toBeOnTheScreen()

    fireEvent.changeText(screen.getByTestId('customer-v21-case-quote-reject-input'), 'Giá hơi cao, Kael kiểm tra lại giúp tôi.')
    fireEvent.press(screen.getByTestId('customer-v21-case-quote-reject-send'))

    await waitFor(() => {
      expect(mockKaelAssistantAsk).toHaveBeenCalledWith(expect.objectContaining({
        job_id: 'job_test_1',
        message: 'Giá hơi cao, Kael kiểm tra lại giúp tôi.',
        surface: 'customer_case',
      }))
    })

    await act(async () => {
      jest.runOnlyPendingTimers()
    })
  })

  it('shows pending scope decisions as chat-native confirm or decline gates', () => {
    mockRouteParams = { jobId: 'job_test_1', mode: 'case' }
    buildWorkflow({
      ...buildDeal(),
      scopeChange: {
        createdAt: '2026-06-28T01:00:00.000Z',
        evidencePhotoUrls: [],
        id: 'scope_change_1',
        kaelProgress: null,
        kaelReview: { confidence: 0.78 },
        priceMax: 80000,
        priceMin: 50000,
        reason: 'Th\u1ee3 ph\u00e1t hi\u1ec7n th\u00eam \u1ed5 c\u1eafm l\u1ecfng.',
        requestedDescription: 'Th\u00eam b\u01b0\u1edbc si\u1ebft l\u1ea1i \u1ed5 c\u1eafm.',
        status: 'waiting_customer_decision',
      },
      status: 'scope_change_pending',
    })

    render(<KaelChatSurface />)

    expect(screen.getByTestId('customer-v21-case-work-approval-card')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-case-work-approval-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-work-progress')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-live-signal')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-evidence')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-artifacts')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-recommendation')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-case-work-scope-approve'))
    expect(mockDecideScopeChange).toHaveBeenCalledWith('scope_change_1', { decision: 'approve' })

    fireEvent.press(screen.getByTestId('customer-v21-case-work-scope-reject'))
    expect(screen.queryByTestId('customer-v21-case-work-approval-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-scope-approve')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-work-scope-reject')).toBeNull()
    expect(screen.getByTestId('customer-v21-kael-input')).toHaveProp('placeholder', '')
    expect(screen.getByText(/l\u00fd do/)).toBeOnTheScreen()
  })
})
