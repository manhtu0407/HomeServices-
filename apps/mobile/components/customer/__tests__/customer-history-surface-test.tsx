import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'

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
    expect(screen.getByTestId('customer-v21-history-filter-indicator')).toBeOnTheScreen()
    for (const filter of ['all', 'saved', 'electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']) {
      expect(screen.getByTestId(`customer-v21-history-filter-${filter}-wide-mint-aura`)).toBeOnTheScreen()
      expect(screen.getByTestId(`customer-v21-history-filter-${filter}-mint-aura`)).toBeOnTheScreen()
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
    expect(screen.getByTestId('customer-v21-history-error-card-skin')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-error-wide-mint-aura')).toBeOnTheScreen()
    expect(screen.getByTestId('customer-v21-history-error-mint-aura')).toBeOnTheScreen()
    expect(screen.queryByText('Vui lòng thử lại khi kết nối ổn định hơn.')).toBeNull()
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

  it('redirects legacy activity and scope-change links into Kael Case Work', async () => {
    mockRouteParams = { job_id: 'job_scope_change', scope_change: 'scope_change_1', screen: '3.3-payment-protected' }
    mockWorkflowValue.state.deal = { id: 'job_scope_change' }
    render(<CustomerHistorySurface />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(customer)/kael-chat?mode=case&jobId=job_scope_change&focus=approval')
    })
  })
})
