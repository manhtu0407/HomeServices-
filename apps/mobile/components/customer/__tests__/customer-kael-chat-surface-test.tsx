import { readFileSync } from 'fs'
import { resolve } from 'path'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native'
import { StyleSheet, Text } from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import type { CustomerKaelConversationSession } from '@/lib/api-types/customer'
import { setPendingKaelChatDraft } from '@/lib/pending-kael-chat-draft'
import { customerV21ServiceCopy } from '../ui/copy'
import { isLikelyKaelIntakeRequest } from '../kael-chat/customer-kael-chat-helpers'

let mockRouteParams: Record<string, string> = { mode: 'normal' }
const mockReplace = jest.fn()
const mockConversationCreate = jest.fn()
const mockConversationList = jest.fn()
const mockConversationGet = jest.fn()
const mockConversationArchive = jest.fn()
const mockConversationRename = jest.fn()
const mockConversationPin = jest.fn()
const mockConversationSendTurn = jest.fn()
const mockKaelChatCreate = jest.fn()
const mockKaelChatGet = jest.fn()
const mockKaelChatStreamSend = jest.fn()
const mockJobChatSend = jest.fn(async () => true)
const mockHydrateRemoteJobById = jest.fn()
let mockCustomerId = 'customer_kael_test_0'
let mockAccessToken = 'customer-kael-access-token-0'
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
      access_token: mockAccessToken,
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
      streamTurn: (...args: any[]) => mockConversationSendTurn(...args),
    },
    kaelChatService: {
      ...actual.kaelChatService,
      create: (...args: any[]) => mockKaelChatCreate(...args),
      get: (...args: any[]) => mockKaelChatGet(...args),
    },
    kaelChatStreamService: {
      ...actual.kaelChatStreamService,
      sendTurn: (...args: any[]) => mockKaelChatStreamSend(...args),
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
import { writeCustomerKaelSessionCatalog } from '../kael-chat/customer-kael-session-catalog-cache'
import { useCustomerKaelConversations } from '../kael-chat/use-customer-kael-conversations'

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
    await Promise.resolve()
  })
}

const VIRTUALIZED_LIST_UPDATE_DELAY_MS = 60

