import React from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { Text } from 'react-native'
import { act, render, screen, waitFor } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { isAuthShellBlocking } from '@/lib/auth-loading-gate'
import { resetResourceCacheForTests } from '@/lib/resource-cache/resource-cache'
import {
  RESOURCE_CACHE_STORAGE_KEY,
  flushResourcePersistenceForTests,
  resetResourcePersistenceForTests,
} from '@/lib/resource-cache/resource-cache-persistence'

export const PILLAR = {
  id: 'P327-auth-cold-start-role-cache',
  invariant: 'a relaunch with a restored session routes on the last known role without waiting for the network, an unreachable profile read keeps that role, and only a definitive server answer or sign-out removes it',
  authority: [
    'governance/RULES.md #0 (Edge enforces role guards; the client role only routes)',
    'governance/RULES.md #8 (fallback yes, fake success no)',
    'docs/foundation/pre-app-build-contract.md §4 (offline or network unavailable state)',
  ],
  target: 'apps/mobile/lib/use-auth-role-lookup.ts',
  layer: 'integration',
  siblings: ['P42-auth-session-shell', 'P325-resource-cache-owner-isolation'],
  mutation: 'skip the cachedRole patch before the profiles read — the pending relaunch case stays blocked; drop keepCachedRole on error — the offline relaunch case reports profile_error',
} as const satisfies PillarManifest

const mockGetSession = jest.fn()
const mockMaybeSingle = jest.fn()
const mockFrom = jest.fn(() => ({
  select: () => ({ eq: (_column: string, value: string) => ({ maybeSingle: () => mockMaybeSingle(value) }) }),
}))
let mockAuthStateListener: ((event: AuthChangeEvent, session: Session | null) => void) | null = null
const mockSupabase = {
  auth: {
    getSession: mockGetSession,
    onAuthStateChange: jest.fn((listener: typeof mockAuthStateListener) => {
      mockAuthStateListener = listener
      return { data: { subscription: { unsubscribe: jest.fn() } } }
    }),
    signOut: jest.fn(async () => ({ error: null })),
  },
  from: mockFrom,
}

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('../supabase', () => ({ supabase: mockSupabase }))
jest.mock('../auth-visual-audit', () => {
  const actual = jest.requireActual('../auth-visual-audit') as typeof import('../auth-visual-audit')
  return { ...actual, getLocalVisualAuditRole: () => null }
})
jest.mock('../auth-oauth-runtime', () => ({
  exchangeOAuthCodeForSession: jest.fn(),
  getOAuthRedirectUrl: jest.fn(() => 'nestscout://auth/callback'),
  startAppleOAuthRequest: jest.fn(),
  startGoogleOAuthRequest: jest.fn(),
  subscribeToOAuthCallbackUrls: jest.fn(() => () => undefined),
}))
jest.mock('../push-notifications', () => ({
  addPushNotificationResponseListener: jest.fn(() => ({ remove: jest.fn() })),
}))
jest.mock('../pending-kael-chat-draft', () => ({ clearPendingKaelChatDraft: jest.fn(async () => undefined) }))
jest.mock('../remembered-auth-credentials', () => ({ getRememberedAuthCredentials: jest.fn(async () => null) }))
jest.mock('../services', () => ({ notificationService: {}, workerService: {} }))
const mockUnregisterPushToken = jest.fn()
jest.mock('../use-session-push-registration', () => ({ useSessionPushRegistration: () => mockUnregisterPushToken }))

const { AuthProvider, useAuth } = require('../auth-provider') as typeof import('../auth-provider')

const customerSession = {
  access_token: 'customer-access-token',
  user: { email: 'customer@example.com', id: 'customer_cold_1', user_metadata: {} },
} as Session

function ShellProbe() {
  const auth = useAuth()
  return (
    <>
      <Text testID="shell">{isAuthShellBlocking(auth) ? 'blocked' : 'mounted'}</Text>
      <Text testID="role">{auth.role ?? 'none'}</Text>
      <Text testID="profile-status">{auth.profileStatus}</Text>
    </>
  )
}

function never<T>() {
  return new Promise<T>(() => undefined)
}

async function firstLaunchAsCustomer() {
  mockMaybeSingle.mockResolvedValueOnce({ data: { role: 'customer' }, error: null })
  const view = render(<AuthProvider><ShellProbe /></AuthProvider>)
  await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('customer'))
  await act(async () => { await flushResourcePersistenceForTests() })
  view.unmount()
}

// A relaunch starts with empty memory and whatever survived on disk.
function simulateRelaunch() {
  resetResourceCacheForTests()
  resetResourcePersistenceForTests()
}

beforeEach(async () => {
  mockGetSession.mockReset()
  mockMaybeSingle.mockReset()
  mockAuthStateListener = null
  mockGetSession.mockResolvedValue({ data: { session: customerSession } })
  await AsyncStorage.clear()
})

describe('auth cold start role cache', () => {
  it('routes a relaunch on the cached role while the profile read is still pending', async () => {
    await firstLaunchAsCustomer()
    simulateRelaunch()
    mockMaybeSingle.mockImplementation(() => never())
    render(<AuthProvider><ShellProbe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('customer'))

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('shell')).toHaveTextContent('mounted')
      expect(screen.getByTestId('profile-status')).toHaveTextContent('ready')
    }, 'a relaunch must not wait for the network before routing a known account')
  })

  it('keeps the cached role when the profile read fails on a dead network', async () => {
    await firstLaunchAsCustomer()
    simulateRelaunch()
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'TypeError: Network request failed' } })
    render(<AuthProvider><ShellProbe /></AuthProvider>)
    await waitFor(() => expect(mockMaybeSingle).toHaveBeenCalled())
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('role')).toHaveTextContent('customer')
      expect(screen.getByTestId('profile-status')).toHaveTextContent('ready')
    }, 'an unreachable profile read is not evidence the account lost its role')
  })

  it('still reports profile_error when there is no cached role and the server answers with an error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'internal error' }, status: 500 })
    render(<AuthProvider><ShellProbe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('profile_error'))

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('role')).toHaveTextContent('none')
    }, 'with nothing cached the failure must stay visible, never a guessed role')
  })

  it('drops the cached role when the server says the profile has no role', async () => {
    await firstLaunchAsCustomer()
    simulateRelaunch()
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    render(<AuthProvider><ShellProbe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('profile-status')).toHaveTextContent('profile_missing'))
    await act(async () => { await flushResourcePersistenceForTests() })
    const disk = JSON.parse((await AsyncStorage.getItem(RESOURCE_CACHE_STORAGE_KEY)) ?? '{"entries":{}}')

    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('role')).toHaveTextContent('none')
      expect(disk.entries['auth.role']).toBeUndefined()
    }, 'a definitive server answer must replace the cached role')
  })

  it('removes the cached role from disk on sign-out', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { role: 'customer' }, error: null })
    render(<AuthProvider><ShellProbe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('customer'))
    await act(async () => { await flushResourcePersistenceForTests() })
    const beforeSignOut = await AsyncStorage.getItem(RESOURCE_CACHE_STORAGE_KEY)

    await act(async () => {
      mockAuthStateListener?.('SIGNED_OUT', null)
      await flushResourcePersistenceForTests()
    })
    const afterSignOut = await AsyncStorage.getItem(RESOURCE_CACHE_STORAGE_KEY)

    withPillarContext(PILLAR, () => {
      expect(beforeSignOut).toContain('auth.role')
      expect(afterSignOut).toBeNull()
    }, 'sign-out must leave no cached role on the device')
  })
})
