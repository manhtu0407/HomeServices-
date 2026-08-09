import { describe, expect, it } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient, quoteReadyPlumbingDiagnosisScope } from '../harness'

describe('chat-confirm', () => {
  installEdgeRuntimeTestHooks()

  it('confirms a quote-ready artifact through the production RPC without a duplicate confidence gate', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          customer_id: 'customer-1',
          case_phase: 'offer_review',
          diagnosis_scope: {
            ...quoteReadyPlumbingDiagnosisScope(),
            confidence: 0.4,
          },
        },
        error: null,
      },
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
      { data: null, error: null },
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

    const confirmRpc = client.calls.find((call) => call.table === 'rpc:confirm_kael_chat_atomic')
    expect(confirmRpc?.operations).toContainEqual([
      'rpc',
      'confirm_kael_chat_atomic',
      {
        p_session_id: 'kael-session-1',
        p_customer_id: 'customer-1',
      },
    ])
    const addressUpdateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => {
        const value = op[1] as { address_building?: string } | undefined
        return op[0] === 'update' && value?.address_building === 'Landmark 81, Bình Thạnh'
      })
    )
    expect(addressUpdateCall?.operations).toContainEqual(['eq', 'id', 'job-1'])
    const statusUpdateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => {
        const value = op[1] as { status?: string } | undefined
        return op[0] === 'update' && value?.status === 'broadcasting'
      })
    )
    expect(statusUpdateCall?.operations).toContainEqual(['eq', 'status', 'awaiting_customer_confirm'])
  })

  it('restores the Kael offer phase when broadcast creation fails after confirmation', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          customer_id: 'customer-1',
          case_phase: 'offer_review',
          diagnosis_scope: quoteReadyPlumbingDiagnosisScope(),
        },
        error: null,
      },
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
      { data: { safe_metadata: {} }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: { id: 'job-1', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7', kael_price_max: 250000, final_price: null }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { customer_id: 'customer-1', address_lat: null, address_lng: null, problem_chips: ['pipe_leak'], service_problem_id: null, kael_problem_identified: null, diagnosis_scope: quoteReadyPlumbingDiagnosisScope() }, error: null },
      { data: [], error: null },
      { data: [{ id: 'worker-1', rating: 4.8, total_jobs: 12, service_types: ['plumbing'], districts: ['q7'], problem_specializations: ['water_leak_diagnosis'] }], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: { code: 'PGRST500', message: 'insert failed' } },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { id: 'kael-session-1' }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(
      createEdgeServices({}).confirmKaelChat(ctx, 'kael-session-1'),
    ).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })

    const sessionRollback = client.calls.find((call) =>
      call.table === 'kael_chat_sessions' &&
      call.operations.some((operation) => {
        const updateValue = operation[1] as { status?: string; case_phase?: string } | undefined
        return operation[0] === 'update' &&
          updateValue?.status === 'estimate_ready' &&
          updateValue.case_phase === 'offer_review'
      })
    )
    expect(sessionRollback).toBeDefined()
    expect(sessionRollback!.operations).toContainEqual(['eq', 'id', 'kael-session-1'])
    expect(sessionRollback!.operations).toContainEqual(['eq', 'job_id', 'job-1'])
    expect(sessionRollback!.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    expect(sessionRollback!.operations).toContainEqual(['eq', 'case_phase', 'matching'])
  })

  it('returns current state for a duplicate Kael chat confirmation without rebroadcasting', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          customer_id: 'customer-1',
          case_phase: 'offer_review',
          diagnosis_scope: quoteReadyPlumbingDiagnosisScope(),
        },
        error: null,
      },
      {
        data: [{
          ok: false,
          error_code: 'ALREADY_CONFIRMED',
          job_id: 'job-1',
          job_status: null,
          service_type: 'plumbing',
          district_code: null,
        }],
        error: null,
      },
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          customer_id: 'customer-1',
          worker_id: null,
        },
        error: null,
      },
      { data: [{ id: 'broadcast-1', expires_at: '2999-01-01T00:00:00.000Z' }], error: null },
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
      broadcast_sent: true,
      worker: null,
    })

    const confirmRpc = client.calls.find((call) => call.table === 'rpc:confirm_kael_chat_atomic')
    expect(confirmRpc?.operations).toContainEqual([
      'rpc',
      'confirm_kael_chat_atomic',
      {
        p_session_id: 'kael-session-1',
        p_customer_id: 'customer-1',
      },
    ])
    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
    expect(client.calls.some((call) => call.table === 'job_broadcasts' &&
      call.operations.some((op) => op[0] === 'insert')
    )).toBe(false)
  })

  it('fails closed when duplicate-confirm recovery cannot read the confirmed job id', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          customer_id: 'customer-1',
          case_phase: 'offer_review',
          diagnosis_scope: quoteReadyPlumbingDiagnosisScope(),
        },
        error: null,
      },
      {
        data: [{
          ok: false,
          error_code: 'ALREADY_CONFIRMED',
          job_id: null,
          job_status: null,
          service_type: 'plumbing',
          district_code: null,
        }],
        error: null,
      },
      { data: null, error: { code: 'SESSION_RECOVERY_READ_FAILED' } },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmKaelChat(ctx, 'kael-session-1'))
      .rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
  })

  it('retries a confirmed Kael session left in matching when the job is back in ticket review', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          customer_id: 'customer-1',
          case_phase: 'matching',
          diagnosis_scope: quoteReadyPlumbingDiagnosisScope(),
        },
        error: null,
      },
      {
        data: [{
          ok: false,
          error_code: 'ALREADY_CONFIRMED',
          job_id: 'job-1',
          job_status: null,
          service_type: 'plumbing',
          district_code: null,
        }],
        error: null,
      },
      {
        data: {
          id: 'job-1',
          status: 'awaiting_customer_confirm',
          customer_id: 'customer-1',
          worker_id: null,
        },
        error: null,
      },
      {
        data: {
          id: 'job-1',
          status: 'awaiting_customer_confirm',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          address_district: 'q7',
          kael_problem_identified: 'Pipe leak',
          kael_price_min: 150000,
          kael_price_max: 250000,
          final_price: null,
        },
        error: null,
      },
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

    const statusUpdateCall = client.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => {
        const value = op[1] as { status?: string } | undefined
        return op[0] === 'update' && value?.status === 'broadcasting'
      })
    )
    expect(statusUpdateCall?.operations).toContainEqual(['eq', 'status', 'awaiting_customer_confirm'])
    expect(client.calls.some((call) =>
      call.table === 'kael_chat_sessions' &&
      call.operations.some((operation) => operation[0] === 'update')
    )).toBe(false)
  })

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
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-pending',
          job_id: null,
          status: 'active',
          estimate_ready_at: null,
          total_turns: 0,
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
      {
        data: { id: 'kael-session-failed', customer_id: 'customer-1' },
        error: null,
      },
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