async function settleKaelChatSurfaceUpdates() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await new Promise<void>((resolve) => setTimeout(resolve, VIRTUALIZED_LIST_UPDATE_DELAY_MS))
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
    mockAccessToken = `customer-kael-access-token-${mockCustomerSequence}`
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
      mockKaelChatCreate,
      mockKaelChatGet,
      mockKaelChatStreamSend,
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
    mockKaelChatCreate.mockImplementation(async () => ({
      data: makeCaseWorkResponse('new-case-session', 'Kael đã tiếp nhận yêu cầu kiểm thử.'),
      success: true,
    }))
    mockKaelChatStreamSend.mockImplementation(async (sessionId: string) => ({
      data: makeCaseWorkResponse(sessionId, 'Kael đã nhận phần thông tin bổ sung.'),
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

  afterEach(async () => {
    await settleKaelChatSurfaceUpdates()
  })

  it('routes Customer Kael through the V21 surface instead of the deleted split stack', () => {
    const kaelRoute = readMobileSource('app/(customer)/kael.tsx')
    const kaelChatRoute = readMobileSource('app/(customer)/kael-chat.tsx')
    const bridge = readCustomerSource('customer-surfaces.tsx')
    const surface = readCustomerSource('v21/surfaces.tsx')
    const chatSurface = readCustomerSource('v21/kael-chat-surface.tsx')
    const chatController = readCustomerSource('kael-chat/use-customer-kael-surface-controller.ts')
    const guardedActions = [
      readCustomerSource('kael-chat/use-customer-kael-session-hydration.ts'),
      readCustomerSource('kael-chat/use-customer-kael-evidence-actions.ts'),
      readCustomerSource('kael-chat/use-customer-kael-message-actions.ts'),
      readCustomerSource('kael-chat/use-customer-kael-decision-actions.ts'),
    ].join('\n')
    const chatView = readCustomerSource('kael-chat/chat-stateful-surfaces.tsx')
    const chatTranscript = readCustomerSource('kael-chat/use-kael-chat-transcript.tsx')
    const chatPrimitives = readCustomerSource('kael-chat/chat-surfaces.tsx')

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
    expect(chatTranscript).toContain('speaker="customer"')
    expect(chatTranscript).not.toContain('<ChatBubble\n                role=')
    expect(chatView).toContain('testID="customer-v21-kael-chat"')
    expect(chatView).toContain('customer-v21-screen-2.4-chat-normal')
    expect(chatView).not.toContain('customer-kael-chat-stack-screen')
  })

  it('keeps full-screen mint washes soft on the active V21 Kael route', () => {
    const canvas = readCustomerSource('kael-chat/chat-surfaces.tsx')
    const chatView = readCustomerSource('kael-chat/chat-stateful-surfaces.tsx')
    const shared = readCustomerSource('ui/shared-surfaces.tsx')

    expect(canvas).toContain('customer-v21-chat-canvas-aura')
    expect(canvas).toContain('FormulaMintCanvasAura')
    expect(canvas).toContain('mode={mode}')
    expect(canvas).toContain('scope="CustomerChat"')
    expect(canvas).not.toContain('rgba(136,235,221,0.34)')
    expect(canvas).not.toContain('rgba(13,174,154,0.22)')
    expect(shared).toContain('{ backgroundColor: tokens.canvas }')
    expect(chatView).toContain('<ChatCanvasAura mode={tokens.mode} reduceTransparency={reduceTransparency} />')
  })

  it('keeps the Case Work activity action on Activity after retiring the Profile command center', () => {
    const surface = [
      readCustomerSource('v21/surfaces.tsx'),
      readCustomerSource('kael-chat/customer-kael-chat-content.tsx'),
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
    const customerAura = readCustomerSource('ui/aura-surfaces.tsx')
    const chatAura = readCustomerSource('kael-chat/chat-surfaces.tsx')
    const historyAura = readCustomerSource('history/history-surfaces.tsx')
    const profileAura = readCustomerSource('profile/profile-metrics-surfaces.tsx')
    const workerAura = readMobileSource('components/worker/ui/aura-surfaces.tsx')

    expect(alphaStop).toContain('toHexChannel')
    expect(alphaStop).toContain('Math.min(255, Math.max(0, Math.round(Number(value))))')
    expect(alphaStop).toContain('toStopOpacity')
    expect(alphaStop).toContain('Math.min(1, Math.max(0, Number(value)))')
    expect(alphaStop).toContain('stopOpacity: stopOpacity ?? toStopOpacity(alpha)')
    expect(alphaStop).not.toContain('stopColor: `rgb(')
    expect(primitiveAura).toContain("from './svg-alpha-stop'")
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
      await act(async () => {
        view.unmount()
        jest.runOnlyPendingTimers()
        await Promise.resolve()
        await Promise.resolve()
      })
      jest.useRealTimers()
    }
  })

  // Icon colour, size and stroke weight are props of a rendered node, and the
  // Worker header cases assert exactly that with findAllByProps against a
  // mounted surface. The substring versions asserted source formatting — down to
  // where the style object put its line breaks — so they broke on a reformat and
  // held while the rendered icon changed. Only the retired token stays, as
  // absence.
  it('does not put the primary token back on Customer Kael header navigation icons', () => {
    const header = readCustomerSource('kael-chat/kael-chat-header.tsx')

    expect(header).not.toContain('<ChatBackIcon color={tokens.primary} />')
    expect(header).not.toContain('<ChatNewConversationIcon color={tokens.primary} />')
  })

  it('keeps the Kael empty-state timeline looping while the app is active', () => {
    const hero = readCustomerSource('kael-chat/kael-empty-hero.tsx')

    expect(hero).toContain("motionClip={reduceMotion || !appActive ? undefined : 'autoplay-loop'}")
    expect(hero).not.toContain("'autoplay-once'")
  })

  it('uses reduced-motion-aware liquid spring feedback across the header and session controls', () => {
    const header = readCustomerSource('kael-chat/kael-chat-header.tsx')
    const menu = readCustomerSource('kael-chat/kael-session-menu.tsx')
    const liquidPressable = readCustomerSource('kael-chat/kael-liquid-pressable.tsx')
    const liquidReveal = readCustomerSource('kael-chat/kael-liquid-reveal.tsx')

    expect(header).toContain('KaelLiquidPressable')
    expect(menu).toContain('KaelLiquidPressable')
    expect(menu).toContain('KaelLiquidReveal')
    expect(liquidPressable).toContain('motionTokens.liquid.press')
    expect(liquidReveal).toContain('motionTokens.liquid.entrance')
    expect(liquidReveal).toContain('withSpring')
    expect(liquidReveal).toContain('reduceMotion')
    expect(liquidReveal).not.toContain('withRepeat')
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

  it('keeps breathing room below Customer Kael header actions when the session menu opens', async () => {
    mockSessionsByMode.normal = [makeConversationSession('normal', 'session-spacing')]
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('normal')

    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))

    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-kael-session-menu-shell').props.style)).toMatchObject({
      top: 74,
    })
    const sessionList = screen.getByTestId('customer-v21-kael-session-list')

    expect(StyleSheet.flatten(sessionList.props.style)).toMatchObject({
      marginTop: 6,
      maxHeight: 138,
    })
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-kael-session-new-label').props.style)).toMatchObject({
      fontSize: 13,
    })
    expect(screen.getByTestId('customer-v21-kael-session-new-plus')).toHaveProp('height', 21)
    expect(screen.getByTestId('customer-v21-kael-session-new-plus')).toHaveProp('width', 21)
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
      expect.objectContaining({ onResponseDelta: expect.any(Function) }),
    ))
    expect(screen.getByTestId('customer-v21-kael-input')).toHaveProp('value', '')
  })

  it('shows Suy nghĩ immediately for a normal Kael reply without inventing backend steps', async () => {
    mockConversationSendTurn.mockImplementationOnce((
      _sessionId: string,
      _input: { message: string },
      _handlers: { onReasoning?: (event: unknown) => void },
    ) => {
      return new Promise(() => undefined)
    })
    render(<CustomerKaelSurface />)
    await waitForConversationCatalog('normal')

    const input = screen.getByTestId('customer-v21-kael-input')
    fireEvent.changeText(input, 'Please check this')
    fireEvent(input, 'submitEditing')

    const receipt = await screen.findByTestId('customer-v21-kael-reasoning-receipt')
    expect(receipt).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-reasoning-receipt-toggle'))
      .toHaveProp('accessibilityState', { busy: true, expanded: true })
    expect(screen.getByText('Suy nghĩ')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-kael-reasoning-receipt-elapsed-slot')).toBeNull()
    expect(screen.getByTestId('customer-v21-kael-reasoning-pending-message'))
      .toHaveTextContent('Please check this')
  })

  it('marks an interrupted normal reply as failed instead of leaving Suy nghĩ active', async () => {
    mockConversationSendTurn.mockRejectedValueOnce(new Error('network interrupted'))
    render(<CustomerKaelSurface />)
    await waitForConversationCatalog('normal')

    fireEvent.changeText(screen.getByTestId('customer-v21-kael-input'), 'Please check this')
    fireEvent(screen.getByTestId('customer-v21-kael-input'), 'submitEditing')

    await screen.findByTestId('customer-v21-kael-reasoning-receipt-toggle')
    await waitFor(() => expect(screen.getByTestId('customer-v21-kael-reasoning-receipt-toggle')).toHaveProp('accessibilityState', {
      busy: false,
      expanded: false,
    }))
    expect(screen.getByText('Suy nghĩ bị gián đoạn')).toBeOnTheScreen()
  })

  it('removes the optimistic receipt when a normal reply has no backend receipt', async () => {
    render(<CustomerKaelSurface />)
    await waitForConversationCatalog('normal')

    fireEvent.changeText(screen.getByTestId('customer-v21-kael-input'), 'Reply without receipt')
    fireEvent(screen.getByTestId('customer-v21-kael-input'), 'submitEditing')

    await screen.findByText('Kael đã ghi nhận.')
    await waitFor(() => expect(screen.queryByTestId('customer-v21-kael-reasoning-receipt')).toBeNull())
  })

  it('marks a backend-started receipt as interrupted when its terminal event is missing', async () => {
    mockConversationSendTurn.mockImplementationOnce(async (
      sessionId: string,
      input: { message: string },
      handlers: { onReasoning?: (event: unknown) => void },
    ) => {
      handlers.onReasoning?.({
        receiptId: 'kael-reasoning:customer-incomplete',
        schemaVersion: 'kael_reasoning.v1',
        startedAt: '2026-08-10T00:00:00.000Z',
        type: 'reasoning.started',
      })
      const session = updateMockSession(sessionId, { total_turns: 2 })
      return {
        data: {
          session,
          turns: [
            { conversation_id: sessionId, created_at: '2026-08-10T00:00:00.000Z', id: 'customer-incomplete-turn', role: 'customer', text_content: input.message, turn_index: 1 },
            { conversation_id: sessionId, created_at: '2026-08-10T00:00:01.000Z', id: 'kael-incomplete-turn', role: 'kael', text_content: 'Kael returned without a terminal receipt.', turn_index: 2 },
          ],
        },
        success: true,
      }
    })
    render(<CustomerKaelSurface />)
    await waitForConversationCatalog('normal')

    fireEvent.changeText(screen.getByTestId('customer-v21-kael-input'), 'Check an incomplete receipt')
    fireEvent(screen.getByTestId('customer-v21-kael-input'), 'submitEditing')

    await screen.findByText('Kael returned without a terminal receipt.')
    expect(screen.getByTestId('customer-v21-kael-reasoning-receipt-toggle'))
      .toHaveProp('accessibilityState', { busy: false, expanded: false })
    expect(screen.getByText('Suy nghĩ bị gián đoạn')).toBeOnTheScreen()
  })

  it('keeps completed backend feedback only with the current normal-chat session', async () => {
    mockConversationSendTurn.mockImplementationOnce(async (
      sessionId: string,
      input: { message: string },
      handlers: { onReasoning?: (event: unknown) => void },
    ) => {
      handlers.onReasoning?.({
        receiptId: 'kael-reasoning:customer-complete',
        schemaVersion: 'kael_reasoning.v1',
        startedAt: '2026-08-10T00:00:00.000Z',
        type: 'reasoning.started',
      })
      handlers.onReasoning?.({
        elapsedMs: 320,
        receiptId: 'kael-reasoning:customer-complete',
        schemaVersion: 'kael_reasoning.v1',
        step: {
          detail: 'The backend checked the current conversation context.',
          id: 'context',
          label: 'Checked the relevant conversation context',
          sequence: 1,
          stage: 'context',
          status: 'completed',
        },
        type: 'reasoning.step',
      })
      handlers.onReasoning?.({
        elapsedMs: 580,
        fallbackUsed: false,
        receiptId: 'kael-reasoning:customer-complete',
        schemaVersion: 'kael_reasoning.v1',
        summary: ['Prepared a safe reply from backend feedback.'],
        type: 'reasoning.completed',
      })
      const session = updateMockSession(sessionId, { total_turns: 2 })
      return {
        data: {
          session,
          turns: [
            { conversation_id: sessionId, created_at: '2026-08-10T00:00:00.000Z', id: 'customer-complete-turn', role: 'customer', text_content: input.message, turn_index: 1 },
            { conversation_id: sessionId, created_at: '2026-08-10T00:00:01.000Z', id: 'kael-complete-turn', role: 'kael', text_content: 'Kael has completed the safe answer.', turn_index: 2 },
          ],
        },
        success: true,
      }
    })
    render(<CustomerKaelSurface />)
    await waitForConversationCatalog('normal')

    fireEvent.changeText(screen.getByTestId('customer-v21-kael-input'), 'Check completion receipt')
    fireEvent(screen.getByTestId('customer-v21-kael-input'), 'submitEditing')

    await screen.findByText('Kael has completed the safe answer.')
    expect(screen.getByTestId('customer-v21-kael-reasoning-receipt')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-kael-reasoning-pending-message')).toBeNull()
    const receiptToggle = screen.getByTestId('customer-v21-kael-reasoning-receipt-toggle')
    expect(receiptToggle).toHaveProp('accessibilityState', { busy: false, expanded: false })
    fireEvent.press(receiptToggle)
    expect(receiptToggle).toHaveProp('accessibilityState', { busy: false, expanded: true })
    expect(screen.getByText('The backend checked the current conversation context.')).toBeOnTheScreen()
    expect(screen.getByText('Prepared a safe reply from backend feedback.')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-new'))

    await waitFor(() => expect(mockConversationCreate).toHaveBeenCalledWith(expect.objectContaining({ mode: 'normal' })))
    expect(screen.queryByTestId('customer-v21-kael-reasoning-receipt')).toBeNull()
  })

  it('sends only once when web emits both Enter key and submit events', async () => {
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('normal')

    const input = screen.getByTestId('customer-v21-kael-input')
    fireEvent.changeText(input, 'Hey')
    fireEvent(input, 'keyPress', { nativeEvent: { key: 'Enter' } })
    fireEvent(input, 'submitEditing')

    await waitFor(() => expect(mockConversationSendTurn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: 'Hey' }),
      expect.objectContaining({ onResponseDelta: expect.any(Function) }),
    ))
    expect(mockConversationSendTurn).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('customer-v21-kael-input')).toHaveProp('value', '')
  })

  it('renders verified deltas in the live Kael response surface before the committed transcript', async () => {
    let resolveTurn!: (value: any) => void
    mockConversationSendTurn.mockImplementationOnce((
      _sessionId: string,
      _input: { message: string },
      handlers: { onResponseDelta?: (event: unknown) => void },
    ) => {
      handlers.onResponseDelta?.({
        delta: 'Kael dang ',
        turnId: 'stream-turn-1',
        type: 'response_delta',
      })
      handlers.onResponseDelta?.({
        delta: 'kiem tra.',
        turnId: 'stream-turn-1',
        type: 'response_delta',
      })
      return new Promise((resolve) => {
        resolveTurn = resolve
      })
    })
    render(<CustomerKaelSurface />)
    await waitForConversationCatalog('normal')

    const input = screen.getByTestId('customer-v21-kael-input')
    fireEvent.changeText(input, 'Kiem tra giup toi')
    fireEvent(input, 'submitEditing')

    const liveBubble = await screen.findByTestId('customer-v21-kael-streaming-response')
    expect(liveBubble).toHaveProp('accessibilityState', { busy: true })
    expect(screen.getByTestId('customer-v21-kael-response-block-0'))
      .toHaveTextContent('Kael dang kiem tra.')
    expect(screen.getByTestId('customer-v21-kael-response-block-0'))
      .not.toHaveTextContent('\u258d')

    const sessionId = mockConversationSendTurn.mock.calls[0][0] as string
    const session = updateMockSession(sessionId, { total_turns: 2 })
    await act(async () => {
      resolveTurn({
        data: {
          session,
          turns: [
            {
              conversation_id: sessionId,
              created_at: '2026-07-29T00:00:00.000Z',
              id: `${sessionId}-customer`,
              role: 'customer',
              text_content: 'Kiem tra giup toi',
              turn_index: 1,
            },
            {
              conversation_id: sessionId,
              created_at: '2026-07-29T00:00:01.000Z',
              id: 'stream-turn-1',
              role: 'kael',
              text_content: 'Kael dang kiem tra.',
              turn_index: 2,
            },
          ],
        },
        success: true,
      })
    })

    await waitFor(
      () => expect(screen.queryByTestId('customer-v21-kael-streaming-response')).toBeNull(),
      { timeout: 8_000 },
    )
  }, 15_000)

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

  it('restores the active committed conversation on a cold catalog mount', async () => {
    const session = makeConversationSession('normal', 'restored-stream-session')
    const response = {
      session: { ...session, total_turns: 2 },
      turns: [
        {
          client_request_id: 'restored-customer-request',
          conversation_id: session.id,
          created_at: '2026-08-01T09:00:00.000Z',
          id: 'restored-customer-turn',
          role: 'customer' as const,
          text_content: 'Kiểm tra công tắc nóng bất thường.',
          turn_index: 1,
        },
        {
          client_request_id: null,
          conversation_id: session.id,
          created_at: '2026-08-01T09:00:01.000Z',
          id: 'restored-kael-turn',
          role: 'kael' as const,
          text_content: 'Kael đã kiểm tra và lưu phản hồi.',
          turn_index: 2,
        },
      ],
    }
    mockSessionsByMode.normal = [response.session]
    mockConversationGet.mockResolvedValue({ data: response, success: true })
    await writeCustomerKaelSessionCatalog(
      mockCustomerId,
      'normal',
      [response.session],
      response.session.id,
    )

    const { result } = renderHook(() => useCustomerKaelConversations('normal', 'vi'))

    await waitForConversationCatalog('normal')
    await waitFor(() => expect(result.current.activeSessionId).toBe(response.session.id))
    expect(result.current.turns.map((turn) => turn.text_content)).toEqual([
      'Kiểm tra công tắc nóng bất thường.',
      'Kael đã kiểm tra và lưu phản hồi.',
    ])
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
    expect(mockReplace).not.toHaveBeenCalled()

    await act(async () => {
      resolveCreate({ data: { session, turns: [] }, success: true })
    })

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('/kael-chat')))
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
      expect.objectContaining({ onResponseDelta: expect.any(Function) }),
    )
    expect(result.current.turns.map((turn) => turn.text_content)).toEqual([
      'Tôi muốn hỏi trước khi đặt dịch vụ',
      'Kael đã ghi nhận.',
    ])
  })

  it('hides the remembered Case Work session while a new booking handoff owns the route', async () => {
    const previousSession = {
      ...makeConversationSession('case', 'previous-case-catalog'),
      case_job_id: 'previous-job',
      case_session_id: 'previous-authoritative-case',
    }
    mockSessionsByMode.case = [previousSession]
    const previousMount = renderHook(() => useCustomerKaelConversations('case', 'vi'))
    await waitForConversationCatalog('case')
    await act(async () => {
      await previousMount.result.current.openSession(previousSession.id)
    })
    expect(previousMount.result.current.activeSessionId).toBe(previousSession.id)
    previousMount.unmount()

    const handoffMount = renderHook(() => useCustomerKaelConversations('case', 'vi', {
      suppressActiveResponse: true,
    }))
    await waitForConversationCatalog('case')

    expect(handoffMount.result.current.activeSessionId).toBeNull()
    expect(handoffMount.result.current.turns).toEqual([])
    expect(handoffMount.result.current.sessions).toContainEqual(previousSession)
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
    await settleKaelChatSurfaceUpdates()
  })

  it('aligns the Customer Kael mode control with the Worker control material and type scale', async () => {
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('normal')

    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-kael-mode-toggle').props.style)).toMatchObject({
      alignItems: 'center',
      height: 44,
      justifyContent: 'center',
      paddingHorizontal: 11,
      width: 114,
    })
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-kael-active-mode').props.style)).toMatchObject({
      alignSelf: 'stretch',
      fontSize: 14,
      includeFontPadding: false,
      textAlign: 'center',
      textAlignVertical: 'center',
      transform: [{ translateX: -12 }],
    })

    fireEvent.press(screen.getByTestId('customer-v21-kael-mode-toggle'))

    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-kael-mode-toggle').props.style)).toMatchObject({
      backgroundColor: 'rgba(255,255,255,0.94)',
      borderColor: 'rgba(255,255,255,0.98)',
      borderWidth: 1,
    })
    await settleKaelChatSurfaceUpdates()
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

  it('keeps a blank Work handling route separate from the previous job thread', async () => {
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

    const otherwiseGenericQaMessage = 'Kiểm thử QA mới: Điều hòa không mát tại Quận 3, TP.HCM. Máy vẫn chạy nhưng thổi gió ấm; cần kiểm tra nguyên nhân và báo giá trước khi thay vật tư.'
    expect(isLikelyKaelIntakeRequest(otherwiseGenericQaMessage)).toBe(false)

    const directInput = screen.getByTestId('customer-v21-kael-input')
    fireEvent.changeText(directInput, otherwiseGenericQaMessage)
    fireEvent.press(screen.getByTestId('customer-v21-kael-send'))

    await waitFor(
      () => expect(screen.getByText(/Nhắn “Xác nhận”/)).toBeOnTheScreen(),
      { timeout: 8_000 },
    )
    await waitFor(
      () => expect(directInput).toHaveProp('editable', true),
      { timeout: 8_000 },
    )
    expect(mockKaelChatCreate).not.toHaveBeenCalled()

    fireEvent.changeText(directInput, 'Xác nhận')
    fireEvent.press(screen.getByTestId('customer-v21-kael-send'))

    await waitFor(() => expect(mockKaelChatCreate).toHaveBeenCalledWith(expect.objectContaining({
      message: otherwiseGenericQaMessage,
      service_type: 'hvac',
    })))
    expect(mockConversationSendTurn).not.toHaveBeenCalled()
    await waitFor(
      () => expect(screen.getByText('Kael đã tiếp nhận yêu cầu kiểm thử.')).toBeOnTheScreen(),
      { timeout: 12_000 },
    )
    expect(mockJobChatSend).not.toHaveBeenCalled()
  }, 30_000)

  it('uses bounded pre-Agentic clarification and confirmation before creating a Case Work session', async () => {
    mockRouteParams = { mode: 'case' }
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')

    const vagueMessage = 'Chào Kael, tôi cần được hỗ trợ.'
    const input = screen.getByTestId('customer-v21-kael-input')
    fireEvent.changeText(input, vagueMessage)
    fireEvent.press(screen.getByTestId('customer-v21-kael-send'))

    await waitFor(
      () => expect(screen.getByText(/hạng mục cần hỗ trợ, hiện tượng hoặc thiết bị gặp vấn đề/)).toBeOnTheScreen(),
      { timeout: 8_000 },
    )
    await waitFor(
      () => expect(input).toHaveProp('editable', true),
      { timeout: 8_000 },
    )
    expect(screen.getAllByText(/hạng mục cần hỗ trợ, hiện tượng hoặc thiết bị gặp vấn đề/)).toHaveLength(1)
    expect(screen.getByText(/Hạng mục hỗ trợ gồm: sửa điện, sửa nước, vệ sinh nhà/)).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-input')).toHaveProp('value', '')
    expect(mockKaelChatCreate).not.toHaveBeenCalled()
    expect(mockConversationSendTurn).not.toHaveBeenCalled()

    const clarification = 'Bồn rửa bếp bị rò nước ở Quận 3, cần kiểm tra sáng mai.'
    fireEvent.changeText(input, clarification)
    fireEvent.press(screen.getByTestId('customer-v21-kael-send'))

    await waitFor(
      () => expect(screen.getByText(/Nhắn “Xác nhận”/)).toBeOnTheScreen(),
      { timeout: 8_000 },
    )
    await waitFor(
      () => expect(input).toHaveProp('editable', true),
      { timeout: 8_000 },
    )
    expect(mockKaelChatCreate).not.toHaveBeenCalled()

    fireEvent.changeText(input, 'Xác nhận')
    fireEvent.press(screen.getByTestId('customer-v21-kael-send'))

    await waitFor(() => expect(mockKaelChatCreate).toHaveBeenCalledWith(expect.objectContaining({
      message: `${vagueMessage}\n${clarification}`,
      service_type: 'plumbing',
    })))
  }, 30_000)

  it('canonicalizes a booking handoff to its durable Case Work session route', async () => {
    await setPendingKaelChatDraft(mockCustomerId, {
      message: 'Lavabo phòng tắm rò tại khớp nối chữ P.',
      profileId: 'water_diagnose',
      scheduleMode: 'now',
      scheduledAt: '2026-08-15T06:00:00.000Z',
      serviceType: 'plumbing',
    })
    mockRouteParams = { handoff: 'booking-handoff-plumbing', mode: 'case' }
    mockKaelChatCreate.mockResolvedValueOnce({
      data: {
        ...makeCaseWorkResponse('durable-plumbing-session', 'Kael cần bạn xác nhận thông tin.'),
        session: {
          ...makeCaseWorkResponse('durable-plumbing-session', '').session,
          service_type: 'plumbing' as const,
        },
      },
      success: true,
    })

    render(<CustomerKaelSurface />)

    await waitFor(() => expect(mockKaelChatCreate).toHaveBeenCalledWith(expect.objectContaining({
      service_type: 'plumbing',
    })))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(
      '/(customer)/kael-chat?mode=case&sessionId=durable-plumbing-session',
    ))
  })

  it('recovers a consumed booking handoff from the linked Customer catalog session', async () => {
    mockRouteParams = { handoff: 'persisted-booking-handoff', mode: 'case' }
    mockSessionsByMode.case = [{
      ...makeConversationSession('case', 'persisted-case-catalog', 'persisted-booking-handoff'),
      case_session_id: 'persisted-case-session',
      service_type: 'plumbing',
    }]

    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(
      '/(customer)/kael-chat?mode=case&sessionId=persisted-case-session',
    ))
    expect(mockKaelChatCreate).not.toHaveBeenCalled()
  })

  it('keeps the server-owned service when sending after a session-route remount', async () => {
    const sessionId = 'server-plumbing-session'
    mockRouteParams = { mode: 'case', sessionId }
    const response = {
      ...makeCaseWorkResponse(sessionId, 'Kael cần thêm dữ kiện hiện trường.'),
      session: {
        ...makeCaseWorkResponse(sessionId, '').session,
        service_type: 'plumbing' as const,
      },
    }
    mockKaelChatGet.mockResolvedValueOnce({ data: response, success: true })
    mockKaelChatStreamSend.mockResolvedValueOnce({
      data: makeCaseWorkResponse(sessionId, 'Kael đã nhận phần thông tin bổ sung.'),
      success: true,
    })
    render(<CustomerKaelSurface />)

    await waitFor(() => expect(screen.getByText('Kael cần thêm dữ kiện hiện trường.')).toBeOnTheScreen())
    fireEvent.changeText(screen.getByTestId('customer-v21-kael-input'), 'Thông tin bổ sung đã đầy đủ.')
    fireEvent.press(screen.getByTestId('customer-v21-kael-send'))

    await waitFor(() => expect(mockKaelChatStreamSend).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({ message: 'Thông tin bổ sung đã đầy đủ.' }),
      expect.any(Object),
    ))
    expect(screen.queryByText(/bạn hãy nêu hạng mục cần hỗ trợ/)).toBeNull()
  })

  it('does not leak an unrelated active-job error into a routed intake session', async () => {
    const sessionId = 'new-upholstery-intake-session'
    mockRouteParams = { mode: 'case', sessionId }
    mockWorkflowDeal = makeWorkflowDeal()
    mockWorkflowError = 'Đang có yêu cầu đang chạy, không thể tạo yêu cầu mới'
    mockKaelChatGet.mockResolvedValueOnce({
      data: makeCaseWorkResponse(sessionId, 'Kael đang làm rõ số lượng và chất liệu sofa.'),
      success: true,
    })

    render(<CustomerKaelSurface />)

    await waitFor(() => expect(screen.getByText('Kael đang làm rõ số lượng và chất liệu sofa.')).toBeOnTheScreen())
    expect(screen.queryByText(mockWorkflowError)).toBeNull()
  })

  it('keeps an explicitly routed Case Work session authoritative over a stale catalog selection', async () => {
    const staleCatalogSession = {
      ...makeConversationSession('case', 'stale-catalog-conversation'),
      case_session_id: 'stale-case-session',
    }
    mockRouteParams = { mode: 'case' }
    mockSessionsByMode.case = [staleCatalogSession]
    mockKaelChatGet.mockImplementation(async (sessionId: string) => ({
      data: makeCaseWorkResponse(
        sessionId,
        sessionId === 'routed-case-session' ? 'ROUTED CASE READY' : 'STALE CASE READY',
      ),
      success: true,
    }))
    const staleView = render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')
    await waitFor(() => expect(mockKaelChatGet).toHaveBeenCalledWith('stale-case-session'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId(`customer-v21-kael-session-${staleCatalogSession.id}`))
    await waitFor(() => expect(screen.getByText('STALE CASE READY')).toBeOnTheScreen())
    staleView.unmount()

    mockRouteParams = { mode: 'case', sessionId: 'routed-case-session' }
    mockSessionsByMode.case = [
      {
        ...makeConversationSession('case', 'routed-catalog-conversation'),
        case_session_id: 'routed-case-session',
      },
      staleCatalogSession,
    ]
    render(<CustomerKaelSurface />)

    await waitFor(() => expect(screen.getByText('ROUTED CASE READY')).toBeOnTheScreen())
    expect(screen.queryByText('STALE CASE READY')).toBeNull()
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
    await waitFor(() => expect(mockHydrateRemoteJobById).toHaveBeenCalledWith('job-old-session', mockAccessToken))
    await waitFor(() => expect(screen.queryByText('Kael Công việc: Snapshot cũ không còn trên server')).toBeNull())
    expect(screen.getByText('Chưa thể tải công việc. Vui lòng thử lại.')).toBeOnTheScreen()
  })

  it('does not let a cached intake draft take ownership from an explicit Case Work job route', async () => {
    await setPendingKaelChatDraft(mockCustomerId, {
      message: 'Stale intake draft that does not belong to the routed job.',
      profileId: 'water_diagnose',
      scheduleMode: 'now',
      scheduledAt: '2026-07-15T05:00:00.000Z',
      serviceType: 'plumbing',
    })
    mockRouteParams = { jobId: 'job-route-authoritative', mode: 'case' }
    mockWorkflowDeal = null
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')
    await waitFor(() => expect(mockHydrateRemoteJobById).toHaveBeenCalledWith(
      'job-route-authoritative',
      mockAccessToken,
    ))

    expect(screen.queryByTestId('customer-v21-pending-draft-bubble')).toBeNull()
    expect(mockKaelChatCreate).not.toHaveBeenCalled()
  })

  it('surfaces the workflow error that explains why a case transition was rejected', async () => {
    mockRouteParams = { jobId: 'job-old-session', mode: 'case' }
    mockWorkflowDeal = makeWorkflowDeal()
    mockWorkflowError = 'Chưa có yêu cầu để tìm thợ'
    render(<CustomerKaelSurface />)

    await waitForConversationCatalog('case')
    await waitFor(() => expect(mockHydrateRemoteJobById).toHaveBeenCalledWith('job-old-session', mockAccessToken))
    expect(screen.getByText('Chưa có yêu cầu để tìm thợ')).toBeOnTheScreen()
  })

  it('keeps Customer Preview session creation local without calling the deployed API', async () => {
    mockAuthSessionProvider = 'local-visual-audit'
    mockCustomerId = 'local-visual-audit-customer'
    mockRouteParams = { mode: 'normal', ns_audit_role: 'customer' }
    mockConversationList.mockResolvedValue({
      code: 'AUTH_MISSING',
      error: 'Phiên đăng nhập hết hạn',
      status: 401,
      success: false,
    })
    mockConversationCreate.mockResolvedValue({
      code: 'AUTH_MISSING',
      error: 'Phiên đăng nhập hết hạn',
      status: 401,
      success: false,
    })
    render(<CustomerKaelSurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-kael-empty-hero-normal')).toBeOnTheScreen())
    expect(mockConversationList).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId('customer-v21-kael-session-new'))

    await waitFor(() => expect(mockReplace).toHaveBeenLastCalledWith('/(customer)/kael-chat?mode=normal&ns_audit_role=customer'))
    expect(mockConversationCreate).not.toHaveBeenCalled()
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
    await act(async () => {
      await Promise.all(mockKaelChatGet.mock.results.map((result) => result.value))
      await Promise.resolve()
      await Promise.resolve()
    })
    mockReplace.mockClear()

    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId(`customer-v21-kael-session-${linkedSession.id}`))

    await waitFor(() => expect(screen.getByText('SAME ROUTE READY')).toBeOnTheScreen())
    expect(mockReplace).not.toHaveBeenCalled()
    await settleKaelChatSurfaceUpdates()
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
      await Promise.resolve()
      await Promise.resolve()
    })

    fireEvent.press(screen.getByTestId('customer-v21-kael-new-conversation'))
    fireEvent.press(screen.getByTestId(`customer-v21-kael-session-${session.id}`))

    await waitFor(() => expect(screen.getByText('PREFETCHED NORMAL READY')).toBeOnTheScreen())
    await settleKaelChatSurfaceUpdates()
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
    const controller = readCustomerSource('kael-chat/use-customer-kael-surface-controller.ts')
    const messageActions = readCustomerSource('kael-chat/use-customer-kael-message-actions.ts')
    const chatView = readCustomerSource('kael-chat/chat-stateful-surfaces.tsx')

    expect(controller).toContain('conversations,')
    expect(messageActions).toContain('conversations.sendConversationTurn(message, {')
    expect(messageActions).toContain('onResponseDelta: appendStreamingReply')
    expect(controller).not.toContain('workerKaelChatService')
    expect(messageActions).not.toContain('workerKaelChatService')
    expect(chatView).not.toContain('/components/worker/')
    expect(chatView).not.toContain('worker-v5-')
  })

  it('keeps a blank Work handling route stable while unrelated workflow data changes', () => {
    const surfaces = readCustomerSource('v21/surfaces.tsx')

    expect(surfaces).toContain("caseId: mode === 'case' ? routeJobId : null")
    expect(surfaces).not.toContain("caseId: mode === 'case' ? routeJobId ?? deal?.id ?? null : null")
  })

  it('removes the obsolete evidence count card after media appears in a Kael session', () => {
    const content = readCustomerSource('kael-chat/customer-kael-chat-content.tsx')
    const presentation = readCustomerSource('kael-chat/customer-kael-presentation.ts')
    const chatView = readCustomerSource('kael-chat/chat-stateful-surfaces.tsx')

    expect(content).not.toContain('ChatEvidenceStrip')
    expect(content).not.toContain('normalEvidenceNode=')
    expect(presentation).not.toContain('showNormalEvidence')
    expect(presentation).not.toContain('normalEvidenceCount')
    expect(chatView).not.toContain('normalEvidenceNode')
  })

  it('wires a compact Customer-owned session menu with per-mode CRUD actions', () => {
    const controller = readCustomerSource('kael-chat/use-customer-kael-surface-controller.ts')
    const content = readCustomerSource('kael-chat/customer-kael-chat-content.tsx')
    const header = readCustomerSource('kael-chat/kael-chat-header.tsx')
    const menu = readCustomerSource('kael-chat/kael-session-menu.tsx')
    const menuStyles = readCustomerSource('kael-chat/kael-session-menu-styles.ts')
    const chatStyles = readCustomerSource('kael-chat/chat-styles.ts')
    const mobileServices = readMobileSource('lib/services.ts')

    expect(controller).toContain('useCustomerKaelConversations')
    expect(content).toContain('CustomerKaelSessionMenu')
    expect(header).toContain('sessionMenuOpen')
    expect(menu).toContain("'Ghim'")
    expect(menu).toContain("'Đổi tên'")
    expect(menu).toContain("'Xóa'")
    expect(menu).toContain('customer-v21-kael-session-new')
    expect(menuStyles).toContain('maxWidth: 208')
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
    const controller = readCustomerSource('kael-chat/use-customer-kael-surface-controller.ts')

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
