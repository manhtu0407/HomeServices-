import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { LocalDeal } from '@nestscout/shared'

import type { EarningsResponse, WorkerProfileResponse } from '@/lib/api-types'
import { Alert, Platform } from 'react-native'

let mockWorkflowValue: any
let mockPathname: string
let mockRouteParams: Record<string, string | string[] | undefined>
const mockReplace = jest.fn()
const mockUseJobChatThread = jest.fn()
const pendingWorkerKaelServiceCall = () => new Promise<never>(() => undefined)
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
const mockWorkerRouteService = {
  getMapImage: jest.fn(),
  getPreview: jest.fn(),
}
const mockGetMobileApiAuthHeaders = jest.fn()

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
  getCameraPermissionsAsync: jest.fn(async () => ({ canAskAgain: true, granted: false })),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
}))

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getCurrentPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
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

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api')
  return {
    ...actual,
    getMobileApiAuthHeaders: (...args: unknown[]) => mockGetMobileApiAuthHeaders(...args),
  }
})

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({ role: 'worker', session: { user: { id: 'worker_test_1' } }, signOut: jest.fn(async () => undefined) }),
}))

jest.mock('@/lib/use-job-chat-thread', () => ({
  useJobChatThread: (jobId: string | null, enabled: boolean) => mockUseJobChatThread(jobId, enabled),
}))

jest.mock('@/lib/media-upload', () => ({
  uploadJobMediaDrafts: jest.fn(),
  uploadWorkerVerificationDrafts: jest.fn(),
}))

jest.mock('@/lib/services', () => ({
  placesService: {
    autocomplete: jest.fn(async () => ({ data: { fallback_used: false, suggestions: [] }, success: true })),
    resolve: jest.fn(async () => ({ data: { fallback_used: true, location: null, provider: 'fallback' }, success: true })),
  },
  workerRouteService: {
    getMapImage: (...args: unknown[]) => mockWorkerRouteService.getMapImage(...args),
    getPreview: (...args: unknown[]) => mockWorkerRouteService.getPreview(...args),
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
    useAppLanguage: () => 'vi',
  }
})

import { WorkerJobsSurface, WorkerProfileSurface } from '../worker-surfaces'

const imagePicker = require('expo-image-picker') as {
  getCameraPermissionsAsync: jest.Mock
  launchCameraAsync: jest.Mock
  launchImageLibraryAsync: jest.Mock
  requestCameraPermissionsAsync: jest.Mock
  requestMediaLibraryPermissionsAsync: jest.Mock
}
const mediaUpload = require('@/lib/media-upload') as {
  uploadJobMediaDrafts: jest.Mock
}
const location = require('expo-location') as {
  getCurrentPositionAsync: jest.Mock
  requestForegroundPermissionsAsync: jest.Mock
  watchPositionAsync: jest.Mock
}

function buildWorkerProfile(): WorkerProfileResponse {
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
    is_available: true,
    is_suspended: false,
    last_active_at: null,
    legal_name: 'Worker Test',
    problem_specializations: [],
    rating: 4.8,
    service_radius_km: 8,
    service_types: ['electrical'],
    total_jobs: 12,
    verification_status: 'approved',
    years_experience: 3,
  }
}

