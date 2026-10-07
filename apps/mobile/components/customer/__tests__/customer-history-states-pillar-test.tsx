import { render, screen, waitFor } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P297-customer-history-states',
  invariant:
    'a customer with zero service history sees the empty card, a failed history read sees the unavailable card with retry, and only the local visual-audit session skips the network read',
  authority: [
    'governance/RULES.md #8 (empty states, never fake success or silent degradation)',
    'governance/protocols/frontend-test.md G2 (state coverage)',
    'apps/mobile/lib/auth-visual-audit.ts (audit session is dev + web + localhost only)',
  ],
  target: 'apps/mobile/components/customer/history/service-history-surface.tsx',
  layer: 'ui-visual',
  siblings: ['P221-admin-activation-audit-isolation'],
  mutation:
    'drop `enabled: !localVisualAuditSession` from the history resource so audit mode reads the network again — the audit case turns red; or make `load_failure` render the empty card — the unavailable case turns red',
} as const satisfies PillarManifest

let mockSession: { access_token: string; user: { app_metadata?: { provider?: string }; id: string } }
let mockRouteParams: Record<string, string | string[] | undefined>
let mockWorkflowValue: unknown
const mockListMyServiceHistory = jest.fn()

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
    openDispute: jest.fn(),
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
  return { ...actual, useAppLanguage: () => 'vi' }
})

import { CustomerHistorySurface } from '../customer-surfaces'

beforeEach(() => {
  jest.clearAllMocks()
  mockRouteParams = {}
  mockWorkflowValue = {
    actions: { decideScopeChange: jest.fn(), hydrateRemoteJobById: jest.fn() },
    state: { deal: null },
  }
  mockSession = { access_token: 'real-token', user: { app_metadata: { provider: 'apple' }, id: 'customer_1' } }
})

describe('customer history states', () => {
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
