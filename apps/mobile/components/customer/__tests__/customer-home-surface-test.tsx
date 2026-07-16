import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react-native'
import type { LocalDeal, LocalWorkflowSelectors } from '@nestscout/shared'

let mockWorkflowValue: any
let mockSessionMetadata: Record<string, unknown>
const mockReplace = jest.fn()
const mockDispatch = jest.fn()

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => callback(),
  useLocalSearchParams: () => ({}),
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

import { CustomerHomeSurface, CustomerV21DockOverlay } from '../customer-surfaces'
import { homeStorytellingMotionContract } from '../v21/home-storytelling-card'

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
  mockReplace.mockClear()
  mockSessionMetadata = { default_address: 'Tòa A, Quận 7', full_name: 'Anh Tú' }
  buildWorkflow(null)
})

describe('CustomerHomeSurface v2.1', () => {
  it('routes the Kael dock orb to customer chat, not the command center', () => {
    render(<CustomerV21DockOverlay active="home" />)

    fireEvent.press(screen.getByTestId('customer-v21-kael-accessory'))

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=normal')
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/profile?screen=5.2-command-center')
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/profile?utility=agentic')
  })

  it('renders the rebuilt Section 2.1 Kael storytelling card without the legacy hero', () => {
    const storytellingSource = readFileSync(resolve(__dirname, '../v21/home-storytelling-card.tsx'), 'utf8')

    render(<CustomerHomeSurface />)

    fireEvent(screen.getByTestId('customer-v21-home-hero'), 'layout', {
      nativeEvent: { layout: { height: 260, width: 600, x: 0, y: 0 } },
    })

    expect(screen.getByTestId('customer-v21-home-canvas-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-storytelling')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-storytelling-backdrop')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-storytelling-copy')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-storytelling-orb')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-storytelling-tile-bars-motion')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-storytelling-tile-list-motion')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-storytelling-tile-spark-motion')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-storytelling-orb-reaction')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-storytelling-steps')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-story-step-1')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-story-step-2')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-story-step-3')).toBeOnTheScreen()
    expect(screen.getByLabelText('Kael luôn sẵn sàng hỗ trợ. Kael quan sát và gợi ý. Bạn luôn là người quyết định. Nhìn vấn đề. Hiểu ngữ cảnh. Bạn quyết định.')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-home-storytelling-control')).toBeNull()
    expect(storytellingSource).not.toContain('>KAEL ORB<')
    expect(storytellingSource).not.toContain('Bạn luôn kiểm soát')
    expect(storytellingSource).not.toContain('—')
    expect(storytellingSource).toContain('translate(158 220) scale(1.26) translate(-158 -278)')
    expect(storytellingSource).toContain('translate(145 730) scale(1.22) translate(-156 -696)')
    expect(storytellingSource).toContain('translate(1410 389) scale(1.26) translate(-1371 -389)')
    expect(storytellingSource).toContain('if (reduceMotion) return')
    expect(storytellingSource).toContain('onLayout={handleCardLayout}')
    expect(storytellingSource).toContain('homeStorytellingMotionContract.orb')
    expect(storytellingSource).toContain('homeStorytellingMotionContract.bars')
    expect(storytellingSource).toContain('homeStorytellingMotionContract.list')
    expect(storytellingSource).toContain('homeStorytellingMotionContract.spark')
    expect(storytellingSource).toContain('withSequence(')
    expect(storytellingSource).not.toContain('withDelay(')
    expect(storytellingSource).not.toContain('withRepeat(')
    expect(homeStorytellingMotionContract).toEqual({
      bars: { duration: 6800, originX: 1122, originY: 177, peakRotation: 5, peakTranslateY: -8, restRotation: 8 },
      list: { duration: 7200, originX: 1648, originY: 403, peakRotation: 10, peakTranslateY: 7, restRotation: 7 },
      orb: { duration: 5600, originX: 1367, originY: 389, peakRotation: 0.45, peakTranslateY: -9, restRotation: -0.3 },
      spark: { duration: 6200, originX: 1138, originY: 599, peakRotation: -1, peakTranslateY: -7, restRotation: -4 },
    })
    expect(screen.queryByText('Kael sẵn sàng hỗ trợ, công việc vẫn do bạn kiểm soát.')).toBeNull()
    expect(screen.queryByTestId('customer-v21-home-card-skin')).toBeNull()
    expect(screen.queryByTestId('customer-v21-home-mint-aura')).toBeNull()
    expect(screen.getByTestId('customer-v21-home-empty-card-skin')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-empty-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-stage-logo')).toBeNull()
    expect(screen.queryByTestId('customer-v21-stage-logo-lottie')).toBeNull()
    expect(screen.queryByTestId('customer-v21-stage-logo-static')).toBeNull()
    expect(screen.queryByTestId('customer-v21-top-avatar')).toBeNull()
    expect(screen.queryByTestId('kael-core-v9-monocle')).toBeNull()
    expect(screen.queryAllByTestId('kael-core-v9-eye')).toHaveLength(0)
    expect(screen.queryByText('◌')).toBeNull()
    expect(screen.queryByTestId('customer-v21-home-butler-pill')).toBeNull()
    expect(screen.queryByTestId('customer-v21-home-status-chip')).toBeNull()
    expect(screen.queryByText('Chưa có công việc cần xử lý')).toBeNull()
    expect(screen.queryByText('NestScout đang theo dõi công việc và đặt quyết định đúng chỗ.')).toBeNull()
    expect(screen.queryByText('Kael giúp tạo yêu cầu dịch vụ an toàn.')).toBeNull()
  })

  it('shows the six approved service paths without fake worker or rating data', () => {
    render(<CustomerHomeSurface />)

    expect(screen.getByText('Sửa điện')).toBeOnTheScreen()
    expect(screen.getByText('Sửa nước')).toBeOnTheScreen()
    expect(screen.getByText('Vệ sinh nhà cửa')).toBeOnTheScreen()
    expect(screen.getByText('Điều hòa & Không khí')).toBeOnTheScreen()
    expect(screen.getByText('Sofa, nệm, rèm, thảm')).toBeOnTheScreen()
    expect(screen.getByText('Sửa vặt & Lắp đặt nhỏ')).toBeOnTheScreen()
    expect(screen.queryByText(/rating|4\.9|Nguyễn Văn Minh/i)).toBeNull()
    expect(screen.getByText('Chưa có hoạt động dịch vụ')).toBeOnTheScreen()
  })

  it('uses distinct generated icon assets for each expanded service path', () => {
    const assetsSource = readFileSync(resolve(__dirname, '../v21/assets.ts'), 'utf8')

    expect(assetsSource).toContain("hvac_basic_maintenance: require('./assets/service-icons/client-service-hvac.png')")
    expect(assetsSource).toContain("upholstery_care: require('./assets/service-icons/client-service-upholstery-care.png')")
    expect(assetsSource).toContain("handyman_minor_installation: require('./assets/service-icons/client-service-handyman-installation.png')")
    expect(assetsSource).not.toContain('hvac_basic_maintenance: customerV21Assets.tools')
    expect(assetsSource).not.toContain('upholstery_care: customerV21ServiceAssets.cleaning')
    expect(assetsSource).not.toContain('handyman_minor_installation: customerV21Assets.tools')

    expect(existsSync(resolve(__dirname, '../v21/assets/service-icons/client-service-hvac.png'))).toBe(true)
    expect(existsSync(resolve(__dirname, '../v21/assets/service-icons/client-service-upholstery-care.png'))).toBe(true)
    expect(existsSync(resolve(__dirname, '../v21/assets/service-icons/client-service-handyman-installation.png'))).toBe(true)
  })

  it('routes a service tile to Services without creating a job', () => {
    render(<CustomerHomeSurface />)

    fireEvent.press(screen.getByTestId('customer-v21-service-electrical'))

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'start_home_service', serviceType: 'electrical' })
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/booking?service=electrical')
    expect(mockWorkflowValue.actions.createRemoteJobFromDraft).toBeUndefined()
  })

  it('opens an expansion service in the same production Basic Intake path', () => {
    render(<CustomerHomeSurface />)

    fireEvent.press(screen.getByTestId('customer-v21-service-hvac_basic_maintenance'))

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'start_home_service', serviceType: 'hvac' })
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/booking?service=hvac_basic_maintenance')
    expect(mockWorkflowValue.actions.createRemoteJobFromDraft).toBeUndefined()
  })

  it('renders active case fields only from real workflow state', () => {
    buildWorkflow(buildDeal())

    render(<CustomerHomeSurface />)

    expect(screen.getByText(/^#MOH-\d{2}[A-Z0-9]{4}$/)).toBeOnTheScreen()
    expect(screen.queryByText('Đang tạo mã')).toBeNull()
    expect(screen.getByText('Ổ cắm nóng')).toBeOnTheScreen()
    expect(screen.getByText('180.000đ - 260.000đ')).toBeOnTheScreen()
    expect(screen.getAllByText('Tòa A, Quận 7').length).toBeGreaterThan(0)
    expect(screen.getByTestId('customer-v21-active-case-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-active-case-service-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-active-case-area-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-active-case-estimate-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-active-case')).not.toHaveTextContent(/4\.9|rating|--/)

    fireEvent.press(screen.getByTestId('customer-v21-active-case-open'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
  })

  it('keeps active case problem copy short and localizes raw taxonomy', () => {
    const deal = buildDeal()
    deal.draft.serviceType = 'plumbing'
    deal.draft.problemChips = []
    deal.draft.inferredProblemLabel = null
    deal.draft.description = ''
    if (deal.broadcast) {
      deal.broadcast.serviceType = 'plumbing'
      deal.broadcast.problemSummary = 'plumbing: pipe_leak'
    }
    if (deal.estimate) {
      deal.estimate.problemLabel = 'plumbing: pipe_leak'
    }
    buildWorkflow(deal)

    render(<CustomerHomeSurface />)

    expect(screen.getByTestId('customer-v21-active-case-problem')).toHaveTextContent(/Rò nước/)
    expect(screen.getByTestId('customer-v21-active-case-problem')).not.toHaveTextContent(/plumbing: pipe_leak/)
    expect(screen.getByTestId('customer-v21-active-case-problem-mint-aura')).toBeOnTheScreen()
  })

  it('does not render an unaccented Kael summary in Vietnamese mode', () => {
    const deal = buildDeal()
    deal.draft.serviceType = 'plumbing'
    deal.draft.problemChips = ['Ống rò rỉ']
    deal.draft.description = 'Lavabo trong can ho ro ri nhe, can tho kiem tra gioang va siphon.'
    if (deal.broadcast) {
      deal.broadcast.serviceType = 'plumbing'
      deal.broadcast.problemSummary = 'Ro ri lavabo can kiem tra tai cho'
    }
    if (deal.estimate) {
      deal.estimate.problemLabel = 'Ro ri lavabo can kiem tra tai cho'
    }
    buildWorkflow(deal)

    render(<CustomerHomeSurface />)

    expect(screen.getByTestId('customer-v21-active-case-problem')).toHaveTextContent(/Ống rò rỉ/)
    expect(screen.getByTestId('customer-v21-active-case-problem')).not.toHaveTextContent('Ro ri lavabo')
  })
})
