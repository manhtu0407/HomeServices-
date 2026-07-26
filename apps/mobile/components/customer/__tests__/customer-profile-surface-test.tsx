import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
let mockSessionMetadata: Record<string, unknown>
let mockCustomerKaelMemory: any
let mockCustomerProfileInsights: any
let mockPanelParam: string | undefined
let mockScreenParam: string | undefined
let mockUtilityParam: string | undefined
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
const mockUpdateCustomerKaelMemoryPreference = jest.fn()
const mockGetPaymentMethod = jest.fn()
const mockSavePaymentMethod = jest.fn()

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ panel: mockPanelParam, screen: mockScreenParam, utility: mockUtilityParam }),
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
        email: 'manhtu0407@gmail.com',
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
      updateCustomerKaelMemoryPreference: mockUpdateCustomerKaelMemoryPreference,
    },
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
      getPaymentMethod: (...args: unknown[]) => mockGetPaymentMethod(...args),
      savePaymentMethod: (...args: unknown[]) => mockSavePaymentMethod(...args),
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
    useAppLanguage: () => 'vi',
  }
})

jest.mock('../customer-theme', () => {
  const actual = jest.requireActual('../customer-theme')
  return {
    ...actual,
    useCustomerThemeMode: () => 'light',
  }
})

import { CustomerDockOverlay, CustomerProfileSurface } from '../customer-surfaces'

