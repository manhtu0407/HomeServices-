import { describe, expect, it } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('worker-earnings', () => {
  installEdgeRuntimeTestHooks()

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

  it('uses the exact reconciled earnings aggregate in the Edge runtime', async () => {
    const client = makeSequenceClient([], {
      get_worker_earnings_summary: [{
        data: [
          {
            worker_id: 'worker-1',
            total_jobs_paid: 1,
            gross_earnings: 280000,
            platform_fee_total: 14000,
            net_earnings: 266000,
            available_balance: 266000,
            cash_commission_collected_total: 0,
            cash_commission_due_total: 0,
            pending_payment_count: 1,
            pending_payment_amount: 200000,
            on_hold_amount: 0,
            current_commission_level: 1,
            current_commission_rate_bps: 1500,
            recent_transactions: [],
            daily_earnings: [
              {
                date: '2026-05-20',
                gross_earnings: 280000,
                platform_fee_total: 14000,
                net_earnings: 266000,
                paid_job_count: 1,
              },
            ],
            from_date: '2026-05-01T00:00:00.000Z',
            to_date: '2026-05-31T23:59:59.999Z',
          },
        ],
        error: null,
      }],
      get_worker_payment_safety_balance: [{
        data: [{
          available_balance: 266000,
          collateral_reserved_amount: 0,
          withdrawal_reserved_amount: 0,
          withdrawn_total: 0,
        }],
        error: null,
      }],
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).getWorkerEarnings(ctx, {
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-05-31T23:59:59.999Z',
    })).resolves.toMatchObject({
      worker_id: 'worker-1',
      total_jobs_paid: 1,
      gross_earnings: 280000,
      platform_fee_total: 14000,
      net_earnings: 266000,
      available_balance: 266000,
      cash_commission_collected_total: 0,
      cash_commission_due_total: 0,
      pending_payment_count: 1,
      pending_payment_amount: 200000,
      on_hold_amount: 0,
      current_commission_level: 1,
      current_commission_rate_bps: 1500,
      recent_transactions: [],
      daily_earnings: [
        {
          date: '2026-05-20',
          gross_earnings: 280000,
          platform_fee_total: 14000,
          net_earnings: 266000,
          paid_job_count: 1,
        },
      ],
    })

    expect(client.calls[0].table).toBe('rpc:get_worker_earnings_summary')
    expect(client.calls[0].operations).toContainEqual([
      'rpc',
      'get_worker_earnings_summary',
      {
        p_worker_id: 'worker-1',
        p_from: '2026-05-01T00:00:00.000Z',
        p_to: '2026-05-31T23:59:59.999Z',
      },
    ])
  })

  it.each([
    ['missing daily rows', undefined],
    ['invalid calendar date', [{
      date: '2026-02-30',
      gross_earnings: 1,
      platform_fee_total: 0,
      net_earnings: 1,
      paid_job_count: 1,
    }]],
    ['fractional money', [{
      date: '2026-05-20',
      gross_earnings: 1.5,
      platform_fee_total: 0,
      net_earnings: 1,
      paid_job_count: 1,
    }]],
    ['non-descending dates', [
      {
        date: '2026-05-19',
        gross_earnings: 1,
        platform_fee_total: 0,
        net_earnings: 1,
        paid_job_count: 1,
      },
      {
        date: '2026-05-20',
        gross_earnings: 1,
        platform_fee_total: 0,
        net_earnings: 1,
        paid_job_count: 1,
      },
    ]],
  ])('fails closed for malformed aggregate daily earnings: %s', async (_label, dailyEarnings) => {
    const client = makeSequenceClient([{
      data: [{
        worker_id: 'worker-1',
        total_jobs_paid: 1,
        gross_earnings: 1,
        platform_fee_total: 0,
        net_earnings: 1,
        available_balance: 1,
        pending_payment_count: 0,
        pending_payment_amount: 0,
        on_hold_amount: 0,
        current_commission_level: 1,
        current_commission_rate_bps: 1500,
        recent_transactions: [],
        daily_earnings: dailyEarnings,
      }],
      error: null,
    }])
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

  it('fails closed when an aggregate total is malformed', async () => {
    const client = makeSequenceClient([{
      data: [{
        worker_id: 'worker-1',
        total_jobs_paid: 1,
        gross_earnings: 'not-a-number',
        platform_fee_total: 0,
        net_earnings: 1,
        available_balance: 1,
        pending_payment_count: 0,
        pending_payment_amount: 0,
        on_hold_amount: 0,
        current_commission_level: 1,
        current_commission_rate_bps: 1500,
        recent_transactions: [],
        daily_earnings: [],
      }],
      error: null,
    }])
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

  it('rejects an unbounded daily earnings aggregate', async () => {
    const dailyEarnings = Array.from({ length: 367 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 11, 31 - index)).toISOString().slice(0, 10),
      gross_earnings: 1,
      platform_fee_total: 0,
      net_earnings: 1,
      paid_job_count: 1,
    }))
    const client = makeSequenceClient([{
      data: [{
        worker_id: 'worker-1',
        total_jobs_paid: 367,
        gross_earnings: 367,
        platform_fee_total: 0,
        net_earnings: 367,
        available_balance: 367,
        pending_payment_count: 0,
        pending_payment_amount: 0,
        on_hold_amount: 0,
        current_commission_level: 1,
        current_commission_rate_bps: 1500,
        recent_transactions: [],
        daily_earnings: dailyEarnings,
      }],
      error: null,
    }])
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

  it('rejects an earnings aggregate attributed to another worker', async () => {
    const client = makeSequenceClient([{
      data: [{
        worker_id: 'worker-2',
        total_jobs_paid: 0,
        gross_earnings: 0,
        platform_fee_total: 0,
        net_earnings: 0,
        available_balance: 0,
        pending_payment_count: 0,
        pending_payment_amount: 0,
        on_hold_amount: 0,
        current_commission_level: 1,
        current_commission_rate_bps: 1500,
        recent_transactions: [],
        daily_earnings: [],
      }],
      error: null,
    }])
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
    const expireCall = client.calls.find((call) =>
      call.table === 'job_broadcasts' && call.operations.some((operation) => operation[0] === 'update')
    )
    expect(expireCall?.operations).toContainEqual(['update', expect.objectContaining({ status: 'expired' })])
    expect(expireCall?.operations).toContainEqual(['eq', 'worker_id', 'worker-1'])
    expect(expireCall?.operations).toContainEqual(['eq', 'status', 'sent'])
    expect(expireCall?.operations.some((op) => op[0] === 'lte' && op[1] === 'expires_at')).toBe(true)
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
              scheduled_at: '2026-07-15T03:00:00.000Z',
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
              scheduled_at: '2026-07-15T01:00:00.000Z',
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
      media_count: 0,
      scheduled_at: '2026-07-15T01:00:00.000Z',
      service_type: 'electrical',
    })
    const listCall = client.calls.find((call) =>
      call.table === 'job_broadcasts' && call.operations.some((operation) => operation[0] === 'select')
    )
    expect(listCall?.operations).toContainEqual([
      'select',
      'id, job_id, status, sent_at, expires_at, jobs(status, service_type, address_district, scheduled_at, kael_problem_identified, kael_price_min, kael_price_max, kael_worker_brief_core, photo_urls)',
    ])
  })

  it('quotes a worker offer from the current server commission tier instead of a static fee', async () => {
    const expiresAt = new Date(Date.now() + 30_000).toISOString()
    const client = makeSequenceClient([
      { data: null, error: null },
      {
        data: [{
          id: 'broadcast-tiered',
          job_id: 'job-tiered',
          status: 'sent',
          sent_at: '2026-07-27T04:00:00.000Z',
          expires_at: expiresAt,
          jobs: {
            status: 'broadcasting',
            service_type: 'plumbing',
            address_district: 'q7',
            scheduled_at: '2026-07-27T05:00:00.000Z',
            kael_problem_identified: 'Pipe leak',
            kael_price_min: 150000,
            kael_price_max: 250000,
          },
        }],
        error: null,
      },
    ], {
      get_worker_current_commission_tier: [{
        data: [{ commission_level: 3, commission_rate_bps: 800 }],
        error: null,
      }],
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    const result = await createEdgeServices({}).listWorkerBroadcasts(ctx)

    expect(result.broadcasts[0]).toMatchObject({
      estimated_earning_min: 138000,
      estimated_earning_max: 230000,
    })
    expect(client.calls.find((call) => call.table === 'rpc:get_worker_current_commission_tier')?.operations)
      .toContainEqual(['rpc', 'get_worker_current_commission_tier', { p_worker_id: 'worker-1' }])
  })
})
