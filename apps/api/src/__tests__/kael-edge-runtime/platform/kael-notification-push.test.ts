import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { sendPushToUsers } from '../../../../../../supabase/functions/mobile-api/_shared/platform/push'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('notification-push', () => {
  installEdgeRuntimeTestHooks()

  it('counts unread notifications separately from the limited notification page', async () => {
    const client = makeSequenceClient([
      { data: null, error: null, count: 42 },
      {
        data: [{
          id: 'notification-1',
          title: 'Cập nhật',
          body: 'Đã đọc trong trang mới nhất',
          event_type: 'job_update',
          status: 'read',
          job_id: 'job-1',
          created_at: '2026-05-19T00:00:00.000Z',
          read_at: '2026-05-19T00:01:00.000Z',
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).listNotifications(ctx)

    expect(result.unread_count).toBe(42)
    expect(result.notifications).toHaveLength(1)
    expect(client.calls).toHaveLength(2)
    expect(client.calls[0].operations).toContainEqual(['select', 'id', { count: 'exact', head: true }])
    expect(client.calls[0].operations).toContainEqual(['eq', 'user_id', 'customer-1'])
    expect(client.calls[0].operations).toContainEqual(['neq', 'status', 'read'])
    expect(client.calls[0].operations).toContainEqual(['neq', 'status', 'archived'])
    expect(client.calls[0].operations.some((op) => op[0] === 'limit')).toBe(false)
    expect(client.calls[1].operations).toContainEqual(['limit', 30])
  })

  it('registers notification device tokens through the atomic Supabase RPC only', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          token_id: '44444444-4444-4444-8444-444444444444',
          enabled_out: true,
          updated_at_ts: '2026-05-19T00:00:00.000Z',
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).registerDevicePushToken(ctx, {
      platform: 'ios',
      push_token: 'ExponentPushToken[valid-token]',
      permission_status: 'granted',
      safe_metadata: {
        project_id_available: true,
        role: 'admin',
        source: 'expo-notifications',
      },
    })

    expect(result).toEqual({
      token_id: '44444444-4444-4444-8444-444444444444',
      enabled: true,
      updated_at: '2026-05-19T00:00:00.000Z',
    })
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].operations).toContainEqual([
      'rpc',
      'register_device_push_token_atomic',
      {
        p_user_id: 'customer-1',
        p_platform: 'ios',
        p_push_token: 'ExponentPushToken[valid-token]',
        p_permission_status: 'granted',
        p_safe_metadata: {
          project_id_available: true,
          role: 'customer',
          source: 'expo-notifications',
        },
      },
    ])
  })

  it('sends Expo push batches and disables unregistered device tokens', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        data: [
          { status: 'ok', id: 'ticket-1' },
          {
            status: 'error',
            message: 'Device not registered',
            details: { error: 'DeviceNotRegistered' },
          },
        ],
      }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: [
          { id: 'token-1', user_id: 'worker-1', push_token: 'ExponentPushToken[ok]' },
          { id: 'token-2', user_id: 'worker-2', push_token: 'ExponentPushToken[stale]' },
        ],
        error: null,
      },
      { data: { id: 'token-2' }, error: null },
    ])

    const result = await sendPushToUsers(
      client as unknown as Parameters<typeof sendPushToUsers>[0],
      ['worker-1', 'worker-2'],
      {
        title: 'Có yêu cầu mới gần bạn',
        body: 'Sửa nước - Quận 7',
        data: {
          event_type: 'broadcast_received',
          job_id: 'job-1',
          deep_link: '/(worker)/jobs?broadcast_id=broadcast-1',
        },
        sound: 'default',
      },
    )

    expect(result).toMatchObject({ delivered: 1, failed: 1 })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: expect.stringContaining('ExponentPushToken[ok]'),
      }),
    )
    const tokenQuery = client.calls[0]
    expect(tokenQuery.operations).toContainEqual(['in', 'user_id', ['worker-1', 'worker-2']])
    expect(tokenQuery.operations).toContainEqual(['eq', 'enabled', true])
    expect(tokenQuery.operations).toContainEqual(['eq', 'permission_status', 'granted'])
    const disableCall = client.calls.find((call) =>
      call.table === 'device_push_tokens' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(disableCall?.operations).toContainEqual(['update', expect.objectContaining({ enabled: false })])
    expect(disableCall?.operations).toContainEqual(['eq', 'id', 'token-2'])
  })

  it('aborts a timed-out Expo request before starting a retry', async () => {
    vi.useFakeTimers()
    let activeRequests = 0
    let maxActiveRequests = 0
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal
      expect(signal).toBeInstanceOf(AbortSignal)
      signals.push(signal as AbortSignal)
      activeRequests += 1
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          activeRequests -= 1
          reject(new DOMException('aborted', 'AbortError'))
        }, { once: true })
      })
    }))
    const client = makeSequenceClient([{
      data: [{ id: 'token-1', user_id: 'worker-1', push_token: 'ExponentPushToken[slow]' }],
      error: null,
    }])

    const pending = sendPushToUsers(
      client as unknown as Parameters<typeof sendPushToUsers>[0],
      ['worker-1'],
      { title: 'New request', body: 'Open NestScout to review it.' },
    )
    await vi.advanceTimersByTimeAsync(10_001)
    expect(signals[0]?.aborted).toBe(true)
    expect(activeRequests).toBe(0)
    await vi.advanceTimersByTimeAsync(500)
    expect(signals).toHaveLength(2)
    expect(maxActiveRequests).toBe(1)
    await vi.advanceTimersByTimeAsync(10_001 + 2_000 + 10_001)

    await expect(pending).resolves.toMatchObject({ delivered: 0, failed: 1 })
    expect(maxActiveRequests).toBe(1)
  })

  it('unregisters only the actor device token through the atomic Supabase RPC', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          token_id: '44444444-4444-4444-8444-444444444444',
          unregistered_out: true,
          updated_at_ts: '2026-07-14T00:00:00.000Z',
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).unregisterDevicePushToken(ctx, {
      push_token: 'ExponentPushToken[valid-token]',
    })

    expect(result).toEqual({
      token_id: '44444444-4444-4444-8444-444444444444',
      unregistered: true,
      updated_at: '2026-07-14T00:00:00.000Z',
    })
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].operations).toContainEqual([
      'rpc',
      'unregister_device_push_token_atomic',
      {
        p_user_id: 'customer-1',
        p_push_token: 'ExponentPushToken[valid-token]',
      },
    ])
  })
})
