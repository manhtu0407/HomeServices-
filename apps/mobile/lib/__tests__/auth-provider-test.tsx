import React, { useEffect, useState } from 'react'
import { Pressable, Text } from 'react-native'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { AuthRetryableFetchError } from '@supabase/supabase-js'

const mockPushRoute = jest.fn()
const mockUnsubscribe = jest.fn()
const mockGetSession = jest.fn()
const mockSignInWithPassword = jest.fn()
const mockSignUp = jest.fn()
const mockResetPasswordForEmail = jest.fn()
const mockUpdateUser = jest.fn()
const mockSignOut = jest.fn()
const mockSetupPushNotifications = jest.fn()
const mockUnregisterPushNotifications = jest.fn()
const mockMaybeSingle = jest.fn()
const mockEq = jest.fn((_column: string, _value: string) => ({ maybeSingle: mockMaybeSingle }))
const mockSelect = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))
const mockClearPendingKaelChatDraft = jest.fn(async (_ownerId: string) => undefined)
const mockSubmitWorkerApplication = jest.fn()
const mockGetRememberedAuthCredentials = jest.fn()
const mockGetLocalVisualAuditRole = jest.fn<ReturnType<typeof import('../auth-visual-audit').getLocalVisualAuditRole>, Parameters<typeof import('../auth-visual-audit').getLocalVisualAuditRole>>()
let mockAuthStateListener: ((event: string, session: typeof mockSession | null) => void) | null = null
const mockOnAuthStateChange = jest.fn((listener: typeof mockAuthStateListener) => {
  mockAuthStateListener = listener
  return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
})

const mockSession = {
  access_token: 'customer-access-token',
  user: {
    email: 'customer@example.com',
    id: 'customer_test_1',
    user_metadata: {},
  },
}

const mockSupabase = {
  auth: {
    getSession: mockGetSession,
    onAuthStateChange: mockOnAuthStateChange,
    resetPasswordForEmail: mockResetPasswordForEmail,
    signInWithPassword: mockSignInWithPassword,
    signUp: mockSignUp,
    signOut: mockSignOut,
    updateUser: mockUpdateUser,
  },
  from: mockFrom,
}

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPushRoute }),
}))

jest.mock('../supabase', () => ({
  supabase: mockSupabase,
}))

jest.mock('../auth-visual-audit', () => {
  const actual = jest.requireActual('../auth-visual-audit') as typeof import('../auth-visual-audit')
  return {
    ...actual,
    getLocalVisualAuditRole: (...args: Parameters<typeof actual.getLocalVisualAuditRole>) => mockGetLocalVisualAuditRole(...args),
  }
})

jest.mock('../push-notifications', () => ({
  addPushNotificationResponseListener: jest.fn(() => ({ remove: jest.fn() })),
  setupPushNotifications: (...args: unknown[]) => mockSetupPushNotifications(...args),
  unregisterPushNotifications: (...args: unknown[]) => mockUnregisterPushNotifications(...args),
}))

jest.mock('../pending-kael-chat-draft', () => ({
  clearPendingKaelChatDraft: (ownerId: string) => mockClearPendingKaelChatDraft(ownerId),
}))

jest.mock('../remembered-auth-credentials', () => ({
  getRememberedAuthCredentials: (...args: unknown[]) => mockGetRememberedAuthCredentials(...args),
}))

jest.mock('../services', () => ({
  workerService: {
    submitApplication: (...args: unknown[]) => mockSubmitWorkerApplication(...args),
  },
}))

const { AuthProvider, useAuth } = require('../auth-provider') as typeof import('../auth-provider')

function PasswordHarness() {
  const { session, updatePassword } = useAuth()
  const [result, setResult] = useState('idle')

  return (
    <>
      <Text testID="session-id">{session?.user.id ?? 'none'}</Text>
      <Pressable
        onPress={() => {
          void updatePassword({
            currentPassword: 'OldSafe123',
            newPassword: 'NewSafe123',
          }).then((nextResult) => setResult(nextResult.success ? 'success' : nextResult.error ?? 'error'))
        }}
        testID="update-password"
      >
        <Text>update</Text>
      </Pressable>
      <Text testID="password-result">{result}</Text>
    </>
  )
}

function SignupHarness() {
  const { signUpWithIdentifier } = useAuth()
  const [result, setResult] = useState('idle')

  return (
    <>
      <Pressable
        onPress={() => {
          void signUpWithIdentifier({
            displayName: 'Tu Phan',
            identifier: 'TU@example.com',
            password: 'secret123',
          }).then((nextResult) => setResult(nextResult.success ? 'success' : nextResult.error ?? 'error'))
        }}
        testID="signup-email"
      >
        <Text>signup</Text>
      </Pressable>
      <Text testID="signup-result">{result}</Text>
    </>
  )
}

