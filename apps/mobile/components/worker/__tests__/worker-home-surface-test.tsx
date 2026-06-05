import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import type { LocalDeal } from '@home-services/shared'
import { LOCAL_WORKFLOW_PRICE_DISCLAIMER } from '@home-services/shared'
import type { EarningsResponse, WorkerProfileResponse } from '@/lib/api-types'

let mockWorkflowValue: any
let mockAuthRole: 'admin' | 'customer' | 'worker'
let mockSignOut: jest.Mock
let mockWorkerUpdateAvailability: jest.Mock
let mockPathname: string
let mockRouteParams: Record<string, string | string[] | undefined>
let mockAppLanguage = 'vi'
const mockReplace = jest.fn()
const mockUseJobChatThread = jest.fn()
const mockWorkerKaelChatService = {
  create: jest.fn(),
  get: jest.fn(),
  getTrainingConsent: jest.fn(),
  list: jest.fn(),
  sendTurn: jest.fn(),
  setTrainingConsent: jest.fn(),
  streamTurn: jest.fn(),
  submitFeedback: jest.fn(),
}

const pendingWorkerKaelServiceCall = () => new Promise<never>(() => undefined)

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

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

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  usePathname: () => mockPathname,
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

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => mockWorkflowValue,
}))

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({ role: mockAuthRole, session: { user: { id: 'worker_test_1' } }, signOut: mockSignOut }),
}))

jest.mock('@/lib/use-job-chat-thread', () => ({
  useJobChatThread: (jobId: string | null, enabled: boolean) => mockUseJobChatThread(jobId, enabled),
}))

jest.mock('@/lib/services', () => ({
  workerKaelChatService: {
    create: (...args: unknown[]) => mockWorkerKaelChatService.create(...args),
    get: (...args: unknown[]) => mockWorkerKaelChatService.get(...args),
    getTrainingConsent: (...args: unknown[]) => mockWorkerKaelChatService.getTrainingConsent(...args),
    list: (...args: unknown[]) => mockWorkerKaelChatService.list(...args),
    sendTurn: (...args: unknown[]) => mockWorkerKaelChatService.sendTurn(...args),
    setTrainingConsent: (...args: unknown[]) => mockWorkerKaelChatService.setTrainingConsent(...args),
    streamTurn: (...args: unknown[]) => mockWorkerKaelChatService.streamTurn(...args),
    submitFeedback: (...args: unknown[]) => mockWorkerKaelChatService.submitFeedback(...args),
  },
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => mockAppLanguage,
  }
})

import { WorkerChatSurface, WorkerEarningsSurface, WorkerHomeSurface, WorkerJobsSurface, WorkerProfileSurface } from '../worker-surfaces'

function buildWorkerProfile(overrides: Partial<WorkerProfileResponse> = {}): WorkerProfileResponse {
  return {
    bank_account_masked: null,
    bank_name: null,
    date_of_birth: null,
    districts: ['quan_1'],
    gender: null,
    has_cccd: true,
    has_selfie: true,
    home_lat: null,
    home_lng: null,
    id: 'worker_test_1',
    is_approved: true,
    is_available: false,
    is_suspended: false,
    legal_name: 'Worker Test',
    problem_specializations: [],
    rating: 0,
    service_radius_km: 8,
    service_types: ['electrical'],
    total_jobs: 0,
    verification_status: 'approved',
    years_experience: 3,
    ...overrides,
  }
}

function buildNoEarnings(): EarningsResponse {
  return {
    daily_earnings: [],
    from_date: null,
    gross_earnings: 0,
    net_earnings: 0,
    pending_payment_amount: 0,
    pending_payment_count: 0,
    platform_fee_total: 0,
    to_date: null,
    total_jobs_paid: 0,
    worker_id: 'worker_test_1',
  }
}

function buildIncomingDeal(): LocalDeal {
  return {
    broadcast: {
      broadcastId: 'broadcast_test_1',
      estimatedEarningLabel: '120.000đ - 180.000đ',
      estimatedPriceLabel: '150.000đ - 240.000đ',
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'Quận 1',
      jobId: 'job_test_1',
      prebrief: ['Kael đã tóm tắt phạm vi trước khi thợ nhận việc.'],
      problemSummary: 'Ổ cắm chập chờn',
      secondsRemaining: 42,
      serviceType: 'electrical',
      status: 'sent',
    },
    draft: {
      addressLabel: 'Đường Nguyễn Huệ, Quận 1',
      description: 'Ổ cắm chập chờn',
      districtLabel: 'Quận 1',
      inferredProblemLabel: null,
      mediaCount: 0,
      needsServiceChoice: false,
      problemChips: ['Ổ cắm/công tắc hỏng'],
      serviceType: 'electrical',
      source: 'kael',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: null,
    id: 'job_test_1',
    scopeChange: null,
    status: 'broadcasting',
  }
}

function buildAcceptedDeal(): LocalDeal {
  const deal = buildIncomingDeal()
  return {
    ...deal,
    broadcast: deal.broadcast ? { ...deal.broadcast, status: 'accepted' } : null,
    status: 'worker_matched',
  }
}

function buildInspectingDeal(): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    status: 'inspecting',
  }
}

function buildInspectingDealWithReleasedAddress(): LocalDeal {
  const deal = buildInspectingDeal()
  return {
    ...deal,
    broadcast: deal.broadcast
      ? {
        ...deal.broadcast,
        fullAddressLabel: 'Tòa A, Nguyễn Huệ, Quận 1',
        fullAddressVisible: true,
      }
      : null,
  }
}

function buildRepairingDeal(): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    status: 'repairing',
  }
}

