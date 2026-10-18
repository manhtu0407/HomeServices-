import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Alert, Platform } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P297-customer-history-states',
  invariant:
    'history and support feedback distinguish empty, unavailable, submitted and already-open states; only the local visual-audit session skips the network read',
  authority: [
    'governance/RULES.md #8 (empty states, never fake success or silent degradation)',
    'governance/protocols/frontend-test.md G2 (state coverage)',
    'apps/mobile/lib/auth-visual-audit.ts (audit session is dev + web + localhost only)',
  ],
  target: 'apps/mobile/components/customer/history/service-history-surface.tsx',
  layer: 'ui-visual',
  siblings: ['P221-admin-activation-audit-isolation'],
  mutation:
    'drop audit isolation or render a failed read as empty; or treat every409 as an already-open request — the audit, unavailable and support error cases turn red',
} as const satisfies PillarManifest

let mockSession: { access_token: string; user: { app_metadata?: { provider?: string }; id: string } }
let mockRouteParams: Record<string, string | string[] | undefined>
let mockWorkflowValue: unknown
const mockListMyServiceHistory = jest.fn()
const mockOpenDispute = jest.fn()
let mockLanguage: 'vi' | 'en' = 'vi'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-image', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { Image: (props: object) => React.createElement(View, props) }
})

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  useRouter: () => ({ replace: jest.fn() }),
}))

jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SafeAreaView: ({ children, ...props }: { children?: unknown }) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  }
})

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({ session: mockSession }),
}))

jest.mock('@/lib/frontend-workflow-provider', () => ({
  useFrontendWorkflow: () => mockWorkflowValue,
}))

jest.mock('@/lib/services', () => ({
  jobService: {
    listMyServiceHistory: (...args: unknown[]) => mockListMyServiceHistory(...args),
    openDispute: (...args: unknown[]) => mockOpenDispute(...args),
    setFavoriteWorker: jest.fn(),
  },
}))