function IdentifierAuthHarness() {
  const { signInWithPassword, signUpWithIdentifier } = useAuth()
  const [result, setResult] = useState('idle')

  return (
    <>
      <Pressable
        onPress={() => {
          void signInWithPassword('090 123 4567', 'secret123').then((nextResult) => setResult(nextResult.success ? 'login-success' : nextResult.error ?? 'error'))
        }}
        testID="signin-phone"
      >
        <Text>sign in phone</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void signUpWithIdentifier({
            displayName: 'Tu Phan',
            identifier: '0912345678',
            password: 'secret123',
          }).then((nextResult) => setResult(nextResult.success ? 'signup-success' : nextResult.error ?? 'error'))
        }}
        testID="signup-phone"
      >
        <Text>sign up phone</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void signInWithPassword('0112345678', 'secret123').then((nextResult) => setResult(nextResult.success ? 'invalid-success' : nextResult.error ?? 'error'))
        }}
        testID="signin-invalid-phone"
      >
        <Text>invalid phone</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void signInWithPassword('tu@example.com', 'secret123').then((nextResult) => setResult(nextResult.success ? 'email-success' : nextResult.error ?? 'error'))
        }}
        testID="signin-email-unconfirmed"
      >
        <Text>sign in unconfirmed email</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void signInWithPassword('tu@example.com', 'secret123').then((nextResult) => setResult(nextResult.success ? 'network-success' : nextResult.error ?? 'error'))
        }}
        testID="signin-network"
      >
        <Text>sign in with unavailable auth</Text>
      </Pressable>
      <Text testID="identifier-auth-result">{result}</Text>
    </>
  )
}

function PasswordRecoveryHarness() {
  const { completePasswordRecovery, passwordRecoveryPending, requestPasswordRecovery } = useAuth()
  const [result, setResult] = useState('idle')

  return (
    <>
      <Text testID="password-recovery-pending">{passwordRecoveryPending ? 'pending' : 'idle'}</Text>
      <Pressable
        onPress={() => {
          void requestPasswordRecovery('TU@example.com').then((nextResult) => setResult(nextResult.success ? 'sent' : nextResult.error ?? 'error'))
        }}
        testID="request-password-recovery"
      >
        <Text>request recovery</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void completePasswordRecovery('NewSafe123').then((nextResult) => setResult(nextResult.success ? 'updated' : nextResult.error ?? 'error'))
        }}
        testID="complete-password-recovery"
      >
        <Text>complete recovery</Text>
      </Pressable>
      <Text testID="password-recovery-result">{result}</Text>
    </>
  )
}

function ProfileHarness() {
  const { session, updateCustomerProfile } = useAuth()
  const [result, setResult] = useState('idle')

  return (
    <>
      <Text testID="profile-session-id">{session?.user.id ?? 'none'}</Text>
      <Pressable
        onPress={() => {
          void updateCustomerProfile({
            defaultAddress: ' ',
            email: '',
            fullName: 'Test Customer',
            phone: ' ',
          }).then((nextResult) => setResult(nextResult.success ? 'success' : nextResult.error ?? 'error'))
        }}
        testID="clear-optional-profile"
      >
        <Text>clear optional profile</Text>
      </Pressable>
      <Text testID="profile-result">{result}</Text>
    </>
  )
}

function AuthStateHarness() {
  const { loading, refreshProfile, role, session, signOut } = useAuth()

  return (
    <>
      <Text testID="auth-state-session">{session?.user.id ?? 'none'}</Text>
      <Text testID="auth-state-role">{role ?? 'none'}</Text>
      <Text testID="auth-state-loading">{loading ? 'loading' : 'ready'}</Text>
      <Pressable testID="auth-state-refresh-profile" onPress={() => void refreshProfile()}>
        <Text>refresh profile</Text>
      </Pressable>
      <Pressable testID="auth-state-sign-out" onPress={() => void signOut()}>
        <Text>sign out</Text>
      </Pressable>
    </>
  )
}

function BootstrapSigninHarness() {
  const { authError, loading, signInWithPassword } = useAuth()

  return (
    <>
      <Text testID="bootstrap-signin-loading">{loading ? 'loading' : 'ready'}</Text>
      <Text testID="bootstrap-signin-error">{authError ?? 'none'}</Text>
      <Pressable
        testID="bootstrap-signin-submit"
        onPress={() => void signInWithPassword('tu@example.com', 'secret123')}
      >
        <Text>sign in</Text>
      </Pressable>
    </>
  )
}

