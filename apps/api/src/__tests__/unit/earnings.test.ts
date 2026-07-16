import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
  },
  ensureServerEnv: vi.fn(),
}))

vi.mock('@/lib/db/query', () => ({
  withDbTimeout: <T,>(promise: PromiseLike<T>) => promise,
  DbTimeoutError: class extends Error {},
}))

import { computeEarnings } from '@/lib/workers/earnings'

type EarningsAggregateRow = {
  worker_id: string
  total_jobs_paid: number
  gross_earnings: number
  platform_fee_total: number
  net_earnings: number
  pending_payment_count: number
  pending_payment_amount: number
  daily_earnings: unknown
  from_date: string | null
  to_date: string | null
}

function aggregateRow(overrides: Partial<EarningsAggregateRow> = {}): EarningsAggregateRow {
  return {
    worker_id: 'worker-1',
    total_jobs_paid: 0,
    gross_earnings: 0,
    platform_fee_total: 0,
    net_earnings: 0,
    pending_payment_count: 0,
    pending_payment_amount: 0,
    daily_earnings: [],
    from_date: null,
    to_date: null,
    ...overrides,
  }
}

function makeSupabase(
  row: EarningsAggregateRow | null,
  error: { code: string } | null = null,
) {
  return {
    from: vi.fn(() => {
      throw new Error('earnings must not fetch a capped jobs row list')
    }),
    rpc: vi.fn(async () => ({ data: row ? [row] : null, error })),
  } as any
}

describe('computeEarnings', () => {
  it('maps the exact all-time aggregate for a new worker', async () => {
    const supabase = makeSupabase(aggregateRow())

    await expect(computeEarnings(supabase, 'worker-1')).resolves.toEqual({
      workerId: 'worker-1',
      totalJobsPaid: 0,
      grossEarnings: 0,
      platformFeeTotal: 0,
      netEarnings: 0,
      pendingPaymentCount: 0,
      pendingPaymentAmount: 0,
      dailyEarnings: [],
      fromDate: null,
      toDate: null,
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('preserves database-reconciled frozen payment amounts', async () => {
    const supabase = makeSupabase(aggregateRow({
      total_jobs_paid: 2,
      gross_earnings: 1_400_000,
      platform_fee_total: 95_000,
      net_earnings: 1_305_000,
      pending_payment_count: 3,
      pending_payment_amount: 1_200_000,
    }))

    const result = await computeEarnings(supabase, 'worker-1')

    expect(result).toMatchObject({
      totalJobsPaid: 2,
      grossEarnings: 1_400_000,
      platformFeeTotal: 95_000,
      netEarnings: 1_305_000,
      pendingPaymentCount: 3,
      pendingPaymentAmount: 1_200_000,
    })
  })

  it('maps newest-first daily earnings returned by the aggregate RPC', async () => {
    const dailyEarnings = [
      {
        date: '2026-07-15',
        gross_earnings: 700_000,
        platform_fee_total: 70_000,
        net_earnings: 630_000,
        paid_job_count: 2,
      },
      {
        date: '2026-07-14',
        gross_earnings: 300_000,
        platform_fee_total: 30_000,
        net_earnings: 270_000,
        paid_job_count: 1,
      },
    ]
    const supabase = makeSupabase(aggregateRow({ daily_earnings: dailyEarnings }))

    await expect(computeEarnings(supabase, 'worker-1')).resolves.toMatchObject({
      dailyEarnings: [
        {
          date: '2026-07-15',
          grossEarnings: 700_000,
          platformFeeTotal: 70_000,
          netEarnings: 630_000,
          paidJobCount: 2,
        },
        {
          date: '2026-07-14',
          grossEarnings: 300_000,
          platformFeeTotal: 30_000,
          netEarnings: 270_000,
          paidJobCount: 1,
        },
      ],
    })
  })

  it.each([
    null,
    {},
    [{
      date: '2026-02-30',
      gross_earnings: 700_000,
      platform_fee_total: 70_000,
      net_earnings: 630_000,
      paid_job_count: 2,
    }],
    [{
      date: '2026-07-15',
      gross_earnings: 700_000,
      platform_fee_total: 70_000,
      net_earnings: 630_000,
      paid_job_count: '2',
    }],
    [
      {
        date: '2026-07-14',
        gross_earnings: 300_000,
        platform_fee_total: 30_000,
        net_earnings: 270_000,
        paid_job_count: 1,
      },
      {
        date: '2026-07-15',
        gross_earnings: 700_000,
        platform_fee_total: 70_000,
        net_earnings: 630_000,
        paid_job_count: 2,
      },
    ],
  ])('rejects malformed daily earnings instead of hiding contract drift: %o', async (dailyEarnings) => {
    const supabase = makeSupabase(aggregateRow({ daily_earnings: dailyEarnings }))

    await expect(computeEarnings(supabase, 'worker-1')).rejects.toMatchObject({
      name: 'EarningsQueryError',
    })
  })

  it('rejects an unbounded daily earnings payload', async () => {
    const dailyEarnings = Array.from({ length: 367 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 11, 31 - index)).toISOString().slice(0, 10)
      return {
        date,
        gross_earnings: 100_000,
        platform_fee_total: 10_000,
        net_earnings: 90_000,
        paid_job_count: 1,
      }
    })
    const supabase = makeSupabase(aggregateRow({ daily_earnings: dailyEarnings }))

    await expect(computeEarnings(supabase, 'worker-1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('rejects malformed aggregate totals', async () => {
    const supabase = makeSupabase(aggregateRow({ gross_earnings: 1.5 }))

    await expect(computeEarnings(supabase, 'worker-1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('forwards actor, range, and the governed fee rate to the aggregate RPC', async () => {
    const from = '2026-06-01T00:00:00.000Z'
    const to = '2026-06-30T23:59:59.999Z'
    const supabase = makeSupabase(aggregateRow({
      from_date: '2026-06-01T00:00:00+00:00',
      to_date: '2026-06-30T23:59:59.999+00:00',
    }))

    const result = await computeEarnings(supabase, 'worker-1', { from, to })

    expect(result.fromDate).toBe(from)
    expect(result.toDate).toBe(to)
    expect(supabase.rpc).toHaveBeenCalledWith('get_worker_earnings_summary', {
      p_worker_id: 'worker-1',
      p_from: from,
      p_to: to,
      p_platform_fee_rate: 0.1,
    })
  })

  it('omits all-time range bounds so the SQL null defaults apply', async () => {
    const supabase = makeSupabase(aggregateRow())

    await computeEarnings(supabase, 'worker-1')

    expect(supabase.rpc).toHaveBeenCalledWith('get_worker_earnings_summary', {
      p_worker_id: 'worker-1',
      p_platform_fee_rate: 0.1,
    })
  })

  it('rejects a database error instead of fabricating zero earnings', async () => {
    const supabase = makeSupabase(null, { code: 'PGRST500' })

    await expect(computeEarnings(supabase, 'worker-1')).rejects.toMatchObject({
      code: 'PGRST500',
    })
  })

  it('rejects a missing aggregate row instead of fabricating zero earnings', async () => {
    const supabase = makeSupabase(null)

    await expect(computeEarnings(supabase, 'worker-1')).rejects.toMatchObject({
      name: 'EarningsQueryError',
    })
  })
})
