import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert, StyleSheet } from 'react-native'

let mockRouteParams: Record<string, string | string[] | undefined>
let mockWorkflowValue: any
const mockReplace = jest.fn()
const mockListMyServiceHistory = jest.fn()
const mockOpenDispute = jest.fn()
const mockSetFavoriteWorker = jest.fn()

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

jest.mock('@/lib/services', () => ({
  jobService: {
    listMyServiceHistory: (...args: unknown[]) => mockListMyServiceHistory(...args),
    openDispute: (...args: unknown[]) => mockOpenDispute(...args),
    setFavoriteWorker: (...args: unknown[]) => mockSetFavoriteWorker(...args),
  },
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => 'vi',
  }
})

import { CustomerHistorySurface } from '../customer-surfaces'

function buildWorkflow() {
  mockWorkflowValue = {
    actions: {
      decideScopeChange: jest.fn(async () => true),
      hydrateRemoteJobById: jest.fn(async () => true),
    },
    state: {
      deal: null,
    },
  }
}

function serviceHistory() {
  return {
    success: true,
    data: {
      service_history: [
        {
          ended_at: '2026-07-13T08:52:00.000Z',
          final_price: 320000,
          id: 'job_paid',
          service_type: 'electrical',
          status: 'paid',
          worker: {
            avatar_url: 'https://example.test/worker-1.png',
            display_name: 'Anh Minh',
            id: 'worker_1',
            is_favorite: false,
          },
        },
        {
          ended_at: '2026-07-12T06:30:00.000Z',
          final_price: 180000,
          id: 'job_reviewed',
          service_type: 'plumbing',
          status: 'reviewed',
          worker: {
            avatar_url: null,
            display_name: 'Anh Minh',
            id: 'worker_1',
            is_favorite: false,
          },
        },
        {
          ended_at: '2026-07-03T12:00:00.000Z',
          final_price: null,
          id: 'job_cancelled',
          service_type: 'cleaning',
          status: 'cancelled',
          worker: null,
        },
      ],
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRouteParams = {}
  buildWorkflow()
  mockListMyServiceHistory.mockResolvedValue(serviceHistory())
  mockOpenDispute.mockResolvedValue({
    success: true,
    data: { dispute_id: 'dispute_1' },
  })
  mockSetFavoriteWorker.mockResolvedValue({
    success: true,
    data: { is_favorite: true, worker_id: 'worker_1' },
  })
})

describe('CustomerHistorySurface service history', () => {
  it('returns to the support hub when history was opened from Profile support', async () => {
    mockRouteParams = { source: 'profile-support' }

    render(<CustomerHistorySurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-history-list')).toBeOnTheScreen())
    fireEvent.press(screen.getByRole('button', { name: 'Quay lại' }))

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/profile?utility=support')
  })

  it('renders a date-grouped deal feed with real worker and price data', async () => {
    render(<CustomerHistorySurface />)

    await waitFor(() => {
      expect(screen.getByTestId('customer-v21-history-list')).toBeOnTheScreen()
    })

    expect(screen.getByText('Hoạt động gần đây')).toBeOnTheScreen()
    expect(screen.getByText('Sửa điện')).toBeOnTheScreen()
    expect(screen.getAllByText('Anh Minh')).toHaveLength(2)
    expect(screen.getByText('320.000 ₫')).toBeOnTheScreen()
    expect(screen.getAllByText('Đã hoàn tất')).toHaveLength(2)
    expect(screen.getByTestId('customer-v21-history-group-2026-07-13')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-group-2026-07-12')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-item-job_paid-card-skin')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-item-job_paid-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-item-job_paid-mint-aura')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-history-worker-row-job_paid').props.style)).toMatchObject({
      marginBottom: 8,
      marginTop: -8,
    })
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-history-favorite-job_paid-icon').props.style)).toMatchObject({
      fontSize: 20,
      includeFontPadding: false,
      lineHeight: 25,
      textAlign: 'center',
      textAlignVertical: 'center',
    })
    expect(screen.queryByTestId('customer-v21-direct-empty-2.6-case-overview')).toBeNull()
  })

  it('uses a horizontal service filter rail and filters without inventing records', async () => {
    render(<CustomerHistorySurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-history-list')).toBeOnTheScreen())
    expect(screen.getByTestId('customer-v21-history-filter-scroll')).toHaveProp('horizontal', true)
    expect(screen.getByTestId('customer-v21-history-filter-scroll')).toHaveProp('decelerationRate', 'normal')
    expect(screen.getByTestId('customer-v21-history-filter-scroll')).toHaveProp('showsHorizontalScrollIndicator', false)
    expect(screen.getByTestId('customer-v21-history-filter-scroll')).toHaveProp(
      'accessibilityHint',
      'Vuốt ngang để xem thêm bộ lọc dịch vụ',
    )
    expect(screen.getByTestId('customer-v21-history-filter-drag-surface')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-filter-fade')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-filter-all-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-filter-all-mint-aura')).toBeOnTheScreen()
    for (const filter of ['saved', 'electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']) {
      expect(screen.queryByTestId(`customer-v21-history-filter-${filter}-wide-mint-aura`)).toBeNull()
      expect(screen.queryByTestId(`customer-v21-history-filter-${filter}-mint-aura`)).toBeNull()
    }

    fireEvent.press(screen.getByTestId('customer-v21-history-filter-cleaning'))

    expect(screen.getByTestId('customer-v21-history-item-job_cancelled')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-history-item-job_paid')).toBeNull()
    expect(screen.queryByTestId('customer-v21-history-item-job_reviewed')).toBeNull()
  })

  it('reuses the profile mint aura formula for the saved-worker hint and unavailable card', async () => {
    mockListMyServiceHistory.mockResolvedValue({ success: false })
    render(<CustomerHistorySurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-history-error')).toBeOnTheScreen())

    expect(screen.getByTestId('customer-v21-history-saved-hint-card-skin')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-saved-hint-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-saved-hint-mint-aura')).toBeOnTheScreen()
    expect(screen.getByText('Thợ đã lưu')).toBeOnTheScreen()
    expect(screen.getByText('Kael sẽ ưu tiên họ trong lần tìm tiếp theo.')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-error-card-skin')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-error-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-error-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-error-workart')).toBeOnTheScreen()
    expect(screen.getByText('Không thể tải lịch sử dịch vụ lúc này. Vui lòng kiểm tra kết nối và thử lại.')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-error-icon')).toBeOnTheScreen()
    expect(screen.queryByText('Vui lòng thử lại khi kết nối ổn định hơn.')).toBeNull()
  })

  it('uses the selected transparent tray icon at a larger History-only size', async () => {
    mockListMyServiceHistory.mockResolvedValue({
      success: true,
      data: { service_history: [] },
    })
    render(<CustomerHistorySurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-history-empty')).toBeOnTheScreen())

    expect(screen.getByTestId('customer-v21-history-empty-formula-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-empty-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-empty-mint-aura')).toBeOnTheScreen()
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-history-empty-asset').props.style)).toMatchObject({
      borderWidth: 0,
    })
    expect(StyleSheet.flatten(screen.getByTestId('customer-v21-history-empty-asset').props.style).backgroundColor).toBeUndefined()

    const assetsSource = readFileSync(resolve(__dirname, '../ui/assets.ts'), 'utf8')
    const historySurfaceSource = readFileSync(resolve(__dirname, '../history/service-history-surface.tsx'), 'utf8')
    const sharedSurfacesSource = readFileSync(resolve(__dirname, '../ui/shared-surfaces.tsx'), 'utf8')

    expect(assetsSource).toContain("activity: require('@/assets/client-image-icons/client-activity-route.png')")
    expect(assetsSource).toContain("activityEmpty: require('@/assets/client-image-icons/client-activity-empty.png')")
    expect(assetsSource).toContain("historyErrorWorkart: require('@/assets/customer-history/history-error-workart.png')")
    expect(historySurfaceSource).toContain('assetSize={76}')
    expect(historySurfaceSource).toContain('image={customerV21Assets.activityEmpty}')
    expect(historySurfaceSource).toContain('source={customerV21Assets.historyErrorWorkart}')
    expect(sharedSurfacesSource).toContain('assetSize = 64')
    expect(sharedSurfacesSource).toContain('size={assetSize}')
    expect(existsSync(resolve(__dirname, '../../../assets/client-image-icons/client-activity-empty.png'))).toBe(true)
    expect(existsSync(resolve(__dirname, '../../../assets/customer-history/history-error-workart.png'))).toBe(true)
  })

  it('saves a worker and updates every completed deal from that worker', async () => {
    render(<CustomerHistorySurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-history-favorite-job_paid')).toBeOnTheScreen())
    fireEvent.press(screen.getByTestId('customer-v21-history-favorite-job_paid'))

    await waitFor(() => {
      expect(mockSetFavoriteWorker).toHaveBeenCalledWith('worker_1', true)
      expect(screen.getByTestId('customer-v21-history-favorite-job_paid')).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ selected: true }),
      )
      expect(screen.getByTestId('customer-v21-history-favorite-job_reviewed')).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ selected: true }),
      )
    })
  })

  it('shows saved-worker deals in the Đã lưu filter', async () => {
    const result = serviceHistory()
    result.data.service_history[1].worker!.is_favorite = true
    mockListMyServiceHistory.mockResolvedValue(result)
    render(<CustomerHistorySurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-history-list')).toBeOnTheScreen())
    fireEvent.press(screen.getByTestId('customer-v21-history-filter-saved'))

    expect(screen.getByTestId('customer-v21-history-item-job_reviewed')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-history-item-job_paid')).toBeNull()
    expect(screen.queryByTestId('customer-v21-history-item-job_cancelled')).toBeNull()
  })

  it('rebooks the same service through the existing Case Work route', async () => {
    render(<CustomerHistorySurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-history-rebook-job_paid')).toBeOnTheScreen())
    fireEvent.press(screen.getByTestId('customer-v21-history-rebook-job_paid'))

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/booking?service=electrical')
  })

  it('carries a real saved worker into the new Case Work handoff without assigning them yet', async () => {
    const result = serviceHistory()
    result.data.service_history[0].worker = {
      ...result.data.service_history[0].worker!,
      id: '10fe7ac1-78e7-4e8a-9eb2-1a2c5c7b9d10',
      is_favorite: true,
    }
    mockListMyServiceHistory.mockResolvedValue(result)
    render(<CustomerHistorySurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-history-rebook-job_paid')).toBeOnTheScreen())
    fireEvent.press(screen.getByTestId('customer-v21-history-rebook-job_paid'))

    expect(mockReplace).toHaveBeenCalledWith(
      '/(customer)/booking?service=electrical&preferred_worker_id=10fe7ac1-78e7-4e8a-9eb2-1a2c5c7b9d10',
    )
  })

  it('requires confirmation before opening after-service support', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    render(<CustomerHistorySurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-history-support-job_paid')).toBeOnTheScreen())
    fireEvent.press(screen.getByTestId('customer-v21-history-support-job_paid'))

    const supportAlert = alertSpy.mock.calls.find(([title]) => title === 'Hỗ trợ sau dịch vụ')
    expect(supportAlert).toBeDefined()
    const actions = supportAlert?.[2] as { text: string; onPress?: () => void }[]
    await act(async () => {
      actions.find((action) => action.text === 'Mở yêu cầu hỗ trợ')?.onPress?.()
    })

    await waitFor(() => {
      expect(mockOpenDispute).toHaveBeenCalledWith('job_paid', {
        dispute_type: 'other',
        evidence_photo_urls: [],
        initiator_statement: 'Khách hàng cần hỗ trợ sau dịch vụ.',
      })
    })
    alertSpy.mockRestore()
  })

  it('keeps notification job links functional by hydrating the referenced job', async () => {
    mockRouteParams = { job_id: 'job_from_notification' }
    render(<CustomerHistorySurface />)

    await waitFor(() => {
      expect(mockWorkflowValue.actions.hydrateRemoteJobById).toHaveBeenCalledWith('job_from_notification')
    })
  })

  it('keeps a scope-change deep link on the A11 hard stop and submits explicit decisions', async () => {
    mockRouteParams = { job_id: 'job_scope_change', scope_change: 'scope_change_1', screen: '3.3-payment-protected' }
    mockWorkflowValue.state.deal = {
      broadcast: null,
      draft: {
        addressLabel: 'Quận 1',
        description: 'Sửa ổ cắm bị chập',
        districtLabel: 'Quận 1',
        inferredProblemLabel: null,
        mediaCount: 0,
        needsServiceChoice: false,
        problemChips: ['outlet_switch'],
        serviceType: 'electrical',
        source: 'kael',
        timeChoice: 'now',
        unsupportedServiceLabel: null,
      },
      estimate: {
        advisory: 'Tạm dừng công việc cho đến khi khách hàng quyết định.',
        complexity: 'medium',
        confidenceLabel: '82%',
        disclaimer: 'Ước tính từ dữ liệu hiện có.',
        fallbackUsed: false,
        hasVndPrice: true,
        priceRangeLabel: '300.000đ - 450.000đ',
        problemLabel: 'Ổ cắm bị chập',
      },
      id: 'job_scope_change',
      scopeChange: {
        createdAt: '2026-07-15T10:00:00.000Z',
        evidencePhotoUrls: [],
        id: 'scope_change_1',
        kaelProgress: null,
        kaelReview: {
          advisory: 'Nên thay đoạn dây bị hỏng.',
          baseline_evidence: verifiedElectricalBaselineEvidence(),
          baseline_source: 'verified-test-source',
          baseline_used: 'electrical:outlet_or_switch_broken:medium:hcmc_all',
          complexity_assessment: 'medium',
          confidence: 0.82,
          fallback_used: false,
          price_source: 'verified_baseline',
          pricing_mode: 'full_scope_total',
          problem_summary: 'Phát hiện dây âm tường bị chập.',
          reference_price_max: 600000,
          reference_price_min: 400000,
          selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
          stakeholder_balance: {
            commission_level: 1,
            commission_rate_bps: 1500,
            customer_confirmation_required: true,
            customer_total: 500000,
            platform_fee: 75000,
            worker_confirmation_required: true,
            worker_net: 425000,
          },
          worker_price_confirmation: {
            confirmed: true,
            confirmed_at: '2026-08-13T08:00:00.000Z',
            quote_id: 'a7500000-0000-4000-8000-000000000010',
          },
        },
        priceMax: 500000,
        priceMin: 500000,
        reason: 'Phát hiện hư hỏng ẩn.',
        requestTiming: 'on_site',
        requestedDescription: 'Thay dây âm tường bị chập',
        resumeJobStatus: 'repairing',
        status: 'waiting_customer_decision',
      },
      status: 'scope_change_pending',
    }
    render(<CustomerHistorySurface />)

    await waitFor(() => {
      expect(screen.getByTestId('customer-scope-change-hard-stop-modal')).toBeOnTheScreen()
    })

    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_scope_change&focus=approval')

    fireEvent.press(screen.getByTestId('customer-scope-change-modal-approve'))
    await waitFor(() => {
      expect(mockWorkflowValue.actions.decideScopeChange).toHaveBeenCalledWith('scope_change_1', { decision: 'approve' })
      expect(screen.getByTestId('customer-scope-change-modal-approve')).toHaveProp(
        'accessibilityState',
        expect.objectContaining({ busy: false, disabled: false }),
      )
    })

    fireEvent.press(screen.getByTestId('customer-scope-change-modal-reject'))
    await waitFor(() => {
      expect(mockWorkflowValue.actions.decideScopeChange).toHaveBeenCalledWith('scope_change_1', { decision: 'reject' })
    })
  })
})

function verifiedElectricalBaselineEvidence() {
  return {
    schema_version: 'baseline_price_evidence_receipt.v1',
    accepted_source_count: 2,
    aggregate_price_min: 400000,
    aggregate_price_max: 600000,
    high_trust_source_count: 2,
    quorum_met: true,
    required_quorum: 2,
    unit: 'per_visit',
    sources: [
      {
        domain: 'thoviet.com.vn',
        url: 'https://thoviet.com.vn/bang-gia',
        observed_at: '2026-08-14',
        price_min: 350000,
        price_max: 550000,
        unit: 'per_visit',
        effective_tier: 1,
        weight: 1,
      },
      {
        domain: 'thosaigon.vn',
        url: 'https://thosaigon.vn/bang-gia',
        observed_at: '2026-08-14',
        price_min: 450000,
        price_max: 650000,
        unit: 'per_visit',
        effective_tier: 1,
        weight: 1,
      },
    ],
  }
}
