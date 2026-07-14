import { readFileSync } from 'fs'
import { resolve } from 'path'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import type { CustomerKaelConversationSession } from '@/lib/api-types/customer'

let mockRouteParams: Record<string, string> = { mode: 'normal' }
const mockReplace = jest.fn()
const mockConversationCreate = jest.fn()
const mockConversationList = jest.fn()
const mockConversationGet = jest.fn()
const mockConversationArchive = jest.fn()
const mockConversationRename = jest.fn()
const mockConversationPin = jest.fn()
const mockConversationSendTurn = jest.fn()
const mockKaelChatGet = jest.fn()
const mockJobChatSend = jest.fn(async () => true)
let mockCustomerId = 'customer_kael_test_0'
let mockAuthSessionProvider: string | undefined
let mockWorkflowDeal: LocalDeal | null = null
let mockJobMessages: { content: string; id: string; sender_role: 'customer' | 'kael' | 'worker' }[] = []
let mockCustomerSequence = 0
let mockConversationSequence = 0
let mockSessionsByMode: Record<'normal' | 'case', any[]> = { case: [], normal: [] }

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

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

jest.mock('@/components/ui/accessibility-motion', () => ({
  useGlassAccessibility: () => ({ reduceMotion: true, reduceTransparency: false }),
}))

jest.mock('@/components/ui/kael-core-v9', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    KaelCoreV9: ({ testID }: { testID?: string }) => React.createElement(View, { testID }),
  }
})

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({
    session: {
      access_token: undefined,
      user: {
        app_metadata: mockAuthSessionProvider ? { provider: mockAuthSessionProvider } : {},
        id: mockCustomerId,
      },
    },
  }),
}))

jest.mock('@/lib/services', () => {
  const actual = jest.requireActual('@/lib/services')
  return {
    ...actual,
    customerKaelConversationService: {
      archive: (...args: any[]) => mockConversationArchive(...args),
      create: (...args: any[]) => mockConversationCreate(...args),
      get: (...args: any[]) => mockConversationGet(...args),
      list: (...args: any[]) => mockConversationList(...args),
      rename: (...args: any[]) => mockConversationRename(...args),
      sendTurn: (...args: any[]) => mockConversationSendTurn(...args),
      setPinned: (...args: any[]) => mockConversationPin(...args),
    },
    kaelChatService: {
      ...actual.kaelChatService,
      get: (...args: any[]) => mockKaelChatGet(...args),
    },
  }
})

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => ({
    actions: {},
    customerWorkerCandidate: null,
    customerWorkerCandidateBusy: false,
    customerWorkerCandidateError: null,
    dispatch: jest.fn(),
    selectors: {},
    state: {
      deal: mockWorkflowDeal,
      lastError: null,
      lastRemoteSyncAt: null,
      workerGate: 'remote_backend',
    },
  }),
}))

jest.mock('@/lib/use-job-chat-thread', () => ({
  useJobChatThread: (_jobId: string | null, enabled: boolean) => ({
    error: null,
    messages: enabled ? mockJobMessages : [],
    send: mockJobChatSend,
  }),
}))

