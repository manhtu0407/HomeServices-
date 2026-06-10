import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert, StyleSheet } from 'react-native'
import { buildWorkflowViewModel, LOCAL_WORKFLOW_PRICE_DISCLAIMER, type ServiceType } from '@home-services/shared'
import { type KaelChatResponse, type KaelChatTurn } from '@/lib/api-types'
import { KaelChatSurface } from '../kael-chat-surface'
import { setPendingKaelChatDraft, takePendingKaelChatDraft } from '../pending-intake'
import {
  EmptyKaelBriefCard,
  EstimateCard,
  KaelChatComposer,
  KaelChatHeader,
  KaelIntakeReceiptCard,
  KaelPhaseContextCard,
} from '../agentic-parts'
import { styles } from '../styles'
import { ChatTurn, KaelChatThread } from '../thread'

let mockRouteParams: Record<string, string | string[] | undefined> = {}
let mockAppLanguage: 'vi' | 'en' = 'vi'
const mockReplace = jest.fn()
const mockHydrateRemoteJobById = jest.fn()
const mockKaelChatCreate = jest.fn()
const mockKaelChatGet = jest.fn()
const mockKaelChatSendTurn = jest.fn()
const mockKaelChatStreamSendTurn = jest.fn()
const mockKaelChatConfirm = jest.fn()
const mockKaelChatProgressGet = jest.fn()
let mockWorkflowState: any = {
  deal: null,
  lastError: null,
  lastRemoteSyncAt: null,
  workerGate: 'backend_pending',
}

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  useRouter: () => ({ replace: mockReplace }),
}))

jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  }
})

jest.mock('expo-image', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Image: (props: any) => React.createElement(View, props),
  }
})

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
}))

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => ({
    actions: {
      hydrateRemoteJobById: mockHydrateRemoteJobById,
    },
    state: mockWorkflowState,
  }),
}))

jest.mock('@/lib/services', () => ({
  kaelChatService: {
    confirm: (...args: unknown[]) => mockKaelChatConfirm(...args),
    create: (...args: unknown[]) => mockKaelChatCreate(...args),
    get: (...args: unknown[]) => mockKaelChatGet(...args),
    sendTurn: (...args: unknown[]) => mockKaelChatSendTurn(...args),
  },
  kaelChatProgressService: {
    get: (...args: unknown[]) => mockKaelChatProgressGet(...args),
  },
  kaelChatStreamService: {
    sendTurn: (...args: unknown[]) => mockKaelChatStreamSendTurn(...args),
  },
}))

jest.mock('@/components/customer/customer-theme', () => ({
  getCustomerThemeTokens: () => ({
    aqua: '#CFF8EF',
    base: '#FFFEFA',
    border: '#D6E7E2',
    borderStrong: '#93CFC5',
    copper: '#9A691D',
    disabled: '#D8E3DF',
    glassHighlight: 'rgba(255,255,255,0.60)',
    ghost: '#EDF6F3',
    mode: 'light',
    muted: '#647672',
    primary: '#087F70',
    primaryText: '#FFFFFF',
    raised: '#FFFFFF',
    service: '#E9F8F3',
    subtleText: '#82928E',
    text: '#13231F',
    warm: '#FFF4DB',
  }),
  getReducedTransparencyCustomerTokens: (tokens: unknown) => tokens,
  useCustomerThemeMode: () => 'light',
}))

jest.mock('@/components/ui/accessibility-motion', () => ({
  useGlassAccessibility: () => ({ reduceMotion: false, reduceTransparency: false }),
}))

jest.mock('@/components/ui/glass-surface', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    GlassSurface: ({ children, ...props }: any) => React.createElement(View, props, children),
  }
})

jest.mock('@/lib/app-language', () => ({
  useAppLanguage: () => mockAppLanguage,
  localizedServiceLabel: (serviceType: string, language: 'vi' | 'en' = 'vi') => {
    const labels = {
      vi: {
        cleaning: 'Dọn dẹp nhà',
        electrical: 'Sửa điện',
        plumbing: 'Sửa nước',
      },
      en: {
        cleaning: 'Home cleaning',
        electrical: 'Electrical repair',
        plumbing: 'Plumbing repair',
      },
    }

    return labels[language][serviceType as keyof typeof labels.vi] ?? serviceType
  },
}))

const estimateText = {
  cancellationBody: 'Có thể hủy miễn phí trước khi thợ nhận.',
  complexity: {
    large: 'Lớn',
    medium: 'Vừa',
    small: 'Nhỏ',
  },
  estimateDisclaimerFallback: LOCAL_WORKFLOW_PRICE_DISCLAIMER,
  estimateProblemFallback: 'Kael đã phân loại vấn đề.',
  estimateTitle: 'Ước tính của Kael',
  orchestrate: 'Kael điều phối',
  labels: {
    advisory: 'Lưu ý',
    cancellationNote: 'Chính sách hủy',
    complexity: 'Mức độ',
    confidence: 'Độ tin cậy',
    platformFee: 'Phí nền tảng',
    price: 'Khoảng giá',
    problem: 'Vấn đề',
    service: 'Dịch vụ',
    summaryTotal: 'Tổng dự kiến',
  },
  nextAction: {
    await_input: 'Mô tả thêm để Kael phân loại chính xác hơn.',
    confirmed: 'Kael đang tìm thợ.',
    estimate_ready: 'Ước tính đã sẵn sàng để Kael điều phối.',
  },
  orchestrating: 'Đang điều phối',
} as any

const estimate = {
  advisory: 'Kael sẽ cập nhật nếu có bằng chứng phạm vi mới.',
  complexity: 'medium' as const,
  confidence: 0.84,
  disclaimer: LOCAL_WORKFLOW_PRICE_DISCLAIMER,
  price_max: 320000,
  price_min: 180000,
  problem_category: 'electrical',
  problem_summary: 'Ổ cắm chập chờn',
  service_type: 'electrical' as ServiceType,
}

