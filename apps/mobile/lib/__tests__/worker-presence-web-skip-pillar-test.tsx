import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { AppState, Platform, Pressable } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P248-worker-presence-release-client-only',
  invariant: 'Worker presence writes (matching heartbeat and activity minute) are sent only by a released iOS/Android client; a web client, which mobile-api always refuses with 426, sends none',
  authority: ['supabase/functions/mobile-api/_shared/http/request-runtime.ts enforceStage1ClientCompatibility', 'governance/RULES.md #8 (no silent failure loops)'],
  target: 'apps/mobile/lib/frontend-workflow/use-worker-board-actions.ts',
  layer: 'integration',
  siblings: ['P221-admin-activation-audit-isolation'],
  mutation: 'drop the release-client guard from the heartbeat or the activity-minute interval; the web case records a presence write and turns red',
} as const satisfies PillarManifest

jest.mock('../auth-provider', () => ({
  useAuth: () => ({
    role: 'worker',
    session: { user: { id: 'worker_presence_1' } },
  }),
}))

jest.mock('../supabase', () => ({ supabase: null }))

jest.mock('../app-language', () => ({
  useAppLanguage: () => 'vi',
}))

jest.mock('../realtime', () => ({
  subscribeToJobStatus: jest.fn(() => null),
  subscribeToWorkerBroadcasts: jest.fn(() => null),
  subscribeToWorkerEarnings: jest.fn(() => null),
}))

jest.mock('../services', () => ({
  customerProfileService: {},
  jobService: {},
  kaelMemoryService: {},
  notificationService: {
    list: jest.fn(async () => ({ data: { notifications: [], unread_count: 0 }, status: 200, success: true })),
  },
  workerService: {
    getBroadcasts: jest.fn(async () => ({ data: { broadcasts: [] }, status: 200, success: true })),
    getEarnings: jest.fn(async () => ({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })),
    getJobs: jest.fn(async () => ({ data: { jobs: [] }, status: 200, success: true })),
    getPayoutMethod: jest.fn(async () => ({ data: { payout_method: null }, status: 200, success: true })),
    getPerformanceInsights: jest.fn(async () => ({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })),
    getProfile: jest.fn(async () => ({ code: 'UNAVAILABLE', error: 'Unavailable', status: 503, success: false })),
    listWithdrawalRequests: jest.fn(async () => ({ data: { requests: [] }, status: 200, success: true })),
    recordActiveMinute: jest.fn(async () => ({ code: 'CLIENT_UPDATE_REQUIRED', error: 'x', status: 426, success: false })),
    sendMatchingHeartbeat: jest.fn(async () => ({ code: 'CLIENT_UPDATE_REQUIRED', error: 'x', status: 426, success: false })),
    updateAvailability: jest.fn(),
  },
}))

import { getMobileApiAuthHeaders } from '../api'
import { FrontendWorkflowProvider, useFrontendWorkflow } from '../frontend-workflow-provider'

const { workerService: mockWorkerService } = jest.requireMock('../services') as {
  workerService: Record<'recordActiveMinute' | 'sendMatchingHeartbeat', jest.Mock>
}

function RefreshProbe() {
  const { actions } = useFrontendWorkflow()
  return <Pressable onPress={() => { void actions.workerRefresh() }} testID="presence-refresh" />
}

const originalPlatform = Platform.OS
const originalAppState = AppState.currentState

async function renderForPlatform(platform: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform })
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
  const view = render(
    <FrontendWorkflowProvider>
      <RefreshProbe />
    </FrontendWorkflowProvider>,
  )
  await act(async () => {
    fireEvent.press(screen.getByTestId('presence-refresh'))
    jest.advanceTimersByTime(60_000)
    await Promise.resolve()
  })
  return view
}

describe('Worker presence writes are limited to released clients', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockWorkerService.recordActiveMinute.mockClear()
    mockWorkerService.sendMatchingHeartbeat.mockClear()
  })

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform })
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: originalAppState })
    jest.useRealTimers()
  })

  it('sends no heartbeat and no activity minute from a web client', async () => {
    const view = await renderForPlatform('web')
    try {
      withPillarContext(PILLAR, () => {
        expect(mockWorkerService.sendMatchingHeartbeat).not.toHaveBeenCalled()
        expect(mockWorkerService.recordActiveMinute).not.toHaveBeenCalled()
      }, 'web client')
    } finally {
      view.unmount()
    }
  })

  it.each(['ios', 'android'] as const)('keeps both presence writes on %s', async (platform) => {
    const view = await renderForPlatform(platform)
    try {
      withPillarContext(PILLAR, () => {
        expect(mockWorkerService.sendMatchingHeartbeat).toHaveBeenCalled()
        expect(mockWorkerService.recordActiveMinute).toHaveBeenCalledTimes(1)
      }, `${platform} client`)
    } finally {
      view.unmount()
    }
  })
})

describe('The release platform header uses the same client decision', () => {
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform })
  })

  it.each([
    ['web', undefined],
    ['ios', 'ios'],
    ['android', 'android'],
  ] as const)('%s sends x-client-platform=%s', async (platform, expected) => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform })
    const headers = await getMobileApiAuthHeaders()
    withPillarContext(PILLAR, () => {
      expect(headers['x-client-platform']).toBe(expected)
    }, 'header and presence guard must agree on which clients can write')
  })
})
