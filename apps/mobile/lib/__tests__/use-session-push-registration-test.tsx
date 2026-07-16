import { StrictMode } from 'react'
import { act, render, renderHook, waitFor } from '@testing-library/react-native'
import type { Session } from '@supabase/supabase-js'

const mockSetupPushNotifications = jest.fn()
const mockUnregisterPushNotifications = jest.fn()

jest.mock('../push-notifications', () => ({
  setupPushNotifications: (...args: unknown[]) => mockSetupPushNotifications(...args),
  unregisterPushNotifications: (...args: unknown[]) => mockUnregisterPushNotifications(...args),
}))

import { useSessionPushRegistration } from '../use-session-push-registration'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function session(userId: string, accessToken: string) {
  return {
    access_token: accessToken,
    user: { id: userId },
  } as Session
}

function PushRegistrationHarness({ activeSession, sessionRef }: {
  activeSession: Session
  sessionRef: { current: Session | null }
}) {
  useSessionPushRegistration({
    disabled: false,
    profileReady: true,
    role: 'customer',
    session: activeSession,
    sessionRef,
  })
  return null
}

describe('useSessionPushRegistration ownership', () => {
  beforeEach(() => {
    mockSetupPushNotifications.mockReset()
    mockUnregisterPushNotifications.mockReset()
    mockUnregisterPushNotifications.mockResolvedValue({ status: 'unregistered' })
  })

  it('starts a current setup after the Strict Mode effect cleanup replay', async () => {
    const accountA = session('account-a', 'account-a-access-token')
    const sessionRef = { current: accountA as Session | null }
    const firstSetup = deferred<{ status: 'registered'; token: string }>()
    mockSetupPushNotifications
      .mockImplementationOnce(() => firstSetup.promise)
      .mockResolvedValueOnce({
        status: 'registered',
        token: 'ExponentPushToken[account-a]',
      })

    const strictModeOptions: NonNullable<Parameters<typeof render>[1]> & {
      unstable_strictMode: boolean
    } = { unstable_strictMode: true }
    render(
      <StrictMode>
        <PushRegistrationHarness activeSession={accountA} sessionRef={sessionRef} />
      </StrictMode>,
      strictModeOptions,
    )

    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(2))
    await act(async () => {
      firstSetup.resolve({
        status: 'registered',
        token: 'ExponentPushToken[account-a]',
      })
      await firstSetup.promise
    })
  })

  it('does not restart a departed owner when pending setup settles before the provider rerenders', async () => {
    const accountA = session('account-a', 'account-a-access-token')
    const sessionRef = { current: accountA as Session | null }
    const pendingSetup = deferred<{ status: 'registered'; token: string }>()
    mockSetupPushNotifications.mockReturnValue(pendingSetup.promise)

    const { result } = renderHook(() => useSessionPushRegistration({
      disabled: false,
      profileReady: true,
      role: 'customer',
      session: accountA,
      sessionRef,
    }))

    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(1))
    await act(async () => {
      sessionRef.current = null
      result.current(accountA)
      pendingSetup.resolve({
        status: 'registered',
        token: 'ExponentPushToken[account-a]',
      })
      await pendingSetup.promise
    })

    await waitFor(() => expect(mockUnregisterPushNotifications).toHaveBeenCalledWith({
      accessToken: 'account-a-access-token',
      token: 'ExponentPushToken[account-a]',
    }))
    expect(mockSetupPushNotifications).toHaveBeenCalledTimes(1)
  })

  it('reclaims the latest account even when stale-owner unregister fails', async () => {
    const accountA = session('account-a', 'account-a-access-token')
    const accountB = session('account-b', 'account-b-access-token')
    const sessionRef = { current: accountA as Session | null }
    const pendingAccountA = deferred<{ status: 'registered'; token: string }>()
    mockSetupPushNotifications
      .mockImplementationOnce(() => pendingAccountA.promise)
      .mockResolvedValueOnce({
        status: 'registered',
        token: 'ExponentPushToken[shared-device]',
      })
      .mockResolvedValueOnce({
        status: 'registered',
        token: 'ExponentPushToken[shared-device]',
      })
    mockUnregisterPushNotifications.mockRejectedValue(new Error('stale unregister failed'))

    const { result, rerender } = renderHook(
      ({ activeSession }: { activeSession: Session }) => useSessionPushRegistration({
        disabled: false,
        profileReady: true,
        role: activeSession.user.id === accountA.user.id ? 'customer' : 'worker',
        session: activeSession,
        sessionRef,
      }),
      { initialProps: { activeSession: accountA } },
    )

    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(1))
    act(() => {
      sessionRef.current = accountB
      result.current(accountA)
      rerender({ activeSession: accountB })
    })
    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(2))

    await act(async () => {
      pendingAccountA.resolve({
        status: 'registered',
        token: 'ExponentPushToken[shared-device]',
      })
      await pendingAccountA.promise
    })

    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(3))
    expect(mockSetupPushNotifications).toHaveBeenLastCalledWith({
      accessToken: 'account-b-access-token',
      role: 'worker',
    })
    expect(mockUnregisterPushNotifications).toHaveBeenCalledWith({
      accessToken: 'account-a-access-token',
      token: 'ExponentPushToken[shared-device]',
    })
  })

  it('restores the latest role metadata when an older setup settles last', async () => {
    const accountA = session('account-a', 'account-a-access-token')
    const sessionRef = { current: accountA as Session | null }
    const pendingCustomerSetup = deferred<{ status: 'registered'; token: string }>()
    mockSetupPushNotifications
      .mockImplementationOnce(() => pendingCustomerSetup.promise)
      .mockResolvedValueOnce({
        status: 'registered',
        token: 'ExponentPushToken[shared-device]',
      })
      .mockResolvedValueOnce({
        status: 'registered',
        token: 'ExponentPushToken[shared-device]',
      })

    const { rerender } = renderHook(
      ({ role }: { role: 'customer' | 'worker' }) => useSessionPushRegistration({
        disabled: false,
        profileReady: true,
        role,
        session: accountA,
        sessionRef,
      }),
      { initialProps: { role: 'customer' as const } },
    )

    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(1))
    rerender({ role: 'worker' })
    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(2))

    await act(async () => {
      pendingCustomerSetup.resolve({
        status: 'registered',
        token: 'ExponentPushToken[shared-device]',
      })
      await pendingCustomerSetup.promise
    })

    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(3))
    expect(mockSetupPushNotifications).toHaveBeenLastCalledWith({
      accessToken: 'account-a-access-token',
      role: 'worker',
    })
  })

  it('cleans up a registration that settles after the hook unmounts', async () => {
    const accountA = session('account-a', 'account-a-access-token')
    const sessionRef = { current: accountA as Session | null }
    const pendingSetup = deferred<{ status: 'registered'; token: string }>()
    mockSetupPushNotifications.mockReturnValue(pendingSetup.promise)

    const { unmount } = renderHook(() => useSessionPushRegistration({
      disabled: false,
      profileReady: true,
      role: 'customer',
      session: accountA,
      sessionRef,
    }))

    await waitFor(() => expect(mockSetupPushNotifications).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => {
      pendingSetup.resolve({
        status: 'registered',
        token: 'ExponentPushToken[account-a]',
      })
      await pendingSetup.promise
    })

    expect(mockSetupPushNotifications).toHaveBeenCalledTimes(1)
    expect(mockUnregisterPushNotifications).toHaveBeenCalledWith({
      accessToken: 'account-a-access-token',
      token: 'ExponentPushToken[account-a]',
    })
  })
})
