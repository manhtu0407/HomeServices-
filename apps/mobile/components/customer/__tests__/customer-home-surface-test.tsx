import { fireEvent, render, screen } from '@testing-library/react-native'
import type { LocalDeal, LocalWorkflowSelectors } from '@nestscout/shared'
import { SafeAreaProvider } from 'react-native-safe-area-context'

let mockWorkflowValue: any
let mockSessionMetadata: Record<string, unknown>
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockDispatch = jest.fn()

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({
    session: {
      user: {
        email: 'tu@example.com',
        id: 'customer_test_1',
        user_metadata: mockSessionMetadata,
      },
    },
  }),
}))

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => mockWorkflowValue,
}))

jest.mock('expo-audio', () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
  RecordingPresets: {
    HIGH_QUALITY: {},
  },
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioRecorder: () => ({
    getURI: jest.fn(() => null),
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
  }),
  useAudioRecorderState: () => ({
    durationMillis: 0,
    isRecording: false,
  }),
}))

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images', Videos: 'Videos' },
  launchImageLibraryAsync: jest.fn(async () => ({ assets: [], canceled: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => 'vi',
  }
})

import { CustomerHomeSurface } from '../customer-surfaces'

const TEST_SAFE_AREA_METRICS = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 0, left: 0, right: 0, top: 0 },
}

function renderWithSafeArea(ui: Parameters<typeof render>[0]) {
  return render(
    <SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>
      {ui}
    </SafeAreaProvider>,
  )
}