const threadTokens = {
  aqua: '#CFF8EF',
  base: '#FFFEFA',
  border: '#D6E7E2',
  borderStrong: '#93CFC5',
  copper: '#9A691D',
  disabled: '#D8E3DF',
  glassHighlight: 'rgba(255,255,255,0.60)',
  ghost: '#EDF6F3',
  mode: 'light',
  muted: '#647672',
  primary: '#087F70',
  primaryText: '#FFFFFF',
  raised: '#FFFFFF',
  service: '#E9F8F3',
  text: '#13231F',
  warm: '#FFF4DB',
} as any

const threadText = {
  ...estimateText,
  activityOrchestrating: 'Orchestrating',
  activityResearch: 'Researching',
  activityThinking: 'Thinking',
  activityStage: {
    fallback: 'Using internal data',
    intent: 'Reading request',
    market: 'Checking market rates in {district}',
    price: 'Synthesizing estimate',
    problem: 'Matching standard price bands',
    vision: 'Analyzing photos',
  },
  history: 'Open activity',
  loading: 'Loading',
  retryIntake: 'Retry intake',
  retryOrchestration: 'Retry orchestration',
  turnFallback: 'Kael is updating this request.',
  welcome: 'Tell Kael what happened.',
} as any

const composerText = {
  ...threadText,
  addressPlaceholder: 'Dia chi',
  archiveActiveMeta: 'Dang mo',
  archiveCurrentChat: 'Chat hien tai',
  archiveDraftMeta: 'Cho tao phien',
  archiveEmptyBody: 'Gui mo ta that de Kael tao phien.',
  archiveEmptySubtitle: 'Chua co phien',
  archiveEmptyTitle: 'Chua co phien luu',
  archiveHistoryMeta: 'Xem hoat dong',
  archiveLoadingChat: 'Dang tai phien',
  archiveNoService: 'Chua chon dich vu',
  archiveOpen: 'Mo phien luu',
  archivePendingIntake: 'Phieu dang gui',
  archiveServiceRequest: 'Phien dat dich vu',
  archiveTitle: 'Phien Kael',
  attach: 'Anh',
  attachHint: 'Them ghi chu bang chu truoc.',
  back: 'Dong',
  composerPlaceholder: '',
  errorNoService: 'Chon dich vu truoc.',
  mic: 'Mic',
  micHint: 'Mic chua san sang.',
  send: 'Gui',
  sending: 'Dang gui',
} as any

const composerTokens = {
  ...threadTokens,
  disabled: '#D8E3DF',
  glassHighlight: 'rgba(255,255,255,0.60)',
  glassShadow: '0 12px 30px rgba(13,70,65,0.09)',
  subtleText: '#82928E',
} as any

const lifecyclePanelTestIds = [
  'customer-kael-chat-loading',
  'customer-kael-chat-error',
  'customer-kael-chat-live-activity',
  'customer-kael-chat-orchestration-started',
  'customer-kael-chat-intake-receipt',
  'customer-kael-chat-estimate-card',
  'customer-kael-chat-empty-ticket-summary',
  'customer-kael-agentic-process',
  'customer-kael-agentic-trace',
  'customer-kael-chat-phase-context',
] as const

function visibleLifecyclePanelIds() {
  return lifecyclePanelTestIds.filter((testID) => screen.queryByTestId(testID))
}

function buildKaelChatResponse(overrides: Partial<KaelChatResponse['session']> = {}): KaelChatResponse {
  const createdAt = '2026-06-03T00:00:00.000Z'
  return {
    session: {
      customer_id: 'customer_test_1',
      estimate: null,
      estimate_ready_at: null,
      id: 'kael_session_test_1',
      job_id: null,
      next_action: 'await_input',
      service_type: 'electrical',
      started_at: createdAt,
      status: 'active',
      total_cost_usd: 0,
      total_turns: 2,
      ...overrides,
    },
    turns: [
      {
        content_type: 'text',
        created_at: createdAt,
        estimate: null,
        id: 'turn_customer_1',
        media_refs: [],
        role: 'customer',
        session_id: 'kael_session_test_1',
        text_content: 'Bong den nha toi bi hu roi',
        turn_index: 1,
      },
      {
        content_type: 'clarification',
        created_at: createdAt,
        estimate: null,
        id: 'turn_kael_1',
        media_refs: [],
        role: 'kael',
        session_id: 'kael_session_test_1',
        text_content: 'Kael dang xu ly yeu cau nay.',
        turn_index: 2,
      },
    ],
  }
}

function ComposerHarness({
  initialDraft = '',
  onSend = jest.fn(async () => undefined),
}: {
  initialDraft?: string
  onSend?: () => Promise<void>
}) {
  const [addressLabel, setAddressLabel] = useState('')
  const [draft, setDraft] = useState(initialDraft)
  const [error, setError] = useState<string | null>(null)
  const dispatch = (action: any) => {
    if (action.type === 'setAddress') setAddressLabel(action.value)
    if (action.type === 'setDraft') {
      setDraft(action.value)
      if (action.clearTransientError) setError(null)
    }
    if (action.type === 'appendDraft') {
      setDraft((current) => (current.trim() ? `${current.trim()} ${action.segment.trim()}` : action.segment.trim()))
      setError(null)
    }
    if (action.type === 'showTransientError') setError(action.error)
  }

  return (
    <KaelChatComposer
      addressLabel={addressLabel}
      dispatch={dispatch}
      draft={draft}
      error={error}
      language="vi"
      onAddressDistrict={jest.fn()}
      onSend={onSend}
      reduceMotion
      sending={false}
      text={composerText}
      themeMode="light"
      tokens={composerTokens}
    />
  )
}

