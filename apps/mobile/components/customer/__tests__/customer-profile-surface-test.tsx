import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
let mockSessionMetadata: Record<string, unknown>
let mockCustomerKaelMemory: any
let mockCustomerAvatarUrl: string | null
let mockCustomerProfileInsights: any
let mockPanelParam: string | undefined
let mockScreenParam: string | undefined
let mockSectionParam: string | undefined
let mockUtilityParam: string | undefined
let mockAppLanguage: 'en' | 'vi'
let mockThemeMode: 'dark' | 'light'
let mockNotificationUnreadCount: number
let mockNotifications: {
  body: string
  created_at: string
  event_type: string
  id: string
  job_id: string | null
  read_at: string | null
  status: string
  title: string
}[]
const mockReplace = jest.fn()
const mockSignOut = jest.fn()
const mockUpdateCustomerProfile = jest.fn()
const mockUpdatePassword = jest.fn()
const mockSetAppLanguage = jest.fn()
const mockSetCustomerThemeMode = jest.fn()
const mockUpdateCustomerKaelMemoryPreference = jest.fn()
const mockRefreshNotifications = jest.fn()
const mockMarkNotificationRead = jest.fn()
const mockGetRefundAccount = jest.fn()
const mockSaveRefundAccount = jest.fn()
const mockDeleteAccount = jest.fn()
const mockCustomerUploadAvatar = jest.fn()
const mockSaveCustomerDefaultAddress = jest.fn()

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ panel: mockPanelParam, screen: mockScreenParam, section: mockSectionParam, utility: mockUtilityParam }),
  useRouter: () => ({ replace: mockReplace }),
}))

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  getCameraPermissionsAsync: jest.fn(async () => ({ canAskAgain: true, granted: false })),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
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
      access_token: 'customer_access_token',
      user: {
        email: 'customer@example.com',
        id: 'customer_test_1',
        user_metadata: mockSessionMetadata,
      },
    },
    signOut: mockSignOut,
    updateCustomerProfile: mockUpdateCustomerProfile,
    updatePassword: mockUpdatePassword,
  }),
}))

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => ({
    actions: {
      customerUploadAvatar: mockCustomerUploadAvatar,
      markNotificationRead: mockMarkNotificationRead,
      refreshNotifications: mockRefreshNotifications,
      saveCustomerDefaultAddress: mockSaveCustomerDefaultAddress,
      updateCustomerKaelMemoryPreference: mockUpdateCustomerKaelMemoryPreference,
    },
    customerAvatarUrl: mockCustomerAvatarUrl,
    customerKaelMemory: mockCustomerKaelMemory,
    customerProfileInsights: mockCustomerProfileInsights,
    dispatch: jest.fn(),
    notificationUnreadCount: mockNotificationUnreadCount,
    notifications: mockNotifications,
    selectors: {},
    state: {
      deal: null,
      lastError: null,
      lastRemoteSyncAt: null,
      workerGate: 'remote_backend',
    },
  }),
}))

jest.mock('@/lib/services', () => {
  const actual = jest.requireActual('@/lib/services')
  return {
    ...actual,
    customerProfileService: {
      ...actual.customerProfileService,
      getRefundAccount: (...args: unknown[]) => mockGetRefundAccount(...args),
      saveRefundAccount: (...args: unknown[]) => mockSaveRefundAccount(...args),
    },
    customerAccountService: {
      deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
    },
  }
})

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

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    setAppLanguage: (...args: unknown[]) => mockSetAppLanguage(...args),
    useAppLanguage: () => mockAppLanguage,
  }
})

jest.mock('../customer-theme', () => {
  const actual = jest.requireActual('../customer-theme')
  return {
    ...actual,
    setCustomerThemeMode: (...args: unknown[]) => mockSetCustomerThemeMode(...args),
    useCustomerThemeMode: () => mockThemeMode,
  }
})

import { CustomerDockOverlay, CustomerProfileSurface } from '../customer-surfaces'
import { getCustomerThemeTokens } from '../customer-theme'

function collectRenderedTestIds(root: unknown) {
  const testIds: string[] = []
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const rendered = node as {
      children?: unknown[]
      props?: { testID?: unknown }
    }
    if (typeof rendered.props?.testID === 'string') testIds.push(rendered.props.testID)
    rendered.children?.forEach(visit)
  }
  visit(root)
  return testIds
}

beforeEach(() => {
  mockReplace.mockClear()
  mockSignOut.mockClear()
  mockUpdateCustomerProfile.mockReset()
  mockUpdateCustomerProfile.mockResolvedValue({ success: true })
  mockUpdatePassword.mockReset()
  mockUpdatePassword.mockResolvedValue({ success: true })
  mockSetAppLanguage.mockClear()
  mockSetCustomerThemeMode.mockClear()
  mockUpdateCustomerKaelMemoryPreference.mockReset()
  mockUpdateCustomerKaelMemoryPreference.mockResolvedValue(true)
  mockRefreshNotifications.mockReset()
  mockRefreshNotifications.mockResolvedValue(true)
  mockMarkNotificationRead.mockReset()
  mockMarkNotificationRead.mockResolvedValue(true)
  mockSaveCustomerDefaultAddress.mockReset()
  mockSaveCustomerDefaultAddress.mockResolvedValue(true)
  mockGetRefundAccount.mockReset()
  mockGetRefundAccount.mockResolvedValue({ data: { refund_account: null }, status: 200, success: true })
  mockSaveRefundAccount.mockReset()
  mockSaveRefundAccount.mockResolvedValue({
    data: {
      refund_account: {
        bank_account_masked: '**** 6789',
        bank_key: 'techcombank',
        bank_name: 'Techcombank',
        id: 'payment_method_test_1',
        is_default: true,
        status: 'pending_verification',
        updated_at: '2026-06-27T00:00:00.000Z',
        verified_at: null,
      },
    },
    status: 200,
    success: true,
  })
  mockDeleteAccount.mockReset()
  mockDeleteAccount.mockResolvedValue({
    data: {
      account_deleted: true,
      request_id: '77777777-7777-4777-8777-777777777777',
      retained_transaction_records: true,
    },
    status: 200,
    success: true,
  })
  mockSessionMetadata = {}
  mockCustomerAvatarUrl = null
  mockCustomerUploadAvatar.mockReset()
  mockCustomerUploadAvatar.mockResolvedValue(true)
  const imagePicker = jest.requireMock('expo-image-picker')
  imagePicker.getCameraPermissionsAsync.mockReset()
  imagePicker.getCameraPermissionsAsync.mockResolvedValue({ canAskAgain: true, granted: false })
  imagePicker.launchCameraAsync.mockReset()
  imagePicker.launchImageLibraryAsync.mockReset()
  imagePicker.requestCameraPermissionsAsync.mockReset()
  imagePicker.requestCameraPermissionsAsync.mockResolvedValue({ canAskAgain: true, granted: true })
  imagePicker.requestMediaLibraryPermissionsAsync.mockReset()
  imagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true })
  mockCustomerKaelMemory = null
  mockCustomerProfileInsights = null
  mockPanelParam = undefined
  mockScreenParam = undefined
  mockSectionParam = undefined
  mockAppLanguage = 'vi'
  mockThemeMode = 'light'
  mockUtilityParam = undefined
  mockNotificationUnreadCount = 0
  mockNotifications = []
})

