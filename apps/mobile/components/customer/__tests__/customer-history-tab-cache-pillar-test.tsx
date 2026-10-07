import { act, render, screen, waitFor } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { readResource, writeResource } from '@/lib/resource-cache/resource-cache'

export const PILLAR = {
  id: 'P329-customer-history-tab-cache',
  invariant: 're-entering the Activity tab renders the last list without a loading card, asks the server only once the list is stale, keeps the list when that revalidation fails, and never shows one account the list of another',
  authority: [
    'governance/RULES.md #8 (fallback yes, fake success no)',
    'docs/foundation/pre-app-build-contract.md §4 (offline or network unavailable state)',
  ],
  target: 'apps/mobile/components/customer/history/service-history-surface.tsx',
  layer: 'integration',
  siblings: ['P297-customer-history-states', 'P325-resource-cache-owner-isolation'],
  mutation: 'make isResourceStale always return true — the re-entry case counts a second request; or drop data after a failed revalidation in useCachedResource — the offline re-entry case shows the error card',
} as const satisfies PillarManifest

let mockSession: { access_token: string; user: { app_metadata?: { provider?: string }; id: string } }
const mockListMyServiceHistory = jest.fn()

jest.mock('expo-image', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { Image: (props: object) => React.createElement(View, props) }
})

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
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
  useFrontendWorkflow: () => ({
    actions: { decideScopeChange: jest.fn(), hydrateRemoteJobById: jest.fn() },
    state: { deal: null },
  }),
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
      data: { items: [], policy: { max_offers: 4, max_vnd: 50_000_000, min_vnd: 10_000, response_days: 3 }, refund_account_ready: true },
    })),
  },
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return { ...actual, useAppLanguage: () => 'vi' }
})

import { CustomerHistorySurface } from '../customer-surfaces'

function historyWith(id: string) {
  return {
    service_history: [{
      ended_at: '2026-07-14T08:00:00.000Z',
      final_price: 240000,
      id,
      service_type: 'handyman',
      status: 'reviewed',
      worker: { avatar_url: null, display_name: 'Chị Lan', id: 'worker-2', is_favorite: false },
    }],
  }
}

const OWNER_A = { access_token: 'token-a', user: { app_metadata: { provider: 'apple' }, id: 'customer_a' } }
const OWNER_B = { access_token: 'token-b', user: { app_metadata: { provider: 'apple' }, id: 'customer_b' } }

beforeEach(() => {
  mockListMyServiceHistory.mockReset()
  mockSession = OWNER_A
})

async function enterActivityTab() {
  const view = render(<CustomerHistorySurface />)
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
  return view
}

describe('customer history tab cache', () => {
  it('re-enters the tab from cache with no loading card and no second request', async () => {
    mockListMyServiceHistory.mockResolvedValue({ success: true, data: historyWith('job-a') })
    const first = await enterActivityTab()
    await waitFor(() => expect(screen.getByTestId('customer-v21-history-item-job-a')).toBeOnTheScreen())
    first.unmount()

    render(<CustomerHistorySurface />)
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-v21-history-item-job-a')).toBeOnTheScreen()
      expect(screen.queryByTestId('customer-v21-history-loading')).toBeNull()
    }, 'the second entry must paint the cached list on its first frame')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    withPillarContext(PILLAR, () => {
      expect(mockListMyServiceHistory).toHaveBeenCalledTimes(1)
    }, 'a fresh cached list must not be requested again')
  })

  it('revalidates a stale list once while it stays visible', async () => {
    writeResource(OWNER_A.user.id, 'customer.service-history', historyWith('job-old'), Date.now() - 10 * 60_000)
    mockListMyServiceHistory.mockResolvedValue({ success: true, data: historyWith('job-new') })
    render(<CustomerHistorySurface />)

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-v21-history-item-job-old')).toBeOnTheScreen()
    }, 'a stale list is still shown while it revalidates')
    await waitFor(() => expect(screen.getByTestId('customer-v21-history-item-job-new')).toBeOnTheScreen())
    withPillarContext(PILLAR, () => {
      expect(mockListMyServiceHistory).toHaveBeenCalledTimes(1)
    }, 'stale data triggers exactly one revalidation')
  })

  it('keeps the cached list when the revalidation fails offline', async () => {
    writeResource(OWNER_A.user.id, 'customer.service-history', historyWith('job-cached'), Date.now() - 10 * 60_000)
    mockListMyServiceHistory.mockResolvedValue({ success: false, error: 'Không thể kết nối đến hệ thống', code: 'NETWORK_ERROR', status: 0 })
    await enterActivityTab()
    await waitFor(() => expect(mockListMyServiceHistory).toHaveBeenCalled())
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-v21-history-item-job-cached')).toBeOnTheScreen()
      expect(screen.queryByTestId('customer-v21-history-error')).toBeNull()
    }, 'an offline re-entry must keep the last list, not swap it for the error card')
  })

  it('never shows one account the cached list of another', async () => {
    writeResource(OWNER_A.user.id, 'customer.service-history', historyWith('job-a'))
    mockSession = OWNER_B
    mockListMyServiceHistory.mockResolvedValue({ success: true, data: historyWith('job-b') })
    render(<CustomerHistorySurface />)

    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('customer-v21-history-item-job-a')).toBeNull()
    }, 'owner B rendered owner A\'s cached activity')
    await waitFor(() => expect(screen.getByTestId('customer-v21-history-item-job-b')).toBeOnTheScreen())
    withPillarContext(PILLAR, () => {
      expect(readResource(OWNER_A.user.id, 'customer.service-history')?.data).toEqual(historyWith('job-a'))
    })
  })
})
