import { describe, expect, it } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

function workerOfferQuote(input: {
  broadcastId: string
  commissionLevel: number
  commissionRateBps: number
  expiresAt: string
  jobId: string
  workerId: string
}) {
  const referencePriceMin = 150_000
  const referencePriceMax = 250_000
  const customerTotal = 200_000
  const platformFee = Math.round(customerTotal * input.commissionRateBps / 10_000)
  return {
    broadcast_id: input.broadcastId,
    commission_level: input.commissionLevel,
    commission_rate_bps: input.commissionRateBps,
    customer_confirmation_required: true,
    customer_total: customerTotal,
    expires_at: input.expiresAt,
    job_id: input.jobId,
    platform_fee: platformFee,
    price_source: 'verified_baseline',
    quote_id: '55555555-5555-4555-8555-555555555555',
    reasoning_receipt: {
      fairness: {
        baseline_evidence: {
          accepted_source_count: 1,
          high_trust_source_count: 1,
          quorum_met: true,
          required_quorum: 1,
          schema_version: 'baseline_price_evidence_receipt.v1',
          sources: [{}],
        },
        cap_statement: 'Giá khóa trong phạm vi đã xác nhận.',
        confidence: 'low',
        high_trust_source_count: 1,
        market_source_count: 2,
        price_source: 'verified_baseline',
        quorum_met: true,
      },
      scenarios: {
        high: { total: referencePriceMax },
        low: { total: referencePriceMin },
      },
      schema_version: 'price_reasoning_receipt.v1',
    },
    reference_price_max: referencePriceMax,
    reference_price_min: referencePriceMin,
    schema_version: 'original_scope_price_quote.v1',
    selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
    worker_confirmation_required: true,
    worker_confirmed_at: null,
    worker_id: input.workerId,
    worker_net: customerTotal - platformFee,
  }
}

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

  // Same invariant as the aggregate-rpc-runtime case; both moved to P35-worker-earnings-fail-closed.

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
    const workerId = '33333333-3333-4333-8333-333333333333'
    const activeBroadcastId = '44444444-4444-4444-8444-444444444444'
    const activeJobId = '11111111-1111-4111-8111-111111111111'
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
            id: activeBroadcastId,
            job_id: activeJobId,
            status: 'sent',
            sent_at: '2026-05-18T00:00:01.000Z',
            expires_at: expiresAt,
            jobs: {
              status: 'broadcasting',
              service_type: 'electrical',
              address_district: 'q1',
              scheduled_at: '2026-07-15T01:00:00.000Z',
              problem_chips: ['Ổ cắm mất điện'],
              description: 'Kiểm tra một ổ cắm mất điện; loại trừ đi dây âm tường.',
              kael_problem_identified: 'Outlet check. Chốt giá thấp nhất.',
              kael_price_min: 150000,
              kael_price_max: 250000,
            },
            original_scope_price_quote: workerOfferQuote({
              broadcastId: activeBroadcastId,
              commissionLevel: 1,
              commissionRateBps: 1500,
              expiresAt,
              jobId: activeJobId,
              workerId,
            }),
          },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: workerId },
      role: 'worker',
      supabase: client,
    }

    const result = await createEdgeServices({}).listWorkerBroadcasts(ctx)

    expect(result.broadcasts).toHaveLength(1)
    expect(result.broadcasts[0]).toMatchObject({
      broadcast_id: activeBroadcastId,
      job_id: activeJobId,
      media_count: 0,
      problem_summary: 'Ổ cắm mất điện',
      scheduled_at: '2026-07-15T01:00:00.000Z',
      scope_summary: 'Kiểm tra một ổ cắm mất điện; loại trừ đi dây âm tường.',
      service_type: 'electrical',
    })
    const listCall = client.calls.find((call) =>
      call.table === 'job_broadcasts' && call.operations.some((operation) => operation[0] === 'select')
    )
    expect(listCall?.operations).toContainEqual([
      'select',
      'id, job_id, status, sent_at, expires_at, original_scope_price_quote, jobs(status, service_type, problem_chips, description, address_district, scheduled_at, kael_problem_identified, kael_price_min, kael_price_max, kael_worker_brief_core, photo_urls)',
    ])
  })

  it('quotes a worker offer from the frozen bilateral commission tier', async () => {
    const expiresAt = new Date(Date.now() + 30_000).toISOString()
    const workerId = '33333333-3333-4333-8333-333333333333'
    const broadcastId = '44444444-4444-4444-8444-444444444445'
    const jobId = '11111111-1111-4111-8111-111111111112'
    const client = makeSequenceClient([
      { data: null, error: null },
      {
        data: [{
          id: broadcastId,
          job_id: jobId,
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
          original_scope_price_quote: workerOfferQuote({
            broadcastId,
            commissionLevel: 3,
            commissionRateBps: 800,
            expiresAt,
            jobId,
            workerId,
          }),
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: workerId },
      role: 'worker',
      supabase: client,
    }

    const result = await createEdgeServices({}).listWorkerBroadcasts(ctx)

    expect(result.broadcasts[0]).toMatchObject({
      estimated_earning_min: 138000,
      estimated_earning_max: 230000,
    })
    expect(client.calls.some((call) => call.table === 'rpc:get_worker_current_commission_tier')).toBe(false)
  })
})
