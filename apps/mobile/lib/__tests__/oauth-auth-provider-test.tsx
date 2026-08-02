import React, { useEffect } from 'react'
import { Linking, Platform, Text } from 'react-native'
import { act, render, screen, waitFor } from '@testing-library/react-native'

const mockGetInitialUrl = jest.fn()
const mockOpenUrl = jest.fn()
const mockAddLinkingListener = jest.fn()
const mockRemoveLinkingListener = jest.fn()
const mockSignInWithOAuth = jest.fn()
const mockExchangeCodeForSession = jest.fn()
const mockGetSession = jest.fn()
const mockMaybeSingle = jest.fn()
const mockUnsubscribe = jest.fn()
const mockUnregisterPushForSession = jest.fn()
let mockLinkingUrlListener: ((event: { url: string }) => void) | null = null

const mockCustomerSession = {
  access_token: 'customer-access-token',
  user: {
    email: 'customer@example.com',
    id: '11111111-1111-4111-8111-111111111111',
    user_metadata: {},
  },
}

jest.mock('expo-linking', () => ({
  createURL: () => 'nestscout:///',
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('../runtime-config', () => ({
  mobileRuntimeConfig: {
    supabaseUrl: 'https://project.supabase.co',
  },
}))

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => mockExchangeCodeForSession(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: mockUnsubscribe } } }),
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      signOut: jest.fn(async () => ({ error: null })),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: (...args: unknown[]) => mockMaybeSingle(...args) }),
      }),
    }),
  },
}))

jest.mock('../push-notifications', () => ({
  addPushNotificationResponseListener: () => ({ remove: jest.fn() }),
}))

jest.mock('../use-session-push-registration', () => ({
  useSessionPushRegistration: () => mockUnregisterPushForSession,
}))

jest.mock('../pending-kael-chat-draft', () => ({
  clearPendingKaelChatDraft: jest.fn(async () => undefined),
}))

jest.mock('../services', () => ({
  workerService: { submitApplication: jest.fn() },
}))

Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' })
jest.spyOn(Linking, 'addEventListener').mockImplementation((event, listener) => (
  mockAddLinkingListener(event, listener) as ReturnType<typeof Linking.addEventListener>
))
jest.spyOn(Linking, 'getInitialURL').mockImplementation(() => mockGetInitialUrl())
jest.spyOn(Linking, 'openURL').mockImplementation((url) => mockOpenUrl(url))

const { AuthProvider, useAuth } = require('../auth-provider') as typeof import('../auth-provider')

let latestGoogleSignIn: ReturnType<typeof useAuth>['signInWithGoogle'] | null = null
let latestAppleSignIn: ReturnType<typeof useAuth>['signInWithApple'] | null = null