function buildOnWayDeal(): LocalDeal {
  return {
    backendStatus: 'worker_on_way',
    broadcast: {
      broadcastId: 'broadcast_test_1',
      estimatedEarningLabel: '120.000d - 180.000d',
      estimatedPriceLabel: '180.000d - 260.000d',
      fullAddressLabel: 'Tòa A, Qu?n 1',
      fullAddressVisible: true,
      generalArea: 'Qu?n 1',
      jobId: 'job_test_1',
      prebrief: ['Kael dã tóm t?t ph?m vi.'],
      problemSummary: '? c?m ch?p ch?n',
      secondsRemaining: null,
      serviceType: 'electrical',
      status: 'accepted',
    },
    completionNotes: null,
    completionPhotoUrls: [],
    draft: {
      addressLabel: 'Tòa A, Qu?n 1',
      description: '? c?m phòng khách ch?p ch?n',
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
    status: 'worker_on_way',
  }
}

function buildMatchedDeal(): LocalDeal {
  return {
    ...buildOnWayDeal(),
    backendStatus: 'worker_matched',
    status: 'worker_matched',
  }
}

function buildInProgressDeal(): LocalDeal {
  return {
    ...buildOnWayDeal(),
    backendStatus: 'arrived',
    status: 'arrived',
  }
}

function buildScopePendingDeal(): LocalDeal {
  return {
    ...buildInProgressDeal(),
    backendStatus: 'scope_change_pending',
    scopeChange: {
      id: 'scope-change-pending',
      status: 'waiting_customer_decision',
      requestedDescription: 'Thay đoạn dây bị cháy tại ổ cắm phòng khách.',
      reason: 'Dây bên trong đã quá nhiệt và không còn an toàn để tiếp tục.',
      priceMin: 300000,
      priceMax: 300000,
      kaelReview: null,
      kaelProgress: {
        current_stage: 'customer_decision',
        status: 'completed',
        progress: 1,
        updated_at: '2026-08-13T13:06:00.000Z',
      },
      evidencePhotoUrls: ['https://storage.example.test/scope-evidence.jpg'],
      requestTiming: 'on_site',
      resumeJobStatus: 'inspecting',
      createdAt: '2026-08-13T13:00:00.000Z',
    },
  }
}

function buildWorkflow(deal: LocalDeal) {
  mockWorkflowValue = {
    actions: {
      openKaelJobIncident: jest.fn(async () => ({
        incident: {
          id: 'incident-1',
          job_id: deal.id,
          status: 'awaiting_customer',
          evidence_status: 'needs_more',
          last_summary: null,
          last_question: null,
          last_next_actor: 'customer',
          created_at: '2026-07-12T00:00:00.000Z',
          updated_at: '2026-07-12T00:00:00.000Z',
        },
      })),
      getKaelJobIncident: jest.fn(async () => null),
      hydrateRemoteJobById: jest.fn(async () => true),
      previewScopeChangeFromKaelIncident: jest.fn(async () => false),
      proposeScopeChangeFromKaelIncident: jest.fn(async () => true),
      requestScopeChange: jest.fn(async () => true),
      requestWorkerCancellation: jest.fn(async () => true),
      workerAcceptBroadcast: jest.fn(async () => true),
      workerDeclineBroadcast: jest.fn(async () => true),
      workerRefresh: jest.fn(async () => true),
      workerUpdateAvailability: jest.fn(async () => true),
      workerUpdateStatus: jest.fn(async () => true),
    },
    selectors: {
      canWorkerAccept: false,
      canWorkerAdvance: true,
      canWorkerSeeFullAddress: true,
      currentBackendStatus: deal.backendStatus,
      currentStatus: deal.status,
    },
    state: {
      deal,
      lastError: null,
      lastRemoteSyncAt: null,
      workerGate: 'remote_backend',
    },
    workerEarnings: null as EarningsResponse | null,
    workerProfile: buildWorkerProfile(),
  }
}
describe('Worker V5 arrival check-in', () => {
  beforeEach(() => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    mockReplace.mockClear()
    mockUseJobChatThread.mockReturnValue({
      error: null,
      loading: false,
      messages: [],
      refresh: jest.fn(),
      send: jest.fn(async () => true),
      sendMessage: jest.fn(async () => true),
      sending: false,
    })
    mockWorkerKaelChatService.list.mockImplementation(pendingWorkerKaelServiceCall)
    mockWorkerKaelChatService.getTrainingConsent.mockImplementation(pendingWorkerKaelServiceCall)
    mockWorkerKaelChatService.create.mockReset()
    mockWorkerKaelChatService.get.mockReset()
    mockWorkerKaelChatService.streamTurn.mockReset()
    mediaUpload.uploadJobMediaDrafts.mockReset()
    imagePicker.launchCameraAsync.mockReset()
    imagePicker.launchImageLibraryAsync.mockReset()
    imagePicker.getCameraPermissionsAsync.mockReset()
    imagePicker.requestCameraPermissionsAsync.mockReset()
    imagePicker.requestMediaLibraryPermissionsAsync.mockReset()
    imagePicker.getCameraPermissionsAsync.mockResolvedValue({ canAskAgain: true, granted: false })
    imagePicker.requestCameraPermissionsAsync.mockResolvedValue({ canAskAgain: true, granted: true })
    imagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
    location.requestForegroundPermissionsAsync.mockImplementation(() => new Promise(() => undefined))
    location.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 10.7692, longitude: 106.6819 },
    })
    location.watchPositionAsync.mockResolvedValue({ remove: jest.fn() })
    mockWorkerRouteService.getMapImage.mockResolvedValue(new Blob())
    mockWorkerRouteService.getPreview.mockResolvedValue({
      data: { distance_meters: 3200, duration_seconds: 720 },
      success: true,
    })
    mockGetMobileApiAuthHeaders.mockReset()
    mockGetMobileApiAuthHeaders.mockResolvedValue({ Authorization: 'Bearer test', 'Content-Type': 'application/json' })
    buildWorkflow(buildOnWayDeal())
  })

  it('keeps travel details inside in-progress until the worker confirms arrival', () => {
    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-screen-2.7-in-progress')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-route-map-panel')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-eta-summary-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-eta-lens-value')).not.toHaveTextContent(/^0$/)
    expect(screen.getByTestId('worker-v5-eta-lens-label')).toHaveTextContent('dữ liệu')
    expect(screen.getByTestId('worker-v5-route-arrival-action')).toBeOnTheScreen()
    expect(screen.getByText('Xác nhận đã tới')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-route-pre-arrival-scope-action')).toBeNull()
    expect(screen.queryByText('Điều chỉnh trước khi đến')).toBeNull()
    expect(screen.queryByTestId('worker-v5-work-progress-board')).toBeNull()
    expect(screen.queryByTestId('worker-v5-evidence-tray')).toBeNull()
    expect(screen.queryByTestId('worker-jobs-surface')).toBeNull()
    expect(screen.queryByTestId('worker-v5-checkin-hero')).toBeNull()
  })

  it('renders the building route, distance, and ETA while the unit remains protected', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true })
    const dealWithoutRouteCoordinates = buildOnWayDeal()
    dealWithoutRouteCoordinates.broadcast!.addressAccess = {
      access_profile: {},
      check_in_required: true,
      customer_handoff_required: true,
      evidence_mode: 'none',
      exact_unit_released: false,
      identity_check_required: true,
      release_stage: 'building_released',
    }
    dealWithoutRouteCoordinates.broadcast!.fullAddressLabel = null
    dealWithoutRouteCoordinates.broadcast!.fullAddressVisible = false
    buildWorkflow(dealWithoutRouteCoordinates)
    render(<WorkerJobsSurface />)

    await waitFor(() => {
      expect(mockWorkerRouteService.getPreview).toHaveBeenCalledWith('job_test_1', {
        latitude: 10.7692,
        longitude: 106.6819,
      })
    }, { timeout: 5_000 })

    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-route-map-live-image')).toBeOnTheScreen()
      expect(screen.getByText('Di chuyển trong 12 phút')).toBeOnTheScreen()
      expect(screen.getByText('Quãng đường thật · 3,2 km')).toBeOnTheScreen()
      expect(screen.getByTestId('worker-v5-info-cell-value-0')).toHaveTextContent('3,2 km')
      expect(screen.getByTestId('worker-v5-info-cell-value-1')).toHaveTextContent('12 phút')
      expect(screen.getByTestId('worker-v5-info-cell-value-2')).toHaveTextContent('Sửa điện')
      expect(screen.getByTestId('worker-v5-info-cell-label-2')).toHaveTextContent(
        dealWithoutRouteCoordinates.broadcast!.problemSummary,
      )
    })
    expect(screen.queryByText('Chờ dữ liệu thật')).toBeNull()
    expect(dealWithoutRouteCoordinates.broadcast!.fullAddressVisible).toBe(false)
  }, 10_000)

  it('settles the demand-map preview when auth headers cannot be loaded', async () => {
    mockGetMobileApiAuthHeaders.mockRejectedValue(new Error('session storage failed'))
    mockWorkflowValue.workerProfile = {
      ...buildWorkerProfile(),
      home_lat: 10.7692,
      home_lng: 106.6819,
    }
    mockRouteParams = { ns_worker_screen: '5.3-skills-service-area' }

    render(<WorkerProfileSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-service-area-open-card'))

    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-vietmap-image-error')).toBeOnTheScreen()
    })
    expect(screen.queryByTestId('worker-v5-vietmap-image-loading')).toBeNull()
  })

  it('settles the route-map preview when auth headers cannot be loaded', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true })
    mockGetMobileApiAuthHeaders.mockRejectedValue(new Error('session storage failed'))

    render(<WorkerJobsSurface />)

    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-route-map-image-error')).toBeOnTheScreen()
    })
    expect(screen.queryByTestId('worker-v5-route-map-image-loading')).toBeNull()
  })

  it('uses a legacy arrival-gate link only to open the check-in step for an arrived job', async () => {
    mockRouteParams = { ns_worker_screen: '2.7-in-progress', ns_arrival_gate: '1' }
    buildWorkflow(buildInProgressDeal())

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-route-map-panel')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-eta-summary-card')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-work-progress-board')).toBeNull()
    expect(screen.getByText('Mở bước check-in')).toBeOnTheScreen()
    expect(screen.queryByText('Xác nhận đã tới')).toBeNull()
    fireEvent.press(screen.getByTestId('worker-v5-route-arrival-action'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.7-in-progress')
    })
    expect(mockWorkflowValue.actions.workerUpdateStatus).not.toHaveBeenCalled()
  })

  it('returns from in-progress to the job inbox instead of the retired route screen', async () => {
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    buildWorkflow(buildInProgressDeal())

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-back'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.1-opportunity-inbox')
    })
  })

it('opens an already-arrived job at its real check-in step', async () => {
  mockRouteParams = {}
  buildWorkflow(buildInProgressDeal())

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-opportunity-card'))
    fireEvent.press(screen.getByTestId('worker-v5-primary-action'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.7-in-progress')
  })
})

it('labels an arrived job by its real workflow state instead of as a new offer', () => {
  mockRouteParams = {}
  buildWorkflow(buildInProgressDeal())

  render(<WorkerJobsSurface />)

  expect(screen.getByText('Thợ đã đến')).toBeTruthy()
  expect(screen.queryByText('Đã gửi tới bạn')).toBeNull()
})

