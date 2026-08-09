import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('cancellation-worker', () => {
  installEdgeRuntimeTestHooks()

  it('rejects worker cancellation after the customer has confirmed completion before calling the RPC', async () => {
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
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestWorkerCancellation(ctx, 'job-1', {
      reason: 'Cannot continue after the job was already confirmed',
      evidence_photo_urls: [],
    })).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      status: 409,
    })

    expect(client.calls.map((call) => call.table)).toEqual(['jobs'])
  })

  it('returns the existing worker cancellation request instead of duplicating side effects', async () => {
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
          id: 'worker-cancel-1',
          status: 'reviewing_by_kael',
          created_at: '2026-05-26T00:00:00.000Z',
          reason_code: 'higher_pay_elsewhere',
          reason_category: 'suspicious',
          admin_review_required: true,
          fallback_options: [{ id: 'wait_15_minutes' }],
          abuse_signals: ['cancellation_rate_exceeded'],
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

    await expect(createEdgeServices({}).requestWorkerCancellation(ctx, 'job-1', {
      reason: 'Emergency reason that prevents continuing the job',
      evidence_photo_urls: [],
    })).resolves.toMatchObject({
      cancellation_id: 'worker-cancel-1',
      job_id: 'job-1',
      status: 'reviewing_by_kael',
      job_status: 'worker_on_way',
      broadcast_sent: false,
      reason_code: 'higher_pay_elsewhere',
      reason_category: 'suspicious',
      admin_review_required: true,
      abuse_signals: ['cancellation_rate_exceeded'],
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'worker_cancellation_requests',
    ])
    expect(client.calls.some((call) => call.table === 'job_events')).toBe(false)
    expect(client.calls.some((call) => call.table === 'kael_admin_queue')).toBe(false)
  })

  it('returns the existing worker cancellation request when the duplicate RPC omits the cancellation id', async () => {
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
          id: 'worker-cancel-1',
          status: 'reviewing_by_kael',
          created_at: '2026-05-26T00:00:00.000Z',
          reason_code: 'higher_pay_elsewhere',
          reason_category: 'suspicious',
          admin_review_required: true,
          fallback_options: [{ id: 'wait_15_minutes' }],
          abuse_signals: ['cancellation_rate_exceeded'],
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

    await expect(createEdgeServices({}).requestWorkerCancellation(ctx, 'job-1', {
      reason: 'Emergency reason that prevents continuing the job',
      evidence_photo_urls: [],
    })).resolves.toMatchObject({
      cancellation_id: 'worker-cancel-1',
      job_id: 'job-1',
      status: 'reviewing_by_kael',
      job_status: 'worker_on_way',
      broadcast_sent: false,
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'worker_cancellation_requests',
    ])
    expect(client.calls.some((call) => call.table === 'job_events')).toBe(false)
    expect(client.calls.some((call) => call.table === 'kael_admin_queue')).toBe(false)
  })

  it('returns an approved worker cancellation after the worker has already been released from the job', async () => {
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
      {
        data: {
          id: 'worker-cancel-1',
          status: 'approved',
          created_at: '2026-05-26T00:00:00.000Z',
          reason_code: 'vehicle_breakdown_with_photo',
          reason_category: 'legit_auto_approve',
          admin_review_required: false,
          fallback_options: [{ id: 'wait_15_minutes' }],
          abuse_signals: [],
        },
        error: null,
      },
      { data: [{ applied: false }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).requestWorkerCancellation(ctx, 'job-1', {
      reason: 'Vehicle breakdown with photo proof already submitted.',
      evidence_photo_urls: ['supabase://job-media/job-1/cancellation_evidence/vehicle.jpg'],
    })).resolves.toMatchObject({
      cancellation_id: 'worker-cancel-1',
      job_id: 'job-1',
      status: 'approved',
      job_status: 'broadcasting',
      broadcast_sent: false,
      reason_code: 'vehicle_breakdown_with_photo',
      reason_category: 'legit_auto_approve',
      admin_review_required: false,
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'worker_cancellation_requests',
      'rpc:record_worker_cancellation_memory_atomic',
    ])
    expect(client.calls.some((call) => call.table === 'rpc:request_worker_cancellation_atomic')).toBe(false)
    expect(client.calls.some((call) => call.table === 'job_events')).toBe(false)
    expect(client.calls.some((call) => call.table === 'kael_admin_queue')).toBe(false)
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
      { data: null, error: null },
      { data: null, error: null },
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
          reason_code: 'higher_pay_elsewhere',
          reason_category: 'suspicious',
          admin_review_required: true,
          fallback_options: [
            { id: 'wait_15_minutes', label_vi: 'Đợi 15 phút để Kael tìm tiếp', effect: 'continue_rebroadcast_search' },
            { id: 'reschedule', label_vi: 'Đổi sang khung giờ khác', effect: 'reschedule_job' },
            { id: 'cancel_no_charge', label_vi: 'Hủy việc, chưa tính phí trong Phase 0', effect: 'cancel_without_charge', no_charge_phase0: true },
          ],
          abuse_signals: ['cancellation_rate_exceeded', 'consecutive_cancel_threshold'],
        }],
        error: null,
      },
      { data: { id: 'job-1' }, error: null },
      {
        data: [
          { worker_id: 'worker-cancelled' },
          { worker_id: 'worker-prior' },
        ],
        error: null,
      },
      { data: { customer_id: 'customer-1', address_lat: null, address_lng: null, problem_chips: ['pipe_leak'], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: [], error: null },
      {
        data: [
          { id: 'worker-cancelled', rating: 5, total_jobs: 100, service_types: ['plumbing'], districts: ['q7'] },
          { id: 'worker-prior', rating: 4.9, total_jobs: 90, service_types: ['plumbing'], districts: ['q7'] },
          { id: 'worker-new', rating: 4.8, total_jobs: 80, service_types: ['plumbing'], districts: ['q7'] },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ id: 'broadcast-new', worker_id: 'worker-new' }], error: null },
      { data: [{ notification_id: 'notification-worker', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-worker', user_id: 'worker-new', push_token: 'ExponentPushToken[worker]' }], error: null },
      { data: [{ notification_id: 'notification-customer', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-customer', user_id: 'customer-1', push_token: 'ExponentPushToken[customer]' }], error: null },
      { data: null, error: null },
      { data: [{ applied: true }], error: null },
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
      reason_code: 'higher_pay_elsewhere',
      reason_category: 'suspicious',
      admin_review_required: true,
      abuse_signals: ['cancellation_rate_exceeded', 'consecutive_cancel_threshold'],
      fallback_options: [
        expect.objectContaining({ id: 'wait_15_minutes' }),
        expect.objectContaining({ id: 'reschedule' }),
        expect.objectContaining({ id: 'cancel_no_charge', no_charge_phase0: true }),
      ],
    })

    const broadcastActivation = client.calls.find((call) =>
      call.table === 'rpc:activate_job_broadcast_batch_atomic'
    )
    const workerCancelCallOrder = client.calls.map((call) => call.table)
    expect(workerCancelCallOrder.indexOf('worker_cancellation_requests'))
      .toBeLessThan(workerCancelCallOrder.indexOf('kael_autonomy_decision_audit'))
    expect(workerCancelCallOrder.indexOf('kael_autonomy_decision_audit'))
      .toBeLessThan(workerCancelCallOrder.indexOf('rpc:request_worker_cancellation_atomic'))
    expect(broadcastActivation?.operations).toContainEqual([
      'rpc',
      'activate_job_broadcast_batch_atomic',
      expect.objectContaining({ p_job_id: 'job-1', p_worker_ids: ['worker-new'] }),
    ])
    expect(JSON.stringify(broadcastActivation?.operations)).not.toContain('worker-cancelled')
    expect(JSON.stringify(broadcastActivation?.operations)).not.toContain('worker-prior')

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
    expect(client.calls.some((call) =>
      call.table === 'worker_profiles' &&
      call.operations.some((op) => op[0] === 'update' && JSON.stringify(op[1]).includes('is_suspended'))
    )).toBe(false)
    expect(client.calls.find((call) =>
      call.table === 'rpc:record_worker_cancellation_memory_atomic'
    )?.operations).toContainEqual([
      'rpc',
      'record_worker_cancellation_memory_atomic',
      {
        p_cancellation_id: 'cancel-1',
        p_job_id: 'job-1',
        p_sub_case: 'explicit_cancel',
        p_worker_id: 'worker-cancelled',
      },
    ])
  })

  it('exposes no admin worker-cancellation decision service after auto-approval is enabled', () => {
    expect('decideWorkerCancellation' in createEdgeServices({})).toBe(false)
  })
})
