import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { getJobBroadcastState } from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/broadcasts'
import type { DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('matching-broadcast', () => {
  installEdgeRuntimeTestHooks()

  it('keeps customer broadcast-state reads free of maintenance writes', async () => {
    const client = makeSequenceClient([], {}, {
      job_broadcasts: [{
        data: [{ id: 'broadcast-1', expires_at: '2000-01-01T00:00:00.000Z' }],
        error: null,
      }],
    })

    await expect(getJobBroadcastState(client as unknown as DbClient, 'job-1')).resolves.toEqual({
      active_count: 0,
      seconds_remaining: 0,
    })

    expect(client.calls.some((call) =>
      call.table === 'job_broadcasts' &&
      call.operations.some((operation) => operation[0] === 'update')
    )).toBe(false)
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
          status: 'awaiting_customer_confirm',
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

  it('rejects confirm-search if the frontend tries to skip ticket review', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'estimate_ready',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          address_district: 'q7',
          kael_price_max: 250000,
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
      code: 'INVALID_STATUS',
      status: 409,
    })

    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('rejects A7 matching start before broadcasting when Kael baseline max is missing', async () => {
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
      { data: { customer_id: 'customer-1', address_lat: null, address_lng: null, problem_chips: ['pipe_leak'], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: [], error: null },
      { data: [{ id: 'worker-1', rating: 4.8, total_jobs: 12, service_types: ['plumbing'], districts: ['q7'] }], error: null },
      { data: [], error: null },
      { data: [], error: null },
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
    ], {
      claim_job_broadcast_retry_atomic: [
        { data: [{ claimed: false, error_code: 'CLAIM_ACTIVE' }], error: null },
      ],
    })
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
      call.table === 'rpc:claim_job_broadcast_retry_atomic'
    )
    expect(leaseCall?.operations).toContainEqual([
      'rpc',
      'claim_job_broadcast_retry_atomic',
      expect.objectContaining({
        p_job_id: 'job-1',
        p_customer_id: 'customer-1',
        p_claim_token: expect.any(String),
        p_lease_seconds: 180,
      }),
    ])
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('reports a concurrent retry status change instead of disguising it as an active broadcast', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'broadcasting', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7' }, error: null },
      { data: null, error: null },
      { data: [], error: null },
    ], {
      claim_job_broadcast_retry_atomic: [
        { data: [{ claimed: false, error_code: 'INVALID_STATUS' }], error: null },
      ],
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('normalizes legacy job district before querying eligible Edge workers', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'broadcasting', customer_id: 'customer-1', service_type: 'electrical', address_district: 'Quận 1' }, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: { id: 'job-1' }, error: null },
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
    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )).toBe(false)
  })

  it('does not fake a no-worker fallback when broadcast insert fails', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7', kael_price_max: 250000, final_price: null }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { customer_id: 'customer-1', address_lat: null, address_lng: null, problem_chips: ['pipe_leak'], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: [], error: null },
      { data: [{ id: 'worker-1', selected_service_types: ['plumbing'] }], error: null },
      { data: [], error: null },
      { data: [], error: null },
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
})
