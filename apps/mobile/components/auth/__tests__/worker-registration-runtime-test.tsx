import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockReplace = jest.fn()
const mockSignUp = jest.fn()
const mockSignOut = jest.fn(async () => ({ error: null }))
const mockSignInWithPassword = jest.fn()
const mockGetSession = jest.fn()
let mockAuthListener: ((event: string, session: unknown) => void) | null = null
const mockMaybeSingle = jest.fn()
const mockSubmitApplication = jest.fn()
const mockGetReadiness = jest.fn()
let mockRouteParams: Record<string, string> = {}

const workerUser = { email: 'tai@example.com', id: 'worker_applicant_1', user_metadata: {} }
const workerSession = { access_token: 'token', user: workerUser }

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
}))

jest.mock('react-native-safe-area-context', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SafeAreaView: ({ children, ...props }: any) => React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  }
})

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: jest.fn((listener: (event: string, session: unknown) => void) => {
        mockAuthListener = listener
        return { data: { subscription: { unsubscribe: jest.fn() } } }
      }),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signOut: () => mockSignOut(),
      signUp: (...args: unknown[]) => mockSignUp(...args),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  },
}))

jest.mock('@/lib/push-notifications', () => ({
  addPushNotificationResponseListener: jest.fn(() => ({ remove: jest.fn() })),
  setupPushNotifications: jest.fn(async () => undefined),
  unregisterPushNotifications: jest.fn(async () => undefined),
}))

