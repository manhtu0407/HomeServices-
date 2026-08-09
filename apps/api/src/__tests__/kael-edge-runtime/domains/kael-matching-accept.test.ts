import { describe, expect, it } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('matching-accept', () => {
  installEdgeRuntimeTestHooks()

  it('rejects direct cancellation after worker accept before calling the cancel RPC', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_matched',
          customer_id: 'customer-1',
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

    await expect(createEdgeServices({}).cancelJob(ctx, 'job-1')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      status: 409,
    })

    expect(client.calls).toEqual([
      {
        table: 'jobs',
        operations: [[
          'select',
          'id, status, customer_id',
        ], [
          'eq',
          'id',
          'job-1',
        ], [
          'single',
        ]],
      },
    ])
  })

  it('validates pre-accept cancellation before using the atomic cancel RPC', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          customer_id: 'customer-1',
        },
        error: null,
      },
      {
        data: [{
          ok: true,
          error_code: null,
          job_status: 'cancelled',
          cancelled_at_ts: '2026-05-27T00:00:00.000Z',
        }],
        error: null,
      },
      { data: { id: 'event-1' }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).cancelJob(ctx, 'job-1')).resolves.toEqual({
      job_id: 'job-1',
      status: 'cancelled',
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'rpc:cancel_job_before_accept_atomic',
      'job_events',
    ])
    expect(client.calls[1]?.operations).toContainEqual([
      'rpc',
      'cancel_job_before_accept_atomic',
      {
        p_job_id: 'job-1',
        p_customer_id: 'customer-1',
      },
    ])
    expect(client.calls[2]?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        event_type: 'customer_cancelled_before_accept',
        from_status: 'broadcasting',
        to_status: 'cancelled',
      }),
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

  it('notifies the customer when a worker becomes their pending candidate', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: true,
          error_code: null,
          job_status: 'worker_candidate_pending',
          candidate_id: 'candidate-1',
          already_applied: false,
        }],
        error: null,
      },
      { data: null, error: null },
      { data: { customer_id: 'customer-1' }, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).acceptBroadcast(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'worker_candidate_pending',
      candidate_id: 'candidate-1',
      awaiting_customer_confirmation: true,
      already_applied: false,
    })

    const notificationCall = client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')
    expect(notificationCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'customer-1',
        p_job_id: 'job-1',
        p_event_type: 'worker_candidate_ready',
        p_safe_metadata: { candidate_id: 'candidate-1' },
      }),
    ])
  })

  it('returns no address fields while worker acceptance awaits customer confirmation', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: true,
          error_code: null,
          job_status: 'worker_candidate_pending',
          candidate_id: 'candidate-1',
          already_applied: false,
        }],
        error: null,
      },
      { data: null, error: null },
      { data: { customer_id: null }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    const response = await createEdgeServices({}).acceptBroadcast(ctx, 'job-1')
    expect(response).toMatchObject({
      job_id: 'job-1',
      status: 'worker_candidate_pending',
      candidate_id: 'candidate-1',
    })
    expect(response).not.toHaveProperty('full_address')
    expect(response).not.toHaveProperty('address_access')
  })

  it('returns a PII-minimized worker candidate view to the owning customer', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_candidate_pending',
          customer_id: 'customer-1',
          worker_id: null,
        },
        error: null,
      },
      {
        data: {
          id: 'candidate-1',
          job_id: 'job-1',
          worker_id: 'worker-1',
          status: 'proposed',
          proposed_at: '2026-07-11T00:00:00.000Z',
          customer_decided_at: null,
        },
        error: null,
      },
      {
        data: {
          id: 'worker-1',
          rating: 4.8,
          total_jobs: 12,
          years_experience: 5,
          verification_status: 'approved',
        },
        error: null,
      },
      {
        data: {
          full_name: 'Thợ Minh',
          avatar_url: 'https://cdn.example.test/avatar.png',
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

    const response = await createEdgeServices({}).getWorkerCandidate(ctx, 'job-1')
    expect(response).toMatchObject({
      job_id: 'job-1',
      status: 'worker_candidate_pending',
      candidate: {
        candidate_id: 'candidate-1',
        worker_id: 'worker-1',
        display_name: 'Thợ Minh',
        rating: 4.8,
        total_jobs: 12,
        years_experience: 5,
        verification_status: 'approved',
      },
    })
    expect(response.candidate).not.toHaveProperty('phone')
    expect(response.candidate).not.toHaveProperty('bank_account')
    expect(response.candidate).not.toHaveProperty('cccd_front_url')
    expect(response.candidate).not.toHaveProperty('address_unit')
    const selectedColumns = client.calls.flatMap((call) => call.operations)
      .filter((operation) => operation[0] === 'select')
      .map((operation) => String(operation[1]))
      .join(',')
    expect(selectedColumns).not.toMatch(/phone|bank_|cccd|legal_name|address_|home_lat|home_lng/)
  })

  it('keeps a retried customer worker confirmation idempotent at the Edge boundary', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: true,
          error_code: null,
          job_status: 'worker_matched',
          candidate_id: 'candidate-1',
          worker_id: 'worker-1',
          already_applied: true,
        }],
        error: null,
      },
      {
        data: {
          id: 'candidate-1',
          job_id: 'job-1',
          worker_id: 'worker-1',
          status: 'customer_confirmed',
          proposed_at: '2026-07-11T00:00:00.000Z',
          customer_decided_at: '2026-07-11T00:01:00.000Z',
        },
        error: null,
      },
      {
        data: {
          id: 'worker-1',
          rating: 4.8,
          total_jobs: 12,
          years_experience: 5,
          verification_status: 'approved',
        },
        error: null,
      },
      { data: { full_name: 'Thợ Minh', avatar_url: null }, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(
      createEdgeServices({}).confirmWorkerCandidate(ctx, 'job-1', 'candidate-1'),
    ).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'worker_matched',
      already_applied: true,
      candidate: { candidate_id: 'candidate-1', status: 'customer_confirmed' },
    })
    expect(client.calls.filter((call) => call.table === 'rpc:log_job_event_atomic')).toHaveLength(0)
    expect(client.calls.filter((call) => call.table === 'rpc:insert_notification_atomic')).toHaveLength(0)
  })

  it('resumes ranked matching after customer rejection and excludes prior recipients', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          ok: true,
          error_code: null,
          job_status: 'broadcasting',
          candidate_id: 'candidate-1',
          worker_id: 'worker-1',
          already_applied: false,
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      {
        data: {
          id: 'candidate-1',
          job_id: 'job-1',
          worker_id: 'worker-1',
          status: 'customer_declined',
          proposed_at: '2026-07-11T00:00:00.000Z',
          customer_decided_at: '2026-07-11T00:01:00.000Z',
        },
        error: null,
      },
      {
        data: {
          id: 'worker-1',
          rating: 4.8,
          total_jobs: 12,
          years_experience: 5,
          verification_status: 'approved',
        },
        error: null,
      },
      { data: { full_name: 'Thợ Minh', avatar_url: null }, error: null },
      { data: null, error: null },
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          customer_id: 'customer-1',
          worker_id: null,
          service_type: 'electrical',
          address_district: 'q7',
        },
        error: null,
      },
      { data: null, error: null },
      { data: [], error: null },
      { data: [{ worker_id: 'worker-1' }], error: null },
      {
        data: {
          address_lat: null,
          address_lng: null,
          problem_chips: [],
          service_problem_id: null,
          kael_problem_identified: 'Kiểm tra điện',
        },
        error: null,
      },
      {
        data: [{
          id: 'worker-1',
          rating: 4.8,
          total_jobs: 12,
          service_types: ['electrical'],
          districts: ['q7'],
          home_lat: null,
          home_lng: null,
          service_radius_km: 10,
          problem_specializations: [],
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

    await expect(
      createEdgeServices({}).rejectWorkerCandidate(ctx, 'job-1', 'candidate-1'),
    ).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'broadcasting',
      candidate: { candidate_id: 'candidate-1', status: 'customer_declined' },
      broadcast_sent: false,
    })
    const recipientLookup = client.calls.find((call) =>
      call.table === 'job_broadcasts' &&
      call.operations.some((operation) => operation[0] === 'select' && operation[1] === 'worker_id')
    )
    expect(recipientLookup).toBeDefined()
    const candidateQuery = client.calls.find((call) =>
      call.table === 'worker_profiles' &&
      call.operations.some((operation) => operation[0] === 'contains')
    )
    expect(candidateQuery).toBeDefined()
    expect(client.calls.some((call) => call.table === 'job_broadcasts' &&
      call.operations.some((operation) => operation[0] === 'insert'))).toBe(false)
  })
})
