import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mockReplace = jest.fn()
const mockRefreshProfile = jest.fn(async () => null)
const mockEnterGuestMode = jest.fn()
const mockSignInWithGoogle = jest.fn(async () => ({ success: true }))
const mockSignInWithApple = jest.fn(async () => ({ success: true }))
const mockSignInWithPassword = jest.fn(async (): Promise<{ success: boolean; error?: string; role?: 'admin' | 'customer' | 'worker' }> => ({ success: false, error: 'Không thể đăng nhập' }))
const mockSignUpWithIdentifier = jest.fn(async (): Promise<{ success: boolean; error?: string; requiresEmailConfirmation?: boolean }> => ({ success: true }))
const mockRequestPasswordRecovery = jest.fn(async () => ({ success: true }))
const mockCompletePasswordRecovery = jest.fn(async () => ({ success: true }))
const mockSignOut = jest.fn(async () => undefined)
const mockSubmitWorkerApplication = jest.fn(async (): Promise<{
  success: boolean
  error?: string
}> => ({ success: true }))
const mockUpdateCustomerProfile = jest.fn(async () => ({ success: true }))
let mockAuthOverride: Record<string, unknown> = {}
let mockLanguage: 'en' | 'vi' = 'vi'
let mockRouteParams: Record<string, string> = {}

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
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
    enterGuestMode: mockEnterGuestMode,
    guestMode: false,
    loading: false,
    passwordRecoveryPending: false,
    profileStatus: 'idle',
    refreshProfile: mockRefreshProfile,
    requestPasswordRecovery: mockRequestPasswordRecovery,
    completePasswordRecovery: mockCompletePasswordRecovery,
    role: null,
    session: null,
    signInWithApple: mockSignInWithApple,
    signInWithGoogle: mockSignInWithGoogle,
    signInWithPassword: mockSignInWithPassword,
    signUpWithIdentifier: mockSignUpWithIdentifier,
    signOut: mockSignOut,
    submitWorkerApplication: mockSubmitWorkerApplication,
    updateCustomerProfile: mockUpdateCustomerProfile,
    ...mockAuthOverride,
  }),
}))

jest.mock('@/lib/remembered-auth-identifier', () => ({
  clearRememberedAuthIdentifier: jest.fn(async () => undefined),
  getRememberedAuthIdentifier: jest.fn(async () => null),
  rememberAuthIdentifier: jest.fn(async () => undefined),
}))

const mockedRememberedIdentifier = jest.requireMock('@/lib/remembered-auth-identifier') as {
  clearRememberedAuthIdentifier: jest.Mock
  getRememberedAuthIdentifier: jest.Mock
  rememberAuthIdentifier: jest.Mock
}
const mockGetRememberedAuthIdentifier = mockedRememberedIdentifier.getRememberedAuthIdentifier
const mockRememberAuthIdentifier = mockedRememberedIdentifier.rememberAuthIdentifier

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => mockLanguage,
  }
})

import { LoginRoleSurface } from '../auth-surfaces'
import { EntryBrandAccessFlow } from '../entry-access/EntryBrandAccessFlow'
import { kaelLottieRendererKind as splashLogoRendererKind } from '@/components/kael/kael-svg-lottie-view'

