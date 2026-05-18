import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
  },
  ensureServerEnv: vi.fn(),
}))

vi.mock('@/lib/db/query', () => ({
  withDbTimeout: <T,>(p: PromiseLike<T>) => p,
  DbTimeoutError: class extends Error {},
}))

import { computeEarnings } from '@/lib/workers/earnings'

type EarningsRow = { id: string; status: string; final_price: number | null; created_at?: string }

function makeSupabase(rows: Array<EarningsRow> | null, error: { code: string } | null = null) {
  return {
    from: vi.fn(() => {
      const chain: any = {}
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(() => chain)
      chain.in = vi.fn(() => chain)
      chain.gte = vi.fn(() => chain)
      chain.lte = vi.fn(() => chain)
      // Make chain thenable so `await query` resolves to the data
      chain.then = (onFulfilled: (v: { data: typeof rows; error: typeof error }) => unknown) =>
        Promise.resolve({ data: rows, error }).then(onFulfilled)
      return chain
    }),
  } as any
}

describe('computeEarnings', () => {
  it('returns zeros for new worker (no jobs)', async () => {
    const supabase = makeSupabase([])
    const result = await computeEarnings(supabase, 'worker-1')

    expect(result.workerId).toBe('worker-1')
    expect(result.totalJobsPaid).toBe(0)
    expect(result.grossEarnings).toBe(0)
    expect(result.platformFeeTotal).toBe(0)
    expect(result.netEarnings).toBe(0)
    expect(result.pendingPaymentCount).toBe(0)
    expect(result.pendingPaymentAmount).toBe(0)
  })

  it('sums only paid jobs as gross earnings while reviewed remains pending', async () => {
    const supabase = makeSupabase([
      { id: 'j1', status: 'paid', final_price: 500_000 },
      { id: 'j2', status: 'reviewed', final_price: 300_000 },
      { id: 'j3', status: 'paid', final_price: 1_000_000 },
    ])

    const result = await computeEarnings(supabase, 'worker-1')
    expect(result.totalJobsPaid).toBe(2)
    expect(result.grossEarnings).toBe(1_500_000)
    expect(result.pendingPaymentCount).toBe(1)
    expect(result.pendingPaymentAmount).toBe(300_000)
  })

  it('applies 10% platform fee correctly (RULES & STRUCTURES)', async () => {
    const supabase = makeSupabase([
      { id: 'j1', status: 'paid', final_price: 1_000_000 },
    ])

    const result = await computeEarnings(supabase, 'worker-1')
    expect(result.grossEarnings).toBe(1_000_000)
    expect(result.platformFeeTotal).toBe(100_000) // 10%
    expect(result.netEarnings).toBe(900_000)
  })

  it('counts pending payments separately from earnings', async () => {
    const supabase = makeSupabase([
      { id: 'j1', status: 'paid', final_price: 500_000 },
      { id: 'j2', status: 'confirmed_by_customer', final_price: 300_000 },
      { id: 'j3', status: 'payment_pending', final_price: 700_000 },
      { id: 'j4', status: 'reviewed', final_price: 200_000 },
    ])

    const result = await computeEarnings(supabase, 'worker-1')
    expect(result.totalJobsPaid).toBe(1)
    expect(result.grossEarnings).toBe(500_000) // only j1
    expect(result.pendingPaymentCount).toBe(3)
    expect(result.pendingPaymentAmount).toBe(1_200_000) // j2 + j3 + j4
  })

  it('handles null final_price gracefully', async () => {
    const supabase = makeSupabase([
      { id: 'j1', status: 'paid', final_price: null },
      { id: 'j2', status: 'paid', final_price: 500_000 },
    ])

    const result = await computeEarnings(supabase, 'worker-1')
    expect(result.totalJobsPaid).toBe(2)
    expect(result.grossEarnings).toBe(500_000)
  })

  it('rejects on DB error instead of faking zero earnings', async () => {
    const supabase = makeSupabase(null, { code: 'PGRST500' })
    await expect(computeEarnings(supabase, 'worker-1')).rejects.toMatchObject({
      code: 'PGRST500',
    })
  })

  it('rounds platform fee to nearest integer (no fractional VND)', async () => {
    const supabase = makeSupabase([
      { id: 'j1', status: 'paid', final_price: 123_457 }, // 12345.7 * 0.1 → rounds
    ])

    const result = await computeEarnings(supabase, 'worker-1')
    expect(result.platformFeeTotal).toBe(12_346) // rounded
    expect(Number.isInteger(result.platformFeeTotal)).toBe(true)
    expect(Number.isInteger(result.netEarnings)).toBe(true)
  })

  // ──── E8: date range filter ──────────────────────────────────

  it('returns null fromDate/toDate when no range provided (all-time)', async () => {
    const supabase = makeSupabase([])
    const result = await computeEarnings(supabase, 'worker-1')
    expect(result.fromDate).toBeNull()
    expect(result.toDate).toBeNull()
  })

  it('echoes range bounds in response when provided', async () => {
    const supabase = makeSupabase([])
    const from = '2026-01-01T00:00:00.000Z'
    const to = '2026-12-31T23:59:59.999Z'
    const result = await computeEarnings(supabase, 'worker-1', { from, to })
    expect(result.fromDate).toBe(from)
    expect(result.toDate).toBe(to)
  })

  it('applies gte/lte filters when range provided', async () => {
    const supabase = makeSupabase([
      { id: 'j1', status: 'paid', final_price: 500_000, created_at: '2026-06-15T10:00:00Z' },
    ])
    const result = await computeEarnings(supabase, 'worker-1', {
      from: '2026-06-01T00:00:00Z',
      to: '2026-06-30T23:59:59Z',
    })
    expect(result.grossEarnings).toBe(500_000)
    expect(result.fromDate).toBe('2026-06-01T00:00:00Z')
    expect(result.toDate).toBe('2026-06-30T23:59:59Z')
  })
})
