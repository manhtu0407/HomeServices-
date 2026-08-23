import { describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { getWorkerEarnings } from '../../../../../supabase/functions/mobile-api/_shared/domains/worker/earnings'

export const PILLAR = {
  id: 'P35-worker-earnings-fail-closed',
  invariant:
    'a worker sees earnings only from an aggregate that names them; a row belonging to someone else, a failed query, or any value outside the declared range fails the request closed rather than answering with a number nobody computed',
  authority: [
    'governance/RULES.md #8 (data honesty — no fake data or silent degradation)',
    'governance/RULES.md #9 (logging must not expose PII)',
    'governance/protocols/test-pillars.md — money invariants',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/earnings.ts',
  layer: 'unit',
  siblings: ['P01-commission-math', 'P03-direct-payment-availability', 'P19-job-access-ownership'],
  mutation:
    'weaken the owner check from `row.worker_id !== expectedWorkerId` to `row.worker_id === undefined` — the cross-worker case and the log case turn red, and nothing else moves, because every remaining case fails closed on its own validator. The second recorded mutation reaches the other half: make `nonnegativeSafeInteger` return 0 instead of throwing, and the three coercion cases turn red while the owner case stays green. Both were observed',
} as const satisfies PillarManifest

const WORKER = 'worker-1'

const VALID_SUMMARY = {
  worker_id: WORKER,
  total_jobs_paid: 12,
  gross_earnings: 12_000_000,
  platform_fee_total: 1_800_000,
  net_earnings: 10_200_000,
  cash_commission_collected_total: 0,
  cash_commission_due_total: 0,
  pending_payment_count: 1,
  pending_payment_amount: 450_000,
  provisional_payment_count: 0,
  provisional_payment_amount: 0,
  on_hold_amount: 0,
  current_commission_level: 1,
  current_commission_rate_bps: 1_500,
  withdrawal_eligible_at: null,
  recent_transactions: [],
  daily_earnings: [],
}

const VALID_SAFETY = {
  available_balance: 10_200_000,
  withdrawal_reserved_amount: 0,
  withdrawn_total: 0,
  collateral_reserved_amount: 0,
}

/** Answers the two RPCs getWorkerEarnings runs in parallel, each with its own row or failure. */
function context(
  summary: { data?: unknown[]; error?: unknown },
  safety: { data?: unknown[]; error?: unknown } = { data: [VALID_SAFETY], error: null },
  userId = WORKER,
) {
  const rpc = vi.fn(async (name: string) =>
    name === 'get_worker_earnings_summary_v2'
      ? { data: summary.data ?? null, error: summary.error ?? null }
      : { data: safety.data ?? null, error: safety.error ?? null })
  const cohortLookup: Record<string, unknown> = {}
  cohortLookup.select = vi.fn(() => cohortLookup)
  cohortLookup.eq = vi.fn(() => cohortLookup)
  cohortLookup.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
  const from = vi.fn(() => cohortLookup)
  return { role: 'worker', supabase: { from, rpc }, user: { id: userId } } as never
}

const failsClosed = { code: 'DB_ERROR', status: 500 }

describe('P35 worker earnings — the aggregate must name the caller', () => {
  it('answers with the caller own aggregate when the row names them', async () => {
    await expect(
      getWorkerEarnings(context({ data: [VALID_SUMMARY] }), {}),
      pillarWhy(PILLAR, 'the healthy path must still work, or every negative case below proves nothing'),
    ).resolves.toMatchObject({
      worker_id: WORKER,
      total_jobs_paid: 12,
      net_earnings: 10_200_000,
      available_balance: 10_200_000,
    })
  })

  it('refuses an aggregate belonging to a different worker', async () => {
    await expect(
      getWorkerEarnings(context({ data: [{ ...VALID_SUMMARY, worker_id: 'worker-2' }] }), {}),
      pillarWhy(PILLAR, 'an RPC that answered for the wrong worker would pay one person another person earnings'),
    ).rejects.toMatchObject(failsClosed)
  })
})

describe('P35 worker earnings — a failed or absent query never becomes a number', () => {
  it('refuses when the summary query errors', async () => {
    await expect(
      getWorkerEarnings(context({ error: { code: 'PGRST116' } }), {}),
      pillarWhy(PILLAR, 'an error is not zero earnings'),
    ).rejects.toMatchObject(failsClosed)
  })

  it('refuses when the payment-safety query returns no row', async () => {
    await expect(
      getWorkerEarnings(context({ data: [VALID_SUMMARY] }, { data: [] }), {}),
      pillarWhy(PILLAR, 'the balance half is not optional; a missing row cannot default to an available balance'),
    ).rejects.toMatchObject(failsClosed)
  })
})

describe('P35 worker earnings — values outside the declared range fail closed', () => {
  const outOfRange: ReadonlyArray<[string, Record<string, unknown>]> = [
    ['a negative total', { net_earnings: -1 }],
    ['a fractional amount', { gross_earnings: 12_000_000.5 }],
    ['a non-numeric amount', { platform_fee_total: '1800000' }],
    ['a zero commission level', { current_commission_level: 0 }],
    ['a commission rate above the 1500 bps ceiling', { current_commission_rate_bps: 1_501 }],
    ['more daily rows than a year holds', { daily_earnings: new Array(367).fill({}) }],
    ['a recent-transaction entry of an unknown type', {
      recent_transactions: [{ entry_type: 'mystery_credit', payment_state: 'available' }],
    }],
  ]

  it.each(outOfRange)('refuses %s rather than coercing it', async (_label, override) => {
    await expect(
      getWorkerEarnings(context({ data: [{ ...VALID_SUMMARY, ...override }] }), {}),
      pillarWhy(PILLAR, `a coerced value here becomes a figure on a worker earnings screen that no RPC produced`),
    ).rejects.toMatchObject(failsClosed)
  })
})

describe('P35 worker earnings — the refusal says nothing it should not', () => {
  it('logs the worker id and no other field of the rejected row', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await expect(
        getWorkerEarnings(context({ data: [{ ...VALID_SUMMARY, worker_id: 'worker-2', net_earnings: 99 }] }), {}),
      ).rejects.toMatchObject(failsClosed)

      const payloads = warn.mock.calls.map(([, payload]) => payload)
      expect(
        payloads.some((payload) => JSON.stringify(payload ?? {}).includes('99')),
        pillarWhy(PILLAR, 'a rejected row must not travel into the log it was rejected by — RULES #9'),
      ).toBe(false)
    } finally {
      warn.mockRestore()
    }
  })
})
