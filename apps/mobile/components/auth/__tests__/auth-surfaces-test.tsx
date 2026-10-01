import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mockReplace = jest.fn()
const mockRefreshProfile = jest.fn(async () => null)
const mockEnterGuestMode = jest.fn()
const mockSignInWithGoogle = jest.fn(async () => ({ success: true }))
const mockSignInWithApple = jest.fn(async () => ({ success: true }))
const mockSignInWithPassword = jest.fn(async (): Promise<{ success: boolean; error?: string; role?: 'admin' | 'customer' | 'worker' }> => ({ success: false, error: 'Không thể đăng nhập' }))
const mockSignUpWithIdentifier = jest.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: true }))
const mockRequestPasswordRecovery = jest.fn(async () => ({ success: true }))
const mockCompletePasswordRecovery = jest.fn(async () => ({ success: true }))
const mockSignOut = jest.fn(async () => undefined)
const workerReadiness = (status: 'not_submitted' | 'pending_review' | 'changes_requested' | 'rejected' | 'approved', reason: string | null = null) => ({
  success: true,
  readiness: {
    application: {
      application_id: status === 'not_submitted' ? null : '11111111-1111-4111-8111-111111111111',
      reason,
      status,
    },
  },
})
const mockGetWorkerReadiness = jest.fn(async () => workerReadiness('pending_review'))
const mockSubmitWorkerApplication = jest.fn(async (): Promise<{
  applicationId?: string
  success: boolean
  error?: string
  status?: 'not_submitted' | 'pending_review' | 'changes_requested' | 'rejected' | 'approved'
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
    getWorkerReadiness: mockGetWorkerReadiness,
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

jest.mock('@/lib/remembered-auth-credentials', () => ({
  clearRememberedAuthCredentials: jest.fn(async () => undefined),
  getRememberedAuthCredentials: jest.fn(async () => null),
  rememberAuthCredentials: jest.fn(async () => undefined),
}))

const mockedRememberedIdentifier = jest.requireMock('@/lib/remembered-auth-identifier') as {
  clearRememberedAuthIdentifier: jest.Mock
  getRememberedAuthIdentifier: jest.Mock
  rememberAuthIdentifier: jest.Mock
}
const mockGetRememberedAuthIdentifier = mockedRememberedIdentifier.getRememberedAuthIdentifier
const mockRememberAuthIdentifier = mockedRememberedIdentifier.rememberAuthIdentifier
const mockedRememberedCredentials = jest.requireMock('@/lib/remembered-auth-credentials') as {
  clearRememberedAuthCredentials: jest.Mock
  getRememberedAuthCredentials: jest.Mock
  rememberAuthCredentials: jest.Mock
}
const mockClearRememberedAuthCredentials = mockedRememberedCredentials.clearRememberedAuthCredentials
const mockGetRememberedAuthCredentials = mockedRememberedCredentials.getRememberedAuthCredentials
const mockRememberAuthCredentials = mockedRememberedCredentials.rememberAuthCredentials

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => mockLanguage,
  }
})

import { LoginRoleSurface } from '../auth-surfaces'
import { EntryBrandAccessFlow } from '../entry-access/EntryBrandAccessFlow'

