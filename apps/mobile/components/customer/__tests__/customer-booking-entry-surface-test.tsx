import { render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import type { LocalDeal, LocalWorkflowSelectors } from '@home-services/shared'

let mockWorkflowValue: any
const mockPush = jest.fn()
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
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
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
  useAuth: () => ({ session: { user: { id: 'customer_test_1', user_metadata: {} } } }),
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

import { CustomerBookingEntrySurface } from '../customer-surfaces'

function buildActiveDeal(): LocalDeal {
  return {
    backendStatus: 'broadcasting',
    broadcast: {
      broadcastId: 'broadcast_test_1',
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'Thủ Đức',
      jobId: 'job_test_1',
      prebrief: [],
      problemSummary: 'Bóng đèn hư',
      secondsRemaining: 42,
      serviceType: 'cleaning',
      status: 'sent',
    },
    completionNotes: null,
    completionPhotoUrls: [],
    draft: {
      addressLabel: 'Thủ Đức',
      description: 'Cần dọn nhà',
      districtLabel: 'Thủ Đức',
      inferredProblemLabel: null,
      mediaCount: 1,
      needsServiceChoice: false,
      problemChips: ['routine_cleaning'],
      serviceType: 'cleaning',
      source: 'booking',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: {
      advisory: 'Kael đang giữ ước tính theo bằng chứng hiện có.',
      complexity: 'medium',
      confidenceLabel: '84%',
      disclaimer: 'Ước tính dựa trên bằng chứng hiện tại.',
      hasVndPrice: true,
      priceRangeLabel: '180.000đ - 260.000đ',
      problemLabel: 'Vệ sinh căn hộ',
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
  mockPush.mockClear()
  mockReplace.mockClear()
  buildWorkflow(buildActiveDeal())
})

describe('CustomerBookingEntrySurface active request material', () => {
  it('renders the new intake table without a white child strip on the empty booking route', () => {
    buildWorkflow(null)
    render(<CustomerBookingEntrySurface />)

    const shellStyle = StyleSheet.flatten(screen.getByTestId('booking-wizard-intake-shell').props.style) as Record<string, unknown>
    const gridStyle = StyleSheet.flatten(screen.getByTestId('booking-wizard-intake-grid').props.style) as Record<string, unknown>
    const serviceFieldStyle = StyleSheet.flatten(screen.getByTestId('booking-wizard-intake-service-field').props.style) as Record<string, unknown>

    expect(screen.getByTestId('booking-wizard-intake-shell-apple-edge')).toBeOnTheScreen()
    expect(screen.getByTestId('booking-wizard-intake-grid-apple-edge')).toBeOnTheScreen()
    expect(String(shellStyle.backgroundImage ?? shellStyle.background ?? shellStyle.experimental_backgroundImage)).toContain('rgba(255,255,255,0.88)')
    expect(String(gridStyle.backgroundImage ?? gridStyle.background ?? gridStyle.experimental_backgroundImage)).toContain('rgba(255,255,255,0.64)')
    expect(String(shellStyle.borderColor)).toContain('rgba(255,255,255')
    expect(String(gridStyle.borderColor)).toContain('rgba(255,255,255')
    expect(gridStyle.overflow).toBe('hidden')
    expect(serviceFieldStyle.backgroundColor).toBe('transparent')
    expect(serviceFieldStyle.borderWidth).toBe(0)
    expect(serviceFieldStyle.flexBasis).toBeUndefined()
    expect(screen.getByTestId('booking-wizard-intake-problem-field')).toBeOnTheScreen()
    expect(screen.getByTestId('booking-wizard-intake-price-field')).toBeOnTheScreen()
    expect(screen.getByTestId('booking-wizard-intake-complexity-field')).toBeOnTheScreen()
    expect(screen.getByTestId('booking-wizard-intake-confidence-field')).toBeOnTheScreen()
    expect(screen.getByTestId('booking-wizard-intake-platform-fee-field')).toBeOnTheScreen()
    expect(screen.getByTestId('booking-wizard-intake-total-field')).toBeOnTheScreen()
    expect(screen.getByTestId('booking-wizard-intake-policy-field')).toBeOnTheScreen()
  })

  it('restores the original intake top and applies mint material only to the lower active request card', () => {
    render(<CustomerBookingEntrySurface />)

    const washStyle = StyleSheet.flatten(screen.getByTestId('customer-section-liquid-wash-booking').props.style)
    expect(washStyle).toMatchObject({ height: 0, opacity: 0, width: 0 })
    expect(screen.queryByText('2 bước + Kael')).toBeNull()
    expect(screen.getByTestId('customer-booking-service-entry-grid')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-booking-summary-chips')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-booking-ai-diagnosis-summary')).toBeOnTheScreen()

    const panel = screen.getByTestId('customer-booking-intake-handoff-panel')
    const panelStyle = StyleSheet.flatten(panel.props.style)
    const panelBackground = String(panelStyle.backgroundImage ?? panelStyle.background ?? panelStyle.experimental_backgroundImage)
    expect(panel).not.toHaveTextContent(/Ước tính Kael/)
    expect(panelBackground).not.toContain('rgba(76,222,199,0.088)')

    const activeRequestRawStyle = screen.getByTestId('customer-booking-active-request').props.style
    const activeRequestStyle = StyleSheet.flatten(typeof activeRequestRawStyle === 'function' ? activeRequestRawStyle({ pressed: false }) : activeRequestRawStyle) as Record<string, unknown>
    expect(String(activeRequestStyle.backgroundImage)).toContain('rgba(76,222,199,0.20)')
    expect(String(activeRequestStyle.backgroundImage)).toContain('rgba(76,222,199,0.10)')
  })
})
