import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { AppState, Pressable } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P330-worker-live-poll',
  invariant: 'the 20-second Worker poll reads only offers, assigned jobs and the heartbeat; profile, earnings, performance, payout and withdrawals are read at startup, on explicit refresh, and once they are five minutes old',
  authority: [
    'governance/RULES.md #10 (bounded network use)',
    'docs/architecture/code-ownership-map.md (Shared Mobile State: workflow orchestration)',
  ],
  target: 'apps/mobile/lib/frontend-workflow/use-worker-board-actions.ts',
  layer: 'integration',
  siblings: ['P326-transport-connectivity'],
  mutation: 'call workerRefresh() without the live mode from the 20-second interval — the poll case counts slow reads; or drop the WORKER_SLOW_REFRESH_MS age check — the five-minute case never re-reads profile',
} as const satisfies PillarManifest

jest.mock('../auth-provider', () => ({
  useAuth: () => ({ role: 'worker', session: { user: { id: 'worker_poll_1' } } }),
}))

jest.mock('../app-language', () => ({ useAppLanguage: () => 'vi' }))

jest.mock('../realtime', () => ({
  subscribeToJobStatus: jest.fn(() => null),
  subscribeToWorkerBroadcasts: jest.fn(() => null),
  subscribeToWorkerEarnings: jest.fn(() => null),
}))

function ok<T>(data: T) {
  return Promise.resolve({ data, status: 200, success: true as const })
}

jest.mock('../services', () => ({
  customerProfileService: {},
  jobService: {},
  kaelMemoryService: {},
  notificationService: { list: jest.fn(() => Promise.resolve({ data: { notifications: [], unread_count: 0 }, status: 200, success: true })) },
  workerService: {
    getBroadcasts: jest.fn(),
    getEarnings: jest.fn(),
    getJobs: jest.fn(),
    getPayoutMethod: jest.fn(),
    getPerformanceInsights: jest.fn(),
    getProfile: jest.fn(),
    listWithdrawalRequests: jest.fn(),
    recordActiveMinute: jest.fn(),
    sendMatchingHeartbeat: jest.fn(),
    updateAvailability: jest.fn(),
  },
}))

import { FrontendWorkflowProvider, useFrontendWorkflow } from '../frontend-workflow-provider'

const { workerService } = jest.requireMock('../services') as {
  workerService: Record<string, jest.Mock>
}

const SLOW_READS = ['getProfile', 'getEarnings', 'getPerformanceInsights', 'getPayoutMethod', 'listWithdrawalRequests'] as const
const LIVE_READS = ['getBroadcasts', 'getJobs'] as const

function callCounts(names: readonly string[]) {
  return Object.fromEntries(names.map((name) => [name, workerService[name].mock.calls.length]))
}

function RefreshButton() {
  const { actions } = useFrontendWorkflow()
  return <Pressable onPress={() => void actions.workerRefresh()} testID="explicit-refresh" />
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })
}

const originalAppState = AppState.currentState

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
  workerService.getBroadcasts.mockImplementation(() => ok({ broadcasts: [] }))
  workerService.getJobs.mockImplementation(() => ok({ jobs: [] }))
  workerService.getProfile.mockImplementation(() => ok({ id: 'worker_poll_1', is_available: true }))
  workerService.getEarnings.mockImplementation(() => ok({ available_balance: 0, daily_earnings: [], recent_transactions: [], worker_id: 'worker_poll_1' }))
  workerService.getPerformanceInsights.mockImplementation(() => ok({ badges: [], performance_axes: [], worker_id: 'worker_poll_1' }))
  workerService.getPayoutMethod.mockImplementation(() => ok({ payout_method: null }))
  workerService.listWithdrawalRequests.mockImplementation(() => ok({ requests: [] }))
  workerService.sendMatchingHeartbeat.mockImplementation(() => ok({}))
  workerService.recordActiveMinute.mockImplementation(() => ok({ active_minutes: 0, last_active_at: null }))
})

afterEach(() => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: originalAppState })
  jest.useRealTimers()
})

describe('worker live poll', () => {
  it('reads everything once at startup, then only live data on each 20-second poll', async () => {
    render(<FrontendWorkflowProvider><RefreshButton /></FrontendWorkflowProvider>)
    await advance(0)
    const startup = callCounts(SLOW_READS)
    await advance(20_000)
    await advance(20_000)

    withPillarContext(PILLAR, () => {
      expect(startup).toEqual({ getProfile: 1, getEarnings: 1, getPerformanceInsights: 1, getPayoutMethod: 1, listWithdrawalRequests: 1 })
      expect(callCounts(SLOW_READS)).toEqual(startup)
      expect(callCounts(LIVE_READS)).toEqual({ getBroadcasts: 3, getJobs: 3 })
    }, 'two polls must re-read offers and jobs but none of the slow reads')
  })

  it('re-reads the slow data once it is five minutes old', async () => {
    render(<FrontendWorkflowProvider><RefreshButton /></FrontendWorkflowProvider>)
    await advance(0)
    await advance(5 * 60_000)

    withPillarContext(PILLAR, () => {
      expect(workerService.getProfile.mock.calls.length).toBe(2)
      expect(workerService.getEarnings.mock.calls.length).toBe(2)
    }, 'slow data older than five minutes must be refreshed by the poll')
  })

  it('reads everything on an explicit refresh', async () => {
    render(<FrontendWorkflowProvider><RefreshButton /></FrontendWorkflowProvider>)
    await advance(0)
    fireEvent.press(screen.getByTestId('explicit-refresh'))
    await advance(0)

    withPillarContext(PILLAR, () => {
      expect(workerService.getProfile.mock.calls.length).toBe(2)
      expect(workerService.getPayoutMethod.mock.calls.length).toBe(2)
    }, 'an explicit refresh is always a full read')
  })
})
