import { render, screen } from '@testing-library/react-native'
import type { LocalCustomerSearchState, LocalDeal, LocalDealStatus, LocalWorkflowSelectors } from '@nestscout/shared'

let mockRouteParams: Record<string, string | string[] | undefined>
let mockWorkflowValue: any
const mockReplace = jest.fn()

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-image', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Image: (props: any) => React.createElement(View, props),
  }
})

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
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
  useAuth: () => ({ session: { user: { id: 'customer_test_1' } } }),
}))

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => mockWorkflowValue,
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => 'vi',
  }
})

import { CustomerHistorySurface } from '../customer-surfaces'

const oldHistorySurfaceIds = [
  'customer-history-repair-hero-panel',
  'customer-history-phase-context',
  'customer-history-chat-input',
  'customer-history-price-tab-panel',
  'customer-history-cancel-local-deal',
  'customer-history-apartment-access-panel',
]

function buildDeal(status: LocalDealStatus, backendStatus: LocalDeal['backendStatus'] = status): LocalDeal {
  const accepted = status !== 'broadcasting'
  const paymentReady = backendStatus === 'payment_pending' || backendStatus === 'paid' || backendStatus === 'confirmed_by_customer'

  return {
    backendStatus,
    broadcast: {
      broadcastId: 'broadcast_test_1',
      estimatedEarningLabel: '120.000đ - 180.000đ',
      estimatedPriceLabel: '180.000đ - 260.000đ',
      fullAddressLabel: accepted ? 'Tòa A, Quận 1' : null,
      fullAddressVisible: accepted,
      generalArea: 'Quận 1',
      jobId: 'job_test_1',
      prebrief: ['Kael đã tóm tắt phạm vi và giữ địa chỉ chi tiết theo chính sách.'],
      problemSummary: 'Ổ cắm chập chờn',
      secondsRemaining: status === 'broadcasting' ? 45 : null,
      serviceType: 'electrical',
      status: accepted ? 'accepted' : 'sent',
    },
    completionNotes: paymentReady ? 'Đã thay ổ cắm và kiểm tra tải.' : null,
    completionPhotoUrls: paymentReady ? ['storage://job_test_1/after.jpg'] : [],
    draft: {
      addressLabel: 'Tòa A, Quận 1',
      description: 'Ổ cắm phòng khách chập chờn và có mùi khét nhẹ',
      districtLabel: 'Quận 1',
      inferredProblemLabel: null,
      mediaCount: 1,
      needsServiceChoice: false,
      problemChips: ['ổ cắm/công tắc hỏng'],
      serviceType: 'electrical',
      source: 'kael',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: {
      advisory: 'Kael có thể cập nhật nếu bằng chứng phạm vi thay đổi.',
      complexity: 'medium',
      confidenceLabel: '84%',
      disclaimer: 'Giá do Kael khóa theo bằng chứng hiện có.',
      hasVndPrice: true,
      priceRangeLabel: '180.000đ - 260.000đ',
      problemLabel: 'Ổ cắm chập chờn',
    },
    finalPrice: paymentReady ? 260000 : null,
    id: 'job_test_1',
    payment: paymentReady
      ? {
          grossAmount: 260000,
          platformFee: 39000,
          provider: 'sepay_vietqr',
          status: backendStatus === 'paid' ? 'reconciled' : 'pending',
          workerNet: 221000,
        }
      : null,
    scopeChange: null,
    status,
  }
}

function customerSearchStateForStatus(status: LocalDealStatus): LocalCustomerSearchState {
  if (status === 'broadcasting') return 'searching'
  if (status === 'worker_matched') return 'matched'
  if (status === 'completed_by_worker' || status === 'confirmed_by_customer' || status === 'payment_pending' || status === 'paid' || status === 'reviewed') return 'completed'
  if (['worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending'].includes(status)) return 'active'
  return 'idle'
}

function buildWorkflow(deal: LocalDeal | null) {
  const currentStatus = deal?.status ?? null
  const canCustomerSubmitReview = deal?.backendStatus === 'paid' || deal?.backendStatus === 'confirmed_by_customer'
  const selectors: LocalWorkflowSelectors = {
    canConfirmCustomerSearch: false,
    canCustomerCancelDeal: Boolean(deal && currentStatus !== 'reviewed'),
    canCustomerConfirmCompletion: false,
    canCustomerSubmitReview,
    canWorkerAccept: false,
    canWorkerAdvance: false,
    canWorkerSeeFullAddress: Boolean(deal?.broadcast?.fullAddressVisible),
    currentBackendStatus: deal?.backendStatus ?? currentStatus,
    currentStatus,
    customerSearchState: currentStatus ? customerSearchStateForStatus(currentStatus) : 'idle',
    draftValidationMessage: null,
    hasLocalBroadcast: Boolean(deal?.broadcast),
    paymentLocked: true,
    reviewLocked: !canCustomerSubmitReview,
    scheduleMode: 'now_only',
  }

  mockWorkflowValue = {
    actions: {
      authorizeApartmentAccess: jest.fn(async () => true),
      cancelRemoteJob: jest.fn(async () => true),
      decideScopeChange: jest.fn(async () => true),
      hydrateRemoteJobById: jest.fn(async () => true),
      submitReview: jest.fn(async () => true),
    },
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
  mockReplace.mockClear()
  mockRouteParams = { screen: '2.6-case-overview' }
  buildWorkflow(buildDeal('broadcasting'))
})

describe('CustomerHistorySurface V21 routing', () => {
  it('renders the PR72/V21 activity shell through the public customer barrel', () => {
    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-v21-activity')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-direct-empty-2.6-case-overview')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-top-title')).toBeOnTheScreen()
    for (const oldTestId of oldHistorySurfaceIds) {
      expect(screen.queryByTestId(oldTestId)).toBeNull()
    }
  })

  it('redirects real payment activity through V21 case-work instead of the deleted history surface', () => {
    mockRouteParams = { screen: '3.3-payment-protected' }
    buildWorkflow(buildDeal('payment_pending', 'payment_pending'))

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-v21-activity')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-direct-empty-3.3-payment-protected')).toBeOnTheScreen()
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('/(customer)/kael'))
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('focus=payment'))
    for (const oldTestId of oldHistorySurfaceIds) {
      expect(screen.queryByTestId(oldTestId)).toBeNull()
    }
  })

  it('keeps legacy case links on the V21 case-work route instead of reviving old history UI', () => {
    mockRouteParams = { screen: '2.7-matching' }
    buildWorkflow(buildDeal('worker_matched'))

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-v21-activity')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-direct-empty-2.7-matching')).toBeOnTheScreen()
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('/(customer)/kael'))
    expect(screen.queryByTestId('customer-history-phase-context')).toBeNull()
  })

  it('hydrates route job ids without falling back to the deleted split surface directory', () => {
    mockRouteParams = { job_id: 'job_from_route', screen: '2.6-case-overview' }
    buildWorkflow(null)

    render(<CustomerHistorySurface />)

    expect(mockWorkflowValue.actions.hydrateRemoteJobById).toHaveBeenCalledWith('job_from_route')
    expect(screen.getByTestId('customer-v21-direct-empty-2.6-case-overview')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-history-repair-hero-panel')).toBeNull()
  })
})
