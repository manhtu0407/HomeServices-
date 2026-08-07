import { describe, expect, it, vi } from 'vitest'
import {
  createMobileApiHandler,
  type MobileApiContext,
  type MobileApiServices,
} from '../../../../../supabase/functions/mobile-api/_shared/http'

describe('mobile-api capability ingress', () => {
  it('builds actor and capability context before protected dispatch', async () => {
    let context!: MobileApiContext
    const services = {
      listServices: async (ctx: MobileApiContext) => {
        context = ctx
        return { services: [] }
      },
    } as unknown as MobileApiServices
    const handler = createMobileApiHandler({
      authenticate: async () => ({
        success: true,
        user: { id: 'customer-1' },
        role: 'customer',
        accountState: 'active',
        releaseId: 'release-1',
        supabase: {},
      }),
      services,
    })

    const response = await handler(new Request('https://api.example.test/services'))

    expect(response.status).toBe(200)
    expect(context.actorContext).toMatchObject({
      actorId: 'customer-1',
      role: 'customer',
      accountState: 'active',
    })
    expect(context.capabilityEnvelope).toMatchObject({
      routeKind: 'services',
      capability: 'mobile.route.services',
      resource: { type: 'catalog', id: null },
    })
    expect(context.releaseId).toBe('release-1')
  })

  it('denies a role outside the route capability before service execution', async () => {
    let called = false
    const services = {
      listWorkerBroadcasts: async () => {
        called = true
        return { broadcasts: [] }
      },
    } as unknown as MobileApiServices
    const handler = createMobileApiHandler({
      authenticate: async () => ({
        success: true,
        user: { id: 'customer-1' },
        role: 'customer',
        accountState: 'active',
        supabase: {},
      }),
      services,
    })

    const response = await handler(
      new Request('https://api.example.test/workers/me/broadcasts'),
    )

    expect(response.status).toBe(403)
    expect(called).toBe(false)
  })
})


function remoteHandler(input: {
  reserveState?: 'reserved' | 'in_progress' | 'completed' | 'conflict' | 'reconcile_required'
  complete?: boolean
  service?: () => Promise<unknown>
}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'reserve_harness_idempotency') {
      const state = input.reserveState ?? 'reserved'
      return {
        data: [{
          state,
          reservation_id: state === 'conflict' ? null : '550e8400-e29b-41d4-a716-446655440000',
          response_hash: state === 'completed' ? 'a'.repeat(64) : null,
        }],
        error: null,
      }
    }
    if (name === 'start_harness_idempotency_execution') return { data: true, error: null }
    if (name === 'complete_harness_idempotency') return { data: input.complete ?? true, error: null }
    if (name === 'mark_harness_idempotency_reconcile_required') return { data: true, error: null }
    if (name === 'fail_harness_idempotency') return { data: true, error: null }
    return { data: true, error: null }
  })
  const service = vi.fn(input.service ?? (async () => ({ notification_id: 'notification-1', read: true })))
  const services = {
    markNotificationRead: service,
  } as unknown as MobileApiServices
  return {
    rpc,
    service,
    handler: createMobileApiHandler({
      environment: 'staging',
      releaseId: 'harness-test',
      authenticate: async () => ({
        success: true,
        user: { id: 'customer-1' },
        role: 'customer',
        accountState: 'active',
        environment: 'staging',
        releaseId: 'harness-test',
        supabase: { rpc },
        userSupabase: { rpc },
        privilegedSupabase: { rpc },
      }),
      services,
    }),
  }
}

describe('mobile-api durable idempotency ingress', () => {
  const url = 'https://api.example.test/notifications/notification-1/read'
  const request = (idempotencyKey?: string) => new Request(url, {
    method: 'POST',
    headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : undefined,
  })

  it('blocks remote side effects before dispatch when the key is missing', async () => {
    const { handler, service, rpc } = remoteHandler({})
    const response = await handler(request())
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } })
    expect(service).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith('reserve_harness_idempotency', expect.anything())
  })

  it('moves a reserved request through executing and completed exactly once', async () => {
    const { handler, service, rpc } = remoteHandler({})
    const response = await handler(request('mobile:550e8400-e29b-41d4-a716-446655440000'))
    expect(response.status).toBe(200)
    expect(service).toHaveBeenCalledTimes(1)
    const names = rpc.mock.calls.map(([name]) => name)
    expect(names.indexOf('reserve_harness_idempotency')).toBeLessThan(names.indexOf('start_harness_idempotency_execution'))
    expect(names.indexOf('start_harness_idempotency_execution')).toBeLessThan(names.indexOf('complete_harness_idempotency'))
    expect(names).not.toContain('fail_harness_idempotency')
  })

  it('quarantines an unknown response receipt instead of making the request retryable', async () => {
    const { handler, service, rpc } = remoteHandler({ complete: false })
    const response = await handler(request('mobile:550e8400-e29b-41d4-a716-446655440001'))
    expect(response.status).toBe(503)
    expect(service).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('mark_harness_idempotency_reconcile_required', {
      p_reservation_id: '550e8400-e29b-41d4-a716-446655440000',
      p_error_code: 'RESPONSE_RECEIPT_COMMIT_FAILED',
    })
    expect(rpc).not.toHaveBeenCalledWith('fail_harness_idempotency', expect.anything())
  })

  it('keeps dispatch failures fail-closed after execution begins', async () => {
    const { handler, service, rpc } = remoteHandler({
      service: async () => { throw new Error('unknown outcome') },
    })
    const response = await handler(request('mobile:550e8400-e29b-41d4-a716-446655440002'))
    expect(response.status).toBe(500)
    expect(service).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('mark_harness_idempotency_reconcile_required', {
      p_reservation_id: '550e8400-e29b-41d4-a716-446655440000',
      p_error_code: 'UNHANDLED',
    })
    expect(rpc).not.toHaveBeenCalledWith('fail_harness_idempotency', expect.anything())
  })

  it('blocks a durable reconciliation state before dispatch', async () => {
    const { handler, service } = remoteHandler({ reserveState: 'reconcile_required' })
    const response = await handler(request('mobile:550e8400-e29b-41d4-a716-446655440003'))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'IDEMPOTENCY_RECONCILE_REQUIRED' } })
    expect(service).not.toHaveBeenCalled()
  })
})
