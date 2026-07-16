const mockGetSession = jest.fn()
const mockFetch = jest.fn()
const mockGetPermissionsAsync = jest.fn()
const mockRequestPermissionsAsync = jest.fn()
const mockGetExpoPushTokenAsync = jest.fn()

jest.mock('expo-notifications', () => ({
  getExpoPushTokenAsync: mockGetExpoPushTokenAsync,
  getPermissionsAsync: mockGetPermissionsAsync,
  requestPermissionsAsync: mockRequestPermissionsAsync,
}))

jest.mock('../runtime-config', () => ({
  mobileRuntimeConfig: {
    apiBaseUrl: 'https://project.supabase.co/functions/v1/mobile-api',
    supabasePublishableKey: 'publishable-test-key',
    supabaseUrl: 'https://project.supabase.co',
  },
}))

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
    },
  },
}))

import type { DevicePushTokenInput } from '../api-types'
import { notificationService } from '../services'
import { setupPushNotifications, toNotificationPath, unregisterPushNotifications } from '../push-notifications'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const SCOPE_ID = '22222222-2222-4222-8222-222222222222'
const BROADCAST_ID = '33333333-3333-4333-8333-333333333333'

describe('push notification token lifecycle', () => {
  beforeEach(() => {
    mockGetSession.mockReset()
    mockFetch.mockReset()
    mockGetPermissionsAsync.mockReset()
    mockRequestPermissionsAsync.mockReset()
    mockGetExpoPushTokenAsync.mockReset()
    global.fetch = mockFetch as unknown as typeof fetch
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('uses the departing session bearer and sends no client-controlled user id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        token_id: 'push-token-id',
        unregistered: true,
        updated_at: '2026-07-14T00:00:00.000Z',
      }),
    })

    await expect(unregisterPushNotifications({
      accessToken: 'departing-account-access-token',
      token: 'ExponentPushToken[shared-device]',
    })).resolves.toEqual({ status: 'unregistered' })

    expect(mockGetSession).not.toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalledWith(
      'https://project.supabase.co/functions/v1/mobile-api/notifications/device-token',
      expect.objectContaining({
        body: JSON.stringify({ push_token: 'ExponentPushToken[shared-device]' }),
        headers: expect.objectContaining({
          Authorization: 'Bearer departing-account-access-token',
          apikey: 'publishable-test-key',
        }),
        method: 'DELETE',
      }),
    )
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body) as Record<string, unknown>
    expect(requestBody).not.toHaveProperty('user_id')
  })

  it('registers with the session bearer that owns the async setup attempt', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: { access_token: 'different-current-session-token' },
      },
    })
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        permission_status: 'granted',
        platform: 'ios',
        push_token: 'ExponentPushToken[shared-device]',
        token_id: 'push-token-id',
        updated_at: '2026-07-14T00:00:00.000Z',
      }),
    })
    const payload: DevicePushTokenInput = {
      permission_status: 'granted',
      platform: 'ios',
      push_token: 'ExponentPushToken[shared-device]',
      safe_metadata: { source: 'expo-notifications' },
    }

    await expect(notificationService.registerDeviceToken(
      payload,
      'setup-owner-access-token',
    )).resolves.toEqual(expect.objectContaining({ success: true }))

    expect(mockGetSession).not.toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalledWith(
      'https://project.supabase.co/functions/v1/mobile-api/notifications/device-token',
      expect.objectContaining({
        body: JSON.stringify(payload),
        headers: expect.objectContaining({
          Authorization: 'Bearer setup-owner-access-token',
          apikey: 'publishable-test-key',
        }),
        method: 'POST',
      }),
    )
  })

  it('refuses to register without the setup owner bearer', async () => {
    const payload: DevicePushTokenInput = {
      permission_status: 'granted',
      platform: 'ios',
      push_token: 'ExponentPushToken[shared-device]',
      safe_metadata: { source: 'expo-notifications' },
    }

    await expect(notificationService.registerDeviceToken(payload, '  ')).resolves.toEqual(expect.objectContaining({
      code: 'AUTH_REQUIRED',
      status: 401,
      success: false,
    }))

    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('does not claim registration when the server returns a disabled token', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' })
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[disabled-device]' })
    mockFetch.mockResolvedValue({
      body: null,
      headers: { get: () => null },
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        token_id: 'push-token-id',
        enabled: false,
        updated_at: '2026-07-15T00:00:00.000Z',
      }),
    })

    await expect(setupPushNotifications({
      accessToken: 'setup-owner-access-token',
      role: 'customer',
    })).resolves.toEqual({
      message: 'Push token registration was not enabled',
      status: 'error',
    })
  })

  it('refuses to downgrade unregister to an unauthenticated request', async () => {
    await expect(unregisterPushNotifications({
      accessToken: '  ',
      token: 'ExponentPushToken[shared-device]',
    })).resolves.toEqual({
      message: 'Phiên đăng nhập không hợp lệ',
      status: 'error',
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockGetSession).not.toHaveBeenCalled()
  })

  it('bounds a stalled unregister request', async () => {
    jest.useFakeTimers()
    let requestSignal: AbortSignal | undefined
    mockFetch.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      requestSignal = init.signal ?? undefined
      requestSignal?.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    }))

    const result = unregisterPushNotifications({
      accessToken: 'departing-account-access-token',
      token: 'ExponentPushToken[shared-device]',
    })
    await jest.advanceTimersByTimeAsync(15_000)

    await expect(result).resolves.toEqual(expect.objectContaining({ status: 'error' }))
    expect(requestSignal?.aborted).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('push notification deep-link boundary', () => {
  it('accepts only canonical in-app routes with bounded UUID parameters', () => {
    expect(toNotificationPath({
      deep_link: `/(customer)/history?scope_change=${SCOPE_ID}&job_id=${JOB_ID}`,
    })).toBe(`/(customer)/history?job_id=${JOB_ID}&scope_change=${SCOPE_ID}`)
    expect(toNotificationPath({
      deep_link: `nestscout:///(worker)/jobs?broadcast_id=${BROADCAST_ID}`,
    })).toBe(`/(worker)/jobs?broadcast_id=${BROADCAST_ID}`)
    expect(toNotificationPath({ scope_change_id: SCOPE_ID, job_id: JOB_ID }))
      .toBe(`/(customer)/history?scope_change=${SCOPE_ID}&job_id=${JOB_ID}`)
  })

  it.each([
    '/(customer)/history-admin',
    '/(worker)/jobs/../../admin',
    `/(customer)/ignored/../history?job_id=${JOB_ID}`,
    `/%2e%2e/(customer)/history?job_id=${JOB_ID}`,
    `\\(customer)\\history?job_id=${JOB_ID}`,
    'https://evil.example/(customer)/history',
    `/(customer)/history?job_id=${JOB_ID}#fragment`,
    `/(customer)/history?unknown=${JOB_ID}`,
    '/(customer)/history?job_id=not-a-uuid',
    `/(worker)/jobs?broadcast_id=${BROADCAST_ID}&broadcast_id=${BROADCAST_ID}`,
    `${' '.repeat(4_096)}/(customer)/history?job_id=${JOB_ID}${' '.repeat(4_096)}`,
  ])('rejects an untrusted notification route: %s', (deepLink) => {
    expect(toNotificationPath({ deep_link: deepLink })).toBeNull()
  })

  it('does not build a route from malformed structured identifiers', () => {
    expect(toNotificationPath({ scope_change_id: '../../admin', job_id: JOB_ID })).toBeNull()
    expect(toNotificationPath({ broadcast_id: 'x'.repeat(10_000) })).toBeNull()
  })
})