function buildDeal(): LocalDeal {
  return {
    backendStatus: 'broadcasting',
    broadcast: {
      broadcastId: 'broadcast_test_1',
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'Quận 7',
      jobId: 'job_test_1',
      prebrief: [],
      problemSummary: 'Ổ cắm nóng',
      secondsRemaining: 42,
      serviceType: 'electrical',
      status: 'sent',
    },
    completionNotes: null,
    completionPhotoUrls: [],
    draft: {
      addressLabel: 'Tòa A, Quận 7',
      description: 'Ổ cắm phòng khách bị nóng và có mùi khét',
      districtLabel: 'Quận 7',
      inferredProblemLabel: null,
      mediaCount: 1,
      needsServiceChoice: false,
      problemChips: ['Ổ cắm/công tắc hỏng'],
      serviceType: 'electrical',
      source: 'booking',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: {
      advisory: 'Kael có thể cập nhật khi phạm vi thay đổi.',
      complexity: 'medium',
      confidenceLabel: '84%',
      disclaimer: 'Ước tính theo dữ liệu hiện có.',
      hasVndPrice: true,
      priceRangeLabel: '180.000đ - 260.000đ',
      problemLabel: 'Ổ cắm nóng',
    },
    finalPrice: null,
    id: 'job_test_1',
    payment: null,
    scopeChange: null,
    status: 'broadcasting',
  }
}

function buildWorkflow(deal: LocalDeal | null) {
  const selectors: LocalWorkflowSelectors = {
    canConfirmCustomerSearch: false,
    canCustomerCancelDeal: Boolean(deal),
    canCustomerConfirmCompletion: false,
    canCustomerSubmitReview: false,
    canWorkerAccept: false,
    canWorkerAdvance: false,
    canWorkerSeeFullAddress: false,
    currentBackendStatus: deal?.backendStatus ?? deal?.status ?? null,
    currentStatus: deal?.status ?? null,
    customerSearchState: deal ? 'searching' : 'idle',
    draftValidationMessage: null,
    hasLocalBroadcast: Boolean(deal?.broadcast),
    paymentLocked: true,
    reviewLocked: true,
    scheduleMode: 'now_only',
  }

  mockWorkflowValue = {
    actions: {},
    dispatch: mockDispatch,
    notificationUnreadCount: 0,
    notifications: [],
    selectors,
    state: {
      deal,
      lastError: null,
      lastRemoteSyncAt: null,
      workerGate: 'remote_backend',
    },
  }
}

beforeEach(() => {
  mockDispatch.mockClear()
  mockPush.mockClear()
  mockReplace.mockClear()
  mockSessionMetadata = { default_address: 'Tòa A, Quận 7', full_name: 'Anh Tú' }
  buildWorkflow(null)
})

describe('CustomerHomeSurface', () => {
  it('routes the home Kael command to full-screen customer chat', () => {
    renderWithSafeArea(<CustomerHomeSurface />)

    fireEvent.press(screen.getByTestId('customer-home-kael-open'))

    expect(mockPush).toHaveBeenCalledWith('/(customer)/kael-chat')
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/profile?screen=5.2-command-center')
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/profile?utility=agentic')
  })

  it('renders the current home glass and apartment context layers', () => {
    renderWithSafeArea(<CustomerHomeSurface />)

    expect(screen.getByTestId('customer-home-surface')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-home-ios26-foundation-section')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-home-signature-v4')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-home-layer-stack')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-home-hero-depth-grid')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-home-apartment-context')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-home-layered-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-home-kael-command')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-home-canvas-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-home-card-skin')).toBeNull()
    expect(screen.queryByTestId('customer-v21-home-empty-card-skin')).toBeNull()
    expect(screen.queryByTestId('customer-v21-active-case-skin')).toBeNull()
    expect(screen.queryByTestId('customer-v21-stage-logo')).toBeNull()
    expect(screen.queryByTestId('customer-v21-top-avatar')).toBeNull()
    expect(screen.queryByText('Kael giúp tạo yêu cầu dịch vụ an toàn.')).toBeNull()
  })

  it('shows only the three supported services and no fake AC/worker/rating data', () => {
    renderWithSafeArea(<CustomerHomeSurface />)

    expect(screen.getByTestId('customer-shell-service-electrical')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-shell-service-plumbing')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-shell-service-cleaning')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-shell-service-ac')).toBeNull()
    expect(screen.queryByText(/máy lạnh|rating|4\.9|Nguyễn Văn Minh/i)).toBeNull()
    expect(screen.getByTestId('customer-home-real-shortcuts')).toBeOnTheScreen()
  })

  it('routes a service tile to booking without creating a job', () => {
    renderWithSafeArea(<CustomerHomeSurface />)

    fireEvent.press(screen.getByTestId('customer-shell-service-electrical'))

    expect(mockDispatch).not.toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith('/(customer)/booking?serviceType=electrical')
    expect(mockWorkflowValue.actions.createRemoteJobFromDraft).toBeUndefined()
  })

  it('renders active case fields only from real workflow state', () => {
    buildWorkflow(buildDeal())

    renderWithSafeArea(<CustomerHomeSurface />)

    expect(screen.queryByText(/^#MOH-\d{2}[A-Z0-9]{4}$/)).toBeNull()
    expect(screen.queryByText('Đang tạo mã')).toBeNull()
    expect(screen.getByTestId('customer-home-active-local-deal')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-home-active-local-deal')).toHaveTextContent(/Sửa điện/)
    expect(screen.getByTestId('customer-home-active-local-deal')).toHaveTextContent(/Quận 7/)
    expect(screen.getByTestId('customer-home-active-local-deal')).not.toHaveTextContent(/4\.9|rating|--/)

    fireEvent.press(screen.getByTestId('customer-home-active-local-deal'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/history')
  })

  it('keeps active case problem copy localized instead of leaking raw taxonomy', () => {
    const deal = buildDeal()
    deal.draft.serviceType = 'plumbing'
    deal.draft.problemChips = ['plumbing: pipe_leak']
    if (deal.broadcast) {
      deal.broadcast.serviceType = 'plumbing'
      deal.broadcast.problemSummary = 'plumbing: pipe_leak'
    }
    if (deal.estimate) {
      deal.estimate.problemLabel = 'plumbing: pipe_leak'
    }
    buildWorkflow(deal)

    renderWithSafeArea(<CustomerHomeSurface />)

    expect(screen.getByTestId('customer-home-active-local-deal')).not.toHaveTextContent(/plumbing: pipe_leak/)
    expect(screen.getByTestId('customer-home-active-local-deal')).toHaveTextContent(/Rò nước|Chưa rõ/)
  })
})