function buildConfirmedCompletionDeal(): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    backendStatus: 'confirmed_by_customer',
    completionNotes: 'Đã thay ổ cắm và kiểm tra tải.',
    completionPhotoUrls: ['job-media/after-1.jpg'],
    status: 'confirmed_by_customer',
  }
}

function buildCompletedByWorkerDeal(): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    backendStatus: 'completed_by_worker',
    completionNotes: 'Đã thay ổ cắm và kiểm tra tải.',
    completionPhotoUrls: ['job-media/after-1.jpg'],
    status: 'completed_by_worker',
  }
}

function buildPaymentPendingDeal(): LocalDeal {
  const deal = buildConfirmedCompletionDeal()
  return {
    ...deal,
    backendStatus: 'payment_pending',
  }
}

function buildWorkflow({
  canWorkerAdvance = false,
  deal = null,
  workerEarnings = buildNoEarnings(),
  workerProfile = buildWorkerProfile(),
}: {
  canWorkerAdvance?: boolean
  deal?: LocalDeal | null
  workerEarnings?: EarningsResponse | null
  workerProfile?: WorkerProfileResponse | null
} = {}) {
  mockWorkerUpdateAvailability = jest.fn(async () => true)
  mockWorkflowValue = {
    actions: {
      requestScopeChange: jest.fn(async () => true),
      requestWorkerCancellation: jest.fn(async () => true),
      workerAcceptBroadcast: jest.fn(async () => true),
      workerDeclineBroadcast: jest.fn(async () => true),
      workerUpdateAvailability: mockWorkerUpdateAvailability,
      workerUpdateStatus: jest.fn(async () => true),
    },
    selectors: {
      canWorkerAccept: Boolean(deal?.broadcast && deal.broadcast.status === 'sent'),
      canWorkerAdvance,
      canWorkerSeeFullAddress: Boolean(deal?.broadcast?.fullAddressVisible),
      currentBackendStatus: deal?.backendStatus ?? deal?.status ?? null,
      currentStatus: deal?.status ?? null,
    },
    state: {
      deal,
      lastError: null,
      lastRemoteSyncAt: null,
      workerGate: 'remote_backend',
    },
    workerEarnings,
    workerProfile,
  }
}

beforeEach(() => {
  jest.useRealTimers()
  mockAuthRole = 'worker'
  mockSignOut = jest.fn(async () => undefined)
  mockReplace.mockClear()
  mockUseJobChatThread.mockClear()
  mockUseJobChatThread.mockReturnValue({
    error: null,
    loading: false,
    messages: [],
    refresh: jest.fn(),
    send: jest.fn(async () => true),
    sendMessage: jest.fn(async () => true),
    sending: false,
  })
  mockWorkerKaelChatService.create.mockReset()
  mockWorkerKaelChatService.get.mockReset()
  mockWorkerKaelChatService.getTrainingConsent.mockReset()
  mockWorkerKaelChatService.list.mockReset()
  mockWorkerKaelChatService.sendTurn.mockReset()
  mockWorkerKaelChatService.setTrainingConsent.mockReset()
  mockWorkerKaelChatService.streamTurn.mockReset()
  mockWorkerKaelChatService.submitFeedback.mockReset()
  mockWorkerKaelChatService.list.mockImplementation(pendingWorkerKaelServiceCall)
  mockWorkerKaelChatService.getTrainingConsent.mockImplementation(pendingWorkerKaelServiceCall)
  mockWorkerKaelChatService.create.mockResolvedValue({
    data: {
      session: {
        closed_at: null,
        id: 'worker-kael-session-1',
        job_id: 'job_test_1',
        progress: null,
        safe_metadata: {},
        started_at: '2026-06-04T00:00:00.000Z',
        status: 'active',
        total_cost_usd: 0,
        total_turns: 0,
        worker_id: 'worker_test_1',
      },
      turns: [],
    },
    status: 201,
    success: true,
  })
  mockWorkerKaelChatService.streamTurn.mockImplementation(async (sessionId: string, input: { message: string }, handlers?: any) => {
    handlers?.onStage?.({
      progress: {
        current_stage: 'worker_assist',
        failure_reason: null,
        progress: 0.2,
        status: 'running',
        updated_at: '2026-06-04T00:00:01.000Z',
      },
      type: 'stage',
    })
    return {
      data: {
      session: {
        closed_at: null,
        id: sessionId,
        job_id: 'job_test_1',
        progress: {
          current_stage: 'worker_assist',
          failure_reason: null,
          progress: 1,
          status: 'completed',
          updated_at: '2026-06-04T00:00:02.000Z',
        },
        safe_metadata: {},
        started_at: '2026-06-04T00:00:00.000Z',
        status: 'active',
        total_cost_usd: 0,
        total_turns: 2,
        worker_id: 'worker_test_1',
      },
        turns: [
          {
            content_type: 'text',
            created_at: '2026-06-04T00:00:00.000Z',
            id: 'turn-worker-default',
            media_refs: [],
            role: 'worker',
            safe_metadata: {},
            session_id: sessionId,
            text_content: input.message,
            turn_index: 1,
          },
          {
            content_type: 'guidance',
            created_at: '2026-06-04T00:00:01.000Z',
            id: 'turn-kael-default',
            media_refs: [],
            role: 'kael',
            safe_metadata: {},
            session_id: sessionId,
            text_content: 'Kael saved this advisory. Keep the next step inside the app.',
            turn_index: 2,
          },
        ],
      },
      status: 200,
      success: true,
    }
  })
  const imagePicker = jest.requireMock('expo-image-picker')
  imagePicker.requestMediaLibraryPermissionsAsync.mockReset()
  imagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
  imagePicker.launchImageLibraryAsync.mockReset()
  imagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] })
  mockPathname = '/(worker)/home'
  mockRouteParams = {}
  mockAppLanguage = 'vi'
  buildWorkflow()
})