function GoogleOAuthHarness() {
  const auth = useAuth()
  useEffect(() => {
    latestGoogleSignIn = auth.signInWithGoogle
    latestAppleSignIn = auth.signInWithApple
  }, [auth.signInWithApple, auth.signInWithGoogle])
  return (
    <>
      <Text testID="oauth-session">{auth.session?.user.id ?? 'none'}</Text>
      <Text testID="oauth-error">{auth.authError ?? 'none'}</Text>
    </>
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function authorizationUrl(redirectUrl = 'nestscout:///', provider: 'apple' | 'google' = 'google') {
  return [
    `https://project.supabase.co/auth/v1/authorize?provider=${provider}`,
    `redirect_to=${encodeURIComponent(redirectUrl)}`,
    `code_challenge=${'a'.repeat(43)}`,
    'code_challenge_method=s256',
  ].join('&')
}

beforeEach(() => {
  latestGoogleSignIn = null
  latestAppleSignIn = null
  mockLinkingUrlListener = null
  mockGetInitialUrl.mockReset().mockResolvedValue(null)
  mockOpenUrl.mockReset().mockResolvedValue(true)
  mockRemoveLinkingListener.mockReset()
  mockAddLinkingListener.mockReset().mockImplementation((_event, listener) => {
    mockLinkingUrlListener = listener
    return { remove: mockRemoveLinkingListener }
  })
  mockSignInWithOAuth.mockReset().mockResolvedValue({
    data: { url: authorizationUrl() },
    error: null,
  })
  mockExchangeCodeForSession.mockReset().mockResolvedValue({
    data: { session: mockCustomerSession },
    error: null,
  })
  mockGetSession.mockReset().mockResolvedValue({ data: { session: null } })
  mockMaybeSingle.mockReset().mockResolvedValue({ data: { role: 'customer' }, error: null })
  mockUnsubscribe.mockReset()
  mockUnregisterPushForSession.mockReset()
})

describe('AuthProvider native OAuth boundary', () => {
  it('does not open a trusted Supabase authorization URL with a foreign callback target', async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({
      data: { url: authorizationUrl('https://attacker.example/callback') },
      error: null,
    })
    render(
      <AuthProvider>
        <GoogleOAuthHarness />
      </AuthProvider>,
    )
    await waitFor(() => expect(latestGoogleSignIn).not.toBeNull())

    let result: Awaited<ReturnType<NonNullable<typeof latestGoogleSignIn>>> | undefined
    await act(async () => {
      result = await latestGoogleSignIn?.()
    })

    expect(result).toEqual(expect.objectContaining({ success: false }))
    expect(mockOpenUrl).not.toHaveBeenCalled()
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'nestscout:///',
        skipBrowserRedirect: true,
      },
    })
  })

  it('opens the trusted Apple authorization URL through the existing OAuth boundary', async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({
      data: { url: authorizationUrl('nestscout:///', 'apple') },
      error: null,
    })
    render(
      <AuthProvider>
        <GoogleOAuthHarness />
      </AuthProvider>,
    )
    await waitFor(() => expect(latestAppleSignIn).not.toBeNull())

    let result: Awaited<ReturnType<NonNullable<typeof latestAppleSignIn>>> | undefined
    await act(async () => {
      result = await latestAppleSignIn?.()
    })

    expect(result).toEqual({ success: true })
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'apple',
      options: {
        redirectTo: 'nestscout:///',
        skipBrowserRedirect: true,
      },
    })
    expect(mockOpenUrl).toHaveBeenCalledWith(authorizationUrl('nestscout:///', 'apple'))
  })

  it('coalesces concurrent Google sign-in starts before opening the browser', async () => {
    const pendingAuthorization = deferred<{
      data: { url: string }
      error: null
    }>()
    mockSignInWithOAuth.mockImplementationOnce(() => pendingAuthorization.promise)
    render(
      <AuthProvider>
        <GoogleOAuthHarness />
      </AuthProvider>,
    )
    await waitFor(() => expect(latestGoogleSignIn).not.toBeNull())

    let first: ReturnType<NonNullable<typeof latestGoogleSignIn>> | null = null
    let second: ReturnType<NonNullable<typeof latestGoogleSignIn>> | null = null
    act(() => {
      first = latestGoogleSignIn!()
      second = latestGoogleSignIn!()
    })
    expect(first).toBe(second)
    expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1)

    await act(async () => {
      pendingAuthorization.resolve({ data: { url: authorizationUrl() }, error: null })
      await Promise.all([first!, second!])
    })

    expect(mockOpenUrl).toHaveBeenCalledTimes(1)
  })

  it('ignores a late initial callback after a live callback has arrived', async () => {
    const pendingInitialUrl = deferred<string | null>()
    mockGetInitialUrl.mockImplementationOnce(() => pendingInitialUrl.promise)
    render(
      <AuthProvider>
        <GoogleOAuthHarness />
      </AuthProvider>,
    )
    await waitFor(() => expect(mockLinkingUrlListener).not.toBeNull())

    act(() => {
      mockLinkingUrlListener?.({ url: 'nestscout:///?code=current-code' })
    })
    await waitFor(() => expect(mockExchangeCodeForSession).toHaveBeenCalledWith('current-code'))

    await act(async () => {
      pendingInitialUrl.resolve('nestscout:///?code=stale-initial-code')
      await pendingInitialUrl.promise
    })

    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1)
    expect(mockExchangeCodeForSession).not.toHaveBeenCalledWith('stale-initial-code')
  })

  it('maps provider callback details to a bounded local error without exchanging a session', async () => {
    render(
      <AuthProvider>
        <GoogleOAuthHarness />
      </AuthProvider>,
    )
    await waitFor(() => expect(mockLinkingUrlListener).not.toBeNull())

    act(() => {
      mockLinkingUrlListener?.({
        url: 'nestscout:///?error=access_denied&error_description=customer%40example.com',
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('oauth-error')).toHaveTextContent(
        'Không thể hoàn tất đăng nhập. Vui lòng thử lại sau.',
      )
    })
    expect(screen.getByTestId('oauth-error')).not.toHaveTextContent('access_denied')
    expect(screen.getByTestId('oauth-error')).not.toHaveTextContent('customer@example.com')
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('serializes distinct callbacks and ignores a duplicate callback code', async () => {
    const firstExchange = deferred<{
      data: { session: typeof mockCustomerSession }
      error: null
    }>()
    mockExchangeCodeForSession
      .mockImplementationOnce(() => firstExchange.promise)
      .mockResolvedValueOnce({ data: { session: mockCustomerSession }, error: null })
    render(
      <AuthProvider>
        <GoogleOAuthHarness />
      </AuthProvider>,
    )
    await waitFor(() => expect(mockLinkingUrlListener).not.toBeNull())

    act(() => {
      mockLinkingUrlListener?.({ url: 'nestscout:///?code=first-code' })
      mockLinkingUrlListener?.({ url: 'nestscout:///?code=second-code' })
    })
    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1)
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('first-code')

    await act(async () => {
      firstExchange.resolve({ data: { session: mockCustomerSession }, error: null })
      await firstExchange.promise
    })
    await waitFor(() => expect(mockExchangeCodeForSession).toHaveBeenCalledWith('second-code'))
    await waitFor(() => expect(mockMaybeSingle).toHaveBeenCalledTimes(2))
    await act(async () => Promise.resolve())

    act(() => {
      mockLinkingUrlListener?.({ url: 'nestscout:///?source=notification&code=second-code' })
    })
    await act(async () => Promise.resolve())
    expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('oauth-error')).toHaveTextContent('none')
  })
})
