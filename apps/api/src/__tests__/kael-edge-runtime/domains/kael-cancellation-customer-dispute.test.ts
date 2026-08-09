import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('cancellation-customer-dispute', () => {
  installEdgeRuntimeTestHooks()

  it('requests customer cancellation through the atomic P12 RPC and notifies the accepted worker without money penalties', async () => {
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
      { data: null, error: null },
      { data: null, error: null },
      {
        data: [{
          ok: true,
          error_code: null,
          cancellation_id: 'customer-cancel-1',
          job_id_out: 'job-1',
          job_status: 'cancelled',
          sub_case: 'after_worker_accept',
          reason_code: 'changed_mind',
          reason_category: 'no_penalty_phase_0',
          worker_id_out: 'worker-1',
          admin_review_required: true,
          phase0_no_monetary_penalty: true,
          worker_goodwill: {
            required: true,
            kind: 'phase0_goodwill_note',
            worker_id: 'worker-1',
          },
          abuse_signals: ['cancel_after_accept_threshold'],
          created_at_ts: '2026-05-26T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: { customer_id: 'customer-1', worker_id: 'worker-1' }, error: null },
      { data: [{ applied: true }], error: null },
      { data: [{ notification_id: 'notification-worker', created_at_ts: '2026-05-26T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-worker', user_id: 'worker-1', push_token: 'ExponentPushToken[worker]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestCustomerCancellation(ctx, 'job-1', {
      reason_code: 'changed_mind',
      reason_note: 'Toi doi y va muon huy sau khi tho da nhan viec.',
    })).resolves.toMatchObject({
      cancellation_id: 'customer-cancel-1',
      job_id: 'job-1',
      status: 'requested',
      job_status: 'cancelled',
      sub_case: 'after_worker_accept',
      reason_code: 'changed_mind',
      reason_category: 'no_penalty_phase_0',
      admin_review_required: true,
      phase0_no_monetary_penalty: true,
      worker_goodwill: {
        required: true,
        kind: 'phase0_goodwill_note',
        worker_id: 'worker-1',
      },
      abuse_signals: ['cancel_after_accept_threshold'],
    })

    expect(client.calls.find((call) => call.table === 'rpc:request_customer_cancellation_atomic')?.operations).toContainEqual([
      'rpc',
      'request_customer_cancellation_atomic',
      expect.objectContaining({
        p_job_id: 'job-1',
        p_customer_id: 'customer-1',
        p_reason_code: 'changed_mind',
      }),
    ])
    const customerCancelCallOrder = client.calls.map((call) => call.table)
    expect(customerCancelCallOrder.indexOf('customer_cancellation_records'))
      .toBeLessThan(customerCancelCallOrder.indexOf('kael_autonomy_decision_audit'))
    expect(customerCancelCallOrder.indexOf('kael_autonomy_decision_audit'))
      .toBeLessThan(customerCancelCallOrder.indexOf('rpc:request_customer_cancellation_atomic'))
    expect(client.calls.find((call) => call.table === 'job_events')?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        event_type: 'customer_requested_cancellation',
        to_status: 'cancelled',
        safe_metadata: expect.objectContaining({
          autonomy_decision: expect.objectContaining({
            actor: 'kael_system',
            action: 'process_cancellation',
            resulting_event: 'kael_processed_cancellation',
          }),
          autonomy_transition_valid: true,
        }),
      }),
    ])
    expect(client.calls.filter((call) => call.table === 'job_events')[1]?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        event_type: 'kael_processed_cancellation',
        from_status: 'worker_matched',
        to_status: 'cancelled',
        safe_metadata: expect.objectContaining({
          cancellation_id: 'customer-cancel-1',
          autonomy_decision: expect.objectContaining({
            actor: 'kael_system',
            action: 'process_cancellation',
          }),
        }),
      }),
    ])
    expect(client.calls.find((call) =>
      call.table === 'rpc:record_customer_cancellation_memory_atomic'
    )?.operations).toContainEqual([
      'rpc',
      'record_customer_cancellation_memory_atomic',
      {
        p_cancellation_id: 'customer-cancel-1',
        p_customer_id: 'customer-1',
        p_job_id: 'job-1',
      },
    ])
    expect(client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')?.operations)
      .toContainEqual([
        'rpc',
        'insert_notification_atomic',
        expect.objectContaining({
          p_user_id: 'worker-1',
          p_job_id: 'job-1',
          p_event_type: 'customer_cancelled_after_accept',
        }),
      ])
    expect(JSON.stringify(client.calls)).not.toContain('customerPenaltyAmount')
    expect(JSON.stringify(client.calls)).not.toContain('workerCompensationAmount')
  })

  it('returns the existing customer cancellation request instead of duplicating side effects', async () => {
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
          id: 'customer-cancel-1',
          status: 'dispute_pending',
          job_id: 'job-1',
          sub_case: 'after_worker_completed_trigger_dispute',
          reason_code: 'not_completed',
          reason_category: 'needs_admin_review',
          worker_id: 'worker-1',
          admin_review_required: true,
          phase0_no_monetary_penalty: true,
          worker_goodwill: { required: false, kind: 'none', worker_id: null, amount: null },
          abuse_signals: [],
          created_at: '2026-05-26T00:00:00.000Z',
        },
        error: null,
      },
      { data: [{ applied: false }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestCustomerCancellation(ctx, 'job-1', {
      reason_code: 'not_completed',
      reason_note: 'Cong viec chua hoan tat nhu thong tin ban dau.',
    })).resolves.toMatchObject({
      cancellation_id: 'customer-cancel-1',
      job_id: 'job-1',
      status: 'requested',
      job_status: 'completed_by_worker',
      sub_case: 'after_worker_completed_trigger_dispute',
      reason_code: 'not_completed',
      reason_category: 'needs_admin_review',
      admin_review_required: true,
      phase0_no_monetary_penalty: true,
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'customer_cancellation_records',
      'rpc:record_customer_cancellation_memory_atomic',
    ])
    expect(client.calls.some((call) => call.table === 'job_events')).toBe(false)
    expect(client.calls.some((call) => call.table === 'kael_admin_queue')).toBe(false)
    expect(client.calls.some((call) => call.table === 'rpc:insert_notification_atomic')).toBe(false)
  })

  it('returns an existing customer cancellation even after the job is already cancelled', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'cancelled',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: {
          id: 'customer-cancel-1',
          status: 'requested',
          job_id: 'job-1',
          sub_case: 'after_worker_accept',
          reason_code: 'changed_mind',
          reason_category: 'no_penalty_phase_0',
          worker_id: 'worker-1',
          admin_review_required: false,
          phase0_no_monetary_penalty: true,
          worker_goodwill: { required: true, kind: 'phase0_goodwill_note', worker_id: 'worker-1' },
          abuse_signals: [],
          created_at: '2026-05-26T00:00:00.000Z',
        },
        error: null,
      },
      { data: [{ applied: false }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestCustomerCancellation(ctx, 'job-1', {
      reason_code: 'changed_mind',
      reason_note: 'Toi bam lai nut huy sau khi yeu cau da duoc ghi nhan.',
    })).resolves.toMatchObject({
      cancellation_id: 'customer-cancel-1',
      job_id: 'job-1',
      status: 'requested',
      job_status: 'cancelled',
      sub_case: 'after_worker_accept',
      reason_code: 'changed_mind',
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'customer_cancellation_records',
      'rpc:record_customer_cancellation_memory_atomic',
    ])
  })

  it('opens a P13 dispute through the atomic RPC with a neutral summary and locked evidence id', async () => {
    const jobId = '11111111-1111-4111-8111-111111111111'
    const evidenceRef = `supabase://job-media/${jobId}/after/a.jpg`
    const client = makeSequenceClient([
      {
        data: [{
          object_path: `${jobId}/after/a.jpg`,
          stage: 'after',
          owner_id: 'customer-1',
        }],
        error: null,
      },
      {
        data: [{
          ok: true,
          error_code: null,
          dispute_id: 'dispute-1',
          evidence_snapshot_id: 'snapshot-1',
          dispute_status: 'open',
          admin_review_required: true,
          priority: 'high',
          evidence_locked_at: '2026-05-26T00:00:00.000Z',
          created_at_ts: '2026-05-26T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).openDispute(ctx, jobId, {
      dispute_type: 'completion_rejected',
      initiator_statement: 'Cong viec chua hoan tat nhu thong tin ban dau.',
      evidence_photo_urls: [evidenceRef],
    })).resolves.toMatchObject({
      dispute_id: 'dispute-1',
      job_id: jobId,
      status: 'open',
      dispute_type: 'completion_rejected',
      evidence_snapshot_id: 'snapshot-1',
      admin_review_required: true,
      priority: 'high',
    })

    expect(client.calls.find((call) => call.table === 'rpc:open_dispute_atomic')?.operations).toContainEqual([
      'rpc',
      'open_dispute_atomic',
      expect.objectContaining({
        p_job_id: jobId,
        p_initiated_by_id: 'customer-1',
        p_dispute_type: 'completion_rejected',
        p_evidence_photo_urls: [evidenceRef],
        p_kael_neutral_summary: expect.stringContaining('Evidence snapshot'),
      }),
    ])
    expect(JSON.stringify(client.calls.find((call) => call.table === 'rpc:open_dispute_atomic')?.operations)).not.toContain('refund')
    expect(client.calls.find((call) => call.table === 'job_events')?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: jobId,
        event_type: 'dispute_opened',
      }),
    ])
  })

  it.each(['STATUS_CHANGED', 'INCIDENT_CLAIM_STALE'])(
    'maps scope-change request race %s to STATUS_CHANGED instead of DB_ERROR',
    async (rpcErrorCode) => {
      const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        content: [{
          type: 'text',
          text: JSON.stringify({
            complexity_assessment: 'medium',
            price_min: 200000,
            price_max: 350000,
            confidence: 0.8,
            problem_summary: 'Phạm vi phát sinh đã được phân tích.',
            advisory: 'Khách cần xác nhận trước khi tiếp tục.',
          }),
        }],
        usage: { input_tokens: 120, output_tokens: 48 },
      }))
    )
      vi.stubGlobal('fetch', fetchMock)
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
        data: [{ ok: true, error_code: null, claimed: true, replayed: false }],
        error: null,
      },
      { data: { worker_id: 'worker-1', scope_change_rate: 0 }, error: null },
      {
        data: [{
          ok: false,
          error_code: rpcErrorCode,
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

      await expect(createEdgeServices({ anthropicApiKey: 'test-anthropic-key' }).requestScopeChange(ctx, 'job-1', {
        client_request_id: 'c5100000-0000-4000-8000-000000000002',
        new_description: 'Thêm phạm vi sửa chữa',
        reason: 'Phát hiện lỗi phụ',
        photo_urls: [],
      })).rejects.toMatchObject({
        code: 'STATUS_CHANGED',
        status: 409,
      })
    },
  )
})