describe('WorkerHomeSurface', () => {
  it('keeps Kael estimate disclaimer visible on incoming worker price metrics', () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    render(<WorkerHomeSurface />)

    expect(screen.getByTestId('worker-request-price-disclaimer')).toHaveTextContent(LOCAL_WORKFLOW_PRICE_DISCLAIMER)
  })

  it('uses pending Kael copy when incoming worker price sources are missing', () => {
    const deal = buildIncomingDeal()
    deal.broadcast = deal.broadcast
      ? { ...deal.broadcast, estimatedEarningLabel: undefined, estimatedPriceLabel: undefined }
      : null
    buildWorkflow({ deal })
    render(<WorkerHomeSurface />)

    expect(screen.getByText('Chờ Kael ước tính')).toBeOnTheScreen()
    expect(screen.getByText('Chờ Kael tính tiền công')).toBeOnTheScreen()
  })

  it('renders worker brief artifact lines while keeping the full address locked before accept', () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    render(<WorkerHomeSurface />)

    expect(screen.getByTestId('worker-kael-brief')).toHaveTextContent(/Kael.*ph/)
    expect(screen.getByTestId('worker-general-area-before-accept')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-full-address-after-accept')).toBeNull()
  })

  it('filters generated worker brief lines to the selected language', () => {
    mockAppLanguage = 'en'
    const deal = buildIncomingDeal()
    deal.broadcast = deal.broadcast
      ? {
          ...deal.broadcast,
          prebrief: [
            'Kael đã tóm tắt phạm vi trước khi thợ nhận việc.',
            'Kael grouped the key risk before acceptance.',
          ],
        }
      : null
    buildWorkflow({ deal })
    render(<WorkerHomeSurface />)

    expect(screen.getByTestId('worker-kael-brief')).toHaveTextContent(/Kael grouped the key risk before acceptance\./)
    expect(screen.getByTestId('worker-kael-brief')).not.toHaveTextContent(/tóm tắt phạm vi/)
  })

  it('renders a suspended raw-online profile as locked offline but still lets the worker turn the raw flag off', () => {
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        is_available: true,
        is_suspended: true,
      }),
    })
    render(<WorkerHomeSurface />)

    expect(screen.getByTestId('worker-availability-toggle').props.accessibilityState).toMatchObject({
      checked: false,
      disabled: true,
    })
    fireEvent.press(screen.getByTestId('worker-availability-primary-action'))
    expect(mockWorkerUpdateAvailability).toHaveBeenCalledWith(false)
  })

  it('keeps the home screen free of dashboard stat strips', () => {
    buildWorkflow({
      workerEarnings: buildNoEarnings(),
      workerProfile: buildWorkerProfile({ is_available: true, rating: 0, total_jobs: 0 }),
    })
    render(<WorkerHomeSurface />)

    expect(screen.queryByTestId('worker-home-daily-summary')).toBeNull()
    expect(screen.queryByTestId('worker-home-daily-earnings')).toBeNull()
    expect(screen.queryByTestId('worker-home-daily-jobs')).toBeNull()
    expect(screen.queryByTestId('worker-home-daily-rating')).toBeNull()
  })

  it('keeps the home map free of fake stat strips while binding real backend profile map fields', () => {
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        districts: ['binh_thanh'],
        home_lat: 10.801,
        home_lng: 106.714,
        is_available: true,
        service_radius_km: 12,
      }),
    })
    render(<WorkerHomeSurface />)

    expect(screen.queryByTestId('worker-map-hud-stack')).toBeNull()
    expect(screen.getByTestId('worker-map-provider-worker-origin')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-map-provider-service-radius')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-map-search-pill-opaque')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-map-availability-pill')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-map-open-expanded'))

    expect(screen.getByTestId('worker-map-expanded-sheet')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-home-map-zone-pulse-dot')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-home-map-worker-pulse-dot')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-map-route-summary')).toBeNull()
    expect(screen.queryByText('12 km')).toBeNull()
  })

  it('does not backfill missing worker map data with a default radius or area chip', () => {
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        districts: [],
        home_lat: null,
        home_lng: null,
        is_approved: false,
        is_available: false,
        service_radius_km: null,
        verification_status: 'draft',
      }),
    })
    render(<WorkerHomeSurface />)

    expect(screen.queryByTestId('worker-map-hud-stack')).toBeNull()
    expect(screen.queryByTestId('worker-map-provider-service-radius')).toBeNull()
    expect(screen.queryByTestId('worker-map-provider-worker-origin')).toBeNull()
    expect(screen.queryByTestId('worker-map-search-pill-opaque')).toBeNull()
    expect(screen.getByTestId('worker-map-availability-pill')).toBeOnTheScreen()
    expect(screen.queryByText('8 km')).toBeNull()
  })

  it('splits the worker dock into four main tabs and a separate Kael chat action', () => {
    buildWorkflow()
    render(<WorkerHomeSurface />)

    expect(screen.getByTestId('worker-dock-motion-shell').props.pointerEvents).toBe('box-none')
    expect(screen.getByTestId('worker-dock-split-toolbar')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-liquid-glass-dock')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-dock-floating-edge')).toBeNull()
    expect(screen.queryByTestId('worker-dock-lensing-glow')).toBeNull()
    expect(screen.queryByTestId('worker-dock-liquid-sheen')).toBeNull()
    expect(screen.getByTestId('liquid-toolbar-specular-sheen')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-home')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-jobs')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-earnings')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-profile')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-action-glass')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-action-edge')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-dock-kael-action-aura')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-dock-jobs'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?tab=waiting')

    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('worker-dock-chat'))

    expect(mockReplace).toHaveBeenCalledWith('/(worker)/chat')
  })

  it('hides the worker dock while scrolling down and restores it when scrolling up', () => {
    buildWorkflow()
    render(<WorkerHomeSurface />)

    const workerScroll = screen.getByTestId('worker-home-scroll')

    fireEvent.scroll(workerScroll, { nativeEvent: { contentOffset: { y: 88 } } })
    expect(screen.getByTestId('worker-dock-motion-shell').props.pointerEvents).toBe('none')

    fireEvent.scroll(workerScroll, { nativeEvent: { contentOffset: { y: 54 } } })
    expect(screen.getByTestId('worker-dock-motion-shell').props.pointerEvents).toBe('box-none')
  })
})

