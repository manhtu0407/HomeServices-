import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { LocalDeal } from '@nestscout/shared'
import { act } from '@testing-library/react-native'
import type { EarningsResponse, WorkerProfileResponse } from '@/lib/api-types'
import { Alert } from 'react-native'

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

import { WorkerJobsSurface } from '../worker-surfaces'

const imagePicker = require('expo-image-picker') as {
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

function buildWorkflow(deal: LocalDeal) {
  mockWorkflowValue = {
    actions: {
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
    mockWorkerKaelChatService.streamTurn.mockReset()
    mediaUpload.uploadJobMediaDrafts.mockReset()
    imagePicker.launchCameraAsync.mockReset()
    imagePicker.launchImageLibraryAsync.mockReset()
    imagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true })
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
    buildWorkflow(buildOnWayDeal())
  })

  it('keeps travel details inside in-progress until the worker confirms arrival', () => {
    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-screen-2.7-in-progress')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-route-map-panel')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-eta-summary-card')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-route-arrival-action')).toBeOnTheScreen()
    expect(screen.getByText('Xác nhận đã tới')).toBeOnTheScreen()
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
    })
    expect(dealWithoutRouteCoordinates.broadcast!.fullAddressVisible).toBe(false)
  }, 10_000)

  it('shows the one-time arrival gate before execution when resuming an arrived job', async () => {
    mockRouteParams = { ns_worker_screen: '2.7-in-progress', ns_arrival_gate: '1' }
    buildWorkflow(buildInProgressDeal())

    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-route-map-panel')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-eta-summary-card')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-work-progress-board')).toBeNull()
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

  it('opens the one-time arrival gate when continuing an already-arrived job', async () => {
    mockRouteParams = {}
    buildWorkflow(buildInProgressDeal())

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-opportunity-card'))
    fireEvent.press(screen.getByTestId('worker-v5-primary-action'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.7-in-progress&ns_arrival_gate=1')
    })
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
    buildWorkflow(buildInProgressDeal())

    render(<WorkerJobsSurface />)

    expect(screen.queryByText('Tiến độ công việc')).toBeNull()
    expect(screen.getByTestId('worker-v5-work-progress-board')).toBeOnTheScreen()
    expect(screen.getByText('Bảng công việc').parent?.children).toHaveLength(1)
    expect(screen.queryByTestId('worker-v5-evidence-picker-actions')).toBeNull()
    expect(screen.queryByTestId('worker-v5-in-progress-camera-action')).toBeNull()
    expect(screen.queryByTestId('worker-v5-in-progress-library-action')).toBeNull()
    expect(screen.getByTestId('worker-v5-in-progress-scope-action')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-in-progress-kael-action')).toBeOnTheScreen()
  })

  it('adds on-site evidence from the photo library and sends it to Kael for field confirmation', async () => {
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    buildWorkflow(buildInProgressDeal())
    imagePicker.launchImageLibraryAsync.mockResolvedValue({
      assets: [{ fileName: 'onsite.jpg', fileSize: 1024, mimeType: 'image/jpeg', uri: 'file://onsite.jpg' }],
      canceled: false,
    })
    mediaUpload.uploadJobMediaDrafts.mockResolvedValue({
      mediaRefs: ['supabase://job-media/job_test_1/before/onsite.jpg'],
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
    expect(screen.getAllByText('+')).toHaveLength(3)
    fireEvent.press(screen.getByTestId('worker-v5-evidence-tray-add-0'))

    const actions = alertSpy.mock.calls[0]?.[2] as Array<{ onPress?: () => void; text?: string }> | undefined
    const selectLibrary = actions?.find((action) => action.text === 'Kho ảnh')
    await act(async () => {
      selectLibrary?.onPress?.()
    })

    await waitFor(() => {
      expect(mediaUpload.uploadJobMediaDrafts).toHaveBeenCalledWith(
        'job_test_1',
        [expect.objectContaining({ type: 'image', uri: 'file://onsite.jpg' })],
        'before',
      )
      expect(mockWorkerKaelChatService.create).toHaveBeenCalledWith(expect.objectContaining({ job_id: 'job_test_1', language: 'vi' }))
      expect(mockWorkerKaelChatService.streamTurn).toHaveBeenCalledWith(
        'worker-kael-session-1',
        expect.objectContaining({ media_refs: ['supabase://job-media/job_test_1/before/onsite.jpg'] }),
        expect.any(Object),
      )
    })
    expect(screen.getByText('Kael đã nhận ảnh hiện trường để đối chiếu.')).toBeOnTheScreen()
    alertSpy.mockRestore()
  })

  it('offers the camera path from an on-site evidence slot', async () => {
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    buildWorkflow(buildInProgressDeal())
    imagePicker.launchCameraAsync.mockResolvedValue({ assets: [], canceled: true })
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-evidence-tray-add-1'))
    const actions = alertSpy.mock.calls[0]?.[2] as Array<{ onPress?: () => void; text?: string }> | undefined
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

  it('does not upload or call Kael when photo-library permission is denied', async () => {
    mockRouteParams = { ns_worker_screen: '2.7-in-progress' }
    buildWorkflow(buildInProgressDeal())
    imagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false })
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-evidence-tray-add-0'))
    const actions = alertSpy.mock.calls[0]?.[2] as Array<{ onPress?: () => void; text?: string }> | undefined
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
    deal.fieldEvidencePhotoUrls = ['https://storage.example.test/job_test_1/before/onsite.jpg']
    buildWorkflow(deal)
    mockRouteParams = { ns_scope_mode: 'edit', ns_worker_screen: '2.8-scope-change' }

    const { rerender } = render(<WorkerJobsSurface />)

    expect(screen.queryByTestId('worker-v5-scope-change-hero')).toBeNull()
    expect(screen.getByText('Đã có')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-evidence-tray-image-0')).toBeOnTheScreen()
    fireEvent.changeText(screen.getByTestId('worker-scope-change-new-description-input'), 'Cần thay dây cháy tại ổ cắm.')
    fireEvent.changeText(screen.getByTestId('worker-scope-change-reason-input'), 'Dây bên trong đã cháy do quá nhiệt.')
    fireEvent.press(screen.getByTestId('worker-scope-change-confirm-submit'))

    await waitFor(() => {
      expect(mockWorkflowValue.actions.requestScopeChange).toHaveBeenCalledWith(expect.objectContaining({
        photo_urls: ['https://storage.example.test/job_test_1/before/onsite.jpg'],
      }))
    })

    mockRouteParams = { ns_worker_screen: '2.10-completion-evidence' }
    rerender(<WorkerJobsSurface />)

    expect(screen.getByText('Đã có')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-evidence-tray-image-0')).toBeOnTheScreen()
    expect(screen.queryByText('Hồ sơ hoàn tất')).toBeNull()
  })

  it('keeps the case-trail heading removed while showing the two dedicated case icons', () => {
    mockRouteParams = { ns_worker_screen: '2.12-case-closed' }
    buildWorkflow(buildInProgressDeal())

    render(<WorkerJobsSurface />)

    expect(screen.queryByText('Dấu vết Case')).toBeNull()
    expect(screen.getByTestId('worker-v5-case-trail-icon-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-case-trail-icon-1')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-case-trail-icon-aura-0')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-case-trail-icon-aura-1')).toBeOnTheScreen()
  })

  it('opens earnings from a closed case on the earnings route', () => {
    mockRouteParams = { ns_worker_screen: '2.12-case-closed' }
    buildWorkflow(buildInProgressDeal())

    render(<WorkerJobsSurface />)
    fireEvent.press(screen.getByTestId('worker-v5-case-closed-earnings-action'))

    expect(mockReplace).toHaveBeenCalledWith('/(worker)/earnings?ns_worker_screen=4.1-earnings-overview')
  })

  it('keeps approval and completion actions without the two removed information cards', () => {
    buildWorkflow(buildInProgressDeal())
    mockRouteParams = { ns_worker_screen: '2.9-approval-wait' }

    const { rerender } = render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-approval-continue-action')).toBeOnTheScreen()
    expect(screen.queryByText('Không tự thực hiện phần phát sinh')).toBeNull()
    expect(screen.queryByText('Hồ sơ giữ nguyên phạm vi cũ cho tới khi khách phê duyệt trên hệ thống.')).toBeNull()

    mockRouteParams = { ns_worker_screen: '2.10-completion-evidence' }
    rerender(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-completion-submit-action')).toBeOnTheScreen()
    expect(screen.queryByText('Kael đã đối chiếu phạm vi')).toBeNull()
    expect(screen.queryByText('Kael chỉ đối chiếu phạm vi và nguồn bằng chứng; quyền gửi vẫn là hành động rõ ràng của thợ.')).toBeNull()
  })
})
