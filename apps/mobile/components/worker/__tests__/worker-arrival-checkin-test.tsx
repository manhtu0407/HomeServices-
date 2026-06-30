import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import type { LocalDeal } from '@nestscout/shared'
import type { EarningsResponse, WorkerProfileResponse } from '@/lib/api-types'

let mockWorkflowValue: any
let mockPathname: string
let mockRouteParams: Record<string, string | string[] | undefined>
const mockReplace = jest.fn()
const mockUseJobChatThread = jest.fn()
const mockUploadJobMediaDrafts = jest.fn()
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
  useAuth: () => ({ role: 'worker', session: { user: { id: 'worker_test_1' } }, signOut: jest.fn(async () => undefined) }),
}))

jest.mock('@/lib/use-job-chat-thread', () => ({
  useJobChatThread: (jobId: string | null, enabled: boolean) => mockUseJobChatThread(jobId, enabled),
}))

jest.mock('@/lib/media-upload', () => ({
  uploadJobMediaDrafts: (...args: unknown[]) => mockUploadJobMediaDrafts(...args),
  uploadWorkerVerificationDrafts: jest.fn(),
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
    useAppLanguage: () => 'vi',
  }
})

import { WorkerJobsSurface } from '../worker-surfaces'

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
      estimatedEarningLabel: '120.000đ - 180.000đ',
      estimatedPriceLabel: '180.000đ - 260.000đ',
      fullAddressLabel: 'Tòa A, Quận 1',
      fullAddressVisible: true,
      generalArea: 'Quận 1',
      jobId: 'job_test_1',
      prebrief: ['Kael đã tóm tắt phạm vi.'],
      problemSummary: 'Ổ cắm chập chờn',
      secondsRemaining: null,
      serviceType: 'electrical',
      status: 'accepted',
    },
    completionNotes: null,
    completionPhotoUrls: [],
    draft: {
      addressLabel: 'Tòa A, Quận 1',
      description: 'Ổ cắm phòng khách chập chờn',
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
    status: 'worker_on_way',
  }
}

function buildWorkflow(deal: LocalDeal) {
  mockWorkflowValue = {
    actions: {
      requestScopeChange: jest.fn(async () => true),
      requestWorkerCancellation: jest.fn(async () => true),
      workerAcceptBroadcast: jest.fn(async () => true),
      workerDeclineBroadcast: jest.fn(async () => true),
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

function alertButtons(alertSpy: jest.SpyInstance, callIndex = 0) {
  const buttons = alertSpy.mock.calls[callIndex]?.[2] as Array<{ text: string; onPress?: () => void }> | undefined
  expect(buttons).toBeDefined()
  return buttons as Array<{ text: string; onPress?: () => void }>
}

describe('Worker arrival lobby check-in (§32.7 Step 1)', () => {
  let alertSpy: jest.SpyInstance

  beforeEach(() => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { tab: 'active' }
    mockReplace.mockClear()
    mockUploadJobMediaDrafts.mockReset()
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
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    ;(ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true })
    ;(ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///lobby.jpg', fileName: 'lobby.jpg', mimeType: 'image/jpeg', fileSize: 1234 }],
    })
    buildWorkflow(buildOnWayDeal())
  })

  afterEach(() => {
    alertSpy.mockRestore()
  })

  it('uploads a lobby photo to the access_check_in stage and sends the manual_photo check-in', async () => {
    mockUploadJobMediaDrafts.mockResolvedValue({
      success: true,
      mediaRefs: ['supabase://job-media/job_test_1/access_check_in/lobby.jpg'],
    })

    render(<WorkerJobsSurface />)

    fireEvent.press(screen.getByTestId('worker-jobs-next-status-action'))
    expect(alertSpy).toHaveBeenCalledWith(
      'Xác nhận đã tới sảnh?',
      expect.stringContaining('Cho thợ lên'),
      expect.any(Array),
    )

    const pickButton = alertButtons(alertSpy).find((button) => button.text === 'Thêm ảnh sảnh')
    expect(pickButton).toBeDefined()
    await act(async () => {
      pickButton?.onPress?.()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mockUploadJobMediaDrafts).toHaveBeenCalledWith(
        'job_test_1',
        [expect.objectContaining({ uri: 'file:///lobby.jpg', type: 'image' })],
        'access_check_in',
      )
    })
    await waitFor(() => {
      expect(mockWorkflowValue.actions.workerUpdateStatus).toHaveBeenCalledWith('arrived', {
        access_check_in: {
          mode: 'manual_photo',
          photo_urls: ['supabase://job-media/job_test_1/access_check_in/lobby.jpg'],
        },
      })
    })
  })

  it('allows skipping the check-in with an explicit confirmation (plain arrived, unit stays locked)', async () => {
    render(<WorkerJobsSurface />)

    fireEvent.press(screen.getByTestId('worker-jobs-next-status-action'))
    const skipButton = alertButtons(alertSpy).find((button) => button.text === 'Tiếp tục không check-in')
    expect(skipButton).toBeDefined()
    await act(async () => {
      skipButton?.onPress?.()
      await Promise.resolve()
    })

    const confirmButtons = alertButtons(alertSpy, 1)
    const confirmSkip = confirmButtons.find((button) => button.text === 'Vẫn báo đã đến')
    expect(confirmSkip).toBeDefined()
    await act(async () => {
      confirmSkip?.onPress?.()
      await Promise.resolve()
    })

    expect(mockUploadJobMediaDrafts).not.toHaveBeenCalled()
    expect(mockWorkflowValue.actions.workerUpdateStatus).toHaveBeenCalledWith('arrived')
  })

  it('does not mark arrived when the check-in photo upload fails', async () => {
    mockUploadJobMediaDrafts.mockResolvedValue({ success: false, error: 'Không thể tải ảnh/video lên kho media' })

    render(<WorkerJobsSurface />)

    fireEvent.press(screen.getByTestId('worker-jobs-next-status-action'))
    const pickButton = alertButtons(alertSpy).find((button) => button.text === 'Thêm ảnh sảnh')
    await act(async () => {
      pickButton?.onPress?.()
      await Promise.resolve()
    })

    await waitFor(() => expect(mockUploadJobMediaDrafts).toHaveBeenCalled())
    expect(mockWorkflowValue.actions.workerUpdateStatus).not.toHaveBeenCalled()
    expect(alertSpy).toHaveBeenCalledWith('Chưa tải được ảnh check-in', 'Không thể tải ảnh/video lên kho media')
  })
})
