import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert, Platform, StyleSheet } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { LocalDeal } from '@nestscout/shared'
import { LOCAL_WORKFLOW_PRICE_DISCLAIMER } from '@nestscout/shared'
import type { EarningsResponse, WorkerProfileResponse } from '@/lib/api-types'

let mockWorkflowValue: any
let mockAuthRole: 'admin' | 'customer' | 'worker'
let mockAuthSessionProvider: string | null
let mockAuthSessionUserId: string
let mockSignOut: jest.Mock
let mockWorkerUpdateAvailability: jest.Mock
let mockWorkerUploadAvatar: jest.Mock
let mockPathname: string
let mockRouteParams: Record<string, string | string[] | undefined>
let mockAppLanguage = 'vi'
let mockFocusCallback: (() => void | (() => void)) | null
const mockWorkerKaelChatModes = new Map<string, 'normal' | 'intake'>()
const mockReplace = jest.fn()
const mockUseJobChatThread = jest.fn()
const mockPlacesAutocomplete = jest.fn()
const mockWorkerKaelChatService = {
  archive: jest.fn(),
  create: jest.fn(),
  get: jest.fn(),
  getTrainingConsent: jest.fn(),
  list: jest.fn(),
  rename: jest.fn(),
  setPinned: jest.fn(),
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
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
}))

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getCurrentPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(() => new Promise(() => undefined)),
  watchPositionAsync: jest.fn(),
}), { virtual: true })

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react')
    React.useEffect(() => {
      mockFocusCallback = callback
      const cleanup = callback()
      return () => {
        if (mockFocusCallback === callback) mockFocusCallback = null
        if (typeof cleanup === 'function') cleanup()
      }
    }, [callback])
  },
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
  useAuth: () => ({
    role: mockAuthRole,
    session: {
      user: {
        app_metadata: mockAuthSessionProvider ? { provider: mockAuthSessionProvider } : {},
        id: mockAuthSessionUserId,
      },
    },
    signOut: mockSignOut,
  }),
}))

jest.mock('@/lib/use-job-chat-thread', () => ({
  useJobChatThread: (jobId: string | null, enabled: boolean) => mockUseJobChatThread(jobId, enabled),
}))