jest.mock('expo-audio', () => ({
  AudioModule: { requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })) },
  RecordingPresets: { HIGH_QUALITY: {} },
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioRecorder: () => ({
    getURI: jest.fn(() => null),
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
  }),
  useAudioRecorderState: () => ({ durationMillis: 0, isRecording: false }),
}))

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images', Videos: 'Videos' },
  launchImageLibraryAsync: jest.fn(async () => ({ assets: [], canceled: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return { ...actual, useAppLanguage: () => 'vi' }
})

import { CustomerKaelSurface } from '../customer-surfaces'
import { useCustomerKaelConversations } from '../v21/use-customer-kael-conversations'

const readCustomerSource = (relativePath: string) =>
  readFileSync(resolve(__dirname, '..', relativePath), 'utf-8').replace(/\r\n/g, '\n')
const readMobileSource = (relativePath: string) =>
  readFileSync(resolve(__dirname, '../../..', relativePath), 'utf-8').replace(/\r\n/g, '\n')

function makeConversationSession(
  mode: 'normal' | 'case',
  id: string,
  clientRequestId = `${id}-request`,
): CustomerKaelConversationSession {
  return {
    case_job_id: null,
    case_session_id: null,
    client_request_id: clientRequestId,
    customer_id: mockCustomerId,
    id,
    mode,
    pinned_at: null,
    started_at: '2026-07-13T16:00:00.000Z',
    title: null,
    total_turns: 0,
    updated_at: '2026-07-13T16:00:00.000Z',
  }
}

function makeWorkflowDeal(): LocalDeal {
  return {
    backendStatus: 'broadcasting',
    broadcast: {
      broadcastId: 'broadcast-old-session',
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'Quận 7',
      jobId: 'job-old-session',
      prebrief: [],
      problemSummary: 'Vòi nước rò rỉ',
      secondsRemaining: 42,
      serviceType: 'plumbing',
      status: 'sent',
    },
    completionNotes: null,
    completionPhotoUrls: [],
    draft: {
      addressLabel: 'Tòa A, Quận 7',
      description: 'Vòi nước của phiên cũ',
      districtLabel: 'Quận 7',
      inferredProblemLabel: null,
      mediaCount: 0,
      needsServiceChoice: false,
      problemChips: ['Vòi nước rò rỉ'],
      serviceType: 'plumbing',
      source: 'booking',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: null,
    finalPrice: null,
    id: 'job-old-session',
    payment: null,
    scopeChange: null,
    status: 'broadcasting',
  }
}

function updateMockSession(sessionId: string, patch: Record<string, unknown>) {
  for (const mode of ['normal', 'case'] as const) {
    const index = mockSessionsByMode[mode].findIndex((session) => session.id === sessionId)
    if (index >= 0) {
      const updated = { ...mockSessionsByMode[mode][index], ...patch }
      mockSessionsByMode[mode][index] = updated
      return updated
    }
  }
  throw new Error(`Missing mock conversation ${sessionId}`)
}

async function waitForConversationCatalog(mode: 'normal' | 'case') {
  await waitFor(() => expect(mockConversationList).toHaveBeenCalledWith(mode))
  await flushLatestConversationList()
}

async function flushLatestConversationList() {
  const latestRequest = mockConversationList.mock.results[mockConversationList.mock.results.length - 1]?.value
  await act(async () => {
    await latestRequest
    await Promise.resolve()
  })
}

describe('active customer Kael chat surface wiring', () => {
  beforeEach(async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    await AsyncStorage.clear()
    mockReplace.mockClear()
    mockRouteParams = { mode: 'normal' }
    mockAuthSessionProvider = undefined
    mockWorkflowDeal = null
    mockJobMessages = []
    mockJobChatSend.mockClear()
    mockCustomerSequence += 1
    mockCustomerId = `customer_kael_test_${mockCustomerSequence}`
    mockConversationSequence = 0
    mockSessionsByMode = { case: [], normal: [] }
    ;[
      mockConversationCreate,
      mockConversationList,
      mockConversationGet,
      mockConversationArchive,
      mockConversationRename,
      mockConversationPin,
      mockConversationSendTurn,
      mockKaelChatGet,
    ].forEach((mock) => mock.mockReset())
    mockConversationList.mockImplementation(async (mode: 'normal' | 'case') => ({
      data: { sessions: [...mockSessionsByMode[mode]] },
      success: true,
    }))
    mockConversationCreate.mockImplementation(async ({ mode, client_request_id }: { mode: 'normal' | 'case'; client_request_id: string }) => {
      mockConversationSequence += 1
      const session = makeConversationSession(mode, `conversation-${mockConversationSequence}`, client_request_id)
      mockSessionsByMode[mode] = [session, ...mockSessionsByMode[mode]]
      return { data: { session, turns: [] }, success: true }
    })
    mockConversationGet.mockImplementation(async (sessionId: string) => {
      const session = [...mockSessionsByMode.normal, ...mockSessionsByMode.case].find((item) => item.id === sessionId)
      return session
        ? { data: { session, turns: [] }, success: true }
        : { error: { code: 'NOT_FOUND', message: 'not found' }, success: false }
    })
    mockConversationArchive.mockImplementation(async (sessionId: string) => {
      mockSessionsByMode.normal = mockSessionsByMode.normal.filter((item) => item.id !== sessionId)
      mockSessionsByMode.case = mockSessionsByMode.case.filter((item) => item.id !== sessionId)
      return {
        data: {
          archived_at: '2026-07-13T17:00:00.000Z',
          case_action: 'none',
          case_session_id: null,
          job_id: null,
          job_status: null,
          session_id: sessionId,
        },
        success: true,
      }
    })
    mockKaelChatGet.mockResolvedValue({
      data: {
        session: {
          id: 'authoritative-case-session',
          job_id: 'job-linked-case',
          service_type: 'plumbing',
          status: 'confirmed',
        },
        turns: [],
      },
      success: true,
    })
    mockConversationRename.mockImplementation(async (sessionId: string, { title }: { title: string }) => {
      const session = updateMockSession(sessionId, { title })
      return { data: { session, turns: [] }, success: true }
    })
    mockConversationPin.mockImplementation(async (sessionId: string, { pinned }: { pinned: boolean }) => {
      const session = updateMockSession(sessionId, { pinned_at: pinned ? '2026-07-13T17:00:00.000Z' : null })
      return { data: { session, turns: [] }, success: true }
    })
    mockConversationSendTurn.mockImplementation(async (sessionId: string, { message }: { message: string }) => {
      const existing = [...mockSessionsByMode.normal, ...mockSessionsByMode.case].find((item) => item.id === sessionId)
      if (!existing) return { error: { code: 'NOT_FOUND', message: 'not found' }, success: false }
      const session = updateMockSession(sessionId, { total_turns: existing.total_turns + 2 })
      return {
        data: {
          session,
          turns: [
            { conversation_id: sessionId, created_at: '2026-07-13T17:01:00.000Z', id: `${sessionId}-customer`, role: 'customer', text_content: message, turn_index: 1 },
            { conversation_id: sessionId, created_at: '2026-07-13T17:01:01.000Z', id: `${sessionId}-kael`, role: 'kael', text_content: 'Kael đã ghi nhận.', turn_index: 2 },
          ],
        },
        success: true,
      }
    })
  })

  it('routes Customer Kael through the V21 surface instead of the deleted split stack', () => {
    const kaelRoute = readMobileSource('app/(customer)/kael.tsx')
    const kaelChatRoute = readMobileSource('app/(customer)/kael-chat.tsx')
    const bridge = readCustomerSource('customer-surfaces.tsx')
    const surface = readCustomerSource('v21/surfaces.tsx')
    const chatView = readCustomerSource('v21/chat-stateful-surfaces.tsx')

    expect(kaelRoute).toContain('CustomerKaelSurface')
    expect(kaelRoute).toContain('@/components/customer/customer-surfaces')
    expect(kaelChatRoute).toContain('CustomerKaelSurface')
    expect(kaelChatRoute).toContain('@/components/customer/customer-surfaces')
    expect(kaelRoute).not.toContain('@/components/customer/kael-chat/kael-chat-surface')
    expect(kaelChatRoute).not.toContain('@/components/customer/kael-chat/kael-chat-surface')
    expect(bridge).toContain('CustomerKaelSurface')
    expect(surface).toContain('export function KaelChatSurface')
    expect(chatView).toContain('testID="customer-v21-kael-chat"')
    expect(chatView).toContain('customer-v21-screen-2.4-chat-normal')
    expect(chatView).not.toContain('customer-kael-chat-stack-screen')
  })

  it('keeps full-screen mint washes soft on the active V21 Kael route', () => {
    const canvas = readCustomerSource('v21/chat-surfaces.tsx')
    const shared = readCustomerSource('v21/shared-surfaces.tsx')

    expect(canvas).toContain('customer-v21-chat-canvas-aura')
    expect(canvas).toContain('FormulaMintCanvasAura')
    expect(canvas).toContain('scope="CustomerChat"')
    expect(canvas).not.toContain('rgba(136,235,221,0.34)')
    expect(canvas).not.toContain('rgba(13,174,154,0.22)')
    expect(shared).toContain('{ backgroundColor: tokens.canvas }')
  })

  it('keeps the Case Work activity action on Activity after retiring the Profile command center', () => {
    const surface = readCustomerSource('v21/surfaces.tsx')

    expect(surface).toContain("const openActivity = () => {\n    router.replace('/(customer)/history' as never)\n  }")
    expect(surface).not.toContain('/(customer)/profile?utility=agentic')
    expect(surface).not.toContain('/(customer)/profile?screen=5.2-command-center')
    expect(surface).not.toContain('/(customer)/profile?screen=5.3-approval-queue')
    expect(surface).not.toContain('/(customer)/profile?screen=5.4-memory')
  })

  it('uses native-safe SVG stop opacity for TestFlight aura parity', () => {
    const alphaStop = readMobileSource('components/ui/svg-alpha-stop.tsx')
    const primitiveAura = readMobileSource('components/ui/kael-primitives.tsx')
    const customerAura = readCustomerSource('v21/aura-surfaces.tsx')
    const bookingAura = readCustomerSource('v21/booking-surfaces.tsx')
    const chatAura = readCustomerSource('v21/chat-surfaces.tsx')
    const historyAura = readCustomerSource('v21/history-surfaces.tsx')
    const profileAura = readCustomerSource('v21/profile-metrics-surfaces.tsx')
    const workerAura = readMobileSource('components/worker/ui/aura-surfaces.tsx')

    expect(alphaStop).toContain('toHexChannel')
    expect(alphaStop).toContain('Math.min(255, Math.max(0, Math.round(Number(value))))')
    expect(alphaStop).toContain('toStopOpacity')
    expect(alphaStop).toContain('Math.min(1, Math.max(0, Number(value)))')
    expect(alphaStop).toContain('stopOpacity: stopOpacity ?? toStopOpacity(alpha)')
    expect(alphaStop).not.toContain('stopColor: `rgb(')
    expect(primitiveAura).toContain("from './svg-alpha-stop'")
    expect(bookingAura).toContain('AlphaStop as Stop')
    expect(customerAura).toContain('AlphaStop as Stop')
    expect(chatAura).toContain('AlphaStop as Stop')
    expect(historyAura).toContain('AlphaStop as Stop')
    expect(profileAura).toContain('AlphaStop as Stop')
    expect(workerAura).toContain('AlphaStop as Stop')
  })

  it('renders the Worker-parity Customer shell without copying Worker semantics', async () => {
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('normal')

    expect(screen.getByTestId('customer-v21-kael-header-actions')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-new-conversation')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-mode-toggle')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-active-mode')).toHaveTextContent('Chat thường')
    expect(screen.getByTestId('customer-v21-kael-empty-hero-normal')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-empty-hero-model')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-empty-hero-copy')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-input')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-chat-disclaimer')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-normal-greeting-bubble')).toBeNull()
    expect(screen.queryByText(/nhận việc|cơ hội việc/i)).toBeNull()
  })

  it('keeps the Kael empty-state timeline looping while the app is active', () => {
    const hero = readCustomerSource('v21/kael-empty-hero.tsx')

    expect(hero).toContain("motionClip={reduceMotion || !appActive ? undefined : 'autoplay-loop'}")
    expect(hero).not.toContain("'autoplay-once'")
  })

  it('uses reduced-motion-aware liquid spring feedback across the header and session controls', () => {
    const header = readCustomerSource('v21/kael-chat-header.tsx')
    const menu = readCustomerSource('v21/kael-session-menu.tsx')
    const liquidPressable = readCustomerSource('v21/kael-liquid-pressable.tsx')

    expect(header).toContain('KaelLiquidPressable')
    expect(menu).toContain('KaelLiquidPressable')
    expect(menu).toContain('KaelLiquidReveal')
    expect(liquidPressable).toContain('motionTokens.liquid.press')
    expect(liquidPressable).toContain('motionTokens.liquid.entrance')
    expect(liquidPressable).toContain('withSpring')
    expect(liquidPressable).toContain('reduceMotion')
    expect(liquidPressable).not.toContain('withRepeat')
  })

  it('hides the empty hero while typing and creates a truly blank normal conversation', async () => {
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('normal')

    const input = screen.getByTestId('customer-v21-kael-input')
    fireEvent(input, 'focus')
    expect(screen.queryByTestId('customer-v21-kael-empty-hero-normal')).toBeNull()

    fireEvent.changeText(input, 'Tôi cần hỏi một việc')
    fireEvent(input, 'blur')
    expect(screen.queryByTestId('customer-v21-kael-empty-hero-normal')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    expect(screen.getByTestId('customer-v21-kael-session-menu')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-new'))
    await waitFor(() => expect(mockConversationCreate).toHaveBeenCalledWith(expect.objectContaining({ mode: 'normal' })))
    expect(screen.getByTestId('customer-v21-kael-input')).toHaveProp('value', '')
    expect(screen.getByTestId('customer-v21-kael-empty-hero-normal')).toBeOnTheScreen()
  })

  it('deduplicates rapid new-session taps before React can repaint the disabled state', async () => {
    const session = makeConversationSession('normal', 'rapid-session')
    let resolveCreate!: (value: { data: { session: ReturnType<typeof makeConversationSession>; turns: [] }; success: true }) => void
    const pendingCreate = new Promise<{ data: { session: ReturnType<typeof makeConversationSession>; turns: [] }; success: true }>((resolve) => {
      resolveCreate = resolve
    })
    mockConversationCreate.mockImplementationOnce(() => pendingCreate)
    const { result } = renderHook(() => useCustomerKaelConversations('normal', 'vi'))

    await waitForConversationCatalog('normal')
    let requests: Promise<unknown>[] = []
    act(() => {
      requests = [result.current.startNewSession(), result.current.startNewSession()]
    })

    expect(mockConversationCreate).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveCreate({ data: { session, turns: [] }, success: true })
      await Promise.all(requests)
    })
    expect(result.current.activeSessionId).toBe('rapid-session')
  })

  it('persists pre-link Work handling turns in its own Customer catalog', async () => {
    const { result } = renderHook(() => useCustomerKaelConversations('case', 'vi'))
    await waitForConversationCatalog('case')

    await act(async () => {
      await result.current.startNewSession()
    })
    await act(async () => {
      await result.current.sendConversationTurn('Tôi muốn hỏi trước khi đặt dịch vụ')
    })

    expect(mockConversationSendTurn).toHaveBeenCalledWith(
      result.current.activeSessionId,
      expect.objectContaining({ message: 'Tôi muốn hỏi trước khi đặt dịch vụ' }),
    )
    expect(result.current.turns.map((turn) => turn.text_content)).toEqual([
      'Tôi muốn hỏi trước khi đặt dịch vụ',
      'Kael đã ghi nhận.',
    ])
  })

  it('continues a linked Work handling session through the Customer conversation service', async () => {
    const linkedSession = {
      ...makeConversationSession('case', 'linked-case-catalog'),
      case_session_id: 'authoritative-case-session',
    }
    mockSessionsByMode.case = [linkedSession]
    const { result } = renderHook(() => useCustomerKaelConversations('case', 'vi'))
    await waitForConversationCatalog('case')

    await act(async () => {
      await result.current.openSession(linkedSession.id)
    })
    await act(async () => {
      await result.current.sendConversationTurn('Kiểm tra lại phương án cho công việc này')
    })

    expect(mockConversationSendTurn).toHaveBeenCalledWith(
      linkedSession.id,
      expect.objectContaining({ message: 'Kiểm tra lại phương án cho công việc này' }),
    )
  })

  it('reuses one in-flight catalog refresh instead of racing stale lists', async () => {
    const { result } = renderHook(() => useCustomerKaelConversations('normal', 'vi'))
    await waitForConversationCatalog('normal')
    const callsBeforeRefresh = mockConversationList.mock.calls.length
    let resolveRefresh!: (value: { data: { sessions: ReturnType<typeof makeConversationSession>[] }; success: true }) => void
    const pendingRefresh = new Promise<{ data: { sessions: ReturnType<typeof makeConversationSession>[] }; success: true }>((resolve) => {
      resolveRefresh = resolve
    })
    mockConversationList.mockImplementationOnce(() => pendingRefresh)
    let refreshes: Promise<unknown>[] = []

    act(() => {
      refreshes = [result.current.refreshSessions(true), result.current.refreshSessions(true)]
    })

    expect(mockConversationList).toHaveBeenCalledTimes(callsBeforeRefresh + 1)
    await act(async () => {
      resolveRefresh({ data: { sessions: [...mockSessionsByMode.normal] }, success: true })
      await Promise.all(refreshes)
    })
  })

  it('does not let a late job-route sync override the Case Work session the Customer just created', async () => {
    const linkedSession = {
      ...makeConversationSession('case', 'linked-case-catalog'),
      case_job_id: 'job-linked-case',
      case_session_id: 'authoritative-case-session',
    }
    mockSessionsByMode.case = [linkedSession]
    const { result } = renderHook(() => useCustomerKaelConversations('case', 'vi'))
    await waitForConversationCatalog('case')
    const callsBeforeSync = mockConversationList.mock.calls.length
    let resolveRefresh!: (value: { data: { sessions: CustomerKaelConversationSession[] }; success: true }) => void
    const pendingRefresh = new Promise<{ data: { sessions: CustomerKaelConversationSession[] }; success: true }>((resolve) => {
      resolveRefresh = resolve
    })
    mockConversationList.mockImplementationOnce(() => pendingRefresh)
    let sync!: Promise<unknown>

    act(() => {
      sync = result.current.syncLinkedJobSession('job-linked-case')
    })
    await waitFor(() => expect(mockConversationList).toHaveBeenCalledTimes(callsBeforeSync + 1))
    await act(async () => {
      await result.current.startNewSession('22222222-2222-4222-8222-222222222222')
    })
    const customerSelectedSessionId = result.current.activeSessionId
    await act(async () => {
      resolveRefresh({ data: { sessions: [...mockSessionsByMode.case] }, success: true })
      await sync
    })

    expect(customerSelectedSessionId).not.toBeNull()
    expect(result.current.activeSessionId).toBe(customerSelectedSessionId)
    expect(result.current.activeSessionId).not.toBe(linkedSession.id)
    expect(mockConversationGet).not.toHaveBeenCalledWith(linkedSession.id)
  })

  it('keeps a catalog-load error inside the menu when creating a new conversation fails', async () => {
    mockConversationList.mockResolvedValue({
      code: 'DB_ERROR',
      error: 'catalog unavailable',
      status: 500,
      success: false,
    })
    mockConversationCreate.mockResolvedValueOnce({
      code: 'DB_ERROR',
      error: 'create unavailable',
      status: 500,
      success: false,
    })
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('normal')
    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    await waitFor(() => expect(screen.getByText('Chưa tải được các cuộc trò chuyện. Vui lòng thử lại.')).toBeOnTheScreen())

    fireEvent.press(screen.getByTestId('customer-v21-kael-session-new'))

    await waitFor(() => expect(mockConversationCreate).toHaveBeenCalledWith(expect.objectContaining({ mode: 'normal' })))
    await waitFor(() => expect(screen.getByText('Chưa thể tạo cuộc trò chuyện mới.')).toBeOnTheScreen())
    expect(screen.queryByText('Chưa tải được các cuộc trò chuyện. Vui lòng thử lại.')).toBeNull()
  })

  it('switches to Customer work handling with analysis-and-orchestration copy only', async () => {
    const view = render(<CustomerKaelSurface />)

    await waitForConversationCatalog('normal')

    fireEvent.press(screen.getByTestId('customer-v21-kael-mode-toggle'))

    const modeMenu = view.UNSAFE_getByProps({ testID: 'customer-v21-chat-mode-menu' })
    const caseModeOption = view.UNSAFE_getByProps({ testID: 'customer-v21-chat-tab-case-work' })
    expect(modeMenu).toBeTruthy()
    expect(StyleSheet.flatten(modeMenu.props.style)).toMatchObject({ maxWidth: 208, right: 16, width: '59%' })
    expect(StyleSheet.flatten(caseModeOption.props.style)).toMatchObject({ minHeight: 46 })
    expect(view.UNSAFE_getByProps({ children: 'Phân tích và điều phối dịch vụ' })).toBeTruthy()

    fireEvent.press(view.UNSAFE_getByProps({ testID: 'customer-v21-chat-tab-case-work' }))

    await waitForConversationCatalog('case')

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case')
    expect(screen.getByTestId('customer-v21-kael-active-mode')).toHaveTextContent('Xử lý công việc')
    expect(screen.getByTestId('customer-v21-kael-empty-hero-case')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-media-picker')).toHaveProp('accessibilityState', { disabled: false })
    expect(screen.getByTestId('customer-v21-kael-input')).toHaveProp('placeholder', 'Mô tả nhu cầu dịch vụ cho Kael...')
    expect(screen.queryByText(/phân phối cơ hội|nhận việc/i)).toBeNull()
  })

  it('starts a blank Work handling session without manufacturing a Worker session', async () => {
    const view = render(<CustomerKaelSurface />)

    await waitForConversationCatalog('normal')

    fireEvent.press(screen.getByTestId('customer-v21-kael-mode-toggle'))
    fireEvent.press(view.UNSAFE_getByProps({ testID: 'customer-v21-chat-tab-case-work' }))
    await waitForConversationCatalog('case')
    fireEvent.changeText(screen.getByTestId('customer-v21-kael-input'), 'Tôi cần sửa vòi nước')
    expect(screen.queryByTestId('customer-v21-kael-empty-hero-case')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-new'))

    await waitFor(() => expect(mockConversationCreate).toHaveBeenCalledWith(expect.objectContaining({ mode: 'case' })))

    expect(mockReplace).toHaveBeenLastCalledWith('/(customer)/kael-chat?mode=case')
    expect(screen.getByTestId('customer-v21-kael-input')).toHaveProp('value', '')
    expect(screen.getByTestId('customer-v21-kael-empty-hero-case')).toBeOnTheScreen()
  })

  it('detaches a new Work handling session from the previous job thread', async () => {
    mockRouteParams = { mode: 'case' }
    mockWorkflowDeal = makeWorkflowDeal()
    mockJobMessages = [{
      content: 'Kael Công việc: Thông tin của phiên cũ',
      id: 'old-session-message',
      sender_role: 'kael',
    }]
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')
    expect(screen.getByText('Kael Công việc: Thông tin của phiên cũ')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-new'))

    await waitFor(() => expect(mockConversationCreate).toHaveBeenCalledWith(expect.objectContaining({ mode: 'case' })))
    await waitFor(() => expect(screen.getByTestId('customer-v21-kael-empty-hero-case')).toBeOnTheScreen())
    expect(screen.queryByText('Kael Công việc: Thông tin của phiên cũ')).toBeNull()

    fireEvent.changeText(screen.getByTestId('customer-v21-kael-input'), 'Tôi muốn hỏi thêm')
    fireEvent.press(screen.getByTestId('customer-v21-kael-send'))

    await waitFor(() => expect(mockConversationSendTurn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: 'Tôi muốn hỏi thêm' }),
    ))
    expect(mockJobChatSend).not.toHaveBeenCalled()
  })

  it('keeps Customer Preview on the server-scoped customer identity when listing and creating sessions', async () => {
    mockAuthSessionProvider = 'local-visual-audit'
    mockCustomerId = 'local-visual-audit-customer'
    mockRouteParams = { mode: 'normal', ns_audit_role: 'customer' }
    const serverCustomerId = 'customer_preview_server_identity'
    const listedSession = {
      ...makeConversationSession('normal', 'preview-listed-session'),
      customer_id: serverCustomerId,
    }
    const createdSession = {
      ...makeConversationSession('normal', 'preview-created-session'),
      customer_id: serverCustomerId,
    }
    mockConversationList.mockResolvedValue({
      data: { sessions: [listedSession] },
      success: true,
    })
    mockConversationCreate.mockResolvedValue({
      data: { session: createdSession, turns: [] },
      success: true,
    })
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('normal')
    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    expect(screen.getByTestId('customer-v21-kael-session-preview-listed-session')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('customer-v21-kael-session-new'))

    await waitFor(() => expect(mockConversationCreate).toHaveBeenCalledWith(expect.objectContaining({ mode: 'normal' })))
    await waitFor(() => expect(mockReplace).toHaveBeenLastCalledWith('/(customer)/kael-chat?mode=normal&ns_audit_role=customer'))
    expect(screen.queryByText('Chưa tải được các cuộc trò chuyện. Vui lòng thử lại.')).toBeNull()
    expect(screen.queryByText('Chưa thể tạo cuộc trò chuyện mới.')).toBeNull()
  })

  it('keeps mode catalogs separate and runs pin, rename, and delete on Customer sessions', async () => {
    const normalSession = makeConversationSession('normal', 'normal-session')
    const caseSession = makeConversationSession('case', 'case-session')
    mockSessionsByMode = { case: [caseSession], normal: [normalSession] }
    const view = render(<CustomerKaelSurface />)

    await waitForConversationCatalog('normal')
    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    await flushLatestConversationList()

    expect(screen.getByTestId('customer-v21-kael-session-normal-session')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-kael-session-case-session')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-kael-session-actions-normal-session'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-pin-normal-session'))
    await waitFor(() => expect(mockConversationPin).toHaveBeenCalledWith('normal-session', { pinned: true }))

    fireEvent.press(screen.getByTestId('customer-v21-kael-session-actions-normal-session'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-actions-normal-session'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-rename-normal-session'))
    await waitFor(() => expect(screen.getByTestId('customer-v21-kael-session-title-input')).toBeOnTheScreen())
    fireEvent.changeText(screen.getByTestId('customer-v21-kael-session-title-input'), 'Nhà bếp')
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-title-save'))
    await waitFor(() => expect(mockConversationRename).toHaveBeenCalledWith('normal-session', { title: 'Nhà bếp' }))

    fireEvent.press(screen.getByTestId('customer-v21-kael-session-actions-normal-session'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-delete-normal-session'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-delete-confirm-action-normal-session'))
    await waitFor(() => expect(mockConversationArchive).toHaveBeenCalledWith('normal-session', false))
    expect(screen.queryByTestId('customer-v21-kael-session-normal-session')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-mode-toggle'))
    fireEvent.press(view.UNSAFE_getByProps({ testID: 'customer-v21-chat-tab-case-work' }))
    await waitForConversationCatalog('case')
    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    await flushLatestConversationList()

    expect(screen.getByTestId('customer-v21-kael-session-case-session')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-kael-session-normal-session')).toBeNull()
  })

  it('warns before closing a linked Case Work session and sends explicit confirmation', async () => {
    mockRouteParams = { mode: 'case' }
    const linkedSession = {
      ...makeConversationSession('case', 'linked-case-conversation'),
      case_job_id: 'job-linked-case',
      case_session_id: 'authoritative-case-session',
    }
    mockSessionsByMode.case = [linkedSession]
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')
    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-actions-linked-case-conversation'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-delete-linked-case-conversation'))

    expect(screen.getByText(/Kael đang xử lý công việc này/)).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('customer-v21-kael-session-delete-confirm-action-linked-case-conversation'))

    await waitFor(() => expect(mockConversationArchive).toHaveBeenCalledWith('linked-case-conversation', true))
  })

  it('activates the catalog session that owns a routed Case Work job', async () => {
    mockRouteParams = { jobId: 'job-linked-case', mode: 'case' }
    mockWorkflowDeal = {
      ...makeWorkflowDeal(),
      id: 'job-linked-case',
      broadcast: {
        ...makeWorkflowDeal().broadcast!,
        jobId: 'job-linked-case',
      },
    }
    const linkedSession = {
      ...makeConversationSession('case', 'linked-case-conversation'),
      case_job_id: 'job-linked-case',
      case_session_id: 'authoritative-case-session',
    }
    mockSessionsByMode.case = [linkedSession]
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')
    await waitFor(() => expect(mockConversationGet).toHaveBeenCalledWith('linked-case-conversation'))
    await waitFor(() => expect(mockKaelChatGet).toHaveBeenCalledWith('authoritative-case-session'))

    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    expect(screen.getByText(/Đang mở · 0 lượt trao đổi/)).toBeOnTheScreen()
  })

  it('keeps concurrent actions on different sessions from overwriting each other', async () => {
    const first = makeConversationSession('normal', 'first-session')
    const second = makeConversationSession('normal', 'second-session')
    mockSessionsByMode.normal = [first, second]
    let resolvePin!: (value: { data: { session: ReturnType<typeof makeConversationSession>; turns: [] }; success: true }) => void
    const pendingPin = new Promise<{ data: { session: ReturnType<typeof makeConversationSession>; turns: [] }; success: true }>((resolve) => {
      resolvePin = resolve
    })
    mockConversationPin.mockImplementationOnce(() => pendingPin)
    const { result } = renderHook(() => useCustomerKaelConversations('normal', 'vi'))
    await waitForConversationCatalog('normal')

    let pinRequest!: Promise<boolean>
    let renameRequest!: Promise<boolean>
    act(() => {
      pinRequest = result.current.setSessionPinned(first.id, true)
      renameRequest = result.current.renameSession(second.id, 'Kitchen follow-up')
    })
    await act(async () => {
      await renameRequest
    })
    await act(async () => {
      resolvePin({
        data: {
          session: { ...first, pinned_at: '2026-07-13T17:00:00.000Z' },
          turns: [],
        },
        success: true,
      })
      await pinRequest
    })

    expect(result.current.sessions.find((session) => session.id === second.id)?.title).toBe('Kitchen follow-up')
    expect(result.current.sessions.find((session) => session.id === first.id)?.pinned_at).toBe('2026-07-13T17:00:00.000Z')
  })

  it('opens the selected normal session with only that session history', async () => {
    const session = makeConversationSession('normal', 'history-session')
    mockSessionsByMode.normal = [session]
    mockConversationGet.mockResolvedValue({
      data: {
        session,
        turns: [
          {
            conversation_id: session.id,
            created_at: '2026-07-13T16:01:00.000Z',
            id: 'history-turn-1',
            role: 'customer',
            text_content: 'Kiểm tra máy lạnh phòng ngủ',
            turn_index: 1,
          },
          {
            conversation_id: session.id,
            created_at: '2026-07-13T16:01:01.000Z',
            id: 'history-turn-2',
            role: 'kael',
            text_content: 'Kael đang lắng nghe.',
            turn_index: 2,
          },
        ],
      },
      success: true,
    })
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('normal')
    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-history-session'))

    await waitFor(() => expect(screen.getByText('Kiểm tra máy lạnh phòng ngủ')).toBeOnTheScreen())
    expect(screen.getByText('Kael đang lắng nghe.')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-kael-session-menu')).toBeNull()
  })

  it('keeps Customer Kael isolated from Worker session services', () => {
    const surface = readCustomerSource('v21/surfaces.tsx')
    const chatView = readCustomerSource('v21/chat-stateful-surfaces.tsx')
    const linkedCaseStart = surface.indexOf("if (mode === 'case' && deal)")
    const linkedCaseEnd = surface.indexOf('const intakeIntent', linkedCaseStart)
    const linkedCaseBranch = surface.slice(linkedCaseStart, linkedCaseEnd)

    expect(surface).not.toContain('workerKaelChatService')
    expect(linkedCaseBranch).toContain('conversations.sendConversationTurn(message)')
    expect(linkedCaseBranch).not.toContain('kaelAssistantService.ask')
    expect(chatView).not.toContain('/components/worker/')
    expect(chatView).not.toContain('worker-v5-')
  })

  it('wires a compact Customer-owned session menu with per-mode CRUD actions', () => {
    const surface = readCustomerSource('v21/surfaces.tsx')
    const header = readCustomerSource('v21/kael-chat-header.tsx')
    const menu = readCustomerSource('v21/kael-session-menu.tsx')
    const chatStyles = readCustomerSource('v21/chat-styles.ts')
    const mobileServices = readMobileSource('lib/services.ts')

    expect(surface).toContain('useCustomerKaelConversations')
    expect(header).toContain('sessionMenuOpen')
    expect(menu).toContain("'Ghim'")
    expect(menu).toContain("'Đổi tên'")
    expect(menu).toContain("'Xóa'")
    expect(menu).toContain('customer-v21-kael-session-new')
    expect(menu).toContain('maxWidth: 208')
    expect(chatStyles).toContain('maxWidth: 208')
    expect(chatStyles).toContain("outlineColor: 'rgba(13,167,151,0.62)'")
    expect(chatStyles.toLowerCase()).not.toContain('orange')
    expect(mobileServices).toContain('customerKaelConversationService')
    expect(surface).not.toContain('workerKaelChatService')
  })
})