describe('WorkerChatSurface', () => {
  it('uses the reference Kael chat shell for the empty JobRoom state', () => {
    mockPathname = '/(worker)/chat'
    buildWorkflow()

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-chat-reference-top-controls')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobroom-back').props.accessibilityLabel).toBe('Thoát chat')
    fireEvent.press(screen.getByTestId('worker-jobroom-back'))
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?tab=active')
    expect(screen.queryByTestId('worker-chat-reference-status-rail')).toBeNull()
    expect(screen.getByTestId('worker-chat-reference-welcome-stage')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-chat-static-empty-state')).toBeNull()
    expect(screen.getByTestId('worker-chat-reference-composer-tools')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-chat-reference-composer-right-actions')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-chat-reference-mode-pill')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-chat-mode-pill-glass-layer')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-kael-chat-input').props.multiline).toBe(true)
    expect(screen.getByTestId('worker-kael-chat-input').props.scrollEnabled).toBe(false)
    expect(screen.getByTestId('worker-kael-chat-input').props.placeholder).toContain('Nhắn')
  })

  it('uses the worker profile name with English Claude-style time greetings', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-06-01T12:10:00+07:00'))
    mockPathname = '/(worker)/chat'
    mockAppLanguage = 'vi'
    buildWorkflow({ workerProfile: buildWorkerProfile({ legal_name: '  Phan   Manh Tu  ' }) })

    render(<WorkerChatSurface />)

    expect(screen.getByText('Lunch, Phan Manh Tu')).toBeOnTheScreen()
    expect(screen.getByText('Lunch, Phan Manh Tu').props.numberOfLines).toBe(1)
    expect(screen.queryByText(/Chào buổi/)).toBeNull()
    jest.useRealTimers()
  })

  it('keeps the standalone greeting honest when the worker profile has no name', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-06-01T15:30:00+07:00'))
    mockPathname = '/(worker)/chat'
    buildWorkflow({ workerProfile: buildWorkerProfile({ legal_name: null }) })

    render(<WorkerChatSurface />)

    expect(screen.getByText('Afternoon, there')).toBeOnTheScreen()
    expect(screen.queryByText(/Worker QA/)).toBeNull()
    jest.useRealTimers()
  })

  it('lets the standalone Kael chat composer accept a message without faking a backend JobRoom send', async () => {
    mockPathname = '/(worker)/chat'
    buildWorkflow()

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-kael-chat-input').props.editable).toBe(true)
    fireEvent.changeText(screen.getByTestId('worker-kael-chat-input'), 'Kael oi')
    expect(screen.getByTestId('worker-kael-send-button').props.accessibilityState.disabled).toBe(false)

    fireEvent.press(screen.getByTestId('worker-kael-send-button'))

    await waitFor(() => expect(screen.getByText('Kael oi')).toBeOnTheScreen())
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.streamTurn).not.toHaveBeenCalled()
    expect(mockUseJobChatThread).toHaveBeenCalledWith(null, false)
  })

  it('opens the media picker from attach and turns the selected asset into a sendable draft note', async () => {
    const imagePicker = jest.requireMock('expo-image-picker')
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ fileName: 'repair-note.jpg', fileSize: 1234, mimeType: 'image/jpeg', uri: 'file:///repair-note.jpg' }],
    })
    mockPathname = '/(worker)/chat'
    buildWorkflow()

    render(<WorkerChatSurface />)

    fireEvent.press(screen.getByTestId('worker-kael-chat-attach'))

    await waitFor(() => expect(imagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled())
    await waitFor(() => expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('worker-kael-chat-input').props.value).toContain('repair-note.jpg'))
    expect(screen.getByTestId('worker-kael-send-button').props.accessibilityState.disabled).toBe(false)
    alertSpy.mockRestore()
  })

  it('lets workers submit Kael feedback from the chat surface', async () => {
    mockWorkerKaelChatService.submitFeedback.mockResolvedValueOnce({
      data: { created_at: '2026-06-04T00:00:00.000Z', feedback_id: 'feedback-1', status: 'new' },
      status: 201,
      success: true,
    })
    mockPathname = '/(worker)/chat'
    buildWorkflow()

    render(<WorkerChatSurface />)

    fireEvent.press(screen.getByTestId('worker-kael-feedback-open'))
    fireEvent.changeText(screen.getByTestId('worker-kael-feedback-input'), 'Kael should explain worker scope rails better.')
    fireEvent.press(screen.getByTestId('worker-kael-feedback-submit'))

    await waitFor(() => expect(mockWorkerKaelChatService.submitFeedback).toHaveBeenCalledWith({
      language: 'vi',
      message: 'Kael should explain worker scope rails better.',
      source: 'worker_chat',
    }))
  })

  it('lets workers toggle Kael training consent from the chat surface', async () => {
    mockWorkerKaelChatService.setTrainingConsent.mockResolvedValueOnce({
      data: { training_consent: true, updated_at: '2026-06-04T00:00:00.000Z', worker_id: 'worker_test_1' },
      status: 200,
      success: true,
    })
    mockPathname = '/(worker)/chat'
    buildWorkflow()

    render(<WorkerChatSurface />)

    fireEvent.press(screen.getByTestId('worker-kael-training-consent-toggle'))

    await waitFor(() => expect(mockWorkerKaelChatService.setTrainingConsent).toHaveBeenCalledWith({
      language: 'vi',
      source: 'worker_chat',
      training_consent: true,
    }))
  })

  it('keeps the mic control usable with an honest fallback when dictation is unavailable', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    mockPathname = '/(worker)/chat'
    buildWorkflow()

    render(<WorkerChatSurface />)

    fireEvent.press(screen.getByTestId('worker-kael-chat-mic'))

    expect(alertSpy).toHaveBeenCalledWith('Mic', expect.stringContaining('Kael'))
    alertSpy.mockRestore()
  })

  it('keeps accepted active job chat writable while the job-chat phase is open', () => {
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildAcceptedDeal() })

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-kael-chat-input').props.editable).toBe(true)
    expect(mockUseJobChatThread).toHaveBeenCalledWith('job_test_1', true)
  })

  it('shows worker Kael advisory progress from SSE stage events while a reply is running', async () => {
    let resolveStream!: (value: unknown) => void
    mockWorkerKaelChatService.streamTurn.mockImplementationOnce((_sessionId: string, input: { message: string }, handlers?: any) => {
      handlers?.onStage?.({
        progress: {
          current_stage: 'worker_assist',
          failure_reason: null,
          progress: 0.2,
          status: 'running',
          updated_at: '2026-06-04T00:00:01.000Z',
        },
        type: 'stage',
      })
      return new Promise((resolve) => {
        resolveStream = resolve
      }).then(() => ({
        data: {
          session: {
            closed_at: null,
            id: 'worker-kael-session-1',
            job_id: 'job_test_1',
            progress: {
              current_stage: 'worker_assist',
              failure_reason: null,
              progress: 1,
              status: 'completed',
              updated_at: '2026-06-04T00:00:02.000Z',
            },
            safe_metadata: {},
            started_at: '2026-06-04T00:00:00.000Z',
            status: 'active',
            total_cost_usd: 0,
            total_turns: 2,
            worker_id: 'worker_test_1',
          },
          turns: [
            {
              content_type: 'text',
              created_at: '2026-06-04T00:00:00.000Z',
              id: 'turn-worker-progress',
              media_refs: [],
              role: 'worker',
              safe_metadata: {},
              session_id: 'worker-kael-session-1',
              text_content: input.message,
              turn_index: 1,
            },
          ],
        },
        status: 200,
        success: true,
      }))
    })
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildAcceptedDeal() })

    render(<WorkerChatSurface />)

    fireEvent.changeText(screen.getByTestId('worker-kael-chat-input'), 'Need advice')
    await waitFor(() => expect(screen.getByTestId('worker-kael-send-button').props.accessibilityState.disabled).toBe(false))
    fireEvent.press(screen.getByTestId('worker-kael-send-button'))

    await waitFor(() => expect(screen.getByTestId('worker-kael-chat-progress')).toBeOnTheScreen())
    expect(screen.getAllByText(/20%/).length).toBeGreaterThan(0)
    resolveStream(undefined)
    await waitFor(() => expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalled())
  })

  it('submits accepted worker messages through the worker Kael advisory chat', async () => {
    const send = jest.fn(async (_message?: string) => true)
    mockUseJobChatThread.mockReturnValue({
      error: null,
      loading: false,
      messages: [],
      refresh: jest.fn(),
      send,
      sendMessage: jest.fn(async () => true),
      sending: false,
    })
    mockWorkerKaelChatService.streamTurn.mockImplementationOnce(async (_sessionId: string, input: { message: string }, handlers?: any) => {
      handlers?.onStage?.({
        progress: {
          current_stage: 'worker_assist',
          failure_reason: null,
          progress: 0.2,
          status: 'running',
          updated_at: '2026-06-04T00:00:01.000Z',
        },
        type: 'stage',
      })
      await send(input.message)
      return {
        data: {
          session: {
            closed_at: null,
            id: 'worker-kael-session-1',
            job_id: 'job_test_1',
            progress: {
              current_stage: 'worker_assist',
              failure_reason: null,
              progress: 1,
              status: 'completed',
              updated_at: '2026-06-04T00:00:02.000Z',
            },
            safe_metadata: {},
            started_at: '2026-06-04T00:00:00.000Z',
            status: 'active',
            total_cost_usd: 0,
            total_turns: 2,
            worker_id: 'worker_test_1',
          },
          turns: [
            {
              content_type: 'text',
              created_at: '2026-06-04T00:00:00.000Z',
              id: 'turn-worker-1',
              media_refs: [],
              role: 'worker',
              safe_metadata: {},
              session_id: 'worker-kael-session-1',
              text_content: 'worker arrived',
              turn_index: 1,
            },
            {
              content_type: 'guidance',
              created_at: '2026-06-04T00:00:01.000Z',
              id: 'turn-kael-1',
              media_refs: [],
              role: 'kael',
              safe_metadata: { safety_notes: ['Keep pricing inside the app.'] },
              session_id: 'worker-kael-session-1',
              text_content: 'Kael saved this advisory. Send scope-change in the app if new work appears.',
              turn_index: 2,
            },
          ],
        },
        status: 200,
        success: true,
      }
    })
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildAcceptedDeal() })

    render(<WorkerChatSurface />)

    fireEvent.changeText(screen.getByTestId('worker-kael-chat-input'), 'ÄÃ£ tá»›i nÆ¡i')
    fireEvent.press(screen.getByTestId('worker-kael-send-button'))

    await waitFor(() => expect(send).toHaveBeenCalledWith('ÄÃ£ tá»›i nÆ¡i'))
    expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledWith(
      'worker-kael-session-1',
      expect.objectContaining({ language: 'vi', media_refs: [], message: 'ÄÃ£ tá»›i nÆ¡i' }),
      expect.any(Object),
    )
  })

  it('keeps worker chat readable but locks sending after the payment gate', () => {
    mockPathname = '/(worker)/chat'
    buildWorkflow({ deal: buildPaymentPendingDeal() })

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-kael-chat-input').props.editable).toBe(false)
    expect(screen.getByTestId('worker-kael-chat-input').props.accessibilityLabel).toContain('Chat chỉ còn đọc lại')
    expect(mockUseJobChatThread).toHaveBeenCalledWith('job_test_1', true)
  })
})

