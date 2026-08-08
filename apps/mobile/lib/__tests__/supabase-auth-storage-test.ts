const mockSecureGet = jest.fn()
const mockSecureSet = jest.fn()
const mockSecureDelete = jest.fn()
const mockFetch = jest.fn()

// Expo's native fetch getter is unavailable in jest-expo. Install the test
// double before the module under test can resolve that native boundary.
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: mockFetch as typeof fetch,
  writable: true,
})

jest.mock('expo-secure-store', () => ({
  deleteItemAsync: (...args: unknown[]) => mockSecureDelete(...args),
  getItemAsync: (...args: unknown[]) => mockSecureGet(...args),
  setItemAsync: (...args: unknown[]) => mockSecureSet(...args),
}))

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))

jest.mock('../runtime-config', () => ({
  mobileRuntimeConfig: {
    apiBaseUrl: '',
    supabasePublishableKey: '',
    supabaseUrl: '',
  },
}))

import { supabaseAuthOptions, supabaseAuthStorage, supabaseFetch } from '../supabase'

describe('native Supabase auth storage', () => {
  beforeEach(() => {
    mockSecureGet.mockReset()
    mockSecureSet.mockReset()
    mockSecureDelete.mockReset()
    mockFetch.mockReset()
  })

  it('uses PKCE so a native callback code is bound to the initiating device', () => {
    expect(supabaseAuthOptions.flowType).toBe('pkce')
    expect(supabaseAuthOptions.detectSessionInUrl).toBe(false)
  })

  it('does not resurrect a session from memory when SecureStore fails', async () => {
    mockSecureSet.mockRejectedValueOnce(new Error('secure storage unavailable'))
    mockSecureGet.mockRejectedValueOnce(new Error('secure storage unavailable'))

    await supabaseAuthStorage.setItem('supabase.auth.token', 'secret-session')

    await expect(supabaseAuthStorage.getItem('supabase.auth.token')).resolves.toBeNull()
  })

  it('serializes token writes and removal so a late write cannot resurrect a session', async () => {
    let resolveWrite!: () => void
    mockSecureSet.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveWrite = resolve
    }))
    mockSecureDelete.mockResolvedValueOnce(undefined)

    const write = supabaseAuthStorage.setItem('supabase.auth.token', 'secret-session')
    const remove = supabaseAuthStorage.removeItem('supabase.auth.token')
    await Promise.resolve()
    await Promise.resolve()

    try {
      expect(mockSecureSet).toHaveBeenCalledTimes(1)
      expect(mockSecureDelete).not.toHaveBeenCalled()
    } finally {
      resolveWrite?.()
    }
    await Promise.all([write, remove])

    expect(mockSecureDelete).toHaveBeenCalledTimes(1)
    expect(mockSecureSet.mock.invocationCallOrder[0])
      .toBeLessThan(mockSecureDelete.mock.invocationCallOrder[0])
  })

  it('does not leave auth bootstrap pending when SecureStore never settles', async () => {
    jest.useFakeTimers()
    mockSecureGet.mockReturnValueOnce(new Promise(() => undefined))
    const pending = supabaseAuthStorage.getItem('supabase.auth.token')

    await jest.advanceTimersByTimeAsync(5_000)

    await expect(pending).resolves.toBeNull()
    jest.useRealTimers()
  })

  it('settles a stalled Supabase auth request at the network deadline', async () => {
    jest.useFakeTimers()
    mockFetch.mockReturnValueOnce(new Promise(() => undefined))
    const pending = supabaseFetch('https://project.supabase.co/auth/v1/user')
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      message: 'SUPABASE_REQUEST_TIMEOUT',
    })

    await jest.advanceTimersByTimeAsync(20_000)

    await assertion
    jest.useRealTimers()
  })

  it('aborts a stalled Storage upload through the real Supabase fetch boundary', async () => {
    jest.useFakeTimers()
    mockFetch.mockReturnValueOnce(new Promise(() => undefined))
    const pending = supabaseFetch(
      'https://project.supabase.co/storage/v1/object/worker-verification/owner/front.jpg',
      { method: 'POST' },
    )
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      message: 'SUPABASE_REQUEST_TIMEOUT',
    })

    await jest.advanceTimersByTimeAsync(65_000)

    await assertion
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/storage/v1/object/'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    jest.useRealTimers()
  })

  it('does not start Supabase fetch after the caller already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(supabaseFetch('https://project.supabase.co/rest/v1/profiles', {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('refuses redirects before Supabase credentials can follow another origin', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}'))

    await supabaseFetch('https://project.supabase.co/rest/v1/profiles', {
      headers: { Authorization: 'Bearer session-token' },
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/profiles',
      expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    )
  })
})
