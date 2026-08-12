import { describe, expect, it } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('chat-create-recovery', () => {
  installEdgeRuntimeTestHooks()

  it('returns JOB_PENDING instead of a fake estimate for duplicate in-flight job creates', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-pending' }, error: null },
      {
        data: {
          id: 'job-pending',
          status: 'analyzing',
          service_type: 'plumbing',
          kael_problem_identified: null,
          kael_complexity: null,
          kael_price_min: null,
          kael_price_max: null,
          kael_advisory: null,
          kael_estimate_card_v3: null,
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

    await expect(createEdgeServices({}).createJob(ctx, {
      service_type: 'plumbing',
      description: 'Ong nuoc ro ri duoi lavabo can tho toi kiem tra',
      problem_chips: ['pipe_leak'],
      photo_urls: [],
      address_district: 'q7',
      client_request_id: '00000000-0000-4000-8000-000000000001',
    })).rejects.toMatchObject({ code: 'JOB_PENDING', status: 409 })
  })

  it('returns SESSION_PENDING instead of a half-created empty Kael chat session', async () => {
    const client = makeSequenceClient([{
      data: {
        id: 'kael-session-pending',
        job_id: null,
        status: 'active',
        estimate_ready_at: null,
        total_turns: 0,
      },
      error: null,
    }])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).createKaelChat(ctx, {
      service_type: 'electrical',
      message: 'Den phong tam chap chon can kiem tra',
      problem_chips: [],
      photo_urls: [],
      client_request_id: '00000000-0000-4000-8000-000000000002',
    })).rejects.toMatchObject({ code: 'SESSION_PENDING', status: 409 })
    expect(client.calls.map((call) => call.table)).toEqual(['kael_chat_sessions'])
  })

  it('replays a deliberately empty Kael session instead of leaving it pending forever', async () => {
    const session = {
      id: 'kael-session-empty',
      job_id: null,
      customer_id: 'customer-1',
      service_type: 'electrical',
      status: 'active',
      case_phase: 'analysis',
      diagnosis_scope: null,
      scheduled_at: null,
      started_at: '2026-07-14T00:00:00.000Z',
      estimate_ready_at: null,
      total_turns: 0,
      total_cost_usd: 0,
      safe_metadata: { initial_turn_expected: false },
      created_at: '2026-07-14T00:00:00.000Z',
    }
    const client = makeSequenceClient([
      { data: session, error: null },
      { data: { id: session.id, customer_id: 'customer-1' }, error: null },
      { data: { id: 'customer-conversation-empty' }, error: null },
      { data: session, error: null },
      { data: [], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).createKaelChat(ctx, {
      service_type: 'electrical',
      problem_chips: [],
      photo_urls: [],
      client_request_id: '00000000-0000-4000-8000-000000000003',
    })

    expect(result.session.id).toBe('kael-session-empty')
    expect(result.turns).toEqual([])
  })

  it('retires a half-created Kael session so the same idempotency key can retry', async () => {
    const client = makeSequenceClient([
      { data: null, error: null },
      { data: [{ allowed: true }], error: null },
      {
        data: {
          id: 'kael-session-failed',
          job_id: null,
          customer_id: 'customer-1',
          service_type: 'electrical',
          status: 'active',
          case_phase: 'analysis',
          diagnosis_scope: null,
          scheduled_at: null,
          started_at: '2026-07-14T00:00:00.000Z',
          estimate_ready_at: null,
          total_turns: 0,
          total_cost_usd: 0,
          safe_metadata: { initial_turn_expected: true },
          created_at: '2026-07-14T00:00:00.000Z',
        },
        error: null,
      },
      { data: { id: 'kael-session-failed', customer_id: 'customer-1' }, error: null },
      { data: { id: 'customer-conversation-failed' }, error: null },
      { data: null, error: { code: 'PERSIST_FAILED' } },
      { data: { id: 'kael-session-failed' }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).createKaelChat(ctx, {
      service_type: 'electrical',
      message: 'Den phong tam chap chon can kiem tra',
      problem_chips: [],
      photo_urls: [],
      client_request_id: '00000000-0000-4000-8000-000000000004',
    })).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })

    const retireCall = client.calls.find((call) =>
      call.table === 'kael_chat_sessions' &&
      call.operations.some((operation) => {
        const value = operation[1] as { status?: string } | undefined
        return operation[0] === 'update' && value?.status === 'abandoned'
      })
    )
    expect(retireCall?.operations).toContainEqual([
      'update',
      { client_request_id: null, status: 'abandoned' },
    ])
    expect(retireCall?.operations).toContainEqual(['eq', 'id', 'kael-session-failed'])
    expect(retireCall?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    expect(retireCall?.operations).toContainEqual(['eq', 'status', 'active'])
    expect(retireCall?.operations).toContainEqual(['eq', 'total_turns', 0])
  })
})
