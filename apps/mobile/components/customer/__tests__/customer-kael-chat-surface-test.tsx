import { readFileSync } from 'fs'
import { resolve } from 'path'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet, Text } from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import type { CustomerKaelConversationSession } from '@/lib/api-types/customer'
import { customerV21ServiceCopy } from '../v21/copy'

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
const mockHydrateRemoteJobById = jest.fn()
let mockCustomerId = 'customer_kael_test_0'
let mockAuthSessionProvider: string | undefined
let mockWorkflowDeal: LocalDeal | null = null
let mockWorkflowError: string | null = null
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
    actions: { hydrateRemoteJobById: mockHydrateRemoteJobById },
    customerWorkerCandidate: null,
    customerWorkerCandidateBusy: false,
    customerWorkerCandidateError: null,
    dispatch: jest.fn(),
    selectors: {},
    state: {
      deal: mockWorkflowDeal,
      lastError: mockWorkflowError,
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
    profile_id: null,
    service_type: null,
    started_at: '2026-07-13T16:00:00.000Z',
    title: null,
    total_turns: 0,
    updated_at: '2026-07-13T16:00:00.000Z',
  }
}

function makeCaseWorkResponse(sessionId: string, text: string) {
  return {
    session: {
      case_phase: 'analysis' as const,
      customer_id: mockCustomerId,
      diagnosis_scope: null,
      estimate: null,
      estimate_ready_at: null,
      id: sessionId,
      job_id: null,
      next_action: 'ask_question' as const,
      scheduled_at: null,
      service_type: 'handyman' as const,
      started_at: '2026-07-13T16:00:00.000Z',
      status: 'active' as const,
      total_cost_usd: 0,
      total_turns: 1,
    },
    turns: [{
      content_type: 'text' as const,
      created_at: '2026-07-13T16:01:00.000Z',
      estimate: null,
      id: `${sessionId}-turn`,
      media_refs: [],
      role: 'kael' as const,
      session_id: sessionId,
      text_content: text,
      turn_index: 1,
    }],
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
    mockWorkflowError = null
    mockJobMessages = []
    mockJobChatSend.mockClear()
    mockHydrateRemoteJobById.mockReset()
    mockHydrateRemoteJobById.mockResolvedValue(true)
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
    mockKaelChatGet.mockImplementation(async (sessionId: string) => ({
      data: {
        ...makeCaseWorkResponse(sessionId, ''),
        session: {
          ...makeCaseWorkResponse(sessionId, '').session,
          job_id: sessionId === 'authoritative-case-session' ? 'job-linked-case' : null,
          service_type: 'plumbing' as const,
          status: 'confirmed' as const,
        },
        turns: [],
      },
      success: true,
    }))
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
    const chatSurface = readCustomerSource('v21/kael-chat-surface.tsx')
    const chatController = readCustomerSource('v21/use-customer-kael-surface-controller.ts')
    const guardedActions = [
      readCustomerSource('v21/use-customer-kael-session-hydration.ts'),
      readCustomerSource('v21/use-customer-kael-evidence-actions.ts'),
      readCustomerSource('v21/use-customer-kael-message-actions.ts'),
      readCustomerSource('v21/use-customer-kael-decision-actions.ts'),
    ].join('\n')
    const chatView = readCustomerSource('v21/chat-stateful-surfaces.tsx')
    const chatPrimitives = readCustomerSource('v21/chat-surfaces.tsx')

    expect(kaelRoute).toContain('CustomerKaelSurface')
    expect(kaelRoute).toContain('@/components/customer/customer-surfaces')
    expect(kaelChatRoute).toContain('CustomerKaelSurface')
    expect(kaelChatRoute).toContain('@/components/customer/customer-surfaces')
    expect(kaelRoute).not.toContain('@/components/customer/kael-chat/kael-chat-surface')
    expect(kaelChatRoute).not.toContain('@/components/customer/kael-chat/kael-chat-surface')
    expect(bridge).toContain('CustomerKaelSurface')
    expect(surface).toContain('key={stateScopeKey}')
    expect(surface).toContain("from './kael-chat-surface'")
    expect(chatSurface).toContain('export function KaelChatSurface')
    expect(chatController).toContain('useCustomerKaelRequestGuard')
    expect(surface).toContain('customerKaelStateScopeKey')
    expect(guardedActions).toContain('.isCurrent(')
    expect(chatPrimitives).toContain("speaker: 'customer' | 'worker' | 'kael'")
    expect(chatPrimitives).not.toContain("role: 'customer' | 'worker' | 'kael'")
    expect(chatView).toContain('speaker="customer"')
    expect(chatView).not.toContain('<ChatBubble\n                role=')
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
    const surface = [
      readCustomerSource('v21/surfaces.tsx'),
      readCustomerSource('v21/customer-kael-chat-content.tsx'),
    ].join('\n')

    expect(surface).toContain('const onOpenActivity = useCallback(')
    expect(surface).toContain("router.replace('/(customer)/history' as never)")
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
    jest.useFakeTimers()
    const view = render(<CustomerKaelSurface />)

    try {
      await waitForConversationCatalog('normal')
      await act(async () => {
        jest.runOnlyPendingTimers()
        await Promise.resolve()
      })

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
    } finally {
      view.unmount()
      jest.useRealTimers()
    }
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

  it('sends a normal Kael message when the keyboard submits the composer', async () => {
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('normal')

    const input = screen.getByTestId('customer-v21-kael-input')
    fireEvent.changeText(input, 'Hey')
    fireEvent(input, 'submitEditing')

    await waitFor(() => expect(mockConversationSendTurn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: 'Hey' }),
    ))
    expect(screen.getByTestId('customer-v21-kael-input')).toHaveProp('value', '')
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

  it('switches to a blank composer immediately while the new session is created in the background', async () => {
    const session = makeConversationSession('normal', 'background-session')
    let resolveCreate!: (value: { data: { session: ReturnType<typeof makeConversationSession>; turns: [] }; success: true }) => void
    mockConversationCreate.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))
    render(<CustomerKaelSurface />)
    await waitForConversationCatalog('normal')

    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-new'))

    expect(screen.queryByTestId('customer-v21-kael-session-menu')).toBeNull()
    expect(screen.getByTestId('customer-v21-kael-input')).toHaveProp('editable', true)
    expect(screen.getByTestId('customer-v21-kael-empty-hero-normal')).toBeOnTheScreen()
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('/kael-chat'))

    await act(async () => {
      resolveCreate({ data: { session, turns: [] }, success: true })
    })
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

  it('reconciles a committed normal turn after the POST response times out', async () => {
    const { result } = renderHook(() => useCustomerKaelConversations('normal', 'vi'))
    await waitForConversationCatalog('normal')
    await act(async () => {
      await result.current.startNewSession()
    })
    const sessionId = result.current.activeSessionId!
    let committedResponse: any = null
    mockConversationSendTurn.mockImplementationOnce(async (_sessionId: string, input: { client_request_id: string; message: string }) => {
      const session = updateMockSession(sessionId, { total_turns: 2 })
      committedResponse = {
        session,
        turns: [
          {
            client_request_id: input.client_request_id,
            conversation_id: sessionId,
            created_at: '2026-07-13T17:01:00.000Z',
            id: `${sessionId}-customer-recovered`,
            role: 'customer',
            text_content: input.message,
            turn_index: 1,
          },
          {
            client_request_id: null,
            conversation_id: sessionId,
            created_at: '2026-07-13T17:01:01.000Z',
            id: `${sessionId}-kael-recovered`,
            role: 'kael',
            text_content: 'Kael đã lưu lượt này.',
            turn_index: 2,
          },
        ],
      }
      mockConversationGet.mockResolvedValueOnce({ data: committedResponse, success: true })
      return { code: 'TIMEOUT', error: 'Kết nối quá chậm, vui lòng thử lại', status: 0, success: false }
    })

    let recovered: any
    await act(async () => {
      recovered = await result.current.sendConversationTurn('Ổ cắm kêu lép bép.')
    })

    expect(recovered).toEqual(committedResponse)
    expect(mockConversationGet).toHaveBeenCalledWith(sessionId)
    expect(result.current.turns.map((turn) => turn.text_content)).toEqual([
      'Ổ cắm kêu lép bép.',
      'Kael đã lưu lượt này.',
    ])
  })

  it('refuses to send a linked Work handling turn through the generic Customer catalog', async () => {
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
    let sent: unknown
    await act(async () => {
      sent = await result.current.sendConversationTurn('Kiểm tra lại phương án cho công việc này')
    })

    expect(sent).toBeNull()
    expect(mockConversationSendTurn).not.toHaveBeenCalled()
    expect(result.current.sessionsError).toBe('Hãy tiếp tục trong phiên Xử lý công việc đang liên kết.')
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

  it('does not let a late catalog refresh restore an archived session', async () => {
    const archivedSession = makeConversationSession('normal', 'archived-during-refresh')
    mockSessionsByMode.normal = [archivedSession]
    const { result } = renderHook(() => useCustomerKaelConversations('normal', 'vi'))
    await waitForConversationCatalog('normal')
    let resolveRefresh!: (value: {
      data: { sessions: CustomerKaelConversationSession[] }
      success: true
    }) => void
    const pendingRefresh = new Promise<{
      data: { sessions: CustomerKaelConversationSession[] }
      success: true
    }>((resolve) => {
      resolveRefresh = resolve
    })
    mockConversationList.mockImplementationOnce(() => pendingRefresh)
    let refresh!: Promise<CustomerKaelConversationSession[]>

    act(() => {
      refresh = result.current.refreshSessions(true)
    })
    await act(async () => {
      expect(await result.current.archiveSession(archivedSession.id)).toBe(true)
    })
    expect(result.current.sessions.map((session) => session.id)).not.toContain(archivedSession.id)

    await act(async () => {
      resolveRefresh({ data: { sessions: [archivedSession] }, success: true })
      await refresh
    })
    expect(result.current.sessions.map((session) => session.id)).not.toContain(archivedSession.id)
  })

  it('never exposes the previous customer catalog during an auth identity switch', async () => {
    const customerA = mockCustomerId
    const sessionA = makeConversationSession('normal', 'customer-a-session')
    mockSessionsByMode.normal = [sessionA]
    const renderSnapshots: {
      activeSessionId: string | null
      identityVersion: number
      sessionIds: string[]
    }[] = []
    const { result, rerender } = renderHook(
      ({ identityVersion }: { identityVersion: number }) => {
        const conversations = useCustomerKaelConversations('normal', 'vi')
        renderSnapshots.push({
          activeSessionId: conversations.activeSessionId,
          identityVersion,
          sessionIds: conversations.sessions.map((session) => session.id),
        })
        return conversations
      },
      { initialProps: { identityVersion: 0 } },
    )
    await waitForConversationCatalog('normal')
    await act(async () => {
      await result.current.openSession(sessionA.id)
    })
    expect(result.current.activeSessionId).toBe(sessionA.id)

    let resolveCustomerARefresh!: (value: {
      data: { sessions: CustomerKaelConversationSession[] }
      success: true
    }) => void
    const pendingCustomerARefresh = new Promise<{
      data: { sessions: CustomerKaelConversationSession[] }
      success: true
    }>((resolve) => {
      resolveCustomerARefresh = resolve
    })
    mockConversationList.mockImplementationOnce(() => pendingCustomerARefresh)
    let customerARefresh!: Promise<CustomerKaelConversationSession[]>
    act(() => {
      customerARefresh = result.current.refreshSessions(true)
    })

    mockCustomerId = `${customerA}-switched`
    const sessionB = makeConversationSession('normal', 'customer-b-session')
    mockSessionsByMode.normal = [sessionB]
    rerender({ identityVersion: 1 })

    const switchedIdentitySnapshots = renderSnapshots.filter((snapshot) => snapshot.identityVersion === 1)
    expect(switchedIdentitySnapshots.length).toBeGreaterThan(0)
    expect(switchedIdentitySnapshots.every((snapshot) => (
      snapshot.activeSessionId === null && !snapshot.sessionIds.includes(sessionA.id)
    ))).toBe(true)
    expect(result.current.sessions).not.toContainEqual(sessionA)
    expect(result.current.activeSessionId).toBeNull()
    await waitFor(() => expect(result.current.sessions).toEqual([sessionB]))

    await act(async () => {
      resolveCustomerARefresh({ data: { sessions: [sessionA] }, success: true })
      await customerARefresh
    })
    expect(result.current.sessions).toEqual([sessionB])
    expect(result.current.activeSessionId).toBeNull()
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

  it('activates a linked Case Work summary after one catalog request without a duplicate detail fetch', async () => {
    const { result } = renderHook(() => useCustomerKaelConversations('case', 'vi'))
    await waitForConversationCatalog('case')
    const callsBeforeSync = mockConversationList.mock.calls.length
    const linkedSession = {
      ...makeConversationSession('case', 'new-case-catalog'),
      case_session_id: 'new-authoritative-case-session',
    }
    mockSessionsByMode.case = [linkedSession]

    await act(async () => {
      await result.current.syncLinkedCaseSession('new-authoritative-case-session')
    })

    expect(mockConversationList).toHaveBeenCalledTimes(callsBeforeSync + 1)
    expect(mockConversationGet).not.toHaveBeenCalledWith('new-case-catalog')
    expect(result.current.activeSessionId).toBe('new-case-catalog')
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

  it('does not attach a plain Work handling route to the previous job thread', async () => {
    mockRouteParams = { mode: 'case' }
    mockWorkflowDeal = makeWorkflowDeal()
    mockJobMessages = [{
      content: 'Kael Công việc: Thông tin của phiên cũ',
      id: 'old-session-message',
      sender_role: 'kael',
    }]
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')
    expect(screen.queryByText('Kael Công việc: Thông tin của phiên cũ')).toBeNull()
    expect(screen.getByTestId('customer-v21-kael-empty-hero-case')).toBeOnTheScreen()

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

  it('does not trust a routed local job snapshot after server hydration rejects it', async () => {
    mockRouteParams = { jobId: 'job-old-session', mode: 'case' }
    mockWorkflowDeal = makeWorkflowDeal()
    mockJobMessages = [{
      content: 'Kael Công việc: Snapshot cũ không còn trên server',
      id: 'deleted-job-message',
      sender_role: 'kael',
    }]
    mockHydrateRemoteJobById.mockResolvedValue(false)
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')
    await waitFor(() => expect(mockHydrateRemoteJobById).toHaveBeenCalledWith('job-old-session'))
    await waitFor(() => expect(screen.queryByText('Kael Công việc: Snapshot cũ không còn trên server')).toBeNull())
    expect(screen.getByText('Chưa có công việc thật.')).toBeOnTheScreen()
  })

  it('surfaces the workflow error that explains why a case transition was rejected', async () => {
    mockRouteParams = { jobId: 'job-old-session', mode: 'case' }
    mockWorkflowDeal = makeWorkflowDeal()
    mockWorkflowError = 'Chưa có yêu cầu để tìm thợ'
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')
    await waitFor(() => expect(mockHydrateRemoteJobById).toHaveBeenCalledWith('job-old-session'))
    expect(screen.getByText('Chưa có yêu cầu để tìm thợ')).toBeOnTheScreen()
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
    const caseSession = {
      ...makeConversationSession('case', 'case-session'),
      case_session_id: 'authoritative-case-session',
      profile_id: 'water_diagnose',
      service_type: 'plumbing',
    }
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
    expect(screen.getByText(customerV21ServiceCopy.vi.plumbing.label)).toBeOnTheScreen()
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
    expect(mockConversationGet).not.toHaveBeenCalledWith('linked-case-conversation')
    await waitFor(() => expect(mockKaelChatGet).toHaveBeenCalledWith('authoritative-case-session'))

    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    await flushLatestConversationList()
    expect(screen.getByText(/Đang mở · 0 lượt trao đổi/)).toBeOnTheScreen()
  })

  it('keeps the complete Case Work transcript before the current deal phase', async () => {
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
    mockKaelChatGet.mockImplementation(async (sessionId: string) => {
      const response = makeCaseWorkResponse(sessionId, '')
      return {
        data: {
          ...response,
          session: {
            ...response.session,
            job_id: 'job-linked-case',
            status: 'confirmed' as const,
          },
          turns: [
            { ...response.turns[0], id: 'customer-summary', role: 'customer' as const, text_content: 'Tóm tắt yêu cầu ban đầu' },
            { ...response.turns[0], id: 'kael-question', role: 'kael' as const, text_content: 'Kael cần bạn bổ sung ảnh hiện trạng' },
            { ...response.turns[0], id: 'customer-answer', role: 'customer' as const, text_content: 'Tôi đã gửi ảnh hiện trạng' },
          ],
        },
        success: true as const,
      }
    })
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')
    await waitFor(() => expect(mockKaelChatGet).toHaveBeenCalledWith('authoritative-case-session'))
    await waitFor(() => expect(screen.getByText('Đang tìm thợ sửa nước')).toBeOnTheScreen())

    expect(screen.getByText('Tóm tắt yêu cầu ban đầu')).toBeOnTheScreen()
    expect(screen.getByText('Kael cần bạn bổ sung ảnh hiện trạng')).toBeOnTheScreen()
    expect(screen.getByText('Tôi đã gửi ảnh hiện trạng')).toBeOnTheScreen()
    const transcriptText = screen.getByTestId('customer-v21-kael-thread')
      .findAllByType(Text)
      .flatMap((node: { props: { children?: unknown } }) =>
        typeof node.props.children === 'string' ? [node.props.children] : [])
    const currentPhaseIndex = transcriptText.indexOf('Đang tìm thợ sửa nước')
    expect(transcriptText.indexOf('Tóm tắt yêu cầu ban đầu')).toBeLessThan(currentPhaseIndex)
    expect(transcriptText.indexOf('Tôi đã gửi ảnh hiện trạng')).toBeLessThan(currentPhaseIndex)
  })

  it('prefetches linked Case Work sessions and paints a selected session before its refresh finishes', async () => {
    mockRouteParams = { mode: 'case' }
    const first = {
      ...makeConversationSession('case', 'instant-case-catalog-a'),
      case_session_id: 'instant-case-session-a',
      updated_at: '2026-07-13T17:00:00.000Z',
    }
    const second = {
      ...makeConversationSession('case', 'instant-case-catalog-b'),
      case_session_id: 'instant-case-session-b',
      updated_at: '2026-07-13T16:00:00.000Z',
    }
    mockSessionsByMode.case = [first, second]
    mockKaelChatGet.mockImplementation(async (sessionId: string) => ({
      data: makeCaseWorkResponse(
        sessionId,
        sessionId === second.case_session_id ? 'SECOND SESSION READY' : 'FIRST SESSION READY',
      ),
      success: true,
    }))
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')
    await waitFor(() => {
      expect(mockKaelChatGet).toHaveBeenCalledWith(first.case_session_id)
      expect(mockKaelChatGet).toHaveBeenCalledWith(second.case_session_id)
    })
    await act(async () => {
      await Promise.all(mockKaelChatGet.mock.results.map((result) => result.value))
    })

    let resolveRefresh!: (value: { data: ReturnType<typeof makeCaseWorkResponse>; success: true }) => void
    const pendingRefresh = new Promise<{ data: ReturnType<typeof makeCaseWorkResponse>; success: true }>((resolve) => {
      resolveRefresh = resolve
    })
    mockKaelChatGet.mockImplementationOnce(() => pendingRefresh)
    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    await act(async () => {
      fireEvent.press(screen.getByTestId(`customer-v21-kael-session-${second.id}`))
      await Promise.resolve()
    })

    expect(screen.getByText('SECOND SESSION READY')).toBeOnTheScreen()
    expect(screen.queryByText('FIRST SESSION READY')).toBeNull()

    await act(async () => {
      resolveRefresh({ data: makeCaseWorkResponse(second.case_session_id, 'SECOND SESSION REFRESHED'), success: true })
      await pendingRefresh
    })
  })

  it('does not navigate again when selecting a Case Work session on the blank Case Work route', async () => {
    mockRouteParams = { mode: 'case' }
    const linkedSession = {
      ...makeConversationSession('case', 'same-route-case-conversation'),
      case_job_id: 'same-route-job',
      case_session_id: 'same-route-case-session',
    }
    mockSessionsByMode.case = [linkedSession]
    mockKaelChatGet.mockResolvedValue({
      data: makeCaseWorkResponse(linkedSession.case_session_id, 'SAME ROUTE READY'),
      success: true,
    })
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')
    await waitFor(() => expect(mockKaelChatGet).toHaveBeenCalledWith(linkedSession.case_session_id))
    mockReplace.mockClear()

    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId(`customer-v21-kael-session-${linkedSession.id}`))

    expect(screen.getByText('SAME ROUTE READY')).toBeOnTheScreen()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('lets a cached Case Work session replace an uncached session that is still loading', async () => {
    mockRouteParams = { mode: 'case' }
    const sessions = Array.from({ length: 7 }, (_, index) => ({
      ...makeConversationSession('case', `rapid-case-catalog-${index + 1}`),
      case_session_id: `rapid-case-session-${index + 1}`,
      updated_at: `2026-07-13T${17 - index}:00:00.000Z`,
    }))
    const uncached = sessions[6]
    const cached = sessions[1]
    mockSessionsByMode.case = sessions
    let resolveUncached!: (value: { data: ReturnType<typeof makeCaseWorkResponse>; success: true }) => void
    const pendingUncached = new Promise<{ data: ReturnType<typeof makeCaseWorkResponse>; success: true }>((resolve) => {
      resolveUncached = resolve
    })
    mockKaelChatGet.mockImplementation((sessionId: string) => {
      if (sessionId === uncached.case_session_id) return pendingUncached
      return Promise.resolve({
        data: makeCaseWorkResponse(sessionId, sessionId === cached.case_session_id ? 'CACHED SESSION READY' : `READY ${sessionId}`),
        success: true,
      })
    })
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')
    await waitFor(() => expect(mockKaelChatGet).toHaveBeenCalledWith(cached.case_session_id))
    await act(async () => {
      await Promise.all(mockKaelChatGet.mock.results.map((result) => result.value))
    })
    expect(mockKaelChatGet).not.toHaveBeenCalledWith(uncached.case_session_id)

    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId(`customer-v21-kael-session-${uncached.id}`))
    await act(async () => Promise.resolve())
    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId(`customer-v21-kael-session-${cached.id}`))

    expect(screen.getByText('CACHED SESSION READY')).toBeOnTheScreen()

    await act(async () => {
      resolveUncached({ data: makeCaseWorkResponse(uncached.case_session_id, 'STALE SESSION'), success: true })
      await pendingUncached
      await new Promise((resolve) => setTimeout(resolve, 100))
    })
    expect(screen.queryByText('STALE SESSION')).toBeNull()
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

  it('prefetches recent normal conversations so selecting one paints its history immediately', async () => {
    const session = makeConversationSession('normal', 'prefetched-normal-session')
    mockSessionsByMode.normal = [session]
    mockConversationGet.mockResolvedValue({
      data: {
        session,
        turns: [{
          conversation_id: session.id,
          created_at: '2026-07-13T16:01:00.000Z',
          id: 'prefetched-normal-turn',
          role: 'kael',
          text_content: 'PREFETCHED NORMAL READY',
          turn_index: 1,
        }],
      },
      success: true,
    })
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('normal')
    await waitFor(() => expect(mockConversationGet).toHaveBeenCalledWith(session.id))
    await act(async () => {
      await Promise.all(mockConversationGet.mock.results.map((result) => result.value))
    })

    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId(`customer-v21-kael-session-${session.id}`))

    expect(screen.getByText('PREFETCHED NORMAL READY')).toBeOnTheScreen()
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
    const controller = readCustomerSource('v21/use-customer-kael-surface-controller.ts')
    const messageActions = readCustomerSource('v21/use-customer-kael-message-actions.ts')
    const chatView = readCustomerSource('v21/chat-stateful-surfaces.tsx')

    expect(controller).toContain('conversations,')
    expect(messageActions).toContain('conversations.sendConversationTurn(message, { revealAfter: processDone })')
    expect(controller).not.toContain('workerKaelChatService')
    expect(messageActions).not.toContain('workerKaelChatService')
    expect(chatView).not.toContain('/components/worker/')
    expect(chatView).not.toContain('worker-v5-')
  })

  it('wires a compact Customer-owned session menu with per-mode CRUD actions', () => {
    const controller = readCustomerSource('v21/use-customer-kael-surface-controller.ts')
    const content = readCustomerSource('v21/customer-kael-chat-content.tsx')
    const header = readCustomerSource('v21/kael-chat-header.tsx')
    const menu = readCustomerSource('v21/kael-session-menu.tsx')
    const chatStyles = readCustomerSource('v21/chat-styles.ts')
    const mobileServices = readMobileSource('lib/services.ts')

    expect(controller).toContain('useCustomerKaelConversations')
    expect(content).toContain('CustomerKaelSessionMenu')
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
    expect(controller).not.toContain('workerKaelChatService')
    expect(content).not.toContain('workerKaelChatService')
  })

  it('keeps the Kael chat surface visual while bounded domain hooks own orchestration', () => {
    const surfaceIndex = readCustomerSource('v21/surfaces.tsx')
    const chatSurface = readCustomerSource('v21/kael-chat-surface.tsx')
    const controller = readCustomerSource('v21/use-customer-kael-surface-controller.ts')

    expect(surfaceIndex).toContain("from './kael-chat-surface'")
    expect(surfaceIndex).not.toContain('function KaelChatSurface(')
    expect(controller).toContain('useKaelProcessLineController')
    expect(controller).toContain('useCustomerKaelSessionHydration')
    expect(controller).toContain('useCustomerKaelEvidenceActions')
    expect(controller).toContain('useCustomerKaelMessageActions')
    expect(controller).toContain('useCustomerKaelDecisionActions')
    expect(controller).toContain('deriveCustomerKaelPresentation')

    const componentStart = chatSurface.indexOf('export function KaelChatSurface')
    const componentBody = chatSurface.slice(componentStart)
    const componentLineCount = componentBody.split('\n').length
    expect(componentLineCount).toBeLessThanOrEqual(300)
  })
})