jest.mock('@/lib/services', () => ({
  notificationService: {},
  workerService: {
    getReadiness: (...args: unknown[]) => mockGetReadiness(...args),
    submitApplication: (...args: unknown[]) => mockSubmitApplication(...args),
  },
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

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return { ...actual, useAppLanguage: () => 'vi' }
})

import { LoginRoleSurface } from '../auth-surfaces'
import { AuthProvider, useAuth } from '@/lib/auth-provider'
import { setWorkerRegistrationHandoff } from '@/lib/worker-registration-handoff'

// FrontendWorkflowProvider keys the whole app subtree by session and role, so the auth screen is
// rebuilt whenever sign-up or sign-out changes either. This mirrors that key.
function RebuiltByAuthIdentity({ children }: { children: React.ReactNode }) {
  const { role, session } = useAuth()
  return <React.Fragment key={`${session?.user.id ?? 'anonymous'}:${role ?? 'unresolved'}`}>{children}</React.Fragment>
}

function renderSurface() {
  return render(
    <AuthProvider>
      <RebuiltByAuthIdentity>
        <LoginRoleSurface />
      </RebuiltByAuthIdentity>
    </AuthProvider>,
  )
}

function fillAndSubmitWorkerRegistration() {
  fireEvent.press(screen.getByTestId('auth-entry-role-worker'))
  fireEvent.press(screen.getByTestId('auth-client-register-email'))
  fireEvent.changeText(screen.getByTestId('auth-register-name-input'), 'Nguyễn Hữu Tài')
  fireEvent.changeText(screen.getByTestId('auth-register-email-input'), 'tai@example.com')
  fireEvent.changeText(screen.getByTestId('auth-register-password-input'), 'secret123')
  fireEvent.changeText(screen.getByTestId('auth-register-password-confirmation-input'), 'secret123')
  fireEvent.press(screen.getByTestId('auth-register-terms'))
  fireEvent.press(screen.getByTestId('auth-register-submit'))
}

beforeEach(() => {
  jest.clearAllMocks()
  setWorkerRegistrationHandoff(null)
  mockRouteParams = { stage: '1.3' }
  mockGetSession.mockResolvedValue({ data: { session: null } })
  mockAuthListener = null
  mockSignInWithPassword.mockImplementation(async () => {
    setTimeout(() => mockAuthListener?.('SIGNED_IN', workerSession), 0)
    return { data: { session: workerSession, user: workerUser }, error: null }
  })
  mockSignUp.mockImplementation(async () => {
    setTimeout(() => mockAuthListener?.('SIGNED_IN', workerSession), 0)
    return { data: { session: workerSession, user: workerUser }, error: null }
  })
  mockMaybeSingle.mockResolvedValue({ data: { role: 'customer' }, error: null })
  mockGetReadiness.mockResolvedValue({
    success: true,
    data: { application: { application_id: 'app-1', reason: null, status: 'pending_review' } },
  })
})

describe('worker registration against the real AuthProvider', () => {
  it('sends a registered worker to the worker sign-in, never Customer Home or the Workers area', async () => {
    mockSubmitApplication.mockResolvedValue({
      success: true,
      data: { application_id: 'app-1', status: 'pending_review' },
    })

    renderSurface()
    fillAndSubmitWorkerRegistration()

    await waitFor(() => expect(mockSubmitApplication).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('auth-login-notice')).toHaveTextContent('Đã tạo tài khoản và gửi hồ sơ thợ. Hãy đăng nhập bằng tài khoản thợ để theo dõi xét duyệt.'))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/home')
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/(tabs)/home')
    expect(mockReplace).not.toHaveBeenCalledWith('/(worker)/(tabs)/home')
  })

  it('returns an applicant to the worker sign-in when the app is too old to send the application', async () => {
    mockSubmitApplication.mockResolvedValue({ success: false, error: 'Phiên bản NestScout này cần được cập nhật trước khi tiếp tục' })

    renderSurface()
    fillAndSubmitWorkerRegistration()

    await waitFor(() => expect(mockSubmitApplication).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('auth-login-submit')).toBeOnTheScreen())
    expect(screen.getByText(/chưa gửi được hồ sơ thợ/)).toBeOnTheScreen()
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/home')
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/(tabs)/home')
  })

  it('keeps the worker intent when the registration surface remounts while the application is in flight', async () => {
    let resolveApplication!: (value: unknown) => void
    mockSubmitApplication.mockImplementation(() => new Promise((resolve) => { resolveApplication = resolve }))

    const view = renderSurface()
    fillAndSubmitWorkerRegistration()
    await waitFor(() => expect(mockSubmitApplication).toHaveBeenCalled())

    view.rerender(
      <AuthProvider>
        <LoginRoleSurface key="remounted" />
      </AuthProvider>,
    )
    await act(async () => {
      resolveApplication({ success: true, data: { application_id: 'app-1', status: 'pending_review' } })
    })

    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/home')
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/(tabs)/home')
  })

  it('returns an applicant to the worker sign-in so the deferred submit can finish after a failed application', async () => {
    mockSubmitApplication.mockResolvedValue({ success: false, error: 'Không thể gửi xét duyệt lúc này. Vui lòng thử lại.' })

    renderSurface()
    fillAndSubmitWorkerRegistration()

    await waitFor(() => expect(mockSubmitApplication).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('auth-login-submit')).toBeOnTheScreen())
    expect(screen.getByText('Tài khoản đã được tạo nhưng hồ sơ thợ chưa gửi được. Hãy đăng nhập tài khoản thợ để gửi lại.')).toBeOnTheScreen()
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
    expect(mockSignUp).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/home')
  })

  it('keeps a pending applicant on the worker sign-in with the review status, with no waiting screen', async () => {
    renderSurface()
    fireEvent.press(screen.getByTestId('auth-entry-role-worker'))
    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'tai@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))

    await waitFor(() => expect(mockSignInWithPassword).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('auth-login-notice')).toHaveTextContent('Hồ sơ ứng tuyển đang được xem xét. Hệ thống sẽ không tự gửi thêm hồ sơ trùng lặp.'))
    expect(screen.queryByTestId('auth-onboarding-screen')).toBeNull()
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
    expect(mockSubmitApplication).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/home')
    expect(mockReplace).not.toHaveBeenCalledWith('/(worker)/(tabs)/home')
  })

  function signInThroughWorkerGate() {
    fireEvent.press(screen.getByTestId('auth-entry-role-worker'))
    fireEvent.changeText(screen.getByTestId('auth-login-email-input'), 'tai@example.com')
    fireEvent.changeText(screen.getByTestId('auth-login-password-input'), 'secret123')
    fireEvent.press(screen.getByTestId('auth-login-submit'))
  }

  it('sends an approved worker from the worker sign-in straight to the Workers area', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { role: 'worker' }, error: null })
    renderSurface()
    signInThroughWorkerGate()

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(worker)/(tabs)/home'))
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/home')
  })

  it('signs the account out and says why when a worker sign-in cannot send the missing application', async () => {
    mockGetReadiness.mockResolvedValue({
      success: true,
      data: { application: { application_id: null, reason: null, status: 'not_submitted' } },
    })
    mockSubmitApplication.mockResolvedValue({ success: false, error: 'Phiên bản NestScout này cần được cập nhật trước khi tiếp tục' })
    renderSurface()
    signInThroughWorkerGate()

    await waitFor(() => expect(mockSubmitApplication).toHaveBeenCalled())
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText(/chưa gửi được hồ sơ thợ/)).toBeOnTheScreen())
    expect(screen.getByTestId('auth-login-submit')).toBeOnTheScreen()
    expect(mockReplace).not.toHaveBeenCalledWith('/(customer)/home')
    expect(mockReplace).not.toHaveBeenCalledWith('/(worker)/(tabs)/home')
  })

  it('keeps wrong worker credentials on the worker sign-in with the error instead of the role gate', async () => {
    mockSignInWithPassword.mockImplementation(async () => ({
      data: { session: null, user: null },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 },
    }))
    renderSurface()
    signInThroughWorkerGate()

    await waitFor(() => expect(mockSignInWithPassword).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('auth-login-submit')).toBeOnTheScreen())
    expect(screen.queryByTestId('auth-role-gate-content')).toBeNull()
    expect(screen.getByText(/Email\/SĐT hoặc mật khẩu không đúng|Invalid|không đúng/i)).toBeOnTheScreen()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
