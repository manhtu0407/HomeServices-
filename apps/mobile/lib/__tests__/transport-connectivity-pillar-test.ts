const mockFetch = jest.fn()

jest.mock('../runtime-config', () => ({
  mobileRuntimeConfig: {
    apiBaseUrl: 'https://api.test/functions/v1/mobile-api',
    supabasePublishableKey: 'publishable-test',
    runtimeBuildInfo: {},
  },
}))

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
    },
  },
}))

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { api } from '../api'
import { AppState } from 'react-native'
import { getConnectivity, onReconnect, resetConnectivityForTests, setRecoveryProbe } from '../connectivity'

export const PILLAR = {
  id: 'P326-transport-connectivity',
  invariant: 'two consecutive transport failures mark the app offline, an offline GET makes one attempt instead of three, any server response restores online and fires reconnect, and while offline in the foreground one registered probe retries on a 5 s to 30 s backoff until the link answers',
  authority: [
    'governance/RULES.md #10 (timeout and bounded retry)',
    'docs/foundation/pre-app-build-contract.md §4 (offline or network unavailable state)',
  ],
  target: 'apps/mobile/lib/connectivity.ts',
  layer: 'unit',
  siblings: ['P325-resource-cache-owner-isolation'],
  mutation: 'remove the isConnectivityOffline() check from the api.ts retry condition — the offline single-attempt case turns red; or drop the scheduleRecoveryProbe call in setState — the recovery case stays offline',
} as const satisfies PillarManifest

function networkFailure() {
  return Promise.reject(new TypeError('Network request failed'))
}

function okResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    body: null,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  mockFetch.mockReset()
  globalThis.fetch = mockFetch as unknown as typeof fetch
  resetConnectivityForTests()
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  resetConnectivityForTests()
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe('transport connectivity', () => {
  it('goes offline after two failed attempts and stops retrying the same GET', async () => {
    mockFetch.mockImplementation(networkFailure)
    const pending = api.get('/me/jobs/history')
    await jest.runAllTimersAsync()
    const result = await pending

    withPillarContext(PILLAR, () => {
      expect(result).toMatchObject({ success: false, code: 'NETWORK_ERROR' })
      expect(getConnectivity()).toBe('offline')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    }, 'the third attempt must be skipped once the transport is known down')
  })

  it('makes a single attempt while offline', async () => {
    mockFetch.mockImplementation(networkFailure)
    const first = api.get('/me/jobs/history')
    await jest.runAllTimersAsync()
    await first
    mockFetch.mockClear()

    const second = api.get('/me/membership')
    await jest.runAllTimersAsync()
    await second

    withPillarContext(PILLAR, () => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    }, 'an offline GET must fail fast instead of waiting three timeouts')
  })

  it('returns online and fires reconnect on the next server response', async () => {
    const reconnect = jest.fn()
    const unsubscribe = onReconnect(reconnect)
    mockFetch.mockImplementation(networkFailure)
    const failing = api.get('/me/jobs/history')
    await jest.runAllTimersAsync()
    await failing

    mockFetch.mockImplementation(() => okResponse({ ok: true }))
    const recovering = api.get('/me/jobs/history')
    await jest.runAllTimersAsync()
    const result = await recovering
    unsubscribe()

    withPillarContext(PILLAR, () => {
      expect(result.success).toBe(true)
      expect(getConnectivity()).toBe('online')
      expect(reconnect).toHaveBeenCalledTimes(1)
    }, 'reconnect must fire exactly once on the offline -> online edge')
  })

  it('probes on a backoff while offline and recovers without any screen asking', async () => {
    const reconnect = jest.fn()
    const unsubscribe = onReconnect(reconnect)
    mockFetch.mockImplementation(networkFailure)
    const failing = api.get('/me/jobs/history')
    await jest.runAllTimersAsync()
    await failing
    const probe = jest.fn(() => api.get('/notifications'))
    const unregister = setRecoveryProbe(probe)

    await jest.advanceTimersByTimeAsync(5_000)
    const afterFirstTick = probe.mock.calls.length
    await jest.advanceTimersByTimeAsync(9_000)
    const beforeSecondTick = probe.mock.calls.length
    mockFetch.mockImplementation(() => okResponse({ notifications: [], unread_count: 0 }))
    await jest.advanceTimersByTimeAsync(1_000)
    const connectivityAfterRecovery = getConnectivity()
    await jest.advanceTimersByTimeAsync(60_000)
    unregister()
    unsubscribe()

    withPillarContext(PILLAR, () => {
      expect(afterFirstTick).toBe(1)
      expect(beforeSecondTick).toBe(1)
      expect(connectivityAfterRecovery).toBe('online')
      expect(reconnect).toHaveBeenCalledTimes(1)
      expect(probe).toHaveBeenCalledTimes(2)
    }, 'the probe fires at 5 s, then 10 s later, and stops once the server answers')
  })

  it('starts probing the moment the transport drops when a probe is already registered', async () => {
    const probe = jest.fn()
    const unregister = setRecoveryProbe(probe)
    mockFetch.mockImplementation(networkFailure)
    const failing = api.get('/me/jobs/history')
    await jest.advanceTimersByTimeAsync(20_000)
    await failing
    const offline = getConnectivity()
    await jest.advanceTimersByTimeAsync(40_000)
    unregister()

    withPillarContext(PILLAR, () => {
      expect(offline).toBe('offline')
      expect(probe.mock.calls.length).toBeGreaterThanOrEqual(2)
    }, 'going offline must arm the probe, not only registering one')
  })

  it('spends no request on the probe while the app is in the background', async () => {
    const appState = AppState as unknown as { currentState: string }
    const previous = appState.currentState
    appState.currentState = 'background'
    mockFetch.mockImplementation(networkFailure)
    const failing = api.get('/me/jobs/history')
    await jest.runAllTimersAsync()
    await failing
    const probe = jest.fn()
    const unregister = setRecoveryProbe(probe)
    await jest.advanceTimersByTimeAsync(120_000)
    unregister()
    appState.currentState = previous

    withPillarContext(PILLAR, () => {
      expect(getConnectivity()).toBe('offline')
      expect(probe).not.toHaveBeenCalled()
    }, 'a backgrounded phone must not wake the radio')
  })

  it('stays online after a single transient failure', async () => {
    let calls = 0
    mockFetch.mockImplementation(() => (++calls === 1 ? networkFailure() : okResponse({ ok: true })))
    const pending = api.get('/me/jobs/history')
    await jest.runAllTimersAsync()
    const result = await pending

    withPillarContext(PILLAR, () => {
      expect(result.success).toBe(true)
      expect(getConnectivity()).toBe('online')
    }, 'one blip on 3G must not flip the app offline')
  })
})
