import { describe, expect, it } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('customer-conversations', () => {
  installEdgeRuntimeTestHooks()

  it('reconciles an archived legacy Case Work session back into the active Customer catalog', async () => {
    const clientRequestId = '11111111-1111-4111-8111-111111111111'
    const client = makeSequenceClient([
      {
        data: [{
          client_request_id: clientRequestId,
          id: 'case-session-legacy',
          job_id: 'job-legacy',
          jobs: {
            customer_id: 'customer-1',
            id: 'job-legacy',
            status: 'arrived',
          },
          status: 'confirmed',
        }],
        error: null,
      },
      {
        data: [{
          archived_at: '2026-07-14T01:00:00.000Z',
          case_session_id: 'case-session-legacy',
          id: 'case-session-legacy',
        }],
        error: null,
      },
      { data: [{ id: 'case-session-legacy' }], error: null },
      {
        data: [{
          archived_at: null,
          case_session_id: 'case-session-legacy',
          chat_mode: 'case',
          client_request_id: clientRequestId,
          created_at: '2026-07-13T00:00:00.000Z',
          customer_id: 'customer-1',
          id: 'case-session-legacy',
          pinned_at: null,
          title: null,
          total_turns: 0,
          updated_at: '2026-07-14T02:00:00.000Z',
        }],
        error: null,
      },
      {
        data: [{ id: 'case-session-legacy', job_id: 'job-legacy', total_turns: 4 }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(
      createEdgeServices({}).listCustomerKaelConversations(ctx, 'case'),
    ).resolves.toMatchObject({
      sessions: [{
        case_job_id: 'job-legacy',
        case_session_id: 'case-session-legacy',
        id: 'case-session-legacy',
        total_turns: 4,
      }],
    })

    const discoveryCall = client.calls[0]
    expect(discoveryCall?.table).toBe('kael_chat_sessions')
    expect(discoveryCall?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    expect(discoveryCall?.operations).toContainEqual(['neq', 'status', 'abandoned'])
    expect(discoveryCall?.operations).toContainEqual(['eq', 'jobs.customer_id', 'customer-1'])
    const statusFilter = discoveryCall?.operations.find((operation) => (
      operation[0] === 'in' && operation[1] === 'jobs.status'
    ))?.[2] as string[] | undefined
    expect(statusFilter).toContain('arrived')
    expect(statusFilter).not.toContain('cancelled')
    expect(statusFilter).not.toContain('paid')
    expect(statusFilter).not.toContain('reviewed')

    const restoreCall = client.calls[2]
    expect(restoreCall?.table).toBe('kael_customer_conversations')
    expect(restoreCall?.operations).toContainEqual(['update', { archived_at: null }])
    expect(restoreCall?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
  })

  it('creates the missing catalog row for an owned active legacy Case Work session', async () => {
    const clientRequestId = '22222222-2222-4222-8222-222222222222'
    const client = makeSequenceClient([
      {
        data: [{
          client_request_id: clientRequestId,
          id: 'case-session-missing',
          job_id: 'job-missing',
          jobs: {
            customer_id: 'customer-1',
            id: 'job-missing',
            status: 'repairing',
          },
          status: 'confirmed',
        }],
        error: null,
      },
      { data: [], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: { id: 'case-session-missing' }, error: null },
      {
        data: [{
          archived_at: null,
          case_session_id: 'case-session-missing',
          chat_mode: 'case',
          client_request_id: clientRequestId,
          created_at: '2026-07-13T00:00:00.000Z',
          customer_id: 'customer-1',
          id: 'case-session-missing',
          pinned_at: null,
          title: null,
          total_turns: 0,
          updated_at: '2026-07-14T02:00:00.000Z',
        }],
        error: null,
      },
      {
        data: [{ id: 'case-session-missing', job_id: 'job-missing', total_turns: 6 }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(
      createEdgeServices({}).listCustomerKaelConversations(ctx, 'case'),
    ).resolves.toMatchObject({
      sessions: [{
        case_job_id: 'job-missing',
        case_session_id: 'case-session-missing',
        id: 'case-session-missing',
        total_turns: 6,
      }],
    })

    const insertCall = client.calls.find((call) => (
      call.table === 'kael_customer_conversations'
      && call.operations.some((operation) => operation[0] === 'insert')
    ))
    expect(insertCall?.operations).toContainEqual(['insert', {
      case_session_id: 'case-session-missing',
      chat_mode: 'case',
      client_request_id: clientRequestId,
      customer_id: 'customer-1',
      id: 'case-session-missing',
    }])
  })

  it('enriches and reorders Customer Case Work sessions by authoritative activity', async () => {
    const client = makeSequenceClient([
      { data: [], error: null },
      {
        data: [{
          archived_at: null,
          case_session_id: 'case-session-2',
          chat_mode: 'case',
          client_request_id: '22222222-2222-4222-8222-222222222222',
          created_at: '2026-07-14T00:30:00.000Z',
          customer_id: 'customer-1',
          id: 'conversation-2',
          pinned_at: null,
          title: null,
          total_turns: 0,
          updated_at: '2026-07-14T02:00:00.000Z',
        }, {
          archived_at: null,
          case_session_id: 'case-session-1',
          chat_mode: 'case',
          client_request_id: '11111111-1111-4111-8111-111111111111',
          created_at: '2026-07-14T00:00:00.000Z',
          customer_id: 'customer-1',
          id: 'conversation-1',
          pinned_at: null,
          title: null,
          total_turns: 1,
          updated_at: '2026-07-14T00:00:00.000Z',
        }],
        error: null,
      },
      {
        data: [{
          id: 'case-session-2',
          job_id: 'job-2',
          safe_metadata: { profile_id: 'clean_scope' },
          service_type: 'cleaning',
          total_turns: 1,
          updated_at: '2026-07-14T02:00:00.000Z',
        }, {
          id: 'case-session-1',
          job_id: 'job-1',
          safe_metadata: { profile_id: 'water_diagnose' },
          service_type: 'plumbing',
          total_turns: 2,
          updated_at: '2026-07-14T03:00:00.000Z',
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

    await expect(
      createEdgeServices({}).listCustomerKaelConversations(ctx, 'case'),
    ).resolves.toMatchObject({
      sessions: [{
        case_job_id: 'job-1',
        case_session_id: 'case-session-1',
        id: 'conversation-1',
        profile_id: 'water_diagnose',
        service_type: 'plumbing',
        total_turns: 3,
        updated_at: '2026-07-14T03:00:00.000Z',
      }, {
        case_job_id: 'job-2',
        case_session_id: 'case-session-2',
        id: 'conversation-2',
        profile_id: 'clean_scope',
        service_type: 'cleaning',
        total_turns: 1,
        updated_at: '2026-07-14T02:00:00.000Z',
      }],
    })
    expect(client.calls[2]?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    expect(client.calls[2]?.operations).toContainEqual(['in', 'id', ['case-session-2', 'case-session-1']])
    expect(client.calls[2]?.operations).toContainEqual([
      'select',
      'id, job_id, service_type, safe_metadata, total_turns, updated_at',
    ])
  })

  it('requires confirmation before closing a linked Customer Case Work conversation', async () => {
    const client = makeSequenceClient([{
      data: {
        archived_at: null,
        case_session_id: 'case-session-1',
        chat_mode: 'case',
        client_request_id: '11111111-1111-4111-8111-111111111111',
        created_at: '2026-07-14T00:00:00.000Z',
        customer_id: 'customer-1',
        id: 'conversation-1',
        pinned_at: null,
        title: null,
        total_turns: 0,
        updated_at: '2026-07-14T00:00:00.000Z',
      },
      error: null,
    }])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(
      createEdgeServices({}).archiveCustomerKaelConversation(ctx, 'conversation-1', false),
    ).rejects.toMatchObject({ code: 'CASE_WORK_CONFIRMATION_REQUIRED', status: 409 })
    expect(client.calls.map((call) => call.table)).toEqual(['kael_customer_conversations'])
  })

  it('does not let a Customer close another Customer Case Work conversation', async () => {
    const client = makeSequenceClient([{
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    }])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(
      createEdgeServices({}).archiveCustomerKaelConversation(ctx, 'another-customer-conversation', true),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0]?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
  })

  it('cancels a linked pre-accept job before abandoning and archiving its Customer session', async () => {
    const client = makeSequenceClient([
      {
        data: {
          archived_at: null,
          case_session_id: 'case-session-1',
          chat_mode: 'case',
          client_request_id: '11111111-1111-4111-8111-111111111111',
          created_at: '2026-07-14T00:00:00.000Z',
          customer_id: 'customer-1',
          id: 'conversation-1',
          pinned_at: null,
          title: null,
          total_turns: 0,
          updated_at: '2026-07-14T00:00:00.000Z',
        },
        error: null,
      },
      { data: { id: 'case-session-1', job_id: 'job-1', total_turns: 2 }, error: null },
      { data: { id: 'job-1', status: 'broadcasting' }, error: null },
      { data: { customer_id: 'customer-1', id: 'job-1', status: 'broadcasting' }, error: null },
      {
        data: [{
          cancelled_at_ts: '2026-07-14T00:01:00.000Z',
          error_code: null,
          job_status: 'cancelled',
          ok: true,
        }],
        error: null,
      },
      { data: null, error: null },
      { data: { id: 'case-session-1' }, error: null },
      { data: { id: 'conversation-1' }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(
      createEdgeServices({}).archiveCustomerKaelConversation(ctx, 'conversation-1', true),
    ).resolves.toMatchObject({
      case_action: 'cancelled',
      case_session_id: 'case-session-1',
      job_id: 'job-1',
      job_status: 'cancelled',
      session_id: 'conversation-1',
    })

    const callOrder = client.calls.map((call) => call.table)
    expect(callOrder.indexOf('rpc:cancel_job_before_accept_atomic'))
      .toBeLessThan(callOrder.lastIndexOf('kael_chat_sessions'))
    expect(callOrder.lastIndexOf('kael_chat_sessions'))
      .toBeLessThan(callOrder.lastIndexOf('kael_customer_conversations'))
    expect(client.calls[client.calls.length - 1]?.operations).toContainEqual([
      'update',
      expect.objectContaining({ archived_at: expect.any(String), pinned_at: null }),
    ])
  })

  it('runs the arrived-job cancellation policy before archiving its Customer Case Work session', async () => {
    const client = makeSequenceClient([
      {
        data: {
          archived_at: null,
          case_session_id: 'case-session-1',
          chat_mode: 'case',
          client_request_id: '11111111-1111-4111-8111-111111111111',
          created_at: '2026-07-14T00:00:00.000Z',
          customer_id: 'customer-1',
          id: 'conversation-1',
          pinned_at: null,
          title: null,
          total_turns: 0,
          updated_at: '2026-07-14T00:00:00.000Z',
        },
        error: null,
      },
      { data: { id: 'case-session-1', job_id: 'job-1', total_turns: 2 }, error: null },
      { data: { id: 'job-1', status: 'arrived' }, error: null },
      {
        data: {
          customer_id: 'customer-1',
          id: 'job-1',
          scheduled_at: null,
          status: 'arrived',
          worker_id: null,
        },
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      {
        data: [{
          abuse_signals: [],
          admin_review_required: false,
          cancellation_id: 'customer-cancel-1',
          created_at_ts: '2026-07-14T00:01:00.000Z',
          error_code: null,
          job_status: 'cancelled',
          ok: true,
          phase0_no_monetary_penalty: true,
          reason_category: 'no_penalty_phase_0',
          reason_code: 'changed_mind',
          sub_case: 'after_worker_accept',
          worker_goodwill: {
            kind: 'none',
            required: false,
            worker_id: null,
          },
          worker_id_out: null,
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: { customer_id: 'customer-1', worker_id: null }, error: null },
      { data: { safe_metadata: {}, trust_signals: {} }, error: null },
      { data: { customer_id: 'customer-1' }, error: null },
      { data: { id: 'queue-customer-cancel' }, error: null },
      { data: { id: 'case-session-1' }, error: null },
      { data: { id: 'conversation-1' }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(
      createEdgeServices({}).archiveCustomerKaelConversation(ctx, 'conversation-1', true),
    ).resolves.toMatchObject({
      case_action: 'cancelled',
      job_id: 'job-1',
      job_status: 'cancelled',
      session_id: 'conversation-1',
    })

    const callOrder = client.calls.map((call) => call.table)
    expect(callOrder.indexOf('rpc:request_customer_cancellation_atomic'))
      .toBeLessThan(callOrder.lastIndexOf('kael_chat_sessions'))
    expect(callOrder.lastIndexOf('kael_chat_sessions'))
      .toBeLessThan(callOrder.lastIndexOf('kael_customer_conversations'))
    expect(client.calls.find((call) => call.table === 'rpc:request_customer_cancellation_atomic')?.operations)
      .toContainEqual([
        'rpc',
        'request_customer_cancellation_atomic',
        expect.objectContaining({
          p_customer_id: 'customer-1',
          p_job_id: 'job-1',
          p_reason_code: 'changed_mind',
          p_reason_note: 'Khách xác nhận đóng phiên Xử lý công việc.',
        }),
      ])
  })
})
