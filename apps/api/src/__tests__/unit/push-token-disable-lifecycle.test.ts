import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  sendPushToUsers,
  type PushDbClient,
} from '../../../../../supabase/functions/mobile-api/_shared/push'

type DbResult = {
  data: unknown
  error: { code?: string; message?: string } | null
}

function makeQuery(result: Promise<DbResult>) {
  const query = {
    select: () => query,
    update: () => query,
    eq: () => query,
    in: () => query,
    maybeSingle: () => query,
    then: result.then.bind(result),
  }
  return query
}

describe('push token disable lifecycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('waits for a stale-token disable write before reporting delivery complete', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: [{
        status: 'error',
        message: 'Device not registered',
        details: { error: 'DeviceNotRegistered' },
      }],
    }))))

    let resolveDisable: ((value: DbResult) => void) | undefined
    const disableResult = new Promise<DbResult>((resolve) => {
      resolveDisable = resolve
    })
    let disableStarted = false
    let queryCount = 0
    const client = {
      from: () => {
        queryCount += 1
        if (queryCount === 1) {
          return makeQuery(Promise.resolve({
            data: [{
              id: 'stale-token-1',
              user_id: 'push-disable-lifecycle-user',
              push_token: 'ExponentPushToken[stale-lifecycle]',
            }],
            error: null,
          }))
        }
        disableStarted = true
        return makeQuery(disableResult)
      },
    } as unknown as PushDbClient

    let deliverySettled = false
    const delivery = sendPushToUsers(
      client,
      ['push-disable-lifecycle-user'],
      { title: 'New request', body: 'Open NestScout to review it.' },
    )
    void delivery.then(() => {
      deliverySettled = true
    })

    await vi.waitFor(() => expect(disableStarted).toBe(true))
    await Promise.resolve()
    await Promise.resolve()
    const settledBeforeDisableCompleted = deliverySettled

    resolveDisable?.({ data: { id: 'stale-token-1' }, error: null })
    await expect(delivery).resolves.toMatchObject({
      delivered: 0,
      failed: 1,
      errors: ['DeviceNotRegistered'],
    })
    expect(settledBeforeDisableCompleted).toBe(false)
  })

  it('fails closed when Expo returns malformed UTF-8 ticket JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new Uint8Array([0x7b, 0x22, 0x64, 0x61, 0x74, 0x61, 0x22, 0x3a, 0xc3, 0x28, 0x7d]),
    )))
    const client = {
      from: () => makeQuery(Promise.resolve({
        data: [{
          id: 'token-invalid-utf8',
          user_id: 'push-invalid-utf8-user',
          push_token: 'ExponentPushToken[invalid-utf8]',
        }],
        error: null,
      })),
    } as unknown as PushDbClient

    await expect(sendPushToUsers(
      client,
      ['push-invalid-utf8-user'],
      { title: 'New request', body: 'Open NestScout to review it.' },
    )).resolves.toEqual({
      delivered: 0,
      failed: 1,
      errors: ['UNKNOWN_PUSH_ERROR'],
    })
  })
})