let latestSubmitWorkerApplication: ReturnType<typeof useAuth>['submitWorkerApplication'] | null = null

function WorkerApplicationHarness() {
  const { submitWorkerApplication } = useAuth()
  useEffect(() => {
    latestSubmitWorkerApplication = submitWorkerApplication
  }, [submitWorkerApplication])
  return <Text testID="worker-application-ready">ready</Text>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

beforeEach(() => {
  mockPushRoute.mockClear()
  mockUnsubscribe.mockClear()
  mockGetSession.mockReset()
  mockSignInWithPassword.mockReset()
  mockSignUp.mockReset()
  mockResetPasswordForEmail.mockReset()
  mockUpdateUser.mockReset()
  mockSignOut.mockReset()
  mockSetupPushNotifications.mockReset()
  mockUnregisterPushNotifications.mockReset()
  mockMaybeSingle.mockReset()
  mockEq.mockReset()
  mockEq.mockImplementation((_column: string, _value: string) => ({ maybeSingle: mockMaybeSingle }))
  mockSelect.mockClear()
  mockFrom.mockClear()
  mockClearPendingKaelChatDraft.mockClear()
  mockSubmitWorkerApplication.mockReset()
  mockGetRememberedAuthCredentials.mockReset()
  mockGetLocalVisualAuditRole.mockReset()
  mockGetLocalVisualAuditRole.mockReturnValue(null)
  mockOnAuthStateChange.mockClear()
  mockAuthStateListener = null
  latestSubmitWorkerApplication = null

  mockGetSession.mockResolvedValue({ data: { session: mockSession } })
  mockMaybeSingle.mockResolvedValue({ data: { role: 'customer' }, error: null })
  mockSignInWithPassword.mockResolvedValue({ data: { session: mockSession }, error: null })
  mockSignUp.mockResolvedValue({ data: { session: mockSession, user: mockSession.user }, error: null })
  mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
  mockUpdateUser.mockResolvedValue({ error: null })
  mockSignOut.mockResolvedValue({ error: null })
  mockSetupPushNotifications.mockResolvedValue({
    status: 'registered',
    token: 'ExponentPushToken[shared-device]',
  })
  mockUnregisterPushNotifications.mockResolvedValue({ status: 'unregistered' })
  mockSubmitWorkerApplication.mockResolvedValue({
    code: 'NETWORK_ERROR',
    error: 'ambiguous failure',
    status: 0,
    success: false,
  })
  mockGetRememberedAuthCredentials.mockResolvedValue(null)
})

describe('AuthProvider native relaunch login', () => {
  it('clears a remembered password session so the native login form can be submitted again', async () => {
    mockGetRememberedAuthCredentials.mockResolvedValue({
      identifier: 'customer@example.com',
      password: 'secret123',
      role: 'customer',
    })

    render(
      <AuthProvider>
        <AuthStateHarness />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('auth-state-session')).toHaveTextContent('none'))
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('keeps a remembered social session on the existing automatic route', async () => {
    const socialSession = {
      ...mockSession,
      user: { ...mockSession.user, app_metadata: { provider: 'google' } },
    }
    mockGetSession.mockResolvedValueOnce({ data: { session: socialSession } })
    mockGetRememberedAuthCredentials.mockResolvedValue({
      identifier: 'customer@example.com',
      password: 'secret123',
      role: 'customer',
    })

    render(
      <AuthProvider>
        <AuthStateHarness />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('auth-state-session')).toHaveTextContent('customer_test_1'))
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('keeps the current role mounted during a same-account token refresh', async () => {
    render(
      <AuthProvider>
        <AuthStateHarness />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-state-role')).toHaveTextContent('customer')
      expect(screen.getByTestId('auth-state-loading')).toHaveTextContent('ready')
    })
    const roleLookupCount = mockMaybeSingle.mock.calls.length

    act(() => {
      mockAuthStateListener?.('TOKEN_REFRESHED', {
        ...mockSession,
        access_token: 'customer-refreshed-access-token',
      })
    })

    expect(screen.getByTestId('auth-state-role')).toHaveTextContent('customer')
    expect(screen.getByTestId('auth-state-loading')).toHaveTextContent('ready')
    expect(mockMaybeSingle).toHaveBeenCalledTimes(roleLookupCount)
  })

  it('keeps the current role mounted during refreshProfile', async () => {
    render(
      <AuthProvider>
        <AuthStateHarness />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-state-role')).toHaveTextContent('customer')
      expect(screen.getByTestId('auth-state-loading')).toHaveTextContent('ready')
    })

    await act(async () => {
      fireEvent.press(screen.getByTestId('auth-state-refresh-profile'))
    })

    expect(screen.getByTestId('auth-state-role')).toHaveTextContent('customer')
    expect(screen.getByTestId('auth-state-loading')).toHaveTextContent('ready')
  })

  it('keeps the current role mounted when the same account signs in again', async () => {
    render(
      <AuthProvider>
        <AuthStateHarness />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-state-role')).toHaveTextContent('customer')
      expect(screen.getByTestId('auth-state-loading')).toHaveTextContent('ready')
    })
    const roleLookupCount = mockMaybeSingle.mock.calls.length

    act(() => {
      mockAuthStateListener?.('SIGNED_IN', mockSession)
    })

    expect(screen.getByTestId('auth-state-role')).toHaveTextContent('customer')
    expect(screen.getByTestId('auth-state-loading')).toHaveTextContent('ready')
    expect(mockMaybeSingle).toHaveBeenCalledTimes(roleLookupCount)
  })
})