describe('WorkerJobsSurface', () => {
  it('defaults the Jobs route to the waiting request section', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = {}
    buildWorkflow()

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-jobs-waiting-liquid-section')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-jobs-active-liquid-section')).toBeNull()
    expect(screen.queryByTestId('worker-jobs-needs-liquid-section')).toBeNull()
  })

  it('keeps waiting jobs focused on the request content without the summary strip', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'waiting' }
    buildWorkflow()

    render(<WorkerJobsSurface />)

    expect(screen.queryByTestId('worker-jobs-operational-summary')).toBeNull()
    expect(screen.getByTestId('worker-activity-filter-pattern')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-segment-crisp-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-waiting-liquid-section')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-liquid-section-wash')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-liquid-section-reflection')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-section-crisp-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-waiting-empty-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-waiting-presence-map')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-map-liquid-inset')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-map-crisp-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-map-waiting-control-pulse-dot')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-map-compact-route-strip')).toBeNull()
    expect(screen.queryByText('8 km')).toBeNull()
    expect(screen.queryByTestId('worker-map-zone-pill-opaque')).toBeNull()
    expect(screen.queryByText('Đang theo dõi')).toBeNull()
    expect(screen.queryByTestId('worker-flexible-map-shell')).toBeNull()
    expect(screen.getByTestId('worker-jobs-card-liquid-chrome')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-card-crisp-shell')).toBeOnTheScreen()
    expect(screen.getAllByTestId('worker-jobs-card-operational-keyline').length).toBeGreaterThan(0)

    fireEvent.press(screen.getByTestId('worker-jobs-waiting-map-open-expanded'))

    expect(screen.getByTestId('worker-map-expanded-sheet')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-map-waiting-worker-pulse-dot')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-map-expanded-worker-pulse-dot')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-map-route-summary')).toBeNull()
    expect(screen.queryByText('8 km')).toBeNull()
  })

  it('shows incoming request phase context while keeping the full address locked', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'waiting' }
    buildWorkflow({ deal: buildIncomingDeal() })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-jobs-waiting-phase-context')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-waiting-phase-context')).toHaveTextContent(/Tóm tắt cho thợ/)
    expect(screen.getByTestId('worker-jobs-waiting-phase-context')).toHaveTextContent(/Nhận hoặc từ chối yêu cầu/)
    expect(screen.getByTestId('worker-request-phase-context')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-request-phase-context')).toHaveTextContent(/Tóm tắt cho thợ/)
    expect(screen.getByTestId('worker-request-phase-context')).toHaveTextContent(/Nhận hoặc từ chối yêu cầu/)
    expect(screen.getByTestId('worker-general-area-before-accept')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-full-address-after-accept')).toBeNull()
  })

  it('reveals the full address only after backend release on an accepted job', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'active' }
    buildWorkflow({ deal: buildInspectingDealWithReleasedAddress() })

    render(<WorkerJobsSurface />)

    expect(screen.getAllByText(/Tòa A, Nguyễn Huệ, Quận 1/).length).toBeGreaterThan(0)
    expect(screen.getByTestId('worker-map-route-after-accept')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-general-area-before-accept')).toBeNull()
  })

  it('keeps active jobs on the same operational tile hierarchy', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'active' }
    buildWorkflow({ deal: buildAcceptedDeal() })

    render(<WorkerJobsSurface />)

    expect(screen.queryByTestId('worker-jobs-operational-summary')).toBeNull()
    expect(screen.getByTestId('worker-activity-filter-pattern')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-segment-crisp-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-active-liquid-section')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-liquid-section-wash')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-liquid-section-reflection')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-section-crisp-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-active-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-active-phase-context')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-active-presence-map')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-map-liquid-inset')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-map-crisp-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-map-active-control-pulse-dot')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-map-compact-route-strip')).toBeNull()
    expect(screen.queryByText('8 km')).toBeNull()
    expect(screen.queryByTestId('worker-map-zone-pill-opaque')).toBeNull()
    expect(screen.queryByTestId('worker-flexible-map-shell')).toBeNull()
    expect(screen.getAllByTestId('worker-jobs-card-liquid-chrome').length).toBeGreaterThan(1)
    expect(screen.getAllByTestId('worker-jobs-card-crisp-shell').length).toBeGreaterThan(1)
    expect(screen.getAllByTestId('worker-jobs-card-operational-keyline').length).toBeGreaterThan(0)

    fireEvent.press(screen.getByTestId('worker-jobs-active-map-open-expanded'))

    expect(screen.getByTestId('worker-map-expanded-sheet')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-map-active-worker-pulse-dot')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-map-active-zone-pulse-dot')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-map-expanded-zone-pulse-dot')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-map-route-summary')).toBeNull()
    expect(screen.queryByText('8 km')).toBeNull()
  })

  it('routes completion from Active to Needs evidence without direct status update', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'active' }
    buildWorkflow({ canWorkerAdvance: true, deal: buildRepairingDeal() })

    render(<WorkerJobsSurface />)

    fireEvent.press(screen.getByTestId('worker-jobs-completion-evidence-route'))

    expect(mockWorkflowValue.actions.workerUpdateStatus).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?tab=needs')
    expect(screen.queryByTestId('worker-jobs-next-status-action')).toBeNull()
    expect(screen.queryByTestId('worker-accepted-action-sheet')).toBeNull()
    expect(screen.queryByTestId('worker-local-status-action')).toBeNull()
  })

  it('keeps worker phase context on worker-visible artifacts after completion confirmation', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'active' }
    buildWorkflow({ deal: buildConfirmedCompletionDeal() })

    render(<WorkerJobsSurface />)

    const phaseContext = screen.getByTestId('worker-jobs-active-phase-context')
    expect(phaseContext).toHaveTextContent(/Bằng chứng hoàn tất/)
    expect(phaseContext).not.toHaveTextContent('Quyết định thanh toán')
  })

  it('renders scope-change evidence without any worker price input', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'needs' }
    buildWorkflow({ canWorkerAdvance: true, deal: buildInspectingDeal() })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-jobs-needs-phase-context')).toHaveTextContent(/Thay đổi phạm vi/)
    expect(screen.getByTestId('worker-scope-change-request')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-scope-change-submit')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-local-status-action')).toBeNull()
    expect(screen.queryByTestId('worker-final-price-input')).toBeNull()
  })

  it('renders completion evidence as the repairing-phase Needs artifact', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'needs' }
    buildWorkflow({ canWorkerAdvance: true, deal: buildRepairingDeal() })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-jobs-needs-phase-context')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-needs-phase-context')).toHaveTextContent(/Bằng chứng hoàn tất/)
    expect(screen.getByTestId('worker-completion-evidence-blocker-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-completion-note-input')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-completion-add-photo')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-completion-photo-count')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-local-status-action')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-final-price-input')).toBeNull()
  })

  it('keeps submitted completion evidence visible in Needs while Kael reviews it', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'needs' }
    buildWorkflow({ deal: buildCompletedByWorkerDeal() })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-jobs-needs-phase-context')).toHaveTextContent(/Bằng chứng hoàn tất/)
    expect(screen.getByTestId('worker-completion-evidence-submitted-card')).toBeOnTheScreen()
    expect(screen.getByText('Đã thay ổ cắm và kiểm tra tải.')).toBeOnTheScreen()
    expect(screen.getByText('1 ảnh nghiệm thu')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-completion-note-input')).toBeNull()
    expect(screen.queryByTestId('worker-final-price-input')).toBeNull()
  })

  it('does not treat partial completion evidence as a submitted artifact', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'needs' }
    const deal = buildCompletedByWorkerDeal()
    deal.completionPhotoUrls = []
    buildWorkflow({ deal })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-jobs-needs-phase-context')).toHaveTextContent(/Cần bằng chứng hoàn tất/)
    expect(screen.getByTestId('worker-completion-evidence-missing-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-completion-evidence-missing-card')).toHaveTextContent(/Thiếu ảnh/)
    expect(screen.queryByTestId('worker-completion-evidence-submitted-card')).toBeNull()
    expect(screen.queryByTestId('worker-final-price-input')).toBeNull()
  })

  it('keeps needs review empty states as focused operational tiles without a map preview', () => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'needs' }
    buildWorkflow()

    render(<WorkerJobsSurface />)

    expect(screen.queryByTestId('worker-jobs-operational-summary')).toBeNull()
    expect(screen.getByTestId('worker-activity-filter-pattern')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-segment-crisp-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-needs-liquid-section')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-liquid-section-wash')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-liquid-section-reflection')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-jobs-section-crisp-shell')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-jobs-needs-presence-map')).toBeNull()
    expect(screen.queryByTestId('worker-jobs-map-liquid-inset')).toBeNull()
    expect(screen.queryByTestId('worker-jobs-map-crisp-shell')).toBeNull()
    expect(screen.queryByText('Chưa có')).toBeNull()
    expect(screen.queryByTestId('worker-flexible-map-shell')).toBeNull()
    expect(screen.getByTestId('worker-scope-change-empty')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-scope-change-empty')).not.toHaveTextContent(/Phạm vi/)
    expect(screen.getByTestId('worker-completion-evidence-empty')).toBeOnTheScreen()
    expect(screen.getAllByTestId('worker-jobs-card-liquid-chrome').length).toBeGreaterThan(1)
    expect(screen.getAllByTestId('worker-jobs-card-crisp-shell').length).toBeGreaterThan(1)
    expect(screen.getAllByTestId('worker-jobs-card-operational-keyline').length).toBeGreaterThan(1)
  })
})

