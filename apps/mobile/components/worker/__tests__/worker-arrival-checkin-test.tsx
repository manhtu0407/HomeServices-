import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { LocalDeal } from '@nestscout/shared'
import type { EarningsResponse, WorkerProfileResponse } from '@/lib/api-types'

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
  uploadJobMediaDrafts: jest.fn(),
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
describe('Worker V5 arrival check-in', () => {
  beforeEach(() => {
    mockPathname = '/(worker)/jobs'
    mockRouteParams = { ns_worker_screen: '2.5-arrival-checkin' }
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
    buildWorkflow(buildOnWayDeal())
  })

  it('renders the V5 arrival screen instead of the deleted split jobs surface', () => {
    render(<WorkerJobsSurface />)

    expect(screen.getByTestId('worker-v5-screen-2.5-arrival-checkin')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-checkin-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-checkin-arrived-action')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-jobs-surface')).toBeNull()
    expect(screen.queryByTestId('worker-jobs-next-status-action')).toBeNull()
  })

  it('continues to the V5 in-progress screen from the check-in primary action', async () => {
    render(<WorkerJobsSurface />)

    fireEvent.press(screen.getByTestId('worker-v5-checkin-arrived-action'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(worker)/jobs?ns_worker_screen=2.7-in-progress')
    })
  })
})