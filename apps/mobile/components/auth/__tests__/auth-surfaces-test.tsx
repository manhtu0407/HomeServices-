import { fireEvent, render, screen } from '@testing-library/react-native'

const mockReplace = jest.fn()
const mockRefreshProfile = jest.fn(async () => null)
const mockSignInWithGoogle = jest.fn(async () => ({ success: true }))
const mockSignInWithPassword = jest.fn(async () => ({ success: false, error: 'Không thể đăng nhập' }))
const mockSignOut = jest.fn(async () => undefined)
const mockUpdateCustomerProfile = jest.fn(async () => ({ success: true }))

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-image', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Image: (props: any) => React.createElement(View, props),
  }
})

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ replace: mockReplace }),
}))

jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  }
})

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({
    authError: null,
    loading: false,
    profileStatus: 'idle',
    refreshProfile: mockRefreshProfile,
    role: null,
    session: null,
    signInWithGoogle: mockSignInWithGoogle,
    signInWithPassword: mockSignInWithPassword,
    signOut: mockSignOut,
    updateCustomerProfile: mockUpdateCustomerProfile,
  }),
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => 'vi',
  }
})

import { LoginRoleSurface } from '../auth-surfaces'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('LoginRoleSurface', () => {
  it('starts with the NestScout welcome screen before role selection', () => {
    render(<LoginRoleSurface />)

    expect(screen.getByTestId('auth-welcome-screen')).toBeOnTheScreen()
    expect(screen.getByText('Xin chào! Tôi là Kael')).toBeOnTheScreen()
    expect(screen.getByText('NestScout')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-entry-role-customer')).toBeNull()
  })

  it('continues from welcome into the role gate', () => {
    render(<LoginRoleSurface />)

    fireEvent.press(screen.getByText('Tiếp tục'))

    expect(screen.getByText('Chọn vai trò')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-entry-role-customer')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-entry-role-worker')).toBeOnTheScreen()
  })

  it('keeps customer password form behind the explicit email fallback', () => {
    render(<LoginRoleSurface />)

    fireEvent.press(screen.getByText('Tiếp tục'))
    fireEvent.press(screen.getByTestId('auth-entry-role-customer'))

    expect(screen.getByTestId('auth-client-google-primary')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-login-email-input')).toBeNull()

    fireEvent.press(screen.getByTestId('auth-client-email-fallback-toggle'))

    expect(screen.getByTestId('auth-login-email-input')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-login-password-input')).toBeOnTheScreen()
  })
})
