import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { LocalDeal, LocalScopeChange, LocalWorkflowSelectors } from '@nestscout/shared'

let mockWorkflowValue: any
const mockReplace = jest.fn()
const mockDecideScopeChange = jest.fn()
const mockUpdateCustomerKaelMemoryPreference = jest.fn()

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ replace: mockReplace }),
}))

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({ session: { user: { id: 'customer_test_1', user_metadata: {} } } }),
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

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => 'vi',
  }
})

import { CustomerAgenticCenterSurface } from '../agentic-center-surface'

function buildScopeChange(): LocalScopeChange {
  return {
    createdAt: '2026-06-01T00:00:00.000Z',
    evidencePhotoUrls: ['storage://job_test_1/scope.jpg'],
    id: 'scope_test_1',
    kaelProgress: null,
    kaelReview: null,
    priceMax: 320000,
    priceMin: 260000,
    reason: 'Cần thay thêm ổ cắm sau kiểm tra.',
    requestedDescription: 'Thay ổ cắm bị cháy tiếp điểm.',
    status: 'waiting_customer_decision',
  }
}

function buildDeal(withScopeChange = false): LocalDeal {
  return {
    backendStatus: withScopeChange ? 'scope_change_pending' : 'broadcasting',
    broadcast: {
      broadcastId: 'broadcast_test_1',
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'Quận 7',
      jobId: 'job_test_1',
      prebrief: ['Kael đã chuẩn bị brief.'],
      problemSummary: 'Ổ cắm nóng',
      secondsRemaining: 45,
      serviceType: 'electrical',
      status: 'sent',
    },
    completionNotes: null,
    completionPhotoUrls: [],
    draft: {
      addressLabel: 'Tòa A, Quận 7',
      description: 'Ổ cắm phòng khách bị nóng và có mùi khét.',
      districtLabel: 'Quận 7',
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
      advisory: 'Kael có thể cập nhật nếu scope đổi.',
      complexity: 'medium',
      confidenceLabel: '84%',
      disclaimer: 'Kael estimate.',
      hasVndPrice: true,
      priceRangeLabel: '180.000đ - 260.000đ',
      problemLabel: 'Ổ cắm nóng',
    },
    finalPrice: null,
    id: 'job_test_1',
    scopeChange: withScopeChange ? buildScopeChange() : null,
    status: withScopeChange ? 'scope_change_pending' : 'broadcasting',
  }
}

function buildWorkflow(deal: LocalDeal | null, notificationUnreadCount = 0, customerKaelMemory: Record<string, unknown> | null = null) {
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
    actions: {
      decideScopeChange: mockDecideScopeChange,
      refreshCustomerKaelMemory: jest.fn(async () => true),
      updateCustomerKaelMemoryPreference: mockUpdateCustomerKaelMemoryPreference,
    },
    customerKaelMemory,
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
  }
}

beforeEach(() => {
  mockDecideScopeChange.mockClear()
  mockDecideScopeChange.mockResolvedValue(true)
  mockUpdateCustomerKaelMemoryPreference.mockClear()
  mockUpdateCustomerKaelMemoryPreference.mockResolvedValue(true)
  mockReplace.mockClear()
  buildWorkflow(null)
})

