import React, { useState } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { Pressable, Text } from 'react-native'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { isAuthShellBlocking } from '@/lib/auth-loading-gate'

export const PILLAR = {
  id: 'P42-auth-session-shell',
  invariant:
    'a known same-account role keeps the routed shell mounted during auth refresh, while an account change blocks until its own role resolves',
  authority: [
    'governance/protocols/frontend-test.md G2-G3 (state survives foreground refresh)',
    'docs/architecture/code-ownership-map.md (Auth And Role Gate)',
  ],
  target: 'apps/mobile/lib/auth-provider.tsx',
  layer: 'integration',
  siblings: ['P09-native-ios-liquid-tabs'],
  mutation:
    'set loading=true during a same-account lookup — the pending refresh case blocks; dedupe by user id alone — the returning-account case skips its fresh lookup',
} as const satisfies PillarManifest

const mockGetSession = jest.fn()
const mockSignInWithPassword = jest.fn()
const mockStartAppleOAuthRequest = jest.fn()
const mockStartGoogleOAuthRequest = jest.fn()
const mockMaybeSingle = jest.fn()
const mockEq = jest.fn((_column: string, value: string) => ({
  maybeSingle: () => mockMaybeSingle(value),
}))
const mockSelect = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))
const mockUnsubscribe = jest.fn()
const mockUnregisterPushTokenForSession = jest.fn()
let mockAuthStateListener: ((event: AuthChangeEvent, session: Session | null) => void) | null = null
const mockOnAuthStateChange = jest.fn((listener: typeof mockAuthStateListener) => {
  mockAuthStateListener = listener
  return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
})

const customerSession = {
  access_token: 'customer-access-token',
  user: {
    email: 'customer@example.com',
    id: 'customer_test_1',
    user_metadata: {},
  },
} as Session

const workerSession = {
  access_token: 'worker-access-token',
  user: {
    email: 'worker@example.com',
    id: 'worker_test_2',
    user_metadata: {},
  },
} as Session

const mockSupabase = {
  auth: {
    getSession: mockGetSession,
    onAuthStateChange: mockOnAuthStateChange,
    signInWithPassword: mockSignInWithPassword,
  },
  from: mockFrom,
}

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('../auth-oauth-runtime', () => {
  const actual = jest.requireActual('../auth-oauth-runtime') as typeof import('../auth-oauth-runtime')
  return {
    ...actual,
    startAppleOAuthRequest: (...args: unknown[]) => mockStartAppleOAuthRequest(...args),
    startGoogleOAuthRequest: (...args: unknown[]) => mockStartGoogleOAuthRequest(...args),
  }
})

jest.mock('../supabase', () => ({
  supabase: mockSupabase,
}))

jest.mock('../auth-visual-audit', () => {
  const actual = jest.requireActual('../auth-visual-audit') as typeof import('../auth-visual-audit')
  return { ...actual, getLocalVisualAuditRole: () => null }
})

jest.mock('../push-notifications', () => ({
  addPushNotificationResponseListener: jest.fn(() => ({ remove: jest.fn() })),
}))

jest.mock('../pending-kael-chat-draft', () => ({
  clearPendingKaelChatDraft: jest.fn(async () => undefined),
}))

jest.mock('../remembered-auth-credentials', () => ({
  getRememberedAuthCredentials: jest.fn(async () => null),
}))

jest.mock('../services', () => ({
  workerService: { submitApplication: jest.fn() },
}))

jest.mock('../use-session-push-registration', () => ({
  useSessionPushRegistration: () => mockUnregisterPushTokenForSession,
}))

const { AuthProvider, useAuth } = require('../auth-provider') as typeof import('../auth-provider')