beforeEach(() => {
  jest.useFakeTimers()
  mockAuthOverride = {}
  mockLanguage = 'vi'
  mockRouteParams = {}
  jest.clearAllMocks()
  mockGetWorkerReadiness.mockResolvedValue(workerReadiness('pending_review'))
  mockGetRememberedAuthIdentifier.mockResolvedValue(null)
  mockGetRememberedAuthCredentials.mockResolvedValue(null)
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

  it('uses the ZIP logo motion and removes the legacy Lottie runtime', () => {
    const flowSource = readFileSync(resolve(__dirname, '../entry-access/EntryBrandAccessFlow.tsx'), 'utf-8')
    const logoSource = readFileSync(resolve(__dirname, '../entry-access/nestscout-logo-motion-mark.tsx'), 'utf-8')
    const authSurfaceSource = readFileSync(resolve(__dirname, '../auth-surfaces.tsx'), 'utf-8')
    const appConfigSource = readFileSync(resolve(__dirname, '../../../app.config.ts'), 'utf-8')

    expect(flowSource).toContain('NestScoutLogoMotionMark')
    expect(flowSource).not.toContain('LottieLogoMark')
    expect(flowSource).not.toContain('SplashBrandLockup')
    expect(flowSource).not.toContain('SplashLoadingBar')
    expect(flowSource).not.toContain('splashFoot')
    expect(flowSource).not.toContain('preparing')
    expect(logoSource).toContain('nestscout-horizontal-lockup.png')
    expect(logoSource).toContain('nestscout-symbol-transparent-1024.png')
    expect(logoSource).not.toContain('borderColor:')
    expect(logoSource).not.toContain('borderWidth:')
    expect(logoSource).not.toContain('borderRadius: 24')
    expect(authSurfaceSource).not.toContain('AuroraNest_Logo_Lottie')
    expect(authSurfaceSource).not.toContain('nestscout-aurora-nest-north-star-awakening.json')
    expect(appConfigSource).toContain("'expo-splash-screen'")
    expect(appConfigSource).not.toContain("image: './assets/nestscout-aurora-nest-foreground-1024.png'")
    expect(appConfigSource).toContain("image: './assets/prototypes/nestscout-logo-motion/nestscout-horizontal-lockup.png'")
    expect(appConfigSource).toContain('imageWidth: 220')
    expect(existsSync(resolve(__dirname, '../entry-access/lottie-logo-mark.tsx'))).toBe(false)
    expect(existsSync(resolve(__dirname, '../../kael/kael-svg-lottie-view.tsx'))).toBe(false)
    expect(existsSync(resolve(__dirname, '../../../assets/lottie/nestscout-aurora-nest-north-star-awakening.json'))).toBe(false)
    expect(existsSync(resolve(__dirname, '../../../assets/lottie/nestscout-aurora-nest-approved-logo-transparent.png'))).toBe(false)
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

  it('opens the 1.1 review link on the logo motion splash without redirecting authenticated users', () => {
    mockRouteParams = { stage: '1.1' }
    mockAuthOverride = {
      role: 'customer',
      session: { user: { app_metadata: {}, user_metadata: {} } },
    }

    render(<LoginRoleSurface />)

    expect(screen.getByTestId('auth-splash-screen')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-splash-1-1')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-welcome-nestscout-logo')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-welcome-nestscout-logo-motion')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-welcome-nestscout-logo-symbol')).toBeOnTheScreen()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText('Kael đang chuẩn bị mọi thứ')).toBeNull()
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
      jest.advanceTimersByTime(1999)
    })

    expect(screen.getByTestId('auth-splash-screen')).toBeOnTheScreen()

    act(() => {
      jest.advanceTimersByTime(1)
    })

    expect(screen.getByTestId('auth-role-gate-screen')).toBeOnTheScreen()
  })

  it('keeps the branded splash visible before loading remembered credentials into Login', async () => {
    mockGetRememberedAuthCredentials.mockResolvedValue({
      identifier: 'tu@example.com',
      password: 'secret123',
      role: 'customer',
    })

    render(<LoginRoleSurface />)

    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('auth-splash-1-1')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-login-email-input')).toBeNull()

    act(() => {
      jest.advanceTimersByTime(2000)
    })

    expect(screen.getByTestId('auth-role-gate-screen')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('auth-entry-role-customer'))

    await waitFor(() => {
      expect(screen.getByTestId('auth-login-email-input')).toHaveProp('value', 'tu@example.com')
      expect(screen.getByTestId('auth-login-password-input')).toHaveProp('value', 'secret123')
    })
  })

  it('maps the former welcome review link into the role-first login gate without guest entry', () => {
    mockRouteParams = { stage: '1.2' }
    render(<LoginRoleSurface />)

    expect(screen.getByTestId('auth-role-gate-screen')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-role-gate-content')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-role-gate-decision-field')).toHaveStyle({ flex: 1 })
    expect(screen.getByTestId('auth-entry-role-options')).toHaveProp('accessibilityRole', 'radiogroup')
    expect(screen.getByTestId('auth-entry-role-options')).toHaveProp('accessibilityLabel', 'Chọn vai trò')
    expect(screen.getByTestId('auth-entry-role-customer')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-entry-role-worker')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-role-gate-brand')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-role-gate-greeting')).toBeNull()
    expect(screen.queryByTestId('auth-entry-role-customer-image')).toBeNull()
    expect(screen.queryByTestId('auth-entry-role-worker-image')).toBeNull()
    expect(screen.queryByTestId('auth-entry-role-customer-arrow')).toBeNull()
    expect(screen.queryByTestId('auth-entry-role-worker-arrow')).toBeNull()
    expect(screen.getByTestId('auth-entry-role-customer')).toHaveProp('accessibilityState', { selected: false, disabled: false })
    expect(screen.queryByText('Phổ biến')).toBeNull()
    expect(screen.queryByTestId('auth-entry-role-guest')).toBeNull()
    expect(mockEnterGuestMode).not.toHaveBeenCalled()
  })

  it('renders the role gate and login access copy entirely in English mode', () => {
    mockLanguage = 'en'
    mockRouteParams = { stage: '1.3' }
    render(<LoginRoleSurface />)

    expect(screen.getByTestId('auth-entry-role-options')).toHaveProp('accessibilityLabel', 'Choose your role')
    expect(screen.getByText('Choose your path')).toBeOnTheScreen()
    expect(screen.getByText('Customer', { includeHiddenElements: true })).toBeOnTheScreen()
    expect(screen.getByText('Service partner', { includeHiddenElements: true })).toBeOnTheScreen()
    expect(screen.queryByText('Continue as Customer')).toBeNull()
    expect(screen.queryByTestId('auth-role-continue')).toBeNull()
    expect(screen.queryByText('Khách hàng')).toBeNull()
    expect(screen.queryByText('Đối tác thợ')).toBeNull()

    fireEvent.press(screen.getByTestId('auth-entry-role-customer'))

    expect(screen.getByTestId('auth-login-submit')).toHaveTextContent('Sign in')
    expect(screen.getByText('Welcome Back..!')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-login-email-input')).toHaveProp('placeholder', 'email@example.com or 090 123 4567')
    expect(screen.queryByText('Continue where you left off with Kael.')).toBeNull()
    expect(screen.getByText('Remember me')).toBeOnTheScreen()
    expect(screen.getByText('Forgot password?')).toBeOnTheScreen()
    expect(screen.queryByText('Đăng nhập')).toBeNull()
    expect(screen.queryByText('Ghi nhớ đăng nhập')).toBeNull()
  })

  it('enters the customer role on a single tap', () => {
    mockRouteParams = { stage: '1.3' }
    render(<LoginRoleSurface />)

    const customerRole = screen.getByTestId('auth-entry-role-customer')
    expect(customerRole).toHaveProp('accessibilityHint', 'Chạm để tiếp tục với vai trò này.')
    expect(screen.queryByTestId('auth-role-continue')).toBeNull()
    expect(screen.queryByText('Tiếp tục với Khách hàng')).toBeNull()
    expect(customerRole).toHaveStyle({ position: 'absolute' })

    fireEvent.press(customerRole)
    expect(screen.getByTestId('auth-login-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-role-gate-screen')).toBeNull()
    expect(screen.getByTestId('auth-client-google-primary')).toBeOnTheScreen()
  })

  it('enters the worker role on a single tap', () => {
    mockRouteParams = { stage: '1.3' }
    render(<LoginRoleSurface />)

    const workerRole = screen.getByTestId('auth-entry-role-worker')
    expect(workerRole).toHaveProp('accessibilityHint', 'Chạm để tiếp tục với vai trò này.')
    expect(workerRole).toHaveStyle({ position: 'absolute' })

    fireEvent.press(workerRole)
    expect(screen.getByTestId('auth-login-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-client-google-primary')).toBeNull()
    expect(screen.queryByTestId('auth-client-apple-secondary')).toBeNull()
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

  it('shows a connection message when the auth service is unavailable instead of an invalid-credentials message', async () => {
    mockRouteParams = { stage: '1.4' }
    mockSignInWithPassword.mockResolvedValueOnce({
      success: false,
      error: 'Không thể kết nối dịch vụ đăng nhập. Vui lòng thử lại sau.',
    })
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'tu@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => expect(screen.getByText('Không thể kết nối. Vui lòng thử lại.')).toBeOnTheScreen())
    expect(screen.queryByText('Gmail hoặc SĐT hoặc mật khẩu không đúng.')).toBeNull()
  })

  it('localizes splash, registration, recovery, and onboarding in English mode', () => {
    mockLanguage = 'en'
    mockRouteParams = { stage: '1.1' }
    const splash = render(<LoginRoleSurface />)

    expect(screen.getByTestId('auth-welcome-nestscout-logo')).toHaveProp('accessibilityLabel', 'NestScout logo')
    splash.unmount()

    mockRouteParams = { stage: '1.5' }
    const registration = render(<LoginRoleSurface />)
    expect(screen.getByText('Create your account.')).toBeOnTheScreen()
    expect(screen.getByText('Create your account.')).toHaveProp('numberOfLines', 1)
    expect(screen.getByText('Email/phone')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-register-email-input')).toHaveProp('placeholder', 'email@example.com or 090 123 4567')
    expect(screen.getByText('Confirm password')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-register-password-confirmation-input')).toHaveProp('placeholder', 'Re-enter your password')
    expect(screen.queryByText('It takes less than a minute.')).toBeNull()
    expect(screen.getByText('Full name')).toBeOnTheScreen()
    expect(screen.getByText('I agree to the NestScout Terms of Use and Privacy Policy.')).toBeOnTheScreen()
    registration.unmount()

    mockRouteParams = { stage: '1.4' }
    const recovery = render(<LoginRoleSurface />)
    expect(screen.getByTestId('auth-login-password-input')).toHaveProp('placeholder', 'Enter your password')
    expect(screen.getByLabelText('Show password')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('auth-customer-forgot-password'))
    expect(screen.queryByText('Password recovery')).toBeNull()
    expect(screen.getByText('Recover your password.')).toBeOnTheScreen()
    expect(screen.getByText('Recover your password.')).toHaveProp('numberOfLines', 1)
    expect(screen.getByText('Registered email')).toBeOnTheScreen()
    recovery.unmount()

    mockRouteParams = { stage: '1.6' }
    render(<LoginRoleSurface />)
    expect(screen.getByText('Welcome\nhome.')).toBeOnTheScreen()
    expect(screen.getByText('Clear understanding')).toBeOnTheScreen()
    expect(screen.getByText('Get started')).toBeOnTheScreen()
    expect(screen.getByLabelText('Kael, your home assistant')).toBeOnTheScreen()
  })

  it('keeps customer registration title on one line without the removed lead', () => {
    mockRouteParams = { stage: '1.5' }
    render(<LoginRoleSurface />)

    expect(screen.getByText('Tạo tài khoản của bạn.')).toBeOnTheScreen()
    expect(screen.getByText('Tạo tài khoản của bạn.')).toHaveProp('numberOfLines', 1)
    expect(screen.getByTestId('auth-register-password-confirmation-input')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-register-password-confirmation-input')).toHaveProp('placeholder', 'Xác nhận mật khẩu')
    expect(screen.queryByText('Chỉ mất chưa đến một phút.')).toBeNull()
  })

  it('keeps worker registration title on one line, removes the worker lead, and shows confirmation', () => {
    mockRouteParams = { stage: '1.3', role: 'worker' }
    render(<LoginRoleSurface />)

    fireEvent.press(screen.getByTestId('auth-entry-role-worker'))
    fireEvent.press(screen.getByTestId('auth-client-register-email'))

    expect(screen.getByText('Tạo hồ sơ đối tác.')).toBeOnTheScreen()
    expect(screen.getByText('Tạo hồ sơ đối tác.')).toHaveProp('numberOfLines', 1)
    expect(screen.queryByText('Tạo tài khoản trước khi gửi hồ sơ xác thực.')).toBeNull()
    expect(screen.getByText('Xác nhận mật khẩu')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-register-password-confirmation-input')).toHaveProp('placeholder', 'Xác nhận mật khẩu')
  })

  it('blocks worker signup until the password confirmation matches', () => {
    mockRouteParams = { stage: '1.3', role: 'worker' }
    render(<LoginRoleSurface />)

    fireEvent.press(screen.getByTestId('auth-entry-role-worker'))
    fireEvent.press(screen.getByTestId('auth-client-register-email'))
    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Worker One')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.changeText(screen.getByTestId('auth-register-password-confirmation-input'), 'secret124')
    fireEvent.press(screen.getByTestId('auth-register-terms'))
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    expect(screen.getByText('Mật khẩu nhập lại không khớp.')).toBeOnTheScreen()
    expect(mockSignUpWithIdentifier).not.toHaveBeenCalled()
  })

  it('blocks customer signup until the password confirmation matches', async () => {
    mockRouteParams = { stage: '1.5' }
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Tu Phan')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'tu@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.changeText(screen.getByTestId('auth-register-password-confirmation-input'), 'secret124')
    fireEvent.press(screen.getByTestId('auth-register-terms'))
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    expect(screen.getByText('Mật khẩu nhập lại không khớp.')).toBeOnTheScreen()
    expect(mockSignUpWithIdentifier).not.toHaveBeenCalled()

    fireEvent.changeText(screen.getByTestId('auth-register-password-confirmation-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    await waitFor(() => expect(mockSignUpWithIdentifier).toHaveBeenCalledTimes(1))
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

  it('renders the approved static brand gate with no pre-selected role', () => {
    mockRouteParams = { stage: '1.3' }
    render(<LoginRoleSurface />)

    const roleGateSource = readFileSync(resolve(__dirname, '../entry-access/role-gate-screen.tsx'), 'utf-8')
    expect(roleGateSource).toContain('NestScoutLoginGate')
    expect(roleGateSource).toContain("language === 'vi' ? 'reference' : 'native'")
    expect(roleGateSource).not.toContain('RoleSelectionCards')
    expect(roleGateSource).not.toContain('nestscout-aurora-nest-role-gate-transparent.png')
    expect(roleGateSource).not.toContain('KaelCoreV9')
    expect(screen.getByTestId('auth-role-gate-brand')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-role-gate-greeting')).toBeNull()

    expect(screen.getByTestId('auth-entry-role-customer')).toHaveProp('accessibilityState', { selected: false, disabled: false })
    expect(screen.getByTestId('auth-entry-role-worker')).toHaveProp('accessibilityState', { selected: false, disabled: false })
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
    mockSignInWithPassword.mockResolvedValueOnce({ success: true, role: 'customer' })
    render(<LoginRoleSurface />)

    expect(screen.getByText('Gmail hoặc SĐT')).toBeOnTheScreen()
    expect(screen.getByText('Chào mừng trở lại!')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-login-email-input')).toHaveProp('placeholder', 'ten@vidu.vn hoặc 090 123 4567')
    expect(screen.queryByText('Tiếp tục nơi bạn đã dừng cùng Kael.')).toBeNull()
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

  it('opens the native relaunch form with the remembered credential pair and submits without re-entry', async () => {
    mockRouteParams = {}
    mockGetRememberedAuthCredentials.mockResolvedValue({
      identifier: 'tu@example.com',
      password: 'secret123',
      role: 'customer',
    })
    mockSignInWithPassword.mockResolvedValueOnce({ success: true, role: 'customer' })
    render(<LoginRoleSurface />)

    act(() => {
      jest.advanceTimersByTime(2_000)
    })

    expect(screen.getByTestId('auth-role-gate-screen')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('auth-entry-role-customer'))

    await waitFor(() => {
      expect(screen.getByTestId('auth-login-email-input')).toHaveProp('value', 'tu@example.com')
      expect(screen.getByTestId('auth-login-password-input')).toHaveProp('value', 'secret123')
    })
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith('tu@example.com', 'secret123')
      expect(mockRememberAuthCredentials).toHaveBeenCalledWith('tu@example.com', 'secret123', 'customer')
      expect(mockReplace).toHaveBeenCalledWith('/(customer)/home')
    })
  })

  it('clears the native credential pair when the user disables remembering', async () => {
    mockRouteParams = { stage: '1.4' }
    mockSignInWithPassword.mockResolvedValueOnce({ success: true, role: 'customer' })
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'tu@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-remember'))
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => {
      expect(mockClearRememberedAuthCredentials).toHaveBeenCalledTimes(1)
      expect(mockReplace).toHaveBeenCalledWith('/(customer)/home')
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
    expect(screen.getByText('Lấy lại mật khẩu.')).toBeOnTheScreen()
    expect(screen.queryByText('Khôi phục mật khẩu')).toBeNull()
    expect(screen.queryByText('Nhập thư điện tử đã đăng ký. NestScout sẽ gửi một liên kết đặt lại mật khẩu.')).toBeNull()
    expect(screen.getByText('Gmail đã đăng kí')).toBeOnTheScreen()
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
    fireEvent.changeText(screen.getByTestId('auth-register-password-confirmation-input'), 'secret123')
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

  it('does not open an email-confirmation step when signup is not session-ready', async () => {
    mockRouteParams = { stage: '1.5' }
    mockSignUpWithIdentifier.mockResolvedValueOnce({
      success: false,
      error: 'Đăng ký chưa sẵn sàng vì hệ thống vẫn yêu cầu xác minh. Vui lòng thử lại sau.',
    })
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Tu Phan')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'tu@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.changeText(screen.getByTestId('auth-register-password-confirmation-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-terms'))
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    await waitFor(() => {
      expect(mockSignUpWithIdentifier).toHaveBeenCalledWith({
        displayName: 'Tu Phan',
        identifier: 'tu@example.com',
        password: 'secret123',
      })
    })
    await waitFor(() => expect(screen.getByText('Đăng ký chưa sẵn sàng vì hệ thống vẫn yêu cầu xác minh. Vui lòng thử lại sau.')).toBeOnTheScreen())
    expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.queryByTestId('auth-signup-confirmation-screen')).toBeNull()
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
    fireEvent.changeText(screen.getByTestId('auth-register-password-confirmation-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-terms'))
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    await waitFor(() => {
      expect(screen.getByText('Địa chỉ thư điện tử chưa đúng định dạng.')).toBeOnTheScreen()
    })
    expect(screen.queryByText('Chưa thể tạo tài khoản. Vui lòng thử lại.')).toBeNull()
  })

  it('creates a customer account from a phone input without a form-level provider gate', async () => {
    mockRouteParams = { stage: '1.5' }
    mockSignUpWithIdentifier.mockResolvedValueOnce({ success: true })
    render(<LoginRoleSurface />)

    expect(screen.getByText('Gmail hoặc SĐT')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-register-email-input')).toHaveProp('placeholder', 'ten@vidu.vn hoặc 090 123 4567')
    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Tu Phan')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), '0912345678')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.changeText(screen.getByTestId('auth-register-password-confirmation-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-terms'))
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    await waitFor(() => {
      expect(mockSignUpWithIdentifier).toHaveBeenCalledWith({
        displayName: 'Tu Phan',
        identifier: '0912345678',
        password: 'secret123',
      })
      expect(mockReplace).toHaveBeenCalledWith('/(customer)/home')
    })
  })

  it('creates a worker account from an email before submitting the worker application', async () => {
    mockRouteParams = { stage: '1.3', role: 'worker' }
    render(<LoginRoleSurface />)

    fireEvent.press(screen.getByTestId('auth-entry-role-worker'))
    fireEvent.press(screen.getByTestId('auth-client-register-email'))
    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Worker One')
    expect(screen.getByText('Thư điện tử')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-register-email-input')).toHaveProp('placeholder', 'ten@vidu.vn')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.changeText(screen.getByTestId('auth-register-password-confirmation-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-terms'))
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    await waitFor(() => expect(mockSignUpWithIdentifier).toHaveBeenCalledWith({
      displayName: 'Worker One',
      identifier: 'worker@example.com',
      password: 'secret123',
    }))
    expect(mockSubmitWorkerApplication).toHaveBeenCalledWith({
      contact: 'worker@example.com',
      language: 'vi',
    })
  })

  it('routes a ready customer registration directly to Customer Home', async () => {
    mockRouteParams = { stage: '1.5' }
    mockSignUpWithIdentifier.mockResolvedValueOnce({ success: true })
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Tu Phan')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'tu@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.changeText(screen.getByTestId('auth-register-password-confirmation-input'), 'secret123')
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

    fireEvent.press(screen.getByTestId('auth-entry-role-worker'))

    expect(screen.getByTestId('auth-login-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-client-google-primary')).toBeNull()
    expect(screen.queryByTestId('auth-client-apple-secondary')).toBeNull()
    expect(screen.queryByTestId('auth-client-gmail-secondary')).toBeNull()
    expect(screen.queryByTestId('auth-client-facebook-secondary')).toBeNull()

    fireEvent.press(screen.getByTestId('auth-client-register-email'))
    expect(screen.getByText('Thư điện tử')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-register-email-input')).toHaveProp('placeholder', 'ten@vidu.vn')
    expect(screen.getByTestId('auth-register-password-confirmation-input')).toHaveProp('placeholder', 'Xác nhận mật khẩu')
    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Worker One')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.changeText(screen.getByTestId('auth-register-password-confirmation-input'), 'secret123')
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
    mockGetWorkerReadiness.mockResolvedValueOnce(workerReadiness('not_submitted'))
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
    expect(screen.getByText('Hồ sơ ứng tuyển đang được xem xét. Hệ thống sẽ không tự gửi thêm hồ sơ trùng lặp.')).toBeOnTheScreen()
    expect(screen.queryByText('Tài khoản đã được xác nhận, nhưng hồ sơ thợ chưa được gửi. Vui lòng thử lại sau.')).toBeNull()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('resubmits a changes-requested application only after explicit worker confirmation', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ success: true, role: 'customer' })
    mockGetWorkerReadiness.mockResolvedValue(workerReadiness('changes_requested', 'Bổ sung khu vực phục vụ.'))
    mockSubmitWorkerApplication.mockResolvedValueOnce({
      applicationId: '22222222-2222-4222-8222-222222222222',
      status: 'pending_review',
      success: true,
    })
    mockAuthOverride = {
      profileStatus: 'ready',
      role: 'customer',
      session: { user: { app_metadata: {}, email: 'worker@example.com', user_metadata: {} } },
    }
    mockRouteParams = { stage: '1.4', role: 'worker' }
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => expect(screen.getByTestId('auth-onboarding-screen')).toBeOnTheScreen())
    expect(screen.getByText('Hồ sơ ứng tuyển cần được bổ sung. Chỉ gửi lại khi bạn chủ động xác nhận.')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-worker-application-reason')).toHaveTextContent('Bổ sung khu vực phục vụ.')
    expect(screen.getByText('Gửi lại hồ sơ xét duyệt')).toBeOnTheScreen()
    expect(mockSubmitWorkerApplication).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId('auth-onboarding-start'))

    await waitFor(() => expect(mockSubmitWorkerApplication).toHaveBeenCalledWith({
      contact: 'worker@example.com',
      language: 'vi',
      revisionOfApplicationId: '11111111-1111-4111-8111-111111111111',
    }))
    expect(screen.getByText('Hồ sơ ứng tuyển đang được xem xét. Hệ thống sẽ không tự gửi thêm hồ sơ trùng lặp.')).toBeOnTheScreen()
    expect(screen.getByText('Kiểm tra trạng thái')).toBeOnTheScreen()
  })

  it('does not duplicate a worker application when the resolved account is already a worker', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ success: true, role: 'worker' })
    mockRouteParams = { stage: '1.4', role: 'worker' }
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(worker)/(tabs)/home'))
    expect(mockSubmitWorkerApplication).not.toHaveBeenCalled()
    expect(screen.queryByTestId('auth-onboarding-screen')).toBeNull()
  })

  it('uses the server worker role even when the customer gate was selected', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ success: true, role: 'worker' })
    mockRouteParams = { stage: '1.4', role: 'customer' }
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(worker)/(tabs)/home'))
    expect(mockSubmitWorkerApplication).not.toHaveBeenCalled()
    expect(screen.queryByTestId('auth-onboarding-screen')).toBeNull()
  })

  it('keeps a failed deferred worker application on the auth flow without a false review claim', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ success: true, role: 'customer' })
    mockGetWorkerReadiness.mockResolvedValueOnce(workerReadiness('not_submitted'))
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

    fireEvent.press(screen.getByTestId('auth-entry-role-worker'))
    fireEvent.press(screen.getByTestId('auth-client-register-email'))
    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Worker One')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.changeText(screen.getByTestId('auth-register-password-confirmation-input'), 'secret123')
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

    expect(screen.getByText('Hồ sơ ứng tuyển đang được xem xét. Hệ thống sẽ không tự gửi thêm hồ sơ trùng lặp.')).toBeOnTheScreen()
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
    fireEvent.press(screen.getByTestId('auth-client-register-email'))
    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Worker One')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.changeText(screen.getByTestId('auth-register-password-confirmation-input'), 'secret123')
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

  it('routes a signed-in owner admin directly to Admin Sections', async () => {
    mockRouteParams = { stage: '1.4' }
    mockSignInWithPassword.mockResolvedValueOnce({ success: true, role: 'admin' })
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'admin@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(admin)/sections')
    })
  })
})