describe('WorkerEarningsSurface', () => {
  it('applies the earnings liquid hierarchy without fake payout data', () => {
    mockPathname = '/(worker)/earnings'
    buildWorkflow({ workerEarnings: buildNoEarnings() })

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-earnings-surface')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-earnings-seven-day-chart')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-earnings-hero-crisp-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-earnings-chart-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-earnings-chart-crisp-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-earnings-chart-empty-label')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-earnings-day-month-summary')).toBeOnTheScreen()
    expect(screen.getAllByTestId('worker-earnings-summary-crisp-shell')).toHaveLength(2)
    expect(screen.getByTestId('worker-earnings-ledger')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-earnings-ledger-crisp-shell')).toBeOnTheScreen()
    expect(screen.queryByText('7 ngày gần nhất')).toBeNull()
    expect(screen.queryByText('Recent days')).toBeNull()
    expect(screen.queryByText('320k')).toBeNull()
    expect(screen.queryByText('4.8tr')).toBeNull()
  })
})

describe('WorkerProfileSurface', () => {
  it('applies the profile liquid hierarchy without fabricating worker trust data', () => {
    mockPathname = '/(worker)/profile'
    buildWorkflow({ workerProfile: buildWorkerProfile({ rating: 0, total_jobs: 0 }) })

    render(<WorkerProfileSurface />)

    expect(screen.getByTestId('worker-profile-surface')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-verification-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-hero-crisp-shell')).toBeOnTheScreen()
    expect(screen.getAllByTestId('worker-profile-mini-crisp-shell')).toHaveLength(2)
    expect(screen.getByTestId('worker-profile-list-groups')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-list-crisp-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-level-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-level-crisp-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-level-corner-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-level-progress').props.accessibilityValue).toMatchObject({ now: 0 })
    expect(screen.getByTestId('worker-profile-level-signal-jobs')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-level-signal-rating')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-level-signal-recommendation')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-level-signal-jobs')).toHaveTextContent(/0/)
    expect(screen.getByTestId('worker-profile-level-signal-rating')).toHaveTextContent(/0\/5/)
    expect(screen.getByTestId('worker-profile-level-signal-recommendation')).toHaveTextContent(/0%/)
    expect(screen.getAllByTestId('worker-profile-level-signal-glass-layer')).toHaveLength(3)
    expect(screen.getByTestId('worker-profile-level-ladder')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-level-rail')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-level-rail').props.showsHorizontalScrollIndicator).toBe(false)
    expect(screen.getByTestId('worker-profile-level-liquid-scroll-indicator')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-level-liquid-scroll-thumb')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-profile-level-scroll-hint')).toBeNull()
    expect(screen.queryByTestId('worker-profile-level-advanced-range')).toBeNull()
    expect(screen.getByTestId('worker-profile-level-detail')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-level-chip-10')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-level-max')).toHaveTextContent(/10/)
    fireEvent.press(screen.getByTestId('worker-profile-level-chip-4'))
    expect(screen.getByTestId('worker-profile-level-selected-requirement')).toHaveTextContent(/50/)
    fireEvent.press(screen.getByTestId('worker-profile-level-chip-5'))
    expect(screen.getByTestId('worker-profile-level-selected-requirement')).toHaveTextContent(/\?\?\?\?/)
    expect(screen.getByTestId('worker-profile-preference-crisp-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-sign-out')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-profile-service-area-crisp-shell')).toBeNull()
    expect(screen.queryByText('--')).toBeNull()
  })

  it('derives worker level progress from real completed jobs and feedback', () => {
    mockPathname = '/(worker)/profile'
    buildWorkflow({ workerProfile: buildWorkerProfile({ rating: 4.9, total_jobs: 24 }) })

    render(<WorkerProfileSurface />)

    expect(screen.getByTestId('worker-profile-level-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-level-progress').props.accessibilityValue.now).toBeGreaterThan(0)
    expect(screen.getByTestId('worker-profile-level-signal-jobs')).toHaveTextContent(/24/)
    expect(screen.getByTestId('worker-profile-level-signal-rating')).toHaveTextContent(/4\.9\/5/)
    expect(screen.getByTestId('worker-profile-level-signal-recommendation')).toHaveTextContent(/60%/)
    expect(screen.queryByText('--')).toBeNull()
  })

  it('keeps later worker rewards mysterious until level five opens the next requirement', () => {
    mockPathname = '/(worker)/profile'
    buildWorkflow({ workerProfile: buildWorkerProfile({ rating: 5, total_jobs: 100 }) })

    render(<WorkerProfileSurface />)

    expect(screen.getByTestId('worker-profile-level-title')).toHaveTextContent(/tinh/)
    expect(screen.getByTestId('worker-profile-level-selected-requirement')).toHaveTextContent(/160/)
    expect(screen.getByTestId('worker-profile-level-selected-reward')).toHaveTextContent(/\?\?\?\?/)
    fireEvent.press(screen.getByTestId('worker-profile-level-chip-5'))
    expect(screen.getByTestId('worker-profile-level-selected-requirement')).toHaveTextContent(/100/)
    expect(screen.getByTestId('worker-profile-level-selected-reward')).toHaveTextContent(/\?\?\?\?/)
    fireEvent.press(screen.getByTestId('worker-profile-level-chip-7'))
    expect(screen.getByTestId('worker-profile-level-selected-requirement')).toHaveTextContent(/\?\?\?\?/)
  })

  it('keeps the verification form as a crisp profile panel when a worker can submit', () => {
    mockPathname = '/(worker)/profile'
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        bank_account_masked: null,
        bank_name: null,
        has_cccd: false,
        has_selfie: false,
        is_approved: false,
        verification_status: 'draft',
      }),
    })

    render(<WorkerProfileSurface />)

    expect(screen.getByTestId('worker-profile-verification-collapsed-crisp-shell')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-profile-open-verification-form'))

    expect(screen.getByTestId('worker-verification-submit-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-verification-crisp-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-profile-service-area-crisp-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-verification-submit')).toBeOnTheScreen()
  })
})