jest.mock('@/lib/services', () => ({
  placesService: {
    autocomplete: (...args: unknown[]) => mockPlacesAutocomplete(...args),
  },
  workerRouteService: {
    getMapImage: jest.fn(),
    getPreview: jest.fn(),
  },
  workerKaelChatService: {
    archive: (...args: unknown[]) => mockWorkerKaelChatService.archive(...args),
    create: (...args: unknown[]) => mockWorkerKaelChatService.create(...args),
    get: (...args: unknown[]) => mockWorkerKaelChatService.get(...args),
    getTrainingConsent: (...args: unknown[]) => mockWorkerKaelChatService.getTrainingConsent(...args),
    list: (...args: unknown[]) => mockWorkerKaelChatService.list(...args),
    rename: (...args: unknown[]) => mockWorkerKaelChatService.rename(...args),
    setPinned: (...args: unknown[]) => mockWorkerKaelChatService.setPinned(...args),
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

import {
  WorkerChatSurface,
  WorkerEarningsSurface,
  WorkerHomeSurface,
  WorkerJobsSurface,
  WorkerProfileSurface,
} from '../worker-surfaces'
import { resolveWorkerV5DockActive } from '../dock/routing'
import { WorkerRebuildDockOverlay } from '../dock/worker-v5-dock-overlay'
import { WorkerV5ScheduleList } from '../jobs/surfaces'
import {
  WORKER_V5_FORMULA_MINT_CARD_AURA_INTENSITY,
  WorkerV5FormulaMintCardAura,
} from '../ui/aura-surfaces'
import { workerV5CapturedIconAssets } from '../ui/worker-v5-icon-assets'
import { WorkerV5DetailRail } from '../ui/worker-v5-detail-rail'

function buildWorkerProfile(overrides: Partial<WorkerProfileResponse> = {}): WorkerProfileResponse {
  return {
    active_minutes: 0,
    avatar_url: null,
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
    last_active_at: null,
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

function settledEarningsDateKey(daysAgo: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

function buildSettledEarnings(): EarningsResponse {
  return {
    daily_earnings: [
      { date: settledEarningsDateKey(0), gross_earnings: 400000, net_earnings: 320000, paid_job_count: 2, platform_fee_total: 80000 },
      { date: settledEarningsDateKey(1), gross_earnings: 220000, net_earnings: 180000, paid_job_count: 1, platform_fee_total: 40000 },
    ],
    from_date: settledEarningsDateKey(6),
    gross_earnings: 1500000,
    net_earnings: 1200000,
    pending_payment_amount: 0,
    pending_payment_count: 0,
    platform_fee_total: 300000,
    to_date: settledEarningsDateKey(0),
    total_jobs_paid: 5,
    worker_id: 'worker_test_1',
  }
}

function buildIncomingDeal(): LocalDeal {
  return {
    broadcast: {
      broadcastId: 'broadcast_test_1',
      estimatedEarningLabel: '120.000d - 180.000d',
      estimatedPriceLabel: '150.000d - 240.000d',
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'Qu?n 1',
      jobId: 'job_test_1',
      prebrief: ['Kael dã tóm t?t ph?m vi tru?c khi th? nh?n vi?c.'],
      problemSummary: '? c?m ch?p ch?n',
      secondsRemaining: 42,
      serviceType: 'electrical',
      status: 'sent',
    },
    draft: {
      addressLabel: 'Ðu?ng Nguy?n Hu?, Qu?n 1',
      description: '? c?m ch?p ch?n',
      districtLabel: 'Qu?n 1',
      inferredProblemLabel: null,
      mediaCount: 0,
      needsServiceChoice: false,
      problemChips: ['? c?m/công t?c h?ng'],
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

function buildCancelledDeal(): LocalDeal {
  const deal = buildIncomingDeal()
  return {
    ...deal,
    broadcast: deal.broadcast ? { ...deal.broadcast, status: 'cancelled' } : null,
    status: 'cancelled',
  }
}

function buildAcceptedDealForJob(jobId: string): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    broadcast: deal.broadcast ? { ...deal.broadcast, broadcastId: `broadcast_${jobId}`, jobId } : null,
    id: jobId,
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
        fullAddressLabel: 'Tòa A, Nguy?n Hu?, Qu?n 1',
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
    completionNotes: 'Ðã thay ? c?m và ki?m tra t?i.',
    completionPhotoUrls: ['job-media/after-1.jpg'],
    status: 'confirmed_by_customer',
  }
}

function buildCompletedByWorkerDeal(): LocalDeal {
  const deal = buildAcceptedDeal()
  return {
    ...deal,
    backendStatus: 'completed_by_worker',
    completionNotes: 'Ðã thay ? c?m và ki?m tra t?i.',
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
  workerJobs = [],
  workerJobsHydrated = true,
  workerProfile = buildWorkerProfile(),
}: {
  canWorkerAdvance?: boolean
  deal?: LocalDeal | null
  workerEarnings?: EarningsResponse | null
  workerJobs?: Array<{ status: string }>
  workerJobsHydrated?: boolean
  workerProfile?: WorkerProfileResponse | null
} = {}) {
  mockWorkerUpdateAvailability = jest.fn(async () => true)
  mockWorkerUploadAvatar = jest.fn(async () => true)
  mockWorkflowValue = {
    actions: {
      openKaelJobIncident: jest.fn(async () => ({ incident: null })),
      proposeScopeChangeFromKaelIncident: jest.fn(async () => true),
      requestScopeChange: jest.fn(async () => true),
      requestWorkerCancellation: jest.fn(async () => true),
      workerAcceptBroadcast: jest.fn(async () => true),
      workerDeclineBroadcast: jest.fn(async () => true),
      workerUpdateAvailability: mockWorkerUpdateAvailability,
      workerUploadAvatar: mockWorkerUploadAvatar,
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
    workerJobs,
    workerJobsHydrated,
    workerProfile,
  }
}

beforeEach(async () => {
  jest.useRealTimers()
  await AsyncStorage.clear()
  mockFocusCallback = null
  mockAuthRole = 'worker'
  mockAuthSessionProvider = null
  mockAuthSessionUserId = 'worker_test_1'
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
  mockWorkerKaelChatService.archive.mockReset()
  mockWorkerKaelChatService.get.mockReset()
  mockWorkerKaelChatService.getTrainingConsent.mockReset()
  mockWorkerKaelChatService.list.mockReset()
  mockWorkerKaelChatService.rename.mockReset()
  mockWorkerKaelChatService.setPinned.mockReset()
  mockWorkerKaelChatService.sendTurn.mockReset()
  mockWorkerKaelChatService.setTrainingConsent.mockReset()
  mockWorkerKaelChatService.streamTurn.mockReset()
  mockWorkerKaelChatService.submitFeedback.mockReset()
  mockWorkerKaelChatModes.clear()
  mockWorkerKaelChatService.list.mockImplementation(pendingWorkerKaelServiceCall)
  mockWorkerKaelChatService.get.mockImplementation(pendingWorkerKaelServiceCall)
  mockWorkerKaelChatService.getTrainingConsent.mockImplementation(pendingWorkerKaelServiceCall)
  mockWorkerKaelChatService.create.mockImplementation(async (input: { mode?: 'normal' | 'intake' }) => {
    const mode = input.mode ?? 'intake'
    mockWorkerKaelChatModes.set('worker-kael-session-1', mode)
    return {
      data: {
        session: {
          closed_at: null,
          id: 'worker-kael-session-1',
          job_id: 'job_test_1',
          mode,
          progress: null,
          safe_metadata: {},
          started_at: '2026-06-04T00:00:00.000Z',
          status: 'active',
          title: null,
          total_cost_usd: 0,
          total_turns: 0,
          worker_id: 'worker_test_1',
        },
        turns: [],
      },
      status: 201,
      success: true,
    }
  })
  mockWorkerKaelChatService.archive.mockResolvedValue({
    data: {
      archived_at: '2026-07-13T07:45:00.000Z',
      session_id: 'worker-kael-session-1',
    },
    status: 200,
    success: true,
  })
  mockWorkerKaelChatService.rename.mockImplementation(async (sessionId: string, input: { title: string }) => ({
    data: {
      session: {
        closed_at: null,
        id: sessionId,
        job_id: 'job_test_1',
        mode: 'normal',
        pinned_at: null,
        progress: null,
        started_at: '2026-07-13T07:30:00.000Z',
        status: 'active',
        title: input.title,
        total_turns: 4,
        worker_id: 'worker_test_1',
      },
      turns: [],
    },
    status: 200,
    success: true,
  }))
  mockWorkerKaelChatService.setPinned.mockImplementation(async (sessionId: string, input: { pinned: boolean }) => ({
    data: {
      session: {
        closed_at: null,
        id: sessionId,
        job_id: 'job_test_1',
        mode: 'normal',
        pinned_at: input.pinned ? '2026-07-13T08:00:00.000Z' : null,
        progress: null,
        started_at: '2026-07-13T07:30:00.000Z',
        status: 'active',
        title: 'Kiểm tra phạm vi lavabo',
        total_turns: 4,
        worker_id: 'worker_test_1',
      },
      turns: [],
    },
    status: 200,
    success: true,
  }))
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
        mode: mockWorkerKaelChatModes.get(sessionId) ?? 'normal',
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
        title: 'Chuẩn bị cho công việc',
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
  imagePicker.requestCameraPermissionsAsync.mockReset()
  imagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true })
  imagePicker.launchCameraAsync.mockReset()
  imagePicker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: [] })
  imagePicker.requestMediaLibraryPermissionsAsync.mockReset()
  imagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
  imagePicker.launchImageLibraryAsync.mockReset()
  imagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] })
  mockPlacesAutocomplete.mockReset()
  mockPlacesAutocomplete.mockResolvedValue({
    data: {
      fallback_used: false,
      suggestions: [],
    },
    success: true,
  })
  mockPathname = '/(worker)/home'
  mockRouteParams = {}
  mockAppLanguage = 'vi'
  buildWorkflow()
})

describe('Worker runtime surface wiring', () => {
  it('keeps the schedule ordinal inset from the left edge', () => {
    render(
      <WorkerV5ScheduleList
        reduceTransparency={false}
        rows={[{ aside: 'Matched', meta: 'Area', time: '01', title: 'Plumbing' }]}
      />,
    )

    expect(StyleSheet.flatten(screen.getByText('01').props.style)).toMatchObject({ paddingLeft: 7 })
  })

  it('keeps the worker home focused on availability and quick actions without the Kael prepared-work card', () => {
    buildWorkflow({ deal: buildIncomingDeal() })

    render(<WorkerHomeSurface />)

    expect(screen.queryByText('Kael đã chuẩn bị việc phù hợp')).toBeNull()
    expect(screen.getByTestId('worker-v5-home-command-center')).toBeOnTheScreen()
  })

  it('removes dividers only from the four Home quick-action detail rails', () => {
    const standaloneRail = render(
      <WorkerV5DetailRail
        items={[{ glyph: 'document', label: 'Một' }, { glyph: 'shield', label: 'Hai' }]}
        testID="worker-v5-detail-rail-default"
      />,
    )
    expect(screen.getByTestId('worker-v5-detail-rail-default-divider-0')).toBeOnTheScreen()
    standaloneRail.unmount()

    buildWorkflow()
    render(<WorkerHomeSurface />)

    for (const index of [0, 1, 2, 3]) {
      expect(screen.queryByTestId(`worker-v5-home-quick-action-detail-${index}-divider-0`)).toBeNull()
      expect(screen.getByTestId(`worker-v5-home-quick-action-detail-${index}`)).toHaveStyle({ flexDirection: 'column' })
    }
  })

  it('updates the availability control immediately while the backend write is pending', async () => {
    buildWorkflow()
    let resolveAvailabilityWrite: (saved: boolean) => void = () => undefined
    mockWorkerUpdateAvailability.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      resolveAvailabilityWrite = resolve
    }))

    render(<WorkerHomeSurface />)

    expect(screen.getByTestId('worker-v5-availability-title')).toHaveTextContent('Đang tắt nhận việc')
    expect(screen.getByTestId('worker-v5-availability-switch-motion-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-availability-switch-fill')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-availability-switch-sheen')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-availability-switch-knob')).toBeOnTheScreen()

    const availabilitySwitch = screen.getByTestId('worker-v5-availability-switch')
    fireEvent(availabilitySwitch, 'pressIn')
    fireEvent(availabilitySwitch, 'pressOut')
    expect(mockWorkerUpdateAvailability).not.toHaveBeenCalled()
    fireEvent.press(availabilitySwitch)

    expect(mockWorkerUpdateAvailability).toHaveBeenCalledWith(true)
    expect(screen.getByTestId('worker-v5-availability-title')).toHaveTextContent('Sẵn sàng nhận việc')
    expect(screen.getByTestId('worker-v5-availability-switch').props.accessibilityState).toMatchObject({
      busy: true,
      checked: true,
    })

    resolveAvailabilityWrite(true)
    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-availability-switch').props.accessibilityState).toMatchObject({ busy: false })
    })
  })

  it('commits only the first availability intent while its write is pending', () => {
    buildWorkflow()
    mockWorkerUpdateAvailability.mockImplementationOnce(() => new Promise<boolean>(() => undefined))

    render(<WorkerHomeSurface />)

    const availabilitySwitch = screen.getByTestId('worker-v5-availability-switch')
    fireEvent.press(availabilitySwitch)
    fireEvent.press(availabilitySwitch)

    expect(mockWorkerUpdateAvailability).toHaveBeenCalledTimes(1)
    expect(mockWorkerUpdateAvailability).toHaveBeenLastCalledWith(true)
    expect(availabilitySwitch.props.accessibilityState).toMatchObject({ busy: true, checked: true })
  })

  it('rolls back visibly when the availability write is rejected', async () => {
    buildWorkflow()
    mockWorkerUpdateAvailability.mockResolvedValueOnce(false)
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)

    render(<WorkerHomeSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-availability-switch'))

    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-availability-title')).toHaveTextContent('Chưa cập nhật được — kiểm tra việc đang chạy')
    })
    expect(screen.getByTestId('worker-v5-availability-switch').props.accessibilityState).toMatchObject({
      checked: false,
    })
    expect(alertSpy).toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('keeps availability as the worker preference while an operational job is still active', async () => {
    buildWorkflow({ workerJobs: [{ status: 'arrived' }] })

    render(<WorkerHomeSurface />)

    const availabilitySwitch = screen.getByTestId('worker-v5-availability-switch')
    expect(availabilitySwitch.props.accessibilityState).toMatchObject({
      checked: false,
      disabled: false,
    })
    expect(screen.getByTestId('worker-v5-availability-title')).toHaveTextContent('Đang tắt nhận việc')

    fireEvent.press(availabilitySwitch)
    expect(mockWorkerUpdateAvailability).toHaveBeenCalledWith(true)
    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-availability-title')).toHaveTextContent('Đã bật nhận công việc')
    })
  })

  it('keeps availability guarded until the real worker job list has hydrated', () => {
    buildWorkflow({ workerJobsHydrated: false })

    render(<WorkerHomeSurface />)

    const availabilitySwitch = screen.getByTestId('worker-v5-availability-switch')
    expect(availabilitySwitch.props.accessibilityState).toMatchObject({ disabled: true })
    expect(screen.getByTestId('worker-v5-availability-title')).toHaveTextContent('Đang đồng bộ công việc')
    fireEvent.press(availabilitySwitch)
    expect(mockWorkerUpdateAvailability).not.toHaveBeenCalled()
  })

  it('retires the old accept-review deep link back to the work board', () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '2.3-accept-review' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-screen-2.1-opportunity-inbox')).toBeOnTheScreen()
    expect(mockWorkflowValue.actions.workerAcceptBroadcast).not.toHaveBeenCalled()
  })

  it('keeps the work board focused on real opportunities without the workflow note card', () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = {}

    render(<WorkerJobsSurface />)

    expect(screen.queryByText('Một luồng công việc')).toBeNull()
    expect(screen.getByTestId('worker-v5-opportunity-card')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-opportunity-copy').props.style)).toMatchObject({ justifyContent: 'center' })
  })

  it('requires a selected mission before enabling the continuation CTA and source formula', () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = {}

    render(<WorkerJobsSurface />)

    expect(screen.queryByText('Phù hợp từ nguồn thật')).toBeNull()
    expect(screen.getByText('120.000d - 180.000d').props.numberOfLines).toBe(1)
    expect(screen.getByTestId('worker-v5-primary-action')).toBeDisabled()
    expect(screen.queryByTestId('worker-v5-primary-gradient')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-opportunity-card'))

    expect(screen.getByTestId('worker-v5-opportunity-card').props.accessibilityState).toEqual({ selected: true })
    expect(screen.getByTestId('worker-v5-primary-action')).not.toBeDisabled()
    expect(screen.getByTestId('worker-v5-primary-gradient')).toBeOnTheScreen()
  })

  it('accepts an open offer from the unified offer decision screen', async () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = { ns_worker_screen: '2.2-offer-detail' }

    render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-accept-checklist-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-accept-commitment')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-accept-confirm-action'))

    await waitFor(() => {
      expect(mockWorkflowValue.actions.workerAcceptBroadcast).toHaveBeenCalledTimes(1)
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.7-in-progress')
    })
  })

  it('declines an open offer from the same decision screen and returns to the board', async () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = { ns_worker_screen: '2.2-offer-detail' }

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-offer-decline-action'))

    await waitFor(() => {
      expect(mockWorkflowValue.actions.workerDeclineBroadcast).toHaveBeenCalledTimes(1)
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.1-opportunity-inbox')
    })
  })

  it('does not navigate when the server rejects the accept action', async () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockWorkflowValue.actions.workerAcceptBroadcast = jest.fn(async () => false)
    mockRouteParams = { ns_worker_screen: '2.2-offer-detail' }

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-accept-confirm-action'))

    await waitFor(() => {
      expect(mockWorkflowValue.actions.workerAcceptBroadcast).toHaveBeenCalledTimes(1)
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('does not loop a cancelled deal back into the work board', () => {
    buildWorkflow({ deal: buildCancelledDeal() })
    mockRouteParams = {}

    render(<WorkerJobsSurface />)

    expect(screen.queryByTestId('worker-v5-opportunity-card')).toBeNull()
    expect(screen.getByTestId('worker-v5-primary-action')).toBeDisabled()
  })

  it('shows the accepted destination inside the merged travel state', () => {
    const deal = { ...buildAcceptedDeal(), createdAt: '2026-07-10T00:00:00.000Z' }
    buildWorkflow({ deal })
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-route-map-panel')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-info-cell-value-2')).toHaveTextContent(deal.draft.addressLabel)
  })

  it('redirects the retired Route and ETA route into in-progress', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '2.4-route-eta' }

    render(<WorkerJobsSurface />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.7-in-progress')
    })
  })

  it('starts Kael job intake with its empty hero before revealing current workflow context', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }

    render(<WorkerChatSurface />)
    expect(screen.getByTestId('worker-v5-kael-empty-hero-intake')).toBeOnTheScreen()
    expect(screen.queryByText('120.000d - 180.000d')).toBeNull()
    expect(screen.queryByTestId('worker-v5-private-kael-chat-intake')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-orb-composer')).toBeOnTheScreen()

    fireEvent(screen.getByTestId('worker-v5-kael-orb-input'), 'focus')

    expect(screen.queryByTestId('worker-v5-kael-empty-hero-intake')).toBeNull()
    expect(screen.getByText('120.000d - 180.000d')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-open-opportunity'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.7-in-progress')
    })
  })

  it('sends the matched-job intake message through the private worker Kael session', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }

    render(<WorkerChatSurface />)
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Tôi nên chuẩn bị dụng cụ gì?')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    expect(screen.getByTestId('worker-v5-kael-orb-input').props.value).toBe('')
    await waitFor(() => {
      expect(mockWorkerKaelChatService.create).toHaveBeenCalledWith(expect.objectContaining({
        job_id: 'job_test_1',
        language: 'vi',
        mode: 'intake',
      }))
    })
    await waitFor(() => {
      expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledWith(
        'worker-kael-session-1',
        expect.objectContaining({ language: 'vi', media_refs: [], message: 'Tôi nên chuẩn bị dụng cụ gì?' }),
        expect.any(Object),
      )
    })
    expect(await screen.findByText('Kael saved this advisory. Keep the next step inside the app.')).toBeOnTheScreen()
    expect(screen.getByText('Tôi nên chuẩn bị dụng cụ gì?')).toBeOnTheScreen()
  })

  it('ignores an empty Kael orb send without opening a session', () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.streamTurn).not.toHaveBeenCalled()
    expect(screen.queryByTestId('worker-v5-kael-orb-live-thread')).toBeNull()
  })

  it('opens normal Kael chat as a blank unsaved session', () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-kael-orb-transcript')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-normal-thread')).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-orb-live-thread')).toBeNull()
    expect(screen.queryByText('Cuộc trò chuyện mới. Hãy gửi tin nhắn đầu tiên cho Kael.')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-orb-composer')).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
  })

  it('shows the Kael empty hero until the worker focuses or types in normal chat', () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-kael-empty-hero-normal')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-empty-hero-model')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-empty-hero-copy').props.children.length).toBeGreaterThan(20)

    fireEvent(screen.getByTestId('worker-v5-kael-empty-hero-normal'), 'layout', {
      persist: jest.fn(),
      nativeEvent: { layout: { height: 400, width: 320, x: 0, y: 0 } },
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-empty-hero-content').props.style).transform).toEqual([
      { translateY: -60 },
    ])

    const input = screen.getByTestId('worker-v5-kael-orb-input')
    fireEvent(input, 'focus')
    expect(screen.queryByTestId('worker-v5-kael-empty-hero-normal')).toBeNull()

    fireEvent(input, 'blur')
    expect(screen.getByTestId('worker-v5-kael-empty-hero-normal')).toBeOnTheScreen()

    fireEvent.changeText(input, 'Kael, bắt đầu nhé')
    expect(screen.queryByTestId('worker-v5-kael-empty-hero-normal')).toBeNull()
  })

  it('uses a dedicated job-intake empty hero when no real opportunity is present', () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-kael-empty-hero-intake')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-empty-hero-copy').props.children.length).toBeGreaterThan(20)
    expect(screen.queryByTestId('worker-v5-kael-empty-hero-normal')).toBeNull()
  })

  it('returns to normal Kael chat as a fresh blank draft without creating a backend session', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-before-refocus',
          job_id: 'job_test_1',
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T09:30:00.000Z',
          status: 'active',
          title: 'Phiên trước khi quay lại',
          total_turns: 2,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })
    mockWorkerKaelChatService.get.mockResolvedValue({
      data: {
        session: {
          closed_at: null,
          id: 'worker-kael-session-before-refocus',
          job_id: 'job_test_1',
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T09:30:00.000Z',
          status: 'active',
          title: 'Phiên trước khi quay lại',
          total_turns: 2,
          worker_id: 'worker_test_1',
        },
        turns: [{
          content_type: 'guidance',
          created_at: '2026-07-13T09:31:00.000Z',
          id: 'turn-before-refocus',
          media_refs: [],
          role: 'kael',
          safety_notes: [],
          session_id: 'worker-kael-session-before-refocus',
          text_content: 'Nội dung của phiên trước khi quay lại Kael Chat.',
          turn_index: 1,
        }],
      },
      status: 200,
      success: true,
    })

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-before-refocus'))
    expect(await screen.findByText('Nội dung của phiên trước khi quay lại Kael Chat.')).toBeOnTheScreen()
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Bản nháp không được mang sang phiên mới')

    act(() => {
      mockFocusCallback?.()
    })

    expect(screen.queryByText('Nội dung của phiên trước khi quay lại Kael Chat.')).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-orb-live-thread')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-orb-input').props.value).toBe('')
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
  })

  it('keeps a refocused blank draft isolated from an in-flight previous turn', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    let rejectPreviousTurn: ((reason?: unknown) => void) | undefined
    mockWorkerKaelChatService.streamTurn.mockImplementation(() => new Promise((_, reject) => {
      rejectPreviousTurn = reject
    }))

    render(<WorkerChatSurface />)
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Tin nhắn thuộc phiên trước')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByText('Tin nhắn thuộc phiên trước')).toBeOnTheScreen()
    expect(screen.getByText('Kael đang xử lý...')).toBeOnTheScreen()

    act(() => {
      mockFocusCallback?.()
    })

    expect(screen.queryByTestId('worker-v5-kael-orb-live-thread')).toBeNull()
    expect(screen.queryByText('Tin nhắn thuộc phiên trước')).toBeNull()
    expect(screen.queryByText('Kael đang xử lý...')).toBeNull()

    await act(async () => {
      rejectPreviousTurn?.(new Error('previous session failed after refocus'))
      await Promise.resolve()
    })

    expect(screen.queryByTestId('worker-v5-kael-orb-live-thread')).toBeNull()
    expect(screen.queryByText(/Kael đang không kết nối được/)).toBeNull()
    expect(mockWorkerKaelChatService.create).toHaveBeenCalledTimes(1)
  })

  it('answers the normal Kael chat honestly when no active work session exists', async () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Kael giúp tôi chuẩn bị gì?')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    expect(await screen.findByText('Kael giúp tôi chuẩn bị gì?')).toBeOnTheScreen()
    expect(await screen.findByText(/chưa có phiên Kael theo công việc/)).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.streamTurn).not.toHaveBeenCalled()
  })
  it.each([
    ['Chat thường', '3.1-kael-chat-normal'],
    ['Nhận việc', '3.2-kael-job-intake'],
  ])('groups session management and %s mode selection in one header capsule', (modeLabel, workerScreen) => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: workerScreen }

    render(<WorkerChatSurface />)

    const headerActions = screen.getByTestId('worker-v5-kael-header-actions')
    expect(headerActions.findAllByProps({ testID: 'worker-v5-kael-session-toggle' }).length).toBeGreaterThan(0)
    expect(headerActions.findAllByProps({ testID: 'worker-v5-kael-mode-toggle' }).length).toBeGreaterThan(0)
    expect(screen.getByTestId('worker-v5-kael-active-mode')).toHaveTextContent(modeLabel)

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(screen.getByTestId('worker-v5-kael-session-menu')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-v5-kael-mode-toggle'))
    expect(screen.queryByTestId('worker-v5-kael-session-menu')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-mode-menu')).toBeOnTheScreen()
  })

  it('opens the Kael mode menu from the combined header capsule and switches to job intake', async () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)

    expect(screen.getByTestId('worker-v5-kael-active-mode')).toHaveTextContent('Chat thường')
    expect(screen.queryByText('⌄')).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-mode-menu')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-kael-mode-toggle'))

    expect(screen.getByTestId('worker-v5-kael-mode-menu')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-mode-menu-options')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-mode-menu').props.style)).toMatchObject({
      maxWidth: 208,
      width: '59%',
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-mode-menu-intake').props.style)).toMatchObject({
      minHeight: 46,
    })
    expect(screen.getByTestId('worker-v5-kael-mode-toggle').props.accessibilityState).toEqual({ expanded: true })
    expect(screen.getByText('Hỏi đáp và hỗ trợ nhanh')).toBeOnTheScreen()
    expect(screen.getByText('Lọc và chuẩn bị cơ hội phù hợp')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-v5-kael-mode-menu-intake'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/chat?ns_worker_screen=3.2-kael-job-intake')
    })
  })

  it('keeps the Worker visual-audit role while switching Kael modes in Preview', async () => {
    buildWorkflow()
    mockRouteParams = {
      ns_audit_role: 'worker',
      ns_worker_screen: '3.1-kael-chat-normal',
    }

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-mode-toggle'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-mode-menu-intake'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        '/(worker)/chat?ns_worker_screen=3.2-kael-job-intake&ns_audit_role=worker',
      )
    })
  })

  it.each([
    ['normal chat', '3.1-kael-chat-normal', 'normal', 'worker-kael-session-normal', 'worker-kael-session-intake'],
    ['job intake', '3.2-kael-job-intake', 'intake', 'worker-kael-session-intake', 'worker-kael-session-normal'],
  ])('keeps %s session catalog isolated from the other Kael mode', async (
    _label,
    workerScreen,
    expectedMode,
    visibleSessionId,
    hiddenSessionId,
  ) => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: workerScreen }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [
          {
            closed_at: null,
            id: 'worker-kael-session-normal',
            job_id: 'job_test_1',
            mode: 'normal',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T09:00:00.000Z',
            status: 'active',
            title: 'Trò chuyện thường',
            total_turns: 1,
            worker_id: 'worker_test_1',
          },
          {
            closed_at: null,
            id: 'worker-kael-session-intake',
            job_id: 'job_test_1',
            mode: 'intake',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T09:05:00.000Z',
            status: 'active',
            title: 'Trao đổi nhận việc',
            total_turns: 1,
            worker_id: 'worker_test_1',
          },
        ],
      },
      status: 200,
      success: true,
    })

    render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledWith(expectedMode)
    })
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    expect(await screen.findByTestId(`worker-v5-kael-session-${visibleSessionId}`)).toBeOnTheScreen()
    expect(screen.queryByTestId(`worker-v5-kael-session-${hiddenSessionId}`)).toBeNull()
  })

  it('ignores a late catalog response from the previous Kael mode', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    let resolveNormal: ((value: unknown) => void) | undefined
    let resolveIntake: ((value: unknown) => void) | undefined
    mockWorkerKaelChatService.list.mockImplementation((mode: 'normal' | 'intake') => (
      new Promise((resolve) => {
        if (mode === 'normal') resolveNormal = resolve
        else resolveIntake = resolve
      })
    ))

    const { rerender } = render(<WorkerChatSurface />)
    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledWith('normal')
    })

    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }
    rerender(<WorkerChatSurface />)
    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledWith('intake')
    })

    await act(async () => {
      resolveNormal?.({
        data: {
          sessions: [{
            closed_at: null,
            id: 'worker-kael-session-late-normal',
            job_id: 'job_test_1',
            mode: 'normal',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T09:10:00.000Z',
            status: 'active',
            title: 'Phiên thường đến muộn',
            total_turns: 1,
            worker_id: 'worker_test_1',
          }],
        },
        status: 200,
        success: true,
      })
      await Promise.resolve()
    })

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(screen.queryByTestId('worker-v5-kael-session-worker-kael-session-late-normal')).toBeNull()

    await act(async () => {
      resolveIntake?.({
        data: {
          sessions: [{
            closed_at: null,
            id: 'worker-kael-session-current-intake',
            job_id: 'job_test_1',
            mode: 'intake',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T09:11:00.000Z',
            status: 'active',
            title: 'Phiên nhận việc hiện tại',
            total_turns: 1,
            worker_id: 'worker_test_1',
          }],
        },
        status: 200,
        success: true,
      })
      await Promise.resolve()
    })

    expect(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-current-intake')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-session-worker-kael-session-late-normal')).toBeNull()
  })

  it('preloads work-scoped Kael sessions and reuses the same in-flight request when the menu opens', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    let resolveList: ((value: unknown) => void) | undefined
    mockWorkerKaelChatService.list.mockImplementation(() => new Promise((resolve) => {
      resolveList = resolve
    }))

    render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(screen.getByText('Đang tải cuộc trò chuyện...')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveList?.({
        data: {
          sessions: [{
            closed_at: null,
            id: 'worker-kael-session-preloaded',
            job_id: 'job_test_1',
            mode: 'normal',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T08:30:00.000Z',
            status: 'active',
            title: 'Phiên đã tải trước',
            total_turns: 2,
            worker_id: 'worker_test_1',
          }],
        },
        status: 200,
        success: true,
      })
      await Promise.resolve()
    })

    expect(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-preloaded')).toBeOnTheScreen()
    expect(screen.queryByText('Đang tải cuộc trò chuyện...')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(screen.getByTestId('worker-v5-kael-session-worker-kael-session-preloaded')).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
  })

  it('keeps new conversation available while the existing session catalog is still loading', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    const newSession = screen.getByTestId('worker-v5-kael-session-new')
    expect(newSession.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }))
    fireEvent.press(newSession)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.create).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps a newly created intake conversation when Preview uses a visual-audit identity', async () => {
    mockAuthSessionProvider = 'local-visual-audit'
    mockAuthSessionUserId = 'local-visual-audit-worker'
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = {
      ns_audit_role: 'worker',
      ns_worker_screen: '3.2-kael-job-intake',
    }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: { sessions: [] },
      status: 200,
      success: true,
    })

    render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-new'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.create).toHaveBeenCalledWith(expect.objectContaining({
        job_id: 'job_test_1',
        language: 'vi',
        mode: 'intake',
      }))
    })
    await waitFor(() => {
      expect(screen.queryByTestId('worker-v5-kael-session-menu')).toBeNull()
    })

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    expect(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-1')).toBeOnTheScreen()
  })

  it('keeps the empty hero mounted while a new conversation is being created', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    let resolveCreate: ((value: unknown) => void) | undefined
    mockWorkerKaelChatService.create.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))

    render(<WorkerChatSurface />)
    expect(screen.getByTestId('worker-v5-kael-empty-hero-normal')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-new'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.create).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByTestId('worker-v5-kael-empty-hero-normal')).toBeOnTheScreen()

    await act(async () => {
      resolveCreate?.({
        data: {
          session: {
            closed_at: null,
            id: 'worker-kael-session-new-empty',
            job_id: 'job_test_1',
            mode: 'normal',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T10:45:00.000Z',
            status: 'active',
            title: null,
            total_turns: 0,
            worker_id: 'worker_test_1',
          },
          turns: [],
        },
        status: 201,
        success: true,
      })
      await Promise.resolve()
    })

    expect(screen.getByTestId('worker-v5-kael-empty-hero-normal')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-orb-live-thread')).toBeNull()
  })

  it('prefetches the worker session catalog before the active job finishes hydrating', async () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-prefetched-before-job',
          job_id: 'job_test_1',
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T08:40:00.000Z',
          status: 'active',
          title: 'Phiên sẵn sàng trước khi đồng bộ việc',
          total_turns: 3,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })

    const { rerender } = render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })

    buildWorkflow({ deal: buildAcceptedDeal() })
    rerender(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    expect(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-prefetched-before-job')).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
  })

  it('restores real session summaries from device cache while background refresh is pending', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-device-cache',
          job_id: 'job_test_1',
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T08:42:00.000Z',
          status: 'active',
          title: 'Phiên đã lưu trên thiết bị',
          total_turns: 5,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })

    const firstRender = render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-device-cache')).toBeOnTheScreen()

    await waitFor(async () => {
      const keys = await AsyncStorage.getAllKeys()
      expect(keys.some((key) => key.includes('worker.kael_session_catalog'))).toBe(true)
    })
    firstRender.unmount()

    mockWorkerKaelChatService.list.mockImplementation(pendingWorkerKaelServiceCall)
    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    expect(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-device-cache')).toBeOnTheScreen()
    expect(screen.queryByText('Đang tải cuộc trò chuyện...')).toBeNull()
  })

  it('loads Kael sessions when the active job hydrates after the session menu is already open', async () => {
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-hydrated',
          job_id: 'job_test_1',
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T08:45:00.000Z',
          status: 'active',
          title: 'Phiên sau đồng bộ',
          total_turns: 4,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })
    const { rerender } = render(<WorkerChatSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(screen.getByText('Đang tải cuộc trò chuyện...')).toBeOnTheScreen()

    buildWorkflow({ deal: buildAcceptedDeal() })
    rerender(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-hydrated')).toBeOnTheScreen()
    expect(screen.queryByText('Chưa có cuộc trò chuyện cho công việc này.')).toBeNull()
  })

  it('does not show a false empty session state before worker jobs finish hydrating', async () => {
    buildWorkflow({ workerJobsHydrated: false })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: { sessions: [] },
      status: 200,
      success: true,
    })
    const { rerender } = render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    expect(screen.getByText('Đang tải cuộc trò chuyện...')).toBeOnTheScreen()
    expect(screen.queryByText('Chưa có cuộc trò chuyện cho công việc này.')).toBeNull()

    buildWorkflow({ workerJobsHydrated: true })
    rerender(<WorkerChatSurface />)

    expect(await screen.findByText('Chưa có cuộc trò chuyện thường.')).toBeOnTheScreen()
  })

  it('keeps a newly-created Kael session visible when the initial list response arrives later', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    let resolveList: ((value: unknown) => void) | undefined
    mockWorkerKaelChatService.list.mockImplementation(() => new Promise((resolve) => {
      resolveList = resolve
    }))

    render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Chuẩn bị dụng cụ ngay')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))
    await waitFor(() => {
      expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledWith(
        'worker-kael-session-1',
        expect.objectContaining({ message: 'Chuẩn bị dụng cụ ngay' }),
        expect.any(Object),
      )
    })
    expect(await screen.findByText('Kael saved this advisory. Keep the next step inside the app.')).toBeOnTheScreen()

    await act(async () => {
      resolveList?.({ data: { sessions: [] }, status: 200, success: true })
      await Promise.resolve()
    })

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    expect(screen.getByTestId('worker-v5-kael-session-worker-kael-session-1')).toBeOnTheScreen()
    expect(screen.queryByText('Chưa có cuộc trò chuyện cho công việc này.')).toBeNull()
  })

  it('shares the prefetched transcript request when a Kael session is opened immediately', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-shared-load',
          job_id: 'job_test_1',
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T09:00:00.000Z',
          status: 'active',
          title: 'Phiên đang tải',
          total_turns: 2,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })
    let resolveGet: ((value: unknown) => void) | undefined
    const sharedGet = new Promise((resolve) => {
      resolveGet = resolve
    })
    mockWorkerKaelChatService.get.mockReturnValue(sharedGet)

    render(<WorkerChatSurface />)

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
      expect(mockWorkerKaelChatService.get).toHaveBeenCalledTimes(1)
    })
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-shared-load'))

    expect(mockWorkerKaelChatService.get).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveGet?.({
        data: {
          session: {
            closed_at: null,
            id: 'worker-kael-session-shared-load',
            job_id: 'job_test_1',
            mode: 'normal',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T09:00:00.000Z',
            status: 'active',
            title: 'Phiên đang tải',
            total_turns: 2,
            worker_id: 'worker_test_1',
          },
          turns: [{
            content_type: 'guidance',
            created_at: '2026-07-13T09:01:00.000Z',
            id: 'turn-shared-load',
            media_refs: [],
            role: 'kael',
            safety_notes: [],
            session_id: 'worker-kael-session-shared-load',
            text_content: 'Transcript chỉ được tải một lần.',
            turn_index: 1,
          }],
        },
        status: 200,
        success: true,
      })
      await Promise.resolve()
    })

    expect(await screen.findByText('Transcript chỉ được tải một lần.')).toBeOnTheScreen()
  })

  it('opens the real work-scoped Kael session manager without a count and switches complete transcripts', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [
          {
            closed_at: null,
            id: 'worker-kael-session-2',
            job_id: 'job_test_1',
            mode: 'normal',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T07:30:00.000Z',
            status: 'active',
            title: 'Kiểm tra phạm vi lavabo',
            total_turns: 4,
            worker_id: 'worker_test_1',
          },
          {
            closed_at: null,
            id: 'worker-kael-session-1',
            job_id: 'job_test_1',
            mode: 'normal',
            progress: null,
            started_at: '2026-07-13T07:00:00.000Z',
            status: 'active',
            title: 'Chuẩn bị dụng cụ sửa ống',
            total_turns: 2,
            worker_id: 'worker_test_1',
          },
        ],
      },
      status: 200,
      success: true,
    })
    mockWorkerKaelChatService.get.mockImplementation(async (sessionId: string) => ({
      data: {
        session: {
          closed_at: null,
          id: sessionId,
          job_id: 'job_test_1',
          mode: 'normal',
          progress: null,
          started_at: sessionId === 'worker-kael-session-2'
            ? '2026-07-13T07:30:00.000Z'
            : '2026-07-13T07:00:00.000Z',
          status: 'active',
          title: sessionId === 'worker-kael-session-2'
            ? 'Kiểm tra phạm vi lavabo'
            : 'Chuẩn bị dụng cụ sửa ống',
          total_turns: sessionId === 'worker-kael-session-2' ? 4 : 2,
          worker_id: 'worker_test_1',
        },
        turns: [{
          content_type: 'guidance',
          created_at: '2026-07-13T07:31:00.000Z',
          id: `turn-${sessionId}`,
          media_refs: [],
          role: 'kael',
          safety_notes: [],
          session_id: sessionId,
          text_content: sessionId === 'worker-kael-session-2'
            ? 'Hãy kiểm tra phạm vi đã xác nhận trước.'
            : 'Chuẩn bị kìm và khóa nước trước khi thao tác.',
          turn_index: 1,
        }],
      },
      status: 200,
      success: true,
    }))

    render(<WorkerChatSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.list).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(mockWorkerKaelChatService.get).toHaveBeenCalledTimes(2)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('worker-v5-kael-session-menu')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-kael-session-menu-shell').props.style).maxWidth).toBeLessThanOrEqual(224)
    expect(screen.getByText('Cuộc trò chuyện mới')).toBeOnTheScreen()
    expect(screen.queryByText('Phiên Kael')).toBeNull()
    expect(screen.getByText('Kiểm tra phạm vi lavabo')).toBeOnTheScreen()
    expect(screen.queryByText('2')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-session-worker-kael-session-2')).toBeOnTheScreen()

    const prefetchedCalls = mockWorkerKaelChatService.get.mock.calls.length
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-worker-kael-session-2'))

    expect(screen.queryByTestId('worker-v5-kael-session-menu')).toBeNull()
    expect(screen.getByText('Hãy kiểm tra phạm vi đã xác nhận trước.')).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.get).toHaveBeenCalledTimes(prefetchedCalls)
    expect(screen.queryByTestId('worker-v5-kael-normal-thread')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-1'))

    expect(screen.queryByTestId('worker-v5-kael-session-menu')).toBeNull()
    expect(screen.getByText('Chuẩn bị kìm và khóa nước trước khi thao tác.')).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.get).toHaveBeenCalledTimes(prefetchedCalls)
    expect(screen.queryByText('Hãy kiểm tra phạm vi đã xác nhận trước.')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-actions-worker-kael-session-1'))
    const actionMenu = screen.getByTestId('worker-v5-kael-session-action-menu-worker-kael-session-1')
    expect(actionMenu).toBeOnTheScreen()
    expect(StyleSheet.flatten(actionMenu.props.style)).toEqual(expect.objectContaining({
      flexDirection: 'row',
      minHeight: 44,
      width: '100%',
    }))
    expect(screen.getByTestId('worker-v5-kael-session-pin-worker-kael-session-1')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-session-rename-worker-kael-session-1')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-session-delete-worker-kael-session-1')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-delete-worker-kael-session-1'))

    expect(screen.getByTestId('worker-v5-kael-session-delete-confirm-worker-kael-session-1')).toBeOnTheScreen()
    expect(mockWorkerKaelChatService.archive).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-delete-cancel-worker-kael-session-1'))
    expect(screen.queryByTestId('worker-v5-kael-session-delete-confirm-worker-kael-session-1')).toBeNull()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-actions-worker-kael-session-1'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-delete-worker-kael-session-1'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-delete-submit-worker-kael-session-1'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.archive).toHaveBeenCalledWith('worker-kael-session-1')
    })
  })

  it('renames a work-scoped Kael session from its three-dot menu', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-2',
          job_id: 'job_test_1',
          mode: 'normal',
          progress: null,
          started_at: '2026-07-13T07:30:00.000Z',
          status: 'active',
          title: 'Kiểm tra phạm vi lavabo',
          total_turns: 4,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-actions-worker-kael-session-2'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-rename-worker-kael-session-2'))
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-session-title-input'), 'Kiểm tra rò nước lavabo')
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-title-save'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.rename).toHaveBeenCalledWith(
        'worker-kael-session-2',
        { title: 'Kiểm tra rò nước lavabo' },
      )
    })
    expect(await screen.findByText('Kiểm tra rò nước lavabo')).toBeOnTheScreen()
  })

  it('shows a renamed session immediately while the Edge write is still pending', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-2',
          job_id: 'job_test_1',
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T07:30:00.000Z',
          status: 'active',
          title: 'Kiểm tra phạm vi lavabo',
          total_turns: 4,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })
    let resolveRename: ((value: unknown) => void) | undefined
    mockWorkerKaelChatService.rename.mockImplementation(() => new Promise((resolve) => {
      resolveRename = resolve
    }))

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-actions-worker-kael-session-2'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-rename-worker-kael-session-2'))
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-session-title-input'), 'Kiểm tra rò nước mới')
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-title-save'))

    expect(screen.getByText('Kiểm tra rò nước mới')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-kael-session-rename-editor-worker-kael-session-2')).toBeNull()

    await act(async () => {
      resolveRename?.({
        data: {
          session: {
            closed_at: null,
            id: 'worker-kael-session-2',
            job_id: 'job_test_1',
            mode: 'normal',
            pinned_at: null,
            progress: null,
            started_at: '2026-07-13T07:30:00.000Z',
            status: 'active',
            title: 'Kiểm tra rò nước mới',
            total_turns: 4,
            worker_id: 'worker_test_1',
          },
          turns: [],
        },
        status: 200,
        success: true,
      })
      await Promise.resolve()
    })
  })

  it('removes a session from the list immediately while its evidence-preserving delete is pending', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-delete',
          job_id: 'job_test_1',
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T07:30:00.000Z',
          status: 'active',
          title: 'Phiên cần xóa',
          total_turns: 2,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })
    let resolveArchive: ((value: unknown) => void) | undefined
    mockWorkerKaelChatService.archive.mockImplementation(() => new Promise((resolve) => {
      resolveArchive = resolve
    }))

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-actions-worker-kael-session-delete'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-delete-worker-kael-session-delete'))
    expect(screen.getByTestId('worker-v5-kael-session-delete-confirm-worker-kael-session-delete')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-delete-submit-worker-kael-session-delete'))

    expect(screen.queryByTestId('worker-v5-kael-session-worker-kael-session-delete')).toBeNull()
    expect(mockWorkerKaelChatService.archive).toHaveBeenCalledWith('worker-kael-session-delete')

    await act(async () => {
      resolveArchive?.({
        data: {
          archived_at: '2026-07-13T08:00:00.000Z',
          session_id: 'worker-kael-session-delete',
        },
        status: 200,
        success: true,
      })
      await Promise.resolve()
    })
  })

  it('pins and unpins a Kael session from the three-dot menu', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-pin',
          job_id: 'job_test_1',
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T07:30:00.000Z',
          status: 'active',
          title: 'Kiểm tra aptomat',
          total_turns: 2,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-actions-worker-kael-session-pin'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-pin-worker-kael-session-pin'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.setPinned).toHaveBeenCalledWith(
        'worker-kael-session-pin',
        { pinned: true },
      )
    })
    expect(screen.getByTestId('worker-v5-kael-session-pinned-worker-kael-session-pin')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-session-action-menu-worker-kael-session-pin')).toBeOnTheScreen()
    expect(screen.getByText('Bỏ ghim')).toBeOnTheScreen()
    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-kael-session-pin-worker-kael-session-pin').props.accessibilityState).toEqual({ disabled: false })
    })

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-pin-worker-kael-session-pin'))
    await waitFor(() => {
      expect(mockWorkerKaelChatService.setPinned).toHaveBeenLastCalledWith(
        'worker-kael-session-pin',
        { pinned: false },
      )
    })
    expect(screen.queryByTestId('worker-v5-kael-session-pinned-worker-kael-session-pin')).toBeNull()
    expect(screen.getByText('Ghim')).toBeOnTheScreen()
  })

  it('starts a truly empty Kael session and sends its first turn to the new session id', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }
    mockWorkerKaelChatService.list.mockResolvedValue({
      data: {
        sessions: [{
          closed_at: null,
          id: 'worker-kael-session-old',
          job_id: 'job_test_1',
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T07:30:00.000Z',
          status: 'active',
          title: 'Phiên cũ',
          total_turns: 2,
          worker_id: 'worker_test_1',
        }],
      },
      status: 200,
      success: true,
    })
    mockWorkerKaelChatService.get.mockResolvedValue({
      data: {
        session: {
          closed_at: null,
          id: 'worker-kael-session-old',
          job_id: 'job_test_1',
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T07:30:00.000Z',
          status: 'active',
          title: 'Phiên cũ',
          total_turns: 2,
          worker_id: 'worker_test_1',
        },
        turns: [{
          content_type: 'guidance',
          created_at: '2026-07-13T07:31:00.000Z',
          id: 'turn-old',
          media_refs: [],
          role: 'kael',
          safety_notes: [],
          session_id: 'worker-kael-session-old',
          text_content: 'Nội dung chỉ thuộc phiên cũ.',
          turn_index: 1,
        }],
      },
      status: 200,
      success: true,
    })
    mockWorkerKaelChatService.create.mockResolvedValue({
      data: {
        session: {
          closed_at: null,
          id: 'worker-kael-session-new',
          job_id: 'job_test_1',
          mode: 'normal',
          pinned_at: null,
          progress: null,
          started_at: '2026-07-13T08:00:00.000Z',
          status: 'active',
          title: null,
          total_turns: 0,
          worker_id: 'worker_test_1',
        },
        turns: [],
      },
      status: 201,
      success: true,
    })

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-kael-session-new').props.accessibilityState).toEqual({ disabled: false })
    })
    fireEvent.press(await screen.findByTestId('worker-v5-kael-session-worker-kael-session-old'))
    expect(await screen.findByText('Nội dung chỉ thuộc phiên cũ.')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('worker-v5-kael-session-toggle'))
    fireEvent.press(screen.getByTestId('worker-v5-kael-session-new'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.create).toHaveBeenCalledWith(expect.objectContaining({
        job_id: 'job_test_1',
        language: 'vi',
        mode: 'normal',
      }))
    })
    expect(screen.queryByTestId('worker-v5-kael-orb-empty-session')).toBeNull()
    expect(screen.queryByText('Cuộc trò chuyện mới. Hãy gửi tin nhắn đầu tiên cho Kael.')).toBeNull()
    expect(screen.queryByText('Nội dung chỉ thuộc phiên cũ.')).toBeNull()
    expect(screen.queryByTestId('worker-v5-kael-normal-thread')).toBeNull()

    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Tin nhắn đầu tiên của phiên mới')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    await waitFor(() => {
      expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledWith(
        'worker-kael-session-new',
        expect.objectContaining({ message: 'Tin nhắn đầu tiên của phiên mới' }),
        expect.any(Object),
      )
    })
    expect(mockWorkerKaelChatService.create).toHaveBeenCalledTimes(1)
  })

  it('refuses a Kael orb photo attach without an active work session', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    buildWorkflow()
    mockRouteParams = { ns_worker_screen: '3.1-kael-chat-normal' }

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-camera'))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Kael', 'Cần việc đang thực hiện để gửi ảnh cho Kael.')
    })
    const imagePicker = jest.requireMock('expo-image-picker')
    expect(imagePicker.launchImageLibraryAsync).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('opens the unified decision screen from Kael for an incoming opportunity', async () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }

    render(<WorkerChatSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-open-opportunity'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.2-offer-detail')
    })
  })

  it('uses profile readiness actions instead of a fake chat before acceptance', async () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }

    render(<WorkerChatSurface />)
    expect(screen.queryByTestId('worker-v5-kael-orb-composer')).toBeNull()
    expect(screen.queryByTestId('worker-kael-chat-input')).toBeNull()
    fireEvent.press(screen.getByTestId('worker-v5-kael-optimize-profile'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/profile?ns_worker_screen=5.3-skills-service-area')
    })
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
  })

  it('opens Kael job intake from the work board without losing the current opportunity', async () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = {}

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-opportunity-kael-action'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/chat?ns_worker_screen=3.2-kael-job-intake')
    })
  })

  it('retires map and schedule deep links from the mandatory jobs workflow', () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = { ns_worker_screen: '1.4-smart-schedule' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-screen-2.1-opportunity-inbox')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-schedule-support-aura-group')).toBeNull()
  })

  it('uses the approved circular seal for a completion submission awaiting customer confirmation', () => {
    buildWorkflow({ deal: buildCompletedByWorkerDeal() })
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-completion-submitted-seal')).toHaveStyle({ borderRadius: 46, height: 92, width: 92 })
    expect(screen.getByTestId('worker-v5-completion-submitted-title')).toHaveTextContent('Đã gửi hồ sơ')
    expect(screen.getByTestId('worker-v5-completion-submitted-status')).toHaveTextContent('Đang chờ khách xác nhận')
    expect(screen.getByTestId('worker-v5-completion-submitted-status-waiting-dots').children).toHaveLength(3)
  })

  it('runs the pending confirmation dots only until the customer confirms, then uses the rebuilt settlement seal', () => {
    buildWorkflow({ deal: buildCompletedByWorkerDeal() })
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }

    const submitted = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-completion-submitted-status-waiting-dots')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-completion-submitted-status-static-dots')).toBeNull()
    submitted.unmount()

    buildWorkflow({ deal: buildConfirmedCompletionDeal() })
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }
    const confirmed = render(<WorkerJobsSurface />)
    expect(screen.queryByTestId('worker-v5-completion-submitted-status-waiting-dots')).toBeNull()
    expect(screen.getByTestId('worker-v5-completion-submitted-status-static-dots')).toBeOnTheScreen()
    confirmed.unmount()

    mockRouteParams = { ns_worker_screen: '2.12-case-closed' }
    render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-case-closed-settlement-seal')).toHaveStyle({ borderRadius: 46, height: 92, width: 92 })
    expect(screen.getByTestId('worker-v5-case-closed-settlement-status')).toHaveTextContent('Chờ đối soát')
  })

  it('removes the requested home, jobs, earnings, and settings header utilities', () => {
    buildWorkflow()

    const home = render(<WorkerHomeSurface />)
    expect(screen.getByTestId('worker-v5-home-header').children).toHaveLength(1)
    expect(screen.getByText('Chào buổi sáng, Worker Test!')).toHaveStyle({ fontWeight: '700' })
    expect(screen.queryByTestId('worker-v5-home-notifications')).toBeNull()
    home.unmount()

    mockRouteParams = {}
    const jobs = render(<WorkerJobsSurface />)
    expect(screen.queryByTestId('worker-v5-opportunity-header-icon')).toBeNull()
    expect(screen.queryByTestId('worker-v5-opportunity-filter')).toBeNull()
    jobs.unmount()

    const earnings = render(<WorkerEarningsSurface />)
    expect(screen.queryByTestId('worker-v5-opportunity-header-icon')).toBeNull()
    expect(screen.queryByTestId('worker-v5-earnings-filter')).toBeNull()
    earnings.unmount()

    mockRouteParams = { ns_worker_screen: '5.10-support-settings' }
    const settings = render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-header-icon-5.10-support-settings')).toBeNull()
    expect(screen.getByTestId('worker-v5-settings-screen')).toBeOnTheScreen()
    settings.unmount()
  })

  it('gives the earnings overview title a small left inset', () => {
    buildWorkflow()

    render(<WorkerEarningsSurface />)

    expect(screen.getByTestId('worker-v5-earnings-overview-title')).toHaveStyle({ marginLeft: 8 })
  })

  it('removes every Worker header info icon without removing the primary navigation', () => {
    buildWorkflow()

    const profileOverview = render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-profile-info-header-icon-5.1-profile-overview')).toBeNull()
    profileOverview.unmount()

    mockRouteParams = { ns_worker_screen: '5.2-worker-ranking' }
    const ranking = render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-profile-info-header-icon-5.2-worker-ranking')).toBeNull()
    ranking.unmount()

    mockRouteParams = { ns_worker_screen: '5.3-skills-service-area' }
    const skills = render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-profile-info-header-icon-5.3-skills-service-area')).toBeNull()
    skills.unmount()

    mockRouteParams = { ns_worker_screen: '5.4-reliability-insights' }
    const reliability = render(<WorkerProfileSurface />)
    expect(screen.queryByTestId('worker-v5-profile-info-header-icon-5.4-reliability-insights')).toBeNull()
    reliability.unmount()

    buildWorkflow({ canWorkerAdvance: true, deal: buildRepairingDeal() })
    mockRouteParams = { tab: 'active' }
    render(<WorkerJobsSurface />)
    expect(screen.queryByTestId('worker-v5-case-flow-info')).toBeNull()
    expect(screen.getByTestId('worker-v5-in-progress-scope-action')).toBeOnTheScreen()
  })

  it('routes the public worker wrapper to the restored Worker V5 sections', () => {
    buildWorkflow()

    const home = render(<WorkerHomeSurface />)
    expect(screen.getByTestId('worker-v5-screen-1.1-worker-home')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-page-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-availability-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-home-command-center')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-home-scroll')).toBeNull()
    home.unmount()

    mockRouteParams = {}
    const jobs = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-screen-2.1-opportunity-inbox')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-opportunity-page-customer-mint-aura')).toBeOnTheScreen()
    jobs.unmount()

    const chat = render(<WorkerChatSurface />)
    expect(screen.getByTestId('worker-v5-screen-3.1-kael-chat-normal')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-background-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-chat-screen-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-kael-orb-normal')).toBeOnTheScreen()
    chat.unmount()

    const earnings = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-screen-4.1-earnings-overview')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-hero')).toBeOnTheScreen()
    earnings.unmount()

    const profile = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-screen-5.1-profile-overview')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-avatar-picker')).toBeOnTheScreen()
    profile.unmount()
  })

  it('keeps the profile hero compact with a real lifetime bar and no mock status chips', async () => {
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        active_minutes: 90,
        avatar_url: 'https://storage.example.test/signed/worker-avatar.jpg',
        last_active_at: '2026-07-13T14:30:00.000Z',
      }),
    })

    render(<WorkerProfileSurface />)

    expect(screen.getByTestId('worker-v5-profile-header-name')).toHaveTextContent('Worker Test')
    expect(screen.getByTestId('worker-v5-profile-lifetime-progress-label').props.children).toBe('Thời gian hoạt động')
    expect(screen.getByTestId('worker-v5-profile-lifetime-progress').props.accessibilityLabel).toBe('Thời gian hoạt động')
    expect(screen.getByTestId('worker-v5-profile-lifetime-progress')).toHaveAccessibilityValue({
      text: 'Thời gian hoạt động trên NestScout: 1 giờ 30 phút / 10.000 giờ',
    })
    expect(screen.getByTestId('worker-v5-profile-lifetime-progress').props.accessibilityValue).toMatchObject({
      max: 600000,
      min: 0,
      now: 90,
    })
    expect(screen.getByTestId('worker-v5-profile-avatar-image').props.source).toEqual({
      uri: 'https://storage.example.test/signed/worker-avatar.jpg',
    })
    expect(screen.queryByText('Đã duyệt')).toBeNull()
    expect(screen.queryByText('Chưa có đánh giá')).toBeNull()
    expect(screen.queryByText('Chưa có việc')).toBeNull()
    expect(screen.queryByText('Sẵn sàng nhận việc')).toBeNull()
  })

  it('lets the worker choose a real avatar from camera or photo library', async () => {
    buildWorkflow()
    const imagePicker = jest.requireMock('expo-image-picker')
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{
        fileName: 'worker.jpg',
        fileSize: 1234,
        mimeType: 'image/jpeg',
        uri: 'file:///worker.jpg',
      }],
    })
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const library = buttons?.find((button) => button.text === 'Chọn từ thư viện')
      void library?.onPress?.()
    })

    render(<WorkerProfileSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-profile-avatar-picker'))

    await waitFor(() => {
      expect(mockWorkerUploadAvatar).toHaveBeenCalledWith({
        fileName: 'worker.jpg',
        fileSizeBytes: 1234,
        mimeType: 'image/jpeg',
        uri: 'file:///worker.jpg',
      })
    })
    expect(imagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1)
    expect(alertSpy).toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('opens the real image library directly from the avatar button in web Preview', async () => {
    const originalPlatform = Platform.OS
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' })
    const alertSpy = jest.spyOn(Alert, 'alert')

    try {
      buildWorkflow()
      const imagePicker = jest.requireMock('expo-image-picker')
      imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: [] })

      render(<WorkerProfileSurface />)
      fireEvent.press(screen.getByTestId('worker-v5-profile-avatar-picker'))

      await waitFor(() => {
        expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1)
      })
      expect(imagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled()
      expect(alertSpy).not.toHaveBeenCalled()
    } finally {
      alertSpy.mockRestore()
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform })
    }
  })

  it('keeps Worker V5 route params, language params, and money-impacting screens explicit', () => {
    buildWorkflow({ canWorkerAdvance: true, deal: buildRepairingDeal() })
    mockRouteParams = { ns_worker_lang: 'en' }

    const home = render(<WorkerHomeSurface />)
    expect(screen.getByTestId('worker-v5-availability-switch').props.accessibilityLabel).toBe('Toggle work availability')
    home.unmount()

    mockRouteParams = { tab: 'active' }

    const active = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-screen-2.7-in-progress')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-scope-action')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-final-price-input')).toBeNull()
    active.unmount()

    mockRouteParams = { ns_audit_surface: 'worker_scope_change' }
    const scope = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-screen-2.8-scope-change')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-scope-change-hero')).toBeNull()
    expect(screen.getByTestId('worker-v5-scope-change-send-action')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-final-price-input')).toBeNull()
    scope.unmount()

    mockRouteParams = { ns_payment_step: 'wallet' }
    const ledger = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-screen-4.2-ledger-detail')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ledger-breakdown')).toBeOnTheScreen()
    ledger.unmount()
  })

  it('keeps final-work handoffs on the dock section owned by their target screen', () => {
    expect(resolveWorkerV5DockActive('/jobs', { ns_worker_screen: '4.2-ledger-detail' })).toBe('earnings')
    expect(resolveWorkerV5DockActive('/jobs', { ns_worker_screen: '5.2-worker-ranking' })).toBe('profile')
    expect(resolveWorkerV5DockActive('/jobs', {})).toBe('jobs')
  })

  it('moves the dock pill to earnings when a closed-case handoff retains the prior jobs tab', () => {
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }

    render(<WorkerRebuildDockOverlay active="jobs" />)

    expect(screen.getByTestId('worker-v5-dock-earnings').props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByTestId('worker-v5-dock-jobs').props.accessibilityState).toMatchObject({ selected: false })
  })

  it('uses the dedicated recent-transaction icon instead of the reused wallet in the earnings empty state', () => {
    buildWorkflow({ workerEarnings: buildNoEarnings() })
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }

    render(<WorkerEarningsSurface />)

    const emptyTransactionIcon = screen.getByTestId('worker-v5-earnings-empty-transaction-icon-image')
    expect(emptyTransactionIcon.props.source).toBe(require('@/assets/worker-image-icons/utility-recent-transactions-sync-core.png'))
    expect(emptyTransactionIcon.props.source).not.toBe(require('@/assets/worker-image-icons/utility-wallet.png'))
  })

  it('uses net earnings copy and one full-width payout action in ledger detail', () => {
    buildWorkflow({ workerEarnings: buildSettledEarnings() })
    mockRouteParams = { ns_worker_screen: '4.2-ledger-detail' }

    render(<WorkerEarningsSurface />)

    expect(screen.getAllByText('Thu nhập ròng')).toHaveLength(3)
    expect(screen.getByTestId('worker-v5-ledger-payout-action')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-ledger-back-earnings-action')).toBeNull()
  })

  it('keeps every captured Worker card icon distinct from the other captured card contexts', () => {
    const sources = Object.values(workerV5CapturedIconAssets)

    expect(sources).toHaveLength(36)
    expect(new Set(sources).size).toBe(sources.length)
  })

  it('wires contextual icon assets into the profile dossier and earnings empty state', () => {
    buildWorkflow({ workerEarnings: buildNoEarnings() })
    mockRouteParams = {}

    const profile = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-profile-dossier-icon-0-image').props.source).toBe(workerV5CapturedIconAssets.profileDossierServices)
    expect(screen.getByTestId('worker-v5-profile-dossier-icon-1-image').props.source).toBe(workerV5CapturedIconAssets.profileDossierReliability)
    expect(screen.getByTestId('worker-v5-profile-dossier-icon-2-image').props.source).toBe(workerV5CapturedIconAssets.profileDossierSettings)
    profile.unmount()

    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }
    render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-earnings-hero-icon-image').props.source).toBe(workerV5CapturedIconAssets.earningsHero)
    expect(screen.getByTestId('worker-v5-earnings-empty-transaction-icon-image').props.source).toBe(workerV5CapturedIconAssets.earningsRecentTransactions)
  })

  it('keeps dossier visual panels aligned while giving every dossier card a contextual detail rail', () => {
    buildWorkflow({
      workerProfile: buildWorkerProfile({
        service_types: ['plumbing', 'electrical', 'cleaning'],
      }),
    })
    mockRouteParams = {}

    render(<WorkerProfileSurface />)

    const dossierIcons = [0, 1, 2].map((index) => screen.getByTestId(`worker-v5-profile-dossier-icon-${index}`))
    dossierIcons.forEach((icon) => {
      expect(icon.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: 94 })]))
    })
    ;[1, 2].forEach((index) => {
      expect(StyleSheet.flatten(screen.getByTestId(`worker-v5-profile-dossier-copy-${index}`).props.style)).toMatchObject({
        justifyContent: 'center',
      })
    })
    expect(screen.getByTestId('worker-v5-profile-dossier-meta-0')).toBeOnTheScreen()
    expect(screen.getByText('Sửa nước')).toBeOnTheScreen()
    expect(screen.getByText('Sửa điện')).toBeOnTheScreen()
    expect(screen.getByText('Vệ sinh')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-profile-dossier-detail-1')).toHaveTextContent(/Chờ dữ liệu thật/)
    expect(screen.getByTestId('worker-v5-profile-dossier-detail-1')).toHaveTextContent(/Sau công việc/)
    expect(screen.getByTestId('worker-v5-profile-dossier-detail-2')).toHaveTextContent(/Tài khoản/)
    expect(screen.getByTestId('worker-v5-profile-dossier-detail-2')).toHaveTextContent(/Bảo mật/)
    expect(screen.getByTestId('worker-v5-profile-dossier-detail-2')).toHaveTextContent(/Bộ nhớ Kael/)
  })

  it('applies the 1.4 Formula Mint Aura to every rounded card in the 14 captured Worker groups', () => {
    expect(WORKER_V5_FORMULA_MINT_CARD_AURA_INTENSITY).toBe(1.4)

    buildWorkflow({ deal: buildIncomingDeal(), workerEarnings: buildNoEarnings() })
    mockRouteParams = {}

    const home = render(<WorkerHomeSurface />)
    ;[0, 1, 2, 3].forEach((index) => {
      expect(screen.getByTestId(`worker-v5-home-quick-action-formula-mint-aura-${index}`)).toBeOnTheScreen()
    })
    home.unmount()

    const profile = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-profile-dossier-formula-mint-aura')).toBeOnTheScreen()
    profile.unmount()

    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }
    const earnings = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-earnings-hero-formula-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-earnings-transactions-formula-mint-aura')).toBeOnTheScreen()
    earnings.unmount()

    mockRouteParams = { ns_worker_screen: '4.3-payout-request' }
    const payoutRequest = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-payout-account-formula-mint-aura')).toBeOnTheScreen()
    payoutRequest.unmount()

    mockRouteParams = { ns_worker_screen: '4.4-payout-method' }
    const payoutMethod = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-payout-method-hero-formula-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-account-management-formula-mint-aura')).toBeOnTheScreen()
    payoutMethod.unmount()

    mockRouteParams = {}
    const opportunity = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-opportunity-card-formula-mint-aura-job_test_1')).toBeOnTheScreen()
    opportunity.unmount()

    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    const activeRoute = render(<WorkerJobsSurface />)
    ;[0, 1, 2].forEach((index) => {
      expect(screen.getByTestId(`worker-v5-info-cell-ActiveRoute-formula-mint-aura-${index}`)).toBeOnTheScreen()
    })
    activeRoute.unmount()

    buildWorkflow({ deal: buildRepairingDeal() })
    mockRouteParams = { ns_audit_surface: 'worker_scope_change' }
    const scopeChange = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-progress-rail-formula-mint-aura')).toBeOnTheScreen()
    scopeChange.unmount()

    buildWorkflow({ deal: buildCompletedByWorkerDeal() })
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }
    const submitted = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-completion-submitted-mint-aura')).toBeOnTheScreen()
    submitted.unmount()

    buildWorkflow({ deal: buildConfirmedCompletionDeal() })
    mockRouteParams = { ns_worker_screen: '2.12-case-closed' }
    render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-case-closed-mint-aura')).toBeOnTheScreen()
    ;[0, 1, 2].forEach((index) => {
      expect(screen.getByTestId(`worker-v5-info-cell-CaseClosed-formula-mint-aura-${index}`)).toBeOnTheScreen()
    })
    expect(screen.getByTestId('worker-v5-case-trail-formula-mint-aura')).toBeOnTheScreen()
  })

  it('keeps the Formula Mint card identity with an opaque Reduce Transparency fallback', () => {
    render(
      <WorkerV5FormulaMintCardAura
        reduceTransparency
        scope="ReduceTransparencyProbe"
        testID="worker-v5-formula-mint-card-reduce-transparency"
      />,
    )

    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-formula-mint-card-reduce-transparency').props.style)).toMatchObject({
      backgroundColor: '#EFFAF7',
    })
  })

  it('renders contextual detail rails across all 17 captured Worker card clusters', () => {
    buildWorkflow({ deal: buildIncomingDeal() })
    mockRouteParams = {}

    const home = render(<WorkerHomeSurface />)
    expect(screen.getByTestId('worker-v5-home-quick-action-detail-0')).toHaveTextContent(/Cơ hội thật/)
    home.unmount()

    const jobs = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-opportunity-detail')).toHaveTextContent(/Ngay/)
    jobs.unmount()

    buildWorkflow({ workerEarnings: buildNoEarnings() })
    mockRouteParams = { ns_worker_screen: '4.1-earnings-overview' }
    const earnings = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-earnings-hero-detail')).toHaveTextContent(/Chờ đối soát/)
    expect(screen.getByTestId('worker-v5-earnings-empty-transaction-detail')).toHaveTextContent(/Sổ đối soát thật/)
    earnings.unmount()

    mockRouteParams = { ns_worker_screen: '4.3-payout-request' }
    const payout = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-payout-account-icon-image').props.source).toBe(require('@/assets/worker-image-icons/utility-identity.png'))
    expect(screen.getByTestId('worker-v5-payout-account-detail')).toHaveTextContent(/Cần xác minh/)
    expect(screen.getByTestId('worker-v5-payout-account-formula-mint-aura')).toBeOnTheScreen()
    payout.unmount()

    mockRouteParams = { ns_worker_screen: '4.4-payout-method' }
    const payoutMethod = render(<WorkerEarningsSurface />)
    expect(screen.getByTestId('worker-v5-payout-method-hero-icon-image').props.source).toBe(require('@/assets/worker-image-icons/payout-receiving-account-core.png'))
    expect(screen.getByTestId('worker-v5-payout-method-hero-detail')).toHaveTextContent(/Chủ tài khoản/)
    expect(screen.getByTestId('worker-v5-payout-method-hero-detail')).toHaveTextContent(/Cần xác minh/)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-payout-method-status').props.style)).toMatchObject({
      alignSelf: 'center',
      minWidth: 64,
      paddingVertical: 7,
    })
    expect(screen.getByTestId('worker-v5-payout-method-hero-formula-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-account-management-icon-0-image').props.source).toBe(require('@/assets/worker-image-icons/payout-add-bank-account-core.png'))
    expect(screen.getByTestId('worker-v5-account-management-icon-1-image').props.source).toBe(require('@/assets/worker-image-icons/payout-limit-policy-core.png'))
    expect(screen.getByTestId('worker-v5-account-management-detail-0')).toHaveTextContent(/Chủ tài khoản/)
    expect(screen.getByTestId('worker-v5-account-management-detail-0')).toHaveTextContent(/Cần xác minh/)
    expect(screen.getByTestId('worker-v5-account-management-detail-1')).toHaveTextContent(/Theo hệ thống/)
    expect(screen.getByTestId('worker-v5-account-management-detail-1')).toHaveTextContent(/Không mức cố định/)
    expect(screen.getByTestId('worker-v5-account-management-formula-mint-aura')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-account-management-row-0'))
    expect(screen.getByTestId('worker-v5-bank-account-form')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-account-management-row-1'))
    expect(screen.getByTestId('worker-v5-payout-limit-policy')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-bank-account-form')).toBeNull()
    payoutMethod.unmount()

    buildWorkflow({ deal: buildConfirmedCompletionDeal() })
    mockRouteParams = { ns_worker_screen: '2.12-case-closed' }
    const closedCase = render(<WorkerJobsSurface />)
    expect(screen.getByTestId('worker-v5-case-trail-detail-0')).toHaveTextContent(/Bằng chứng thật/)
    closedCase.unmount()

    buildWorkflow({
      workerProfile: buildWorkerProfile({
        districts: ['quan_1', 'quan_binh_thanh'],
        service_types: ['plumbing', 'electrical', 'cleaning'],
      }),
    })
    mockRouteParams = {}
    const profile = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-profile-dossier-detail-1')).toBeOnTheScreen()
    profile.unmount()

    mockRouteParams = { ns_worker_screen: '5.3-skills-service-area' }
    const skills = render(<WorkerProfileSurface />)
    expect(screen.queryByText('Chỉ hiển thị dữ liệu sử dụng trực tiếp trong workflow.')).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-skills-hero-copy').props.style)).toMatchObject({ justifyContent: 'center' })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-skills-service-count').props.style)).toMatchObject({ fontSize: 26 })
    expect(StyleSheet.flatten(screen.getByText('3 dịch vụ').props.style)).toMatchObject({ fontSize: 11 })
    expect(screen.getByTestId('worker-v5-skills-hero-detail')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-service-card-detail-0').props.style)).toMatchObject({
      alignItems: 'flex-start',
      flexDirection: 'column',
    })
    expect(screen.getByTestId('worker-v5-service-area-detail')).toBeOnTheScreen()
    skills.unmount()

    mockRouteParams = { ns_worker_screen: '5.4-reliability-insights' }
    const reliability = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-reliability-axis-detail-0')).toBeOnTheScreen()
    reliability.unmount()

    mockRouteParams = { ns_worker_screen: '5.5-account-utilities' }
    const settings = render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-settings-hero-detail')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-settings-account-detail')).toBeOnTheScreen()
    settings.unmount()

    mockRouteParams = { ns_worker_screen: '5.2-worker-ranking' }
    render(<WorkerProfileSurface />)
    expect(screen.getByTestId('worker-v5-ranking-leaderboard-detail')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ranking-improvement-detail-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-ranking-improvement-title-3')).toHaveTextContent('Phản hồi trong công việc')
    expect(screen.getByTestId('worker-v5-ranking-improvement-title-4')).toHaveTextContent('Xử lý phát sinh minh bạch')
    expect(screen.getByTestId('worker-v5-ranking-improvement-meta-3')).toHaveTextContent('Chờ khách đánh giá sau khi công việc hoàn tất')
    expect(screen.getByTestId('worker-v5-ranking-improvement-meta-4')).toHaveTextContent('Mỗi phát sinh chỉ tính khi Kael và khách đã chốt')
  })
})
