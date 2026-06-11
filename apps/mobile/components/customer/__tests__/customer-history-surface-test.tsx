import { fireEvent, render, screen } from '@testing-library/react-native'
import { Platform, StyleSheet } from 'react-native'
import type { LocalCustomerSearchState, LocalDeal, LocalDealStatus, LocalScopeChange, LocalWorkflowSelectors } from '@home-services/shared'

let mockRouteParams: Record<string, string | string[] | undefined>
let mockWorkflowValue: any
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockUseJobChatThread = jest.fn()

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
  useAuth: () => ({ session: { user: { id: 'customer_test_1' } } }),
}))

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => mockWorkflowValue,
}))

jest.mock('@/lib/use-job-chat-thread', () => ({
  useJobChatThread: (jobId: string | null, enabled: boolean) => mockUseJobChatThread(jobId, enabled),
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => 'vi',
  }
})

import { CustomerHistorySurface } from '../customer-surfaces'

function buildDeal(status: LocalDealStatus, backendStatus: LocalDeal['backendStatus'] = status): LocalDeal {
  const accepted = status !== 'broadcasting'
  const hasCompletionEvidence =
    status === 'completed_by_worker' ||
    status === 'confirmed_by_customer' ||
    status === 'reviewed' ||
    backendStatus === 'confirmed_by_customer' ||
    backendStatus === 'payment_pending' ||
    backendStatus === 'paid' ||
    backendStatus === 'reviewed'

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
    completionNotes: hasCompletionEvidence ? 'Đã thay ổ cắm và kiểm tra tải.' : null,
    completionPhotoUrls: hasCompletionEvidence ? ['storage://job_test_1/after.jpg'] : [],
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
    finalPrice: backendStatus === 'payment_pending' ? 260000 : null,
    id: 'job_test_1',
    scopeChange: null,
    status,
  }
}

function customerSearchStateForStatus(status: LocalDealStatus): LocalCustomerSearchState {
  if (status === 'broadcasting') return 'searching'
  if (status === 'worker_matched') return 'matched'
  if (status === 'completed_by_worker' || status === 'confirmed_by_customer' || status === 'reviewed') return 'completed'
  if (['worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending'].includes(status)) return 'active'
  return 'idle'
}

function buildWorkflow(deal: LocalDeal | null, options: { notificationUnreadCount?: number; notifications?: any[] } = {}) {
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
      cancelRemoteJob: jest.fn(async () => true),
      decideScopeChange: jest.fn(async () => true),
      submitReview: jest.fn(async () => true),
    },
    notificationUnreadCount: options.notificationUnreadCount ?? 0,
    notifications: options.notifications ?? [],
    selectors,
    state: {
      deal,
      lastError: null,
      lastRemoteSyncAt: null,
      workerGate: 'remote_backend',
    },
  }
}

function buildScopeChange(): LocalScopeChange {
  return {
    createdAt: '2026-06-01T00:00:00.000Z',
    evidencePhotoUrls: ['storage://job_test_1/scope.jpg'],
    id: 'scope_test_1',
    kaelReview: null,
    kaelProgress: null,
    priceMax: 320000,
    priceMin: 260000,
    reason: 'Cần thay thêm ổ cắm sau khi tháo mặt che.',
    requestedDescription: 'Thay thêm ổ cắm bị cháy chân tiếp xúc.',
    status: 'reviewing_by_kael',
  }
}

beforeEach(() => {
  mockPush.mockClear()
  mockReplace.mockClear()
  mockUseJobChatThread.mockClear()
  mockUseJobChatThread.mockReturnValue({
    error: null,
    loading: false,
    messages: [],
    refresh: jest.fn(),
    sendMessage: jest.fn(async () => true),
    sending: false,
  })
  mockRouteParams = { tab: 'chat' }
  buildWorkflow(buildDeal('broadcasting'))
})

