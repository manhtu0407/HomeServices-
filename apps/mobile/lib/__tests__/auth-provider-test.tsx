import React, { useState } from 'react'
import { Pressable, Text } from 'react-native'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPushRoute = jest.fn()
const mockUnsubscribe = jest.fn()
const mockGetSession = jest.fn()
const mockSignInWithPassword = jest.fn()
const mockSignUp = jest.fn()
const mockResend = jest.fn()
const mockResetPasswordForEmail = jest.fn()
const mockUpdateUser = jest.fn()
const mockSignOut = jest.fn()
const mockMaybeSingle = jest.fn()
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockSelect = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))
let mockAuthStateChangeCallback: ((event: string, session: typeof mockSession | null) => void) | null = null

const mockSession = {
  user: {
    email: 'manhtu0407@gmail.com',
    id: 'customer_test_1',
    user_metadata: {},
  },
}

const mockSupabase = {
  auth: {
    getSession: mockGetSession,
    onAuthStateChange: jest.fn((callback) => {
      mockAuthStateChangeCallback = callback
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
    }),
    resetPasswordForEmail: mockResetPasswordForEmail,
    signInWithPassword: mockSignInWithPassword,
    signUp: mockSignUp,
    resend: mockResend,
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

jest.mock('../push-notifications', () => ({
  addPushNotificationResponseListener: jest.fn(() => ({ remove: jest.fn() })),
  setupPushNotifications: jest.fn(async () => ({ status: 'unsupported' })),
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
  const { resendSignupConfirmation, signUpWithIdentifier } = useAuth()
  const [result, setResult] = useState('idle')

  return (
    <>
      <Pressable
        onPress={() => {
          void signUpWithIdentifier({
            displayName: 'Tu Phan',
            identifier: 'TU@example.com',
            password: 'secret123',
          }).then((nextResult) => setResult(nextResult.needsConfirmation ? 'confirmation' : nextResult.success ? 'success' : nextResult.error ?? 'error'))
        }}
        testID="signup-email"
      >
        <Text>signup</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void resendSignupConfirmation('TU@example.com').then((nextResult) => setResult(nextResult.success ? 'resent' : nextResult.error ?? 'error'))
        }}
        testID="resend-signup-email"
      >
        <Text>resend</Text>
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

beforeEach(() => {
  mockPushRoute.mockClear()
  mockUnsubscribe.mockClear()
  mockGetSession.mockReset()
  mockSignInWithPassword.mockReset()
  mockSignUp.mockReset()
  mockResend.mockReset()
  mockResetPasswordForEmail.mockReset()
  mockUpdateUser.mockReset()
  mockSignOut.mockReset()
  mockMaybeSingle.mockReset()
  mockEq.mockClear()
  mockSelect.mockClear()
  mockFrom.mockClear()
  mockAuthStateChangeCallback = null

  mockGetSession.mockResolvedValue({ data: { session: mockSession } })
  mockMaybeSingle.mockResolvedValue({ data: { role: 'customer' }, error: null })
  mockSignInWithPassword.mockResolvedValue({ data: { session: mockSession }, error: null })
  mockSignUp.mockResolvedValue({ data: { session: mockSession, user: mockSession.user }, error: null })
  mockResend.mockResolvedValue({ data: {}, error: null })
  mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
  mockUpdateUser.mockResolvedValue({ error: null })
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
      email: 'manhtu0407@gmail.com',
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
      },
    })
    expect(JSON.stringify(mockSignUp.mock.calls[0][0])).not.toContain('role')
    expect(mockMaybeSingle).toHaveBeenCalled()
  })

  it('returns a confirmation state instead of an error when Supabase creates the user without a session', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    mockSignUp.mockResolvedValueOnce({ data: { session: null, user: mockSession.user }, error: null })

    render(
      <AuthProvider>
        <SignupHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('signup-email'))

    await waitFor(() => {
      expect(screen.getByTestId('signup-result')).toHaveTextContent('confirmation')
    })
    expect(mockMaybeSingle).not.toHaveBeenCalled()
  })

  it('resends a signup confirmation through Supabase without exposing provider errors', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })

    render(
      <AuthProvider>
        <SignupHarness />
      </AuthProvider>,
    )

    fireEvent.press(screen.getByTestId('resend-signup-email'))

    await waitFor(() => {
      expect(screen.getByTestId('signup-result')).toHaveTextContent('resent')
    })
    expect(mockResend).toHaveBeenCalledWith({
      email: 'tu@example.com',
      type: 'signup',
    })
  })
})

describe('AuthProvider Email/SDT credentials', () => {
  it('normalizes Vietnamese phone credentials for sign-in but blocks signup until SMS confirmation exists', async () => {
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
      expect(screen.getByTestId('identifier-auth-result')).toHaveTextContent('Đăng ký bằng SDT chưa sẵn sàng. Vui lòng dùng email.')
    })
    expect(mockSignUp).not.toHaveBeenCalled()
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
      expect(mockAuthStateChangeCallback).not.toBeNull()
    })
    await act(async () => {
      mockAuthStateChangeCallback?.('PASSWORD_RECOVERY', mockSession)
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