describe('CustomerAgenticCenterSurface v2.1', () => {
  it('renders an honest ready utility without fake case data', () => {
    render(<CustomerAgenticCenterSurface />)

    expect(screen.getByTestId('customer-v21-agentic-center')).toBeOnTheScreen()
    expect(screen.getAllByText('Trung tâm điều phối Kael').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('customer-v21-agentic-home-inactive')).toBeNull()
    expect(screen.getByTestId('customer-v21-agentic-card-5.2-command-center')).toBeOnTheScreen()
    expect(screen.queryByText('Chưa có hoạt động dịch vụ')).toBeNull()
    expect(screen.queryByTestId('customer-v21-agentic-empty')).toBeNull()
    expect(screen.getByTestId('customer-v21-agentic-utility-stack')).toBeOnTheScreen()
    expect(screen.queryByText('--')).toBeNull()
    expect(screen.queryByText(/rating|4\.9|Nguyễn Văn Minh/i)).toBeNull()
  })

  it('renders active work summary and routes work handling to Kael chat', () => {
    buildWorkflow(buildDeal(), 2)

    render(<CustomerAgenticCenterSurface />)

    expect(screen.getByTestId('customer-v21-agentic-active')).toHaveTextContent(/^1/)
    expect(screen.getByTestId('customer-v21-agentic-alerts')).toHaveTextContent(/^0/)
    expect(screen.getByTestId('customer-v21-agentic-utility-stack')).toHaveTextContent(/Trung tâm điều phối/)
    expect(screen.getByTestId('customer-v21-agentic-utility-stack')).not.toHaveTextContent(/Trung tâm điều phối công việc cũ/)
    expect(screen.getByTestId('customer-v21-agentic-utility-stack')).toHaveTextContent(/Hàng chờ duyệt/)
    expect(screen.getByTestId('customer-v21-agentic-utility-stack')).toHaveTextContent(/Ghi nhớ và tùy chọn/)
    expect(screen.getByTestId('customer-v21-agentic-active-case')).toHaveTextContent(/MOH-26GBS1/)

    fireEvent.press(screen.getByText('Xử lý công việc'))

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
  })

  it('renders command center shell before a real process starts without unlocking authority actions', () => {
    buildWorkflow(null)

    render(<CustomerAgenticCenterSurface screenId="5.2-command-center" />)

    expect(screen.getByTestId('customer-v21-agentic-command-center')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-agentic-command-inactive')).toBeNull()
    expect(screen.getByTestId('customer-v21-agentic-command-case')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-agentic-command-timeline')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-agentic-artifacts')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-agentic-open-case-chat')).toBeDisabled()
    expect(screen.getByTestId('customer-v21-agentic-command-approval')).toBeDisabled()
    expect(screen.getByTestId('customer-v21-agentic-command-center')).not.toHaveTextContent(/4\.9|520\.000/)
  })

  it('keeps approval queue inactive before a real scope decision exists', () => {
    buildWorkflow(buildDeal(false))

    render(<CustomerAgenticCenterSurface screenId="5.3-approval-queue" />)

    expect(screen.getByTestId('customer-v21-agentic-approval-screen')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-agentic-approval-inactive')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-agentic-approval-queue')).toBeNull()
    expect(screen.queryByTestId('customer-v21-agentic-approve-scope')).toBeNull()
  })

  it('redirects approval queue with a real pending decision into Case Work', () => {
    buildWorkflow(buildDeal(true))

    render(<CustomerAgenticCenterSurface screenId="5.3-approval-queue" />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1&focus=approval')
    expect(screen.getByTestId('customer-v21-agentic-approval-redirect')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-agentic-approval-queue')).toBeNull()
    expect(screen.queryByTestId('customer-v21-agentic-approve-scope')).toBeNull()
    expect(mockDecideScopeChange).not.toHaveBeenCalled()
  })

  it('keeps Agentic stages 5.2 to 5.4 Vietnamese-only in Vietnamese mode', () => {
    const mixedEnglish = /Work handling chat|Live\b|Evidence|Risk check|completion artifact|workflow|Protected money|Work artifacts|What Kael|Approval Queue|Needs approval|No approval needed|Processed|Memory and Preferences|Allowed information|Data boundaries|Privacy|Chat thường/i

    buildWorkflow(buildDeal(true))
    render(<CustomerAgenticCenterSurface screenId="5.2-command-center" />)
    expect(screen.getByTestId('customer-v21-agentic-command-center')).not.toHaveTextContent(mixedEnglish)

    buildWorkflow(buildDeal(true))
    render(<CustomerAgenticCenterSurface screenId="5.3-approval-queue" />)
    expect(screen.getByTestId('customer-v21-agentic-approval-screen')).not.toHaveTextContent(mixedEnglish)

    buildWorkflow(null)
    render(<CustomerAgenticCenterSurface screenId="5.4-memory" />)
    expect(screen.getByTestId('customer-v21-agentic-memory-screen')).not.toHaveTextContent(mixedEnglish)
  })

  it('saves Stage 5.4 memory toggles through the workflow provider', async () => {
    buildWorkflow(null, 0, {
      customer_id: 'customer_test_1',
      language: 'vi',
      preference_summary: '',
      service_preferences: {
        preferred_address: 'Vinhomes Grand Park · S5.02',
        memory_permissions: {
          preferred_address: true,
        },
      },
      trust_signals: {},
      memory_version: 1,
      last_observed_at: '2026-06-01T00:00:00.000Z',
    })

    render(<CustomerAgenticCenterSurface screenId="5.4-memory" />)
    expect(screen.getByTestId('customer-v21-memory-toggle-preferred_address').props.accessibilityState.checked).toBe(true)
    fireEvent.press(screen.getByTestId('customer-v21-memory-toggle-preferred_address'))
    expect(screen.getByTestId('customer-v21-memory-toggle-preferred_address').props.accessibilityState.checked).toBe(false)

    await waitFor(() => {
      expect(mockUpdateCustomerKaelMemoryPreference).toHaveBeenCalledWith({
        key: 'preferred_address',
        enabled: false,
      })
    })
  })
})