describe('AuthProvider worker application idempotency', () => {
  it('reuses the key for the same manual retry and rotates it when the application changes', async () => {
    render(
      <AuthProvider>
        <WorkerApplicationHarness />
      </AuthProvider>,
    )
    await waitFor(() => expect(latestSubmitWorkerApplication).not.toBeNull())

    await act(async () => {
      await latestSubmitWorkerApplication?.({ contact: ' worker@example.com ', language: 'vi' })
      await latestSubmitWorkerApplication?.({ contact: 'worker@example.com', language: 'vi' })
      await latestSubmitWorkerApplication?.({ contact: 'worker-next@example.com', language: 'vi' })
    })

    const firstKey = mockSubmitWorkerApplication.mock.calls[0][0].client_request_id
    const retryKey = mockSubmitWorkerApplication.mock.calls[1][0].client_request_id
    const changedInputKey = mockSubmitWorkerApplication.mock.calls[2][0].client_request_id
    expect(retryKey).toBe(firstKey)
    expect(changedInputKey).not.toBe(firstKey)
  })
})

describe('AuthProvider account isolation', () => {
  it('does not let a settled bootstrap timeout overwrite a later sign-in attempt', async () => {
    jest.useFakeTimers()
    const pendingSignin = deferred<never>()
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    mockSignInWithPassword.mockImplementationOnce(() => pendingSignin.promise)

    try {
      render(
        <AuthProvider>
          <BootstrapSigninHarness />
        </AuthProvider>,
      )

      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(screen.getByTestId('bootstrap-signin-loading')).toHaveTextContent('ready')

      act(() => jest.advanceTimersByTime(6_900))
      fireEvent.press(screen.getByTestId('bootstrap-signin-submit'))
      expect(screen.getByTestId('bootstrap-signin-loading')).toHaveTextContent('loading')

      act(() => jest.advanceTimersByTime(200))

      expect(screen.getByTestId('bootstrap-signin-loading')).toHaveTextContent('loading')
      expect(screen.getByTestId('bootstrap-signin-error')).toHaveTextContent('none')
    } finally {
      jest.useRealTimers()
    }
  })

  it('starts authenticated push-token unregister before local sign-out completes', async () => {
    render(
      <AuthProvider>
        <AuthStateHarness />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('auth-state-session')).toHaveTextContent('customer_test_1')
      expect(mockSetupPushNotifications).toHaveBeenCalledWith({
        accessToken: 'customer-access-token',
        role: 'customer',
      })
    })

    fireEvent.press(screen.getByTestId('auth-state-sign-out'))

    await waitFor(() => {
      expect(screen.getByTestId('auth-state-session')).toHaveTextContent('none')
      expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    })
    expect(mockUnregisterPushNotifications).toHaveBeenCalledWith({
      accessToken: 'customer-access-token',
      token: 'ExponentPushToken[shared-device]',
    })
    expect(mockUnregisterPushNotifications.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignOut.mock.invocationCallOrder[0],
    )
  })

  it('clears a local visual-audit session without calling remote sign-out', async () => {
    mockGetLocalVisualAuditRole.mockReturnValue('customer')

    render(
      <AuthProvider>
        <AuthStateHarness />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('auth-state-session')).toHaveTextContent('local-visual-audit-customer'))
    fireEvent.press(screen.getByTestId('auth-state-sign-out'))

    await waitFor(() => expect(screen.getByTestId('auth-state-session')).toHaveTextContent('none'))
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('cleans up a push setup that settles after sign-out without restarting the departed account', async () => {
    const pendingRegistration = deferred<{
      status: 'registered'
      token: string
    }>()
    mockSetupPushNotifications.mockImplementationOnce(() => pendingRegistration.promise)

    render(
      <AuthProvider>
        <AuthStateHarness />
      </AuthProvider>,
    )

    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(1))
    fireEvent.press(screen.getByTestId('auth-state-sign-out'))
    await waitFor(() => {
      expect(screen.getByTestId('auth-state-session')).toHaveTextContent('none')
      expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    })

    await act(async () => {
      pendingRegistration.resolve({
        status: 'registered',
        token: 'ExponentPushToken[late-sign-out]',
      })
      await pendingRegistration.promise
    })

    await waitFor(() => expect(mockUnregisterPushNotifications).toHaveBeenCalledWith({
      accessToken: 'customer-access-token',
      token: 'ExponentPushToken[late-sign-out]',
    }))
    expect(mockSetupPushNotifications).toHaveBeenCalledTimes(1)
  })

  it('keeps a shared device token bound to each account transition', async () => {
    const workerSession = {
      access_token: 'worker-access-token',
      user: {
        email: 'worker@nestscout.local',
        id: 'worker_test_2',
        user_metadata: {},
      },
    }
    mockEq.mockImplementation((_column: string, userId: string) => ({
      maybeSingle: jest.fn(async () => ({
        data: { role: userId === workerSession.user.id ? 'worker' as const : 'customer' as const },
        error: null,
      })),
    }))

    render(
      <AuthProvider>
        <AuthStateHarness />
      </AuthProvider>,
    )

    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(1))
    act(() => {
      mockAuthStateListener?.('SIGNED_IN', workerSession)
    })

    await waitFor(() => {
      expect(screen.getByTestId('auth-state-session')).toHaveTextContent('worker_test_2')
      expect(mockSetupPushNotifications).toHaveBeenCalledTimes(2)
    })
    expect(mockUnregisterPushNotifications).toHaveBeenNthCalledWith(1, {
      accessToken: 'customer-access-token',
      token: 'ExponentPushToken[shared-device]',
    })

    fireEvent.press(screen.getByTestId('auth-state-sign-out'))

    await waitFor(() => expect(mockUnregisterPushNotifications).toHaveBeenCalledTimes(2))
    expect(mockUnregisterPushNotifications).toHaveBeenNthCalledWith(2, {
      accessToken: 'worker-access-token',
      token: 'ExponentPushToken[shared-device]',
    })
  })

  it('unregisters a late token registration with the account that started it', async () => {
    const lateCustomerRegistration = deferred<{
      status: 'registered'
      token: string
    }>()
    const workerSession = {
      access_token: 'worker-access-token',
      user: {
        email: 'worker@nestscout.local',
        id: 'worker_test_2',
        user_metadata: {},
      },
    }
    mockSetupPushNotifications
      .mockImplementationOnce(() => lateCustomerRegistration.promise)
      .mockResolvedValueOnce({
        status: 'registered',
        token: 'ExponentPushToken[shared-device]',
      })
    mockEq.mockImplementation((_column: string, userId: string) => ({
      maybeSingle: jest.fn(async () => ({
        data: { role: userId === workerSession.user.id ? 'worker' as const : 'customer' as const },
        error: null,
      })),
    }))

    render(
      <AuthProvider>
        <AuthStateHarness />
      </AuthProvider>,
    )

    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(1))
    act(() => {
      mockAuthStateListener?.('SIGNED_IN', workerSession)
    })
    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(2))

    await act(async () => {
      lateCustomerRegistration.resolve({
        status: 'registered',
        token: 'ExponentPushToken[shared-device]',
      })
      await lateCustomerRegistration.promise
    })

    expect(mockUnregisterPushNotifications).toHaveBeenCalledWith({
      accessToken: 'customer-access-token',
      token: 'ExponentPushToken[shared-device]',
    })
    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(3))
    expect(mockSetupPushNotifications).toHaveBeenLastCalledWith({
      accessToken: 'worker-access-token',
      role: 'worker',
    })
  })

  it('restarts a pending registration with the refreshed bearer for the same account', async () => {
    const pendingRegistration = deferred<{
      status: 'registered'
      token: string
    }>()
    const refreshedSession = {
      ...mockSession,
      access_token: 'customer-refreshed-access-token',
    }
    mockSetupPushNotifications
      .mockImplementationOnce(() => pendingRegistration.promise)
      .mockResolvedValueOnce({
        status: 'registered',
        token: 'ExponentPushToken[refreshed-customer]',
      })

    render(
      <AuthProvider>
        <AuthStateHarness />
      </AuthProvider>,
    )

    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(1))
    act(() => {
      mockAuthStateListener?.('TOKEN_REFRESHED', refreshedSession)
    })

    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(2))
    expect(mockSetupPushNotifications).toHaveBeenLastCalledWith({
      accessToken: 'customer-refreshed-access-token',
      role: 'customer',
    })
  })

  it('keeps the newest same-account push registration across an A-to-B-to-A race', async () => {
    const firstCustomerRegistration = deferred<{
      status: 'registered'
      token: string
    }>()
    const workerSession = {
      access_token: 'worker-access-token',
      user: {
        email: 'worker@nestscout.local',
        id: 'worker_test_2',
        user_metadata: {},
      },
    }
    mockSetupPushNotifications
      .mockImplementationOnce(() => firstCustomerRegistration.promise)
      .mockResolvedValueOnce({
        status: 'registered',
        token: 'ExponentPushToken[worker]',
      })
      .mockResolvedValueOnce({
        status: 'registered',
        token: 'ExponentPushToken[new-customer]',
      })
    mockEq.mockImplementation((_column: string, userId: string) => ({
      maybeSingle: jest.fn(async () => ({
        data: { role: userId === workerSession.user.id ? 'worker' as const : 'customer' as const },
        error: null,
      })),
    }))

    render(
      <AuthProvider>
        <AuthStateHarness />
      </AuthProvider>,
    )

    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(1))
    act(() => {
      mockAuthStateListener?.('SIGNED_IN', workerSession)
    })
    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(2))
    act(() => {
      mockAuthStateListener?.('SIGNED_IN', mockSession)
    })
    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(3))

    await act(async () => {
      firstCustomerRegistration.resolve({
        status: 'registered',
        token: 'ExponentPushToken[old-customer]',
      })
      await firstCustomerRegistration.promise
    })
    fireEvent.press(screen.getByTestId('auth-state-sign-out'))

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' }))
    expect(mockUnregisterPushNotifications).toHaveBeenLastCalledWith({
      accessToken: 'customer-access-token',
      token: 'ExponentPushToken[new-customer]',
    })
  })

  it('clears the local session when push-token unregister never settles', async () => {
    mockUnregisterPushNotifications.mockImplementationOnce(() => new Promise(() => undefined))

    render(
      <AuthProvider>
        <AuthStateHarness />
      </AuthProvider>,
    )

    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(1))
    fireEvent.press(screen.getByTestId('auth-state-sign-out'))

    await waitFor(() => {
      expect(screen.getByTestId('auth-state-session')).toHaveTextContent('none')
      expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    })
  })

  it('ignores a late role lookup from the previous account', async () => {
    const lateCustomerRole = deferred<{ data: { role: 'customer' }; error: null }>()
    const workerSession = {
      access_token: 'worker-access-token',
      user: {
        email: 'worker@nestscout.local',
        id: 'worker_test_2',
        user_metadata: {},
      },
    }
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    mockEq.mockImplementation((_column: string, userId: string) => ({
      maybeSingle: jest.fn(() => userId === mockSession.user.id
        ? lateCustomerRole.promise
        : Promise.resolve({ data: { role: 'worker' as const }, error: null })),
    }))

    render(
      <AuthProvider>
        <AuthStateHarness />
      </AuthProvider>,
    )

    await waitFor(() => expect(mockAuthStateListener).not.toBeNull())
    act(() => {
      mockAuthStateListener?.('SIGNED_IN', mockSession)
      mockAuthStateListener?.('SIGNED_IN', workerSession)
    })

    await waitFor(() => {
      expect(screen.getByTestId('auth-state-session')).toHaveTextContent('worker_test_2')
      expect(screen.getByTestId('auth-state-role')).toHaveTextContent('worker')
    })
    expect(mockClearPendingKaelChatDraft).toHaveBeenCalledWith('customer_test_1')

    await act(async () => {
      lateCustomerRole.resolve({ data: { role: 'customer' }, error: null })
      await lateCustomerRole.promise
    })

    expect(screen.getByTestId('auth-state-session')).toHaveTextContent('worker_test_2')
    expect(screen.getByTestId('auth-state-role')).toHaveTextContent('worker')
  })

  it('does not let a late profile mutation restore the previous account', async () => {
    const pendingUpdate = deferred<{ error: null }>()
    const workerSession = {
      access_token: 'worker-access-token',
      user: {
        email: 'worker@nestscout.local',
        id: 'worker_test_2',
        user_metadata: {},
      },
    }
    mockUpdateUser.mockImplementationOnce(() => pendingUpdate.promise)

    render(
      <AuthProvider>
        <ProfileHarness />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('profile-session-id')).toHaveTextContent('customer_test_1'))
    fireEvent.press(screen.getByTestId('clear-optional-profile'))
    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledTimes(1))
    act(() => {
      mockAuthStateListener?.('SIGNED_IN', workerSession)
    })
    await waitFor(() => expect(screen.getByTestId('profile-session-id')).toHaveTextContent('worker_test_2'))

    await act(async () => {
      pendingUpdate.resolve({ error: null })
      await pendingUpdate.promise
    })

    expect(screen.getByTestId('profile-session-id')).toHaveTextContent('worker_test_2')
    expect(mockGetSession).toHaveBeenCalledTimes(1)
  })

  it('does not update a password after the active account changes during reauthentication', async () => {
    const pendingReauthentication = deferred<{
      data: { session: typeof mockSession }
      error: null
    }>()
    const workerSession = {
      access_token: 'worker-access-token',
      user: {
        email: 'worker@nestscout.local',
        id: 'worker_test_2',
        user_metadata: {},
      },
    }
    mockSignInWithPassword.mockImplementationOnce(() => pendingReauthentication.promise)

    render(
      <AuthProvider>
        <PasswordHarness />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('session-id')).toHaveTextContent('customer_test_1'))
    fireEvent.press(screen.getByTestId('update-password'))
    await waitFor(() => expect(mockSignInWithPassword).toHaveBeenCalledTimes(1))
    act(() => {
      mockAuthStateListener?.('SIGNED_IN', workerSession)
    })
    await waitFor(() => expect(screen.getByTestId('session-id')).toHaveTextContent('worker_test_2'))

    await act(async () => {
      pendingReauthentication.resolve({ data: { session: mockSession }, error: null })
      await pendingReauthentication.promise
    })

    expect(mockUpdateUser).not.toHaveBeenCalled()
    expect(screen.getByTestId('session-id')).toHaveTextContent('worker_test_2')
  })
})

