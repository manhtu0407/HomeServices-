import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mockReplace = jest.fn()
const mockRefreshProfile = jest.fn(async () => null)
const mockEnterGuestMode = jest.fn()
const mockSignInWithGoogle = jest.fn(async () => ({ success: true }))
const mockSignInWithPassword = jest.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: false, error: 'Không thể đăng nhập' }))
const mockSignUpWithIdentifier = jest.fn(async () => ({ success: true, needsConfirmation: true }))
const mockSignOut = jest.fn(async () => undefined)
const mockSubmitWorkerApplication = jest.fn(async () => ({ success: true }))
const mockUpdateCustomerProfile = jest.fn(async () => ({ success: true }))
let mockAuthOverride: Record<string, unknown> = {}
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
    profileStatus: 'idle',
    refreshProfile: mockRefreshProfile,
    role: null,
    session: null,
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
const mockClearRememberedAuthIdentifier = mockedRememberedIdentifier.clearRememberedAuthIdentifier
const mockGetRememberedAuthIdentifier = mockedRememberedIdentifier.getRememberedAuthIdentifier
const mockRememberAuthIdentifier = mockedRememberedIdentifier.rememberAuthIdentifier

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => 'vi',
  }
})

jest.mock('@/lib/runtime-config', () => ({
  mobileRuntimeConfig: {
    runtimeBuildInfo: {
      builtAt: '2026-07-03T00:00:00.000Z',
      easBuildId: 'build-123456',
      easBuildPlatform: 'ios',
      easBuildProfile: 'production',
      gitBranch: 'codex/customer-runtime-surface-wiring',
      gitSha: 'abc123def4567890',
      gitShortSha: 'abc123def456',
    },
  },
}))

import { LoginRoleSurface } from '../auth-surfaces'
import { kaelLottieRendererKind as splashLogoRendererKind } from '@/components/kael/kael-svg-lottie-view'