describe('CustomerProfileSurface v2.1', () => {
  it('renders profile overview with honest pending metrics when insights are missing', () => {
    mockSessionMetadata = { full_name: 'Phan Mạnh Tú' }

    render(<CustomerProfileSurface />)

    expect(screen.queryByTestId('customer-v21-top-title')).toBeNull()
    expect(screen.queryByText('Hồ sơ khách hàng')).toBeNull()
    expect(screen.queryByTestId('customer-v21-top-subtitle')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-name')).toHaveTextContent('Phan Mạnh Tú')
    expect(screen.queryByTestId('customer-v21-profile-completed')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-addresses')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-services')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-protection-card')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-ranking-entry')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-overviewrankingentry-card-skin')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-overviewrankingentry-wide-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-overviewrankingentry-mint-aura')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-art')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-leaf')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-title')).toHaveTextContent('Xếp hạng sử dụng')
    // The tagline is decorative and hidden from the screen reader, so queries must opt in to see it.
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-tagline', { includeHiddenElements: true })).toHaveTextContent(/Nhà sạch hơn/)
    expect(screen.queryByText('Kael đánh giá từ dữ liệu sử dụng thật.')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-ranking-entry-chevron')).toBeNull()
    const rankingEntry = screen.getByTestId('customer-v21-profile-ranking-entry')
    expect(within(rankingEntry).queryByTestId('customer-v21-profile-ranking-entry-signals')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-points')).toHaveTextContent('Chưa có')
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-points')).toHaveStyle({ fontWeight: '600', textAlign: 'center' })
    expect(screen.queryByTestId('customer-v21-profile-ranking-entry-progress')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-ranking-entry-progress-flag')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-ranking-entry-status')).toBeNull()
    expect(screen.queryByTestId('customer-v21-top-avatar')).toBeNull()
    expect(screen.queryByText('⚙')).toBeNull()
    expect(screen.queryByText('--')).toBeNull()
    const hero = screen.getByTestId('customer-v21-profile-hero')
    expect(within(hero).queryByText('✓')).toBeNull()
    expect(within(hero).queryByText('Tích cực')).toBeNull()
    expect(within(hero).queryByText('Khách hàng đã xác minh')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-account-journey')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-overviewhero-wide-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-overviewhero-mint-aura')).toBeNull()
  })

  it('places usage ranking directly after the identity hero and before account settings', () => {
    mockSessionMetadata = { full_name: 'Phan Mạnh Tú' }

    render(<CustomerProfileSurface />)

    const renderedOrder = collectRenderedTestIds(screen.getByTestId('customer-v21-profile'))
    expect(renderedOrder.indexOf('customer-v21-profile-hero')).toBeLessThan(
      renderedOrder.indexOf('customer-v21-profile-ranking-entry'),
    )
    expect(renderedOrder.indexOf('customer-v21-profile-ranking-entry')).toBeLessThan(
      renderedOrder.indexOf('customer-v21-profile-settings-groups'),
    )
  })

  it('reads the usage ranking entry as one button that carries its status, in English without Vietnamese copy', () => {
    mockAppLanguage = 'en'
    mockCustomerProfileInsights = { usage_rank_level: 4, usage_rank_points: 620, usage_rank_level_floor_points: 600, usage_rank_next_level_points: 800 }

    render(<CustomerProfileSurface />)

    const button = screen.getByTestId('customer-v21-profile-ranking-cta')
    expect(button).toHaveAccessibilityValue({ text: '620 / 800 points' })
    expect(screen.getByRole('button', { name: 'View usage ranking' })).toBe(button)
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-title')).toHaveTextContent('Usage ranking')
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-points')).toHaveTextContent('620 / 800 points')
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-tagline', { includeHiddenElements: true })).toHaveTextContent(/A cleaner home/)
    expect(
      within(screen.getByTestId('customer-v21-profile-ranking-entry')).queryByText(
        /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/iu,
        { includeHiddenElements: true },
      ),
    ).toBeNull()
  })

  it('keeps an empty classic frame and lets the customer choose a real profile photo', async () => {
    mockSessionMetadata = { full_name: 'Phan Mạnh Tú' }
    mockCustomerUploadAvatar.mockImplementation(async () => {
      mockCustomerAvatarUrl = 'https://storage.example.test/read/customer-avatar.jpg'
      return true
    })
    const imagePicker = jest.requireMock('expo-image-picker')
    imagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{
        fileName: 'customer.jpg',
        fileSize: 2345,
        mimeType: 'image/jpeg',
        uri: 'file:///customer.jpg',
      }],
    })
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(
      (...args: unknown[]) => {
        const buttons = args[2] as { onPress?: () => void; text?: string }[] | undefined
        const library = buttons?.find((button) => button.text === 'Chọn từ thư viện')
        void library?.onPress?.()
      },
    )
    const view = render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-avatar-picker')).toHaveStyle({
      borderRadius: 999,
      height: 84,
      width: 84,
    })
    expect(screen.getByTestId('customer-v21-profile-avatar-placeholder-icon')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-avatar-fallback')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-avatar-edit-badge')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('customer-v21-profile-avatar-picker'))

    await waitFor(() => {
      expect(mockCustomerUploadAvatar).toHaveBeenCalledWith({
        fileName: 'customer.jpg',
        fileSizeBytes: 2345,
        mimeType: 'image/jpeg',
        uri: 'file:///customer.jpg',
      })
    })
    expect(imagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled()

    view.rerender(<CustomerProfileSurface />)
    expect(screen.getByTestId('customer-v21-profile-avatar-image').props.source).toEqual([{
      uri: 'https://storage.example.test/read/customer-avatar.jpg',
    }])
    alertSpy.mockRestore()
  })

  it('opens the camera for a square still photo and uploads the captured image', async () => {
    mockSessionMetadata = { full_name: 'Phan Mạnh Tú' }
    const imagePicker = jest.requireMock('expo-image-picker')
    imagePicker.launchCameraAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{
        fileName: 'camera-avatar.webp',
        fileSize: 3456,
        mimeType: 'image/webp',
        uri: 'file:///camera-avatar.webp',
      }],
    })
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(
      (...args: unknown[]) => {
        const buttons = args[2] as { onPress?: () => void; text?: string }[] | undefined
        const camera = buttons?.find((button) => button.text === 'Chụp ảnh')
        void camera?.onPress?.()
      },
    )

    render(<CustomerProfileSurface />)
    fireEvent.press(screen.getByTestId('customer-v21-profile-avatar-picker'))

    await waitFor(() => {
      expect(mockCustomerUploadAvatar).toHaveBeenCalledWith({
        fileName: 'camera-avatar.webp',
        fileSizeBytes: 3456,
        mimeType: 'image/webp',
        uri: 'file:///camera-avatar.webp',
      })
    })
    expect(imagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1)
    expect(imagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
    }))
    alertSpy.mockRestore()
  })

  it('does not open the camera when camera permission is denied', async () => {
    mockSessionMetadata = { full_name: 'Phan Mạnh Tú' }
    const imagePicker = jest.requireMock('expo-image-picker')
    imagePicker.requestCameraPermissionsAsync.mockResolvedValueOnce({ canAskAgain: true, granted: false })
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(
      (...args: unknown[]) => {
        const buttons = args[2] as { onPress?: () => void; text?: string }[] | undefined
        const camera = buttons?.find((button) => button.text === 'Chụp ảnh')
        void camera?.onPress?.()
      },
    )

    render(<CustomerProfileSurface />)
    fireEvent.press(screen.getByTestId('customer-v21-profile-avatar-picker'))

    await waitFor(() => expect(imagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1))
    expect(imagePicker.launchCameraAsync).not.toHaveBeenCalled()
    expect(mockCustomerUploadAvatar).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })

  it('uses real profile insight metrics, including real zero values', () => {
    mockCustomerProfileInsights = {
      active_service_days: 2,
      active_streak_days: 0,
      completed_service_count: 0,
      dispute_free_rate_percent: 100,
      kael_interaction_count: 4,
      member_since: '2026-06-01T00:00:00.000Z',
      money_protection_score: 92,
      positive_review_rate_percent: 0,
      preferred_service_count: 0,
      price_savings_vnd: 150000,
      protected_transaction_count: 22,
      protected_value_vnd: 2150000,
      saved_address_count: 1,
      total_spend_vnd: 0,
      total_transaction_count: 24,
      usage_rank_level: 4,
      usage_rank_points: 620,
      usage_rank_level_floor_points: 600,
      usage_rank_next_level_points: 800,
    }

    const { unmount } = render(<CustomerProfileSurface />)

    expect(screen.queryByTestId('customer-v21-profile-completed')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-protection-card')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-points')).toHaveTextContent(/620 \/ 800/)
    expect(screen.queryByTestId('customer-v21-profile-ranking-entry-progress')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-ranking-entry-signals')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-account-start')).toHaveTextContent('Thành viên từ 01/06/2026')
    expect(screen.getByTestId('customer-v21-profile-active-days')).toHaveTextContent('Dùng dịch vụ: 2 ngày')
    expect(screen.getByTestId('customer-v21-profile-total-days')).toHaveTextContent(/Ngày thứ \d+/)

    fireEvent.press(screen.getByTestId('customer-v21-profile-ranking-cta'))
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(customer)/profile',
      params: { panel: 'ranking' },
    })
    expect(screen.getByTestId('customer-v21-profile-ranking')).toHaveTextContent(/Tin cậy/)
    expect(screen.getByTestId('customer-v21-profile-ranking')).toHaveTextContent(/620/)
    expect(screen.queryByRole('button', { name: 'i' })).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-ranking-status-chip')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-ranking-hero-workart')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-hero')).toHaveStyle({ marginHorizontal: 7 })
    expect(screen.getByTestId('customer-v21-profile-ranking-hero-workart-frame')).toHaveStyle({ height: 198, width: '50%' })
    expect(screen.getByTestId('customer-v21-profile-ranking-hero-workart')).toHaveStyle({ height: 198, transform: [{ scale: 1.8 }], width: '100%' })
    expect(screen.getByTestId('customer-v21-profile-ranking-hero-copy')).toHaveStyle({ paddingLeft: 12, paddingRight: 16, zIndex: 3 })
    expect(screen.getByTestId('customer-v21-profile-ranking-current-line')).toHaveStyle({ fontSize: 14, lineHeight: 19, marginLeft: 0, transform: [{ translateY: -2 }] })
    expect(screen.getByTestId('customer-v21-profile-ranking-hero-kicker')).toHaveStyle({ fontSize: 14, fontWeight: '700', lineHeight: 19 })
    expect(screen.getByTestId('customer-v21-profile-ranking-current-value')).toHaveStyle({ fontSize: 14, fontWeight: '700', lineHeight: 19 })
    expect(screen.getByTestId('customer-v21-profile-ranking-current-line')).toHaveTextContent(/Hạng hiện tại:\s*4/)
    expect(screen.getByTestId('customer-v21-profile-ranking-hero-body')).toHaveStyle({ fontSize: 11, lineHeight: 15 })
    expect(screen.getByTestId('customer-v21-profile-ranking-hero-body-line')).toHaveStyle({ flexDirection: 'row', gap: 4 })
    expect(screen.getByTestId('customer-v21-profile-ranking-hero-body-icon')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-ranking-hero-wide-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-ranking-hero-mint-aura')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-ranking-current-value')).toHaveTextContent('4')
    expect(screen.getByTestId('customer-v21-profile-ranking-progress')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-rank-rail-node-4')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-rank-rail-node-4')).toHaveStyle({ borderRadius: 6, height: 12, width: 12 })
    expect(screen.getByTestId('customer-v21-profile-rank-rail-track-path')).toHaveProp(
      'd',
      'M4.5 14H5.5 M14.5 14H15.5 M24.5 14H25.5 M34.5 14H35.5 M44.5 14H45.5 M54.5 14H55.5 M64.5 14H65.5 M74.5 14H75.5 M84.5 14H85.5 M94.5 14H95.5',
    )
    expect(screen.getByTestId('customer-v21-profile-rank-rail-label-3')).toHaveTextContent(/Tin cậy/)
    expect(screen.getByTestId('customer-v21-profile-rank-process')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-rank-process-progress')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-ranking-evaluation')).toBeNull()
    expect(screen.queryByText('Kael đánh giá dữ liệu thật')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-ranking-metric-services-icon-image')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-metric-streak-icon-image')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-metric-reviews-icon-image')).toBeOnTheScreen()
    for (const metric of ['services', 'streak', 'reviews']) {
      expect(screen.queryByTestId(`customer-v21-profile-ranking-metric-${metric}-compact-mint-aura`)).toBeNull()
      expect(screen.queryByTestId(`customer-v21-profile-ranking-metric-${metric}-mint-aura`)).toBeNull()
    }
    expect(screen.queryByText('Chi tiết')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-ranking-rules-card-skin')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-ranking-rules-wide-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-ranking-rules-mint-aura')).toBeNull()
    const rankingRules = [
      ['completed', 'Hoàn tất đúng quy trình', 'Không bỏ đơn sau khi thợ đã di chuyển', '0'],
      ['review', 'Đánh giá chất lượng', 'Phản hồi công bằng sau mỗi công việc', '0%'],
      ['protected', 'Dùng thanh toán được bảo vệ', 'Giữ giao dịch trong hệ thống', '22 / 24'],
    ] as const
    rankingRules.forEach(([rule, title, body, status]) => {
      const testID = `customer-v21-profile-ranking-rule-${rule}`

      expect(screen.getByTestId(testID)).toHaveStyle({ flexDirection: 'row', minHeight: 88 })
      expect(screen.getByTestId(`${testID}-visual-panel`)).toHaveStyle({ width: 56 })
      expect(screen.getByTestId(`${testID}-icon-image`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${testID}-icon-image`)).toHaveProp('height', 38)
      expect(screen.getByTestId(`${testID}-icon-image`)).toHaveProp('width', 38)
      expect(screen.queryByTestId(`${testID}-mint-aura`)).toBeNull()
      expect(screen.queryByTestId(`${testID}-connector`)).toBeNull()
      expect(screen.queryByTestId(`${testID}-connector-dot`)).toBeNull()
      expect(screen.getByTestId(`${testID}-title`)).toHaveTextContent(title)
      expect(screen.getByTestId(`${testID}-body`)).toHaveTextContent(body)
      expect(screen.queryByTestId(`${testID}-detail-rail-0`)).toBeNull()
      expect(screen.queryByTestId(`${testID}-chevron`)).toBeNull()
      expect(screen.getByTestId(testID).props.accessibilityLabel).toContain(status)
    })
    expect(screen.queryByTestId('customer-v21-profile-ranking-kael')).toBeNull()

    unmount()
    mockScreenParam = '6.3-protect-money'
    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-money')).toHaveTextContent(/92\/100/)
    expect(screen.getByTestId('customer-v21-profile-money')).toHaveTextContent(/2.150.000đ/)
  })

  it('keeps pending and real ranking states honest in the workart hero and level rail', () => {
    mockScreenParam = '6.2-usage-ranking'

    const { rerender } = render(<CustomerProfileSurface />)

    expect(screen.queryByTestId('customer-v21-profile-ranking-status-chip')).toBeNull()
    expect(screen.queryByText('Hạng phản ánh cách bạn sử dụng dịch vụ')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-ranking-hero-workart')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-current-value')).toHaveTextContent('Chưa có')
    expect(screen.getByTestId('customer-v21-profile-ranking-current-line')).toHaveTextContent(/Hạng hiện tại:\s*Chưa có/)
    expect(screen.getByTestId('customer-v21-profile-ranking-points-total')).toHaveTextContent('Chưa có')
    expect(screen.getByTestId('customer-v21-profile-ranking-points-total-icon')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-ranking-next-points')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-ranking-progress')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-score-Ranking-value')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-score-Ranking-progress-dot')).toBeNull()

    mockCustomerProfileInsights = {
      usage_rank_level: 2,
      usage_rank_points: 250,
      usage_rank_level_floor_points: 200,
      usage_rank_next_level_points: 400,
    }
    rerender(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-ranking-current-value')).toHaveTextContent('2')
    expect(screen.getByTestId('customer-v21-profile-rank-rail-node-2')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking')).toHaveTextContent(/250/)

    mockCustomerProfileInsights = {
      usage_rank_level: 4,
      usage_rank_points: 620,
      usage_rank_level_floor_points: 600,
      usage_rank_next_level_points: 800,
    }
    rerender(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-ranking-current-value')).toHaveTextContent('4')
    expect(screen.getByTestId('customer-v21-profile-ranking')).toHaveTextContent(/620/)
    expect(screen.getByTestId('customer-v21-profile-ranking-points-total')).toHaveTextContent('620 / 800 điểm')
    expect(screen.getByTestId('customer-v21-profile-ranking-points-total-line')).toHaveStyle({ flexDirection: 'row', gap: 4 })
    expect(screen.getByTestId('customer-v21-profile-ranking-points-total-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-next-points-text')).toHaveTextContent('Còn 180 điểm lên hạng 5')
    expect(screen.getByTestId('customer-v21-profile-ranking-next-points-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-points')).toHaveStyle({ gap: 6, transform: [{ translateY: 2 }] })
    expect(screen.getByTestId('customer-v21-profile-ranking-next-points')).toHaveStyle({ flexDirection: 'row', gap: 4 })
    expect(screen.getByTestId('customer-v21-profile-ranking-progress')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-progress-slot')).toHaveStyle({ marginTop: 6 })
  })

  it('removes the smart utility section and Agentic Center entry from Profile', () => {
    render(<CustomerProfileSurface />)

    expect(screen.queryByText('Tiện ích thông minh')).toBeNull()
    expect(screen.queryByText('Mặc định có sẵn')).toBeNull()
    expect(screen.queryByText('Trung tâm điều phối Kael')).toBeNull()
    expect(screen.queryByText('Tiện ích phụ')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-agentic-entry')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-agentic-card')).toBeNull()
    expect(screen.getByText('Tài khoản & bảo mật')).toBeOnTheScreen()
    expect(screen.getByText('Ứng dụng')).toBeOnTheScreen()
  })

  it('groups the approved account functions into compact rows without the three legacy tiles', () => {
    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-settings-groups')).toHaveStyle({ marginTop: 16 })
    expect(screen.getByTestId('customer-v21-profile-settings-group-account-security')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-settings-group-payment-refunds')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-settings-group-app')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-settings-group-privacy-support')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-settings-group-account-management')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-setting-signout-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-setting-delete-account-icon')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-utility-grid')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-utility-settings')).toBeNull()

    for (const title of ['Tài khoản & bảo mật', 'Thanh toán & hoàn tiền', 'Quyền riêng tư & hỗ trợ', 'Quản lý tài khoản']) {
      expect(screen.getByText(title)).toHaveStyle({ fontWeight: '700' })
    }

    fireEvent.press(screen.getByTestId('customer-v21-profile-setting-personal'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=personal-details')

    fireEvent.press(screen.getByTestId('customer-v21-profile-setting-address'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=address')

    fireEvent.press(screen.getByTestId('customer-v21-profile-setting-password'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=password')

    fireEvent.press(screen.getByTestId('customer-v21-profile-setting-refunds'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=payment')

    fireEvent.press(screen.getByTestId('customer-v21-profile-setting-language'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=language')

    fireEvent.press(screen.getByTestId('customer-v21-profile-setting-appearance'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=appearance')

    fireEvent.press(screen.getByTestId('customer-v21-profile-setting-notifications'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=notifications')

    fireEvent.press(screen.getByTestId('customer-v21-profile-setting-support'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=support')

    fireEvent.press(screen.getByTestId('customer-v21-profile-setting-memory'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=memory')

    fireEvent.press(screen.getByTestId('customer-v21-profile-setting-delete-account'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=delete-account')
  })

  it('keeps formula mint aura at fifty percent on each Profile settings group', () => {
    render(<CustomerProfileSurface />)

    for (const group of ['account-security', 'payment-refunds', 'app', 'privacy-support', 'account-management']) {
      expect(
        screen.getByTestId(`customer-v21-profile-settings-group-${group}-surface-formula-mint-aura`),
      ).toHaveStyle({ opacity: 0.5 })
    }
  })

  it('keeps repeated settings rows compact and removes the legacy tile rail', () => {
    render(<CustomerProfileSurface />)

    expect(screen.queryByTestId('customer-v21-profile-utility-grid')).toBeNull()
    for (const row of ['personal', 'address', 'password', 'refunds', 'language', 'appearance', 'notifications', 'signout', 'delete-account']) {
      const testID = `customer-v21-profile-setting-${row}`
      expect(screen.getByTestId(testID)).toHaveStyle({ minHeight: 34 })
      expect(screen.getByTestId(`${testID}-icon`)).toBeOnTheScreen()
    }
  })

  it('signs out from the compact account-management group', () => {
    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-v21-profile-setting-signout'))

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('saves payment bank settings only after account confirmation matches', async () => {
    mockUtilityParam = 'payment'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-payment-screen')).toBeOnTheScreen()
    expect(screen.queryByText('Hoàn tiền')).toBeNull()
    expect(screen.queryByText('Ngân hàng mặc định và nơi nhận tiền')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-payment-status-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-payment-status-icon-glyph')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-payment-steps')).toHaveTextContent(/Chọn ngân hàng/)
    expect(screen.getByTestId('customer-v21-profile-payment-steps')).toHaveTextContent(/Nhập thông tin/)
    expect(screen.getByTestId('customer-v21-profile-payment-steps')).toHaveTextContent(/Hoàn tất/)
    expect(screen.getByTestId('customer-v21-profile-payment-status-title')).toHaveTextContent('Tài khoản nhận hoàn tiền')
    await waitFor(() => expect(screen.getByTestId('customer-v21-profile-payment-status')).toHaveTextContent('Chưa lưu'))
    expect(screen.getByTestId('customer-v21-profile-refund-account-usage')).toHaveTextContent('Chỉ dùng cho hoàn tiền đã xác nhận.')
    expect(screen.getByTestId('customer-v21-profile-payment-bank-grid')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-payment-bank-logo-vietcombank')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-payment-bank-grid-wide-mint-aura')).toBeNull()

    for (const [bank, name] of [
      ['vietcombank', 'Vietcombank'],
      ['bidv', 'BIDV'],
      ['mbbank', 'MBBank'],
      ['acb', 'ACB'],
      ['vietinbank', 'VietinBank'],
      ['techcombank', 'Techcombank'],
    ]) {
      fireEvent.press(screen.getByTestId(`customer-v21-payment-bank-tile-${bank}`))
      expect(screen.getByTestId(`customer-v21-payment-bank-tile-${bank}`)).toHaveTextContent(new RegExp(name))
      expect(screen.getByTestId(`customer-v21-payment-bank-tile-${bank}`)).toHaveProp('accessibilityState', {
        disabled: false,
        selected: true,
      })
    }
    expect(screen.getByTestId('customer-v21-profile-payment-status')).toHaveTextContent('Chưa lưu')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-payment-account-name-input'), 'PHAN MANH TU')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-payment-account-number-input'), '123456789')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-payment-account-confirm-input'), '123456788')
    fireEvent.press(screen.getByTestId('customer-v21-profile-payment-account-save'))

    expect(screen.getByTestId('customer-v21-payment-bank-logo-techcombank')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-payment-account-mismatch')).toHaveTextContent(/chưa khớp/)
    expect(mockSaveRefundAccount).not.toHaveBeenCalled()
    expect(mockUpdateCustomerProfile).not.toHaveBeenCalled()

    fireEvent.changeText(screen.getByTestId('customer-v21-profile-payment-account-confirm-input'), '123456789')
    expect(screen.getByTestId('customer-v21-profile-refund-account-confirmed')).toBeOnTheScreen()

    let resolvePendingPaymentSave: ((result: unknown) => void) | undefined
    mockSaveRefundAccount.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePendingPaymentSave = resolve
    }))
    fireEvent.press(screen.getByTestId('customer-v21-profile-payment-account-save'))

    expect(screen.getByTestId('customer-v21-profile-refund-account-saving')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-payment-status')).toHaveTextContent('Đang lưu')
    expect(screen.queryByTestId('customer-v21-profile-refund-account-saved')).toBeNull()
    await act(async () => {
      resolvePendingPaymentSave?.({
        data: {
          refund_account: {
            bank_account_masked: '**** 6789',
            bank_key: 'techcombank',
            bank_name: 'Techcombank',
            id: 'payment_method_test_1',
            is_default: true,
            status: 'pending_verification',
            updated_at: '2026-06-27T00:00:00.000Z',
            verified_at: null,
          },
        },
        status: 200,
        success: true,
      })
    })

    await waitFor(() => expect(mockSaveRefundAccount).toHaveBeenCalledWith(expect.objectContaining({
      account_holder_name: 'PHAN MANH TU',
      bank_account: '123456789',
      bank_key: 'techcombank',
    })))
    expect(mockUpdateCustomerProfile).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('customer-v21-profile-payment-settings')).toHaveTextContent(/Techcombank/))
    expect(screen.getByTestId('customer-v21-profile-payment-settings')).toHaveTextContent(/\*\*\*\* 6789/)
    expect(screen.getByTestId('customer-v21-profile-payment-settings')).toHaveTextContent(/Đã lưu/)
    expect(screen.getByTestId('customer-v21-profile-refund-account-saved')).toHaveTextContent(/Đã lưu tài khoản hoàn tiền/)

    fireEvent.press(screen.getByTestId('customer-v21-payment-bank-tile-bidv'))
    expect(screen.getByTestId('customer-v21-profile-payment-status-title')).toHaveTextContent('Tài khoản nhận hoàn tiền')
    expect(screen.getByTestId('customer-v21-profile-payment-status')).toHaveTextContent('Chưa lưu')
    expect(screen.getByTestId('customer-v21-profile-payment-settings')).not.toHaveTextContent(/\*\*\*\* 6789/)
  })

  it('keeps a refund account unsaved when mobile-api rejects storage', async () => {
    mockUtilityParam = 'payment'
    mockSaveRefundAccount.mockResolvedValueOnce({
      error: 'PAYMENT_NOT_ENABLED',
      status: 409,
      success: false,
    })

    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-v21-payment-bank-tile-techcombank'))
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-payment-account-name-input'), 'PHAN MANH TU')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-payment-account-number-input'), '123456789')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-payment-account-confirm-input'), '123456789')
    fireEvent.press(screen.getByTestId('customer-v21-profile-payment-account-save'))

    await waitFor(() => expect(mockSaveRefundAccount).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('customer-v21-profile-refund-account-error')).toHaveTextContent(/Chưa thể lưu tài khoản hoàn tiền/))
    expect(screen.queryByTestId('customer-v21-profile-refund-account-saved')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-payment-status')).toHaveTextContent('Chưa lưu')
  })

  it('does not report a saved refund account without a persisted backend record', async () => {
    mockUtilityParam = 'payment'
    mockSaveRefundAccount.mockResolvedValueOnce({ data: { refund_account: null }, status: 200, success: true })

    render(<CustomerProfileSurface />)

    expect(screen.queryByTestId('customer-v21-profile-refund-account-visual-audit')).toBeNull()
    await waitFor(() => expect(mockGetRefundAccount).toHaveBeenCalled())
    fireEvent.press(screen.getByTestId('customer-v21-payment-bank-tile-techcombank'))
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-payment-account-name-input'), 'TAI KHOAN KIEM THU')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-payment-account-number-input'), '123456789')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-payment-account-confirm-input'), '123456789')

    expect(screen.getByTestId('customer-v21-profile-refund-account-confirmed')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('customer-v21-profile-payment-account-save'))
    expect(screen.getByTestId('customer-v21-profile-refund-account-saving')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-payment-status')).toHaveTextContent('Đang lưu')

    await waitFor(() => expect(screen.getByTestId('customer-v21-profile-refund-account-error')).toBeOnTheScreen())
    expect(screen.queryByTestId('customer-v21-profile-refund-account-saved')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-payment-status')).toHaveTextContent('Chưa lưu')
    expect(mockSaveRefundAccount).toHaveBeenCalledTimes(1)
  })

  it('does not show backend endpoint errors on the payment utility screen', async () => {
    mockUtilityParam = 'payment'
    mockGetRefundAccount.mockResolvedValueOnce({
      error: 'Không tìm thấy endpoint',
      status: 404,
      success: false,
    })

    render(<CustomerProfileSurface />)

    await waitFor(() => expect(mockGetRefundAccount).toHaveBeenCalled())
    expect(screen.queryByText('Không tìm thấy endpoint')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-payment-message')).toBeNull()
  })

  it('saves default and secondary service addresses through customer profile metadata', async () => {
    mockUtilityParam = 'address'
    mockSessionMetadata = {
      default_address: 'Tòa A, Quận 7',
      saved_addresses: ['Tòa B, Quận 7'],
    }

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-top-title')).toBeEmptyElement()
    expect(screen.getByLabelText('Back')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-utility-address-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-address-settings')).toBeNull()
    expect(screen.queryByText('Địa chỉ dùng cho đặt dịch vụ')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-address-header')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-address-header-icon')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-utilityaddresshub-mint-aura')).toBeNull()
    expect(screen.getByText('Quản lý địa chỉ dịch vụ')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-default-address-input').props.value).toBe('Tòa A, Quận 7')

    fireEvent.changeText(screen.getByTestId('customer-v21-profile-default-address-input'), 'Tòa C, Quận 7')
    expect(screen.getByTestId('customer-v21-profile-address-hub')).toHaveTextContent(/Chưa lưu/)
    fireEvent.press(screen.getByTestId('customer-v21-profile-default-address-save'))

    // The real backend column is written first — updateCustomerProfile (Auth
    // metadata) only follows once that succeeds.
    await waitFor(() => expect(mockSaveCustomerDefaultAddress).toHaveBeenCalledWith('Tòa C, Quận 7'))
    await waitFor(() => expect(mockUpdateCustomerProfile).toHaveBeenCalledWith(expect.objectContaining({
      defaultAddress: 'Tòa C, Quận 7',
      savedAddresses: ['Tòa B, Quận 7'],
    })))
    await waitFor(() => expect(screen.getByTestId('customer-v21-profile-address-hub')).toHaveTextContent(/Đã đặt/))

    fireEvent.changeText(screen.getByTestId('customer-v21-profile-secondary-address-input'), 'Tòa D, Quận 7')
    fireEvent.press(screen.getByTestId('customer-v21-profile-secondary-address-save'))

    await waitFor(() => expect(mockUpdateCustomerProfile).toHaveBeenCalledWith(expect.objectContaining({
      defaultAddress: 'Tòa C, Quận 7',
      savedAddresses: ['Tòa B, Quận 7', 'Tòa D, Quận 7'],
    })))

    fireEvent.press(screen.getByTestId('customer-v21-profile-secondary-address-default-1'))

    await waitFor(() => expect(mockSaveCustomerDefaultAddress).toHaveBeenCalledWith('Tòa B, Quận 7'))
    await waitFor(() => expect(mockUpdateCustomerProfile).toHaveBeenCalledWith(expect.objectContaining({
      defaultAddress: 'Tòa B, Quận 7',
      savedAddresses: ['Tòa B, Quận 7', 'Tòa D, Quận 7'],
    })))
  })

  it('does not touch Auth metadata when the real backend address save fails', async () => {
    mockUtilityParam = 'address'
    mockSessionMetadata = { default_address: 'Tòa A, Quận 7', saved_addresses: [] }
    mockSaveCustomerDefaultAddress.mockResolvedValueOnce(false)

    render(<CustomerProfileSurface />)

    fireEvent.changeText(screen.getByTestId('customer-v21-profile-default-address-input'), 'Tòa C, Quận 7')
    fireEvent.press(screen.getByTestId('customer-v21-profile-default-address-save'))

    await waitFor(() => expect(mockSaveCustomerDefaultAddress).toHaveBeenCalledWith('Tòa C, Quận 7'))
    expect(mockUpdateCustomerProfile).not.toHaveBeenCalled()
  })

  it('lets the secondary-address input shrink so the Save button never overflows the row', () => {
    mockUtilityParam = 'address'

    render(<CustomerProfileSurface />)

    const inputStyle = StyleSheet.flatten(screen.getByTestId('customer-v21-profile-secondary-address-input').props.style)
    // flex:1 alone keeps an implicit min-width equal to the placeholder's
    // content width, so the row can render wider than the screen and push
    // the Save button off the right edge. minWidth:0 is what actually lets
    // the input shrink to make room for it.
    expect(inputStyle.flex).toBe(1)
    expect(inputStyle.minWidth).toBe(0)
  })

  it('opens personal details as a standalone form and preserves the real save action', async () => {
    mockUtilityParam = 'personal-details'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-personal-details-screen')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-settings-account-form')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-utility-settings-screen')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-settings-password-form')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-settings-memory')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-subscreen-body')).toHaveStyle({ marginTop: 14 })
    expect(screen.getByTestId('customer-v21-profile-personal-details-header')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-personal-details-header-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-personal-details-privacy')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-personal-details-card-formula-mint-aura')).toBeNull()
    expect(screen.getByText('Kiểm soát thông tin của bạn')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-settings-account-save')).toHaveTextContent('Lưu thay đổi')
    expect(screen.queryByText('Tài khoản')).toBeNull()
    expect(screen.queryByText('Thông tin dùng để liên hệ')).toBeNull()
    expect(screen.queryByText('Cài đặt tài khoản')).toBeNull()
    expect(screen.queryByText('Cài đặt chung')).toBeNull()

    fireEvent.changeText(screen.getByTestId('customer-v21-profile-settings-account-name-input'), 'Phan Manh Tu')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-settings-account-phone-input'), '0901234567')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-settings-account-email-input'), 'tu@example.com')
    fireEvent.press(screen.getByTestId('customer-v21-profile-settings-account-save'))

    await waitFor(() => expect(mockUpdateCustomerProfile).toHaveBeenCalledWith(expect.objectContaining({
      email: 'tu@example.com',
      fullName: 'Phan Manh Tu',
      phone: '0901234567',
    })))
    await waitFor(() => expect(screen.getByTestId('customer-v21-profile-settings-account-message')).toHaveTextContent(/Đã lưu/))
  })

  it('opens login security as a standalone form and preserves password validation', async () => {
    mockUtilityParam = 'password'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-password-screen')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-settings-password-form')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-settings-account-form')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-settings-memory')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-password-card-formula-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-top-subtitle')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-password-header')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-password-header-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-password-privacy')).toBeOnTheScreen()
    expect(screen.getByText('Bảo vệ tài khoản')).toBeOnTheScreen()
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-settings-password-current-input'), 'CurrentSafe123')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-settings-password-new-input'), 'NextSafe123')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-settings-password-confirm-input'), 'NextSafe123')
    fireEvent.press(screen.getByTestId('customer-v21-profile-settings-password-save'))

    await waitFor(() => expect(mockUpdatePassword).toHaveBeenCalledWith({
      currentPassword: 'CurrentSafe123',
      newPassword: 'NextSafe123',
    }))
    await waitFor(() => expect(screen.getByTestId('customer-v21-profile-settings-password-message')).toHaveTextContent(/Đã đổi mật khẩu/))
  })

  it('opens language as a standalone choice instead of changing it from the Profile row', () => {
    mockUtilityParam = 'language'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-language-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-language-card-formula-mint-aura')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-language-card-header')).toHaveStyle({
      alignItems: 'center',
      flexDirection: 'row',
    })
    expect(screen.getByTestId('customer-v21-profile-language-card-header-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-language-vi-visual')).toHaveStyle({ alignSelf: 'center' })
    expect(screen.getByTestId('customer-v21-profile-language-en-visual')).toHaveStyle({ alignSelf: 'center' })
    expect(screen.getByRole('radio', { name: 'Tiếng Việt' }).props.accessibilityState).toEqual({ selected: true })
    expect(screen.getByRole('radio', { name: 'Tiếng Anh' }).props.accessibilityState).toEqual({ selected: false })
    expect(within(screen.getByRole('radio', { name: 'Tiếng Việt' })).queryByText('Đang dùng')).toBeNull()
    expect(within(screen.getByRole('radio', { name: 'Tiếng Anh' })).queryByText('Đang dùng')).toBeNull()

    fireEvent.press(screen.getByRole('radio', { name: 'Tiếng Anh' }))
    expect(mockSetAppLanguage).toHaveBeenCalledWith('en')
  })

  it('opens Kael memory as a standalone permission and preserves its stored toggle', async () => {
    mockUtilityParam = 'memory'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-memory-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-settings-account-form')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-settings-password-form')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-settings-memory')).toHaveTextContent(/Không cho phép/)
    expect(screen.queryByTestId('customer-v21-profile-memory-card-formula-mint-aura')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-memory-card-header')).toHaveStyle({
      alignItems: 'center',
      flexDirection: 'row',
    })
    expect(screen.getByTestId('customer-v21-profile-memory-card-header-icon')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('customer-v21-profile-settings-memory'))
    await waitFor(() => expect(mockUpdateCustomerKaelMemoryPreference).toHaveBeenCalledWith({
      enabled: true,
      key: 'message_interaction_memory',
    }))
    expect(screen.getByTestId('customer-v21-profile-settings-memory')).toHaveTextContent(/Cho phép/)

    fireEvent.press(screen.getByTestId('customer-v21-profile-settings-memory'))
    await waitFor(() => expect(mockUpdateCustomerKaelMemoryPreference).toHaveBeenLastCalledWith({
      enabled: false,
      key: 'message_interaction_memory',
    }))
    expect(screen.getByTestId('customer-v21-profile-settings-memory')).toHaveTextContent(/Không cho phép/)
  })

  it('changes the real customer appearance preference from its dedicated utility', () => {
    mockUtilityParam = 'appearance'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-appearance-screen')).toBeOnTheScreen()
    expect(
      screen.queryByTestId('customer-v21-profile-appearance-card-formula-mint-aura'),
    ).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-appearance-card-header')).toHaveStyle({
      alignItems: 'center',
      flexDirection: 'row',
    })
    expect(screen.getByTestId('customer-v21-profile-appearance-card-header-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-appearance-light-visual')).toHaveStyle({ alignSelf: 'center' })
    expect(screen.getByTestId('customer-v21-profile-appearance-dark-visual')).toHaveStyle({ alignSelf: 'center' })
    expect(screen.getByRole('radio', { name: 'Sáng' }).props.accessibilityState).toEqual({ selected: true })
    expect(screen.getByRole('radio', { name: 'Tối' }).props.accessibilityState).toEqual({ selected: false })
    expect(within(screen.getByRole('radio', { name: 'Sáng' })).queryByText('Đang dùng')).toBeNull()
    expect(within(screen.getByRole('radio', { name: 'Tối' })).queryByText('Đang dùng')).toBeNull()

    fireEvent.press(screen.getByRole('radio', { name: 'Tối' }))

    expect(mockSetCustomerThemeMode).toHaveBeenCalledWith('dark')
  })

  it('keeps the shared Profile utility header readable in dark mode', () => {
    mockThemeMode = 'dark'
    mockUtilityParam = 'language'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-subscreen-topbar')).toHaveStyle({
      backgroundColor: getCustomerThemeTokens('dark').raised,
      borderColor: getCustomerThemeTokens('dark').border,
      borderWidth: 1,
    })
  })

  it('loads real notifications without a manual refresh control and opens their related work', async () => {
    mockUtilityParam = 'notifications'
    mockNotificationUnreadCount = 1
    mockNotifications = [{
      body: 'Thợ đã cập nhật thời gian đến.',
      created_at: '2026-07-29T08:30:00.000Z',
      event_type: 'worker_arrival_updated',
      id: 'notification_1',
      job_id: 'job_1',
      read_at: null,
      status: 'created',
      title: 'Thời gian đến đã thay đổi',
    }]

    render(<CustomerProfileSurface />)

    await waitFor(() => expect(mockRefreshNotifications).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('customer-v21-profile-utility-notifications-screen')).toBeOnTheScreen()
    expect(
      screen.queryByTestId('customer-v21-profile-notifications-summary-formula-mint-aura'),
    ).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-notifications-summary-header')).toHaveStyle({
      alignItems: 'center',
      flexDirection: 'row',
    })
    expect(screen.getByTestId('customer-v21-profile-notifications-summary-header-icon')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-notifications-refresh')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Làm mới thông báo' })).toBeNull()
    const notificationsPanel = within(screen.getByTestId('customer-v21-profile-notifications-summary'))
    expect(notificationsPanel.getByTestId('customer-v21-profile-notification-notification_1')).toHaveTextContent(/Thời gian đến đã thay đổi/)
    expect(notificationsPanel.getByTestId('customer-v21-profile-notification-notification_1')).toHaveTextContent(/Chưa đọc/)

    fireEvent.press(screen.getByTestId('customer-v21-profile-notification-notification_1'))

    await waitFor(() => expect(mockMarkNotificationRead).toHaveBeenCalledWith('notification_1'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/history?job_id=job_1&source=profile-notifications')
  })

  it('routes the support hub only to working help paths', () => {
    mockUtilityParam = 'support'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-support-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-support-summary-formula-mint-aura')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-support-summary-header')).toHaveStyle({
      alignItems: 'center',
      flexDirection: 'row',
    })
    expect(screen.getByTestId('customer-v21-profile-support-summary-header-icon')).toBeOnTheScreen()
    const supportPanel = within(screen.getByTestId('customer-v21-profile-support-summary'))
    expect(supportPanel.getByTestId('customer-v21-profile-support-history')).toBeOnTheScreen()
    expect(supportPanel.getByTestId('customer-v21-profile-support-kael')).toBeOnTheScreen()
    expect(supportPanel.getByTestId('customer-v21-profile-support-history-icon-glyph')).toBeOnTheScreen()
    expect(supportPanel.getByTestId('customer-v21-profile-support-kael-icon-glyph')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('customer-v21-profile-support-history'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/history?source=profile-support')

    fireEvent.press(screen.getByTestId('customer-v21-profile-support-kael'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=normal')
  })

  it('requires explicit consent and the exact phrase before deleting a real account', async () => {
    mockUtilityParam = 'delete-account'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-delete-account-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-delete-account-confirmation-card-formula-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-delete-account-card-header')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-delete-account-card-header-icon')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-delete-account-warning')).toHaveStyle({
      alignItems: 'center',
    })
    expect(screen.getByTestId('customer-v21-profile-delete-account-icon-frame')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-delete-account-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-delete-account-submit')).toBeDisabled()
    expect(screen.getByTestId('customer-v21-profile-delete-account-confirmation-card')).toHaveStyle({
      gap: 20,
      paddingHorizontal: 18,
      paddingVertical: 20,
    })
    expect(screen.getByTestId('customer-v21-profile-delete-account-confirmation-copy')).toHaveStyle({
      gap: 8,
    })
    expect(screen.getByTestId('customer-v21-profile-delete-account-confirmation')).toHaveStyle({
      minHeight: 56,
    })

    fireEvent.press(screen.getByTestId('customer-v21-profile-delete-account-acknowledgement'))
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-delete-account-confirmation'), 'XÓA TÀI KHOẢN')
    fireEvent.press(screen.getByTestId('customer-v21-profile-delete-account-submit'))

    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledWith({
      acknowledge_data_loss: true,
      client_request_id: expect.any(String),
      confirmation: 'XÓA TÀI KHOẢN',
    }, 'customer_access_token'))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
  })

  it('keeps legacy settings links working without rendering the removed settings screen', () => {
    mockUtilityParam = 'settings'
    mockSectionParam = 'password'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-password-screen')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-settings-password-form')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-settings-account-form')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-utility-settings-screen')).toBeNull()
    expect(screen.queryByText('Cài đặt tài khoản')).toBeNull()
  })

  it('opens the approved terms and policies screen and returns to Profile', () => {
    mockUtilityParam = 'legal'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-legal-screen')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-top-title')).toBeEmptyElement()
    expect(screen.getByLabelText('Back')).toBeOnTheScreen()
    expect(screen.getByText('Hiểu rõ trước khi sử dụng')).toBeOnTheScreen()
    expect(screen.queryByLabelText('Điều khoản và chính sách')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-legal-important-formula-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-legal-details-formula-mint-aura')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-legal-hero-header')).toHaveStyle({
      alignItems: 'center',
      flexDirection: 'row',
    })
    expect(screen.getByTestId('customer-v21-profile-legal-hero-header-icon')).toBeOnTheScreen()
    expect(screen.getByText('Những điều quan trọng')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Điều khoản sử dụng' }).props.accessibilityState).toEqual({ expanded: true })
    expect(screen.getAllByText(/Kael không tự quyết định hoặc xác nhận thay bạn/)).not.toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Quyền riêng tư' }).props.accessibilityState).toEqual({ expanded: false })

    fireEvent.press(screen.getByRole('button', { name: 'Quyền riêng tư' }))

    expect(screen.getByRole('button', { name: 'Quyền riêng tư' }).props.accessibilityState).toEqual({ expanded: true })
    expect(screen.getByText('NestScout không mua bán thông tin cá nhân.')).toBeOnTheScreen()
    expect(screen.queryByText(/Supabase|Backend/)).toBeNull()

    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile')
  })

  it('keeps the selected memory intent visible without rendering extra sync text when backend rejects message memory', async () => {
    mockUtilityParam = 'memory'
    mockUpdateCustomerKaelMemoryPreference.mockResolvedValue(false)

    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-v21-profile-settings-memory'))

    await waitFor(() => expect(mockUpdateCustomerKaelMemoryPreference).toHaveBeenCalledWith({
      enabled: true,
      key: 'message_interaction_memory',
    }))
    expect(screen.getByTestId('customer-v21-profile-settings-memory')).toHaveTextContent(/Cho phép/)
    expect(screen.queryByTestId('customer-v21-profile-settings-memory-message')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-profile-settings-memory'))

    await waitFor(() => expect(mockUpdateCustomerKaelMemoryPreference).toHaveBeenLastCalledWith({
      enabled: false,
      key: 'message_interaction_memory',
    }))
    expect(screen.getByTestId('customer-v21-profile-settings-memory')).toHaveTextContent(/Không cho phép/)
    expect(screen.queryByTestId('customer-v21-profile-settings-memory-message')).toBeNull()
  })

  it('keeps missing deployed memory endpoint out of visible settings chrome', async () => {
    mockUtilityParam = 'memory'
    mockUpdateCustomerKaelMemoryPreference.mockResolvedValue({
      code: 'NOT_FOUND',
      error: 'Khong tim thay endpoint',
      status: 404,
      success: false,
    })

    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-v21-profile-settings-memory'))

    await waitFor(() => expect(mockUpdateCustomerKaelMemoryPreference).toHaveBeenCalledWith({
      enabled: true,
      key: 'message_interaction_memory',
    }))
    expect(screen.getByTestId('customer-v21-profile-settings-memory')).toHaveTextContent(/Cho phép/)
    expect(screen.queryByTestId('customer-v21-profile-settings-memory-message')).toBeNull()
  })

  it('renders the settings memory switch from hydrated backend memory permissions', () => {
    mockUtilityParam = 'memory'
    mockCustomerKaelMemory = {
      service_preferences: {
        memory_permissions: {
          message_interaction_memory: true,
        },
      },
    }

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-settings-memory')).toHaveTextContent(/Cho phép/)
  })

  it('keeps the support utility param on the approved support hub', () => {
    mockUtilityParam = 'support'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-support-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-utility-settings-screen')).toBeNull()
  })

  it('treats every retired Agentic Center query as the normal Profile overview', () => {
    const retiredQueries = [
      { panel: 'memory' },
      { screen: '5.1-agentic-home' },
      { screen: '5.2-command-center' },
      { screen: '5.3-approval-queue' },
      { screen: '5.4-memory' },
      { utility: 'agentic' },
    ]

    retiredQueries.forEach((query) => {
      mockPanelParam = query.panel
      mockScreenParam = query.screen
      mockUtilityParam = query.utility

      const view = render(<CustomerProfileSurface />)

      expect(screen.getByTestId('customer-v21-profile-hero')).toBeOnTheScreen()
      expect(screen.queryByTestId('customer-v21-agentic-center')).toBeNull()
      expect(screen.queryByTestId('customer-v21-profile-memory')).toBeNull()
      expect(screen.queryByText('Trung tâm điều phối Kael')).toBeNull()

      view.unmount()
      mockPanelParam = undefined
      mockScreenParam = undefined
      mockUtilityParam = undefined
    })
  })
})

describe('CustomerV21 dock', () => {
  it.each(['home', 'services', 'activity', 'profile'] as const)('keeps four tabs and Kael visible when %s is active', (active) => {
    const view = render(<CustomerDockOverlay active={active} />)

    expect(screen.getByTestId('customer-v21-primary-dock')).toBeOnTheScreen()
    for (const id of ['home', 'services', 'activity', 'profile']) {
      expect(screen.getByTestId(`customer-v21-dock-${id}`)).toBeOnTheScreen()
    }
    expect(screen.getByTestId('customer-v21-kael-accessory')).toBeOnTheScreen()
    expect(screen.getByTestId(`customer-v21-dock-${active}`).props.accessibilityState?.selected).toBe(true)

    view.unmount()
  })

  it('renders four primary tabs plus a separate Kael accessory', () => {
    render(<CustomerDockOverlay active="home" />)

    expect(screen.getByTestId('customer-v21-primary-dock')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-dock-home')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-dock-services')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-dock-activity')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-dock-profile')).toBeOnTheScreen()
    for (const id of ['home', 'services', 'activity', 'profile']) {
      expect(screen.getByTestId(`customer-v21-dock-${id}-icon`)).toBeOnTheScreen()
    }
    expect(screen.getByTestId('customer-v21-kael-accessory')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-dock-kael')).toBeNull()
    expect(screen.queryByTestId('customer-v21-dock-lens')).toBeNull()
    expect(screen.queryByTestId('customer-v21-dock-shimmer')).toBeNull()
    expect(screen.queryByTestId('customer-v21-dock-caustic')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-dock-services'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/booking')

    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('customer-v21-kael-accessory'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=normal')
  })
})
