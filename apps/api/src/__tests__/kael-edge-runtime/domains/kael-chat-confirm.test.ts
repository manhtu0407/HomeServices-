import { describe, expect, it } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { type HarnessTraceContext } from '../../../../../../supabase/functions/_shared/harness/trace'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient, quoteReadyPlumbingDiagnosisScope } from '../harness'

describe('chat-confirm', () => {
  installEdgeRuntimeTestHooks()
  const priceReasoningReceiptInput = {
    price_reasoning_receipt_id: 'price_reasoning:receipt-1',
  }
  const futureSchedule = '2099-01-15T01:00:00.000Z'

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
          scheduled_at: futureSchedule,
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

    await expect(createEdgeServices({}).confirmKaelChat(ctx, 'kael-session-1', priceReasoningReceiptInput)).resolves.toMatchObject({
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
        p_price_reasoning_receipt_id: 'price_reasoning:receipt-1',
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

  it('opens the saved-worker choice after confirmation without loading worker eligibility', async () => {
    const client = makeSequenceClient([], {
      begin_job_matching_preference_atomic: [
        { data: [{ ok: true, error_code: null }], error: null },
      ],
      confirm_kael_chat_atomic: [
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
      ],
    }, {
      customer_favorite_workers: [{ data: [{ worker_id: 'worker-1' }], error: null }],
      job_broadcasts: [{ data: [], error: null }],
      job_events: [
        { data: null, error: null },
        { data: null, error: null },
        { data: [], error: null },
      ],
      job_matching_preferences: [{
        data: { strategy: 'pending', auto_general: true, fallback_at: null },
        error: null,
      }],
      jobs: [
        { data: { id: 'job-1' }, error: null },
        {
          data: {
            id: 'job-1',
            status: 'awaiting_customer_confirm',
            customer_id: 'customer-1',
            service_type: 'plumbing',
            address_district: 'q7',
            kael_problem_identified: 'Pipe leak',
            kael_price_max: 250000,
            final_price: null,
          },
          error: null,
        },
      ],
      kael_chat_sessions: [
        {
          data: {
            id: 'kael-session-1',
            customer_id: 'customer-1',
            case_phase: 'offer_review',
            diagnosis_scope: quoteReadyPlumbingDiagnosisScope(),
            scheduled_at: futureSchedule,
          },
          error: null,
        },
        { data: { safe_metadata: {} }, error: null },
      ],
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmKaelChat(ctx, 'kael-session-1', {
      ...priceReasoningReceiptInput,
      matching_mode: 'prompt_if_saved',
    })).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: false,
      matching_state: { stage: 'awaiting_choice' },
    })

    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
    expect(client.calls.some((call) => call.table === 'job_broadcasts' &&
      call.operations.some((operation) => operation[0] === 'insert'))).toBe(false)
  })

  it('records only the safe confirmation RPC code when the RPC fails', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          customer_id: 'customer-1',
          case_phase: 'offer_review',
          diagnosis_scope: quoteReadyPlumbingDiagnosisScope(),
          scheduled_at: futureSchedule,
        },
        error: null,
      },
      { data: null, error: { code: 'PGRST202', message: 'permission denied for function confirm_kael_chat_atomic' } },
    ])
    const traceEvents: Array<{ name: string; args?: Record<string, unknown> }> = []
    const traceContext: HarnessTraceContext = {
      traceId: '00000000-0000-4000-8000-000000000001',
      runId: '00000000-0000-4000-8000-000000000002',
      parentRunId: null,
      turnId: null,
      toolCallId: null,
      parentEventId: null,
      actorIdHash: null,
      actorRole: 'customer',
      jobId: null,
      releaseId: 'test',
      environment: 'local',
      startedAtMs: 0,
      client: {
        rpc: async (name, args) => {
          traceEvents.push({ name, args })
          return { data: true, error: null }
        },
      },
    }
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
      traceContext,
    }

    await expect(createEdgeServices({}).confirmKaelChat(ctx, 'kael-session-1', priceReasoningReceiptInput))
      .rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })

    expect(traceEvents).toContainEqual({
      name: 'append_harness_event',
      args: expect.objectContaining({
        p_event_class: 'kael.confirm.rpc_failed',
        p_error_code: 'KAEL_CONFIRM_RPC_FAILED',
        p_safe_metadata: { rpc_code: 'PGRST202', rpc_subject: 'function_execute' },
      }),
    })
    expect(JSON.stringify(traceEvents)).not.toContain('confirm_kael_chat_atomic')
  })

  it('restores the Kael offer phase when broadcast creation fails after confirmation', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'kael-session-1',
          customer_id: 'customer-1',
          case_phase: 'offer_review',
          diagnosis_scope: quoteReadyPlumbingDiagnosisScope(),
          scheduled_at: futureSchedule,
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
      createEdgeServices({}).confirmKaelChat(ctx, 'kael-session-1', priceReasoningReceiptInput),
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
          scheduled_at: futureSchedule,
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

    await expect(createEdgeServices({}).confirmKaelChat(ctx, 'kael-session-1', priceReasoningReceiptInput)).resolves.toMatchObject({
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
        p_price_reasoning_receipt_id: 'price_reasoning:receipt-1',
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
          scheduled_at: futureSchedule,
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

    await expect(createEdgeServices({}).confirmKaelChat(ctx, 'kael-session-1', priceReasoningReceiptInput))
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
          scheduled_at: futureSchedule,
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

    await expect(createEdgeServices({}).confirmKaelChat(ctx, 'kael-session-1', priceReasoningReceiptInput)).resolves.toMatchObject({
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

})
