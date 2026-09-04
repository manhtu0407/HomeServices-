import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react-native'
import type { LocalDeal, LocalWorkflowSelectors } from '@nestscout/shared'
import { Dimensions, StyleSheet, Text } from 'react-native'

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
import { stepForStatus } from '../kael-chat/case-stage-display-model'
import { scaledTypography } from '@/design/theme'
import { clearPendingKaelChatMessage, peekPendingKaelChatMessage } from '@/lib/pending-kael-chat-message'
import { customerV21BookingWorkartAssets } from '../ui/assets'
import { customerV21SharedStyles, customerV21SurfaceContentWidth } from '../ui/shared-styles'
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
    scheduledAt: '2026-08-17T01:00:00.000Z',
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
  clearPendingKaelChatMessage('customer_test_1')
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
    expect(StyleSheet.flatten(customerV21SharedStyles.frame)).toMatchObject({
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

  it('hands a Home search question to a fresh regular Kael Chat session', () => {
    render(<CustomerHomeSurface />)

    const search = screen.getByPlaceholderText('Bạn cần hỗ trợ việc gì?')
    fireEvent.changeText(search, 'Ổ cắm phòng khách phát ra tiếng lép bép')
    fireEvent(search, 'submitEditing')

    expect(mockReplace).toHaveBeenCalledWith(
      '/(customer)/kael-chat?mode=normal&newSession=home-search',
    )
    expect(peekPendingKaelChatMessage('customer_test_1')).toBe('Ổ cắm phòng khách phát ra tiếng lép bép')
  })

  it('opens the fresh regular Kael Chat route when the Home search is focused', () => {
    render(<CustomerHomeSurface />)

    fireEvent(screen.getByPlaceholderText('Bạn cần hỗ trợ việc gì?'), 'focus')

    expect(mockReplace).toHaveBeenCalledWith(
      '/(customer)/kael-chat?mode=normal&newSession=home-search',
    )
  })

  it('renders the accepted V4 home sections without prototype-only claims', () => {
    const storytellingSource = readFileSync(resolve(__dirname, '../home/home-storytelling-card.tsx'), 'utf8')

    render(<CustomerHomeSurface />)

    expect(screen.getByTestId('customer-v21-home-canvas-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-hero-image')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-search')).toBeOnTheScreen()
    const searchScale = Math.min(Math.max(Dimensions.get('window').width - 32, 280) / 857, 1)
    const searchInputStyle = StyleSheet.flatten(screen.getByPlaceholderText('Bạn cần hỗ trợ việc gì?').props.style)
    const searchTypography = scaledTypography('body', Math.min(searchScale * 1.35, 1))
    expect(searchInputStyle).toMatchObject({
      borderWidth: 0,
      fontSize: searchTypography.fontSize,
      includeFontPadding: false,
      lineHeight: searchTypography.lineHeight,
      paddingVertical: 0,
      textAlignVertical: 'center',
    })
    expect(screen.getByTestId('customer-v21-top-title')).toHaveTextContent(/Good (morning|afternoon|evening), Anh Tú$/)
    expect(screen.getByTestId('customer-v21-top-title')).toHaveStyle({ fontSize: 22, lineHeight: 28 })
    expect(screen.getByText('Việc nhà có chúng tôi,\nbạn yên tâm tận hưởng')).toBeOnTheScreen()
    const heroScale = Math.min(Math.max(Dimensions.get('window').width - 32, 280) / 857, 1)
    const heroTitleStyle = StyleSheet.flatten(screen.getByText('Việc nhà có chúng tôi,\nbạn yên tâm tận hưởng').props.style)
    const baseHeroTitleStyle = scaledTypography('largeTitle', heroScale)
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-home-hero-copy').props.style).top).toBeCloseTo(heroScale * 33 + 5)
    expect(heroTitleStyle.fontSize).toBe((baseHeroTitleStyle.fontSize ?? 0) + 3)
    expect(heroTitleStyle.lineHeight).toBe((baseHeroTitleStyle.lineHeight ?? 0) + 3)
    const heroDescriptionStyle = StyleSheet.flatten(screen.getByText('Kết nối thợ lành nghề  •  Đến nhanh  •  Giá minh bạch').props.style)
    const baseHeroDescriptionStyle = scaledTypography('subheadline', heroScale)
    expect(screen.getByText('Kết nối thợ lành nghề  •  Đến nhanh  •  Giá minh bạch').props.numberOfLines).toBe(1)
    expect(screen.getByText('Kết nối thợ lành nghề  •  Đến nhanh  •  Giá minh bạch').props.minimumFontScale).toBe(0.62)
    expect(heroDescriptionStyle.marginTop).toBeCloseTo(heroScale * 4 + 5)
    expect(heroDescriptionStyle.fontSize).toBe((baseHeroDescriptionStyle.fontSize ?? 0) + 1)
    expect(heroDescriptionStyle.lineHeight).toBe((baseHeroDescriptionStyle.lineHeight ?? 0) + 1)
    expect(screen.queryByTestId('customer-v21-home-greeting-icon')).toBeNull()
    expect(screen.queryByLabelText('Xin chào')).toBeNull()
    expect(screen.getByText('Kết nối thợ lành nghề  •  Đến nhanh  •  Giá minh bạch')).toBeOnTheScreen()
    expect(screen.getByText('An tâm với quy trình rõ ràng')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-guidance-section-title')).toHaveTextContent('Quy trình dịch vụ')
    expect(screen.getByTestId('customer-v21-home-activity-section-title')).toHaveTextContent('Hoạt động dịch vụ')
    expect(screen.getByTestId('customer-v21-home-promo-action')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-home-promo-image')).toBeOnTheScreen()
    const guidanceScale = Math.min(Math.max(Dimensions.get('window').width - 32, 280) / 847, 1)
    const guidanceTitleStyle = StyleSheet.flatten(screen.getByText('An tâm với quy trình rõ ràng').props.style)
    const guidanceButtonStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-home-promo-action').props.style)
    const guidanceButtonTextStyle = StyleSheet.flatten(screen.getByText('Xem cách hoạt động').props.style)
    const baseGuidanceTitleStyle = scaledTypography('title1', guidanceScale)
    const baseGuidanceButtonStyle = scaledTypography('headline', guidanceScale)
    expect(guidanceTitleStyle.fontSize).toBe((baseGuidanceTitleStyle.fontSize ?? 0) + 3)
    expect(guidanceTitleStyle.lineHeight).toBe((baseGuidanceTitleStyle.lineHeight ?? 0) + 3)
    expect(guidanceButtonStyle.height).toBeCloseTo(guidanceScale * 47 + 4)
    expect(guidanceButtonStyle.paddingHorizontal).toBeCloseTo(guidanceScale * 21 + 4)
    expect(guidanceButtonTextStyle.fontSize).toBe((baseGuidanceButtonStyle.fontSize ?? 0) + 3)
    expect(guidanceButtonTextStyle.lineHeight).toBe((baseGuidanceButtonStyle.lineHeight ?? 0) + 3)
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-home-guidance').props.style).marginTop).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Mở thông báo')).toBeNull()
    expect(screen.queryByText('Cần hỗ trợ ngay?')).toBeNull()
    expect(screen.queryByTestId('customer-v21-home-quick-suggestions')).toBeNull()
    expect(screen.queryByText('Phạm vi rõ ràng')).toBeNull()
    expect(screen.queryByText('Xác nhận trước khi làm')).toBeNull()
    expect(screen.queryByText('Thanh toán an toàn')).toBeNull()
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

  it('shows the six approved service paths without fake worker or rating data', () => {
    render(<CustomerHomeSurface />)

    const serviceLabels = ['Sửa điện', 'Sửa nước', 'Vệ sinh nhà cửa', 'Điều hòa', 'Sofa, nệm, rèm', 'Sửa vặt & Lắp đặt']

    for (const service of ['electrical', 'plumbing', 'home_cleaning', 'hvac_basic_maintenance', 'upholstery_care', 'handyman_minor_installation']) {
      expect(screen.getByTestId(`customer-v21-service-${service}`)).toBeOnTheScreen()
      const visualPanel = screen.getByTestId(`customer-v21-service-${service}-visual-panel`)
      const workart = screen.getByTestId(`customer-v21-service-${service}-workart`)
      expect(visualPanel).toBeOnTheScreen()
      expect(StyleSheet.flatten(visualPanel.props.style)).toMatchObject({
        alignItems: 'center',
        flexBasis: '80%',
        height: '80%',
        justifyContent: 'center',
      })
      expect(StyleSheet.flatten(workart.props.style)).toMatchObject({ height: '100%', width: '100%' })
      expect(workart.props.contentFit).toBe('cover')
      expect(workart.props.source).toEqual([
        customerV21BookingWorkartAssets[service as keyof typeof customerV21BookingWorkartAssets],
      ])
      expect(screen.getByTestId(`customer-v21-service-${service}-workart-fade`)).toBeOnTheScreen()
      const title = screen.getByTestId(`customer-v21-service-${service}-title`)
      expect(title).toBeOnTheScreen()
      expect(StyleSheet.flatten(title.props.style)).toMatchObject({ paddingBottom: 0 })
    }
    for (const label of serviceLabels) expect(screen.getByText(label)).toBeOnTheScreen()
    expect(screen.queryByText('Điều hòa & Không khí')).toBeNull()
    expect(screen.queryByText('Sofa, nệm, rèm, thảm')).toBeNull()
    expect(screen.queryByText('Sửa vặt & Lắp đặt nhỏ')).toBeNull()
    expect(screen.queryByText(/rating|4\.9|Nguyễn Văn Minh/i)).toBeNull()
    expect(screen.getByText('Chưa có hoạt động dịch vụ')).toBeOnTheScreen()
  })

  it('uses a distinct transparent service-start icon without a square tile for the home empty state', () => {
    render(<CustomerHomeSurface />)

    const asset = screen.getByLabelText('Chưa có hoạt động dịch vụ')
    const assetStyle = StyleSheet.flatten(asset.props.style)
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

  it('uses a transparent nav-only icon for Activity without replacing Activity and History visuals', () => {
    const assetsSource = readFileSync(resolve(__dirname, '../ui/assets.ts'), 'utf8')
    const homeSurfaceSource = readFileSync(resolve(__dirname, '../v21/surfaces.tsx'), 'utf8')

    expect(assetsSource).toContain("activity: require('@/assets/client-image-icons/client-activity-route.png')")
    expect(assetsSource).toContain("activityNav: require('@/assets/client-image-icons/client-activity-nav.png')")
    expect(homeSurfaceSource).toContain("{ image: customerV21Assets.activityNav, key: 'activity', route: '/(customer)/history' },")
    expect(existsSync(resolve(__dirname, '../../../assets/client-image-icons/client-activity-nav.png'))).toBe(true)
  })

  it('uses distinct generated icon assets for each expanded service path', () => {
    const assetsSource = readFileSync(resolve(__dirname, '../ui/assets.ts'), 'utf8')

    expect(assetsSource).toContain("hvac_basic_maintenance: require('./assets/service-icons/client-service-hvac.png')")
    expect(assetsSource).toContain("upholstery_care: require('./assets/service-icons/client-service-upholstery-care.png')")
    expect(assetsSource).toContain("handyman_minor_installation: require('./assets/service-icons/client-service-handyman-installation.png')")
    expect(assetsSource).not.toContain('hvac_basic_maintenance: customerV21Assets.tools')
    expect(assetsSource).not.toContain('upholstery_care: customerV21ServiceAssets.cleaning')
    expect(assetsSource).not.toContain('handyman_minor_installation: customerV21Assets.tools')

    expect(existsSync(resolve(__dirname, '../ui/assets/service-icons/client-service-hvac.png'))).toBe(true)
    expect(existsSync(resolve(__dirname, '../ui/assets/service-icons/client-service-upholstery-care.png'))).toBe(true)
    expect(existsSync(resolve(__dirname, '../ui/assets/service-icons/client-service-handyman-installation.png'))).toBe(true)
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
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-active-case-copy').props.style).left).toBeCloseTo((customerV21SurfaceContentWidth(Dimensions.get('window').width) / 829) * 146)
    expect(screen.queryByTestId('customer-v21-active-case-asset')).toBeNull()
    const activeWorkartPanel = screen.getByTestId('customer-v21-active-case-workart-panel')
    const activeWorkart = screen.getByTestId('customer-v21-active-case-workart')
    expect(activeWorkartPanel).toBeOnTheScreen()
    expect(StyleSheet.flatten(activeWorkartPanel.props.style)).not.toHaveProperty('borderWidth')
    expect(StyleSheet.flatten(activeWorkart.props.style)).toMatchObject({ height: '100%', width: '100%' })
    expect(activeWorkart.props.contentFit).toBe('cover')
    expect(activeWorkart.props.source).toEqual([customerV21BookingWorkartAssets.electrical])
    expect(screen.getByTestId('customer-v21-active-case-workart-wash')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-active-case-meta')).toHaveTextContent(/Ổ cắm nóng/)
    expect(screen.getByTestId('customer-v21-active-case-meta')).toHaveTextContent(/180\.000đ - 260\.000đ/)
    expect(screen.getByTestId('customer-v21-active-case-meta')).toHaveTextContent(/Tòa A, Quận 7/)
    expect(screen.getByTestId('customer-v21-active-case-meta-date')).toHaveTextContent('17/08 · 08:00')
    expect(screen.getByTestId('customer-v21-active-case-meta')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-active-case-meta').props.style)).toMatchObject({ flexDirection: 'row' })
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-active-case-meta-date').props.style)).toMatchObject({ flexShrink: 0 })
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-active-case-meta-details').props.style)).toMatchObject({ alignItems: 'center', flex: 1, justifyContent: 'center', minWidth: 0 })
    const detailLine = screen.getByTestId('customer-v21-active-case-meta-detail-line')
    expect(detailLine.props.numberOfLines).toBe(1)
    expect(StyleSheet.flatten(detailLine.props.style)).toMatchObject({ flexShrink: 1, includeFontPadding: false, minWidth: 0, textAlignVertical: 'center' })
    const activeMetaTextStyles = screen.getByTestId('customer-v21-active-case-meta').findAllByType(Text).map((text) => StyleSheet.flatten(text.props.style))
    expect(activeMetaTextStyles.length).toBeGreaterThan(0)
    for (const style of activeMetaTextStyles) {
      expect(style).toMatchObject({ includeFontPadding: false, textAlignVertical: 'center' })
    }
    expect(screen.getByTestId('customer-v21-active-case-progress')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-active-case')).not.toHaveTextContent(/4\.9|rating|--/)
    expect(screen.getByLabelText(/^Bước \d+ trên \d+$/)).toBeOnTheScreen()
    expect(screen.queryByLabelText(/^Step \d+ of \d+$/)).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-active-case'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
  })

  it('uses the Booking Workart treatment for all six active service types', () => {
    const activeServices = [
      ['electrical', 'electrical'],
      ['plumbing', 'plumbing'],
      ['cleaning', 'home_cleaning'],
      ['hvac', 'hvac_basic_maintenance'],
      ['upholstery', 'upholstery_care'],
      ['handyman', 'handyman_minor_installation'],
    ] as const

    for (const [serviceType, workartKey] of activeServices) {
      const deal = buildDeal()
      deal.draft.serviceType = serviceType
      if (deal.broadcast) deal.broadcast.serviceType = serviceType
      buildWorkflow(deal)

      const { unmount } = render(<CustomerHomeSurface />)
      const activeWorkart = screen.getByTestId('customer-v21-active-case-workart')
      expect(activeWorkart.props.source).toEqual([customerV21BookingWorkartAssets[workartKey]])
      expect(screen.queryByTestId('customer-v21-active-case-asset')).toBeNull()
      unmount()
    }
  })

  it('keeps the reference process composition on a compact native width', () => {
    buildWorkflow(buildDeal())
    const dimensionsSpy = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 430, height: 765, scale: 1, fontScale: 1 })

    try {
      render(<CustomerHomeSurface />)

      const progressStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-active-case-progress').props.style)
      const progressTrackStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-active-case-progress-track').props.style)
      const progressFillStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-active-case-progress-fill').props.style)
      const progressNodeStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-active-case-step-2').props.style)
      const cardScale = customerV21SurfaceContentWidth(430) / 829
      expect(progressStyle.position).toBe('absolute')
      expect(progressStyle.left).toBeGreaterThan(0)
      expect(progressStyle.top).toBeGreaterThan(0)
      expect(progressStyle.height).toBeCloseTo(cardScale * 51)
      expect(progressTrackStyle.top).toBeCloseTo(cardScale * 24)
      expect(progressFillStyle.top).toBeCloseTo(cardScale * 24)
      expect(progressTrackStyle.height).toBeCloseTo(cardScale * 3)
      expect(progressFillStyle.height).toBeCloseTo(cardScale * 3)
      expect(progressTrackStyle.top + progressTrackStyle.height / 2).toBeCloseTo(
        (progressStyle.height - progressNodeStyle.height) / 2 + progressNodeStyle.height / 2,
      )
      expect(StyleSheet.flatten(screen.getByTestId('customer-v21-active-case-meta').props.style).borderWidth).toBe(1)
    } finally {
      dimensionsSpy.mockRestore()
    }
  })

  it('maps real workflow phases to the visible four-step process', () => {
    expect(stepForStatus('draft')).toBe(1)
    expect(stepForStatus('broadcasting')).toBe(2)
    expect(stepForStatus('worker_candidate_pending')).toBe(2)
    expect(stepForStatus('worker_on_way')).toBe(2)
    expect(stepForStatus('repairing')).toBe(3)
    expect(stepForStatus('paid')).toBe(4)
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

    expect(screen.getByTestId('customer-v21-active-case')).toHaveTextContent(/Rò nước/)
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

    expect(screen.getByTestId('customer-v21-active-case')).toHaveTextContent(/Ống rò rỉ/)
    expect(screen.getByTestId('customer-v21-active-case')).not.toHaveTextContent('Ro ri lavabo')
  })
})
