import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'
import { readEdgeEnv } from '../../../../../supabase/functions/mobile-api/_shared/env'
import { requireJobAccess } from '../../../../../supabase/functions/mobile-api/_shared/access'
import { runKaelPipeline, type SupabaseLike } from '../../../../../supabase/functions/mobile-api/_shared/kael'
import { sendPushToUsers } from '../../../../../supabase/functions/mobile-api/_shared/push'
import { createEdgeServices } from '../../../../../supabase/functions/mobile-api/_shared/services'

describe('mobile-api Edge runtime helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads current Supabase secret key JSON without exposing it to mobile code', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_test' }),
      }
      return values[name]
    })

    expect(env.supabaseUrl).toBe('https://project.supabase.co')
    expect(env.supabaseSecretKey).toBe('sb_secret_test')
  })

  it('accepts the APP_SECRET_KEY Edge secret name used by the linked Supabase project', () => {
    const env = readEdgeEnv((name) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://project.supabase.co',
        APP_SECRET_KEY: 'sb_secret_project',
      }
      return values[name]
    })

    expect(env.supabaseSecretKey).toBe('sb_secret_project')
  })

  it('keeps the Edge service surface aligned with the mobile API plan', () => {
    const services = createEdgeServices({})

    expect(Object.keys(services).sort()).toEqual([
      'acceptBroadcast',
      'attachJobMedia',
      'cancelJob',
      'confirmKaelChat',
      'confirmCompletion',
      'confirmSearch',
      'createKaelChat',
      'createJob',
      'decideScopeChange',
      'decideWorkerCancellation',
      'declineBroadcast',
      'getJob',
      'getKaelChat',
      'getWorkerEarnings',
      'getWorkerProfile',
      'listJobMessages',
      'sendKaelChatTurn',
      'sendJobMessage',
      'listNotifications',
      'listServices',
      'listWorkerBroadcasts',
      'listWorkerJobs',
      'markNotificationRead',
      'placesAutocomplete',
      'registerDevicePushToken',
      'registerWorker',
      'requestScopeChange',
      'requestWorkerCancellation',
      'submitReview',
      'updateJobStatus',
      'updateWorkerAvailability',
    ].sort())
  })

  it('returns a safe Places autocomplete fallback when Google Maps key is not configured', async () => {
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: makeSequenceClient([]),
    }

    await expect(createEdgeServices({}).placesAutocomplete(ctx, {
      input: 'Bình Thạnh',
    })).resolves.toEqual({
      suggestions: [],
      fallback_used: true,
    })
  })

  it('returns a safe Places autocomplete fallback when quota is exhausted', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 429 }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: makeSequenceClient([]),
    }

    await expect(createEdgeServices({ googleMapsApiKey: 'maps-test-key' }).placesAutocomplete(ctx, {
      input: 'Bình Thạnh',
      session_token: 'session-1',
    })).resolves.toEqual({
      suggestions: [],
      fallback_used: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places:autocomplete',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Bình Thạnh'),
      }),
    )
  })

  it('confirms Kael chat through the atomic RPC before starting worker broadcast', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: true,
          error_code: null,
          job_id: 'job-1',
          job_status: 'awaiting_customer_confirm',
          service_type: 'plumbing',
          district_code: 'q7',
        }],
        error: null,
      },
      { data: { safe_metadata: { address_label: 'Landmark 81, Bình Thạnh' } }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: { id: 'job-1', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7', kael_price_max: 250000, final_price: null }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { address_lat: null, address_lng: null, problem_chips: ['leak'], service_problem_id: null, kael_problem_identified: 'Pipe leak' }, error: null },
      { data: [], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmKaelChat(ctx, 'kael-session-1')).resolves.toMatchObject({
      session_id: 'kael-session-1',
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: false,
    })

    expect(client.calls[0].operations).toContainEqual([
      'rpc',
      'confirm_kael_chat_atomic',
      {
        p_session_id: 'kael-session-1',
        p_customer_id: 'customer-1',
      },
    ])
    const statusUpdateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => {
        const value = op[1] as { status?: string } | undefined
        return op[0] === 'update' && value?.status === 'broadcasting'
      })
    )
    expect(statusUpdateCall?.operations).toContainEqual(['eq', 'status', 'awaiting_customer_confirm'])
  })

  it('hard-stops Kael chat before provider calls when the session exceeds the AI budget cap', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'active',
          total_turns: 2,
          safe_metadata: {
            address_district: 'q7',
            problem_chips: ['leak'],
            photo_urls: [],
          },
        },
        error: null,
      },
      { data: { id: 'turn-customer' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      { data: { id: 'kael-session-1', total_cost_usd: 1 }, error: null },
      { data: { id: 'kael-session-1', total_turns: 3, total_cost_usd: 1 }, error: null },
      { data: { id: 'turn-budget' }, error: null },
      { data: { id: 'kael-session-1' }, error: null },
      {
        data: {
          id: 'kael-session-1',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'plumbing',
          status: 'active',
          started_at: '2026-05-20T00:00:00.000Z',
          estimate_ready_at: null,
          total_turns: 4,
          total_cost_usd: 1,
          safe_metadata: {},
          created_at: '2026-05-20T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [
          {
            id: 'turn-customer',
            session_id: 'kael-session-1',
            turn_index: 3,
            role: 'customer',
            content_type: 'text',
            text_content: 'Pipe is still leaking in the kitchen cabinet',
            media_refs: [],
            safe_metadata: {},
            created_at: '2026-05-20T00:00:01.000Z',
          },
          {
            id: 'turn-budget',
            session_id: 'kael-session-1',
            turn_index: 4,
            role: 'kael',
            content_type: 'error',
            text_content: 'Budget cap reached',
            media_refs: [],
            safe_metadata: { budget_exceeded: true },
            created_at: '2026-05-20T00:00:02.000Z',
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).sendKaelChatTurn(ctx, 'kael-session-1', {
      message: 'Pipe is still leaking in the kitchen cabinet',
      photo_urls: [],
    })

    expect(result.session.next_action).toBe('budget_exceeded')
    expect(client.calls.some((call) => call.table === 'service_problems')).toBe(false)
    expect(client.calls.some((call) => call.table === 'price_baselines')).toBe(false)
    const budgetTurnUpdate = client.calls
      .flatMap((call) => call.operations)
      .find((op) => {
        const updateValue = op[1] as { total_turns?: number } | undefined
        return op[0] === 'update' && updateValue?.total_turns === 4
      })
    expect(budgetTurnUpdate?.[1]).not.toHaveProperty('estimate_ready_at')
  })

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
      safe_metadata: { device: 'expo-go' },
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
        p_safe_metadata: { device: 'expo-go' },
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

  it('rejects unknown worker districts before registration upsert', async () => {
    const client = makeSequenceClient([
      { data: { role: 'worker' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).registerWorker(ctx, {
      legal_name: 'Nguyen Van A',
      date_of_birth: '1990-01-15',
      gender: 'male',
      service_types: ['electrical'],
      years_experience: 5,
      districts: ['Ha Noi'],
      cccd_front_url: 'https://storage.example.com/front.jpg',
      cccd_back_url: 'https://storage.example.com/back.jpg',
      selfie_url: 'https://storage.example.com/selfie.jpg',
      bank_account: '0123456789',
      bank_name: 'Vietcombank',
    })).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
    })

    expect(client.calls).toHaveLength(2)
    expect(client.calls.some((call) =>
      call.table === 'worker_profiles' &&
      call.operations.some((op) => op[0] === 'upsert')
    )).toBe(false)
  })

  it('rejects suspended worker registration before upsert even if verification status is not suspended', async () => {
    const client = makeSequenceClient([
      { data: { role: 'worker' }, error: null },
      { data: { verification_status: 'under_review', is_suspended: true }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).registerWorker(ctx, {
      legal_name: 'Nguyen Van A',
      date_of_birth: '1990-01-15',
      gender: 'male',
      service_types: ['electrical'],
      years_experience: 5,
      districts: ['q1'],
      cccd_front_url: 'https://storage.example.com/front.jpg',
      cccd_back_url: 'https://storage.example.com/back.jpg',
      selfie_url: 'https://storage.example.com/selfie.jpg',
      bank_account: '0123456789',
      bank_name: 'Vietcombank',
    })).rejects.toMatchObject({
      code: 'ALREADY_FINALIZED',
      status: 409,
    })

    expect(client.calls).toHaveLength(2)
    expect(client.calls.some((call) =>
      call.table === 'worker_profiles' &&
      call.operations.some((op) => op[0] === 'upsert')
    )).toBe(false)
  })

  it('fails the service catalog when price baselines cannot load', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'cat-1', service_type: 'plumbing', label_vi: 'Sửa nước' }], error: null },
      { data: [], error: null },
      { data: null, error: { code: 'PGRST500' } },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).listServices(ctx)).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('maps thrown DB query failures to DB_ERROR instead of an unhandled Edge error', async () => {
    const client = makeSequenceClient([
      { reject: new Error('DB timeout after 10000ms') },
      { data: [], error: null },
      { data: [], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).listServices(ctx)).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('fails the service catalog when a baseline row has an invalid price range', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'cat-1', service_type: 'plumbing', label_vi: 'Sửa nước' }], error: null },
      { data: [], error: null },
      {
        data: [{
          service_type: 'plumbing',
          complexity: 'medium',
          district_code: 'q7',
          price_min: 0,
          price_max: 250000,
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

    await expect(createEdgeServices({}).listServices(ctx)).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('fails the service catalog when a baseline row has an unknown district code', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'cat-1', service_type: 'plumbing', label_vi: 'Sửa nước' }], error: null },
      { data: [], error: null },
      {
        data: [{
          service_type: 'plumbing',
          complexity: 'medium',
          district_code: 'unknown-district',
          price_min: 100000,
          price_max: 250000,
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

    await expect(createEdgeServices({}).listServices(ctx)).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('deduplicates service-level catalog baselines when rows are problem-specific', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'cat-1', service_type: 'plumbing', label_vi: 'Sua nuoc' }], error: null },
      {
        data: [
          { id: 'problem-1', service_category_id: 'cat-1', slug: 'pipe_leak', label_vi: 'Leak', default_complexity: 'small' },
          { id: 'problem-2', service_category_id: 'cat-1', slug: 'faucet_broken', label_vi: 'Faucet', default_complexity: 'small' },
        ],
        error: null,
      },
      {
        data: [
          {
            service_type: 'plumbing',
            service_problem_id: 'problem-1',
            complexity: 'small',
            district_code: 'hcmc_all',
            price_min: 150000,
            price_max: 350000,
          },
          {
            service_type: 'plumbing',
            service_problem_id: 'problem-2',
            complexity: 'small',
            district_code: 'hcmc_all',
            price_min: 150000,
            price_max: 350000,
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).listServices(ctx)

    expect(result.services[0].baselines).toEqual([{
      complexity: 'small',
      district_code: 'hcmc_all',
      price_min: 150000,
      price_max: 350000,
    }])
  })

  it('filters Edge baseline lookup by the classified problem slug', async () => {
    const client = makeSequenceClient([
      { data: [{ id: 'pipe-problem' }], error: null },
      { data: [{ price_min: 150000, price_max: 350000, district_code: 'q7' }], error: null },
    ])

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['Ống rò rỉ'],
      description: 'Kitchen sink pipe is leaking steadily under the cabinet.',
      district: 'q7',
    }, client, {})

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.serviceProblemId).toBe('pipe-problem')
    }
    expect(client.calls[0]).toMatchObject({
      table: 'service_problems',
      operations: expect.arrayContaining([
        ['eq', 'service_type', 'plumbing'],
        ['eq', 'slug', 'pipe_leak'],
      ]),
    })
    expect(client.calls[1]).toMatchObject({
      table: 'price_baselines',
      operations: expect.arrayContaining([
        ['eq', 'service_problem_id', 'pipe-problem'],
        ['eq', 'service_type', 'plumbing'],
        ['eq', 'complexity', 'medium'],
      ]),
    })
  })

  it('rejects customer job creation without a concrete HCMC district before insert', async () => {
    const client = makeSequenceClient([])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).createJob(ctx, {
      service_type: 'plumbing',
      problem_chips: ['pipe_leak'],
      description: 'Pipe leak under the sink',
      photo_urls: [],
      address_district: 'Ha Noi',
    })).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
    })

    expect(client.calls).toHaveLength(0)
  })

  it('cancels an analyzing job when the Kael pipeline throws unexpectedly', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1' }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { reject: new Error('DB timeout after 10000ms') },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).createJob(ctx, {
      service_type: 'plumbing',
      problem_chips: ['pipe_leak'],
      description: 'Pipe leak under the sink',
      photo_urls: [],
      address_district: 'q7',
    })).rejects.toMatchObject({
      code: 'AI_FAILED',
      status: 502,
    })

    const cancelCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => {
        const updateValue = op[1] as { status?: string } | null
        return op[0] === 'update' && updateValue?.status === 'cancelled'
      })
    )
    expect(cancelCall?.operations).toContainEqual([
      'update',
      { status: 'cancelled', cancelled_at: expect.any(String) },
    ])
    expect(cancelCall?.operations).toContainEqual(['eq', 'id', 'job-1'])
    expect(cancelCall?.operations).toContainEqual(['eq', 'status', 'analyzing'])
    expect(cancelCall?.operations).toContainEqual(['select', 'id'])
    expect(cancelCall?.operations).toContainEqual(['maybeSingle'])

    const failedEventCall = client.calls.find((call) =>
      call.table === 'job_events' &&
      call.operations.some((op) =>
        op[0] === 'insert' &&
        typeof op[1] === 'object' &&
        op[1] !== null &&
        'event_type' in op[1] &&
        op[1].event_type === 'kael_failed'
      )
    )
    expect(failedEventCall?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        event_type: 'kael_failed',
        from_status: 'analyzing',
        to_status: 'cancelled',
        safe_metadata: { reason_code: 'PIPELINE_THROW' },
      }),
    ])
  })

  it('declines unsupported work before touching price baselines', async () => {
    const supabase = {
      from: () => {
        throw new Error('baseline should not be queried for unsupported service')
      },
    }

    const result = await runKaelPipeline({
      serviceType: 'electrical',
      problemChips: ['Vấn đề khác'],
      description: 'Tôi cần sửa máy lạnh trong căn hộ',
      district: 'q7',
    }, supabase, {})

    expect(result.success).toBe(false)
    expect(result).toMatchObject({ code: 'UNSUPPORTED' })
  })

  it('rejects invalid price baseline rows instead of synthesizing a zero estimate', async () => {
    const invalidBaselineResult = {
      data: [{ price_min: null, price_max: 250000, district_code: 'q7' }],
      error: null,
    }
    const query: ReturnType<SupabaseLike['from']> = {
      select: () => query,
      eq: () => query,
      in: () => query,
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): PromiseLike<TResult1 | TResult2> {
        return Promise.resolve(invalidBaselineResult).then(onfulfilled, onrejected)
      },
    }
    const supabase: SupabaseLike = {
      from: () => query,
    }

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['Ống rò rỉ'],
      description: 'Ống nước dưới lavabo bị rò và nhỏ nước liên tục',
      district: 'q7',
    }, supabase, {})

    expect(result.success).toBe(false)
    expect(result).toMatchObject({ code: 'NO_BASELINE' })
  })

  it('uses Anthropic intent fallback before local heuristic fallback when DeepSeek has no balance', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { max_tokens?: number }
      const target = String(url)

      if (target.includes('deepseek.com')) {
        return new Response(JSON.stringify({
          error: {
            message: 'Insufficient Balance',
            code: 'invalid_request_error',
          },
        }), { status: 402 })
      }

      if (target.includes('anthropic.com') && body.max_tokens === 200) {
        return new Response(JSON.stringify({
          content: [{
            text: JSON.stringify({
              service_type: 'plumbing',
              problem_slug: 'pipe_leak',
              confidence: 0.86,
              needs_clarification: false,
            }),
          }],
          usage: { input_tokens: 40, output_tokens: 12 },
        }))
      }

      if (target.includes('anthropic.com') && body.max_tokens === 500) {
        return new Response(JSON.stringify({
          content: [{
            text: JSON.stringify({
              problem_identified: 'Kitchen sink pipe leak',
              severity_indicators: ['steady leak'],
              complexity_hint: 'small',
            }),
          }],
          usage: { input_tokens: 80, output_tokens: 24 },
        }))
      }

      if (target.includes('perplexity.ai')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                market_range_min: 180000,
                market_range_max: 360000,
                confidence: 0.72,
                sources_summary: 'staging source summary '.repeat(35),
              }),
            },
          }],
          usage: { prompt_tokens: 70, completion_tokens: 20 },
        }))
      }

      throw new Error(`unexpected provider URL ${target}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const supabase = makeSequenceClient([
      { data: [{ id: 'pipe-problem' }], error: null },
      { data: [{ price_min: 150000, price_max: 350000, district_code: 'q1' }], error: null },
    ])

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['pipe leak'],
      description: 'Kitchen sink pipe is leaking steadily under the cabinet.',
      district: 'q1',
    }, supabase, {
      deepseekApiKey: 'deepseek-no-balance',
      anthropicApiKey: 'anthropic-ok',
      perplexityApiKey: 'perplexity-ok',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.fallbackUsed).toBe(false)
      expect(result.estimate.problem_category).toBe('pipe_leak')
      expect(result.serviceProblemId).toBe('pipe-problem')
    }
    expect(result.stageLogs.filter((stage) => stage.stage === 'intent')).toEqual([
      expect.objectContaining({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        success: false,
        failureReason: 'AI call failed: HTTP_402',
        fallbackUsed: false,
      }),
      expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        success: true,
        fallbackUsed: false,
      }),
    ])
  })

  it('passes customer photo URLs to Anthropic vision analysis', async () => {
    const requestBodies: Array<Record<string, unknown>> = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> & { max_tokens?: number }
      requestBodies.push(body)
      const target = String(url)

      if (target.includes('deepseek.com')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                service_type: 'plumbing',
                problem_slug: 'pipe_leak',
                confidence: 0.9,
                needs_clarification: false,
              }),
            },
          }],
          usage: { prompt_tokens: 40, completion_tokens: 12 },
        }))
      }

      if (target.includes('anthropic.com') && body.max_tokens === 500) {
        return new Response(JSON.stringify({
          content: [{
            text: JSON.stringify({
              problem_identified: 'Rò nước nhìn thấy dưới lavabo',
              severity_indicators: ['nước rỉ liên tục'],
              complexity_hint: 'small',
            }),
          }],
          usage: { input_tokens: 90, output_tokens: 28 },
        }))
      }

      if (target.includes('perplexity.ai')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                market_range_min: 180000,
                market_range_max: 360000,
                confidence: 0.72,
              }),
            },
          }],
          usage: { prompt_tokens: 70, completion_tokens: 20 },
        }))
      }

      throw new Error(`unexpected provider URL ${target}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const supabase = makeSequenceClient([
      { data: [{ id: 'pipe-problem' }], error: null },
      { data: [{ price_min: 150000, price_max: 350000, district_code: 'q7' }], error: null },
    ])
    const photoUrl = 'https://storage.example.com/job-media/before-lavabo.jpg'

    const result = await runKaelPipeline({
      serviceType: 'plumbing',
      problemChips: ['Ống rò rỉ'],
      description: 'Lavabo đang rò nước phía dưới tủ.',
      district: 'q7',
      photoUrls: [photoUrl],
    }, supabase, {
      deepseekApiKey: 'deepseek-ok',
      anthropicApiKey: 'anthropic-ok',
      perplexityApiKey: 'perplexity-ok',
    })

    expect(result.success).toBe(true)
    const visionBody = requestBodies.find((body) => body.max_tokens === 500)
    const visionMessages = visionBody?.messages as Array<{ content: unknown }> | undefined
    expect(visionMessages?.[0]?.content).toEqual([
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('Lavabo đang rò nước phía dưới tủ.'),
      }),
      {
        type: 'image',
        source: {
          type: 'url',
          url: photoUrl,
        },
      },
    ])
  })

  it('normalizes AI-invented problem slugs to a service fallback before baseline lookup', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { max_tokens?: number }
      const target = String(url)

      if (target.includes('deepseek.com')) {
        return new Response(JSON.stringify({
          error: {
            message: 'Insufficient Balance',
            code: 'invalid_request_error',
          },
        }), { status: 402 })
      }

      if (target.includes('anthropic.com') && body.max_tokens === 200) {
        return new Response(JSON.stringify({
          content: [{
            text: JSON.stringify({
              service_type: 'electrical',
              problem_slug: 'short_circuit',
              confidence: 0.82,
              needs_clarification: false,
            }),
          }],
          usage: { input_tokens: 40, output_tokens: 12 },
        }))
      }

      if (target.includes('anthropic.com') && body.max_tokens === 500) {
        return new Response(JSON.stringify({
          content: [{
            text: JSON.stringify({
              problem_identified: 'Breaker trips repeatedly',
              severity_indicators: ['burning smell'],
              complexity_hint: 'medium',
            }),
          }],
          usage: { input_tokens: 80, output_tokens: 24 },
        }))
      }

      if (target.includes('perplexity.ai')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                market_range_min: 350000,
                market_range_max: 750000,
                confidence: 0.7,
                sources_summary: 'staging source summary '.repeat(35),
              }),
            },
          }],
          usage: { prompt_tokens: 70, completion_tokens: 20 },
        }))
      }

      throw new Error(`unexpected provider URL ${target}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const supabase = makeSequenceClient([
      { data: [{ id: 'other-electrical-problem' }], error: null },
      { data: [{ price_min: 300000, price_max: 700000, district_code: 'hcmc_all' }], error: null },
    ])

    const result = await runKaelPipeline({
      serviceType: 'electrical',
      problemChips: ['cau dao trip'],
      description: 'Breaker keeps tripping and there is a light burning smell from an outlet.',
      district: 'q1',
    }, supabase, {
      deepseekApiKey: 'deepseek-no-balance',
      anthropicApiKey: 'anthropic-ok',
      perplexityApiKey: 'perplexity-ok',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.fallbackUsed).toBe(true)
      expect(result.estimate.problem_category).toBe('other_electrical')
      expect(result.serviceProblemId).toBe('other-electrical-problem')
    }
    expect(supabase.calls[0]).toMatchObject({
      table: 'service_problems',
      operations: expect.arrayContaining([
        ['eq', 'service_type', 'electrical'],
        ['eq', 'slug', 'other_electrical'],
      ]),
    })
  })

  it('surfaces worker status races as STATUS_CHANGED instead of fake success', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'repairing', worker_id: 'worker-1' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'completed_by_worker',
      // Phase 2.0 (2026-05-23): worker không nhập final_price; Kael giữ authority.
      completion_notes: 'Đã hoàn tất',
      completion_photo_urls: ['https://example.com/after-1.jpg'],
    })).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })

    const updateCall = client.calls.find((call) => call.table === 'jobs' && call.operations.some((op) => op[0] === 'update'))
    expect(updateCall?.operations).toContainEqual(['eq', 'worker_id', 'worker-1'])
    expect(updateCall?.operations).toContainEqual(['eq', 'status', 'repairing'])
    expect(updateCall?.operations).toContainEqual(['select', 'id'])
    expect(updateCall?.operations).toContainEqual(['maybeSingle'])
  })

  it('blocks customer completion when worker did not persist final price', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'completed_by_worker', customer_id: 'customer-1', final_price: null }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmCompletion(ctx, 'job-1')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      status: 409,
    })
  })

  it('keeps the customer ownership guard inside customer completion updates', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'completed_by_worker', customer_id: 'customer-1', final_price: 250000 }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmCompletion(ctx, 'job-1')).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })

    const updateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(updateCall?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    expect(updateCall?.operations).toContainEqual(['eq', 'status', 'completed_by_worker'])
    expect(updateCall?.operations).toContainEqual(['select', 'id'])
    expect(updateCall?.operations).toContainEqual(['maybeSingle'])
  })

  it('returns broadcast_state on job detail after expiring stale broadcasts', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          service_type: 'plumbing',
          description: 'Leak under sink',
          problem_chips: ['Leak'],
          photo_urls: [],
          address_district: 'q7',
          customer_id: 'customer-1',
          created_at: '2026-05-17T00:00:00.000Z',
        },
        error: null,
      },
      { data: { id: 'broadcast-1' }, error: null },
      { data: [], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).getJob(ctx, 'job-1')).resolves.toMatchObject({
      job: { id: 'job-1', status: 'broadcasting' },
      broadcast_state: { active_count: 0, seconds_remaining: 0 },
    })

    const expireCall = client.calls.find((call) =>
      call.table === 'job_broadcasts' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(expireCall?.operations).toContainEqual(['eq', 'job_id', 'job-1'])
    expect(expireCall?.operations).toContainEqual(['eq', 'status', 'sent'])
    expect(expireCall?.operations.some((op) => op[0] === 'lte' && op[1] === 'expires_at')).toBe(true)
  })

  it('returns the active scope-change request on pending job detail', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'scope_change_pending',
          service_type: 'electrical',
          description: 'Breaker issue',
          problem_chips: ['Breaker'],
          photo_urls: [],
          address_district: 'q1',
          customer_id: 'customer-1',
          created_at: '2026-05-17T00:00:00.000Z',
        },
        error: null,
      },
      {
        data: [{
          id: 'scope-1',
          status: 'waiting_customer_decision',
          requested_description: 'Replace damaged breaker',
          reason: 'Breaker is burnt',
          price_min: 250000,
          price_max: 250000,
          kael_computed_min: 250000,
          kael_computed_max: 350000,
          kael_review: {
            problem_summary: 'Replace damaged breaker',
            advisory: 'Confirm before continuing',
            complexity_assessment: 'medium',
            confidence: 0.8,
            fallback_used: false,
          },
          evidence_photo_urls: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
          created_at: '2026-05-17T00:01:00.000Z',
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

    await expect(createEdgeServices({}).getJob(ctx, 'job-1')).resolves.toMatchObject({
      job: { id: 'job-1', status: 'scope_change_pending' },
      current_scope_change: {
        id: 'scope-1',
        requested_description: 'Replace damaged breaker',
        price_min: 250000,
        kael_computed_max: 350000,
        evidence_photo_urls: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
      },
    })

    const scopeCall = client.calls.find((call) => call.table === 'scope_change_requests')
    expect(scopeCall?.operations).toContainEqual(['eq', 'job_id', 'job-1'])
    expect(scopeCall?.operations).toContainEqual(['in', 'status', ['waiting_customer_decision', 'reviewing_by_kael']])
  })

  it('submits reviews through the atomic RPC so review insert and status update cannot split-brain', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'confirmed_by_customer',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: [{
          ok: false,
          error_code: 'ALREADY_REVIEWED',
          review_id: null,
          job_status: null,
          reviewed_at_ts: null,
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

    await expect(createEdgeServices({}).submitReview(ctx, 'job-1', {
      rating: 5,
      tags: [],
    })).rejects.toMatchObject({
      code: 'ALREADY_REVIEWED',
      status: 409,
    })

    expect(client.calls).toHaveLength(2)
    expect(client.calls[1]).toEqual({
      table: 'rpc:submit_review_atomic',
      operations: [[
        'rpc',
        'submit_review_atomic',
        {
          p_job_id: 'job-1',
          p_customer_id: 'customer-1',
          p_rating: 5,
          p_tags: [],
          p_comment: null,
        },
      ]],
    })
  })

  it('cancels jobs through an atomic RPC so stale broadcasts cannot survive API success', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: false,
          error_code: 'INVALID_STATUS',
          job_status: 'worker_matched',
          cancelled_at_ts: null,
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

    await expect(createEdgeServices({}).cancelJob(ctx, 'job-1')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      status: 409,
    })

    expect(client.calls).toEqual([
      {
        table: 'rpc:cancel_job_before_accept_atomic',
        operations: [[
          'rpc',
          'cancel_job_before_accept_atomic',
          {
            p_job_id: 'job-1',
            p_customer_id: 'customer-1',
          },
        ]],
      },
    ])
  })

  it('rejects accept when the atomic RPC says the worker is no longer eligible', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: false,
          error_code: 'WORKER_NOT_ELIGIBLE',
          job_status: null,
          address_building: null,
          address_unit: null,
          address_floor: null,
          address_district: null,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).acceptBroadcast(ctx, 'job-1')).rejects.toMatchObject({
      code: 'WORKER_NOT_ELIGIBLE',
      status: 403,
    })
  })

  it('notifies the customer when a worker accepts a broadcast', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: [{
          ok: true,
          error_code: null,
          job_status: 'worker_matched',
          address_building: 'River Gate',
          address_unit: '1201',
          address_floor: '12',
          address_district: 'q7',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: { customer_id: 'customer-1' }, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'customer-1', push_token: 'ExponentPushToken[customer]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).acceptBroadcast(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'worker_matched',
    })

    const notificationCall = client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')
    expect(notificationCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'customer-1',
        p_job_id: 'job-1',
        p_event_type: 'worker_matched',
        p_safe_metadata: { worker_id: 'worker-1' },
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(customer)/history?job_id=job-1'),
      }),
    )
  })

  it('notifies the customer when a worker starts traveling', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

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
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'customer-1', push_token: 'ExponentPushToken[customer]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'worker_on_way',
    })).resolves.toMatchObject({
      job_id: 'job-1',
      from_status: 'worker_matched',
      to_status: 'worker_on_way',
    })

    const notificationCall = client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')
    expect(notificationCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'customer-1',
        p_job_id: 'job-1',
        p_event_type: 'worker_on_way',
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(customer)/history?job_id=job-1'),
      }),
    )
  })

  it('persists Kael review before notifying the customer about a worker scope change', async () => {
    // Phase 2.0 (plan §22.7.B, 2026-05-23): computeScopeChangeEstimate schema
    // returns complexity_assessment + price_min/max + problem_summary.
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const target = typeof url === 'string' ? url : url.toString()
      if (target.includes('api.anthropic.com')) {
        return new Response(JSON.stringify({
          content: [{
            text: JSON.stringify({
              complexity_assessment: 'medium',
              price_min: 200000,
              price_max: 350000,
              confidence: 0.72,
              problem_summary: 'Phần phát sinh: ống chính cần thay đoạn lớn.',
              advisory: 'Cần khách xác nhận trước khi thợ tiếp tục.',
            }),
          }],
          usage: { input_tokens: 120, output_tokens: 48 },
        }))
      }
      return new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'repairing',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          service_type: 'electrical',
          description: 'Ổ cắm bị cháy',
          kael_problem_identified: 'Ổ cắm có dấu hiệu cháy',
          kael_complexity: 'small',
          kael_price_min: 150000,
          kael_price_max: 250000,
        },
        error: null,
      },
      {
        data: [{
          ok: true,
          error_code: null,
          scope_change_id: 'scope-1',
          scope_status: 'waiting_customer_decision',
          created_at_ts: '2026-05-20T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'customer-1', push_token: 'ExponentPushToken[customer]' }], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({ anthropicApiKey: 'test-anthropic-key' }).requestScopeChange(ctx, 'job-1', {
      // Phase 2.0 (2026-05-23): worker không gửi price; Kael compute từ context.
      new_description: 'Add repair scope after onsite inspection',
      reason: 'Found additional damaged part that needs immediate handling',
      photo_urls: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
    })).resolves.toMatchObject({
      scope_change_id: 'scope-1',
      job_id: 'job-1',
      status: 'waiting_customer_decision',
    })

    const requestCallIndex = client.calls.findIndex((call) => call.table === 'rpc:request_scope_change_atomic')
    const notificationCallIndex = client.calls.findIndex((call) => call.table === 'rpc:insert_notification_atomic')
    expect(requestCallIndex).toBeGreaterThan(-1)
    expect(notificationCallIndex).toBeGreaterThan(requestCallIndex)
    const requestCall = client.calls[requestCallIndex]
    expect(requestCall.operations).toContainEqual([
      'rpc',
      'request_scope_change_atomic',
      expect.objectContaining({
        p_evidence_photo_urls: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
        p_kael_computed_min: 200000,
        p_kael_computed_max: 350000,
        p_kael_review: expect.objectContaining({
          version: 'scope-change-estimate.2026-05-23.v1',
          fallback_used: false,
          problem_summary: expect.any(String),
          advisory: expect.any(String),
          complexity_assessment: 'medium',
          confidence: 0.72,
        }),
      }),
    ])
    expect(client.calls.some((call) =>
      call.table === 'scope_change_requests' &&
      call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' }),
    )
    const apiLogCall = client.calls.find((call) => call.table === 'api_logs')
    expect(apiLogCall?.operations).toContainEqual([
      'insert',
      [expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        success: true,
      })],
    ])
    expect(client.calls.findIndex((call) => call.table === 'api_logs')).toBeLessThan(notificationCallIndex)
    const notificationCall = client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')
    expect(notificationCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'customer-1',
        p_job_id: 'job-1',
        p_event_type: 'scope_change_requested',
        p_safe_metadata: { scope_change_id: 'scope-1' },
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(customer)/history?scope_change=scope-1&job_id=job-1'),
      }),
    )
  })

  it('keeps scope-change evidence media separate from completion photos', async () => {
    const jobId = '11111111-1111-1111-1111-111111111111'
    const client = makeSequenceClient([
      {
        data: {
          id: jobId,
          status: 'repairing',
          service_type: 'plumbing',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          photo_urls: [],
          completion_photo_urls: ['supabase://job-media/existing-after.jpg'],
        },
        error: null,
      },
      { data: [{ id: 'media-1' }], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).attachJobMedia(ctx, jobId, {
      assets: [{
        object_path: `${jobId}/scope_change_evidence/evidence.jpg`,
        stage: 'scope_change_evidence',
        mime_type: 'image/jpeg',
        file_size_bytes: 1234,
      }],
    })).resolves.toMatchObject({
      job_id: jobId,
      media: [expect.objectContaining({
        stage: 'scope_change_evidence',
        storage_ref: `supabase://job-media/${jobId}/scope_change_evidence/evidence.jpg`,
      })],
    })

    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) =>
        op[0] === 'update' && JSON.stringify(op[1]).includes('completion_photo_urls')
      )
    )).toBe(false)
  })

  it('notifies the worker when the customer decides a scope change', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    // Phase 2.0a (plan §22.7.B.1, 2026-05-23): on approve, decideScopeChange
    // now (a) looks up scope_change_requests.kael_computed_min/max and (b)
    // updates jobs.final_price to the Kael-locked value before the
    // notification flow. The sequence below adds those two DB rounds.
    const client = makeSequenceClient([
      {
        data: [{
          ok: true,
          error_code: null,
          job_id_out: 'job-1',
          scope_status: 'approved_by_customer',
          decided_at_ts: '2026-05-20T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: { worker_id: 'worker-1' }, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'worker-1', push_token: 'ExponentPushToken[worker]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).decideScopeChange(ctx, 'scope-1', {
      decision: 'approve',
    })).resolves.toMatchObject({
      scope_change_id: 'scope-1',
      job_id: 'job-1',
      status: 'approved_by_customer',
    })

    const notificationCall = client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')
    expect(notificationCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'worker-1',
        p_job_id: 'job-1',
        p_event_type: 'scope_change_approved',
        p_safe_metadata: { scope_change_id: 'scope-1', decision: 'approve' },
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(worker)/jobs?job_id=job-1'),
      }),
    )
    expect(client.calls.some((call) =>
      call.table === 'scope_change_requests' &&
      call.operations.some((op) => op[0] === 'select')
    )).toBe(false)
    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update' && JSON.stringify(op[1]).includes('final_price'))
    )).toBe(false)
  })

  it('fails A11 approve atomically when the Kael computed max is missing', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: [{
          ok: false,
          error_code: 'KAEL_PRICE_MISSING',
          job_id_out: null,
          scope_status: null,
          decided_at_ts: null,
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

    await expect(createEdgeServices({}).decideScopeChange(ctx, 'scope-1', {
      decision: 'approve',
    })).rejects.toMatchObject({
      code: 'KAEL_PRICE_MISSING',
      status: 409,
    })

    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].table).toBe('rpc:decide_scope_change_atomic')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('auto-approves worker cancellation, re-broadcasts, and notifies the customer without rating penalties', async () => {
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
          worker_id: 'worker-cancelled',
        },
        error: null,
      },
      {
        data: [{
          ok: true,
          error_code: null,
          cancellation_id: 'cancel-1',
          cancellation_status: 'approved',
          job_id_out: 'job-1',
          job_status: 'broadcasting',
          service_type_out: 'plumbing',
          district_code: 'q7',
          worker_id_out: 'worker-cancelled',
          created_at_ts: '2026-05-20T00:00:00.000Z',
        }],
        error: null,
      },
      {
        data: [
          { worker_id: 'worker-cancelled' },
          { worker_id: 'worker-prior' },
        ],
        error: null,
      },
      { data: { address_lat: null, address_lng: null, problem_chips: ['pipe_leak'], service_problem_id: null, kael_problem_identified: null }, error: null },
      {
        data: [
          { id: 'worker-cancelled', rating: 5, total_jobs: 100, service_types: ['plumbing'], districts: ['q7'] },
          { id: 'worker-prior', rating: 4.9, total_jobs: 90, service_types: ['plumbing'], districts: ['q7'] },
          { id: 'worker-new', rating: 4.8, total_jobs: 80, service_types: ['plumbing'], districts: ['q7'] },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [{ id: 'broadcast-new', worker_id: 'worker-new' }], error: null },
      { data: [{ notification_id: 'notification-worker', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-worker', user_id: 'worker-new', push_token: 'ExponentPushToken[worker]' }], error: null },
      { data: [{ notification_id: 'notification-customer', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-customer', user_id: 'customer-1', push_token: 'ExponentPushToken[customer]' }], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-cancelled' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestWorkerCancellation(ctx, 'job-1', {
      reason: 'Emergency reason that prevents continuing the job',
      evidence_photo_urls: [],
    })).resolves.toMatchObject({
      cancellation_id: 'cancel-1',
      job_id: 'job-1',
      status: 'approved',
      job_status: 'broadcasting',
      broadcast_sent: true,
    })

    const broadcastInsert = client.calls.find((call) =>
      call.table === 'job_broadcasts' &&
      call.operations.some((op) => op[0] === 'insert')
    )
    const insertOp = broadcastInsert?.operations.find((op) => op[0] === 'insert')
    expect(insertOp?.[1]).toEqual([
      expect.objectContaining({ worker_id: 'worker-new', job_id: 'job-1' }),
    ])
    expect(JSON.stringify(insertOp?.[1])).not.toContain('worker-cancelled')
    expect(JSON.stringify(insertOp?.[1])).not.toContain('worker-prior')

    const customerNotification = client.calls.find((call) =>
      call.table === 'rpc:insert_notification_atomic' &&
      call.operations.some((op) =>
        JSON.stringify(op).includes('worker_replacement_search')
      )
    )
    expect(customerNotification?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'customer-1',
        p_job_id: 'job-1',
        p_event_type: 'worker_replacement_search',
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(customer)/history?job_id=job-1'),
      }),
    )
    expect(client.calls.some((call) =>
      call.table === 'worker_profiles' &&
      call.operations.some((op) => op[0] === 'update' && JSON.stringify(op[1]).includes('rating'))
    )).toBe(false)
  })

  it('maps scope-change request races to STATUS_CHANGED instead of DB_ERROR', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'repairing',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          service_type: 'electrical',
          description: 'Old scope',
          address_district: 'q1',
          kael_problem_identified: 'Old issue',
          kael_complexity: 'small',
          kael_price_min: 150000,
          kael_price_max: 250000,
        },
        error: null,
      },
      {
        data: [{
          ok: false,
          error_code: 'STATUS_CHANGED',
          scope_change_id: null,
          scope_status: null,
          created_at_ts: null,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestScopeChange(ctx, 'job-1', {
      // Phase 2.0 (2026-05-23): worker không gửi price; Kael compute từ context.
      new_description: 'Thêm phạm vi sửa chữa',
      reason: 'Phát hiện lỗi phụ',
      photo_urls: [],
    })).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })
  })

  it('maps scope-change decision races to STATUS_CHANGED instead of DB_ERROR', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: false,
          error_code: 'STATUS_CHANGED',
          job_id_out: null,
          scope_status: null,
          decided_at_ts: null,
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

    await expect(createEdgeServices({}).decideScopeChange(ctx, 'scope-1', {
      decision: 'approve',
    })).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })
  })

  it('expires a stale broadcast before allowing worker decline', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'broadcast-1',
          status: 'sent',
          expires_at: '2000-01-01T00:00:00.000Z',
          jobs: { status: 'broadcasting' },
        },
        error: null,
      },
      { data: { id: 'broadcast-1' }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).declineBroadcast(ctx, 'job-1')).rejects.toMatchObject({
      code: 'EXPIRED',
      status: 410,
    })

    const updateCall = client.calls.find((call) =>
      call.table === 'job_broadcasts' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(updateCall?.operations).toContainEqual([
      'update',
      { status: 'expired', responded_at: expect.any(String) },
    ])
    expect(updateCall?.operations).toContainEqual(['eq', 'status', 'sent'])
  })

  it('does not let worker decline overwrite an accept race', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'broadcast-1',
          status: 'sent',
          expires_at: new Date(Date.now() + 30_000).toISOString(),
          jobs: { status: 'broadcasting' },
        },
        error: null,
      },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).declineBroadcast(ctx, 'job-1')).rejects.toMatchObject({
      code: 'BROADCAST_NOT_ACTIVE',
      status: 409,
    })

    const updateCall = client.calls.find((call) =>
      call.table === 'job_broadcasts' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(updateCall?.operations).toContainEqual(['eq', 'status', 'sent'])
  })

  it('rejects direct worker decline when the parent job is no longer broadcasting', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'broadcast-1',
          status: 'sent',
          expires_at: new Date(Date.now() + 30_000).toISOString(),
          jobs: { status: 'worker_matched' },
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).declineBroadcast(ctx, 'job-1')).rejects.toMatchObject({
      code: 'BROADCAST_NOT_ACTIVE',
      status: 409,
    })

    expect(client.calls.some((call) =>
      call.table === 'job_broadcasts' &&
      call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
  })

  it('blocks confirm-search retry while a broadcast is still active', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'broadcasting', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7' }, error: null },
      { data: null, error: null },
      { data: [{ id: 'broadcast-1', expires_at: '2999-01-01T00:00:00.000Z' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).rejects.toMatchObject({
      code: 'BROADCAST_ACTIVE',
      status: 409,
    })

    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('rejects confirm-search when a legacy job has no concrete HCMC district', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'priced',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          address_district: null,
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
    })

    expect(client.calls.some((call) => call.table === 'job_broadcasts')).toBe(false)
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('rejects A7 confirm-search before broadcasting when Kael baseline max is missing', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'awaiting_customer_confirm',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          address_district: 'q7',
          kael_price_max: null,
          final_price: null,
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).rejects.toMatchObject({
      code: 'KAEL_PRICE_MISSING',
      status: 409,
    })

    expect(client.calls.some((call) => call.table === 'job_broadcasts')).toBe(false)
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('returns broadcast_sent=false when retry finds no eligible worker', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'broadcasting', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7' }, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { address_lat: null, address_lng: null, problem_chips: [], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: [], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: false,
      worker: null,
    })

    const workerCall = client.calls.find((call) => call.table === 'worker_profiles')
    expect(workerCall?.operations).toContainEqual(['or', 'districts.cs.{q7},districts.cs.{hcmc_all}'])
  })

  it('creates worker notification rows and Expo push after broadcast insert', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7', kael_price_max: 250000, final_price: null }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { address_lat: null, address_lng: null, problem_chips: ['pipe_leak'], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: [{ id: 'worker-1', rating: 4.8, total_jobs: 12, service_types: ['plumbing'], districts: ['q7'] }], error: null },
      { data: [], error: null },
      { data: [{ id: 'broadcast-1', worker_id: 'worker-1' }], error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'worker-1', push_token: 'ExponentPushToken[worker]' }], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: true,
    })

    const notificationCall = client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')
    expect(notificationCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'worker-1',
        p_job_id: 'job-1',
        p_event_type: 'broadcast_received',
        p_safe_metadata: expect.objectContaining({ broadcast_id: 'broadcast-1' }),
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(worker)/jobs?broadcast_id=broadcast-1'),
      }),
    )
  })

  it('blocks duplicate confirm-search retries when another retry already took the broadcast lease', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'broadcasting', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7' }, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).rejects.toMatchObject({
      code: 'BROADCAST_ACTIVE',
      status: 409,
    })

    const leaseCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(leaseCall?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    expect(leaseCall?.operations).toContainEqual(['eq', 'status', 'broadcasting'])
    expect(leaseCall?.operations).toContainEqual(['or', expect.stringContaining('broadcast_at.lte.')])
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('normalizes legacy job district before querying eligible Edge workers', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'broadcasting', customer_id: 'customer-1', service_type: 'electrical', address_district: 'Quận 1' }, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { address_lat: null, address_lng: null, problem_chips: [], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: [], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      broadcast_sent: false,
    })

    const workerCall = client.calls.find((call) => call.table === 'worker_profiles')
    expect(workerCall?.operations).toContainEqual(['or', 'districts.cs.{q1},districts.cs.{hcmc_all}'])
  })

  it('does not fake no-worker fallback when worker eligibility query fails', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'broadcasting', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7' }, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { address_lat: null, address_lng: null, problem_chips: [], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: null, error: { code: 'PGRST500', message: 'worker query failed' } },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })

    expect(client.calls.some((call) =>
      call.table === 'job_events' &&
      call.operations.some((op) => op[0] === 'insert' && JSON.stringify(op[1]).includes('no_worker_found'))
    )).toBe(false)
    const statusUpdateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(statusUpdateCall?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
  })

  it('does not fake a no-worker fallback when broadcast insert fails', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7', kael_price_max: 250000, final_price: null }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { address_lat: null, address_lng: null, problem_chips: ['pipe_leak'], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: [{ id: 'worker-1' }], error: null },
      { data: [], error: null },
      { data: null, error: { code: 'PGRST500', message: 'insert failed' } },
      { data: { id: 'job-1' }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })

    expect(client.calls.some((call) =>
      call.table === 'job_events' &&
      call.operations.some((op) => op[0] === 'insert' && JSON.stringify(op[1]).includes('no_worker_found'))
    )).toBe(false)
    const statusUpdateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(statusUpdateCall?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    const rollbackCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => {
        const updateValue = op[1] as { status?: string } | null
        return op[0] === 'update' && updateValue?.status === 'awaiting_customer_confirm'
      })
    )
    expect(rollbackCall).toBeDefined()
    expect(rollbackCall!.operations).toContainEqual(['eq', 'id', 'job-1'])
    expect(rollbackCall!.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    expect(rollbackCall!.operations).toContainEqual(['eq', 'status', 'broadcasting'])
  })

  it('rejects legacy admin worker-cancellation decisions after auto-approval is enabled', async () => {
    const client = makeSequenceClient([])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'admin-1' },
      role: 'admin',
      supabase: client,
    }

    await expect(createEdgeServices({}).decideWorkerCancellation(ctx, 'cancel-1', {
      decision: 'approve',
    })).rejects.toMatchObject({
      code: 'DEPRECATED',
      status: 410,
    })
    expect(client.calls).toEqual([])
  })

  it('does not fake zero earnings when the earnings query fails', async () => {
    const client = makeSequenceClient([
      { data: null, error: { code: 'PGRST500', message: 'db unavailable' } },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).getWorkerEarnings(ctx, {})).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('counts reviewed jobs with paid_at as paid earnings in the Edge runtime', async () => {
    const client = makeSequenceClient([
      {
        data: [
          {
            id: 'job-reviewed-paid',
            status: 'reviewed',
            final_price: 300000,
            paid_at: '2026-05-20T00:00:00.000Z',
            created_at: '2026-05-20T00:00:00.000Z',
          },
          {
            id: 'job-pending',
            status: 'payment_pending',
            final_price: 200000,
            paid_at: null,
            created_at: '2026-05-20T00:01:00.000Z',
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).getWorkerEarnings(ctx, {})).resolves.toMatchObject({
      worker_id: 'worker-1',
      total_jobs_paid: 1,
      gross_earnings: 300000,
      pending_payment_count: 1,
      pending_payment_amount: 200000,
    })

    expect(client.calls[0].operations).toContainEqual([
      'select',
      'id, status, final_price, paid_at, created_at',
    ])
  })

  it('blocks workers from going online while an active job is assigned', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: false,
          error_code: 'WORKER_BUSY',
          is_available: null,
          updated_at_ts: null,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateWorkerAvailability(ctx, {
      is_available: true,
    })).rejects.toMatchObject({
      code: 'WORKER_BUSY',
      status: 409,
    })

    const rpcCall = client.calls.find((call) => call.table === 'rpc:set_worker_availability_atomic')
    expect(rpcCall?.operations).toContainEqual([
      'rpc',
      'set_worker_availability_atomic',
      { p_worker_id: 'worker-1', p_is_available: true },
    ])
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
    expect(client.calls.some((call) => call.table === 'jobs')).toBe(false)
  })

  it('expires stale worker broadcasts during worker polling', async () => {
    const client = makeSequenceClient([
      { data: null, error: null },
      { data: [], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    const result = await createEdgeServices({}).listWorkerBroadcasts(ctx)

    expect(result.broadcasts).toEqual([])
    const expireCall = client.calls[0]
    expect(expireCall.table).toBe('job_broadcasts')
    expect(expireCall.operations).toContainEqual(['update', expect.objectContaining({ status: 'expired' })])
    expect(expireCall.operations).toContainEqual(['eq', 'worker_id', 'worker-1'])
    expect(expireCall.operations).toContainEqual(['eq', 'status', 'sent'])
    expect(expireCall.operations.some((op) => op[0] === 'lte' && op[1] === 'expires_at')).toBe(true)
  })

  it('does not show sent worker broadcasts when the parent job is no longer broadcasting', async () => {
    const expiresAt = new Date(Date.now() + 30_000).toISOString()
    const client = makeSequenceClient([
      { data: null, error: null },
      {
        data: [
          {
            id: 'broadcast-stale',
            job_id: 'job-cancelled',
            status: 'sent',
            sent_at: '2026-05-18T00:00:00.000Z',
            expires_at: expiresAt,
            jobs: {
              status: 'cancelled',
              service_type: 'plumbing',
              address_district: 'q7',
              kael_problem_identified: 'Leak',
              kael_price_min: 100000,
              kael_price_max: 200000,
            },
          },
          {
            id: 'broadcast-active',
            job_id: 'job-active',
            status: 'sent',
            sent_at: '2026-05-18T00:00:01.000Z',
            expires_at: expiresAt,
            jobs: {
              status: 'broadcasting',
              service_type: 'electrical',
              address_district: 'q1',
              kael_problem_identified: 'Outlet check',
              kael_price_min: 150000,
              kael_price_max: 250000,
            },
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    const result = await createEdgeServices({}).listWorkerBroadcasts(ctx)

    expect(result.broadcasts).toHaveLength(1)
    expect(result.broadcasts[0]).toMatchObject({
      broadcast_id: 'broadcast-active',
      job_id: 'job-active',
      service_type: 'electrical',
    })
    const listCall = client.calls[1]
    expect(listCall.operations).toContainEqual([
      'select',
      'id, job_id, status, sent_at, expires_at, jobs(status, service_type, address_district, kael_problem_identified, kael_price_min, kael_price_max)',
    ])
  })
})

type QueryResult =
  | { data: unknown; error: { code?: string; message?: string } | null; count?: number | null }
  | { reject: unknown }
type QueryCall = { table: string; operations: unknown[][] }

function makeSequenceClient(results: QueryResult[]) {
  const calls: QueryCall[] = []
  return {
    calls,
    from(table: string) {
      const call: QueryCall = { table, operations: [] }
      calls.push(call)
      return makeQuery(call, results)
    },
    rpc(name: string, args?: Record<string, unknown>) {
      const call: QueryCall = { table: `rpc:${name}`, operations: [['rpc', name, args]] }
      calls.push(call)
      return makeQuery(call, results)
    },
  }
}

function makeQuery(call: QueryCall, results: QueryResult[]) {
  const query = {
    select(columns?: string, options?: unknown) {
      call.operations.push(options === undefined ? ['select', columns] : ['select', columns, options])
      return query
    },
    insert(value: unknown) {
      call.operations.push(['insert', value])
      return query
    },
    update(value: unknown) {
      call.operations.push(['update', value])
      return query
    },
    upsert(value: unknown) {
      call.operations.push(['upsert', value])
      return query
    },
    eq(column: string, value: unknown) {
      call.operations.push(['eq', column, value])
      return query
    },
    neq(column: string, value: unknown) {
      call.operations.push(['neq', column, value])
      return query
    },
    gt(column: string, value: unknown) {
      call.operations.push(['gt', column, value])
      return query
    },
    gte(column: string, value: unknown) {
      call.operations.push(['gte', column, value])
      return query
    },
    lte(column: string, value: unknown) {
      call.operations.push(['lte', column, value])
      return query
    },
    in(column: string, value: unknown[]) {
      call.operations.push(['in', column, value])
      return query
    },
    contains(column: string, value: unknown[]) {
      call.operations.push(['contains', column, value])
      return query
    },
    or(filter: string) {
      call.operations.push(['or', filter])
      return query
    },
    order(column: string, options?: unknown) {
      call.operations.push(['order', column, options])
      return query
    },
    range(from: number, to: number) {
      call.operations.push(['range', from, to])
      return query
    },
    limit(count: number) {
      call.operations.push(['limit', count])
      return query
    },
    single() {
      call.operations.push(['single'])
      return query
    },
    maybeSingle() {
      call.operations.push(['maybeSingle'])
      return query
    },
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      const next = results.shift() ?? { data: null, error: null }
      if ('reject' in next) {
        return Promise.reject(next.reject).then(onfulfilled, onrejected)
      }
      return Promise.resolve(next).then(onfulfilled, onrejected)
    },
  }
  return query
}
