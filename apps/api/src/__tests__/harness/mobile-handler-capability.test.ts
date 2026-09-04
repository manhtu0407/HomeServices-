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
        userSupabase: {},
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

  it('fails closed without a user-scoped client for a nonprivileged route', async () => {
    let called = false
    const handler = createMobileApiHandler({
      authenticate: async () => ({
        success: true,
        user: { id: 'customer-1' },
        role: 'customer',
        accountState: 'active',
        supabase: {},
      }),
      services: {
        listServices: async () => {
          called = true
          return { services: [] }
        },
      } as unknown as MobileApiServices,
    })

    const response = await handler(new Request('https://api.example.test/services'))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      code: 'USER_SCOPED_CLIENT_UNAVAILABLE',
      error: expect.any(String),
    })
    expect(called).toBe(false)
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
  streamService?: () => Promise<Response>
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
  const streamService = vi.fn(input.streamService ?? (async () => new Response(null)))
  const services = {
    markNotificationRead: service,
    streamKaelChatTurn: streamService,
  } as unknown as MobileApiServices
  return {
    rpc,
    service,
    streamService,
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
    await expect(response.json()).resolves.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      error: expect.any(String),
    })
    expect(service).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalledWith('reserve_harness_idempotency', expect.anything())
  })

  it('rejects an oversized idempotent request before reserving or dispatching', async () => {
    const { handler, service, rpc } = remoteHandler({})
    const response = await handler(new Request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'mobile:550e8400-e29b-41d4-a716-446655440004',
      },
      body: JSON.stringify({ payload: 'x'.repeat(64 * 1024) }),
    }))

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toMatchObject({
      code: 'PAYLOAD_TOO_LARGE',
      error: expect.any(String),
    })
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

  it('keeps event streams outside generic idempotency receipts', async () => {
    let resolveBodyClosed!: () => void
    const bodyClosed = new Promise<void>((resolve) => {
      resolveBodyClosed = resolve
    })
    const { handler, rpc, streamService } = remoteHandler({
      streamService: async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: connected\n\n'))
          void bodyClosed.then(() => controller.close())
        },
      }), { headers: { 'content-type': 'text/event-stream' } }),
    })

    try {
      const response = await Promise.race([
        handler(new Request('https://api.example.test/kael/chat/550e8400-e29b-41d4-a716-446655440000/stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'Kiểm tra tiến độ', evidence_items: [] }),
        })),
        new Promise<Response | null>((resolve) => setTimeout(() => resolve(null), 100)),
      ])

      expect(response).toBeInstanceOf(Response)
      expect(response?.status).toBe(200)
      expect(response?.headers.get('access-control-allow-headers')).toContain('idempotency-key')
      expect(streamService).toHaveBeenCalledTimes(1)
      const names = rpc.mock.calls.map(([name]) => name)
      expect(names).not.toContain('reserve_harness_idempotency')
      expect(names).not.toContain('start_harness_idempotency_execution')
      expect(names).not.toContain('complete_harness_idempotency')
      expect(names).not.toContain('mark_harness_idempotency_reconcile_required')
      expect(names).not.toContain('finish_harness_run')

      resolveBodyClosed()
      await response?.text()

      expect(rpc.mock.calls.map(([name]) => name)).toContain('finish_harness_run')
      const eventClasses = (rpc.mock.calls as unknown as Array<[
        string,
        { p_event_class?: string },
      ]>)
        .filter(([name]) => name === 'append_harness_event')
        .map(([, args]) => args.p_event_class)
      expect(eventClasses).toContain('request.stream_opened')
      expect(eventClasses).toContain('request.stream_completed')
    } finally {
      resolveBodyClosed()
    }
  })

  it('finishes a Harness stream as failed when its public SSE protocol reports failure', async () => {
    const { handler, rpc } = remoteHandler({
      streamService: async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: response.failed\ndata: {}\n\n'))
          controller.close()
        },
      }), { headers: { 'content-type': 'text/event-stream' } }),
    })

    const response = await handler(new Request('https://api.example.test/kael/chat/550e8400-e29b-41d4-a716-446655440000/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Kiá»ƒm tra tiáº¿n Ä‘á»™', evidence_items: [] }),
    }))

    await response.text()

    expect(rpc).toHaveBeenCalledWith('finish_harness_run', expect.objectContaining({
      p_status: 'failed',
      p_error_code: 'STREAM_RESPONSE_FAILED',
    }))
  })

  it('detects a protocol failure that follows an earlier SSE event', async () => {
    const { handler, rpc } = remoteHandler({
      streamService: async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(
            'event: reasoning.started\ndata: {}\n\nevent: response.failed\ndata: {}\n\n',
          ))
          controller.close()
        },
      }), { headers: { 'content-type': 'text/event-stream' } }),
    })

    const response = await handler(new Request('https://api.example.test/kael/chat/550e8400-e29b-41d4-a716-446655440000/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Kiá»ƒm tra tiáº¿n Ä‘á»™', evidence_items: [] }),
    }))

    await response.text()

    expect(rpc).toHaveBeenCalledWith('finish_harness_run', expect.objectContaining({
      p_status: 'failed',
      p_error_code: 'STREAM_RESPONSE_FAILED',
    }))
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
    await expect(response.json()).resolves.toMatchObject({
      code: 'IDEMPOTENCY_RECONCILE_REQUIRED',
      error: expect.any(String),
    })
    expect(service).not.toHaveBeenCalled()
  })

  it('delegates Kael session-create replay to the domain response recovery', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'reserve_harness_idempotency') {
        return {
          data: [{
            reservation_id: '550e8400-e29b-41d4-a716-446655440000',
            response_hash: 'a'.repeat(64),
            state: 'completed',
          }],
          error: null,
        }
      }
      return { data: true, error: null }
    })
    const createKaelChat = vi.fn(async () => ({
      session: { id: 'case-session-1' },
      turns: [],
    }))
    const handler = createMobileApiHandler({
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
      services: { createKaelChat } as unknown as MobileApiServices,
    })
    const clientRequestId = '550e8400-e29b-41d4-a716-446655440005'

    const response = await handler(new Request('https://api.example.test/kael/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `mobile:${clientRequestId}`,
      },
      body: JSON.stringify({
        client_request_id: clientRequestId,
        message: 'Lavabo đang rò nước khi mở vòi.',
        photo_urls: [],
        problem_chips: ['Ống rò rỉ'],
        service_type: 'plumbing',
      }),
    }))

    expect(response.status).toBe(201)
    expect(createKaelChat).toHaveBeenCalledTimes(1)
    expect(rpc).not.toHaveBeenCalledWith('reserve_harness_idempotency', expect.anything())
  })
})