describe('CustomerHistorySurface phase context', () => {
  it('does not show the Kael source pill in the empty repair hero', () => {
    mockRouteParams = { tab: 'repair' }
    buildWorkflow(null)

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-repair-hero-panel')).not.toHaveTextContent(/Từ Kael|From Kael/)
    expect(screen.getByTestId('customer-history-apple-ios26-surface-system')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-history-hero-edge-highlight')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-section-liquid-wash-activity')).toBeNull()
    expect(screen.queryByTestId('customer-history-hero-mint-aura')).toBeNull()
    expect(screen.queryByTestId('customer-history-repair-hero-liquid')).toBeNull()
    expect(screen.getByTestId('customer-history-activity-empty-timeline-rail')).toBeOnTheScreen()
  })

  it('removes draft copy from the repair hero and enlarges the service title', () => {
    mockRouteParams = { tab: 'repair' }
    const draftDeal = buildDeal('draft')
    draftDeal.draft.serviceType = 'cleaning'
    buildWorkflow(draftDeal)

    render(<CustomerHistorySurface />)

    const hero = screen.getByTestId('customer-history-repair-hero-panel')
    const titleStyle = StyleSheet.flatten(screen.getByTestId('customer-history-repair-hero-title').props.style)
    expect(hero).toHaveTextContent(/Vệ sinh/)
    expect(hero).not.toHaveTextContent(/Nháp/)
    expect(screen.getByTestId('customer-history-title-row')).not.toHaveTextContent(/Nháp/)
    expect(screen.queryByTestId('customer-history-activity-status-lens')).toBeNull()
    expect(titleStyle.fontSize).toBe(20)
    expect(titleStyle.lineHeight).toBe(24)
  })

  it('shows a real case command overview without leaking unreleased address or fake ETA', () => {
    mockRouteParams = { tab: 'repair' }
    buildWorkflow(buildDeal('broadcasting'))

    const { rerender } = render(<CustomerHistorySurface />)

    const commandPanel = screen.getByTestId('customer-history-case-command-panel')
    expect(commandPanel).toHaveTextContent(/Trung tâm ca việc/)
    expect(screen.getByTestId('customer-history-case-command-cell-1-value')).toHaveTextContent('84%')
    expect(screen.getByTestId('customer-history-case-command-cell-3-value')).toHaveTextContent('180.000đ - 260.000đ')
    expect(screen.getByTestId('customer-history-case-command-cell-4-value')).toHaveTextContent('Quận 1')
    expect(screen.getByTestId('customer-history-case-command-cell-5-value')).toHaveTextContent('Chờ tín hiệu di chuyển thật')
    expect(screen.getByTestId('customer-history-case-command-cell-6-value')).toHaveTextContent(/Thợ nhận việc/)
    fireEvent.press(screen.getAllByText('Tiếp tục với Kael')[0])
    expect(mockPush).toHaveBeenCalledWith('/(customer)/kael-chat?serviceType=electrical')
    expect(commandPanel).not.toHaveTextContent(/Tòa A/)
    expect(commandPanel).not.toHaveTextContent('--')

    buildWorkflow(buildDeal('worker_on_way'))
    rerender(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-case-command-cell-4-value')).toHaveTextContent('Tòa A, Quận 1')
  })

  it('shows matching score from real estimate and broadcast state without fake worker ratings', () => {
    mockRouteParams = { tab: 'repair' }
    buildWorkflow(buildDeal('broadcasting'))

    render(<CustomerHistorySurface />)

    const matchingPanel = screen.getByTestId('customer-history-matching-score-panel')
    expect(matchingPanel).toBeOnTheScreen()
    expect(screen.getByTestId('customer-history-matching-confidence-value')).toHaveTextContent('84%')
    expect(matchingPanel).toHaveTextContent(/Độ phù hợp/)
    expect(screen.getByTestId('customer-history-matching-worker-value')).toHaveTextContent(/Đang chờ phản hồi/)
    expect(screen.getByTestId('customer-history-matching-evidence-value')).toHaveTextContent(/1 bằng chứng thật/)
    expect(screen.getByTestId('customer-history-matching-area-value')).toHaveTextContent(/Quận 1/)
    expect(screen.getByTestId('customer-history-matching-problem-value')).toHaveTextContent(/Ổ cắm chập chờn/)
    expect(matchingPanel).not.toHaveTextContent(/★★★★★|4\.9|rating/i)
  })

  it('shows worker quote state from Kael price sources without fake offer stats', () => {
    mockRouteParams = { tab: 'price' }
    const deal = buildDeal('scope_change_pending')
    deal.scopeChange = buildScopeChange()
    buildWorkflow(deal)

    render(<CustomerHistorySurface />)

    const quotePanel = screen.getByTestId('customer-history-price-worker-quote-panel')
    expect(quotePanel).toBeOnTheScreen()
    expect(screen.getByTestId('customer-history-worker-quote-broadcast-value')).toHaveTextContent('180.000đ - 260.000đ')
    expect(screen.getByTestId('customer-history-worker-quote-kael-value')).toHaveTextContent('180.000đ - 260.000đ')
    expect(screen.getByTestId('customer-history-worker-quote-scope-value')).toHaveTextContent('260.000đ - 320.000đ')
    expect(screen.getByTestId('customer-history-worker-quote-final-value')).toHaveTextContent(/Chờ Kael chốt/)
    expect(screen.getByTestId('customer-history-worker-quote-reason-value')).toHaveTextContent(/Cần thay thêm ổ cắm/)
    expect(screen.getByTestId('customer-history-worker-quote-time-value')).toHaveTextContent(/Ngay bây giờ/)
    expect(screen.getByTestId('customer-history-price-open-kael')).toHaveTextContent(/Xem đề xuất/)
    expect(quotePanel).not.toHaveTextContent(/★★★★★|4\.9|rating|0 offer|3 thợ|Thợ A|300\.000đ|30 phút|Kiểm tra|Thay dây điện/i)
  })

  it('shows location and ETA gates without treating search countdown as travel ETA', () => {
    mockRouteParams = { tab: 'repair' }
    buildWorkflow(buildDeal('broadcasting'))

    const { rerender } = render(<CustomerHistorySurface />)

    const locationPanel = screen.getByTestId('customer-history-location-eta-panel')
    expect(locationPanel).toBeOnTheScreen()
    expect(screen.getByTestId('customer-history-location-address-value')).toHaveTextContent('Quận 1')
    expect(screen.getByTestId('customer-history-location-address-gate-value')).toHaveTextContent(/Ẩn địa chỉ chi tiết/)
    expect(screen.getByTestId('customer-history-location-route-value')).toHaveTextContent(/Ẩn địa chỉ chi tiết/)
    expect(screen.getByTestId('customer-history-location-eta-value')).toHaveTextContent(/Chờ tín hiệu di chuyển thật/)
    expect(screen.getByTestId('customer-history-location-live-signal-value')).toHaveTextContent(/Tìm thợ còn 45 giây/)
    expect(locationPanel).not.toHaveTextContent(/Tòa A/)

    buildWorkflow(buildDeal('worker_on_way'))
    rerender(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-location-address-value')).toHaveTextContent('Tòa A, Quận 1')
    expect(screen.getByTestId('customer-history-location-address-gate-value')).toHaveTextContent(/Đã mở theo chính sách/)
    expect(screen.getByTestId('customer-history-location-route-value')).toHaveTextContent(/Thợ đang di chuyển/)
    expect(screen.getByTestId('customer-history-location-eta-value')).toHaveTextContent(/Chờ tín hiệu di chuyển thật/)
    expect(screen.getByTestId('customer-history-location-eta-label')).toHaveTextContent(/Thời gian dự kiến/)
    expect(screen.getByTestId('customer-history-location-live-signal-value')).toHaveTextContent(/Thợ đang di chuyển/)
    expect(screen.getByTestId('customer-history-location-route-action')).toHaveTextContent(/Theo dõi hành trình/)
    fireEvent.press(screen.getByTestId('customer-history-location-route-action'))
    expect(mockPush).toHaveBeenCalledWith('/(customer)/kael-chat?serviceType=electrical')
    expect(screen.getByTestId('customer-history-location-eta-panel')).not.toHaveTextContent(/16:52|30 phút|2\.3km|2,3km/)
  })

  it('shows live job alerts from real notifications and workflow next event', () => {
    mockRouteParams = { scope_change: 'scope_test_1', tab: 'repair' }
    const deal = buildDeal('scope_change_pending')
    deal.scopeChange = buildScopeChange()
    buildWorkflow(deal, {
      notificationUnreadCount: 1,
      notifications: [{
        body: 'Có thay đổi phạm vi cần xem trong yêu cầu thật.',
        created_at: '2026-06-01T01:00:00.000Z',
        event_type: 'scope_change_requested',
        id: 'notification_scope_1',
        job_id: 'job_test_1',
        read_at: null,
        status: 'sent',
        title: 'Kael cần bạn xem đổi phạm vi',
      }],
    })

    render(<CustomerHistorySurface />)

    const alertPanel = screen.getByTestId('customer-history-live-alert-panel')
    expect(alertPanel).toBeOnTheScreen()
    expect(alertPanel).toHaveTextContent(/Kael cần bạn xem đổi phạm vi/)
    expect(alertPanel).toHaveTextContent(/Có thay đổi phạm vi cần xem trong yêu cầu thật/)
    expect(screen.getByTestId('customer-history-live-alert-source-value')).toHaveTextContent(/Thông báo thật/)
    expect(screen.getByTestId('customer-history-live-alert-unread-value')).toHaveTextContent('1')
    expect(screen.getByTestId('customer-history-live-alert-artifact-value')).toHaveTextContent(/Thay đổi phạm vi/)
    expect(screen.getByTestId('customer-history-live-alert-next-value')).toHaveTextContent(/Kael quyết định phạm vi/)
    expect(alertPanel).not.toHaveTextContent(/push giả|fake|0 thông báo/i)
  })

  it('shows accepted job state without fake worker identity or ratings', () => {
    mockRouteParams = { tab: 'repair' }
    buildWorkflow(buildDeal('worker_matched'))

    render(<CustomerHistorySurface />)

    const acceptedPanel = screen.getByTestId('customer-history-job-acceptance-panel')
    expect(acceptedPanel).toBeOnTheScreen()
    expect(screen.getByTestId('customer-history-job-acceptance-status-value')).toHaveTextContent(/Thợ đang xử lý/)
    expect(screen.getByTestId('customer-history-job-acceptance-service-value')).toHaveTextContent(/Sửa điện/)
    expect(screen.getByTestId('customer-history-job-acceptance-address-value')).toHaveTextContent('Tòa A, Quận 1')
    expect(screen.getByTestId('customer-history-job-acceptance-chat-value')).toHaveTextContent(/Nhắn trong chat công việc/)
    expect(screen.getByTestId('customer-history-job-acceptance-brief-value')).toHaveTextContent(/Kael đã tóm tắt phạm vi/)
    expect(acceptedPanel).not.toHaveTextContent(/★★★★★|4\.9|rating|Thợ A|avatar/i)
  })

  it('shows in-progress workflow gates without fake progress percentage or ETA', () => {
    mockRouteParams = { tab: 'repair' }
    buildWorkflow(buildDeal('repairing'))

    render(<CustomerHistorySurface />)

    const progressPanel = screen.getByTestId('customer-history-job-progress-panel')
    expect(progressPanel).toBeOnTheScreen()
    expect(screen.getByTestId('customer-history-job-progress-phase-value')).toHaveTextContent(/Đang xử lý/)
    expect(screen.getByTestId('customer-history-job-progress-next-value')).toHaveTextContent(/Thợ gửi hoàn tất/)
    expect(screen.getByTestId('customer-history-job-progress-evidence-value')).toHaveTextContent(/Bằng chứng hoàn tất/)
    expect(screen.getByTestId('customer-history-job-progress-chat-value')).toHaveTextContent(/Nhắn trong chat công việc/)
    expect(progressPanel).not.toHaveTextContent(/75%|100%|15 phút|ETA 15|rating|4\.9/i)
  })

  it('renders matching phase context and keeps chat locked before a real job-chat phase', () => {
    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-phase-context')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-history-phase-context')).not.toHaveTextContent(/Luồng điều phối/)
    expect(screen.getByTestId('customer-history-phase-context')).toHaveTextContent(/Báo cáo/)
    expect(screen.getByTestId('customer-history-phase-body')).toHaveTextContent(/Kael đã gửi phiếu/)
    expect(screen.getByTestId('customer-history-phase-live-cell')).not.toHaveTextContent(/Đang xử lý|Luồng điều phối/)
    expect(StyleSheet.flatten(screen.getByTestId('customer-history-phase-title').props.style).fontSize).toBe(18)
    expect(StyleSheet.flatten(screen.getByTestId('customer-history-phase-live-cell-value').props.style).fontSize).toBe(13)
    expect(StyleSheet.flatten(screen.getByTestId('customer-history-phase-live-cell-value').props.style).lineHeight).toBe(17)
    expect(StyleSheet.flatten(screen.getByTestId('customer-history-phase-artifact-cell-label').props.style).fontWeight).toBe('700')
    expect(StyleSheet.flatten(screen.getByTestId('customer-history-phase-artifact-cell-value').props.style).fontWeight).toBe('600')
    expect(screen.getByTestId('customer-history-chat-tab-panel')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-history-chat-tab-panel')).toHaveTextContent(/Kael đề xuất hỗ trợ/)
    expect(screen.getByTestId('customer-history-chat-helper-service-value')).toHaveTextContent(/Sửa điện/)
    expect(screen.getByTestId('customer-history-chat-helper-action-value')).toHaveTextContent(/Chờ thợ nhận việc/)
    expect(screen.getByTestId('customer-history-chat-helper-time-value')).toHaveTextContent(/Ngay bây giờ/)
    expect(screen.getByTestId('customer-history-chat-input').props.editable).toBe(false)
    expect(screen.getByTestId('customer-history-chat-locked-reason')).toHaveTextContent('Chat cần công việc thật')
    fireEvent.press(screen.getByText('Xem chi tiết'))
    expect(mockPush).toHaveBeenCalledWith('/(customer)/kael-chat?serviceType=electrical')
    expect(mockUseJobChatThread).toHaveBeenCalledWith('job_test_1', false)
  })

  it('loads job chat read-only after payment gate instead of reopening send authority', () => {
    mockRouteParams = { tab: 'chat' }
    buildWorkflow(buildDeal('confirmed_by_customer', 'payment_pending'))

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-chat-input').props.editable).toBe(false)
    expect(screen.getByTestId('customer-history-chat-locked-reason')).toHaveTextContent('Chat chỉ còn đọc lại')
    expect(mockUseJobChatThread).toHaveBeenCalledWith('job_test_1', true)
  })

  it('shows job-chat as an unlocked phase action during active work', () => {
    mockRouteParams = { tab: 'repair' }
    buildWorkflow(buildDeal('worker_on_way'))

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-phase-context')).toHaveTextContent(/Nhắn trong chat công việc/)
  })

  it('shows completion evidence on the done tab from worker-submitted fields', () => {
    mockRouteParams = { tab: 'done' }
    buildWorkflow(buildDeal('completed_by_worker'))

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-phase-context')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-history-completion-evidence-panel')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-history-completion-evidence-panel')).toHaveTextContent(/1.*hoàn tất/)
    expect(screen.getByTestId('customer-history-completion-evidence-panel')).toHaveTextContent(/Đã thay ổ cắm/)
    expect(screen.getByTestId('customer-history-completion-evidence-panel')).toHaveTextContent(/Kael đang xét hoàn tất/)
  })

  it('does not treat the repairing-phase completion evidence input as a completion outcome', () => {
    mockRouteParams = { tab: 'done' }
    buildWorkflow(buildDeal('repairing'))

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-phase-context')).toHaveTextContent(/Bằng chứng hoàn tất/)
    expect(screen.queryByTestId('customer-history-completion-evidence-panel')).toBeNull()
    expect(screen.getByTestId('customer-history-done-hero')).toHaveTextContent(/Chờ thợ hoàn tất/)
  })

  it('keeps basic scope-change context separate from a submitted scope artifact', () => {
    mockRouteParams = { tab: 'repair' }
    buildWorkflow(buildDeal('inspecting'))

    const { rerender } = render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-phase-context')).toHaveTextContent(/Thay đổi phạm vi/)
    expect(screen.queryByTestId('customer-history-scope-change-panel')).toBeNull()

    const scopedDeal = buildDeal('scope_change_pending')
    scopedDeal.scopeChange = buildScopeChange()
    buildWorkflow(scopedDeal)
    rerender(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-scope-change-panel')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-history-scope-change-panel')).toHaveTextContent(/Cần thay thêm ổ cắm/)
  })

  it('shows an honest blocked reason when completion evidence is missing', () => {
    mockRouteParams = { tab: 'done' }
    const deal = buildDeal('completed_by_worker')
    deal.completionNotes = null
    deal.completionPhotoUrls = []
    buildWorkflow(deal)

    const { rerender } = render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-completion-evidence-panel')).toHaveTextContent(/Cần bằng chứng hoàn tất/)
    expect(screen.getByTestId('customer-history-completion-evidence-panel')).toHaveTextContent(/Chờ bằng chứng hoàn tất/)
    expect(screen.getByTestId('customer-history-completion-evidence-panel')).toHaveTextContent(/Chờ ghi chú thợ/)
    expect(screen.getByTestId('customer-history-completion-evidence-panel')).not.toHaveTextContent(/Kael đang xét hoàn tất/)
    expect(screen.getByTestId('customer-history-done-timeline')).toHaveTextContent(/Chờ quyết định/)
    expect(screen.getByTestId('customer-history-done-timeline')).not.toHaveTextContent(/Đã ghi quyết định hoàn tất/)

    deal.completionNotes = 'Đã thay ổ cắm và kiểm tra tải.'
    deal.completionPhotoUrls = []
    buildWorkflow(deal)
    rerender(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-completion-evidence-panel')).toHaveTextContent(/Cần bằng chứng hoàn tất/)
    expect(screen.getByTestId('customer-history-completion-evidence-panel')).toHaveTextContent(/Chờ bằng chứng hoàn tất/)
    expect(screen.getByTestId('customer-history-completion-evidence-panel')).not.toHaveTextContent(/Kael đang xét hoàn tất/)
  })

  it('marks completion evidence as confirmed after Kael/backend confirmation', () => {
    mockRouteParams = { tab: 'done' }
    buildWorkflow(buildDeal('confirmed_by_customer'))

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-completion-evidence-panel')).toHaveTextContent(/Kael đã xác nhận/)
    expect(screen.getByTestId('customer-history-completion-evidence-panel')).not.toHaveTextContent(/Kael đang xét hoàn tất/)
  })

  it('keeps review submit locked during payment_pending and opens it after paid', () => {
    mockRouteParams = { tab: 'done' }
    buildWorkflow(buildDeal('confirmed_by_customer', 'payment_pending'))

    const { rerender } = render(<CustomerHistorySurface />)

    expect(screen.queryByTestId('customer-history-review-submit')).toBeNull()
    expect(screen.getAllByText('Khóa').length).toBeGreaterThan(0)
    expect(screen.getByTestId('customer-history-done-hero')).toHaveTextContent(/Kael đã xác nhận/)
    expect(screen.getByTestId('customer-history-done-hero')).not.toHaveTextContent(/Chờ thợ hoàn tất/)

    buildWorkflow(buildDeal('confirmed_by_customer', 'paid'))
    rerender(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-review-submit')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-history-review-panel')).toHaveTextContent(/Thanh toán/)
    expect(screen.getByTestId('customer-history-review-panel')).toHaveTextContent(/Mở/)
  })

  it('preserves review submit access when an already-confirmed job is missing backfilled completion evidence', () => {
    mockRouteParams = { tab: 'done' }
    const deal = buildDeal('confirmed_by_customer')
    deal.completionNotes = null
    deal.completionPhotoUrls = []
    buildWorkflow(deal)

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-review-submit')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-history-completion-evidence-panel')).toHaveTextContent(/Cần bằng chứng hoàn tất/)
    expect(screen.getByTestId('customer-history-review-panel')).toHaveTextContent(/Mở/)
    expect(screen.getByTestId('customer-history-done-timeline')).toHaveTextContent(/Sẵn sàng đánh giá/)
  })

  it('localizes hydrated estimate complexity instead of showing backend enum copy', () => {
    mockRouteParams = { tab: 'price' }
    buildWorkflow(buildDeal('worker_on_way'))

    render(<CustomerHistorySurface />)

    const pricePanel = screen.getByTestId('customer-history-price-tab-panel')
    expect(pricePanel).toHaveTextContent(/Vừa/)
    expect(pricePanel).not.toHaveTextContent('medium')
  })

  it('shows cancelled transactions as a locked policy state without reopening cancellation', () => {
    mockRouteParams = { tab: 'repair' }
    buildWorkflow(buildDeal('cancelled'))

    render(<CustomerHistorySurface />)

    expect(screen.getByTestId('customer-history-phase-context')).toHaveTextContent(/Giao dịch đã hủy/)
    expect(screen.getByTestId('customer-history-cancellation-context')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-history-cancellation-context')).toHaveTextContent(/Yêu cầu đã hủy/)
    expect(screen.getByTestId('customer-history-cancellation-context')).toHaveTextContent(/Công việc đã hủy/)
    expect(screen.getByTestId('customer-history-worker-placeholder')).toHaveTextContent(/Yêu cầu đã hủy/)
    expect(screen.queryByTestId('customer-history-cancel-local-deal')).toBeNull()
    expect(screen.getByTestId('customer-history-cancellation-context')).not.toHaveTextContent(/Kael đã xác nhận/)
  })

  it('lets the in-app browser confirm and run customer cancellation', () => {
    mockRouteParams = { tab: 'repair' }
    buildWorkflow(buildDeal('broadcasting'))
    const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS')
    const runtime = globalThis as unknown as { confirm?: unknown }
    const originalConfirm = runtime.confirm
    const confirmSpy = jest.fn(() => true)
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' })
    runtime.confirm = confirmSpy

    try {
      render(<CustomerHistorySurface />)

      fireEvent.press(screen.getByTestId('customer-history-cancel-local-deal'))

      expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Hủy yêu cầu?'))
      expect(mockWorkflowValue.actions.cancelRemoteJob).toHaveBeenCalledTimes(1)
    } finally {
      if (originalPlatformDescriptor) {
        Object.defineProperty(Platform, 'OS', originalPlatformDescriptor)
      }
      runtime.confirm = originalConfirm
    }
  })
})
