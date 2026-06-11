import { fireEvent, render, screen } from '@testing-library/react-native'
import type { LocalDeal, LocalScopeChange, LocalWorkflowSelectors } from '@home-services/shared'

let mockWorkflowValue: any
let mockSessionMetadata: Record<string, unknown>
let mockLanguage: 'vi' | 'en'
const mockReplace = jest.fn()
const mockCustomerConfirmCompletion = jest.fn()
const mockDecideScopeChange = jest.fn()

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
    canCustomerConfirmCompletion: deal?.status === 'completed_by_worker',
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
    actions: {
      customerConfirmCompletion: mockCustomerConfirmCompletion,
      decideScopeChange: mockDecideScopeChange,
    },
    customerKaelMemory: null,
    customerKaelMemoryStatus: 'idle',
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
  mockCustomerConfirmCompletion.mockClear()
  mockCustomerConfirmCompletion.mockResolvedValue(true)
  mockDecideScopeChange.mockClear()
  mockDecideScopeChange.mockResolvedValue(true)
  mockSessionMetadata = {}
  buildWorkflow(null)
})

describe('CustomerAgenticCenterSurface', () => {
  it('renders an honest empty center without fake metrics', () => {
    render(<CustomerAgenticCenterSurface />)

    expect(screen.getByText('Agentic Center')).toBeTruthy()
    expect(screen.getByTestId('customer-agentic-center-summary-active-value')).toHaveTextContent('None')
    expect(screen.getByTestId('customer-agentic-center-summary-approvals-value')).toHaveTextContent('None')
    expect(screen.getByTestId('customer-agentic-center-summary-notifications-value')).toHaveTextContent('None')
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
    expect(screen.getByTestId('customer-agentic-center-summary-approvals-value')).toHaveTextContent('None')
    expect(screen.getByTestId('customer-agentic-center-summary-notifications-value')).toHaveTextContent('2')
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
  })

  it('renders Commanding Home greeting and separates notification count from approvals', () => {
    mockSessionMetadata = {
      full_name: 'Tu Phan',
    }
    buildWorkflow(buildDeal(), 2)

    render(<CustomerAgenticCenterSurface />)

    expect(screen.getByText('Hi, Tu Phan')).toBeTruthy()
    expect(screen.getByTestId('customer-agentic-center-summary-active-value')).toHaveTextContent('1')
    expect(screen.getByTestId('customer-agentic-center-summary-approvals-value')).toHaveTextContent('None')
    expect(screen.getByTestId('customer-agentic-center-summary-notifications-value')).toHaveTextContent('2')
    expect(screen.queryByTestId('customer-agentic-center-approval-unread')).toBeNull()
  })

  it('renders Active Case command id and case-level actions', () => {
    buildWorkflow(buildDeal())

    render(<CustomerAgenticCenterSurface />)

    expect(screen.getByText('Case ID')).toBeTruthy()
    expect(screen.getByText('job_test_1')).toBeTruthy()

    fireEvent.press(screen.getByTestId('customer-agentic-center-active-chat-action'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat')

    fireEvent.press(screen.getByTestId('customer-agentic-center-active-history-action'))
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/history')
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

  it('uses the real scope decision action from the approval queue primary action', () => {
    const deal = buildDeal()
    deal.backendStatus = 'scope_change_pending'
    deal.scopeChange = buildScopeChange()
    deal.status = 'scope_change_pending'
    buildWorkflow(deal)

    render(<CustomerAgenticCenterSurface />)

    fireEvent.press(screen.getByTestId('customer-agentic-center-approval-scope_change-primary-action'))

    expect(mockDecideScopeChange).toHaveBeenCalledWith('scope_test_1', { decision: 'approve' })
  })

  it('keeps completion confirmation behind the real workflow gate and routes to review', () => {
    const deal = buildDeal()
    deal.backendStatus = 'completed_by_worker'
    deal.completionNotes = 'Worker uploaded completion evidence.'
    deal.completionPhotoUrls = ['storage://job_test_1/after.jpg']
    deal.status = 'completed_by_worker'
    buildWorkflow(deal)

    render(<CustomerAgenticCenterSurface />)

    expect(screen.queryByTestId('customer-agentic-center-approval-completion-primary-action')).toBeNull()
    fireEvent.press(screen.getByTestId('customer-agentic-center-approval-completion-action'))

    expect(mockCustomerConfirmCompletion).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/history?tab=done')
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
  })

  it('routes the Memory and Preferences edit action to the real profile surface', () => {
    render(<CustomerAgenticCenterSurface />)

    fireEvent.press(screen.getByTestId('customer-agentic-center-memory-edit-action'))

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile')
  })

  it('renders Kael memory self-view preferences without exposing unsafe metadata', () => {
    buildWorkflow(null)
    mockWorkflowValue.customerKaelMemory = {
      language: 'en',
      last_observed_at: '2026-06-01T00:00:00.000Z',
      preference_summary: 'Prefers quiet morning cleaning visits.',
      safe_metadata: {
        raw_phone: '0901234567',
      },
      service_preferences: {
        preferred_district: 'District 7',
        preferred_service: 'cleaning',
        preferred_time_window: 'Morning',
      },
    }

    render(<CustomerAgenticCenterSurface />)

    expect(screen.getByText('Kael memory')).toBeTruthy()
    expect(screen.getByText('Prefers quiet morning cleaning visits.')).toBeTruthy()
    expect(screen.getByText('Language')).toBeTruthy()
    expect(screen.getByText('English')).toBeTruthy()
    expect(screen.getByText('Service preference')).toBeTruthy()
    expect(screen.getByText('Cleaning')).toBeTruthy()
    expect(screen.getByText('Preferred area')).toBeTruthy()
    expect(screen.getByText('District 7')).toBeTruthy()
    expect(screen.getByText('Time preference')).toBeTruthy()
    expect(screen.getByText('Morning')).toBeTruthy()
    expect(screen.getByText('Last updated')).toBeTruthy()
    expect(screen.queryByText('0901234567')).toBeNull()
  })
})