function AuthShellHarness() {
  const auth = useAuth()
  const shellBlocking = isAuthShellBlocking(auth)

  return (
    <>
      <Text testID="auth-shell-state">{shellBlocking ? 'blocked' : 'mounted'}</Text>
      <Text testID="auth-session-id">{auth.session?.user.id ?? 'none'}</Text>
      <Text testID="auth-role">{auth.role ?? 'none'}</Text>
      <Text testID="auth-loading">{auth.loading ? 'loading' : 'ready'}</Text>
      <Text testID="auth-profile-status">{auth.profileStatus}</Text>
      <Pressable testID="refresh-profile" onPress={() => void auth.refreshProfile()}>
        <Text>refresh</Text>
      </Pressable>
    </>
  )
}

function AuthBindingHarness() {
  const auth = useAuth()
  const [result, setResult] = useState('idle')

  return (
    <>
      <Text testID="auth-binding-result">{result}</Text>
      <Text testID="auth-binding-session">{auth.session?.user.id ?? 'none'}</Text>
      <Text testID="auth-binding-role">{auth.role ?? 'none'}</Text>
      <Pressable
        testID="auth-binding-worker-email-password"
        onPress={() => {
          void auth.signInWithPassword('worker@example.com', 'secret123').then((nextResult) => {
            setResult(nextResult.success ? `worker-success:${nextResult.role ?? 'none'}` : 'worker-denied')
          })
        }}
      >
        <Text>worker email password</Text>
      </Pressable>
      <Pressable
        testID="auth-binding-worker-invalid-password"
        onPress={() => {
          void auth.signInWithPassword('worker@example.com', 'secret123').then((nextResult) => {
            setResult(nextResult.success ? 'worker-unexpected-success' : 'worker-denied')
          })
        }}
      >
        <Text>worker invalid password</Text>
      </Pressable>
      <Pressable
        testID="auth-binding-customer-google"
        onPress={() => {
          void auth.signInWithGoogle().then((nextResult) => setResult(nextResult.success ? 'provider-success' : 'provider-denied'))
        }}
      >
        <Text>customer Google</Text>
      </Pressable>
      <Pressable
        testID="auth-binding-customer-apple"
        onPress={() => {
          void auth.signInWithApple().then((nextResult) => setResult(nextResult.success ? 'provider-success' : 'provider-denied'))
        }}
      >
        <Text>customer Apple</Text>
      </Pressable>
    </>
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

async function renderKnownCustomer() {
  render(
    <AuthProvider>
      <AuthShellHarness />
    </AuthProvider>,
  )
  await waitFor(() => {
    expect(screen.getByTestId('auth-role')).toHaveTextContent('customer')
    expect(screen.getByTestId('auth-shell-state')).toHaveTextContent('mounted')
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  mockGetSession.mockReset().mockResolvedValue({ data: { session: customerSession } })
  mockSignInWithPassword.mockReset().mockResolvedValue({ data: { session: customerSession }, error: null })
  mockStartAppleOAuthRequest.mockReset().mockResolvedValue({ success: true })
  mockStartGoogleOAuthRequest.mockReset().mockResolvedValue({ success: true })
  mockMaybeSingle.mockReset().mockImplementation((userId: string) => Promise.resolve({
    data: { role: userId === workerSession.user.id ? 'worker' : 'customer' },
    error: null,
  }))
  mockEq.mockReset().mockImplementation((_column: string, value: string) => ({
    maybeSingle: () => mockMaybeSingle(value),
  }))
  mockSelect.mockClear()
  mockFrom.mockClear()
  mockOnAuthStateChange.mockClear()
  mockUnsubscribe.mockClear()
  mockUnregisterPushTokenForSession.mockClear()
  mockAuthStateListener = null
})

describe('auth session shell gate', () => {
  it.each([
    {
      expected: true,
      input: { loading: true, profileStatus: 'idle' as const, role: null, session: null },
      name: 'bootstrap before auth resolves',
    },
    {
      expected: false,
      input: { guestMode: true, loading: true, profileStatus: 'idle' as const, role: null, session: null },
      name: 'guest mode while auth is loading',
    },
    {
      expected: true,
      input: { loading: true, profileStatus: 'loading' as const, role: null, session: customerSession },
      name: 'signed-in session before role resolves',
    },
    {
      expected: false,
      input: { loading: true, profileStatus: 'loading' as const, role: 'customer' as const, session: customerSession },
      name: 'same-account soft role refresh',
    },
  ])('$name', ({ expected, input }) => {
    withPillarContext(PILLAR, () => {
      expect(isAuthShellBlocking(input)).toBe(expected)
    })
  })

  it('auth customer public providers starts Google and Apple through the OAuth boundary', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    render(
      <AuthProvider>
        <AuthBindingHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('auth-binding-customer-google'))
    await waitFor(() => {
      withPillarContext(PILLAR, () => {
        expect(screen.getByTestId('auth-binding-result')).toHaveTextContent('provider-success')
        expect(mockStartGoogleOAuthRequest).toHaveBeenCalledTimes(1)
      }, 'Customer Google provider must use the shared OAuth boundary')
    })

    fireEvent.press(screen.getByTestId('auth-binding-customer-apple'))
    await waitFor(() => {
      withPillarContext(PILLAR, () => {
        expect(screen.getByTestId('auth-binding-result')).toHaveTextContent('provider-success')
        expect(mockStartAppleOAuthRequest).toHaveBeenCalledTimes(1)
      }, 'Customer Apple provider must use the shared OAuth boundary')
    })

    act(() => {
      mockAuthStateListener?.('SIGNED_IN', customerSession)
    })
    await waitFor(() => {
      expect(screen.getByTestId('auth-binding-session')).toHaveTextContent('customer_test_1')
      expect(screen.getByTestId('auth-binding-role')).toHaveTextContent('customer')
    })
  })

  it('auth customer public providers denies an OAuth start without retaining a session', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    mockStartGoogleOAuthRequest.mockResolvedValueOnce({
      success: false,
      error: 'Không thể mở đăng nhập Google. Vui lòng thử lại sau.',
    })
    render(
      <AuthProvider>
        <AuthBindingHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('auth-binding-customer-google'))
    await waitFor(() => {
      withPillarContext(PILLAR, () => {
        expect(screen.getByTestId('auth-binding-result')).toHaveTextContent('provider-denied')
        expect(screen.getByTestId('auth-binding-session')).toHaveTextContent('none')
        expect(screen.getByTestId('auth-binding-role')).toHaveTextContent('none')
        expect(screen.getByTestId('auth-binding-result')).not.toHaveTextContent('provider-secret')
        expect(mockStartGoogleOAuthRequest).toHaveBeenCalledTimes(1)
      }, 'A refused Customer provider start must remain signed out')
    })
  })

  it('auth worker email password signs in and resolves the authenticated Worker role', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    mockSignInWithPassword.mockResolvedValueOnce({ data: { session: workerSession }, error: null })
    render(
      <AuthProvider>
        <AuthBindingHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('auth-binding-worker-email-password'))
    await waitFor(() => {
      withPillarContext(PILLAR, () => {
        expect(screen.getByTestId('auth-binding-result')).toHaveTextContent('worker-success:worker')
        expect(screen.getByTestId('auth-binding-session')).toHaveTextContent('worker_test_2')
        expect(screen.getByTestId('auth-binding-role')).toHaveTextContent('worker')
        expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'worker@example.com', password: 'secret123' })
      }, 'Worker email/password success must resolve the Worker role before routing')
    })
  })

  it('auth worker email password denies invalid credentials without retaining a session', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    })
    render(
      <AuthProvider>
        <AuthBindingHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('auth-binding-worker-invalid-password'))
    await waitFor(() => {
      withPillarContext(PILLAR, () => {
        expect(screen.getByTestId('auth-binding-result')).toHaveTextContent('worker-denied')
        expect(screen.getByTestId('auth-binding-session')).toHaveTextContent('none')
        expect(screen.getByTestId('auth-binding-role')).toHaveTextContent('none')
        expect(screen.getByTestId('auth-binding-result')).not.toHaveTextContent('Invalid login credentials')
        expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'worker@example.com', password: 'secret123' })
      }, 'Invalid Worker credentials must fail closed without retaining auth state')
    })
  })

  it('keeps the routed shell mounted while refreshProfile is in flight', async () => {
    await renderKnownCustomer()
    const pendingRole = deferred<{ data: { role: 'customer' }; error: null }>()
    mockMaybeSingle.mockImplementationOnce(() => pendingRole.promise)

    fireEvent.press(screen.getByTestId('refresh-profile'))

    await waitFor(() => {
      withPillarContext(PILLAR, () => {
        expect(screen.getByTestId('auth-profile-status')).toHaveTextContent('loading')
        expect(screen.getByTestId('auth-loading')).toHaveTextContent('ready')
        expect(screen.getByTestId('auth-role')).toHaveTextContent('customer')
        expect(screen.getByTestId('auth-shell-state')).toHaveTextContent('mounted')
      })
    })

    pendingRole.resolve({ data: { role: 'customer' }, error: null })
    await waitFor(() => expect(screen.getByTestId('auth-profile-status')).toHaveTextContent('ready'))
  })

  it.each(['SIGNED_IN', 'TOKEN_REFRESHED'] as const)(
    'keeps the known role mounted for same-account %s',
    async (event) => {
      await renderKnownCustomer()
      const roleLookupCount = mockMaybeSingle.mock.calls.length

      act(() => {
        mockAuthStateListener?.(event, customerSession)
      })

      withPillarContext(PILLAR, () => {
        expect(screen.getByTestId('auth-role')).toHaveTextContent('customer')
        expect(screen.getByTestId('auth-shell-state')).toHaveTextContent('mounted')
        expect(mockMaybeSingle).toHaveBeenCalledTimes(roleLookupCount)
      })
    },
  )

  it('clears the previous role and blocks while a different account resolves', async () => {
    await renderKnownCustomer()
    const pendingRole = deferred<{ data: { role: 'worker' }; error: null }>()
    mockMaybeSingle.mockImplementationOnce(() => pendingRole.promise)

    act(() => {
      mockAuthStateListener?.('SIGNED_IN', workerSession)
    })

    await waitFor(() => {
      withPillarContext(PILLAR, () => {
        expect(screen.getByTestId('auth-session-id')).toHaveTextContent('worker_test_2')
        expect(screen.getByTestId('auth-role')).toHaveTextContent('none')
        expect(screen.getByTestId('auth-loading')).toHaveTextContent('loading')
        expect(screen.getByTestId('auth-shell-state')).toHaveTextContent('blocked')
      })
    })

    pendingRole.resolve({ data: { role: 'worker' }, error: null })
    await waitFor(() => {
      expect(screen.getByTestId('auth-role')).toHaveTextContent('worker')
      expect(screen.getByTestId('auth-shell-state')).toHaveTextContent('mounted')
    })
  })

  it('starts a fresh lookup when the same account returns after signing out', async () => {
    await renderKnownCustomer()
    const roleLookupCount = mockMaybeSingle.mock.calls.length
    const staleRole = deferred<{ data: { role: 'customer' }; error: null }>()
    mockMaybeSingle.mockImplementationOnce(() => staleRole.promise)

    fireEvent.press(screen.getByTestId('refresh-profile'))
    await waitFor(() => {
      expect(screen.getByTestId('auth-profile-status')).toHaveTextContent('loading')
      expect(mockMaybeSingle).toHaveBeenCalledTimes(roleLookupCount + 1)
    })

    act(() => {
      mockAuthStateListener?.('SIGNED_OUT', null)
      mockAuthStateListener?.('SIGNED_IN', customerSession)
    })

    await waitFor(() => {
      withPillarContext(PILLAR, () => {
        expect(mockMaybeSingle).toHaveBeenCalledTimes(roleLookupCount + 2)
        expect(screen.getByTestId('auth-role')).toHaveTextContent('customer')
        expect(screen.getByTestId('auth-shell-state')).toHaveTextContent('mounted')
      })
    })

    staleRole.resolve({ data: { role: 'customer' }, error: null })
    await waitFor(() => expect(screen.getByTestId('auth-role')).toHaveTextContent('customer'))
  })
})