describe('AuthProvider password update', () => {
  it('verifies the current password before updating the account password', async () => {
    render(
      <AuthProvider>
        <PasswordHarness />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('session-id')).toHaveTextContent('customer_test_1')
    })

    fireEvent.press(screen.getByTestId('update-password'))

    await waitFor(() => {
      expect(screen.getByTestId('password-result')).toHaveTextContent('success')
    })
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'customer@example.com',
      password: 'OldSafe123',
    })
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NewSafe123' })
    expect(mockSignInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(mockUpdateUser.mock.invocationCallOrder[0])
  })

  it('does not update the account password when the current password is wrong', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { message: 'Invalid login credentials' } })

    render(
      <AuthProvider>
        <PasswordHarness />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('session-id')).toHaveTextContent('customer_test_1')
    })

    fireEvent.press(screen.getByTestId('update-password'))

    await waitFor(() => {
      expect(screen.getByTestId('password-result')).toHaveTextContent('Mật khẩu hiện tại không đúng.')
    })
    expect(mockUpdateUser).not.toHaveBeenCalled()
    expect(screen.getByTestId('session-id')).toHaveTextContent('customer_test_1')
  })
})

describe('AuthProvider customer profile updates', () => {
  it('clears optional contact and address metadata when the user submits blank values', async () => {
    render(
      <AuthProvider>
        <ProfileHarness />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('clear-optional-profile')).toBeOnTheScreen())
    fireEvent.press(screen.getByTestId('clear-optional-profile'))

    await waitFor(() => expect(screen.getByTestId('profile-result')).toHaveTextContent('success'))
    expect(mockUpdateUser).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contact_email: null,
        default_address: null,
        phone_number: null,
      }),
    })
  })
})

