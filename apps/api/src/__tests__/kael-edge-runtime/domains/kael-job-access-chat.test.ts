import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { requireJobAccess } from '../../../../../../supabase/functions/mobile-api/_shared/platform/access'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('job-access-chat', () => {
  installEdgeRuntimeTestHooks()

  it('requireJobAccess hides cross-customer jobs with 404', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          customer_id: 'other-customer',
          worker_id: null,
        },
        error: null,
      },
    ])
    const ctx = {
      role: 'customer',
      user: { id: 'customer-1' },
      supabase: client,
    } as MobileApiContext
    const accessClient = client as unknown as Parameters<typeof requireJobAccess>[0]

    await expect(requireJobAccess(accessClient, 'job-1', ctx)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
  })

  it('lists job chat messages for a job participant and marks received messages read', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_matched',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: [
          {
            id: 'message-2',
            job_id: 'job-1',
            sender_id: 'customer-1',
            sender_role: 'customer',
            content: 'Tôi đang chờ ở sảnh.',
            is_read: false,
            created_at: '2026-05-20T00:01:00.000Z',
          },
          {
            id: 'message-1',
            job_id: 'job-1',
            sender_id: 'worker-1',
            sender_role: 'worker',
            content: 'Tôi đang đến.',
            is_read: true,
            created_at: '2026-05-20T00:00:00.000Z',
          },
        ],
        error: null,
      },
      { data: [{ id: 'message-2' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).listJobMessages(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      messages: [
        { id: 'message-1', sender_role: 'worker' },
        { id: 'message-2', sender_role: 'customer' },
      ],
    })

    const readCall = client.calls.find((call) =>
      call.table === 'chat_messages' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(readCall?.operations).toContainEqual(['neq', 'sender_id', 'worker-1'])
    expect(readCall?.operations).toContainEqual(['eq', 'is_read', false])
  })

  it('sends a job chat message and notifies the other participant without message body in push copy', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: {
          id: 'message-1',
          job_id: 'job-1',
          sender_id: 'worker-1',
          sender_role: 'worker',
          content: 'Tôi đang lên thang máy.',
          is_read: false,
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'customer-1', push_token: 'ExponentPushToken[customer]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).sendJobMessage(ctx, 'job-1', {
      content: 'Tôi đang lên thang máy.',
    })).resolves.toMatchObject({
      message: {
        id: 'message-1',
        sender_role: 'worker',
        content: 'Tôi đang lên thang máy.',
      },
    })

    const insertCall = client.calls.find((call) => call.table === 'chat_messages')
    expect(insertCall?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        sender_id: 'worker-1',
        sender_role: 'worker',
        content: 'Tôi đang lên thang máy.',
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.not.stringContaining('Tôi đang lên thang máy.'),
      }),
    )
  })

  it('redacts worker contact solicitation, records risk memory, and queues soft admin evidence', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_on_way',
          customer_id: 'customer-contact-guard',
          worker_id: 'worker-contact-guard',
        },
        error: null,
      },
      {
        data: {
          id: 'message-1',
          job_id: 'job-1',
          sender_id: 'worker-contact-guard',
          sender_role: 'worker',
          content: 'Kael redacted contact content.',
          is_read: false,
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: {
          id: 'message-kael-1',
          job_id: 'job-1',
          sender_id: null,
          sender_role: 'kael',
          content: 'Kael keeps contact, evidence, and payment in app.',
          is_read: false,
          created_at: '2026-05-20T00:00:01.000Z',
        },
        error: null,
      },
      {
        data: [{ applied: true, disintermediation_risk_count: 2 }],
        error: null,
      },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'customer-contact-guard', push_token: 'ExponentPushToken[customer-contact-guard]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-contact-guard' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).sendJobMessage(ctx, 'job-1', {
      content: 'Goi em 0901234567 qua Zalo, khoi qua app cung duoc.',
    })).resolves.toMatchObject({
      message: {
        id: 'message-1',
        sender_role: 'worker',
      },
    })

    const chatInserts = client.calls
      .filter((call) => call.table === 'chat_messages')
      .flatMap((call) => call.operations.filter((op) => op[0] === 'insert'))
    const workerInsert = chatInserts.find((op) =>
      (op[1] as Record<string, unknown>).sender_role === 'worker'
    )?.[1] as Record<string, unknown> | undefined
    const kaelInsert = chatInserts.find((op) =>
      (op[1] as Record<string, unknown>).sender_role === 'kael'
    )?.[1] as Record<string, unknown> | undefined
    expect(workerInsert).toMatchObject({
      job_id: 'job-1',
      sender_id: 'worker-contact-guard',
      sender_role: 'worker',
      content: expect.stringContaining('Kael'),
    })
    expect(JSON.stringify(workerInsert)).not.toContain('0901234567')
    expect(JSON.stringify(workerInsert)).not.toContain('Zalo')
    expect(kaelInsert).toMatchObject({
      job_id: 'job-1',
      sender_id: null,
      sender_role: 'kael',
      content: expect.stringContaining('app'),
    })

    expect(client.calls.find((call) =>
      call.table === 'rpc:record_worker_disintermediation_memory_atomic'
    )?.operations).toContainEqual([
      'rpc',
      'record_worker_disintermediation_memory_atomic',
      {
        p_job_id: 'job-1',
        p_message_id: 'message-1',
        p_signals: expect.arrayContaining(['phone', 'zalo', 'off_app']),
        p_worker_id: 'worker-contact-guard',
      },
    ])
    expect(JSON.stringify(client.calls)).not.toContain('0901234567')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.not.stringContaining('0901234567'),
      }),
    )
  })

  it('redacts customer contact solicitation without adding worker risk evidence', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_matched',
          customer_id: 'customer-contact-customer',
          worker_id: 'worker-contact-customer',
        },
        error: null,
      },
      {
        data: {
          id: 'message-1',
          job_id: 'job-1',
          sender_id: 'customer-contact-customer',
          sender_role: 'customer',
          content: 'Kael redacted contact content.',
          is_read: false,
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: {
          id: 'message-kael-1',
          job_id: 'job-1',
          sender_id: null,
          sender_role: 'kael',
          content: 'Kael keeps contact and payment in app.',
          is_read: false,
          created_at: '2026-05-20T00:00:01.000Z',
        },
        error: null,
      },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'worker-contact-customer', push_token: 'ExponentPushToken[worker-contact-customer]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-contact-customer' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).sendJobMessage(ctx, 'job-1', {
      content: 'Trao doi qua worker@example.com hoac Zalo, khoi qua app nhe.',
    })).resolves.toMatchObject({
      message: {
        id: 'message-1',
        sender_role: 'customer',
      },
    })

    const customerInsert = client.calls
      .filter((call) => call.table === 'chat_messages')
      .flatMap((call) => call.operations.filter((op) => op[0] === 'insert'))
      .find((op) => (op[1] as Record<string, unknown>).sender_role === 'customer')?.[1] as
        | Record<string, unknown>
        | undefined
    expect(customerInsert).toMatchObject({
      job_id: 'job-1',
      sender_id: 'customer-contact-customer',
      sender_role: 'customer',
      content: expect.stringContaining('Kael'),
    })
    expect(JSON.stringify(client.calls)).not.toContain('worker@example.com')
    expect(client.calls.some((call) => call.table === 'worker_kael_memory')).toBe(false)
    expect(client.calls.some((call) => call.table === 'kael_admin_queue')).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.not.stringContaining('worker@example.com'),
      }),
    )
  })

  it('adds a Kael admin-wait message and defensive logs for hard demanding job chat', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'completed_by_worker',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: {
          id: 'message-1',
          job_id: 'job-1',
          sender_id: 'customer-1',
          sender_role: 'customer',
          content: 'Hoàn tiền ngay không tôi sẽ khiếu nại và đăng bài tố Kael.',
          is_read: false,
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      { data: { id: 'interaction-1' }, error: null },
      { data: { id: 'queue-1' }, error: null },
      {
        data: {
          id: 'message-kael-1',
          job_id: 'job-1',
          sender_id: null,
          sender_role: 'kael',
          content: 'Kael đã ghi nhận đầy đủ. Để giải quyết tốt nhất, admin sẽ liên hệ bạn trong vòng 30 phút.',
          is_read: false,
          created_at: '2026-05-20T00:00:01.000Z',
        },
        error: null,
      },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'worker-1', push_token: 'ExponentPushToken[worker]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).sendJobMessage(ctx, 'job-1', {
      content: 'Hoàn tiền ngay không tôi sẽ khiếu nại và đăng bài tố Kael.',
    })).resolves.toMatchObject({
      message: {
        id: 'message-1',
        sender_role: 'customer',
      },
    })

    const chatInserts = client.calls
      .filter((call) => call.table === 'chat_messages')
      .flatMap((call) => call.operations.filter((op) => op[0] === 'insert'))
    expect(chatInserts).toEqual(expect.arrayContaining([
      [
        'insert',
        expect.objectContaining({
          sender_id: 'customer-1',
          sender_role: 'customer',
        }),
      ],
      [
        'insert',
        expect.objectContaining({
          sender_id: null,
          sender_role: 'kael',
          content: expect.stringContaining('admin sẽ liên hệ'),
        }),
      ],
    ]))
    expect(client.calls.find((call) => call.table === 'kael_interaction_log')).toBeTruthy()
    expect(client.calls.find((call) => call.table === 'kael_admin_queue')?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        priority: 'high',
        escalation_level: 'hard',
      }),
    ])
    expect(client.calls.some((call) =>
      call.table === 'jobs' && call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
  })

  it('requireJobAccess allows admin owner bypass unless a role is required', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
    ])
    const ctx = {
      role: 'admin',
      user: { id: 'admin-1' },
      supabase: client,
    } as MobileApiContext
    const accessClient = client as unknown as Parameters<typeof requireJobAccess>[0]

    await expect(requireJobAccess(accessClient, 'job-1', ctx)).resolves.toMatchObject({
      id: 'job-1',
      status: 'broadcasting',
    })
    await expect(
      requireJobAccess(accessClient, 'job-1', ctx, { requiredRole: 'worker' }),
    ).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
      status: 403,
    })
  })

  it('requireJobAccess enforces status guards with 409', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          customer_id: 'customer-1',
          worker_id: null,
        },
        error: null,
      },
    ])
    const ctx = {
      role: 'customer',
      user: { id: 'customer-1' },
      supabase: client,
    } as MobileApiContext
    const accessClient = client as unknown as Parameters<typeof requireJobAccess>[0]

    await expect(
      requireJobAccess(accessClient, 'job-1', ctx, { statuses: ['completed_by_worker'] }),
    ).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      status: 409,
    })
  })
})