it('records arrival before continuing to the in-progress screen', async () => {
    render(<WorkerJobsSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-route-arrival-action'))

    await waitFor(() => {
      expect(mockWorkflowValue.actions.workerUpdateStatus).toHaveBeenCalledWith('arrived')
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.7-in-progress')
    })
  })

  it('starts travel without leaving the in-progress section', async () => {
    buildWorkflow(buildMatchedDeal())
    render(<WorkerJobsSurface />)

    expect(screen.getByText('Bắt đầu di chuyển')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-route-arrival-action'))

    await waitFor(() => {
      expect(mockWorkflowValue.actions.workerUpdateStatus).toHaveBeenCalledWith('worker_on_way')
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.7-in-progress')
    })
  })

  it('retires the standalone arrival-checkin deep link', () => {
    mockRouteParams = { ns_worker_screen: '2.5-arrival-checkin' }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-screen-2.1-opportunity-inbox')).toBeOnTheScreen()
  })

  it('keeps in-progress focused on job actions without the removed progress chrome or evidence controls', () => {
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    const deal = buildInProgressDeal()
    buildWorkflow(deal)

    render(<WorkerJobsSurface />)

    expect(screen.queryByText('Tiến độ công việc')).toBeNull()
    expect(screen.getByTestId('worker-v5-work-progress-board')).toBeOnTheScreen()
    expect(screen.getByText('Bảng công việc').parent?.children).toHaveLength(1)
    expect(screen.queryByText('Đã đọc')).toBeNull()
    expect(screen.queryByText('Đang áp dụng')).toBeNull()
    expect(screen.getByTestId('worker-v5-step-title-0')).toHaveTextContent(deal.broadcast!.problemSummary)
    expect(screen.getByTestId('worker-v5-step-meta-0')).toHaveTextContent('Phạm vi Kael đã đồng bộ')
    expect(screen.getByTestId('worker-v5-step-meta-1')).toHaveTextContent('Chưa có ảnh từ khách')
    expect(screen.getByTestId('worker-v5-step-meta-2')).toHaveTextContent('Chưa có ảnh hiện trường')
    expect(screen.getByTestId('worker-v5-step-meta-3')).toHaveTextContent('Trạng thái đã đồng bộ')
    expect(screen.queryByText('Đang kiểm')).toBeNull()
    expect(screen.queryByTestId('worker-v5-evidence-picker-actions')).toBeNull()
    expect(screen.queryByTestId('worker-v5-in-progress-camera-action')).toBeNull()
    expect(screen.queryByTestId('worker-v5-in-progress-library-action')).toBeNull()
    expect(screen.getByTestId('worker-v5-in-progress-scope-action')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-kael-action')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-in-progress-scope-action'))
    expect(mockReplace).toHaveBeenLastCalledWith(
      '/(worker)/jobs?ns_worker_screen=2.8-scope-change&job_id=job_test_1',
    )
  })

  it('selects the rebuilt in-progress session surface instead of the legacy jobs host', () => {
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    buildWorkflow(buildInProgressDeal())

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-rebuilt-in-progress-session')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-timer-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-work-progress-board')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-evidence-tray')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-scope-action')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-kael-action')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-stage-five-prototype')).toBeNull()
    expect(screen.queryByTestId('worker-jobs-surface')).toBeNull()
  })

  it('keeps the rebuilt session visible while the active job is hydrating', () => {
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    buildWorkflow(buildInProgressDeal())
    mockWorkflowValue.state.deal = null
    mockWorkflowValue.selectors.currentBackendStatus = null
    mockWorkflowValue.selectors.currentStatus = null
    mockWorkflowValue.state.workerGate = 'backend_pending'
    mockWorkflowValue.workerJobsHydrated = false

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-rebuilt-in-progress-session')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-timer-card')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-stage-five-prototype')).toBeNull()
  })

  it('opens case-bound Kael from an active job instead of generic chat', () => {
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    buildWorkflow(buildInProgressDeal())

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-in-progress-kael-action'))

    expect(mockReplace).toHaveBeenCalledWith('/(worker)/chat?ns_worker_screen=3.2-kael-job-intake')
  })

  it('attaches lobby evidence before marking the worker as checked in', async () => {
    const deal = buildInProgressDeal()
    deal.broadcast!.addressAccess = {
      access_profile: {},
      check_in_required: true,
      customer_handoff_required: true,
      evidence_mode: 'none',
      exact_unit_released: false,
      identity_check_required: true,
      release_stage: 'building_released',
      worker_checked_in: false,
    }
    buildWorkflow(deal)
    imagePicker.launchImageLibraryAsync.mockResolvedValue({
      assets: [{ fileName: 'lobby.jpg', fileSize: 1024, mimeType: 'image/jpeg', uri: 'file://lobby.jpg' }],
      canceled: false,
    })
    mediaUpload.uploadJobMediaDrafts.mockResolvedValue({
      mediaRefs: ['supabase://job-media/job_test_1/access_check_in/lobby.jpg'],
      success: true,
    })

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-arrival-check-in-action'))

    await waitFor(() => {
      expect(mediaUpload.uploadJobMediaDrafts).toHaveBeenCalledWith(
        'job_test_1',
        [expect.objectContaining({ type: 'image', uri: 'file://lobby.jpg' })],
        'access_check_in',
      )
      expect(mockWorkflowValue.actions.workerUpdateStatus).toHaveBeenCalledWith('arrived', {
        access_check_in: expect.objectContaining({
          checked_in_at: expect.any(String),
          mode: 'manual_photo',
          photo_urls: ['supabase://job-media/job_test_1/access_check_in/lobby.jpg'],
        }),
      })
    })
  })

  it('releases a stalled lobby picker instead of leaving check-in disabled', async () => {
    jest.useFakeTimers()
    const deal = buildInProgressDeal()
    deal.broadcast!.addressAccess = {
      access_profile: {},
      check_in_required: true,
      customer_handoff_required: true,
      evidence_mode: 'none',
      exact_unit_released: false,
      identity_check_required: true,
      release_stage: 'building_released',
      worker_checked_in: false,
    }
    buildWorkflow(deal)
    imagePicker.launchImageLibraryAsync.mockImplementationOnce(() => new Promise(() => undefined))

    try {
      render(<WorkerJobsSurface />)
      fireEvent.press(screen.getByTestId('worker-v5-arrival-check-in-action'))

      await act(async () => {
        await jest.advanceTimersByTimeAsync(45_000)
      })

      expect(screen.getByTestId('worker-v5-arrival-check-in-action')).not.toBeDisabled()
      expect(screen.getByText(/Chưa thể hoàn tất check-in/i)).toBeOnTheScreen()
      expect(mediaUpload.uploadJobMediaDrafts).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('opens inspection only after the customer releases the exact unit', async () => {
    const deal = buildInProgressDeal()
    deal.broadcast!.addressAccess = {
      access_profile: {},
      check_in_required: false,
      customer_handoff_required: false,
      evidence_mode: 'manual_photo',
      exact_unit_released: true,
      identity_check_required: false,
      release_stage: 'unit_released',
      worker_checked_in: true,
    }
    buildWorkflow(deal)

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-phase-advance-action'))

    await waitFor(() => {
      expect(mockWorkflowValue.actions.workerUpdateStatus).toHaveBeenCalledWith('inspecting')
    })
  })

  it('uses a scope-neutral work label after inspection', () => {
    buildWorkflow({
      ...buildInProgressDeal(),
      backendStatus: 'inspecting',
      status: 'inspecting',
      finalPrice: 220000,
    })

    render(<WorkerJobsSurface />)

    expect(screen.getByText('Bắt đầu công việc')).toBeOnTheScreen()
    expect(screen.queryByText('Bắt đầu sửa chữa')).toBeNull()
  })

  it('blocks starting unpriced work until the Customer agrees to the exact price', () => {
    buildWorkflow({ ...buildInProgressDeal(), backendStatus: 'inspecting', status: 'inspecting', finalPrice: null })
    render(<WorkerJobsSurface />)
    expect(screen.getByText('Chờ khách xác nhận giá')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-phase-advance-action'))
    expect(mockWorkflowValue.actions.workerUpdateStatus).not.toHaveBeenCalled()
  })

  it('rehydrates the routed job after a worker preview reload', async () => {
    const jobId = '11111111-1111-4111-8111-111111111111'
    const deal = {
      ...buildInProgressDeal(),
      backendStatus: 'completed_by_worker' as const,
      id: jobId,
      status: 'completed_by_worker' as const,
    }
    deal.broadcast = deal.broadcast ? { ...deal.broadcast, jobId } : null
    buildWorkflow(deal)
    mockWorkflowValue.state.deal = null
    mockRouteParams = {
      job_id: jobId,
      ns_worker_screen: '2.11-completion-submitted',
    }

    render(<WorkerJobsSurface />)

    await waitFor(() => {
      expect(mockWorkflowValue.actions.hydrateRemoteJobById).toHaveBeenCalledWith(jobId)
    })
  })

  it('shows customer photos and worker field photos as separate post-confirmation galleries', () => {
    const deal = buildInProgressDeal()
    deal.customerEvidencePhotoUrls = [
      'file:///customer-condition-1.jpg',
      'file:///customer-condition-2.jpg',
    ]
    deal.fieldEvidencePhotoUrls = Array.from({ length: 4 }, (_, index) => `file:///worker-field-${index + 1}.jpg`)
    buildWorkflow(deal)

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-customer-evidence-gallery-tile-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-customer-evidence-gallery-image-1').props.contentFit).toBe('contain')
    expect(screen.getByTestId('worker-v5-evidence-tray-tile-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-evidence-tray-image-0').props.contentFit).toBe('contain')
    expect(screen.getByTestId('worker-v5-evidence-tray-tile-3')).toBeOnTheScreen()
  })

  it('adds on-site evidence from the photo library and sends it to Kael for field confirmation', async () => {
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    buildWorkflow(buildInProgressDeal())
    imagePicker.launchImageLibraryAsync.mockResolvedValue({
      assets: [{ fileName: 'onsite.jpg', fileSize: 1024, mimeType: 'image/jpeg', uri: 'file://onsite.jpg' }],
      canceled: false,
    })
    mediaUpload.uploadJobMediaDrafts.mockResolvedValue({
      mediaRefs: ['supabase://job-media/job_test_1/kael_reference/onsite.jpg'],
      success: true,
    })
    mockWorkerKaelChatService.create.mockResolvedValue({
      data: { session: { id: 'worker-kael-session-1', job_id: 'job_test_1' } },
      success: true,
    })
    mockWorkerKaelChatService.streamTurn.mockResolvedValue({
      data: {
        turns: [{ role: 'kael', text_content: 'Kael đã nhận ảnh hiện trường để đối chiếu.' }],
      },
      success: true,
    })
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)

    render(<WorkerJobsSurface />)
    expect(screen.getAllByTestId(/worker-v5-evidence-tray-add-mark-/)).toHaveLength(3)
    fireEvent.press(screen.getByTestId('worker-v5-evidence-tray-add-0'))

    const actions = alertSpy.mock.calls[0]?.[2] as { onPress?: () => void; text?: string }[] | undefined
    const selectLibrary = actions?.find((action) => action.text === 'Kho ảnh')
    await act(async () => {
      selectLibrary?.onPress?.()
    })

    await waitFor(() => {
      expect(mediaUpload.uploadJobMediaDrafts).toHaveBeenCalledWith(
        'job_test_1',
        [expect.objectContaining({ type: 'image', uri: 'file://onsite.jpg' })],
        'kael_reference',
      )
      expect(mockWorkerKaelChatService.create).toHaveBeenCalledWith(expect.objectContaining({ job_id: 'job_test_1', language: 'vi' }))
      expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledWith(
        'worker-kael-session-1',
        expect.objectContaining({ media_refs: ['supabase://job-media/job_test_1/kael_reference/onsite.jpg'] }),
        expect.any(Object),
      )
    })
    expect(screen.getByText('Kael đã nhận ảnh hiện trường để đối chiếu.')).toBeOnTheScreen()
    alertSpy.mockRestore()
  })

  it('opens the photo library directly for an on-site evidence slot on web', async () => {
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    buildWorkflow(buildInProgressDeal())
    imagePicker.launchImageLibraryAsync.mockResolvedValue({ assets: [], canceled: true })
    const originalPlatform = Platform.OS
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' })

    try {
      render(<WorkerJobsSurface />)
      fireEvent.press(screen.getByTestId('worker-v5-evidence-tray-add-0'))

      await waitFor(() => {
        expect(imagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled()
        expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ quality: 0.82 }))
      })
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform })
    }
  })

  it('serializes the field-evidence picker and releases it after a picker rejection', async () => {
    buildWorkflow(buildInProgressDeal())
    let rejectPicker!: (reason?: unknown) => void
    imagePicker.launchImageLibraryAsync.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectPicker = reject
    }))
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ assets: [], canceled: true })
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      render(<WorkerJobsSurface />)

      fireEvent.press(screen.getByTestId('worker-v5-evidence-tray-add-0'))
      const firstActions = alertSpy.mock.calls[0]?.[2] as { onPress?: () => void; text?: string }[] | undefined
      const firstLibraryAction = firstActions?.find((action) => action.text === 'Kho ảnh')
      act(() => {
        firstLibraryAction?.onPress?.()
        firstLibraryAction?.onPress?.()
      })

      expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1)
      await act(async () => {
        rejectPicker(new Error('picker bridge unavailable'))
        await Promise.resolve()
      })
      await waitFor(() => {
        expect(screen.getByText('Chưa thể mở hoặc gửi ảnh hiện trường lúc này.')).toBeOnTheScreen()
      })

      fireEvent.press(screen.getByTestId('worker-v5-evidence-tray-add-1'))
      const retryActions = alertSpy.mock.calls[1]?.[2] as { onPress?: () => void; text?: string }[] | undefined
      const retryLibraryAction = retryActions?.find((action) => action.text === 'Kho ảnh')
      await act(async () => {
        retryLibraryAction?.onPress?.()
      })

      expect(imagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled()
      expect(imagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(2)
      expect(mediaUpload.uploadJobMediaDrafts).not.toHaveBeenCalled()
    } finally {
      alertSpy.mockRestore()
    }
  })

  it('reuses the field-evidence session key and upload after an ambiguous create failure', async () => {
    buildWorkflow(buildInProgressDeal())
    imagePicker.launchImageLibraryAsync.mockResolvedValue({
      assets: [{ fileName: 'onsite.jpg', fileSize: 1024, mimeType: 'image/jpeg', uri: 'file://onsite.jpg' }],
      canceled: false,
    })
    mediaUpload.uploadJobMediaDrafts.mockResolvedValue({
      mediaRefs: ['supabase://job-media/job_test_1/kael_reference/onsite.jpg'],
      success: true,
    })
    mockWorkerKaelChatService.create.mockResolvedValue({
      code: 'NETWORK_ERROR',
      error: 'ambiguous failure',
      status: 0,
      success: false,
    })
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    render(<WorkerJobsSurface />)

    for (let attempt = 0; attempt < 2; attempt += 1) {
      fireEvent.press(screen.getByTestId(`worker-v5-evidence-tray-add-${attempt}`))
      const actions = alertSpy.mock.calls[attempt]?.[2] as { onPress?: () => void; text?: string }[] | undefined
      const selectLibrary = actions?.[1]
      act(() => selectLibrary?.onPress?.())
      await waitFor(() => expect(mockWorkerKaelChatService.create).toHaveBeenCalledTimes(attempt + 1))
    }

    expect(mediaUpload.uploadJobMediaDrafts).toHaveBeenCalledTimes(1)
    const firstKey = mockWorkerKaelChatService.create.mock.calls[0][0].client_request_id
    const retryKey = mockWorkerKaelChatService.create.mock.calls[1][0].client_request_id
    expect(retryKey).toBe(firstKey)
    alertSpy.mockRestore()
  })

  it('reuses the field-evidence turn key after an ambiguous stream failure', async () => {
    buildWorkflow(buildInProgressDeal())
    imagePicker.launchImageLibraryAsync.mockResolvedValue({
      assets: [{ fileName: 'onsite.jpg', fileSize: 1024, mimeType: 'image/jpeg', uri: 'file://onsite.jpg' }],
      canceled: false,
    })
    mediaUpload.uploadJobMediaDrafts.mockResolvedValue({
      mediaRefs: ['supabase://job-media/job_test_1/kael_reference/onsite.jpg'],
      success: true,
    })
    mockWorkerKaelChatService.create.mockResolvedValue({
      data: { session: { id: 'worker-kael-session-1', job_id: 'job_test_1' } },
      success: true,
    })
    mockWorkerKaelChatService.streamTurn.mockResolvedValue({
      code: 'STREAM_TIMEOUT',
      error: 'ambiguous failure',
      status: 0,
      success: false,
    })
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    render(<WorkerJobsSurface />)

    for (let attempt = 0; attempt < 2; attempt += 1) {
      fireEvent.press(screen.getByTestId(`worker-v5-evidence-tray-add-${attempt}`))
      const actions = alertSpy.mock.calls[attempt]?.[2] as { onPress?: () => void; text?: string }[] | undefined
      const selectLibrary = actions?.[1]
      act(() => selectLibrary?.onPress?.())
      await waitFor(() => expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledTimes(attempt + 1))
    }

    expect(mediaUpload.uploadJobMediaDrafts).toHaveBeenCalledTimes(1)
    const firstKey = mockWorkerKaelChatService.streamTurn.mock.calls[0][1].client_request_id
    const retryKey = mockWorkerKaelChatService.streamTurn.mock.calls[1][1].client_request_id
    expect(retryKey).toBe(firstKey)
    alertSpy.mockRestore()
  })

  it('does not surface an old field-evidence confirmation after the active job changes', async () => {
    buildWorkflow(buildInProgressDeal())
    imagePicker.launchImageLibraryAsync.mockResolvedValue({
      assets: [{ fileName: 'onsite.jpg', fileSize: 1024, mimeType: 'image/jpeg', uri: 'file://onsite.jpg' }],
      canceled: false,
    })
    mediaUpload.uploadJobMediaDrafts.mockResolvedValue({
      mediaRefs: ['supabase://job-media/job_test_1/kael_reference/onsite.jpg'],
      success: true,
    })
    let resolveCreate!: (value: { error: string; success: false }) => void
    mockWorkerKaelChatService.create.mockImplementation(() => new Promise((resolve) => {
      resolveCreate = resolve
    }))
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    const { rerender } = render(<WorkerJobsSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-evidence-tray-add-0'))
    const actions = alertSpy.mock.calls[0]?.[2] as { onPress?: () => void; text?: string }[] | undefined
    const selectLibrary = actions?.find((action) => action.text === 'Kho ảnh')
    await act(async () => {
      selectLibrary?.onPress?.()
    })
    await waitFor(() => {
      expect(mockWorkerKaelChatService.create).toHaveBeenCalled()
    })

    const nextDeal = buildInProgressDeal()
    nextDeal.id = 'job_test_2'
    if (nextDeal.broadcast) nextDeal.broadcast.jobId = 'job_test_2'
    buildWorkflow(nextDeal)
    rerender(<WorkerJobsSurface />)
    await act(async () => {
      resolveCreate({ error: 'old job failed', success: false })
    })

    await waitFor(() => {
      expect(screen.queryByText('Kael chưa mở được phiên xác nhận hiện trường.')).toBeNull()
    })
    alertSpy.mockRestore()
  })

  it('offers the camera path from an on-site evidence slot', async () => {
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    buildWorkflow(buildInProgressDeal())
    imagePicker.launchCameraAsync.mockResolvedValue({ assets: [], canceled: true })
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-evidence-tray-add-1'))
    const actions = alertSpy.mock.calls[0]?.[2] as { onPress?: () => void; text?: string }[] | undefined
    const takePhoto = actions?.find((action) => action.text === 'Chụp ảnh')
    await act(async () => {
      takePhoto?.onPress?.()
    })

    await waitFor(() => {
      expect(imagePicker.requestCameraPermissionsAsync).toHaveBeenCalled()
      expect(imagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({ quality: 0.82 }))
    })
    expect(mediaUpload.uploadJobMediaDrafts).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('does not upload or call Kael when the photo-library picker is cancelled', async () => {
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    buildWorkflow(buildInProgressDeal())
    imagePicker.launchImageLibraryAsync.mockResolvedValue({ assets: [], canceled: true })
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-evidence-tray-add-0'))
    const actions = alertSpy.mock.calls[0]?.[2] as { onPress?: () => void; text?: string }[] | undefined
    const selectLibrary = actions?.find((action) => action.text === 'Kho ảnh')
    await act(async () => {
      selectLibrary?.onPress?.()
    })

    expect(mediaUpload.uploadJobMediaDrafts).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.create).not.toHaveBeenCalled()
    expect(mockWorkerKaelChatService.streamTurn).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('reuses stored field evidence for scope review and before-and-after completion evidence', async () => {
    const deal = buildInProgressDeal() as LocalDeal & { fieldEvidencePhotoUrls?: string[] }
    const jobId = '11111111-1111-4111-8111-111111111111'
    const privateEvidenceRef = `supabase://job-media/${jobId}/kael_reference/onsite.jpg`
    deal.id = jobId
    if (deal.broadcast) deal.broadcast.jobId = jobId
    deal.fieldEvidencePhotoUrls = [privateEvidenceRef]
    buildWorkflow(deal)
    mockRouteParams = { ns_scope_mode: 'edit', ns_worker_screen: '2.8-scope-change' }

    const { rerender } = render(<WorkerJobsSurface />)

    expect(screen.queryByTestId('worker-v5-scope-change-hero')).toBeNull()
    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-evidence-tray-tile-0')).toBeOnTheScreen()
    })
    fireEvent.changeText(screen.getByTestId('worker-scope-change-new-description-input'), 'Cần thay dây cháy tại ổ cắm.')
    fireEvent.changeText(screen.getByTestId('worker-scope-change-reason-input'), 'Dây bên trong đã cháy do quá nhiệt.')
    fireEvent.press(screen.getByTestId('worker-scope-change-confirm-submit'))

    await waitFor(() => {
      expect(mockWorkflowValue.actions.openKaelJobIncident).toHaveBeenCalledWith(expect.objectContaining({
        photo_urls: [privateEvidenceRef],
      }))
    })
    expect(screen.getByText('Mở Kael Công việc')).toBeOnTheScreen()
    expect(mockReplace).not.toHaveBeenCalledWith('/(worker)/chat?ns_worker_screen=3.1-kael-chat-normal')

    deal.backendStatus = 'repairing'
    deal.status = 'repairing'
    mockRouteParams = { ns_worker_screen: '2.10-completion-evidence' }
    rerender(<WorkerJobsSurface />)

    await waitFor(() => {
      expect(screen.getByTestId('worker-v5-stage-eight-fidelity')).toBeOnTheScreen()
    })
    expect(screen.queryByText('Kael đã đối chiếu phạm vi')).toBeNull()
  })

  it('collects real completion evidence before opening the submitted phase', async () => {
    const deal = {
      ...buildInProgressDeal(),
      backendStatus: 'repairing' as const,
      status: 'repairing' as const,
    }
    buildWorkflow(deal)
    mockRouteParams = { ns_worker_screen: '2.10-completion-evidence' }
    imagePicker.launchImageLibraryAsync.mockResolvedValue({
      assets: [{ fileName: 'completed.jpg', fileSize: 2048, mimeType: 'image/jpeg', uri: 'file://completed.jpg' }],
      canceled: false,
    })
    mediaUpload.uploadJobMediaDrafts.mockResolvedValue({
      mediaRefs: ['supabase://job-media/job_test_1/after/completed.jpg'],
      success: true,
    })

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-stage-eight-fidelity-submit').props.accessibilityState).toEqual({ disabled: true, busy: false })
    fireEvent.changeText(
      screen.getByTestId('worker-v5-stage-eight-fidelity-note-input'),
      'Đã khoan tường, lắp giá và kiểm tra tải an toàn.',
    )
    fireEvent.press(screen.getByTestId('worker-v5-stage-eight-fidelity-add-photo'))

    await waitFor(() => {
      expect(screen.getByText('1 ảnh')).toBeOnTheScreen()
      expect(screen.getByTestId('worker-v5-stage-eight-fidelity-submit').props.accessibilityState).toEqual({ disabled: false, busy: false })
    })
    fireEvent.press(screen.getByTestId('worker-v5-stage-eight-fidelity-submit'))

    await waitFor(() => {
      expect(mediaUpload.uploadJobMediaDrafts).toHaveBeenCalledWith(
        'job_test_1',
        [expect.objectContaining({ type: 'image', uri: 'file://completed.jpg' })],
        'after',
      )
      expect(mockWorkflowValue.actions.workerUpdateStatus).toHaveBeenCalledWith('completed_by_worker', {
        completion_notes: 'Đã khoan tường, lắp giá và kiểm tra tải an toàn.',
        completion_photo_urls: ['supabase://job-media/job_test_1/after/completed.jpg'],
      })
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.11-completion-submitted')
    })
  })

  it('does not show the submitted phase while the backend is still repairing', async () => {
    const jobId = '11111111-1111-4111-8111-111111111111'
    const repairingDeal = buildInProgressDeal()
    buildWorkflow({
      ...repairingDeal,
      backendStatus: 'repairing',
      broadcast: repairingDeal.broadcast ? { ...repairingDeal.broadcast, jobId } : null,
      id: jobId,
      status: 'repairing',
    })
    mockRouteParams = { ns_worker_screen: '2.11-completion-submitted' }

    render(<WorkerJobsSurface />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(`/(worker)/jobs?ns_worker_screen=2.10-completion-evidence&job_id=${jobId}`)
    })
  })

  it('serializes scope-evidence submission and releases the control after rejection', async () => {
    buildWorkflow(buildInProgressDeal())
    let rejectIncident!: (reason?: unknown) => void
    mockWorkflowValue.actions.openKaelJobIncident.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectIncident = reject
    }))
    mockRouteParams = { ns_scope_mode: 'edit', ns_worker_screen: '2.8-scope-change' }
    render(<WorkerJobsSurface />)
    fireEvent.changeText(screen.getByTestId('worker-scope-change-new-description-input'), 'Cần thay dây cháy tại ổ cắm.')
    fireEvent.changeText(screen.getByTestId('worker-scope-change-reason-input'), 'Dây bên trong đã cháy do quá nhiệt.')
    const submitButton = screen.getByTestId('worker-scope-change-confirm-submit')
    let submitPressTarget: typeof submitButton | null = submitButton
    while (submitPressTarget && typeof submitPressTarget.props.onPress !== 'function') {
      submitPressTarget = submitPressTarget.parent
    }
    expect(submitPressTarget).not.toBeNull()
    const pressSubmit = submitPressTarget?.props.onPress as (() => void)

    act(() => {
      pressSubmit()
      pressSubmit()
    })

    expect(mockWorkflowValue.actions.openKaelJobIncident).toHaveBeenCalledTimes(1)
    await act(async () => {
      rejectIncident(new Error('network unavailable'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.getByText('Chưa gửi được bằng chứng đổi phạm vi. Vui lòng thử lại.')).toBeOnTheScreen()
      expect(submitButton).not.toBeDisabled()
    })
  })

  it('restores the active incident report after a remount without opening another incident', () => {
    const deal = {
      ...buildInProgressDeal(),
      scopeReview: {
        id: 'incident-ready',
        status: 'ready_for_scope_proposal' as const,
        evidenceStatus: 'ready' as const,
        reportedDescription: 'Thay đúng hai bản lề nứt và căn chỉnh lại một cánh tủ.',
        reportedReason: 'Hai khớp bản lề đã nứt; gỗ và cánh tủ còn nguyên vẹn.',
        evidenceCount: 1,
        lastSummary: 'Kael đã đối chiếu báo cáo với bằng chứng.',
        lastQuestion: 'Thợ có thể yêu cầu Kael tính giá.',
        lastNextActor: 'worker' as const,
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:01:00.000Z',
      },
    }
    buildWorkflow(deal)
    mockRouteParams = {
      ns_scope_mode: 'edit',
      ns_worker_screen: '2.8-scope-change',
    }

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-scope-change-new-description-input')).toHaveProp(
      'value',
      deal.scopeReview.reportedDescription,
    )
    expect(screen.getByTestId('worker-scope-change-reason-input')).toHaveProp(
      'value',
      deal.scopeReview.reportedReason,
    )
    expect(screen.getByText('Kael tính giá cân bằng')).toBeOnTheScreen()
    expect(mockWorkflowValue.actions.openKaelJobIncident).not.toHaveBeenCalled()
  })

  it('restores an unexpired server-owned scope quote after a remount without another AI preview', async () => {
    const deal = {
      ...buildInProgressDeal(),
      scopeReview: {
        id: 'incident-ready',
        status: 'ready_for_scope_proposal' as const,
        evidenceStatus: 'ready' as const,
        reportedDescription: 'Thay đúng hai bản lề nứt và căn chỉnh lại một cánh tủ.',
        reportedReason: 'Hai khớp bản lề đã nứt; gỗ và cánh tủ còn nguyên vẹn.',
        evidenceCount: 1,
        lastSummary: 'Kael đã đối chiếu báo cáo với bằng chứng.',
        lastQuestion: 'Thợ có thể yêu cầu Kael tính giá.',
        lastNextActor: 'worker' as const,
        createdAt: '2026-08-13T13:00:00.000Z',
        updatedAt: '2026-08-13T13:05:00.000Z',
      },
    }
    const routedDeal = { ...deal, scopeReview: undefined }
    buildWorkflow(routedDeal)
    mockWorkflowValue.actions.getKaelJobIncident.mockResolvedValueOnce({
      incident: {
        id: 'incident-ready',
        job_id: deal.id,
        status: 'ready_for_scope_proposal',
        evidence_status: 'ready',
        last_summary: 'Kael đã đối chiếu báo cáo với bằng chứng.',
        last_question: 'Thợ có thể yêu cầu Kael tính giá.',
        last_next_actor: 'worker',
        created_at: '2026-08-13T13:00:00.000Z',
        updated_at: '2026-08-13T13:05:00.000Z',
      },
      quote: {
        schema_version: 'scope_change_worker_quote.v1',
        quote_id: 'a7500000-0000-4000-8000-000000000010',
        incident_id: 'incident-ready',
        job_id: deal.id,
        customer_total: 300000,
        platform_fee: 45000,
        worker_net: 255000,
        commission_level: 1,
        commission_rate_bps: 1500,
        reference_price_min: 240000,
        reference_price_max: 360000,
        baseline_used: 'handyman:replace_cabinet_hinges:small:hcmc_all',
        baseline_source: 'verified-test-source',
        selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
        calculation: '2 x 150000 VND = 300000 VND',
        expires_at: '2099-08-13T13:20:00.000Z',
      },
    })
    mockRouteParams = {
      job_id: deal.id,
      ns_scope_mode: 'edit',
      ns_worker_screen: '2.8-scope-change',
    }

    const { rerender } = render(<WorkerJobsSurface />)

    await waitFor(() => expect(screen.getByText('Xác nhận giá và gửi khách')).toBeOnTheScreen())
    expect(screen.getAllByText('300.000 VND')).toHaveLength(2)
    expect(screen.getByText('45.000 VND · 15%')).toBeOnTheScreen()
    expect(screen.getByText('255.000 VND')).toBeOnTheScreen()
    expect(mockWorkflowValue.actions.getKaelJobIncident).toHaveBeenCalledWith(deal.id)
    expect(mockWorkflowValue.actions.previewScopeChangeFromKaelIncident).not.toHaveBeenCalled()

    mockWorkflowValue = {
      ...mockWorkflowValue,
      state: { ...mockWorkflowValue.state, deal: null },
    }
    rerender(<WorkerJobsSurface />)

    expect(screen.getByText('Xác nhận giá và gửi khách')).toBeOnTheScreen()
    expect(screen.getAllByText('300.000 VND')).toHaveLength(2)
  })

  it('locks scope editing and shows the Customer decision gate after the Worker submits', () => {
    const deal = {
      ...buildInProgressDeal(),
      finalPrice: 258000,
      scopeChange: {
        id: 'scope-change-proposed',
        status: 'waiting_customer_decision' as const,
        requestedDescription: 'Thay đúng hai bản lề nứt và căn chỉnh lại một cánh tủ.',
        reason: 'Hai khớp bản lề đã nứt; gỗ và cánh tủ còn nguyên vẹn.',
        priceMin: 258000,
        priceMax: 258000,
        kaelReview: null,
        kaelProgress: null,
        evidencePhotoUrls: [],
        requestTiming: 'on_site' as const,
        resumeJobStatus: 'inspecting' as const,
        createdAt: '2026-08-13T13:06:00.000Z',
      },
      scopeReview: {
        id: 'incident-proposed',
        status: 'scope_proposed' as const,
        evidenceStatus: 'ready' as const,
        reportedDescription: 'Thay đúng hai bản lề nứt và căn chỉnh lại một cánh tủ.',
        reportedReason: 'Hai khớp bản lề đã nứt; gỗ và cánh tủ còn nguyên vẹn.',
        evidenceCount: 1,
        lastSummary: 'Đề xuất đã được gửi để khách xem xét.',
        lastQuestion: null,
        lastNextActor: 'customer' as const,
        createdAt: '2026-08-13T13:00:00.000Z',
        updatedAt: '2026-08-13T13:06:00.000Z',
      },
    }
    buildWorkflow(deal)
    mockRouteParams = {
      job_id: deal.id,
      ns_scope_mode: 'edit',
      ns_worker_screen: '2.8-scope-change',
    }

    render(<WorkerJobsSurface />)

    expect(screen.getByText('Đang chờ khách xác nhận')).toBeOnTheScreen()
    expect(screen.getByText('Khách đang xem đề xuất.')).toBeOnTheScreen()
    expect(screen.queryByText('+118.000 VND')).not.toBeOnTheScreen()
    expect(screen.queryByTestId('worker-scope-change-evidence-form')).not.toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-stage-six-edit-action')).toBeDisabled()
  })

  it('does not advance an empty scope-change screen into approval wait', () => {
    buildWorkflow(buildInProgressDeal())
    mockRouteParams = { ns_worker_screen: '2.8-scope-change' }

    render(<WorkerJobsSurface />)

    const primaryAction = screen.getByTestId('worker-v5-stage-six-primary-action')
    expect(primaryAction).toBeDisabled()
    fireEvent.press(primaryAction)
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('keeps approval wait inert until the customer decides on the real proposal', () => {
    buildWorkflow(buildScopePendingDeal())
    mockRouteParams = { ns_worker_screen: '2.9-approval-wait' }

    render(<WorkerJobsSurface />)

    const primaryAction = screen.getByTestId('worker-v5-stage-seven-primary-action')
    expect(primaryAction).toBeDisabled()
    fireEvent.press(primaryAction)
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('resumes the active job screen after a real scope approval', () => {
    const deal = buildScopePendingDeal()
    deal.scopeChange = { ...deal.scopeChange!, status: 'approved_by_customer' }
    buildWorkflow(deal)
    mockRouteParams = { ns_worker_screen: '2.9-approval-wait' }

    render(<WorkerJobsSurface />)

    const primaryAction = screen.getByTestId('worker-v5-stage-seven-primary-action')
    expect(primaryAction).not.toBeDisabled()
    fireEvent.press(primaryAction)

    expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.7-in-progress')
  })

  it('redirects a stale approval route after the backend resumes the real job status', async () => {
    const deal = {
      ...buildInProgressDeal(),
      backendStatus: 'inspecting' as const,
      status: 'inspecting' as const,
    }
    buildWorkflow(deal)
    mockRouteParams = { ns_worker_screen: '2.9-approval-wait' }

    render(<WorkerJobsSurface />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.7-in-progress')
    })
  })

  it('returns to in-progress after a pending scope proposal has been approved', async () => {
    const deal = {
      ...buildInProgressDeal(),
      backendStatus: 'repairing' as const,
      scopeChange: null,
      status: 'repairing' as const,
    }
    buildWorkflow(deal)
    mockWorkflowValue.actions.getKaelJobIncident.mockResolvedValueOnce({
      incident: {
        id: 'incident-approved',
        job_id: deal.id,
        status: 'scope_proposed',
        evidence_status: 'ready',
        last_summary: 'Khách đã xác nhận đề xuất.',
        last_question: null,
        last_next_actor: 'worker',
        created_at: '2026-08-15T16:58:47.000Z',
        updated_at: '2026-08-15T17:08:55.000Z',
      },
      quote: null,
    })
    mockRouteParams = {
      job_id: deal.id,
      ns_scope_mode: 'edit',
      ns_worker_screen: '2.8-scope-change',
    }

    render(<WorkerJobsSurface />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        `/(worker)/jobs?ns_worker_screen=2.7-in-progress&job_id=${deal.id}`,
      )
    })
  })

  it('previews one balanced quote, then serializes its final proposal', async () => {
    const deal = buildInProgressDeal()
    buildWorkflow(deal)
    mockWorkflowValue.actions.openKaelJobIncident.mockResolvedValueOnce({
      incident: {
        id: 'incident-ready',
        job_id: deal.id,
        status: 'ready_for_scope_proposal',
        evidence_status: 'sufficient',
        last_summary: null,
        last_question: null,
        last_next_actor: 'worker',
        created_at: '2026-07-15T00:00:00.000Z',
        updated_at: '2026-07-15T00:00:00.000Z',
      },
    })
    const quoteId = 'a7500000-0000-4000-8000-000000000010'
    mockWorkflowValue.actions.previewScopeChangeFromKaelIncident.mockResolvedValueOnce({
      incident: {
        id: 'incident-ready',
        job_id: deal.id,
        status: 'ready_for_scope_proposal',
        evidence_status: 'ready',
        last_summary: null,
        last_question: null,
        last_next_actor: 'worker',
        created_at: '2026-07-15T00:00:00.000Z',
        updated_at: '2026-07-15T00:00:00.000Z',
      },
      quote: {
        schema_version: 'scope_change_worker_quote.v1',
        quote_id: quoteId,
        incident_id: 'incident-ready',
        job_id: deal.id,
        customer_total: 300000,
        platform_fee: 45000,
        worker_net: 255000,
        commission_level: 1,
        commission_rate_bps: 1500,
        reference_price_min: 240000,
        reference_price_max: 360000,
        baseline_used: 'handyman:replace_cabinet_hinges:small:hcmc_all',
        baseline_source: 'verified-test-source',
        selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
        calculation: '2 x 150000 VND = 300000 VND',
        expires_at: '2026-07-15T00:15:00.000Z',
      },
    })
    let rejectProposal!: (reason?: unknown) => void
    mockWorkflowValue.actions.proposeScopeChangeFromKaelIncident.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectProposal = reject
    }))
    mockRouteParams = { ns_scope_mode: 'edit', ns_worker_screen: '2.8-scope-change' }
    render(<WorkerJobsSurface />)
    fireEvent.changeText(screen.getByTestId('worker-scope-change-new-description-input'), 'Cần thay dây cháy tại ổ cắm.')
    fireEvent.changeText(screen.getByTestId('worker-scope-change-reason-input'), 'Dây bên trong đã cháy do quá nhiệt.')
    fireEvent.press(screen.getByTestId('worker-scope-change-confirm-submit'))
    await waitFor(() => expect(screen.getByText('Kael tính giá cân bằng')).toBeOnTheScreen())
    expect(mockReplace).not.toHaveBeenCalledWith('/(worker)/chat?ns_worker_screen=3.1-kael-chat-normal')

    const proposalButton = screen.getByTestId('worker-v5-scope-change-send-action')
    let proposalPressTarget: typeof proposalButton | null = proposalButton
    while (proposalPressTarget && typeof proposalPressTarget.props.onPress !== 'function') {
      proposalPressTarget = proposalPressTarget.parent
    }
    expect(proposalPressTarget).not.toBeNull()
    fireEvent.press(proposalButton)
    await waitFor(() => expect(screen.getByText('Xác nhận giá và gửi khách')).toBeOnTheScreen())
    expect(mockWorkflowValue.actions.previewScopeChangeFromKaelIncident).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('300.000 VND')).toHaveLength(2)
    expect(screen.getByText('45.000 VND · 15%')).toBeOnTheScreen()
    expect(screen.getByText('255.000 VND')).toBeOnTheScreen()
    expect(screen.getByText('Không đồng ý mức này')).toBeOnTheScreen()
    const confirmedButton = screen.getByTestId('worker-v5-scope-change-send-action')
    let confirmedPressTarget: typeof confirmedButton | null = confirmedButton
    while (confirmedPressTarget && typeof confirmedPressTarget.props.onPress !== 'function') {
      confirmedPressTarget = confirmedPressTarget.parent
    }
    expect(confirmedPressTarget).not.toBeNull()
    const pressConfirmedProposal = confirmedPressTarget?.props.onPress as (() => void)
    act(() => {
      pressConfirmedProposal()
      pressConfirmedProposal()
    })

    expect(mockWorkflowValue.actions.proposeScopeChangeFromKaelIncident).toHaveBeenCalledTimes(1)
    expect(mockWorkflowValue.actions.proposeScopeChangeFromKaelIncident).toHaveBeenCalledWith(quoteId)
    await act(async () => {
      rejectProposal(new Error('network unavailable'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.getByText('Chưa tạo được đề xuất phạm vi. Vui lòng thử lại.')).toBeOnTheScreen()
    })
  })

  it('keeps the case-trail heading removed while showing the two dedicated case icons without redundant row aura', () => {
    mockRouteParams = { ns_worker_screen: '2.12-case-closed' }
    buildWorkflow(buildInProgressDeal())

    render(<WorkerJobsSurface />)

    expect(screen.queryByText('Dấu vết Case')).toBeNull()
    expect(screen.getByTestId('worker-v5-stage-ten-summary-list')).toBeOnTheScreen()
  })

  it('opens earnings from a closed case on the earnings route', () => {
    mockRouteParams = { ns_worker_screen: '2.12-case-closed' }
    buildWorkflow(buildInProgressDeal())

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-case-closed-earnings-action'))

    expect(mockReplace).toHaveBeenCalledWith('/(worker)/earnings?ns_worker_screen=4.1-earnings-overview&ns_worker_earnings_period=month')
  })

  it('keeps approval and completion actions without the two removed information cards', () => {
    buildWorkflow(buildScopePendingDeal())
    mockRouteParams = { ns_worker_screen: '2.9-approval-wait' }

    const { rerender } = render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-stage-seven-primary-action')).toBeOnTheScreen()
    expect(screen.queryByText('Không tự thực hiện phần phát sinh')).toBeNull()
    expect(screen.queryByText('Hồ sơ giữ nguyên phạm vi cũ cho tới khi khách phê duyệt trên hệ thống.')).toBeNull()

    buildWorkflow({
      ...buildInProgressDeal(),
      backendStatus: 'repairing',
      status: 'repairing',
    })
    mockRouteParams = { ns_worker_screen: '2.10-completion-evidence' }
    rerender(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-stage-eight-fidelity-submit')).toBeOnTheScreen()
    expect(screen.queryByText('Kael đã đối chiếu phạm vi')).toBeNull()
    expect(screen.queryByText('Kael chỉ đối chiếu phạm vi và nguồn bằng chứng; quyền gửi vẫn là hành động rõ ràng của thợ.')).toBeNull()
  })

  it('opens the shared Kael Work thread when messaging the customer during approval wait', () => {
    buildWorkflow(buildScopePendingDeal())
    mockRouteParams = { ns_worker_screen: '2.9-approval-wait' }

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-stage-seven-message-action'))

    expect(mockReplace).toHaveBeenCalledWith('/(worker)/chat?ns_worker_screen=3.1-kael-chat-normal')
  })
})
