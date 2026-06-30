import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { LocalDeal, LocalScopeChange } from '@nestscout/shared'

let mockSessionMetadata: Record<string, unknown>
let mockCustomerKaelMemory: any
let mockCustomerProfileInsights: any
let mockPanelParam: string | undefined
let mockScreenParam: string | undefined
let mockUtilityParam: string | undefined
let mockDeal: LocalDeal | null
let mockNotificationUnreadCount: number
let mockNotifications: Array<{
  body: string
  created_at: string
  event_type: string
  id: string
  job_id: string | null
  read_at: string | null
  status: string
  title: string
}>
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
      deal: mockDeal,
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

import { CustomerProfileSurface, CustomerV4DockOverlay } from '../customer-surfaces'

function buildDeal(): LocalDeal {
  return {
    backendStatus: 'worker_matched',
    broadcast: {
      broadcastId: 'broadcast_test_1',
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
      description: 'Ổ cắm phòng khách chập chờn và có mùi khét nhẹ',
      districtLabel: 'Quận 1',
      inferredProblemLabel: null,
      mediaCount: 1,
      needsServiceChoice: false,
      problemChips: ['Ổ cắm/công tắc hỏng'],
      serviceType: 'electrical',
      source: 'kael',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: {
      advisory: 'Kael có thể cập nhật nếu bằng chứng phạm vi thay đổi.',
      complexity: 'medium',
      confidenceLabel: '84%',
      disclaimer: 'Ước tính dựa trên bằng chứng hiện tại.',
      hasVndPrice: true,
      priceRangeLabel: '180.000đ - 260.000đ',
      problemLabel: 'Ổ cắm chập chờn',
    },
    finalPrice: null,
    id: 'job_test_1',
    payment: null,
    scopeChange: null,
    status: 'worker_matched',
  }
}

function buildScopeChange(): LocalScopeChange {
  return {
    createdAt: '2026-06-01T00:00:00.000Z',
    evidencePhotoUrls: [],
    id: 'scope_test_1',
    kaelProgress: null,
    kaelReview: null,
    priceMax: 50000,
    priceMin: 50000,
    reason: 'Cần bổ sung vật tư sau kiểm tra.',
    requestedDescription: 'Bổ sung ổ cắm an toàn.',
    status: 'waiting_customer_decision',
  }
}

function buildDealWithScopeChange(): LocalDeal {
  return {
    ...buildDeal(),
    backendStatus: 'scope_change_pending',
    scopeChange: buildScopeChange(),
    status: 'scope_change_pending',
  }
}

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
  mockDeal = null
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
    expect(screen.queryByTestId('customer-v21-top-avatar')).toBeNull()
    expect(screen.queryByText('--')).toBeNull()
  })

  it('uses real profile insight metrics, including real zero values', () => {
    mockCustomerProfileInsights = {
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

    fireEvent.press(screen.getByTestId('customer-v21-profile-ranking-cta'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?screen=6.2-usage-ranking')
    expect(screen.getByTestId('customer-v21-profile-ranking')).toHaveTextContent(/Tin cậy/)
    expect(screen.getByTestId('customer-v21-profile-ranking')).toHaveTextContent(/620/)
    expect(screen.getByTestId('customer-v21-profile-ranking-status-chip')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-progress')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-rank-node-3')).toHaveTextContent(/3/)
    expect(screen.getByTestId('customer-v21-profile-rank-process')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-rank-process-progress')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-evaluation')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-ranking-rule-completed-chip')).toHaveTextContent(/^0$/)
    expect(screen.getByTestId('customer-v21-profile-ranking-rule-review-chip')).toHaveTextContent(/^0%$/)
    expect(screen.getByTestId('customer-v21-profile-ranking-rule-protected-chip')).toHaveTextContent(/22 \/ 24/)
    expect(screen.queryByTestId('customer-v21-profile-ranking-kael')).toBeNull()

    unmount()
    mockScreenParam = '6.3-protect-money'
    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-money')).toHaveTextContent(/92\/100/)
    expect(screen.getByTestId('customer-v21-profile-money')).toHaveTextContent(/2.150.000đ/)
  })

  it('opens Agentic Center as a Profile utility instead of a primary tab', () => {
    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-v21-profile-agentic-entry'))

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=agentic')
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

  it('signs out from the profile overview action stack', () => {
    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-v21-profile-signout-cta'))

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('saves payment bank settings only after account confirmation matches', async () => {
    mockUtilityParam = 'payment'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-utility-payment-screen')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-profile-payment-bank-grid')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-payment-bank-logo-vietcombank')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-payment-status')).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-payment-bank-tile-techcombank'))
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
    expect(screen.queryByTestId('customer-v21-profile-utility-notifications-screen')).toBeNull()

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

  it('opens profile detail panels directly from safe query params', () => {
    mockPanelParam = 'memory'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-memory')).toBeOnTheScreen()
    expect(screen.queryByText('Thông tin nhanh')).toBeNull()
  })

  it('opens profile detail panels directly from zip screen ids', () => {
    mockScreenParam = '5.4-memory'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-memory')).toBeOnTheScreen()
    expect(screen.queryByText('ThÃ´ng tin nhanh')).toBeNull()
  })

  it('opens Agentic command center utility before a real process starts', () => {
    mockUtilityParam = 'agentic'

    render(<CustomerProfileSurface />)

    expect(screen.queryByTestId('customer-v21-agentic-home-inactive')).toBeNull()
    expect(screen.getByTestId('customer-v21-agentic-card-5.2-command-center')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-agentic-card-5.3-approval-queue')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-agentic-card-5.4-memory')).toBeOnTheScreen()
  })

  it('opens the direct approval queue screen without fake approval counts', () => {
    mockScreenParam = '5.3-approval-queue'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-agentic-approval-screen')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-agentic-approval-inactive')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-agentic-approval-queue')).toBeNull()
    expect(screen.queryByText(/Ch.a c. g. c.n duy.t/)).toBeNull()
    expect(screen.queryByText(/4\.9|AC|Vietcombank|paid_held/i)).toBeNull()
  })

  it('routes real Command Center actions to Case Chat and Approval Queue', () => {
    mockDeal = buildDealWithScopeChange()
    mockScreenParam = '5.2-command-center'

    render(<CustomerProfileSurface />)

    fireEvent.press(screen.getByTestId('customer-v21-agentic-open-case-chat'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')

    mockReplace.mockClear()
    fireEvent.press(screen.getByTestId('customer-v21-agentic-command-approval'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1&focus=approval')
  })

  it('renders memory preferences from real memory only and hides unsupported services', () => {
    mockCustomerKaelMemory = {
      language: 'vi',
      preference_summary: 'Ưu tiên lịch sáng, cần xác nhận trước khi chia sẻ cho thợ.',
      service_preferences: {
        preferred_service: 'ac',
      },
    }

    mockScreenParam = '5.4-memory'

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-v21-profile-memory')).toHaveTextContent(/Thông tin được phép dùng/)
    expect(screen.getByTestId('customer-v21-profile-memory')).toHaveTextContent(/Ranh giới dữ liệu/)
    expect(screen.getByTestId('customer-v21-profile-memory')).toHaveTextContent(/Không trộn trò chuyện thường vào công việc/)
    expect(screen.queryByText(/ac|máy lạnh/i)).toBeNull()
  })
})

describe('CustomerV21 dock', () => {
  it('renders four primary tabs plus a separate Kael accessory', () => {
    render(<CustomerV4DockOverlay active="home" />)

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