describe('AuthProvider Email/SDT signup', () => {
  it('creates a customer-safe email signup without client-controlled role metadata', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })

    render(
      <AuthProvider>
        <SignupHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('signup-email'))

    await waitFor(() => {
      expect(screen.getByTestId('signup-result')).toHaveTextContent('success')
    })
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'tu@example.com',
      password: 'secret123',
      options: {
        data: {
          full_name: 'Tu Phan',
          name: 'Tu Phan',
        },
        emailRedirectTo: expect.stringMatching(/^nestscout:/),
      },
    })
    expect(JSON.stringify(mockSignUp.mock.calls[0][0])).not.toContain('role')
    expect(mockMaybeSingle).toHaveBeenCalled()
  })

  it('does not claim signup success when Supabase still requires confirmation', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    mockSignUp.mockResolvedValueOnce({ data: { session: null, user: mockSession.user }, error: null })

    render(
      <AuthProvider>
        <SignupHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('signup-email'))

    await waitFor(() => {
      expect(screen.getByTestId('signup-result')).toHaveTextContent('Đăng ký chưa sẵn sàng vì hệ thống vẫn yêu cầu xác minh. Vui lòng thử lại sau.')
    })
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'tu@example.com',
      password: 'secret123',
      options: {
        data: {
          full_name: 'Tu Phan',
          name: 'Tu Phan',
        },
        emailRedirectTo: expect.stringMatching(/^nestscout:/),
      },
    })
    expect(mockMaybeSingle).not.toHaveBeenCalled()
  })

  it('explains a safe retry when Supabase rate-limits confirmation email delivery', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    mockSignUp.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Email rate limit exceeded', status: 429 },
    })

    render(
      <AuthProvider>
        <SignupHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('signup-email'))

    await waitFor(() => {
      expect(screen.getByTestId('signup-result')).toHaveTextContent('Yêu cầu đang bị giới hạn. Vui lòng thử lại sau.')
    })
  })

  it('explains an invalid email without exposing the Supabase error', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    mockSignUp.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'Email address "invalid@example.com" is invalid', status: 400 },
    })

    render(
      <AuthProvider>
        <SignupHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('signup-email'))

    await waitFor(() => {
      expect(screen.getByTestId('signup-result')).toHaveTextContent('Địa chỉ thư điện tử chưa đúng định dạng.')
    })
  })
})