jest.mock('@/lib/services/compensation-service', () => ({
  compensationService: {
    listForCustomer: jest.fn(async () => ({
      success: true,
      data: {
        items: [],
        policy: { max_offers: 4, max_vnd: 50_000_000, min_vnd: 10_000, response_days: 3 },
        refund_account_ready: true,
      },
    })),
  },
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return { ...actual, useAppLanguage: () => mockLanguage }
})

import { CustomerHistorySurface } from '../customer-surfaces'

const supportHistory = { success: true, data: { service_history: [{
  id: 'job_support', status: 'paid', service_type: 'plumbing', final_price: 350000,
  ended_at: '2026-07-12T06:30:00.000Z', worker: null,
}] } }

beforeEach(() => {
  jest.clearAllMocks()
  mockLanguage = 'vi'
  mockOpenDispute.mockReset()
  mockRouteParams = {}
  mockWorkflowValue = {
    actions: { decideScopeChange: jest.fn(), hydrateRemoteJobById: jest.fn() },
    state: { deal: null },
  }
  mockSession = { access_token: 'real-token', user: { app_metadata: { provider: 'apple' }, id: 'customer_1' } }
})

describe('customer history states', () => {
  it.each(['vi', 'en'] as const)('renders a real web confirmation and outcome in %s', async language => {
    mockLanguage = language
    const platform = jest.replaceProperty(Platform, 'OS', 'web')
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    mockListMyServiceHistory.mockResolvedValue(supportHistory)
    mockOpenDispute.mockResolvedValue({ success: false, status: 409, code: 'ALREADY_OPEN', error: 'private detail' })
    try {
      render(<CustomerHistorySurface />)
      fireEvent.press(await screen.findByTestId('customer-v21-history-support-job_support'))
      await screen.findByTestId('customer-history-support-dialog')
      expect(mockOpenDispute).not.toHaveBeenCalled()
      expect(alert).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: language === 'vi' ? 'Để sau' : 'Not now' })).toBeOnTheScreen()
      expect(screen.getByRole('button', { name: language === 'vi' ? 'Báo cáo thợ vi phạm' : 'Report the worker' })).toBeOnTheScreen()
      fireEvent.press(screen.getByRole('button', { name: language === 'vi' ? 'Mở yêu cầu hỗ trợ' : 'Open support request' }))
      await screen.findByText(language === 'vi' ? 'Đã có yêu cầu hỗ trợ' : 'Support request already open')
      expect(mockOpenDispute).toHaveBeenCalledTimes(1)
      expect(alert).not.toHaveBeenCalled()
      fireEvent.press(screen.getByRole('button', { name: language === 'vi' ? 'Đóng' : 'Close' }))
      await waitFor(() => expect(screen.queryByTestId('customer-history-support-dialog')).toBeNull())
    } finally {
      platform.restore()
      alert.mockRestore()
    }
  })
  it('preserves web cancellation and the existing report-worker choice without submitting support', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'web')
    mockListMyServiceHistory.mockResolvedValue(supportHistory)
    try {
      render(<CustomerHistorySurface />)
      fireEvent.press(await screen.findByTestId('customer-v21-history-support-job_support'))
      fireEvent.press(await screen.findByRole('button', { name: 'Để sau' }))
      await waitFor(() => expect(screen.queryByTestId('customer-history-support-dialog')).toBeNull())
      expect(mockOpenDispute).not.toHaveBeenCalled()
      fireEvent.press(screen.getByTestId('customer-v21-history-support-job_support'))
      fireEvent.press(await screen.findByRole('button', { name: 'Báo cáo thợ vi phạm' }))
      await screen.findByTestId('customer-worker-report-sheet')
      expect(screen.queryByTestId('customer-history-support-dialog')).toBeNull()
      expect(mockOpenDispute).not.toHaveBeenCalled()
    } finally { platform.restore() }
  })

  it.each([false, true])('renders safe web error feedback when the request throws=%s', async throws => {
    const platform = jest.replaceProperty(Platform, 'OS', 'web')
    mockLanguage = 'en'
    mockListMyServiceHistory.mockResolvedValue(supportHistory)
    if (throws) mockOpenDispute.mockRejectedValue(new Error('sentinel-private-web-error'))
    else mockOpenDispute.mockResolvedValue({ success: false, status: 500, code: 'HTTP_500', error: 'sentinel-private-web-error' })
    try {
      render(<CustomerHistorySurface />)
      fireEvent.press(await screen.findByTestId('customer-v21-history-support-job_support'))
      fireEvent.press(await screen.findByRole('button', { name: 'Open support request' }))
      await screen.findByText('Support request not opened')
      expect(screen.queryByText('sentinel-private-web-error')).toBeNull()
      expect(mockOpenDispute).toHaveBeenCalledTimes(1)
    } finally { platform.restore() }
  })

  it('does not display an old support outcome after switching accounts and returning', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'web')
    mockListMyServiceHistory.mockResolvedValue(supportHistory)
    let settle: ((value: object) => void) | undefined
    mockOpenDispute.mockReturnValue(new Promise(resolve => { settle = resolve }))
    try {
      const view = render(<CustomerHistorySurface />)
      fireEvent.press(await screen.findByTestId('customer-v21-history-support-job_support'))
      fireEvent.press(await screen.findByRole('button', { name: 'Mở yêu cầu hỗ trợ' }))
      mockSession = { ...mockSession, user: { ...mockSession.user, id: 'customer_2' } }
      view.rerender(<CustomerHistorySurface />)
      await act(async () => settle?.({ success: false, status: 409, code: 'ALREADY_OPEN', error: 'already_open' }))
      expect(screen.queryByTestId('customer-history-support-dialog')).toBeNull()
      mockSession = { ...mockSession, user: { ...mockSession.user, id: 'customer_1' } }
      view.rerender(<CustomerHistorySurface />)
      expect(screen.queryByTestId('customer-history-support-dialog')).toBeNull()
      expect(mockOpenDispute).toHaveBeenCalledTimes(1)
    } finally { platform.restore() }
  })

  it('ignores a captured native confirmation after the surface unmounts', async () => {
    mockListMyServiceHistory.mockResolvedValue(supportHistory)
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      const view = render(<CustomerHistorySurface />)
      fireEvent.press(await screen.findByTestId('customer-v21-history-support-job_support'))
      const confirm = alert.mock.calls.at(-1)?.[2]?.find(button => button.text === 'Mở yêu cầu hỗ trợ')
      if (!confirm?.onPress) throw new Error('Native confirmation missing')
      view.unmount()
      await act(async () => confirm.onPress?.())
      expect(mockOpenDispute).not.toHaveBeenCalled()
    } finally { alert.mockRestore() }
  })
  it.each(['vi', 'en'] as const)('reports existing support honestly in %s', async language => {
    mockLanguage = language
    mockListMyServiceHistory.mockResolvedValue(supportHistory)
    mockOpenDispute.mockResolvedValue({ success: false, status: 409, code: 'ALREADY_OPEN', error: 'private upstream detail' })
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      render(<CustomerHistorySurface />)
      const support = await screen.findByTestId('customer-v21-history-support-job_support')
      fireEvent.press(support)
      expect(mockOpenDispute).not.toHaveBeenCalled()
      const confirm = alert.mock.calls.at(-1)?.[2]?.find(button => button.text === (language === 'vi' ? 'Mở yêu cầu hỗ trợ' : 'Open support request'))
      if (!confirm?.onPress) throw new Error('Support confirmation action missing')
      await act(async () => confirm.onPress?.())
      await waitFor(() => withPillarContext(PILLAR, () => {
        expect(alert).toHaveBeenLastCalledWith(
          language === 'vi' ? 'Đã có yêu cầu hỗ trợ' : 'Support request already open',
          language === 'vi' ? 'Yêu cầu hỗ trợ cho công việc này đã được mở. Bạn không cần gửi lại.'
            : 'A support request for this job is already open. You do not need to submit it again.')
      }, 'the real Backend ALREADY_OPEN409 is an existing request, not a failed first submission'))
      expect(mockOpenDispute).toHaveBeenCalledTimes(1)
      expect(mockOpenDispute).toHaveBeenCalledWith('job_support', expect.objectContaining({ dispute_type: 'other' }))
      expect(JSON.stringify(alert.mock.calls)).not.toContain('private upstream detail')
    } finally {
      alert.mockRestore()
    }
  })

  it.each([
    ['vi', 'INVALID_STATUS', 409], ['en', 'INVALID_STATUS', 409],
    ['vi', 'ALREADY_OPEN', 403], ['en', 'ALREADY_OPEN', 403],
    ['vi', 'HTTP_500', 500], ['en', 'HTTP_500', 500],
    ['vi', 'NETWORK_ERROR', 0], ['en', 'NETWORK_ERROR', 0],
  ] as const)('keeps %s %s/%s as a failure, without displaying raw details', async (language, code, status) => {
    mockLanguage = language
    mockListMyServiceHistory.mockResolvedValue(supportHistory)
    mockOpenDispute.mockResolvedValue({ success: false, code, status, error: 'sentinel-private-detail' })
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      render(<CustomerHistorySurface />)
      fireEvent.press(await screen.findByTestId('customer-v21-history-support-job_support'))
      const confirm = alert.mock.calls.at(-1)?.[2]?.find(button => button.text === (language === 'vi' ? 'Mở yêu cầu hỗ trợ' : 'Open support request'))
      if (!confirm?.onPress) throw new Error('Support confirmation action missing')
      await act(async () => confirm.onPress?.())
      await waitFor(() => withPillarContext(PILLAR, () => {
        expect(alert).toHaveBeenLastCalledWith(language === 'vi' ? 'Chưa mở được yêu cầu' : 'Support request not opened',
          language === 'vi' ? 'Vui lòng thử lại sau.' : 'Please try again later.')
      }, 'only the exact existing-request conflict is a known state'))
      expect(mockOpenDispute).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(alert.mock.calls)).not.toContain('sentinel-private-detail')
    } finally {
      alert.mockRestore()
    }
  })

  it('keeps support disabled until the single confirmed request settles', async () => {
    mockListMyServiceHistory.mockResolvedValue(supportHistory)
    let settle: ((value: { success: false; status: number; code: string; error: string }) => void) | undefined
    mockOpenDispute.mockReturnValue(new Promise(resolve => { settle = resolve }))
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
    try {
      render(<CustomerHistorySurface />)
      fireEvent.press(await screen.findByTestId('customer-v21-history-support-job_support'))
      const confirm = alert.mock.calls.at(-1)?.[2]?.find(button => button.text === 'Mở yêu cầu hỗ trợ')
      if (!confirm?.onPress) throw new Error('Support confirmation action missing')
      await act(async () => confirm.onPress?.())
      expect(screen.getByTestId('customer-v21-history-support-job_support')).toBeDisabled()
      fireEvent.press(screen.getByTestId('customer-v21-history-support-job_support'))
      expect(alert).toHaveBeenCalledTimes(1)
      expect(mockOpenDispute).toHaveBeenCalledTimes(1)
      await act(async () => settle?.({ success: false, status: 409, code: 'ALREADY_OPEN', error: 'already_open' }))
      await waitFor(() => expect(screen.getByTestId('customer-v21-history-support-job_support')).toBeEnabled())
      expect(alert).toHaveBeenCalledTimes(2)
      expect(mockOpenDispute).toHaveBeenCalledTimes(1)
    } finally {
      alert.mockRestore()
    }
  })
  it('renders the empty card for a real account that has no service history', async () => {
    mockListMyServiceHistory.mockResolvedValue({ success: true, data: { service_history: [] } })
    render(<CustomerHistorySurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-history-empty')).toBeOnTheScreen())

    withPillarContext(PILLAR, () => {
      expect(mockListMyServiceHistory).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('customer-v21-history-empty-workart')).toBeOnTheScreen()
      expect(screen.getByText('Chưa có hoạt động')).toBeOnTheScreen()
      expect(screen.queryByTestId('customer-v21-history-error')).toBeNull()
      expect(screen.queryByTestId('customer-v21-history-retry')).toBeNull()
    }, 'provider=apple, zero rows from the history read')
  })

  it('renders the unavailable card, not the empty card, when the history read fails', async () => {
    mockListMyServiceHistory.mockResolvedValue({ success: false, error: 'unauthorized', code: 'UNAUTHORIZED', status: 401 })
    render(<CustomerHistorySurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-history-error')).toBeOnTheScreen())

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-v21-history-retry')).toBeOnTheScreen()
      expect(screen.queryByTestId('customer-v21-history-empty')).toBeNull()
    }, 'provider=apple, history read returned 401')
  })

  it('shows the empty card in the local visual-audit session without reading the network', async () => {
    mockSession = {
      access_token: 'local-visual-audit',
      user: { app_metadata: { provider: 'local-visual-audit' }, id: 'local-visual-audit-customer' },
    }
    mockListMyServiceHistory.mockResolvedValue({ success: false, error: 'unauthorized', code: 'UNAUTHORIZED', status: 401 })
    render(<CustomerHistorySurface />)

    await waitFor(() => expect(screen.getByTestId('customer-v21-history-empty')).toBeOnTheScreen())

    withPillarContext(PILLAR, () => {
      expect(mockListMyServiceHistory).not.toHaveBeenCalled()
      expect(screen.queryByTestId('customer-v21-history-error')).toBeNull()
    }, 'provider=local-visual-audit must not call GET /me/jobs/history')
  })
})
