import React from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Session } from '@supabase/supabase-js'
import { Text } from 'react-native'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { isAuthShellBlocking } from '@/lib/auth-loading-gate'
import { reportTransportFailure } from '@/lib/connectivity'

export const PILLAR = {
  id: 'P333-session-offline-screen',
  invariant: 'a restored session whose role cannot be read because the server is unreachable keeps the session, holds the route shell instead of bouncing to the Login Gate, shows an offline screen with retry and sign-out, and retries on its own until the role arrives; a server that answers with an error still reports profile_error',
  authority: [
    'governance/RULES.md #8 (fallback yes, fake success no)',
    'docs/foundation/pre-app-build-contract.md §4 (offline or network unavailable state)',
  ],
  target: 'apps/mobile/components/ui/session-offline-screen.tsx',
  layer: 'integration',
  siblings: ['P327-auth-cold-start-role-cache', 'P326-transport-connectivity'],
  mutation: 'drop the status === 0 branch in use-auth-role-lookup — the unreachable case reports profile_error and the screen never shows; remove network_unavailable from isAuthShellBlocking — the shell case lets the guards redirect; or stop the gate registering its recovery probe — the self-retry case never reads again',
} as const satisfies PillarManifest

const mockGetSession = jest.fn()
const mockMaybeSingle = jest.fn()
const mockSignOut = jest.fn(async () => ({ error: null }))
const mockSupabase = {
  auth: {
    getSession: mockGetSession,
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    signOut: mockSignOut,
  },
  from: jest.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: () => mockMaybeSingle() }) }),
  })),
}

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))
jest.mock('@/lib/supabase', () => ({ supabase: mockSupabase }))
jest.mock('@/lib/auth-visual-audit', () => {
  const actual = jest.requireActual('@/lib/auth-visual-audit') as typeof import('@/lib/auth-visual-audit')
  return { ...actual, getLocalVisualAuditRole: () => null }
})
jest.mock('@/lib/auth-oauth-runtime', () => ({
  exchangeOAuthCodeForSession: jest.fn(),
  getOAuthRedirectUrl: jest.fn(() => 'nestscout://auth/callback'),
  startAppleOAuthRequest: jest.fn(),
  startGoogleOAuthRequest: jest.fn(),
  subscribeToOAuthCallbackUrls: jest.fn(() => () => undefined),
}))
jest.mock('@/lib/push-notifications', () => ({
  addPushNotificationResponseListener: jest.fn(() => ({ remove: jest.fn() })),
}))
jest.mock('@/lib/pending-kael-chat-draft', () => ({ clearPendingKaelChatDraft: jest.fn(async () => undefined) }))
jest.mock('@/lib/remembered-auth-credentials', () => ({ getRememberedAuthCredentials: jest.fn(async () => null) }))
jest.mock('@/lib/services', () => ({ notificationService: {}, workerService: {} }))
const mockUnregisterPushToken = jest.fn()
jest.mock('@/lib/use-session-push-registration', () => ({ useSessionPushRegistration: () => mockUnregisterPushToken }))

const { AuthProvider, useAuth } = require('@/lib/auth-provider') as typeof import('@/lib/auth-provider')
const { SessionOfflineGate } = require('../session-offline-screen') as typeof import('../session-offline-screen')

const session = {
  access_token: 'customer-access-token',
  user: { email: 'customer@example.com', id: 'customer_offline_1', user_metadata: {} },
} as Session

const unreachable = { data: null, error: { message: 'TypeError: Network request failed' }, status: 0 }

function Probe() {
  const auth = useAuth()
  return (
    <>
      <Text testID="shell">{isAuthShellBlocking(auth) ? 'blocked' : 'mounted'}</Text>
      <Text testID="role">{auth.role ?? 'none'}</Text>
      <Text testID="profile-status">{auth.profileStatus}</Text>
      <Text testID="has-session">{auth.session ? 'yes' : 'no'}</Text>
      <SessionOfflineGate />
    </>
  )
}

beforeEach(async () => {
  mockGetSession.mockReset()
  mockMaybeSingle.mockReset()
  mockSignOut.mockClear()
  mockGetSession.mockResolvedValue({ data: { session } })
  await AsyncStorage.clear()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('session offline screen', () => {
  it('keeps the session and holds the shell when the server cannot be reached', async () => {
    mockMaybeSingle.mockResolvedValue(unreachable)
    render(<Probe />, { wrapper: AuthProvider })
    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('network_unavailable'))

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('has-session')).toHaveTextContent('yes')
      expect(screen.getByTestId('role')).toHaveTextContent('none')
      expect(screen.getByTestId('shell')).toHaveTextContent('blocked')
      expect(screen.getByTestId('session-offline-screen')).toBeTruthy()
      expect(screen.getByText('Chưa kết nối được máy chủ')).toBeTruthy()
    }, 'an unreachable server must not look like a sign-out')
  })

  it('still reports profile_error when the server answers with an error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'internal error' }, status: 500 })
    render(<Probe />, { wrapper: AuthProvider })
    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('profile_error'))

    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('session-offline-screen')).toBeNull()
      expect(screen.getByTestId('shell')).toHaveTextContent('mounted')
    }, 'only a missing response is offline; a server error stays an error')
  })

  it('retries on tap and gets out of the way once the role arrives', async () => {
    mockMaybeSingle.mockResolvedValue(unreachable)
    render(<Probe />, { wrapper: AuthProvider })
    await waitFor(() => expect(screen.getByTestId('session-offline-screen')).toBeTruthy())
    mockMaybeSingle.mockResolvedValue({ data: { role: 'customer' }, error: null, status: 200 })
    fireEvent.press(screen.getByTestId('session-offline-retry'))
    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('customer'))

    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('session-offline-screen')).toBeNull()
      expect(screen.getByTestId('shell')).toHaveTextContent('mounted')
    })
  })

  it('signs out from the offline screen', async () => {
    mockMaybeSingle.mockResolvedValue(unreachable)
    render(<Probe />, { wrapper: AuthProvider })
    await waitFor(() => expect(screen.getByTestId('session-offline-screen')).toBeTruthy())
    fireEvent.press(screen.getByTestId('session-offline-sign-out'))
    await waitFor(() => expect(screen.getByTestId('has-session')).toHaveTextContent('no'))

    withPillarContext(PILLAR, () => {
      expect(mockSignOut).toHaveBeenCalled()
    })
  })

  it('retries by itself while offline until the role can be read', async () => {
    mockMaybeSingle.mockResolvedValue(unreachable)
    render(<Probe />, { wrapper: AuthProvider })
    await waitFor(() => expect(screen.getByTestId('session-offline-screen')).toBeTruthy())
    // Only the probe clock is faked; the auth bootstrap above ran on real timers.
    jest.useFakeTimers()
    reportTransportFailure()
    reportTransportFailure()
    const readsBeforeProbe = mockMaybeSingle.mock.calls.length
    mockMaybeSingle.mockResolvedValue({ data: { role: 'customer' }, error: null, status: 200 })
    await jest.advanceTimersByTimeAsync(5_000)
    jest.useRealTimers()
    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('customer'))

    withPillarContext(PILLAR, () => {
      expect(mockMaybeSingle.mock.calls.length).toBeGreaterThan(readsBeforeProbe)
      expect(screen.queryByTestId('session-offline-screen')).toBeNull()
    }, 'the screen must recover without a tap once the link returns')
  })
})
