import { describe, expect, it } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('review', () => {
  installEdgeRuntimeTestHooks()

  it('rejects review submission until the job is paid', async () => {
    const client = makeSequenceClient([{
      data: {
        id: 'job-1',
        status: 'confirmed_by_customer',
        customer_id: 'customer-1',
        worker_id: 'worker-1',
      },
      error: null,
    }])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).submitReview(ctx, 'job-1', {
      rating: 5,
      tags: [],
    })).rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 })
    expect(client.calls.some((call) => call.table === 'rpc:submit_review_atomic')).toBe(false)
  })

  it('treats duplicate review RPC responses as idempotent current state when a review exists', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'paid',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: [{
          ok: false,
          error_code: 'ALREADY_REVIEWED',
          review_id: 'review-1',
          job_status: 'reviewed',
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
    })).resolves.toEqual({
      review_id: 'review-1',
      job_id: 'job-1',
      status: 'reviewed',
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
    expect(client.calls.some((call) => call.table === 'job_events')).toBe(false)
    expect(client.calls.some((call) => call.table === 'rpc:insert_notification_atomic')).toBe(false)
  })

  it('keeps duplicate review idempotency in reviewed phase when RPC omits job status', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'paid',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
        },
        error: null,
      },
      {
        data: [{
          ok: false,
          error_code: 'ALREADY_REVIEWED',
          review_id: 'review-1',
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
    })).resolves.toEqual({
      review_id: 'review-1',
      job_id: 'job-1',
      status: 'reviewed',
    })
  })

  it('returns the existing review when the current job is already reviewed', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'reviewed',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          service_type: 'plumbing',
          address_district: 'q7',
          kael_problem_identified: 'Pipe leak',
          kael_complexity: 'small',
          kael_price_min: 150000,
          kael_price_max: 250000,
          final_price: 250000,
        },
        error: null,
      },
      { data: { id: 'review-1' }, error: null },
      { data: [{ applied: false }], error: null },
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
    })).resolves.toEqual({
      review_id: 'review-1',
      job_id: 'job-1',
      status: 'reviewed',
    })

    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'reviews',
      'rpc:record_normal_transaction_memory_atomic',
    ])
  })

  it('P9 records normal transaction memory and thanks the customer after review', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'paid',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          service_type: 'plumbing',
          address_district: 'q7',
          kael_problem_identified: 'leaking_pipe',
          kael_complexity: 'medium',
          kael_price_min: 250000,
          kael_price_max: 450000,
          final_price: 450000,
        },
        error: null,
      },
      {
        data: [{
          ok: true,
          error_code: null,
          review_id: 'review-1',
          job_status: 'reviewed',
          reviewed_at_ts: '2026-05-25T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: [{ applied: true }], error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-25T00:00:00.000Z' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).submitReview(ctx, 'job-1', {
      rating: 5,
      tags: ['on_time'],
    })).resolves.toMatchObject({
      review_id: 'review-1',
      job_id: 'job-1',
      status: 'reviewed',
    })

    expect(client.calls.find((call) =>
      call.table === 'rpc:record_normal_transaction_memory_atomic'
    )?.operations).toContainEqual([
      'rpc',
      'record_normal_transaction_memory_atomic',
      { p_customer_id: 'customer-1', p_job_id: 'job-1' },
    ])

    const memoryAuditLayers = client.calls
      .filter((call) => call.table === 'kael_memory_audit')
      .map((call) => (call.operations.find((op) => op[0] === 'insert')?.[1] as Record<string, unknown>)?.layer)
    expect(memoryAuditLayers).toEqual(['L2', 'L3', 'L4', 'L5'])
    expect(client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')?.operations)
      .toContainEqual([
        'rpc',
        'insert_notification_atomic',
        expect.objectContaining({
          p_user_id: 'customer-1',
          p_job_id: 'job-1',
          p_event_type: 'review_thanks',
        }),
      ])
  })
})
