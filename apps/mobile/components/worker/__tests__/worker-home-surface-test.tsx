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
import { WorkerV5ScheduleList } from '../jobs/surfaces'

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

  it('keeps the standard Kael composer on job intake after a worker is matched', async () => {
    buildWorkflow({ deal: buildAcceptedDeal() })
    mockRouteParams = { ns_worker_screen: '3.2-kael-job-intake' }

    render(<WorkerChatSurface />)
    fireEvent.changeText(screen.getByTestId('worker-v5-kael-orb-input'), 'Tôi nên chuẩn bị dụng cụ gì?')
    fireEvent.press(screen.getByTestId('worker-v5-kael-orb-send'))

    expect(screen.getByTestId('worker-v5-kael-orb-input').props.value).toBe('')
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
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

  it('uses net earnings copy and one full-width payout action in ledger detail', () => {
    buildWorkflow({ workerEarnings: buildSettledEarnings() })
    mockRouteParams = { ns_worker_screen: '4.2-ledger-detail' }

    render(<WorkerEarningsSurface />)

    expect(screen.getAllByText('Thu nhập ròng')).toHaveLength(3)
    expect(screen.getByTestId('worker-v5-ledger-payout-action')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-ledger-back-earnings-action')).toBeNull()
  })
})