beforeEach(() => {
  jest.useFakeTimers()
  mockAuthOverride = {}
  mockLanguage = 'vi'
  mockRouteParams = {}
  jest.clearAllMocks()
  mockGetRememberedAuthIdentifier.mockResolvedValue(null)
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('LoginRoleSurface', () => {
  it('keeps the original splash deadline when the latest step callback changes', () => {
    const firstStepChange = jest.fn()
    const latestStepChange = jest.fn()
    const actions = {
      onCompleteOnboarding: jest.fn(async () => ({ success: true })),
      onPasswordLogin: jest.fn(async () => ({ success: true })),
      onRegister: jest.fn(async () => ({ success: true })),
    }
    const view = render(
      <EntryBrandAccessFlow
        actions={actions}
        onStepChange={firstStepChange}
        splashDurationMs={1_000}
      />,
    )

    act(() => {
      jest.advanceTimersByTime(600)
    })
    view.rerender(
      <EntryBrandAccessFlow
        actions={actions}
        onStepChange={latestStepChange}
        splashDurationMs={1_000}
      />,
    )
    act(() => {
      jest.advanceTimersByTime(400)
    })

    expect(screen.getByTestId('auth-role-gate-screen')).toBeOnTheScreen()
    expect(firstStepChange).not.toHaveBeenCalled()
    expect(latestStepChange).toHaveBeenCalledWith('role-gate')
  })

  it('does not let a completed password login advance after the user leaves the login step', async () => {
    let resolveLogin!: (result: { success: boolean }) => void
    const onStepChange = jest.fn()
    const actions = {
      onCompleteOnboarding: jest.fn(async () => ({ success: true })),
      onGoogleLogin: jest.fn(async () => ({ success: true })),
      onPasswordLogin: jest.fn(() => new Promise<{ success: boolean }>((resolve) => {
        resolveLogin = resolve
      })),
      onRegister: jest.fn(async () => ({ success: true })),
    }
    render(
      <EntryBrandAccessFlow
        actions={actions}
        initialStep="login"
        onStepChange={onStepChange}
      />,
    )

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'tu@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))
    await waitFor(() => expect(actions.onPasswordLogin).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('auth-client-google-primary')).toBeDisabled()
    fireEvent.press(screen.getByTestId('auth-client-google-primary'))
    expect(actions.onGoogleLogin).not.toHaveBeenCalled()

    fireEvent.press(screen.getByLabelText('Quay lại'))
    expect(screen.getByTestId('auth-role-gate-screen')).toBeOnTheScreen()

    await act(async () => {
      resolveLogin({ success: true })
    })

    expect(screen.getByTestId('auth-role-gate-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-onboarding-screen')).toBeNull()
    expect(onStepChange).not.toHaveBeenCalledWith('onboarding')
  })

  it('keeps the splash logo on the SVG renderer that matches Preview instead of native Lottie', () => {
    const flowSource = readFileSync(resolve(__dirname, '../entry-access/EntryBrandAccessFlow.tsx'), 'utf-8')
    const logoSource = readFileSync(resolve(__dirname, '../entry-access/lottie-logo-mark.tsx'), 'utf-8')
    const rendererSource = readFileSync(resolve(__dirname, '../../kael/kael-svg-lottie-view.tsx'), 'utf-8')
    const nativeAdapterPath = resolve(__dirname, '../../kael/kael-lottie-view.native.tsx')

    expect(splashLogoRendererKind).toBe('svg-lottie')
    expect(flowSource).toContain('./lottie-logo-mark')
    expect(logoSource).toContain('@/components/kael/kael-svg-lottie-view')
    expect(flowSource).not.toContain('@/components/kael/kael-lottie-view')
    expect(logoSource).not.toContain('@/components/kael/kael-lottie-view')
    expect(flowSource).not.toContain('nestscout-aurora-nest-appstore-1024.png')
    expect(flowSource).not.toContain('auroraNestLogoStatic')
    expect(rendererSource).toContain('nestscout-aurora-nest-approved-logo-transparent.png')
    expect(rendererSource).not.toContain('<Mask')
    expect(rendererSource).not.toContain('mask={')
    expect(existsSync(nativeAdapterPath)).toBe(false)
  })

  it('leaves login TextInputs as the native touch responder instead of wrapping them in a press handler', () => {
    const fieldSource = readFileSync(resolve(__dirname, '../entry-access/components/fields.tsx'), 'utf-8')
    mockRouteParams = { stage: '1.4' }

    render(<LoginRoleSurface />)

    expect(screen.getByTestId('auth-login-email-input-shell')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-login-password-input-shell')).toBeOnTheScreen()
    expect(fieldSource).toContain('<View style={[styles.field, focused && styles.fieldFocused]} testID={shellTestID}>')
    expect(fieldSource).not.toContain('inputRef.current?.focus()')
    expect(fieldSource).not.toContain('onPressIn={focusInput}')
    expect(fieldSource).toContain('`${testID}-shell`')
  })

  it('keeps the thư điện tử/SĐT input stable while a customer starts entering a Vietnamese phone number', () => {
    mockRouteParams = { stage: '1.4' }
    render(<LoginRoleSurface />)

    const identifierInput = screen.getByTestId('auth-login-email-input')
    expect(identifierInput).toHaveProp('keyboardType', 'default')
    expect(identifierInput).toHaveProp('textContentType', 'username')

    fireEvent.changeText(identifierInput, '090')

    expect(screen.getByTestId('auth-login-email-input')).toHaveProp('keyboardType', 'default')
    expect(screen.getByTestId('auth-login-email-input')).toHaveProp('textContentType', 'username')
    expect(screen.getByTestId('auth-login-email-input-icon-rail')).toHaveStyle({
      alignItems: 'center',
      height: 30,
      justifyContent: 'center',
      width: 30,
    })
  })

  it('keeps auth form inputs outside native glass containers on iOS', () => {
    const flowSource = readFileSync(resolve(__dirname, '../entry-access/EntryBrandAccessFlow.tsx'), 'utf-8')
    const materialsSource = readFileSync(resolve(__dirname, '../entry-access/components/materials.tsx'), 'utf-8')
    const nativeSafeStart = materialsSource.indexOf('export function NativeSafeGlassPanel')
    const nativeSafeEnd = materialsSource.indexOf('function GlassHighlight', nativeSafeStart)
    const nativeSafePanelSource = materialsSource.slice(nativeSafeStart, nativeSafeEnd)
    mockRouteParams = { stage: '1.4' }

    render(<LoginRoleSurface />)

    expect(screen.getByTestId('auth-login-1-4')).toBeOnTheScreen()
    expect(flowSource).toContain('<NativeSafeGlassPanel style={styles.formPanel} testID="auth-login-1-4">')
    expect(flowSource).toContain('<NativeSafeGlassPanel style={styles.formPanel} testID="auth-register-1-5">')
    expect(flowSource).not.toContain('<GlassPanel style={styles.formPanel} testID="auth-login-1-4">')
    expect(flowSource).not.toContain('<GlassPanel style={styles.formPanel} testID="auth-register-1-5">')
    expect(nativeSafePanelSource).toContain('<View')
    expect(nativeSafePanelSource).not.toContain('<GlassView')
    expect(nativeSafePanelSource).not.toContain('<BlurView')
  })

  it('does not render build metadata controls in the auth interface', () => {
    const flowSource = readFileSync(resolve(__dirname, '../entry-access/EntryBrandAccessFlow.tsx'), 'utf-8')

    expect(flowSource).not.toContain('RuntimeBuildMarker')
    expect(flowSource).not.toContain('runtimeBuildMarkerText')
  })

  it('opens the 1.1 review link on the Lottie splash without redirecting authenticated users', () => {
    mockRouteParams = { stage: '1.1' }
    mockAuthOverride = {
      role: 'customer',
      session: { user: { app_metadata: {}, user_metadata: {} } },
    }

    render(<LoginRoleSurface />)

    expect(screen.getByTestId('auth-splash-screen')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-splash-1-1')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-welcome-nestscout-logo')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-welcome-nestscout-logo-lottie')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-welcome-nestscout-logo-static')).toBeNull()
    act(() => {
      jest.advanceTimersByTime(4000)
    })
    expect(screen.getByTestId('auth-splash-1-1')).toBeOnTheScreen()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('supports direct review links without restoring the removed welcome section', () => {
    const stages = [
      ['1.3', 'auth-role-gate-screen'],
      ['1.4', 'auth-login-screen'],
      ['1.5', 'auth-register-screen'],
      ['1.6', 'auth-onboarding-screen'],
    ] as const

    for (const [stage, testID] of stages) {
      mockRouteParams = { stage }
      const view = render(<LoginRoleSurface />)
      expect(screen.getByTestId(testID)).toBeOnTheScreen()
      expect(mockReplace).not.toHaveBeenCalled()
      view.unmount()
    }
  })

  it('auto-advances from splash directly to the role gate after the welcome section is removed', () => {
    render(<LoginRoleSurface />)

    expect(screen.getByTestId('auth-splash-screen')).toBeOnTheScreen()

    act(() => {
      jest.advanceTimersByTime(1550)
    })

    expect(screen.getByTestId('auth-splash-screen')).toBeOnTheScreen()

    act(() => {
      jest.advanceTimersByTime(2650)
    })

    expect(screen.getByTestId('auth-role-gate-screen')).toBeOnTheScreen()
  })

  it('maps the former welcome review link into the role-first login gate without guest entry', () => {
    mockRouteParams = { stage: '1.2' }
    render(<LoginRoleSurface />)

    expect(screen.getByTestId('auth-role-gate-screen')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-role-gate-content')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-entry-role-options')).toHaveProp('accessibilityRole', 'radiogroup')
    expect(screen.getByTestId('auth-entry-role-options')).toHaveProp('accessibilityLabel', 'Chọn vai trò')
    expect(screen.getByTestId('auth-entry-role-customer')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-entry-role-worker')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-entry-role-customer')).toHaveProp('accessibilityState', { checked: true })
    expect(screen.queryByText('Phổ biến')).toBeNull()
    expect(screen.queryByTestId('auth-entry-role-guest')).toBeNull()
    expect(mockEnterGuestMode).not.toHaveBeenCalled()
  })

  it('renders the role gate and login access copy entirely in English mode', () => {
    mockLanguage = 'en'
    mockRouteParams = { stage: '1.3' }
    render(<LoginRoleSurface />)

    expect(screen.getByTestId('auth-entry-role-options')).toHaveProp('accessibilityLabel', 'Choose your role')
    expect(screen.getByText('Customer')).toBeOnTheScreen()
    expect(screen.getByText('Service partner')).toBeOnTheScreen()
    expect(screen.getByText('Continue as Customer')).toBeOnTheScreen()
    expect(screen.queryByText('Khách hàng')).toBeNull()
    expect(screen.queryByText('Đối tác thợ')).toBeNull()

    fireEvent.press(screen.getByTestId('auth-role-continue'))

    expect(screen.getByTestId('auth-login-submit')).toHaveTextContent('Sign in')
    expect(screen.getByText('Welcome\nback.')).toBeOnTheScreen()
    expect(screen.getByText('Remember me')).toBeOnTheScreen()
    expect(screen.getByText('Forgot password?')).toBeOnTheScreen()
    expect(screen.queryByText('Đăng nhập')).toBeNull()
    expect(screen.queryByText('Ghi nhớ đăng nhập')).toBeNull()
  })

  it('maps provider errors at the auth UI boundary instead of leaking the other language', async () => {
    mockLanguage = 'en'
    mockRouteParams = { stage: '1.4' }
    mockSignInWithPassword.mockResolvedValueOnce({ success: false, error: 'Email/SDT hoặc mật khẩu không đúng' })
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'tu@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => expect(screen.getByText('Email/phone or password is incorrect.')).toBeOnTheScreen())
    expect(screen.queryByText('Email/SDT hoặc mật khẩu không đúng')).toBeNull()
  })

  it('localizes splash, registration, recovery, and onboarding in English mode', () => {
    mockLanguage = 'en'
    mockRouteParams = { stage: '1.1' }
    const splash = render(<LoginRoleSurface />)

    expect(screen.getByText('Kael is getting everything ready')).toBeOnTheScreen()
    expect(screen.getByText('Trusted home services, within reach.')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-welcome-nestscout-logo')).toHaveProp('accessibilityLabel', 'NestScout Aurora Nest logo')
    splash.unmount()

    mockRouteParams = { stage: '1.5' }
    const registration = render(<LoginRoleSurface />)
    expect(screen.getByText('Create your\naccount.')).toBeOnTheScreen()
    expect(screen.getByText('Full name')).toBeOnTheScreen()
    expect(screen.getByText('I agree to the NestScout Terms of Use and Privacy Policy.')).toBeOnTheScreen()
    registration.unmount()

    mockRouteParams = { stage: '1.4' }
    const recovery = render(<LoginRoleSurface />)
    expect(screen.getByTestId('auth-login-password-input')).toHaveProp('placeholder', 'Enter your password')
    expect(screen.getByLabelText('Show password')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('auth-customer-forgot-password'))
    expect(screen.getByText('Password recovery')).toBeOnTheScreen()
    expect(screen.getByText('Recover your\npassword.')).toBeOnTheScreen()
    expect(screen.getByText('Registered email')).toBeOnTheScreen()
    recovery.unmount()

    mockRouteParams = { stage: '1.6' }
    render(<LoginRoleSurface />)
    expect(screen.getByText('Welcome\nhome.')).toBeOnTheScreen()
    expect(screen.getByText('Clear understanding')).toBeOnTheScreen()
    expect(screen.getByText('Get started')).toBeOnTheScreen()
    expect(screen.getByLabelText('Kael, your home assistant')).toBeOnTheScreen()
  })

  it('uses a same-language generic fallback for an unrecognized provider error', async () => {
    mockLanguage = 'en'
    mockRouteParams = { stage: '1.4' }
    mockSignInWithPassword.mockResolvedValueOnce({ success: false, error: 'Lỗi nội bộ riêng 42' })
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'tu@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => expect(screen.getByText('Unable to sign in. Please try again.')).toBeOnTheScreen())
    expect(screen.queryByText('Lỗi nội bộ riêng 42')).toBeNull()
  })

  it('re-localizes a visible auth error when the selected language changes', async () => {
    mockRouteParams = { stage: '1.4' }
    mockSignInWithPassword.mockResolvedValueOnce({ success: false, error: 'Lỗi nội bộ riêng 42' })
    const view = render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'tu@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))
    await waitFor(() => expect(screen.getByText('Chưa thể đăng nhập. Vui lòng thử lại.')).toBeOnTheScreen())

    mockLanguage = 'en'
    view.rerender(<LoginRoleSurface />)

    expect(screen.getByText('Unable to sign in. Please try again.')).toBeOnTheScreen()
    expect(screen.queryByText('Chưa thể đăng nhập. Vui lòng thử lại.')).toBeNull()
  })

  it('keeps the time-aware role greeting stable while a role is selected', () => {
    mockRouteParams = { stage: '1.3' }
    render(<LoginRoleSurface />)

    const headline = screen.getByTestId('auth-role-gate-greeting').props.children as string
    const lead = screen.getByTestId('auth-role-gate-greeting-lead').props.children as string
    expect(screen.getByTestId('auth-role-gate-greeting')).toHaveStyle({ fontSize: 29, lineHeight: 35 })
    expect(screen.queryByTestId('auth-role-gate-signature-shell')).toBeNull()
    expect(screen.queryByTestId('auth-role-gate-greeting-signature')).toBeNull()
    expect(screen.getByTestId('auth-entry-role-customer-layout')).toHaveStyle({ flex: 3 })
    expect(screen.getByTestId('auth-entry-role-worker-layout')).toHaveStyle({ flex: 1 })

    fireEvent.press(screen.getByTestId('auth-entry-role-worker'))
    expect(screen.getByTestId('auth-entry-role-customer-layout')).toHaveStyle({ flex: 1 })
    expect(screen.getByTestId('auth-entry-role-worker-layout')).toHaveStyle({ flex: 3 })

    fireEvent.press(screen.getByTestId('auth-entry-role-customer'))
    expect(screen.getByTestId('auth-entry-role-customer-layout')).toHaveStyle({ flex: 3 })
    expect(screen.getByTestId('auth-entry-role-worker-layout')).toHaveStyle({ flex: 1 })

    expect(screen.getByTestId('auth-role-gate-greeting')).toHaveTextContent(headline)
    expect(screen.getByTestId('auth-role-gate-greeting-lead')).toHaveTextContent(lead)
  })

  it('offers Google and Apple only to customer login', async () => {
    mockRouteParams = { stage: '1.4' }
    render(<LoginRoleSurface />)

    expect(screen.getByTestId('auth-provider-options')).toHaveStyle({ flexDirection: 'row' })
    expect(screen.getByTestId('auth-client-google-primary')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-client-apple-secondary')).toBeOnTheScreen()
    expect(screen.getByText('Google')).toHaveStyle({ fontSize: 13, lineHeight: 18 })
    expect(screen.getByText('Apple')).toHaveStyle({ fontSize: 13, lineHeight: 18 })
    expect(screen.queryByTestId('auth-client-gmail-secondary')).toBeNull()
    expect(screen.queryByTestId('auth-client-facebook-secondary')).toBeNull()

    fireEvent.press(screen.getByTestId('auth-client-google-primary'))

    await waitFor(() => {
      expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1)
    })
    fireEvent.press(screen.getByTestId('auth-client-apple-secondary'))

    await waitFor(() => {
      expect(mockSignInWithApple).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByTestId('auth-onboarding-screen')).toBeNull()
  })

  it('accepts a Vietnamese mobile number for customer login, remembers the latest identifier, and sends it as E.164', async () => {
    mockRouteParams = { stage: '1.4' }
    mockSignInWithPassword.mockResolvedValueOnce({ success: true })
    render(<LoginRoleSurface />)

    expect(screen.getByText('Thư điện tử hoặc SĐT')).toBeOnTheScreen()
    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), '090 123 4567')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith('+84901234567', 'secret123')
    })
    expect(mockRememberAuthIdentifier).toHaveBeenCalledWith('090 123 4567')
    expect(mockReplace).toHaveBeenCalledWith('/(customer)/home')
    expect(screen.queryByTestId('auth-onboarding-screen')).toBeNull()
  })

  it('prefills the latest remembered identifier when the login screen reopens', async () => {
    mockRouteParams = { stage: '1.4' }
    mockGetRememberedAuthIdentifier.mockResolvedValueOnce('tu@example.com')
    render(<LoginRoleSurface />)

    await waitFor(() => {
      expect(screen.getByTestId('auth-login-email-input')).toHaveProp('value', 'tu@example.com')
    })
  })

  it('blocks malformed customer identifiers before the provider is called', () => {
    mockRouteParams = { stage: '1.4' }
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), '0112345678')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    expect(screen.getByText('SĐT Việt Nam chưa đúng định dạng.')).toBeOnTheScreen()
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
  })

  it('sends a real password-recovery request without asking for an unsupported second channel', async () => {
    mockRouteParams = { stage: '1.4' }
    render(<LoginRoleSurface />)

    fireEvent.press(screen.getByTestId('auth-customer-forgot-password'))

    expect(screen.getByTestId('auth-password-recovery-panel')).toBeOnTheScreen()
    expect(screen.getByText('Thư điện tử đã đăng ký')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-recovery-secondary-input')).toBeNull()
    fireEvent.changeText(screen.getByTestId('auth-recovery-identifier-input'), 'tu@example.com')
    fireEvent.press(screen.getByTestId('auth-recovery-submit'))

    await waitFor(() => {
      expect(mockRequestPasswordRecovery).toHaveBeenCalledWith('tu@example.com')
      expect(screen.getByText('Nếu email thuộc một tài khoản NestScout, liên kết đặt lại mật khẩu đã được gửi.')).toBeOnTheScreen()
    })
  })

  it('does not advertise phone recovery before an SMS provider exists', () => {
    mockRouteParams = { stage: '1.4' }
    render(<LoginRoleSurface />)

    fireEvent.press(screen.getByTestId('auth-customer-forgot-password'))
    fireEvent.changeText(screen.getByTestId('auth-recovery-identifier-input'), '090 123 4567')
    fireEvent.press(screen.getByTestId('auth-recovery-submit'))

    expect(screen.getByText('Khôi phục bằng SĐT chưa sẵn sàng. Vui lòng dùng thư điện tử.')).toBeOnTheScreen()
    expect(mockRequestPasswordRecovery).not.toHaveBeenCalled()
  })

  it('keeps a recovery session on the password-reset screen until the new password is saved', async () => {
    mockAuthOverride = {
      passwordRecoveryPending: true,
      session: { user: { app_metadata: {}, id: 'customer_test_1', user_metadata: {} } },
    }
    render(<LoginRoleSurface />)

    expect(screen.getByTestId('auth-password-reset-screen')).toBeOnTheScreen()
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.changeText(screen.getByTestId('auth-reset-password-input'), 'NewSafe123')
    fireEvent.changeText(screen.getByTestId('auth-reset-password-confirmation-input'), 'NewSafe123')
    fireEvent.press(screen.getByTestId('auth-reset-password-submit'))

    await waitFor(() => {
      expect(mockCompletePasswordRecovery).toHaveBeenCalledWith('NewSafe123')
      expect(screen.getByText('Mật khẩu đã được cập nhật.')).toBeOnTheScreen()
    })

    fireEvent.press(screen.getByTestId('auth-reset-password-login'))

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled()
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login?stage=login')
    })
  })

  it('requires explicit terms consent before customer registration', async () => {
    mockRouteParams = { stage: '1.5' }
    render(<LoginRoleSurface />)

    const terms = screen.getByTestId('auth-register-terms')
    expect(terms).toHaveProp('accessibilityState', { checked: false })

    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Tu Phan')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'tu@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    expect(mockSignUpWithIdentifier).not.toHaveBeenCalled()
    expect(screen.getByText('Bạn cần đồng ý với điều khoản để tiếp tục.')).toBeOnTheScreen()

    fireEvent.press(terms)
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    await waitFor(() => expect(mockSignUpWithIdentifier).toHaveBeenCalledTimes(1))
  })

  it('shows registration guidance instead of a connection error for an empty form', () => {
    mockRouteParams = { stage: '1.5' }
    render(<LoginRoleSurface />)

    fireEvent.press(screen.getByTestId('auth-register-submit'))

    expect(screen.getByText('Kiểm tra họ tên, thư điện tử hoặc SĐT và mật khẩu tối thiểu 8 ký tự.')).toBeOnTheScreen()
    expect(screen.queryByText('Không thể kết nối. Vui lòng thử lại.')).toBeNull()
    expect(mockSignUpWithIdentifier).not.toHaveBeenCalled()
  })

  it('shows the email-confirmation step when the created account has no active session', async () => {
    mockRouteParams = { stage: '1.5' }
    mockSignUpWithIdentifier.mockResolvedValueOnce({ success: true, requiresEmailConfirmation: true })
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Tu Phan')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'tu@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-terms'))
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    await waitFor(() => {
      expect(mockSignUpWithIdentifier).toHaveBeenCalledWith({
        displayName: 'Tu Phan',
        identifier: 'tu@example.com',
        password: 'secret123',
      })
    })
    expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.getByTestId('auth-signup-confirmation-screen')).toBeOnTheScreen()
    expect(screen.getByText('Tài khoản đã được tạo. Mở thư điện tử để xác nhận, rồi quay lại đăng nhập.')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('auth-signup-confirmation-login'))
    expect(screen.getByTestId('auth-login-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-onboarding-screen')).toBeNull()
  })

  it('explains email confirmation instead of an invalid-credentials error', async () => {
    mockRouteParams = { stage: '1.4' }
    mockSignInWithPassword.mockResolvedValueOnce({
      success: false,
      error: 'Thư điện tử chưa được xác nhận. Hãy kiểm tra email rồi đăng nhập lại.',
    })
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'tu@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => {
      expect(screen.getByText('Thư điện tử chưa được xác nhận. Hãy kiểm tra email rồi đăng nhập lại.')).toBeOnTheScreen()
    })
  })

  it('keeps a safe signup validation message instead of falling back to a generic failure', async () => {
    mockRouteParams = { stage: '1.5' }
    mockSignUpWithIdentifier.mockResolvedValueOnce({
      success: false,
      error: 'Địa chỉ thư điện tử chưa đúng định dạng.',
    })
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Tu Phan')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'tu@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-terms'))
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    await waitFor(() => {
      expect(screen.getByText('Địa chỉ thư điện tử chưa đúng định dạng.')).toBeOnTheScreen()
    })
    expect(screen.queryByText('Chưa thể tạo tài khoản. Vui lòng thử lại.')).toBeNull()
  })

  it('keeps unsupported phone signup out of the customer form', () => {
    mockRouteParams = { stage: '1.5' }
    render(<LoginRoleSurface />)

    expect(screen.getByText('Thư điện tử')).toBeOnTheScreen()
    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Tu Phan')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), '0912345678')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    expect(screen.getByText('Đăng ký bằng SĐT chưa sẵn sàng. Vui lòng dùng thư điện tử.')).toBeOnTheScreen()
    expect(mockSignUpWithIdentifier).not.toHaveBeenCalled()
  })

  it('routes a ready customer registration directly to Customer Home', async () => {
    mockRouteParams = { stage: '1.5' }
    mockSignUpWithIdentifier.mockResolvedValueOnce({ success: true })
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Tu Phan')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'tu@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-terms'))
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(customer)/home')
    })
    expect(screen.queryByTestId('auth-onboarding-screen')).toBeNull()
  })

  it('keeps a failed worker account creation out of application review', async () => {
    mockSignUpWithIdentifier.mockResolvedValueOnce({ success: false, error: 'Không thể tạo tài khoản. Vui lòng thử lại sau.' })
    mockRouteParams = { stage: '1.3', role: 'worker' }
    render(<LoginRoleSurface />)

    fireEvent.press(screen.getByTestId('auth-role-continue'))

    expect(screen.getByTestId('auth-login-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-client-google-primary')).toBeNull()
    expect(screen.queryByTestId('auth-client-apple-secondary')).toBeNull()
    expect(screen.queryByTestId('auth-client-gmail-secondary')).toBeNull()
    expect(screen.queryByTestId('auth-client-facebook-secondary')).toBeNull()

    fireEvent.press(screen.getByTestId('auth-client-register-email'))
    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Worker One')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-terms'))
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    await waitFor(() => {
      expect(mockSignUpWithIdentifier).toHaveBeenCalledWith({
        displayName: 'Worker One',
        identifier: 'worker@example.com',
        password: 'secret123',
      })
    })
    expect(mockSubmitWorkerApplication).not.toHaveBeenCalled()
    expect(screen.getByText('Chưa thể tạo tài khoản. Vui lòng thử lại.')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-onboarding-screen')).toBeNull()
  })

  it('submits the deferred worker application after customer-role login', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ success: true, role: 'customer' })
    mockAuthOverride = {
      profileStatus: 'ready',
      role: 'customer',
      session: { user: { app_metadata: {}, user_metadata: {} } },
    }
    mockRouteParams = { stage: '1.4', role: 'worker' }
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => expect(screen.getByTestId('auth-onboarding-screen')).toBeOnTheScreen())
    expect(mockSubmitWorkerApplication).toHaveBeenCalledWith({
      contact: 'worker@example.com',
      language: 'vi',
    })
    fireEvent.press(screen.getByTestId('auth-onboarding-start'))

    await waitFor(() => {
      expect(screen.getByText('Hồ sơ thợ đã được gửi xét duyệt. NestScout sẽ liên hệ trước khi cấp quyền thợ.')).toBeOnTheScreen()
    })
    expect(screen.queryByText('Tài khoản đã được xác nhận, nhưng hồ sơ thợ chưa được gửi. Vui lòng thử lại sau.')).toBeNull()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('does not duplicate a worker application when the resolved account is already a worker', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ success: true, role: 'worker' })
    mockAuthOverride = {
      profileStatus: 'ready',
      role: 'worker',
      session: { user: { app_metadata: {}, user_metadata: {} } },
    }
    mockRouteParams = { stage: '1.4', role: 'worker' }
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => expect(screen.getByTestId('auth-onboarding-screen')).toBeOnTheScreen())
    expect(mockSubmitWorkerApplication).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId('auth-onboarding-start'))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(worker)/home'))
  })

  it('keeps a failed deferred worker application on the auth flow without a false review claim', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ success: true, role: 'customer' })
    mockSubmitWorkerApplication.mockResolvedValueOnce({ success: false, error: 'Không thể gửi hồ sơ lúc này.' })
    mockAuthOverride = {
      profileStatus: 'ready',
      role: 'customer',
      session: { user: { app_metadata: {}, user_metadata: {} } },
    }
    mockRouteParams = { stage: '1.4', role: 'worker' }
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => expect(screen.getByText('Không thể gửi hồ sơ xét duyệt lúc này. Vui lòng thử lại.')).toBeOnTheScreen())
    expect(screen.queryByText('Không thể gửi hồ sơ lúc này.')).toBeNull()
    expect(screen.queryByTestId('auth-onboarding-screen')).toBeNull()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('submits worker review only after signup returns an authenticated session', async () => {
    mockSignUpWithIdentifier.mockResolvedValueOnce({ success: true })
    mockAuthOverride = {
      profileStatus: 'ready',
      role: 'customer',
      session: { user: { app_metadata: {}, user_metadata: {} } },
    }
    mockRouteParams = { stage: '1.3', role: 'worker' }
    render(<LoginRoleSurface />)

    fireEvent.press(screen.getByTestId('auth-role-continue'))
    fireEvent.press(screen.getByTestId('auth-client-register-email'))
    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Worker One')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-terms'))
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    await waitFor(() => {
      expect(mockSubmitWorkerApplication).toHaveBeenCalledWith({
        contact: 'worker@example.com',
        language: 'vi',
      })
    })
    expect(mockSignUpWithIdentifier.mock.invocationCallOrder[0]).toBeLessThan(
      mockSubmitWorkerApplication.mock.invocationCallOrder[0]!,
    )
    expect(screen.getByTestId('auth-onboarding-screen')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('auth-onboarding-start'))

    await waitFor(() => {
      expect(screen.getByText('Hồ sơ thợ đã được gửi xét duyệt. NestScout sẽ liên hệ trước khi cấp quyền thợ.')).toBeOnTheScreen()
    })
    expect(mockReplace).not.toHaveBeenCalledWith('/(worker)/home')
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/home')
  })

  it('does not redirect an in-flight worker signup to customer home when the hardened trigger resolves customer role', async () => {
    let resolveSignup!: (result: { success: boolean }) => void
    mockSignUpWithIdentifier.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSignup = resolve
    }))
    const view = render(<LoginRoleSurface />)

    act(() => {
      jest.advanceTimersByTime(1550)
      jest.advanceTimersByTime(2650)
    })
    fireEvent.press(screen.getByTestId('auth-entry-role-worker'))
    fireEvent.press(screen.getByTestId('auth-role-continue'))
    fireEvent.press(screen.getByTestId('auth-client-register-email'))
    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Worker One')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-terms'))
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    await waitFor(() => expect(mockSignUpWithIdentifier).toHaveBeenCalledTimes(1))
    mockAuthOverride = {
      profileStatus: 'ready',
      role: 'customer',
      session: { user: { app_metadata: {}, user_metadata: {} } },
    }
    view.rerender(<LoginRoleSurface />)

    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/home')

    await act(async () => {
      resolveSignup({ success: true })
    })
    await waitFor(() => expect(mockSubmitWorkerApplication).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('auth-onboarding-screen')).toBeOnTheScreen()
  })

  it('redirects ready authenticated profiles outside review mode', () => {
    mockAuthOverride = {
      profileStatus: 'ready',
      role: 'customer',
      session: { user: { app_metadata: {}, user_metadata: {} } },
    }

    render(<LoginRoleSurface />)

    expect(mockReplace).toHaveBeenCalledWith('/(customer)/home')
  })
})