beforeEach(() => {
  mockReplace.mockClear()
  mockSignOut.mockClear()
  mockUpdateCustomerProfile.mockReset()
  mockUpdateCustomerProfile.mockResolvedValue({ success: true })
  mockUpdatePassword.mockReset()
  mockUpdatePassword.mockResolvedValue({ success: true })
  mockSetAppLanguage.mockClear()
  mockUpdateCustomerKaelMemoryPreference.mockReset()
  mockUpdateCustomerKaelMemoryPreference.mockResolvedValue(true)
  mockGetPaymentMethod.mockReset()
  mockGetPaymentMethod.mockResolvedValue({ data: { payment_method: null }, status: 200, success: true })
  mockSavePaymentMethod.mockReset()
  mockSavePaymentMethod.mockResolvedValue({
    data: {
      payment_method: {
        account_holder_name: 'PHAN MANH TU',
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
  mockSessionMetadata = {}
  mockCustomerKaelMemory = null
  mockCustomerProfileInsights = null
  mockPanelParam = undefined
  mockScreenParam = undefined
  mockUtilityParam = undefined
  mockNotificationUnreadCount = 0
  mockNotifications = []
})

describe('CustomerProfileSurface v2.1', () => {
  it('renders profile overview with honest pending metrics when insights are missing', () => {
    mockSessionMetadata = { full_name: 'Phan Mạnh Tú' }

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-name')).toHaveTextContent('Phan Mạnh Tú')
    expect(screen.queryByTestId('customer-v21-profile-completed')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-addresses')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-services')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-protection-card')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-ranking-entry')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-visual-panel')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-icon-image')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-connector-dot')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-signals')).toHaveTextContent(/Tăng theo hoạt động thật/)
    expect(screen.queryByTestId('customer-v21-top-avatar')).toBeNull()
    expect(screen.queryByText('⚙')).toBeNull()
    expect(screen.queryByText('--')).toBeNull()
    const hero = screen.getByTestId('customer-v21-profile-hero')
    expect(within(hero).queryByText('✓')).toBeNull()
    expect(within(hero).queryByText('Tích cực')).toBeNull()
    expect(within(hero).queryByText('Khách hàng đã xác minh')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-account-journey')).toBeOnTheScreen()
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
      usage_rank_level: 3,
      usage_rank_points: 620,
    }

    const { unmount } = render(<CustomerProfileSurface />)

    expect(screen.queryByTestId('customer-v21-profile-completed')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-protection-card')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-ranking-entry')).toHaveTextContent(/620 \/ 1.000/)
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-progress')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-entry-points-signal')).toHaveTextContent(/620 \/ 1.000/)
    expect(screen.getByTestId('customer-v21-profile-account-start')).toHaveTextContent('Thành viên từ 01/06/2026')
    expect(screen.getByTestId('customer-v21-profile-active-days')).toHaveTextContent('Dùng dịch vụ: 2 ngày')
    expect(screen.getByTestId('customer-v21-profile-total-days')).toHaveTextContent(/Ngày thứ \d+/)

    fireEvent.press(screen.getByTestId('customer-v21-profile-ranking-cta'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?screen=6.2-usage-ranking')
    expect(screen.getByTestId('customer-v21-profile-ranking')).toHaveTextContent(/Tin cậy/)
    expect(screen.getByTestId('customer-v21-profile-ranking')).toHaveTextContent(/620/)
    expect(screen.queryByRole('button', { name: 'i' })).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-ranking-status-chip')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-ranking-progress')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-rank-node-3')).toHaveTextContent(/3/)
    expect(screen.getByTestId('customer-v21-profile-rank-process')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-rank-process-progress')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-ranking-evaluation')).toBeNull()
    expect(screen.queryByText('Kael đánh giá dữ liệu thật')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-ranking-rule-completed-chip')).toHaveTextContent(/^0$/)
    expect(screen.getByTestId('customer-v21-profile-ranking-rule-review-chip')).toHaveTextContent(/^0%$/)
    expect(screen.getByTestId('customer-v21-profile-ranking-rule-protected-chip')).toHaveTextContent(/22 \/ 24/)
    const rankingRules = [
      ['completed', 'Theo trạng thái', 'Không bỏ đơn'],
      ['review', 'Sau công việc', 'Phản hồi công bằng'],
      ['protected', 'Trong hệ thống', 'Có đối soát'],
    ] as const
    const rankingRuleIconSources = rankingRules.map(([rule, firstDetail, secondDetail]) => {
      const testID = `customer-v21-profile-ranking-rule-${rule}`

      expect(screen.getByTestId(testID)).toHaveStyle({ flexDirection: 'row', minHeight: 112 })
      expect(screen.getByTestId(`${testID}-visual-panel`)).toHaveStyle({ borderRightWidth: 1, width: 96 })
      expect(screen.getByTestId(`${testID}-mint-aura`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${testID}-connector`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${testID}-connector-dot`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${testID}-title`)).toHaveStyle({ fontSize: 16, fontWeight: '700', lineHeight: 21 })
      expect(screen.getByTestId(`${testID}-body`)).toHaveStyle({ fontSize: 14, lineHeight: 20 })
      expect(screen.getByTestId(`${testID}-detail-rail-0`)).toHaveTextContent(firstDetail)
      expect(screen.getByTestId(`${testID}-detail-rail-1`)).toHaveTextContent(secondDetail)

      return screen.getByTestId(`${testID}-icon-image`).props.source
    })
    expect(new Set(rankingRuleIconSources).size).toBe(rankingRules.length)
    expect(screen.queryByTestId('customer-v21-profile-ranking-kael')).toBeNull()

    unmount()
    mockScreenParam = '6.3-protect-money'
    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-money')).toHaveTextContent(/92\/100/)
    expect(screen.getByTestId('customer-v21-profile-money')).toHaveTextContent(/2.150.000đ/)
  })

  it('keeps the ranking status inside its score lens and tracks real rank progress with the mint dot', () => {
    mockScreenParam = '6.2-usage-ranking'

    const { rerender } = render(<CustomerProfileSurface />)

    expect(screen.queryByTestId('customer-v21-profile-ranking-status-chip')).toBeNull()
    expect(screen.queryByText('Hạng phản ánh cách bạn sử dụng dịch vụ')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-score-Ranking-value')).toHaveProp('numberOfLines', 2)
    expect(screen.getByTestId('customer-v21-profile-score-Ranking-value')).toHaveStyle({ maxWidth: 72 })
    expect(screen.getByTestId('customer-v21-profile-score-Ranking-value')).toHaveStyle({ fontSize: 18, lineHeight: 22 })

    const pendingDot = screen.getByTestId('customer-v21-profile-score-Ranking-progress-dot')
    expect(Math.hypot(Number(pendingDot.props.cx) - 50, Number(pendingDot.props.cy) - 50)).toBeCloseTo(43, 5)

    mockCustomerProfileInsights = {
      usage_rank_level: 3,
      usage_rank_points: 250,
    }
    rerender(<CustomerProfileSurface />)

    const firstProgressDot = screen.getByTestId('customer-v21-profile-score-Ranking-progress-dot')
    const firstPosition = { cx: firstProgressDot.props.cx, cy: firstProgressDot.props.cy }
    expect(Math.hypot(Number(firstPosition.cx) - 50, Number(firstPosition.cy) - 50)).toBeCloseTo(43, 5)

    mockCustomerProfileInsights = {
      usage_rank_level: 3,
      usage_rank_points: 620,
    }
    rerender(<CustomerProfileSurface />)

    const nextProgressDot = screen.getByTestId('customer-v21-profile-score-Ranking-progress-dot')
    const nextPosition = { cx: nextProgressDot.props.cx, cy: nextProgressDot.props.cy }
    expect(nextPosition).not.toEqual(firstPosition)
    expect(Math.hypot(Number(nextPosition.cx) - 50, Number(nextPosition.cy) - 50)).toBeCloseTo(43, 5)
  })

  it('removes the smart utility section and Agentic Center entry from Profile', () => {
    render(<CustomerProfileSurface />)

    expect(screen.queryByText('Tiện ích thông minh')).toBeNull()
    expect(screen.queryByText('Mặc định có sẵn')).toBeNull()
    expect(screen.queryByText('Trung tâm điều phối Kael')).toBeNull()
    expect(screen.queryByText('Tiện ích phụ')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-agentic-entry')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-agentic-card')).toBeNull()
    expect(screen.getByText('Tiện ích tài khoản')).toBeOnTheScreen()
  })

  it('opens account utility sections from the three profile utility tiles', () => {
    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-v21-profile-utility-address'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=address')

    fireEvent.press(screen.getByTestId('customer-v21-profile-utility-payment'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=payment')

    expect(screen.queryByTestId('customer-v21-profile-utility-notifications')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-utility-support')).toBeNull()
    fireEvent.press(screen.getByTestId('customer-v21-profile-utility-settings'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=settings')
  })

  it('keeps the three profile utilities in one compact service-card rail', () => {
    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-grid')).toHaveStyle({
      flexDirection: 'row',
      flexWrap: 'nowrap',
    })

    for (const utility of ['address', 'payment', 'settings']) {
      const testID = `customer-v21-profile-utility-${utility}`

      expect(screen.getByTestId(testID)).toHaveStyle({ flexDirection: 'column' })
      expect(screen.getByTestId(testID)).toHaveStyle({
        flexBasis: 0,
        flexGrow: utility === 'payment' ? 1.16 : 1,
      })
      expect(screen.getByTestId(`${testID}-skin`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${testID}-formula-mint-aura`)).toHaveStyle({
        bottom: 0,
        left: 0,
        opacity: 0.94,
        position: 'absolute',
        right: 0,
        top: 0,
      })
      expect(screen.getByTestId(`${testID}-wide-mint-aura`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${testID}-mint-aura`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${testID}-visual-panel`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${testID}-icon`)).toHaveStyle({
        backgroundColor: 'transparent',
        borderWidth: 0,
        height: 40,
        minHeight: 40,
        minWidth: 40,
        width: 40,
      })
      expect(screen.getByTestId(`${testID}-connector`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${testID}-connector-dot`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${testID}-copy`)).toHaveStyle({
        paddingLeft: 10,
        paddingRight: 2,
      })
      expect(screen.getByTestId(`${testID}-title`)).toHaveProp('numberOfLines', 2)
      expect(screen.getByTestId(`${testID}-detail-rail`)).toHaveStyle({
        flexDirection: 'row',
        flexWrap: 'nowrap',
        justifyContent: 'center',
      })
      expect(screen.getByTestId(`${testID}-value`)).toHaveProp('numberOfLines', 1)
      expect(within(screen.getByTestId(testID)).queryByText('›')).toBeNull()
    }
  })

  it('signs out from the profile overview action stack', () => {
    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-v21-profile-signout-cta'))

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('saves payment bank settings only after account confirmation matches', async () => {
    mockUtilityParam = 'payment'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-payment-screen')).toBeOnTheScreen()
    expect(screen.queryByText('Ngân hàng mặc định và nơi nhận tiền')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-payment-hero-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-payment-hero-connector-dot')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-payment-hero-signals')).toHaveTextContent(/Chủ tài khoản/)
    expect(screen.getByTestId('customer-v21-profile-payment-hero-signals')).toHaveTextContent(/Cần xác minh/)
    expect(screen.getByTestId('customer-v21-profile-payment-hero-title')).toHaveTextContent('Tài khoản nhận tiền')
    expect(screen.getByTestId('customer-v21-profile-payment-hero-title-copy')).toHaveStyle({
      flex: 1,
      justifyContent: 'center',
    })
    await waitFor(() => expect(screen.getByTestId('customer-v21-profile-payment-hero-status')).toHaveTextContent('Chưa có'))
    expect(screen.getByTestId('customer-v21-profile-payment-bank-grid')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-payment-bank-logo-vietcombank')).toBeOnTheScreen()
    for (const bank of ['vietcombank', 'techcombank', 'bidv', 'mbbank', 'acb', 'vietinbank']) {
      expect(screen.getByTestId(`customer-v21-payment-bank-tile-${bank}-mint-aura`)).toBeOnTheScreen()
    }
    expect(screen.queryByTestId('customer-v21-profile-payment-status')).toBeNull()

    for (const [bank, name] of [
      ['vietcombank', 'Vietcombank'],
      ['bidv', 'BIDV'],
      ['mbbank', 'MBBank'],
      ['acb', 'ACB'],
      ['vietinbank', 'VietinBank'],
      ['techcombank', 'Techcombank'],
    ]) {
      fireEvent.press(screen.getByTestId(`customer-v21-payment-bank-tile-${bank}`))
      expect(screen.getByTestId('customer-v21-profile-payment-hero-title')).toHaveTextContent(name)
      expect(screen.getByTestId(`customer-v21-payment-bank-tile-${bank}`)).toHaveProp('accessibilityState', {
        disabled: false,
        selected: true,
      })
    }
    expect(screen.getByTestId('customer-v21-profile-payment-hero-status')).toHaveTextContent('Chưa có')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-payment-account-name-input'), 'PHAN MANH TU')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-payment-account-number-input'), '123456789')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-payment-account-confirm-input'), '123456788')
    fireEvent.press(screen.getByTestId('customer-v21-profile-payment-account-save'))

    expect(screen.getByTestId('customer-v21-payment-bank-tile-techcombank-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-payment-account-mismatch')).toHaveTextContent(/chưa khớp/)
    expect(mockSavePaymentMethod).not.toHaveBeenCalled()
    expect(mockUpdateCustomerProfile).not.toHaveBeenCalled()

    fireEvent.changeText(screen.getByTestId('customer-v21-profile-payment-account-confirm-input'), '123456789')
    fireEvent.press(screen.getByTestId('customer-v21-profile-payment-account-save'))

    await waitFor(() => expect(mockSavePaymentMethod).toHaveBeenCalledWith(expect.objectContaining({
      account_holder_name: 'PHAN MANH TU',
      bank_account: '123456789',
      bank_key: 'techcombank',
      bank_name: 'Techcombank',
    })))
    expect(mockUpdateCustomerProfile).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('customer-v21-profile-payment-settings')).toHaveTextContent(/Techcombank/))
    expect(screen.getByTestId('customer-v21-profile-payment-settings')).toHaveTextContent(/\*\*\*\* 6789/)
    expect(screen.getByTestId('customer-v21-profile-payment-settings')).toHaveTextContent(/Chưa xác minh/)

    fireEvent.press(screen.getByTestId('customer-v21-payment-bank-tile-bidv'))
    expect(screen.getByTestId('customer-v21-profile-payment-hero-title')).toHaveTextContent('BIDV')
    expect(screen.getByTestId('customer-v21-profile-payment-hero-status')).toHaveTextContent('Chưa có')
    expect(screen.getByTestId('customer-v21-profile-payment-settings')).not.toHaveTextContent(/\*\*\*\* 6789/)
  })

  it('does not show backend endpoint errors on the payment utility screen', async () => {
    mockUtilityParam = 'payment'
    mockGetPaymentMethod.mockResolvedValueOnce({
      error: 'Không tìm thấy endpoint',
      status: 404,
      success: false,
    })

    render(<CustomerProfileSurface />)

    await waitFor(() => expect(mockGetPaymentMethod).toHaveBeenCalled())
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

    expect(screen.getByTestId('customer-v21-top-title')).toHaveStyle({ fontWeight: '400' })
    expect(screen.getByTestId('customer-v21-profile-utility-address-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-address-settings')).toBeNull()
    expect(screen.queryByText('Địa chỉ dùng cho đặt dịch vụ')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-default-address-input').props.value).toBe('Tòa A, Quận 7')

    fireEvent.changeText(screen.getByTestId('customer-v21-profile-default-address-input'), 'Tòa C, Quận 7')
    expect(screen.getByTestId('customer-v21-profile-address-hub')).toHaveTextContent(/Chưa lưu/)
    fireEvent.press(screen.getByTestId('customer-v21-profile-default-address-save'))

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

    await waitFor(() => expect(mockUpdateCustomerProfile).toHaveBeenCalledWith(expect.objectContaining({
      defaultAddress: 'Tòa B, Quận 7',
      savedAddresses: ['Tòa B, Quận 7', 'Tòa D, Quận 7'],
    })))
  })

  it('renders account settings with real password and utility actions', async () => {
    mockUtilityParam = 'settings'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-settings-screen')).toBeOnTheScreen()
    expect(screen.queryByText('Bảo mật, ngôn ngữ và dữ liệu tài khoản')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-utility-notifications-screen')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-settings-hero-visual-panel')).toHaveStyle({ borderRightWidth: 1, width: 116 })
    expect(screen.getByTestId('customer-v21-profile-settings-hero-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-settings-hero-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-settings-hero-connector')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-settings-hero-connector-dot')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-settings-hero-title')).toHaveTextContent('Cài đặt tài khoản')
    expect(screen.getByTestId('customer-v21-profile-settings-hero-body')).toHaveStyle({ fontSize: 14, lineHeight: 20 })
    expect(screen.getByTestId('customer-v21-profile-settings-hero-detail-profile')).toHaveTextContent('Hồ sơ & bảo mật')
    expect(screen.getByTestId('customer-v21-profile-settings-hero-detail-language')).toHaveTextContent('Ngôn ngữ & dữ liệu')
    expect(screen.getByTestId('customer-v21-profile-settings-hero-status')).toHaveTextContent('Tài khoản')
    expect(screen.queryByRole('button', { name: 'i' })).toBeNull()

    const settingsRows = [
      ['account', 'Tên & liên hệ', 'Thông tin riêng'],
      ['language', 'Ngôn ngữ', 'Giao diện'],
      ['password', 'Mật khẩu', 'Xác nhận hiện tại'],
      ['address', 'Địa chỉ chính', 'Địa chỉ phụ'],
      ['memory', 'Quyền ghi nhớ', 'Bạn kiểm soát'],
    ] as const
    const settingsIconSources = settingsRows.map(([utility, firstDetail, secondDetail]) => {
      const testID = `customer-v21-profile-settings-${utility}`

      expect(screen.getByTestId(testID)).toHaveStyle({ flexDirection: 'row', minHeight: 112 })
      expect(screen.getByTestId(`${testID}-visual-panel`)).toHaveStyle({ borderRightWidth: 1, width: 96 })
      expect(screen.getByTestId(`${testID}-mint-aura`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${testID}-connector`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${testID}-connector-dot`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${testID}-copy`)).toBeOnTheScreen()
      expect(screen.getByTestId(`${testID}-title`)).toHaveProp('numberOfLines', 2)
      expect(screen.getByTestId(`${testID}-body`)).toHaveProp('numberOfLines', 2)
      expect(screen.getByTestId(`${testID}-detail-rail-0`)).toHaveTextContent(firstDetail)
      expect(screen.getByTestId(`${testID}-detail-rail-1`)).toHaveTextContent(secondDetail)
      expect(screen.getByTestId(`${testID}-status-frame`)).toHaveStyle({ alignSelf: 'center' })

      return screen.getByTestId(`${testID}-icon-image`).props.source
    })

    expect(new Set(settingsIconSources).size).toBe(settingsRows.length)

    fireEvent.press(screen.getByTestId('customer-v21-profile-settings-password'))
    expect(screen.getByTestId('customer-v21-profile-settings-password-form')).toBeOnTheScreen()
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-settings-password-current-input'), 'CurrentSafe123')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-settings-password-new-input'), 'NextSafe123')
    fireEvent.changeText(screen.getByTestId('customer-v21-profile-settings-password-confirm-input'), 'NextSafe123')
    fireEvent.press(screen.getByTestId('customer-v21-profile-settings-password-save'))

    await waitFor(() => expect(mockUpdatePassword).toHaveBeenCalledWith({
      currentPassword: 'CurrentSafe123',
      newPassword: 'NextSafe123',
    }))
    await waitFor(() => expect(screen.getByTestId('customer-v21-profile-settings-password-message')).toHaveTextContent(/Đã đổi mật khẩu/))

    fireEvent.press(screen.getByTestId('customer-v21-profile-settings-account'))
    expect(screen.getByTestId('customer-v21-profile-settings-account-form')).toBeOnTheScreen()
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

    fireEvent.press(screen.getByTestId('customer-v21-profile-settings-language'))
    expect(mockSetAppLanguage).toHaveBeenCalledWith('en')

    fireEvent.press(screen.getByTestId('customer-v21-profile-settings-address'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=address')

    expect(screen.queryByTestId('customer-v21-profile-settings-theme')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-settings-payment')).toBeNull()
    expect(screen.queryByTestId('customer-v21-profile-settings-signout')).toBeNull()
    expect(screen.getByTestId('customer-v21-profile-settings-memory')).toHaveTextContent(/Không cho phép/)

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

  it('keeps the selected memory intent visible without rendering extra sync text when backend rejects message memory', async () => {
    mockUtilityParam = 'settings'
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
    mockUtilityParam = 'settings'
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
    mockUtilityParam = 'settings'
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

  it('routes the previous support utility param into account settings', () => {
    mockUtilityParam = 'support'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-settings-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-utility-support-screen')).toBeNull()
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
  it('renders four primary tabs plus a separate Kael accessory', () => {
    render(<CustomerDockOverlay active="home" />)

    expect(screen.getByTestId('customer-v21-primary-dock')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-dock-home')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-dock-services')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-dock-activity')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-dock-profile')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-kael-accessory')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-dock-kael')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-dock-services'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/booking')

    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('customer-v21-kael-accessory'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=normal')
  })
})
