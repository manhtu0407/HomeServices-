import { fireEvent, render, screen } from '@testing-library/react-native'
import type { LocalDeal, LocalScopeChange, LocalWorkflowSelectors } from '@home-services/shared'

let mockWorkflowValue: any
let mockSessionMetadata: Record<string, unknown>
let mockLanguage: 'vi' | 'en'
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
  useRouter: () => ({ replace: mockReplace }),
}))

jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
  }
})

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({
    session: {
      user: {
        id: 'customer_test_1',
        user_metadata: mockSessionMetadata,
      },
    },
  }),
}))

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => mockWorkflowValue,
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => mockLanguage,
  }
})

import { CustomerAgenticCenterSurface } from '../agentic-center-surface'
import { setCustomerThemeMode } from '../customer-theme'

function buildDeal(): LocalDeal {
  return {
    backendStatus: 'broadcasting',
    broadcast: {
      broadcastId: 'broadcast_test_1',
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'District 7',
      jobId: 'job_test_1',
      prebrief: ['Kael prepared the worker brief.'],
      problemSummary: 'Outlet is hot',
      secondsRemaining: 45,
      serviceType: 'electrical',
      status: 'sent',
    },
    completionNotes: null,
    completionPhotoUrls: [],
    draft: {
      addressLabel: 'District 7, Sunrise City',
      description: 'The living room outlet is hot and smells faintly burnt.',
      districtLabel: 'District 7',
      inferredProblemLabel: null,
      mediaCount: 1,
      needsServiceChoice: false,
      problemChips: ['Outlet or switch issue'],
      serviceType: 'electrical',
      source: 'kael',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: {
      advisory: 'Kael can update the estimate if scope evidence changes.',
      complexity: 'medium',
      confidenceLabel: '84%',
      disclaimer: 'Kael estimate from current evidence.',
      hasVndPrice: true,
      priceRangeLabel: '180,000 VND - 260,000 VND',
      problemLabel: 'Outlet or switch issue',
    },
    finalPrice: null,
    id: 'job_test_1',
    scopeChange: null,
    status: 'broadcasting',
  }
}

function buildWorkflow(deal: LocalDeal | null, notificationUnreadCount = 0) {
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
    dispatch: jest.fn(),
    notificationUnreadCount,
    notifications: [],
    selectors,
    state: {
      deal,
      lastError: null,
      lastRemoteSyncAt: null,
      workerGate: 'remote_backend',
    },
    workerEarnings: null,
    workerProfile: null,
  }
}

function buildScopeChange(): LocalScopeChange {
  return {
    createdAt: '2026-06-01T00:00:00.000Z',
    evidencePhotoUrls: ['storage://job_test_1/scope.jpg'],
    id: 'scope_test_1',
    kaelProgress: null,
    kaelReview: null,
    priceMax: 320000,
    priceMin: 260000,
    reason: 'Needs one extra outlet after inspection.',
    requestedDescription: 'Replace the burnt outlet contact.',
    status: 'waiting_customer_decision',
  }
}

beforeEach(() => {
  setCustomerThemeMode('light')
  mockLanguage = 'en'
  mockReplace.mockClear()
  mockSessionMetadata = {}
  buildWorkflow(null)
})

describe('CustomerAgenticCenterSurface', () => {
  it('renders an honest empty center without fake metrics', () => {
    render(<CustomerAgenticCenterSurface />)

    expect(screen.getByText('Agentic Center')).toBeTruthy()
    expect(screen.getByTestId('customer-agentic-center-summary-active-value')).toHaveTextContent('None')
    expect(screen.getByTestId('customer-agentic-center-summary-approvals-value')).toHaveTextContent('None')
    expect(screen.getByTestId('customer-agentic-center-summary-memory-value')).toHaveTextContent('None')
    expect(screen.getByText('No active request')).toBeTruthy()
    expect(screen.getByText('Nothing needs approval')).toBeTruthy()
    expect(screen.getByText('No saved preference data')).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.queryByText('--')).toBeNull()
  })

  it('renders active case and saved preference data from real state only', () => {
    mockSessionMetadata = {
      default_address: 'District 7, Sunrise City',
      full_name: 'Tu Phan',
    }
    buildWorkflow(buildDeal(), 2)

    render(<CustomerAgenticCenterSurface />)

    expect(screen.getByText('Electrical repair')).toBeTruthy()
    expect(screen.getByText('Sending to workers')).toBeTruthy()
    expect(screen.getByText('180,000 VND - 260,000 VND')).toBeTruthy()
    expect(screen.getByText('The living room outlet is hot and smells faintly burnt.')).toBeTruthy()
    expect(screen.getByText('Tu Phan')).toBeTruthy()
    expect(screen.getAllByText('District 7, Sunrise City').length).toBeGreaterThan(0)
    expect(screen.getByTestId('customer-agentic-center-summary-active-value')).toHaveTextContent('1')
    expect(screen.getByTestId('customer-agentic-center-summary-approvals-value')).toHaveTextContent('1')
    expect(screen.getByTestId('customer-agentic-center-summary-memory-value')).toHaveTextContent('2')
    expect(screen.getByTestId('customer-agentic-center-phase-title-value')).toHaveTextContent('Matching worker')
    expect(screen.getByTestId('customer-agentic-center-phase-artifact-value')).toHaveTextContent('Provider match')
    expect(screen.getByTestId('customer-agentic-center-phase-next-value')).toHaveTextContent('Worker accepts')
    expect(screen.getByTestId('customer-agentic-center-phase-gate-value')).toHaveTextContent('Waiting for worker acceptance')
    expect(screen.getByTestId('customer-agentic-center-phase-rail')).toBeTruthy()
    expect(screen.getByTestId('customer-agentic-center-phase-step-provider_match')).toHaveTextContent(/Provider match/)
    expect(screen.getByTestId('customer-agentic-center-phase-step-provider_match-mode')).toHaveTextContent('Loading')
    expect(screen.getByTestId('customer-agentic-center-phase-step-provider_match-primary')).toHaveTextContent('Active')
    expect(screen.getByTestId('customer-agentic-center-phase-step-booking')).toHaveTextContent(/Real booking/)
    expect(screen.getByTestId('customer-agentic-center-phase-step-booking-mode')).toHaveTextContent('Loading')
    expect(screen.getAllByText('2').length).toBeGreaterThan(1)
  })

  it('routes the center primary action to the real Kael chat route', () => {
    render(<CustomerAgenticCenterSurface />)

    fireEvent.press(screen.getByText('Start request'))

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat')
  })

  it('routes scope approvals to the existing history review flow', () => {
    const deal = buildDeal()
    deal.backendStatus = 'scope_change_pending'
    deal.scopeChange = buildScopeChange()
    deal.status = 'scope_change_pending'
    buildWorkflow(deal)

    render(<CustomerAgenticCenterSurface />)

    fireEvent.press(screen.getByTestId('customer-agentic-center-approval-scope_change-action'))

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/history?tab=price&scope_change=scope_test_1')
  })

  it('renders saved contact phone in memory from real profile metadata', () => {
    mockSessionMetadata = {
      default_address: 'District 7, Sunrise City',
      full_name: 'Tu Phan',
      phone_number: '0901234567',
    }
    buildWorkflow(null)

    render(<CustomerAgenticCenterSurface />)

    expect(screen.getByText('Contact phone')).toBeTruthy()
    expect(screen.getByText('0901234567')).toBeTruthy()
    expect(screen.getByTestId('customer-agentic-center-summary-memory-value')).toHaveTextContent('3')
  })
})
