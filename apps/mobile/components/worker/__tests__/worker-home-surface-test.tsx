import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert, StyleSheet } from 'react-native'
import type { LocalDeal } from '@nestscout/shared'
import { LOCAL_WORKFLOW_PRICE_DISCLAIMER } from '@nestscout/shared'
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
const mockPlacesAutocomplete = jest.fn()
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

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getCurrentPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(() => new Promise(() => undefined)),
  watchPositionAsync: jest.fn(),
}), { virtual: true })

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
  placesService: {
    autocomplete: (...args: unknown[]) => mockPlacesAutocomplete(...args),
  },
  workerRouteService: {
    getMapImage: jest.fn(),
    getPreview: jest.fn(),
  },
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
import { workerV5CapturedIconAssets } from '../ui/worker-v5-icon-assets'
import { WorkerV5DetailRail } from '../ui/worker-v5-detail-rail'

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
  mockWorkflowValue = {
    actions: {
      openKaelJobIncident: jest.fn(async () => ({ incident: null })),
      proposeScopeChangeFromKaelIncident: jest.fn(async () => true),
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
    workerJobs,
    workerJobsHydrated,
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
    fireEvent.press(screen.getByTestId('worker-v5-availability-switch'))

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
      expect(screen.getByTestId('worker-v5-availability-title')).toHaveTextContent('Đã bật cho công việc tiếp theo')
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

  it('keeps Kael job intake connected to the current workflow state', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }

    render(<WorkerChatSurface />)
    expect(screen.getByText('120.000d - 180.000d')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-private-kael-chat-intake')).toBeNull()
    expect(screen.getByTestId('worker-v5-kael-orb-composer')).toBeOnTheScreen()
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
    expect(screen.getByTestId('worker-v5-profile-avatar-image')).toBeOnTheScreen()
    profile.unmount()
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
    expect(screen.queryByTestId('worker-v5-payout-account-mint-aura')).toBeNull()
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
    expect(screen.queryByTestId('worker-v5-payout-method-mint-aura')).toBeNull()
    expect(screen.getByTestId('worker-v5-account-management-icon-0-image').props.source).toBe(require('@/assets/worker-image-icons/payout-add-bank-account-core.png'))
    expect(screen.getByTestId('worker-v5-account-management-icon-1-image').props.source).toBe(require('@/assets/worker-image-icons/payout-limit-policy-core.png'))
    expect(screen.getByTestId('worker-v5-account-management-detail-0')).toHaveTextContent(/Chủ tài khoản/)
    expect(screen.getByTestId('worker-v5-account-management-detail-0')).toHaveTextContent(/Cần xác minh/)
    expect(screen.getByTestId('worker-v5-account-management-detail-1')).toHaveTextContent(/Theo hệ thống/)
    expect(screen.getByTestId('worker-v5-account-management-detail-1')).toHaveTextContent(/Không mức cố định/)
    expect(screen.queryByTestId('worker-v5-account-management-mint-aura')).toBeNull()
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
