import React, { useState } from 'react'
import { Pressable, Text } from 'react-native'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPushRoute = jest.fn()
const mockUnsubscribe = jest.fn()
const mockGetSession = jest.fn()
const mockSignInWithPassword = jest.fn()
const mockUpdateUser = jest.fn()
const mockSignOut = jest.fn()
const mockMaybeSingle = jest.fn()
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
const mockSelect = jest.fn(() => ({ eq: mockEq }))
const mockFrom = jest.fn(() => ({ select: mockSelect }))

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
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: mockUnsubscribe } } })),
    signInWithPassword: mockSignInWithPassword,
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

beforeEach(() => {
  mockPushRoute.mockClear()
  mockUnsubscribe.mockClear()
  mockGetSession.mockReset()
  mockSignInWithPassword.mockReset()
  mockUpdateUser.mockReset()
  mockSignOut.mockReset()
  mockMaybeSingle.mockReset()
  mockEq.mockClear()
  mockSelect.mockClear()
  mockFrom.mockClear()

  mockGetSession.mockResolvedValue({ data: { session: mockSession } })
  mockMaybeSingle.mockResolvedValue({ data: { role: 'customer' }, error: null })
  mockSignInWithPassword.mockResolvedValue({ data: { session: mockSession }, error: null })
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