beforeEach(() => {
  jest.useFakeTimers()
  mockAuthOverride = {}
  mockRouteParams = {}
  jest.clearAllMocks()
  mockGetRememberedAuthIdentifier.mockResolvedValue(null)
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('LoginRoleSurface', () => {
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

  it('keeps the Email/SDT input stable while a customer starts entering a Vietnamese phone number', () => {
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

  it('keeps the runtime build marker hidden until an intentional long press', () => {
    mockRouteParams = { stage: '1.4' }

    render(<LoginRoleSurface />)

    expect(screen.queryByTestId('auth-runtime-marker')).toBeNull()

    fireEvent(screen.getByTestId('auth-runtime-marker-hotspot'), 'longPress')

    expect(screen.getByTestId('auth-runtime-marker')).toHaveTextContent(/abc123def456/)
    expect(screen.getByTestId('auth-runtime-marker')).toHaveTextContent(/codex\/customer-runtime-surface-wiring/)
    expect(screen.getByTestId('auth-runtime-marker')).toHaveTextContent(/production/)
    expect(screen.getByTestId('auth-runtime-marker')).toHaveTextContent(/ios/)
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
    expect(screen.getByTestId('auth-entry-role-customer')).toBeOnTheScreen()
    expect(screen.getByTestId('auth-entry-role-worker')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-entry-role-guest')).toBeNull()
    expect(mockEnterGuestMode).not.toHaveBeenCalled()
  })

  it('keeps the time-aware role greeting stable while a role is selected', () => {
    mockRouteParams = { stage: '1.3' }
    render(<LoginRoleSurface />)

    const headline = screen.getByTestId('auth-role-gate-greeting').props.children as string
    const lead = screen.getByTestId('auth-role-gate-greeting-lead').props.children as string
    const signature = screen.getByTestId('auth-role-gate-greeting-signature').props.children as string

    expect(screen.getByTestId('auth-role-gate-greeting')).toHaveStyle({ fontSize: 29, lineHeight: 35 })
    expect(screen.getByTestId('auth-role-gate-signature-shell')).toHaveStyle({ marginTop: 18 })
    expect(screen.getByTestId('auth-role-gate-signature-aura')).toHaveStyle({ borderWidth: 1, bottom: -2, left: -2, right: -2, top: -2 })

    fireEvent.press(screen.getByTestId('auth-entry-role-worker'))
    fireEvent.press(screen.getByTestId('auth-entry-role-customer'))

    expect(screen.getByTestId('auth-role-gate-greeting')).toHaveTextContent(headline)
    expect(screen.getByTestId('auth-role-gate-greeting-lead')).toHaveTextContent(lead)
    expect(screen.getByTestId('auth-role-gate-greeting-signature')).toHaveTextContent(signature)
  })

  it('keeps Google as the only customer provider', async () => {
    mockRouteParams = { stage: '1.4' }
    render(<LoginRoleSurface />)

    expect(screen.getByTestId('auth-client-google-primary')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-client-gmail-secondary')).toBeNull()
    expect(screen.queryByTestId('auth-client-facebook-secondary')).toBeNull()

    fireEvent.press(screen.getByTestId('auth-client-google-primary'))

    await waitFor(() => {
      expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByTestId('auth-onboarding-screen')).toBeOnTheScreen()
  })

  it('accepts a Vietnamese mobile number for customer login, remembers the latest identifier, and sends it as E.164', async () => {
    mockRouteParams = { stage: '1.4' }
    mockSignInWithPassword.mockResolvedValueOnce({ success: true })
    render(<LoginRoleSurface />)

    expect(screen.getByText('Email/SDT')).toBeOnTheScreen()
    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), '090 123 4567')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith('+84901234567', 'secret123')
    })
    expect(mockRememberAuthIdentifier).toHaveBeenCalledWith('090 123 4567')
    expect(screen.getByTestId('auth-onboarding-screen')).toBeOnTheScreen()
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

    expect(screen.getByText('SDT Việt Nam chưa đúng định dạng.')).toBeOnTheScreen()
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
  })

  it('asks for the opposite recovery channel without pretending a reset was sent', async () => {
    mockRouteParams = { stage: '1.4' }
    render(<LoginRoleSurface />)

    fireEvent.press(screen.getByTestId('auth-customer-forgot-password'))

    expect(screen.getByTestId('auth-password-recovery-panel')).toBeOnTheScreen()
    fireEvent.changeText(screen.getByTestId('auth-recovery-identifier-input'), 'tu@example.com')
    expect(screen.getByText('SDT khôi phục')).toBeOnTheScreen()
    fireEvent.changeText(screen.getByTestId('auth-recovery-secondary-input'), '090 123 4567')
    fireEvent.press(screen.getByTestId('auth-recovery-submit'))

    await waitFor(() => {
      expect(screen.getByText('Khôi phục mật khẩu sẽ hoàn tất sau khi kênh liên hệ đối diện được xác minh.')).toBeOnTheScreen()
    })
  })

  it('accepts a customer email or Vietnamese mobile number during registration', async () => {
    mockRouteParams = { stage: '1.5' }
    render(<LoginRoleSurface />)

    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Tu Phan')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), '0912345678')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    await waitFor(() => {
      expect(mockSignUpWithIdentifier).toHaveBeenCalledWith({
        displayName: 'Tu Phan',
        identifier: '0912345678',
        password: 'secret123',
      })
    })
    expect(screen.getByText('Kiểm tra kênh liên hệ để xác nhận tài khoản trước khi tiếp tục.')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-onboarding-screen')).toBeNull()
  })

  it('routes worker registration through review and never exposes customer provider login', async () => {
    mockRouteParams = { stage: '1.3', role: 'worker' }
    render(<LoginRoleSurface />)

    fireEvent.press(screen.getByTestId('auth-role-continue'))

    expect(screen.getByTestId('auth-login-screen')).toBeOnTheScreen()
    expect(screen.queryByTestId('auth-client-google-primary')).toBeNull()
    expect(screen.queryByTestId('auth-client-gmail-secondary')).toBeNull()
    expect(screen.queryByTestId('auth-client-facebook-secondary')).toBeNull()

    fireEvent.press(screen.getByTestId('auth-client-register-email'))
    fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Worker One')
    fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'worker@example.com')
    fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-register-submit'))

    await waitFor(() => {
      expect(mockSubmitWorkerApplication).toHaveBeenCalledWith({
        contact: 'worker@example.com',
        language: 'vi',
      })
    })
    expect(mockSignUpWithIdentifier).not.toHaveBeenCalled()
    expect(screen.getByTestId('auth-onboarding-screen')).toBeOnTheScreen()

    fireEvent.press(screen.getByTestId('auth-onboarding-start'))

    await waitFor(() => {
      expect(screen.getByText('Hồ sơ thợ đã được gửi xét duyệt. NestScout sẽ liên hệ trước khi cấp quyền thợ.')).toBeOnTheScreen()
    })
    expect(mockReplace).not.toHaveBeenCalledWith('/(worker)/home')
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
