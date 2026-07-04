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

import { CustomerProfileSurface as ActiveCustomerProfileSurface, CustomerV4DockOverlay as ActiveCustomerV4DockOverlay } from '../customer-surfaces'
import { CustomerProfileSurface, CustomerV4DockOverlay } from '../v21/surfaces'

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

describe('Customer runtime profile and dock wiring', () => {
  it('exports the current V4 profile surface instead of the legacy v21 profile', () => {
    mockSessionMetadata = { full_name: 'Phan Mạnh Tú' }

    render(<ActiveCustomerProfileSurface />)

    expect(screen.getByTestId('customer-profile-surface')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-profile-hero')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-profile-hero-title')).toHaveTextContent('Phan Mạnh Tú')
    expect(screen.queryByTestId('customer-v21-profile-name')).toBeNull()
  })

  it('keeps the legacy v21 profile import path pinned to the current V4 profile surface', () => {
    mockSessionMetadata = { full_name: 'Phan Mạnh Tú' }

    render(<CustomerProfileSurface />)

    expect(screen.getByTestId('customer-profile-surface')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-profile-hero')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-profile-name')).toBeNull()
  })

  it('exports the current V4 dock instead of the legacy v21 dock', () => {
    render(<ActiveCustomerV4DockOverlay active="home" />)

    expect(screen.getByTestId('customer-liquid-glass-dock')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v4-dock-home')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v4-dock-booking')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v4-dock-activity')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v4-dock-profile')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v4-dock-kael')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-primary-dock')).toBeNull()
  })

  it('keeps the legacy v21 dock import path pinned to the current V4 dock', () => {
    render(<CustomerV4DockOverlay active="home" />)

    expect(screen.getByTestId('customer-liquid-glass-dock')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v4-dock-home')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-primary-dock')).toBeNull()
  })
})