describe('AuthProvider Email/SDT credentials', () => {
  it('normalizes Vietnamese phone credentials for both sign-in and signup', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })

    render(
      <AuthProvider>
        <IdentifierAuthHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('signin-phone'))

    await waitFor(() => {
      expect(screen.getByTestId('identifier-auth-result')).toHaveTextContent('login-success')
    })
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      phone: '+84901234567',
      password: 'secret123',
    })

    fireEvent.press(screen.getByTestId('signup-phone'))

    await waitFor(() => {
      expect(screen.getByTestId('identifier-auth-result')).toHaveTextContent('signup-success')
    })
    expect(mockSignUp).toHaveBeenCalledWith({
      phone: '+84912345678',
      password: 'secret123',
      options: {
        data: {
          full_name: 'Tu Phan',
          name: 'Tu Phan',
        },
      },
    })
  })

  it('rejects a malformed Vietnamese phone number before Supabase is called', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })

    render(
      <AuthProvider>
        <IdentifierAuthHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('signin-invalid-phone'))

    await waitFor(() => {
      expect(screen.getByTestId('identifier-auth-result')).toHaveTextContent('SDT Việt Nam chưa đúng định dạng.')
    })
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
  })

  it('keeps the account signed out and explains when Supabase requires email confirmation', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Email not confirmed' },
    })

    render(
      <AuthProvider>
        <IdentifierAuthHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('signin-email-unconfirmed'))

    await waitFor(() => {
      expect(screen.getByTestId('identifier-auth-result')).toHaveTextContent('Thư điện tử chưa được xác nhận. Hãy kiểm tra email rồi đăng nhập lại.')
    })
  })

  it('keeps the account signed out and explains when Supabase auth cannot reach its service', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    })

    render(
      <AuthProvider>
        <IdentifierAuthHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('signin-network'))

    await waitFor(() => {
      expect(screen.getByTestId('identifier-auth-result')).toHaveTextContent('Không thể kết nối dịch vụ đăng nhập. Vui lòng thử lại sau.')
    })
  })
})

describe('AuthProvider password recovery', () => {
  it('requests an email reset through Supabase with an app callback URL', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })

    render(
      <AuthProvider>
        <PasswordRecoveryHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('request-password-recovery'))

    await waitFor(() => {
      expect(screen.getByTestId('password-recovery-result')).toHaveTextContent('sent')
    })
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('tu@example.com', {
      redirectTo: expect.stringContaining('auth_flow=password-recovery'),
    })
  })

  it('keeps PASSWORD_RECOVERY out of normal role bootstrap and updates the recovered password', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })

    render(
      <AuthProvider>
        <PasswordRecoveryHarness />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(mockAuthStateListener).not.toBeNull()
    })
    await act(async () => {
      mockAuthStateListener?.('PASSWORD_RECOVERY', mockSession)
    })

    expect(screen.getByTestId('password-recovery-pending')).toHaveTextContent('pending')
    expect(mockMaybeSingle).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId('complete-password-recovery'))

    await waitFor(() => {
      expect(screen.getByTestId('password-recovery-result')).toHaveTextContent('updated')
    })
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NewSafe123' })
    expect(screen.getByTestId('password-recovery-pending')).toHaveTextContent('pending')
  })
})
