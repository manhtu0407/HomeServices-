import { fireEvent, render, screen } from '@testing-library/react-native'
import type { LocalDeal, LocalWorkflowSelectors } from '@nestscout/shared'

let mockWorkflowValue: any
let mockRouteParams: Record<string, string | string[] | undefined>
const mockReplace = jest.fn()
const mockDecideScopeChange = jest.fn()
const mockHydrateRemoteJobById = jest.fn()

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  useRouter: () => ({ replace: mockReplace }),
}))

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({ session: { user: { id: 'customer_test_1' } } }),
}))

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => mockWorkflowValue,
}))

jest.mock('@/lib/use-job-chat-thread', () => ({
  useJobChatThread: () => ({
    error: null,
    loading: false,
    messages: [],
    reload: jest.fn(),
    send: jest.fn(async () => true),
    sending: false,
  }),
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

import { CustomerHistorySurface } from '../customer-surfaces'

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
      disclaimer: 'Giá do Kael khóa theo bằng chứng hiện có.',
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

function buildDealWithPayment(): LocalDeal {
  const deal = buildDeal()
  deal.payment = {
    amountReceived: 260000,
    expiresAt: null,
    grossAmount: 260000,
    paymentCode: 'PAY_JOB_TEST_1',
    platformFee: 20000,
    provider: 'sepay_vietqr',
    qrImageUrl: null,
    receivedAt: '2026-06-25T09:00:00.000Z',
    status: 'received',
    transferContent: 'NSC job_test_1',
    updatedAt: '2026-06-25T09:00:00.000Z',
    workerNet: 240000,
  }
  return deal
}

function buildDealWithScopeChange(): LocalDeal {
  const deal = buildDeal()
  deal.backendStatus = 'scope_change_pending'
  deal.status = 'scope_change_pending'
  deal.scopeChange = {
    createdAt: '2026-06-25T08:30:00.000Z',
    evidencePhotoUrls: ['storage://job_test_1/scope_change_evidence/burnt-wire.jpg'],
    id: 'scope_test_1',
    kaelProgress: {
      current_stage: 'review_scope_change',
      progress: 100,
      status: 'completed',
      updated_at: '2026-06-25T08:32:00.000Z',
    },
    kaelReview: {
      advisory: 'Cần đổi dây trước khi tiếp tục.',
      complexity_assessment: 'medium',
      confidence: 0.82,
      fallback_used: false,
      problem_summary: 'Dây ổ cắm bị cháy sau mặt ổ.',
    },
    priceMax: 410000,
    priceMin: 330000,
    reason: 'Dây ổ cắm hở và bị cháy khi mở mặt ổ.',
    requestedDescription: 'Thay thêm đoạn dây điện bị cháy.',
    status: 'waiting_customer_decision',
  }
  return deal
}

function buildWorkflow(deal: LocalDeal | null) {
  const selectors: LocalWorkflowSelectors = {
    canConfirmCustomerSearch: false,
    canCustomerCancelDeal: Boolean(deal),
    canCustomerConfirmCompletion: false,
    canCustomerSubmitReview: false,
    canWorkerAccept: false,
    canWorkerAdvance: false,
    canWorkerSeeFullAddress: Boolean(deal?.broadcast?.fullAddressVisible),
    currentBackendStatus: deal?.backendStatus ?? deal?.status ?? null,
    currentStatus: deal?.status ?? null,
    customerSearchState: deal ? 'matched' : 'idle',
    draftValidationMessage: null,
    hasLocalBroadcast: Boolean(deal?.broadcast),
    paymentLocked: true,
    reviewLocked: true,
    scheduleMode: 'now_only',
  }

  mockWorkflowValue = {
    actions: {
      decideScopeChange: mockDecideScopeChange,
      hydrateRemoteJobById: mockHydrateRemoteJobById,
    },
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
  mockReplace.mockClear()
  mockDecideScopeChange.mockClear()
  mockDecideScopeChange.mockResolvedValue(true)
  mockHydrateRemoteJobById.mockClear()
  mockHydrateRemoteJobById.mockResolvedValue(true)
  mockRouteParams = {}
  buildWorkflow(buildDeal())
})

describe('CustomerHistorySurface v2.1', () => {
  it('redirects the legacy Case Work activity path into Kael Chat', () => {
    mockRouteParams = { screen: '2.5-chat-case' }

    render(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
    expect(screen.queryByTestId('customer-v21-direct-screen-2.5-chat-case')).toBeNull()
  })

  it('redirects default activity when active stages are already compressed', () => {
    render(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
    expect(screen.getByTestId('customer-v21-direct-empty-2.6-case-overview')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-job-accepted-stage')).toBeNull()
    expect(screen.queryByTestId('customer-v21-direct-screen-2.6-case-overview')).toBeNull()
    expect(screen.queryByTestId('customer-v21-direct-screen-2.10-location-eta')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-overview-next-step')).toBeNull()
    expect(screen.queryByTestId('customer-v21-activity-tab-overview')).toBeNull()
    expect(screen.queryByTestId('customer-v21-activity-screen-stack')).toBeNull()
    expect(screen.queryByTestId('customer-v21-screen-rail')).toBeNull()
    expect(screen.queryByText(/4\.9|rating|Nguyễn Văn Minh|AC|máy lạnh/i)).toBeNull()
  })

  it('redirects default activity into Case Chat when only compressed stages are active', () => {
    const deal = buildDeal()
    buildWorkflow({
      ...deal,
      backendStatus: 'awaiting_customer_confirm',
      status: 'awaiting_customer_confirm',
    })

    render(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
    expect(screen.getByTestId('customer-v21-direct-empty-2.6-case-overview')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-direct-screen-2.6-case-overview')).toBeNull()
    expect(screen.queryByTestId('customer-v21-direct-screen-2.8-options')).toBeNull()
    expect(screen.queryByTestId('customer-v21-direct-screen-2.9-quotes')).toBeNull()
  })

  it('redirects the converted 2.6 case overview path into Case Chat', () => {
    mockRouteParams = { screen: '2.6-case-overview' }

    render(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
    expect(screen.getByTestId('customer-v21-direct-empty-2.6-case-overview')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-direct-screen-2.6-case-overview')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-overview-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-primary-info-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-understanding-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-overview-next-step')).toBeNull()
    expect(screen.queryByTestId('customer-v21-activity-tab-overview')).toBeNull()
    expect(screen.queryByTestId('customer-v21-activity-screen-stack')).toBeNull()
    expect(screen.queryByText(/AC|máy lạnh|Nguyễn Văn Minh|4\.9/i)).toBeNull()
  })

  it('keeps the direct 2.6 case overview inactive without fake case data', () => {
    mockRouteParams = { screen: '2.6-case-overview' }
    buildWorkflow(null)

    render(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case')
    expect(screen.getByTestId('customer-v21-direct-empty-2.6-case-overview')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-overview-locked-hero')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-primary-info')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-overview-start')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-overview-liquid-score')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-overview-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-understanding')).toBeNull()
    expect(screen.queryByTestId('customer-v21-activity-tab-overview')).toBeNull()
    expect(screen.queryByText(/AC|máy lạnh|Nguyễn Văn Minh|4\.9|520\.000/i)).toBeNull()
  })

  it('opens later process stages directly from route params', () => {
    mockRouteParams = { screen: '3.2-payment-method' }
    const deal = buildDeal()
    buildWorkflow({
      ...deal,
      backendStatus: 'payment_pending',
      status: 'confirmed_by_customer',
    })

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-v21-payment-method-total')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-top-title').props.numberOfLines).toBe(1)
    expect(screen.getByTestId('customer-v21-top-title').props.adjustsFontSizeToFit).toBe(true)
    expect(screen.queryByTestId('customer-v21-activity-tab-overview')).toBeNull()
  })

  it('redirects the converted 2.10 location and ETA path into Case Chat', () => {
    mockRouteParams = { screen: '2.10-location-eta' }

    render(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
    expect(screen.getByTestId('customer-v21-direct-empty-2.10-location-eta')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-direct-screen-2.10-location-eta')).toBeNull()
    expect(screen.queryByTestId('customer-v21-location-timeline')).toBeNull()
  })

  it('forces pending scope changes through the hard-stop modal on history', () => {
    mockRouteParams = { job_id: 'job_test_1', scope_change: 'scope_test_1', screen: '2.13-job-progress' }
    buildWorkflow(buildDealWithScopeChange())

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-scope-change-hard-stop-modal')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-scope-change-modal-kael-badge')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('customer-scope-change-modal-approve'))
    expect(mockDecideScopeChange).toHaveBeenCalledWith('scope_test_1', { decision: 'approve' })

    fireEvent.press(screen.getByTestId('customer-scope-change-modal-reject'))
    expect(mockDecideScopeChange).toHaveBeenCalledWith('scope_test_1', { decision: 'reject' })
  })

  it('redirects the converted 2.13 progress path into Case Chat', () => {
    const deal = buildDeal()
    deal.status = 'completed_by_worker'
    deal.backendStatus = 'completed_by_worker'
    deal.completionNotes = 'Đã kiểm tra và gửi bằng chứng hoàn tất.'
    deal.completionPhotoUrls = ['storage://job_test_1/after.jpg']
    buildWorkflow(deal)

    mockRouteParams = { screen: '2.13-job-progress' }

    render(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
    expect(screen.getByTestId('customer-v21-direct-empty-2.13-job-progress')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-job-progress-stage')).toBeNull()
    expect(screen.queryByTestId('customer-v21-job-progress-risk')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-screen-5.3-approval-queue')).toBeNull()
    expect(screen.queryByTestId('customer-v21-activity-tab-done')).toBeNull()
  })

  it('keeps payment honest when no real payment state exists', () => {
    mockRouteParams = { screen: '3.3-payment-protected' }

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-v21-direct-screen-3.3-payment-protected')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-payment-protected-hero')).toHaveTextContent(/Chờ thanh toán/)
    expect(screen.getByTestId('customer-v21-payment-protected-ledger')).toHaveTextContent(/Chưa có/)
    expect(screen.getByTestId('customer-v21-payment-protected-hero-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-payment-protected-kael-card-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-payment-state')).toBeNull()
    expect(screen.queryByTestId('customer-v21-activity-tab-payment')).toBeNull()
    expect(screen.queryByText(/paid_held|520000|520\.000|Vietcombank/i)).toBeNull()
  })

  it('shows one inactive state when no real deal exists', () => {
    buildWorkflow(null)

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-v21-direct-empty-2.6-case-overview')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-overview-locked-hero')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-overview-start')).toBeNull()
    expect(screen.queryByTestId('customer-v21-activity-empty')).toBeNull()
    expect(screen.queryByTestId('customer-v21-activity-empty-screen-stack')).toBeNull()
    expect(screen.queryByTestId('customer-v21-activity-tab-overview')).toBeNull()
    expect(screen.queryByText(/--|0 thợ|rating/i)).toBeNull()
  })

  it.each([
    '3.1-payment-review',
    '3.2-payment-method',
    '3.3-payment-protected',
  ] as const)('keeps no-deal payment stage %s inactive instead of showing fake payment state', (screenId) => {
    mockRouteParams = { screen: screenId }
    buildWorkflow(null)

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId(`customer-v21-direct-empty-${screenId}`)).toBeOnTheScreen()
    expect(screen.queryByTestId(`customer-v21-direct-screen-${screenId}`)).toBeNull()
    expect(screen.queryByTestId('customer-v21-payment-review-case')).toBeNull()
    expect(screen.queryByTestId('customer-v21-payment-review-details')).toBeNull()
    expect(screen.queryByTestId('customer-v21-payment-method-total')).toBeNull()
    expect(screen.queryByTestId('customer-v21-payment-method-selected')).toBeNull()
    expect(screen.queryByTestId('customer-v21-payment-protected-hero')).toBeNull()
    expect(screen.queryByTestId('customer-v21-payment-protected-ledger')).toBeNull()
    expect(screen.queryByTestId(`customer-v21-direct-empty-${screenId}-screen-stack`)).toBeNull()
    expect(screen.queryByTestId('customer-v21-empty-case-screen-3.3-payment-protected')).toBeNull()
    expect(screen.queryByTestId('customer-v21-payment-state')).toBeNull()
    expect(screen.queryByTestId('customer-v21-activity-tab-payment')).toBeNull()
    expect(screen.queryByText(/paid_held|520000|520\.000|Vietcombank/i)).toBeNull()
  })

  it('redirects payment stages from real payment data into focused Case Work', () => {
    buildWorkflow(buildDealWithPayment())
    mockRouteParams = { screen: '3.1-payment-review' }

    const { rerender } = render(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenLastCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1&focus=payment')
    expect(screen.getByTestId('customer-v21-direct-empty-3.1-payment-review')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-payment-review-case')).toBeNull()

    mockRouteParams = { screen: '3.2-payment-method' }
    rerender(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenLastCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1&focus=payment')
    expect(screen.getByTestId('customer-v21-direct-empty-3.2-payment-method')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-payment-method-total')).toBeNull()

    mockRouteParams = { screen: '3.3-payment-protected' }
    rerender(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenLastCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1&focus=payment')
    expect(screen.getByTestId('customer-v21-direct-empty-3.3-payment-protected')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-payment-protected-hero')).toBeNull()
  })

  it('ignores deprecated activity tab params and keeps 2.6 as the activity entry', () => {
    mockRouteParams = { tab: 'payment' }
    buildWorkflow(null)

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-v21-direct-empty-2.6-case-overview')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-payment-empty')).toBeNull()
    expect(screen.queryByTestId('customer-v21-activity-tab-payment')).toBeNull()
  })

  it('redirects the converted 2.9 quote path into Case Chat', () => {
    mockRouteParams = { screen: '2.9-quotes' }

    render(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
    expect(screen.getByTestId('customer-v21-direct-empty-2.9-quotes')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-direct-screen-2.9-quotes')).toBeNull()
    expect(screen.queryByTestId('customer-v21-quote-ledger-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-quote-price-lines')).toBeNull()
    expect(screen.queryByTestId('customer-v21-quote-scope')).toBeNull()
    expect(screen.queryByTestId('customer-v21-quote-stat-grid')).toBeNull()
    expect(screen.queryByTestId('customer-v21-activity-tab-case')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-screen-2.9-quotes')).toBeNull()
    expect(screen.queryByText(/4\.9|AC|paid_held|Vietcombank|520\.000|Nguy/i)).toBeNull()
  })

  it('redirects the converted 2.8 options path into Case Chat', () => {
    mockRouteParams = { screen: '2.8-options' }

    render(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
    expect(screen.getByTestId('customer-v21-direct-empty-2.8-options')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-direct-screen-2.8-options')).toBeNull()
    expect(screen.queryByTestId('customer-v21-options-hero')).toBeNull()
    expect(screen.queryByTestId('customer-v21-options-scope')).toBeNull()
    expect(screen.queryByTestId('customer-v21-options-kael-card')).toBeNull()
    expect(screen.queryByText(/máy lạnh|AC|520\.000|Bảo hành 7 ngày/i)).toBeNull()
  })

  it('redirects the 2.10 location ETA stage instead of rendering the legacy direct screen', () => {
    mockRouteParams = { screen: '2.10-location-eta' }
    const deal = buildDeal()
    buildWorkflow({
      ...deal,
      broadcast: {
        ...deal.broadcast!,
        secondsRemaining: 780,
      },
      status: 'worker_on_way',
      workerProfile: {
        avatarUrl: null,
        fullName: 'Thợ hệ thống',
        id: 'worker_real_1',
        rating: 4.8,
        totalJobs: 12,
      },
    })

    render(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
    expect(screen.getByTestId('customer-v21-direct-empty-2.10-location-eta')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-direct-screen-2.10-location-eta')).toBeNull()
    expect(screen.queryByTestId('customer-v21-location-map-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-location-timeline')).toBeNull()
    expect(screen.queryByTestId('customer-v21-location-kael-card')).toBeNull()
    expect(screen.queryByText(/2,1 km|Nguy/i)).toBeNull()
  })

  it('redirects the converted 2.7 matching path and keeps payment shells direct', () => {
    mockRouteParams = { screen: '2.7-matching' }

    const { rerender } = render(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
    expect(screen.getByTestId('customer-v21-direct-empty-2.7-matching')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-matching-hero')).toBeNull()
    expect(screen.queryByTestId('customer-v21-decision-panel-2.7-matching')).toBeNull()
    expect(screen.queryByTestId('customer-v21-matching-bars')).toBeNull()
    expect(screen.queryByTestId('customer-v21-matching-kael-card')).toBeNull()
    expect(screen.queryByText(/Nguy.n V.n Minh|4\.9|m.y l.nh|V.sinh m.y/i)).toBeNull()

    mockRouteParams = { screen: '3.2-payment-method' }
    rerender(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-v21-payment-method-total')).toHaveTextContent(/0/)
    expect(screen.getByTestId('customer-v21-payment-method-total')).not.toHaveTextContent(/Chưa có/)
    expect(screen.getByTestId('customer-v21-payment-method-selected')).toHaveTextContent(/Chờ thanh toán/)
    expect(screen.getByTestId('customer-v21-payment-bank-logo-vietcombank')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-payment-bank-logo-techcombank')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-payment-method-hero-wallet-icon')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-payment-card-method-image')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-payment-transfer-method-image')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-payment-bank-grid-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-payment-bank-tile-vietcombank-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-v21-payment-flow-3.2-payment-method')).toBeNull()
    expect(screen.queryByText(/Vietcombank|paid_held|520\.000/i)).toBeNull()
  })

  it('shows the inactive 2.7 matching stage with no fake worker data', () => {
    mockRouteParams = { screen: '2.7-matching' }
    buildWorkflow(null)

    render(<CustomerHistorySurface />)

    expect(screen.getByText('Ghép thợ phù hợp')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-direct-empty-2.7-matching')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-matching-locked-hero')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-overview-score-aura-MatchingLocked')).toBeNull()
    expect(screen.queryByTestId('customer-v21-decision-panel-2.7-matching')).toBeNull()
    expect(screen.queryByTestId('customer-v21-matching-bars')).toBeNull()
    expect(screen.queryByTestId('customer-v21-matching-locked-kael-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-matching-start')).toBeNull()
    expect(screen.queryByTestId('customer-v21-direct-empty-2.7-matching-screen-stack')).toBeNull()
    expect(screen.queryByTestId('customer-v21-empty-case-screen-2.7-matching')).toBeNull()
    expect(screen.queryByText(/Nguyễn Văn Minh|4\.9|236|2,1 km|máy lạnh/i)).toBeNull()
  })

  it('redirects the converted 2.11 live alert path into Case Chat', () => {
    const deal = buildDeal()
    deal.status = 'worker_on_way'
    deal.backendStatus = 'worker_on_way'
    if (deal.broadcast) {
      deal.broadcast.secondsRemaining = 780
    }
    mockRouteParams = { screen: '2.11-live-alert' }
    buildWorkflow(deal)

    render(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
    expect(screen.getByTestId('customer-v21-direct-empty-2.11-live-alert')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-live-alert-stage')).toBeNull()
    expect(screen.queryByTestId('customer-v21-live-alert-access')).toBeNull()
    expect(screen.queryByTestId('customer-v21-arrival-code-pending')).toBeNull()
  })

  it('redirects the converted 2.12 accepted worker path into Case Chat', () => {
    const deal = buildDeal()
    deal.status = 'arrived'
    deal.backendStatus = 'arrived'
    deal.workerProfile = {
      avatarUrl: null,
      fullName: 'Thợ hệ thống',
      id: 'worker_real_1',
      rating: 4.8,
      totalJobs: 12,
    }
    mockRouteParams = { screen: '2.12-job-accepted' }
    buildWorkflow(deal)

    render(<CustomerHistorySurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_test_1')
    expect(screen.getByTestId('customer-v21-direct-empty-2.12-job-accepted')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-job-accepted-stage')).toBeNull()
    expect(screen.queryByTestId('customer-v21-job-accepted-verification')).toBeNull()
  })

  it('keeps the 2.8 options stage inactive without fake case data', () => {
    mockRouteParams = { screen: '2.8-options' }
    buildWorkflow(null)

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-v21-direct-empty-2.8-options')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-options-hero')).toBeNull()
    expect(screen.queryByTestId('customer-v21-options-scope')).toBeNull()
    expect(screen.queryByTestId('customer-v21-options-kael-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-options-start')).toBeNull()
    expect(screen.queryByText(/4\.9|Vietcombank|paid_held|520\.000|AC/i)).toBeNull()
  })

  it('keeps the 2.9 quote stage inactive without fake case data', () => {
    mockRouteParams = { screen: '2.9-quotes' }
    buildWorkflow(null)

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-v21-direct-empty-2.9-quotes')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-quote-ledger-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-quote-scope')).toBeNull()
    expect(screen.queryByTestId('customer-v21-quote-stat-grid')).toBeNull()
    expect(screen.queryByTestId('customer-v21-quote-start')).toBeNull()
    expect(screen.queryByText(/4\.9|Vietcombank|paid_held|520\.000|AC/i)).toBeNull()
  })

  it('keeps the 2.10 location stage inactive without fake route data', () => {
    mockRouteParams = { screen: '2.10-location-eta' }
    buildWorkflow(null)

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-v21-direct-empty-2.10-location-eta')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-location-map-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-location-timeline')).toBeNull()
    expect(screen.queryByTestId('customer-v21-location-kael-card')).toBeNull()
    expect(screen.queryByTestId('customer-v21-location-start')).toBeNull()
    expect(screen.queryByTestId('customer-v21-direct-empty-2.10-location-eta-screen-stack')).toBeNull()
    expect(screen.queryByTestId('customer-v21-empty-case-screen-2.10-location-eta')).toBeNull()
    expect(screen.queryByText(/4\.9|Vietcombank|paid_held|520\.000|AC/i)).toBeNull()
  })

  it('keeps 2.11-2.13 direct stages inactive without zip mock fulfillment data', () => {
    buildWorkflow(null)
    mockRouteParams = { screen: '2.11-live-alert' }

    const { rerender } = render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-v21-direct-empty-2.11-live-alert')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-live-alert-stage')).toBeNull()
    expect(screen.queryByTestId('customer-v21-live-alert-start')).toBeNull()
    expect(screen.queryByTestId('customer-v21-arrival-code-pending')).toBeNull()

    mockRouteParams = { screen: '2.12-job-accepted' }
    rerender(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-v21-direct-empty-2.12-job-accepted')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-job-accepted-stage')).toBeNull()
    expect(screen.queryByTestId('customer-v21-job-accepted-start')).toBeNull()
    expect(screen.queryByTestId('customer-v21-job-accepted-verification')).toBeNull()

    mockRouteParams = { screen: '2.13-job-progress' }
    rerender(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-v21-direct-empty-2.13-job-progress')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-job-progress-stage')).toBeNull()
    expect(screen.queryByTestId('customer-v21-job-progress-start')).toBeNull()
    expect(screen.queryByTestId('customer-v21-job-progress-media-empty')).toBeNull()
    expect(screen.queryByText(/2,1 km|4821|worker_checked_in|10:01|8 tệp|Approval Queue|Vệ sinh sâu|máy lạnh/i)).toBeNull()
  })
})
