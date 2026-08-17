import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen, within } from '@testing-library/react-native'
import type { LocalDeal, LocalWorkflowSelectors } from '@nestscout/shared'
import * as ReactNative from 'react-native'

let mockWorkflowValue: any
let mockSessionMetadata: Record<string, unknown>
const mockReplace = jest.fn()
const mockDispatch = jest.fn()
const mockSetStatusBarStyle = jest.fn()

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-status-bar', () => {
  return {
    StatusBar: {
      setStyle: (...args: unknown[]) => mockSetStatusBarStyle(...args),
    },
  }
})

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
import { customerV21SharedStyles } from '../ui/shared-styles'
import { CustomerThemeSystemBar } from '../ui/shared-surfaces'

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
  mockSetStatusBarStyle.mockClear()
  mockSessionMetadata = { default_address: 'Tòa A, Quận 7', full_name: 'Anh Tú' }
  buildWorkflow(null)
})

describe('CustomerHomeSurface v2.1', () => {
  it('keeps status-bar icon contrast aligned with the customer-selected appearance', () => {
    const { rerender } = render(<CustomerThemeSystemBar mode="light" />)

    expect(mockSetStatusBarStyle).toHaveBeenLastCalledWith('dark')

    rerender(<CustomerThemeSystemBar mode="dark" />)

    expect(mockSetStatusBarStyle).toHaveBeenLastCalledWith('light')
  })

  it('keeps the screen frame within the padded scroll content on native layouts', () => {
    expect(ReactNative.StyleSheet.flatten(customerV21SharedStyles.frame)).toMatchObject({
      maxWidth: '100%',
      width: '100%',
    })
  })

  it('routes the Kael dock orb to customer chat, not the command center', () => {
    render(<CustomerV21DockOverlay active="home" />)

    fireEvent.press(screen.getByTestId('customer-v21-kael-accessory'))

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=normal')
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/profile?screen=5.2-command-center')
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/profile?utility=agentic')
  })

  it('renders the accepted V4 home sections without prototype-only claims', () => {
    const storytellingSource = readFileSync(resolve(__dirname, '../home/home-storytelling-card.tsx'), 'utf8')

    render(<CustomerHomeSurface />)

    expect(screen.getByTestId('customer-v21-home-canvas-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-hero-image')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-search')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-home-quick-suggestions')).toBeNull()
    expect(screen.queryByText('Cần hỗ trợ ngay?')).toBeNull()
    expect(screen.getByText('Việc nhà có chúng tôi,\nbạn yên tâm tận hưởng')).toBeOnTheScreen()
    expect(screen.getByText('Kết nối thợ lành nghề  •  Đến nhanh  •  Giá minh bạch')).toBeOnTheScreen()
    expect(screen.getByText('An tâm tuyệt đối\nvới thợ được xác thực')).toHaveStyle({ fontWeight: '700' })
    expect(screen.getByTestId('customer-v21-home-promo-action')).toHaveStyle({ backgroundColor: '#13BFB5' })
    expect(screen.getByTestId('customer-v21-home-promo-action')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-promo-image')).toBeOnTheScreen()
    expect(screen.queryByText('Đánh giá 4.9+')).toBeNull()
    expect(screen.queryByText('Bảo hiểm đầy đủ')).toBeNull()
    expect(storytellingSource).toContain('customer-home-v4-hero-gradient')
    expect(storytellingSource).not.toContain('customer-v21-home-onboarding')
    expect(screen.queryByTestId('customer-v21-home-card-skin')).toBeNull()
    expect(screen.queryByTestId('customer-v21-home-mint-aura')).toBeNull()
    expect(screen.getByTestId('customer-v21-home-empty-card-skin')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-empty-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-top-avatar')).toBeNull()
    expect(screen.queryByTestId('kael-core-v9-monocle')).toBeNull()
    expect(screen.queryByText('Chưa có công việc cần xử lý')).toBeNull()
    expect(screen.queryByText('NestScout đang theo dõi công việc và đặt quyết định đúng chỗ.')).toBeNull()
    expect(screen.queryByText('Kael giúp tạo yêu cầu dịch vụ an toàn.')).toBeNull()
  })

  it('keeps the verified-worker guidance card tight at compact width', () => {
    const initialWindow = ReactNative.Dimensions.get('window')
    const initialScreen = ReactNative.Dimensions.get('screen')
    act(() => {
      ReactNative.Dimensions.set({
        screen: { ...initialScreen, width: 443 },
        window: { ...initialWindow, width: 443 },
      })
    })

    try {
      render(<CustomerHomeSurface />)

      expect(screen.getByTestId('customer-v21-home-guidance')).toHaveStyle({ height: 120 })
    } finally {
      act(() => {
        ReactNative.Dimensions.set({ screen: initialScreen, window: initialWindow })
      })
    }
  })

  it('shows the six approved service paths without fake worker or rating data', () => {
    render(<CustomerHomeSurface />)

    for (const service of ['electrical', 'plumbing', 'home_cleaning', 'hvac_basic_maintenance', 'upholstery_care', 'handyman_minor_installation']) {
      expect(screen.getByTestId(`customer-v21-service-${service}`)).toBeOnTheScreen()
      expect(screen.getByTestId(`customer-v21-service-${service}-visual-panel`)).toBeOnTheScreen()
    }
    expect(screen.queryByText(/rating|4\.9|Nguyễn Văn Minh/i)).toBeNull()
    expect(screen.getByText('Chưa có hoạt động dịch vụ')).toBeOnTheScreen()
  })

  it('uses a distinct transparent service-start icon without a square tile for the home empty state', () => {
    render(<CustomerHomeSurface />)

    const asset = screen.getByLabelText('Chưa có hoạt động dịch vụ')
    const assetStyle = ReactNative.StyleSheet.flatten(asset.props.style)
    const assetsSource = readFileSync(resolve(__dirname, '../ui/assets.ts'), 'utf8')
    const homeSurfaceSource = readFileSync(resolve(__dirname, '../v21/surfaces.tsx'), 'utf8')
    const sharedSurfacesSource = readFileSync(resolve(__dirname, '../ui/shared-surfaces.tsx'), 'utf8')

    expect(assetStyle).toMatchObject({ borderWidth: 0 })
    expect(assetStyle.backgroundColor).toBeUndefined()
    expect(assetsSource).toContain("serviceStart: require('@/assets/client-image-icons/client-service-start.png')")
    expect(homeSurfaceSource).toContain('bareAsset')
    expect(homeSurfaceSource).toContain('image={customerV21Assets.serviceStart}')
    expect(sharedSurfacesSource).toContain('<AssetTile bare={bareAsset} image={image} label={title} size={80} sourceAura={!bareAsset} />')
    expect(existsSync(resolve(__dirname, '../../../assets/client-image-icons/client-service-start.png'))).toBe(true)
  })

  // A missing PNG breaks require() at module load, so asset existence is checked
  // here; which asset a tile shows is checked by the render cases below. The
  // shared-icon fallbacks each expanded service used to reuse must not return,
  // and only absence can say that.
  it('ships the transparent nav-only Activity icon', () => {
    expect(existsSync(resolve(__dirname, '../../../assets/client-image-icons/client-activity-nav.png'))).toBe(true)
  })

  it('uses distinct generated icon assets for each expanded service path', () => {
    const assetsSource = readFileSync(resolve(__dirname, '../ui/assets.ts'), 'utf8')

    expect(assetsSource).not.toContain('hvac_basic_maintenance: customerV21Assets.tools')
    expect(assetsSource).not.toContain('upholstery_care: customerV21ServiceAssets.cleaning')
    expect(assetsSource).not.toContain('handyman_minor_installation: customerV21Assets.tools')

    expect(existsSync(resolve(__dirname, '../ui/assets/service-icons/client-service-hvac.png'))).toBe(true)
    expect(existsSync(resolve(__dirname, '../ui/assets/service-icons/client-service-upholstery-care.png'))).toBe(true)
    expect(existsSync(resolve(__dirname, '../ui/assets/service-icons/client-service-handyman-installation.png'))).toBe(true)
  })

  it('renders the approved photo artwork for each Home v4 service tile', () => {
    const assetsSource = readFileSync(resolve(__dirname, '../ui/assets.ts'), 'utf8')
    const sharedSurfacesSource = readFileSync(resolve(__dirname, '../ui/shared-surfaces.tsx'), 'utf8')
    const tileAssets = [
      'service-tile-electrical.png',
      'service-tile-plumbing.png',
      'service-tile-cleaning.png',
      'service-tile-hvac.png',
      'service-tile-upholstery.png',
      'service-tile-handyman.png',
    ]

    render(<CustomerHomeSurface />)

    expect(sharedSurfacesSource).toContain('customerV21HomeV4Assets.serviceTiles[service]')
    for (const asset of tileAssets) {
      expect(assetsSource).toContain(asset)
      expect(existsSync(resolve(__dirname, `../../../assets/customer-home-v4/${asset}`))).toBe(true)
    }
    for (const service of ['electrical', 'plumbing', 'home_cleaning', 'hvac_basic_maintenance', 'upholstery_care', 'handyman_minor_installation']) {
      expect(screen.getByTestId(`customer-v21-service-${service}-image`)).toBeOnTheScreen()
      expect(screen.getByTestId(`customer-v21-service-${service}-label`)).toBeOnTheScreen()
      expect(screen.getByTestId(`customer-v21-service-${service}-title`)).toBeOnTheScreen()
    }
  })

  it('maps each approved Workart to its active job service without moving the asset', () => {
    const assetsSource = readFileSync(resolve(__dirname, '../ui/assets.ts'), 'utf8')
    const jobCardSource = readFileSync(resolve(__dirname, '../home/home-current-job-card.tsx'), 'utf8')
    const workartAssets = [
      ['electrical', 'task_electrical_workart_384.png'],
      ['plumbing', 'task_plumbing_workart_384.png'],
      ['hvac_basic_maintenance', 'task_hvac_workart_384.png'],
      ['upholstery_care', 'task_upholstery_workart_384.png'],
      ['handyman_minor_installation', 'task_handyman_workart_384.png'],
    ] as const

    for (const [service, asset] of workartAssets) {
      expect(assetsSource).toContain(`${service}: require('@/assets/customer-home-v4/${asset}')`)
      expect(existsSync(resolve(__dirname, `../../../assets/customer-home-v4/${asset}`))).toBe(true)
    }
    expect(assetsSource).toContain("home_cleaning: require('@/assets/customer-home-v4/service_cleaning.png')")
    expect(jobCardSource).toContain('customerV21HomeV4Assets.services[serviceAssetKey(deal.draft.serviceType)]')
    expect(jobCardSource).toContain('style={[styles.asset, { height: q(82), left: q(27), top: q(15), width: q(82) }]}')
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
    expect(screen.getByTestId('customer-v21-active-case-meta')).toHaveTextContent(/Sớm nhất có thể/)
    expect(screen.getByTestId('customer-v21-active-case-meta')).toHaveTextContent(/Thời gian dự kiến: đang cập nhật/)
    expect(screen.getByTestId('customer-v21-active-case-meta')).not.toHaveTextContent(/Ổ cắm nóng/)
    expect(screen.getByTestId('customer-v21-active-case-meta')).not.toHaveTextContent(/180\.000đ - 260\.000đ/)
    expect(screen.getByTestId('customer-v21-active-case-meta')).not.toHaveTextContent(/Tòa A, Quận 7/)
    expect(screen.getByTestId('customer-v21-active-case-meta')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-active-case-progress')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-active-case')).not.toHaveTextContent(/4\.9|rating|--/)
    expect(screen.getByLabelText(/^Bước \d+ trên \d+$/)).toBeOnTheScreen()
    expect(screen.queryByLabelText(/^Step \d+ of \d+$/)).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-active-case'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
  })

  it('keeps draft cards connected to booking instead of opening a case route', () => {
    const deal = buildDeal()
    deal.status = 'draft'
    buildWorkflow(deal)

    render(<CustomerHomeSurface />)

    fireEvent.press(screen.getByTestId('customer-v21-active-case'))

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/booking')
    expect(mockReplace).not.toHaveBeenCalledWith(expect.stringContaining('mode=case'))
  })

  it('renders a duration only when the job carries structured scope data', () => {
    const deal = buildDeal()
    deal.draft.description = '[clean_scope] Dịch vụ vệ sinh nhà. Thời lượng dự kiến: 120–180 phút'
    buildWorkflow(deal)

    render(<CustomerHomeSurface />)

    const activeCase = screen.getByTestId('customer-v21-active-case')
    expect(screen.getByTestId('customer-v21-active-case-meta')).toHaveTextContent(/Thời gian dự kiến: 2 – 3 giờ/)
    expect(activeCase).not.toHaveTextContent('clean_scope')
    expect(screen.getByTestId('customer-v21-active-case-progress-fill')).toBeOnTheScreen()
  })

  it('matches the native v4 status badge and progress rail treatment', () => {
    buildWorkflow(buildDeal())

    render(<CustomerHomeSurface />)

    expect(screen.getByTestId('customer-v21-active-case-status')).toHaveStyle({ backgroundColor: '#DDF7F3' })
    expect(within(screen.getByTestId('customer-v21-active-case-status')).getByText('Đang tìm thợ')).toHaveStyle({ color: '#10AA9F' })
    expect(screen.getByTestId('customer-v21-active-case-progress-track')).toHaveStyle({ backgroundColor: '#D6E4E2' })
    expect(screen.getByTestId('customer-v21-active-case-progress-fill')).toHaveStyle({ backgroundColor: '#13BFB5' })
    expect(screen.getByTestId('customer-v21-active-case-step-1')).toHaveStyle({ backgroundColor: '#13BFB5', borderWidth: 0 })
    expect(screen.getByTestId('customer-v21-active-case-step-3')).toHaveStyle({ backgroundColor: '#FFFFFF', borderColor: '#C8D9D7' })
    expect(within(screen.getByTestId('customer-v21-active-case-step-3')).getByText('3')).toHaveStyle({ color: '#71858C' })
    expect(ReactNative.StyleSheet.flatten(screen.getByTestId('customer-v21-active-case-step-3').props.style).borderWidth).toBeGreaterThan(0)
  })

  it('does not expose raw problem taxonomy or intake copy in the home card', () => {
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

    expect(screen.getByTestId('customer-v21-active-case')).not.toHaveTextContent(/Rò nước/)
    expect(screen.getByTestId('customer-v21-active-case')).not.toHaveTextContent(/plumbing: pipe_leak/)
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

    expect(screen.getByTestId('customer-v21-active-case')).not.toHaveTextContent(/Ro ri lavabo/)
    expect(screen.getByTestId('customer-v21-active-case')).not.toHaveTextContent('Ro ri lavabo')
  })
})