describe('Kael agentic phase cards', () => {
  beforeEach(() => {
    mockRouteParams = {}
    mockAppLanguage = 'vi'
    mockWorkflowState = {
      deal: null,
      lastError: null,
      lastRemoteSyncAt: null,
      workerGate: 'backend_pending',
    }
    mockReplace.mockClear()
    mockHydrateRemoteJobById.mockReset()
    mockHydrateRemoteJobById.mockResolvedValue(undefined)
    mockKaelChatCreate.mockReset()
    mockKaelChatGet.mockReset()
    mockKaelChatSendTurn.mockReset()
    mockKaelChatStreamSendTurn.mockReset()
    mockKaelChatConfirm.mockReset()
    mockKaelChatProgressGet.mockReset()
    takePendingKaelChatDraft()
  })

  it('ports the worker reference chat frame chrome into the customer Kael chat controls', () => {
    const dispatch = jest.fn()
    const onBack = jest.fn()
    const onSend = jest.fn(async () => undefined)

    render(
      <>
        <KaelChatHeader
          onBack={onBack}
          reduceMotion={false}
          text={composerText}
          tokens={composerTokens}
        />
        <KaelChatComposer
          addressLabel=""
          dispatch={dispatch}
          draft=""
          error={null}
          language="vi"
          onAddressDistrict={jest.fn()}
          onSend={onSend}
          reduceMotion={false}
          sending={false}
          text={composerText}
          themeMode="light"
          tokens={composerTokens}
        />
      </>,
    )

    expect(screen.getByTestId('customer-chat-reference-top-controls')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-kael-chat-kael-bubble')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-kael-chat-session-archive-toolbar')).toBeOnTheScreen()
    const archiveIconStageStyle = StyleSheet.flatten(screen.getByTestId('customer-kael-chat-session-archive-image-stage').props.style) as Record<string, unknown>
    expect(screen.getByTestId('customer-kael-chat-session-archive-image-icon')).toBeOnTheScreen()
    expect(archiveIconStageStyle.borderWidth).toBe(0)
    expect(archiveIconStageStyle.backgroundColor).toBe('transparent')
    expect(screen.getByTestId('customer-kael-composer-sequential-trigger')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-chat-reference-composer-keyline')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-chat-reference-composer-tools')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-chat-reference-composer-right-actions')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-chat-reference-mode-pill')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-chat-mode-pill-glass-layer')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-kael-chat-input').props.multiline).toBe(true)
    expect(screen.getByTestId('customer-kael-chat-input').props.scrollEnabled).toBe(false)
    const frameStyle = StyleSheet.flatten(styles.chatFrame) as Record<string, unknown>
    const composerWrapStyle = StyleSheet.flatten(screen.getByTestId('customer-kael-composer-sequential-trigger').props.style) as Record<string, unknown>
    expect(frameStyle.maxWidth).toBe(680)
    expect(composerWrapStyle.marginHorizontal).toBe(10)
    expect(screen.getByTestId('customer-kael-chat-address-slot')).toHaveProp('pointerEvents', 'none')
    expect(screen.getByTestId('customer-kael-chat-send').props.accessibilityState.disabled).toBe(true)

    fireEvent.press(screen.getByTestId('customer-kael-chat-close'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('opens a liquid archive toolbar with scroll bounded to three visible sessions', () => {
    const onOpenArchiveItem = jest.fn()

    render(
      <KaelChatHeader
        archiveItems={[
          { id: 'chat:1', meta: 'Dang mo', subtitle: 'Sua dien', title: 'Chat hien tai' },
          { id: 'job:1', meta: 'Xem hoat dong', subtitle: 'Sua dien', targetPath: '/(customer)/history?job_id=job_1', title: 'Phien dat dich vu' },
          { id: 'chat:2', meta: 'Da luu', subtitle: 'Sua nuoc', title: 'Chat Kael' },
          { id: 'job:2', meta: 'Xem hoat dong', subtitle: 'Ve sinh', targetPath: '/(customer)/history?job_id=job_2', title: 'Phien dat dich vu cu' },
        ]}
        onBack={jest.fn()}
        onOpenArchiveItem={onOpenArchiveItem}
        reduceMotion={false}
        text={composerText}
        tokens={composerTokens}
      />,
    )

    fireEvent.press(screen.getByTestId('customer-kael-chat-session-archive-toolbar'))

    const panelStyle = StyleSheet.flatten(screen.getByTestId('customer-kael-chat-session-archive-panel').props.style) as Record<string, unknown>
    const scrollStyle = StyleSheet.flatten(screen.getByTestId('customer-kael-chat-session-archive-scroll').props.style) as Record<string, unknown>
    expect(panelStyle.maxHeight).toBe(190)
    expect(scrollStyle.maxHeight).toBe(174)
    expect(screen.getByTestId('customer-kael-chat-session-archive-scroll').props.showsVerticalScrollIndicator).toBe(true)

    fireEvent.press(screen.getByTestId('customer-kael-chat-session-archive-item-1'))
    expect(onOpenArchiveItem).toHaveBeenCalledWith(expect.objectContaining({ targetPath: '/(customer)/history?job_id=job_1' }))
  })

  it('clears the pending intake send spinner after the automatic create request resolves', async () => {
    let resolveCreate: ((value: unknown) => void) | undefined
    mockKaelChatCreate.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))
    setPendingKaelChatDraft({
      addressLabel: 'Quan 7, TP.HCM',
      districtLabel: 'Quan 7',
      locale: 'vi',
      mediaCount: 0,
      message: 'Bong den nha toi bi hu roi',
      photoDrafts: [],
      problemChips: ['Bong den hu'],
      serviceType: 'electrical',
      source: 'booking',
    })

    render(<KaelChatSurface />)

    await waitFor(() => expect(mockKaelChatCreate).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('customer-kael-chat-send').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    })
    fireEvent.changeText(screen.getByTestId('customer-kael-chat-input'), 'Cau du thong tin chu?')

    await act(async () => {
      resolveCreate?.({ success: true, data: buildKaelChatResponse() })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByTestId('customer-kael-chat-send').props.accessibilityState).toMatchObject({
        busy: false,
        disabled: false,
      })
    })
    expect(screen.getByTestId('customer-kael-chat-input').props.value).toBe('Cau du thong tin chu?')
    expect(mockKaelChatCreate).toHaveBeenCalledTimes(1)
  })

  it('fetches the terminal Kael progress once after the first-turn create resolves (§32.3 first-turn)', async () => {
    let resolveCreate: ((value: unknown) => void) | undefined
    mockKaelChatCreate.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))
    mockKaelChatProgressGet.mockResolvedValue({
      success: true,
      data: {
        session_id: 'kael_session_test_1',
        progress: {
          current_stage: 'price_synthesis',
          failure_reason: null,
          progress: 1,
          status: 'completed',
          updated_at: '2026-06-10T00:00:00.000Z',
        },
      },
    })
    setPendingKaelChatDraft({
      addressLabel: 'Quan 7, TP.HCM',
      districtLabel: 'Quan 7',
      locale: 'vi',
      mediaCount: 0,
      message: 'Bong den nha toi bi hu roi',
      photoDrafts: [],
      problemChips: ['Bong den hu'],
      serviceType: 'electrical',
      source: 'booking',
    })

    render(<KaelChatSurface />)

    await waitFor(() => expect(mockKaelChatCreate).toHaveBeenCalledTimes(1))
    // No session id exists during the create turn, so the live poll cannot run yet.
    expect(mockKaelChatProgressGet).not.toHaveBeenCalled()

    await act(async () => {
      resolveCreate?.({ success: true, data: buildKaelChatResponse() })
      await Promise.resolve()
    })

    // One-shot terminal fetch keyed on the returned session id — turn 1 gets the
    // real stage trace for the post-turn disclosure instead of an empty one.
    await waitFor(() => expect(mockKaelChatProgressGet).toHaveBeenCalledWith('kael_session_test_1'))
    expect(mockKaelChatProgressGet).toHaveBeenCalledTimes(1)
  })

  it('routes a real Kael service session from the archive toolbar into Activity', async () => {
    mockRouteParams = { sessionId: 'kael_session_test_1' }
    mockKaelChatGet.mockResolvedValueOnce({
      success: true,
      data: buildKaelChatResponse({ job_id: 'job_archive_1' }),
    })

    render(<KaelChatSurface />)

    await waitFor(() => expect(mockKaelChatGet).toHaveBeenCalledWith('kael_session_test_1'))

    fireEvent.press(screen.getByTestId('customer-kael-chat-session-archive-toolbar'))
    expect(screen.getByTestId('customer-kael-chat-session-archive-item-0')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-kael-chat-session-archive-item-1')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('customer-kael-chat-session-archive-item-1'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/history?job_id=job_archive_1')
  })

  it('fast-polls real Kael progress while a follow-up turn is sending and cleans up after resolve', async () => {
    let resolveSend: ((value: unknown) => void) | undefined
    mockAppLanguage = 'en'
    mockRouteParams = { sessionId: 'kael_session_test_1' }
    mockKaelChatGet.mockResolvedValueOnce({
      success: true,
      data: buildKaelChatResponse(),
    })
    mockKaelChatStreamSendTurn.mockImplementation(() => new Promise((resolve) => {
      resolveSend = resolve
    }))
    mockKaelChatProgressGet.mockResolvedValue({
      success: true,
      data: {
        session_id: 'kael_session_test_1',
        progress: {
          current_stage: 'market_lookup',
          failure_reason: null,
          progress: 0.32,
          status: 'running',
          updated_at: '2026-06-04T00:00:00.000Z',
        },
      },
    })

    render(<KaelChatSurface />)
    await waitFor(() => expect(mockKaelChatGet).toHaveBeenCalledWith('kael_session_test_1'))

    jest.useFakeTimers()
    try {
      await act(async () => {
        fireEvent.changeText(screen.getByTestId('customer-kael-chat-input'), 'Outlet still sparks near the kitchen')
        await Promise.resolve()
      })
      await act(async () => {
        fireEvent.press(screen.getByTestId('customer-kael-chat-send'))
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(mockKaelChatStreamSendTurn).toHaveBeenCalled()
      expect(mockKaelChatProgressGet).toHaveBeenCalledWith('kael_session_test_1')
      expect(screen.getByTestId('customer-kael-chat-live-activity-label')).toHaveTextContent('Kael is checking market rates in your area.')

      await act(async () => {
        jest.advanceTimersByTime(800)
        await Promise.resolve()
      })
      expect(mockKaelChatProgressGet).toHaveBeenCalledTimes(2)

      await act(async () => {
        resolveSend?.({ success: true, data: buildKaelChatResponse({ total_turns: 3 }) })
        await Promise.resolve()
      })
      const callCountAfterResolve = mockKaelChatProgressGet.mock.calls.length

      await act(async () => {
        jest.advanceTimersByTime(1600)
        await Promise.resolve()
      })
      expect(mockKaelChatProgressGet).toHaveBeenCalledTimes(callCountAfterResolve)
    } finally {
      act(() => {
        jest.runOnlyPendingTimers()
      })
      jest.useRealTimers()
    }
  })

  it('opens the customer media picker from attach and turns the selected image into a sendable evidence note', async () => {
    const imagePicker = jest.requireMock('expo-image-picker')
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ fileName: 'o-cam-khet.jpg', fileSize: 1234, mimeType: 'image/jpeg', uri: 'file:///private/o-cam-khet.jpg' }],
    })

    render(<ComposerHarness />)

    fireEvent.press(screen.getByTestId('customer-kael-chat-attach'))

    await waitFor(() => expect(imagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled())
    await waitFor(() => expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('customer-kael-chat-input').props.value).toContain('o-cam-khet.jpg'))
    expect(screen.getByTestId('customer-kael-chat-send').props.accessibilityState.disabled).toBe(false)
    expect(alertSpy).toHaveBeenCalledWith('Anh', expect.stringContaining('Kael'))
    alertSpy.mockRestore()
  })

  it('keeps the mic control honest when voice dictation is unavailable', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)

    render(<ComposerHarness />)

    fireEvent.press(screen.getByTestId('customer-kael-chat-mic'))

    expect(alertSpy).toHaveBeenCalledWith('Mic', expect.stringContaining('Kael'))
    alertSpy.mockRestore()
  })

  it('keeps the address field visible only while the chat composer is focused', () => {
    const dispatch = jest.fn()
    const onSend = jest.fn(async () => undefined)

    jest.useFakeTimers()

    try {
      render(
        <KaelChatComposer
          addressLabel="Quận 1, TP.HCM"
          dispatch={dispatch}
          draft="Ổ cắm có mùi khét"
          error={null}
          language="vi"
          onAddressDistrict={jest.fn()}
          onSend={onSend}
          reduceMotion
          sending={false}
          text={composerText}
          themeMode="light"
          tokens={composerTokens}
        />,
      )

      const addressSlot = screen.getByTestId('customer-kael-chat-address-slot')
      const input = screen.getByTestId('customer-kael-chat-input')

      expect(addressSlot).toHaveProp('pointerEvents', 'none')

      fireEvent(input, 'focus')
      expect(addressSlot).toHaveProp('pointerEvents', 'auto')
      expect(screen.getByTestId('customer-kael-chat-address-keyline')).toBeOnTheScreen()
      const addressInputStyle = StyleSheet.flatten(screen.getByTestId('customer-kael-chat-address-input').props.style) as Record<string, unknown>
      expect(addressInputStyle.borderWidth).toBe(0)
      expect(addressInputStyle.outlineStyle).toBe('none')

      fireEvent(input, 'blur')
      act(() => {
        jest.advanceTimersByTime(180)
      })

      expect(addressSlot).toHaveProp('pointerEvents', 'none')
    } finally {
      jest.useRealTimers()
    }
  })

  it('renders the empty Kael ticket with honest sample rows for what Kael will record', () => {
    render(<EmptyKaelBriefCard language="vi" selectedService={null} text={estimateText} />)

    const card = screen.getByTestId('customer-kael-chat-empty-ticket-summary')

    expect(screen.getByText('Phiếu gửi Kael')).toBeOnTheScreen()
    expect(screen.getByText('Thông tin đầu vào')).toBeOnTheScreen()
    expect(screen.getAllByText('Dịch vụ').length).toBeGreaterThan(0)
    expect(screen.getByText('Khoảng giá')).toBeOnTheScreen()
    expect(screen.getByText('Kael sẽ ghi: Sửa điện, Sửa nước hoặc Vệ sinh.')).toBeOnTheScreen()
    expect(screen.getByText('Kael sẽ tóm tắt: ví dụ ổ cắm chập, nước rò, hoặc cần dọn nhà.')).toBeOnTheScreen()
    expect(screen.getByText('Kael sẽ ước tính sau khi có mô tả và bằng chứng.')).toBeOnTheScreen()
    expect(screen.getByText('Kael sẽ phân loại nhẹ, vừa hoặc nặng.')).toBeOnTheScreen()
    expect(screen.getByText('Kael sẽ cập nhật theo độ rõ của mô tả, ảnh hoặc video.')).toBeOnTheScreen()
    expect(card).not.toHaveTextContent(/\d{2,3}\.000đ/)
    expect(card).not.toHaveTextContent(/\d+%/)
  })

  it('keeps a selected service as real input while sampling the missing Kael fields', () => {
    render(<EmptyKaelBriefCard language="vi" selectedService="plumbing" text={estimateText} />)

    expect(screen.getByText('Sửa nước')).toBeOnTheScreen()
    expect(screen.queryByText('Kael sẽ ghi: Sửa điện, Sửa nước hoặc Vệ sinh.')).toBeNull()
    expect(screen.getByText('Kael sẽ tóm tắt: ví dụ ổ cắm chập, nước rò, hoặc cần dọn nhà.')).toBeOnTheScreen()
  })

  it('renders Booking handoff as a structured pending intake receipt without fake estimate stats', () => {
    render(
      <KaelIntakeReceiptCard
        intake={{
          addressLabel: 'Quận 1, TP.HCM',
          districtLabel: 'Quận 1',
          locale: 'vi',
          mediaCount: 2,
          message: 'Ổ cắm phòng khách chập chờn và có mùi khét nhẹ',
          photoDrafts: [],
          problemChips: ['Ổ cắm/công tắc hỏng'],
          serviceType: 'electrical',
          source: 'booking',
        }}
        language="vi"
      />,
    )

    const card = screen.getByTestId('customer-kael-chat-intake-receipt')

    expect(screen.getByText('Phiếu gửi Kael')).toBeOnTheScreen()
    expect(screen.getByText('Thông tin đầu vào')).toBeOnTheScreen()
    expect(screen.getByText('Sửa điện')).toBeOnTheScreen()
    expect(screen.getByText('Ổ cắm/công tắc hỏng')).toBeOnTheScreen()
    expect(screen.getByText('Chờ Kael ước tính')).toBeOnTheScreen()
    expect(screen.getByText('Hiển thị khi có ước tính')).toBeOnTheScreen()
    expect(card).not.toHaveTextContent(/\d{2,3}\.000đ/)
    expect(card).not.toHaveTextContent(/\d+%/)
  })

  it('renders pending intake phase context without exposing orchestration as live', () => {
    const workflow = buildWorkflowViewModel({ status: null, hasPendingIntake: true })

    render(<KaelPhaseContextCard language="vi" phaseContext={workflow.phaseContext} />)

    expect(screen.getByTestId('customer-kael-chat-phase-context')).toBeOnTheScreen()
    expect(screen.getByText('Tiếp nhận yêu cầu')).toBeOnTheScreen()
    expect(screen.getByText('Phiếu chờ')).toBeOnTheScreen()
    expect(screen.getAllByText(/Phiếu tiếp nhận/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Điều phối ·/)).toBeNull()
  })

  it('keeps estimate_ready as an estimate state until server confirmation starts matching', () => {
    render(
      <EstimateCard
        canStartOrchestration
        estimate={estimate}
        language="vi"
        onStartOrchestration={jest.fn()}
        orchestrating={false}
        orchestrationStarted={false}
        text={estimateText}
      />,
    )

    expect(screen.getByTestId('customer-kael-chat-estimate-card')).toHaveStyle(styles.estimateMintCard)
    expect(screen.getByTestId('customer-kael-chat-estimate-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByText('Ước tính đã sẵn sàng để Kael điều phối.')).toBeNull()
    expect(screen.getByText('Kael điều phối')).toBeOnTheScreen()
    expect(screen.queryByText('Đang điều phối')).toBeNull()
    expect(screen.getByTestId('customer-kael-chat-orchestration').props.accessibilityState).toMatchObject({
      busy: false,
      disabled: true,
    })
  })

  it('renders the orchestration confirmation with the worker mint material formula', () => {
    const openHistory = jest.fn()

    render(
      <KaelChatThread
        addressDistrict="Quận 1"
        dispatch={jest.fn()}
        error={null}
        estimate={null}
        historyTarget="/(customer)/history"
        language="vi"
        loading={false}
        onOpenHistory={openHistory}
        onRetryPendingIntake={jest.fn()}
        onStartOrchestration={jest.fn()}
        orchestrating={false}
        orchestrationMessage="Đã gửi yêu cầu đến 1 thợ. Đang chờ phản hồi."
        pendingIntake={null}
        progress={null}
        selectedService="electrical"
        sending={false}
        session={null}
        text={{ ...threadText, history: 'Xem hoạt động' }}
        tokens={{ ...threadTokens, glassHighlight: 'rgba(255,255,255,0.72)', glassShadow: '0 18px 36px rgba(16,74,66,0.12)' }}
        turns={[]}
        visibility={{
          canStartOrchestration: false,
          showBrief: false,
          showEstimate: false,
          showProcess: false,
          showStarter: false,
          showTrace: false,
        }}
        workflow={buildWorkflowViewModel({ status: 'broadcasting' })}
      />,
    )

    expect(screen.getByTestId('customer-kael-chat-orchestration-started')).toHaveStyle(styles.orchestrationStartedCard)
    expect(screen.getByTestId('customer-kael-chat-orchestration-mint-aura')).toBeOnTheScreen()
    expect(screen.getByText('Đã gửi yêu cầu đến 1 thợ. Đang chờ phản hồi.')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('customer-kael-chat-history-action'))
    expect(openHistory).toHaveBeenCalledWith('/(customer)/history')
  })

  it('shows real Kael activity while a service-context request is sending', () => {
    render(
      <KaelChatThread
        addressDistrict="District 1"
        dispatch={jest.fn()}
        error={null}
        estimate={null}
        historyTarget="/(customer)/history"
        language="en"
        loading={false}
        onOpenHistory={jest.fn()}
        onRetryPendingIntake={jest.fn()}
        onStartOrchestration={jest.fn()}
        orchestrating={false}
        orchestrationMessage={null}
        pendingIntake={null}
        progress={null}
        reduceMotion
        selectedService="electrical"
        sending
        session={null}
        text={threadText}
        tokens={threadTokens}
        turns={[]}
        visibility={{
          canStartOrchestration: false,
          showBrief: false,
          showEstimate: false,
          showProcess: false,
          showStarter: false,
          showTrace: false,
        }}
        workflow={buildWorkflowViewModel({ status: null })}
      />,
    )

    expect(screen.getByTestId('customer-kael-chat-live-activity')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-kael-chat-live-activity-label')).toHaveTextContent('Researching')
  })

  it('uses polled Kael progress as the live activity label when available', () => {
    render(
      <KaelChatThread
        addressDistrict="District 7"
        dispatch={jest.fn()}
        error={null}
        estimate={null}
        historyTarget="/(customer)/history"
        language="en"
        loading={false}
        onOpenHistory={jest.fn()}
        onRetryPendingIntake={jest.fn()}
        onStartOrchestration={jest.fn()}
        orchestrating={false}
        orchestrationMessage={null}
        pendingIntake={null}
        progress={{
          current_stage: 'market_lookup',
          failure_reason: null,
          progress: 0.32,
          status: 'running',
          updated_at: '2026-06-04T00:00:00.000Z',
        }}
        reduceMotion
        selectedService="electrical"
        sending
        session={null}
        text={threadText}
        tokens={threadTokens}
        turns={[]}
        visibility={{
          canStartOrchestration: false,
          showBrief: false,
          showEstimate: false,
          showProcess: false,
          showStarter: false,
          showTrace: false,
        }}
        workflow={buildWorkflowViewModel({ status: null })}
      />,
    )

    expect(screen.getByTestId('customer-kael-chat-live-activity-label')).toHaveTextContent('Checking market rates in District 7')
  })

  it('renders the real stage trace as a stepper without inventing missed stages', () => {
    render(
      <KaelChatThread
        addressDistrict="District 7"
        dispatch={jest.fn()}
        error={null}
        estimate={null}
        historyTarget="/(customer)/history"
        language="en"
        loading={false}
        onOpenHistory={jest.fn()}
        onRetryPendingIntake={jest.fn()}
        onStartOrchestration={jest.fn()}
        orchestrating={false}
        orchestrationMessage={null}
        pendingIntake={null}
        progress={{
          current_stage: 'market_lookup',
          failure_reason: null,
          progress: 0.32,
          status: 'running',
          updated_at: '2026-06-04T00:00:01.000Z',
        }}
        progressTrace={[
          {
            current_stage: 'intent_classification',
            failure_reason: null,
            progress: 0.2,
            status: 'completed',
            updated_at: '2026-06-04T00:00:00.000Z',
          },
          {
            current_stage: 'market_lookup',
            failure_reason: null,
            progress: 0.32,
            status: 'running',
            updated_at: '2026-06-04T00:00:01.000Z',
          },
        ]}
        reduceMotion
        selectedService="electrical"
        sending
        session={null}
        text={threadText}
        tokens={threadTokens}
        turns={[]}
        visibility={{
          canStartOrchestration: false,
          showBrief: false,
          showEstimate: false,
          showProcess: false,
          showStarter: false,
          showTrace: false,
        }}
        workflow={buildWorkflowViewModel({ status: null })}
      />,
    )

    expect(screen.getByTestId('customer-kael-chat-progress-trace')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-kael-chat-progress-step-intent_classification')).toHaveTextContent('Reading request')
    expect(screen.getByTestId('customer-kael-chat-progress-step-dot-intent_classification-completed')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-kael-chat-progress-step-market_lookup')).toHaveTextContent('Checking market rates in District 7')
    expect(screen.getByTestId('customer-kael-chat-progress-step-dot-market_lookup-running')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-kael-chat-progress-step-price_synthesis')).toBeNull()
  })

  it('collapses completed thinking into a measured disclosure and re-expands the trace', () => {
    render(
      <KaelChatThread
        addressDistrict="District 7"
        dispatch={jest.fn()}
        error={null}
        estimate={estimate}
        historyTarget="/(customer)/history"
        language="en"
        loading={false}
        onOpenHistory={jest.fn()}
        onRetryPendingIntake={jest.fn()}
        onStartOrchestration={jest.fn()}
        orchestrating={false}
        orchestrationMessage={null}
        pendingIntake={null}
        progress={null}
        progressElapsedMs={4200}
        progressTrace={[
          {
            current_stage: 'intent_classification',
            failure_reason: null,
            progress: 0.2,
            status: 'completed',
            updated_at: '2026-06-04T00:00:00.000Z',
          },
          {
            current_stage: 'price_synthesis',
            failure_reason: null,
            progress: 1,
            status: 'completed',
            updated_at: '2026-06-04T00:00:04.000Z',
          },
        ]}
        reduceMotion
        selectedService="electrical"
        sending={false}
        session={buildKaelChatResponse({
          estimate,
          estimate_ready_at: '2026-06-04T00:00:04.000Z',
          next_action: 'estimate_ready',
          status: 'estimate_ready',
        })}
        text={threadText}
        tokens={threadTokens}
        turns={buildKaelChatResponse().turns}
        visibility={{
          canStartOrchestration: true,
          showBrief: false,
          showEstimate: true,
          showProcess: false,
          showStarter: false,
          showTrace: false,
        }}
        workflow={buildWorkflowViewModel({ hasEstimate: true, status: 'estimate_ready' })}
      />,
    )

    expect(screen.getByTestId('customer-kael-chat-thought-label')).toHaveTextContent('Kael analyzed in 4s')
    expect(screen.queryByTestId('customer-kael-chat-thought-trace')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-kael-chat-thought-disclosure'))

    expect(screen.getByTestId('customer-kael-chat-thought-trace')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-kael-chat-progress-trace-settled')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-kael-chat-progress-step-price_synthesis')).toHaveTextContent('Synthesizing estimate')
  })

  it('renders streamed token text with a caret and removes the caret for Reduce Motion', () => {
    const baseProps = {
      addressDistrict: 'District 7',
      dispatch: jest.fn(),
      error: null,
      estimate: null,
      historyTarget: '/(customer)/history',
      language: 'en' as const,
      loading: false,
      onOpenHistory: jest.fn(),
      onRetryPendingIntake: jest.fn(),
      onStartOrchestration: jest.fn(),
      orchestrating: false,
      orchestrationMessage: null,
      pendingIntake: null,
      progress: null,
      selectedService: 'electrical' as const,
      sending: true,
      session: null,
      streamingField: 'clarification' as const,
      streamingText: 'Can you share one clear photo?',
      text: threadText,
      tokens: threadTokens,
      turns: [],
      visibility: {
        canStartOrchestration: false,
        showBrief: false,
        showEstimate: false,
        showProcess: false,
        showStarter: false,
        showTrace: false,
      },
      workflow: buildWorkflowViewModel({ status: null }),
    }

    const { rerender } = render(<KaelChatThread {...baseProps} reduceMotion={false} />)

    expect(screen.getByTestId('customer-kael-chat-streaming-token-body')).toHaveProp('accessibilityLabel', 'Can you share one clear photo?')
    expect(screen.getByTestId('customer-kael-chat-streaming-caret')).toBeOnTheScreen()

    rerender(<KaelChatThread {...baseProps} reduceMotion />)

    expect(screen.getByTestId('customer-kael-chat-streaming-token-body')).toHaveProp('accessibilityLabel', 'Can you share one clear photo?')
    expect(screen.queryByTestId('customer-kael-chat-streaming-caret')).toBeNull()
  })

  it('renders only one lifecycle panel for the current Kael phase', () => {
    render(
      <KaelChatThread
        addressDistrict="District 1"
        dispatch={jest.fn()}
        error={null}
        estimate={estimate}
        historyTarget="/(customer)/history"
        language="en"
        loading={false}
        onOpenHistory={jest.fn()}
        onRetryPendingIntake={jest.fn()}
        onStartOrchestration={jest.fn()}
        orchestrating={false}
        orchestrationMessage={null}
        pendingIntake={null}
        progress={null}
        reduceMotion
        selectedService="electrical"
        sending={false}
        session={buildKaelChatResponse({
          estimate,
          estimate_ready_at: '2026-06-03T00:00:02.000Z',
          next_action: 'estimate_ready',
        })}
        text={threadText}
        tokens={threadTokens}
        turns={buildKaelChatResponse().turns}
        visibility={{
          canStartOrchestration: true,
          showBrief: true,
          showEstimate: true,
          showProcess: true,
          showStarter: true,
          showTrace: true,
        }}
        workflow={buildWorkflowViewModel({
          hasAiNotes: true,
          hasCustomerInput: true,
          hasEstimate: true,
          status: 'estimate_ready',
        })}
      />,
    )

    expect(visibleLifecyclePanelIds()).toEqual(['customer-kael-chat-estimate-card'])
    expect(screen.queryByTestId('customer-kael-agentic-process')).toBeNull()
    expect(screen.queryByTestId('customer-kael-agentic-trace')).toBeNull()
    expect(screen.queryByTestId('customer-kael-chat-phase-context')).toBeNull()
  })

  it('reveals the latest Kael answer progressively instead of mounting it all at once', async () => {
    jest.useFakeTimers()

    try {
      const kaelAnswer = 'Kael is checking the request details and preparing the next step.'

      render(
        <KaelChatThread
          addressDistrict="District 1"
          dispatch={jest.fn()}
          error={null}
          estimate={null}
          historyTarget="/(customer)/history"
          language="en"
          loading={false}
          onOpenHistory={jest.fn()}
          onRetryPendingIntake={jest.fn()}
          onStartOrchestration={jest.fn()}
          orchestrating={false}
          orchestrationMessage={null}
          pendingIntake={null}
          progress={null}
          reduceMotion={false}
          selectedService="electrical"
          sending={false}
          session={null}
          text={threadText}
          tokens={threadTokens}
          turns={[
            {
              content_type: 'text',
              created_at: '2026-06-03T00:00:00.000Z',
              estimate: null,
              id: 'turn_customer_progressive',
              media_refs: [],
              role: 'customer',
              session_id: 'session_progressive',
              text_content: 'The outlet sparked.',
              turn_index: 1,
            },
            {
              content_type: 'clarification',
              created_at: '2026-06-03T00:00:01.000Z',
              estimate: null,
              id: 'turn_kael_progressive',
              media_refs: [],
              role: 'kael',
              session_id: 'session_progressive',
              text_content: kaelAnswer,
              turn_index: 2,
            },
          ]}
          visibility={{
            canStartOrchestration: false,
            showBrief: false,
            showEstimate: false,
            showProcess: false,
            showStarter: false,
            showTrace: false,
          }}
          workflow={buildWorkflowViewModel({ status: null })}
        />,
      )

      const visibleAnswer = screen.getByTestId('customer-kael-chat-turn-body-turn_kael_progressive')
      expect(visibleAnswer.props.children).not.toBe(kaelAnswer)

      await act(async () => {
        jest.advanceTimersByTime(1200)
        await Promise.resolve()
      })

      expect(screen.getByTestId('customer-kael-chat-turn-body-turn_kael_progressive').props.children).toBe(kaelAnswer)
    } finally {
      await act(async () => {
        jest.runOnlyPendingTimers()
        await Promise.resolve()
      })
      jest.useRealTimers()
    }
  })

  it('lets a failed Booking handoff retry pending intake without unlocking orchestration', () => {
    const retryPendingIntake = jest.fn()

    render(
      <KaelChatThread
        addressDistrict="District 1"
        dispatch={jest.fn()}
        error="Kael could not update this session."
        estimate={null}
        historyTarget="/(customer)/history"
        language="en"
        loading={false}
        onOpenHistory={jest.fn()}
        onRetryPendingIntake={retryPendingIntake}
        onStartOrchestration={jest.fn()}
        orchestrating={false}
        orchestrationMessage={null}
        pendingIntake={{
          addressLabel: 'District 1',
          districtLabel: 'District 1',
          locale: 'en',
          mediaCount: 1,
          message: 'Outlet sparks near the kitchen',
          photoDrafts: [],
          problemChips: ['Outlet issue'],
          serviceType: 'electrical',
          source: 'booking',
        }}
        progress={null}
        selectedService="electrical"
        sending={false}
        session={null}
        text={threadText}
        tokens={threadTokens}
        turns={[]}
        visibility={{
          canStartOrchestration: false,
          showBrief: false,
          showEstimate: false,
          showProcess: false,
          showStarter: false,
          showTrace: false,
        }}
        workflow={buildWorkflowViewModel({ status: null, hasPendingIntake: true })}
      />,
    )

    expect(screen.getByTestId('customer-kael-chat-intake-retry')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-kael-chat-orchestration-retry')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-kael-chat-intake-retry'))
    expect(retryPendingIntake).toHaveBeenCalledTimes(1)
  })
})

describe('ChatTurn — clarification rendering (A4)', () => {
  const clarifyText = { turnFallback: 'Kael đang xử lý' } as any

  function clarificationTurn(overrides: Partial<KaelChatTurn> = {}): KaelChatTurn {
    return {
      id: 'turn-1',
      session_id: 'sess-1',
      turn_index: 2,
      role: 'kael',
      content_type: 'clarification',
      text_content: 'Cầu dao có tự nhảy lại sau khi bạn bật lên không?',
      media_refs: [],
      estimate: null,
      clarification: {
        question: 'Cầu dao có tự nhảy lại sau khi bạn bật lên không?',
        missing_slots: ['symptom', 'severity'],
      },
      created_at: '2026-06-04T00:00:00Z',
      ...overrides,
    }
  }

  it('renders a distinct clarification affordance with the question and slot hints', () => {
    render(<ChatTurn language="vi" reduceMotion reveal={false} text={clarifyText} turn={clarificationTurn()} />)
    expect(screen.getByTestId('customer-kael-chat-clarification-turn-1')).toBeTruthy()
    expect(screen.getByText('Kael đang hỏi')).toBeTruthy()
    expect(screen.getByText('Cầu dao có tự nhảy lại sau khi bạn bật lên không?')).toBeTruthy()
    expect(screen.getByTestId('customer-kael-chat-clarification-slot-symptom')).toBeTruthy()
    expect(screen.getByText('dấu hiệu')).toBeTruthy()
    expect(screen.getByText('mức độ')).toBeTruthy()
  })

  it('does not apply the clarification affordance to a normal Kael text turn', () => {
    render(
      <ChatTurn
        language="vi"
        reduceMotion
        reveal={false}
        text={clarifyText}
        turn={clarificationTurn({ content_type: 'text', clarification: null, text_content: 'Xin chào bạn' })}
      />,
    )
    expect(screen.queryByTestId('customer-kael-chat-clarification-turn-1')).toBeNull()
  })

  it('still renders the question when slot data is absent (graceful)', () => {
    render(<ChatTurn language="vi" reduceMotion reveal={false} text={clarifyText} turn={clarificationTurn({ clarification: null })} />)
    expect(screen.getByTestId('customer-kael-chat-clarification-turn-1')).toBeTruthy()
    expect(screen.queryByTestId('customer-kael-chat-clarification-slot-symptom')).toBeNull()
  })

  it('localizes the clarification label and slot hints in English', () => {
    render(<ChatTurn language="en" reduceMotion reveal={false} text={clarifyText} turn={clarificationTurn()} />)
    expect(screen.getByText('Kael is asking')).toBeTruthy()
    expect(screen.getByText('symptom')).toBeTruthy()
  })
})
