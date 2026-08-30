import type { EarningsResponse } from '@/lib/api-types'
import { type PillarManifest, withPillarContext } from '@/__tests__/pillar-manifest'

import { routeForWorkerV5Screen } from '../dock/routing'
import { requireWorkerV5Screen } from '../dock/screens'
import {
  buildEarningsDashboardModel,
  buildWorkerEarningsSnapshot,
  resolveWorkerEarningsPeriod,
} from '../earnings/overview-model'

export const PILLAR = {
  id: 'P55-worker-home-earnings-snapshot',
  invariant:
    'Worker Home and Salary derive period net income, paid-job count, elapsed chart buckets, available balance, and honest unavailable states from one EarningsResponse model',
  authority: [
    'governance/RULES.md #8 (no fake earnings or silent degradation)',
    'governance/structures/worker-workflow.md B2 and B8 (real earnings rows only)',
    'governance/protocols/test-pillars.md (money and UI state diagnostics)',
  ],
  target: 'apps/mobile/components/worker/earnings/overview-model.ts',
  layer: 'unit',
  siblings: ['P24-worker-earnings-period-palette', 'P35-worker-earnings-fail-closed'],
  mutation:
    'restore full future period keys or coalesce an unavailable response to zero — elapsed-bucket or unavailable-state assertions turn red',
} as const satisfies PillarManifest

function buildEarnings(): EarningsResponse {
  return {
    available_balance: 420_000,
    cash_commission_collected_total: 0,
    cash_commission_due_total: 0,
    current_commission_level: 2,
    current_commission_rate_bps: 1200,
    daily_earnings: [
      {
        date: '2026-01-12',
        gross_earnings: 1_000_000,
        net_earnings: 880_000,
        paid_job_count: 1,
        platform_fee_total: 120_000,
      },
      {
        date: '2026-07-28',
        gross_earnings: 220_000,
        net_earnings: 180_000,
        paid_job_count: 1,
        platform_fee_total: 40_000,
      },
      {
        date: '2026-07-29',
        gross_earnings: 400_000,
        net_earnings: 320_000,
        paid_job_count: 2,
        platform_fee_total: 80_000,
      },
      {
        date: '2026-07-31',
        gross_earnings: 900_000,
        net_earnings: 800_000,
        paid_job_count: 3,
        platform_fee_total: 100_000,
      },
    ],
    from_date: '2026-01-01',
    gross_earnings: 1_620_000,
    net_earnings: 1_380_000,
    on_hold_amount: 0,
    pending_payment_amount: 0,
    pending_payment_count: 0,
    platform_fee_total: 240_000,
    recent_transactions: [],
    to_date: '2026-12-31',
    total_jobs_paid: 7,
    withdrawal_reserved_amount: 0,
    withdrawn_total: 0,
    collateral_reserved_amount: 0,
    worker_id: 'worker_test_1',
  }
}

describe('Worker earnings dashboard model', () => {
  const referenceDate = new Date('2026-07-29T05:00:00.000Z')

  it('aggregates real daily earnings for day, week, month, and year periods', () => {
    const earnings = buildEarnings()

    const day = buildEarningsDashboardModel(earnings, 'day', referenceDate)
    const week = buildEarningsDashboardModel(earnings, 'week', referenceDate)
    const month = buildEarningsDashboardModel(earnings, 'month', referenceDate)
    const year = buildEarningsDashboardModel(earnings, 'year', referenceDate)

    withPillarContext(PILLAR, () => {
      expect(day.netEarnings).toBe(320_000)
      expect(day.platformFee).toBe(80_000)
      expect(day.paidJobCount).toBe(2)
      expect(day.points).toHaveLength(1)

      expect(week.netEarnings).toBe(500_000)
      expect(week.platformFee).toBe(120_000)
      expect(week.paidJobCount).toBe(3)
      expect(week.points).toHaveLength(3)

      expect(month.netEarnings).toBe(500_000)
      expect(month.platformFee).toBe(120_000)
      expect(month.paidJobCount).toBe(3)
      expect(month.points).toHaveLength(29)
      expect(month.visiblePoints).toHaveLength(7)
      expect(month.visiblePoints.at(-1)?.dateKey).toBe('2026-07-29')

      expect(year.netEarnings).toBe(1_380_000)
      expect(year.platformFee).toBe(240_000)
      expect(year.paidJobCount).toBe(4)
      expect(year.points).toHaveLength(7)
      expect(year.availableBalance).toBe(420_000)
    }, 'future rows and buckets must not enter current-period totals or charts')
  })

  it('keeps loading, hydrated zero, stale, and unavailable states distinct', () => {
    const hydratedEmpty = {
      ...buildEarnings(),
      daily_earnings: [],
      gross_earnings: 0,
      net_earnings: 0,
      platform_fee_total: 0,
    }

    const loading = buildWorkerEarningsSnapshot(null, null, 'week', referenceDate)
    const empty = buildWorkerEarningsSnapshot(hydratedEmpty, null, 'week', referenceDate)
    const stale = buildWorkerEarningsSnapshot(buildEarnings(), 'refresh failed', 'week', referenceDate)
    const unavailable = buildWorkerEarningsSnapshot(null, 'initial load failed', 'week', referenceDate)

    withPillarContext(PILLAR, () => {
      expect(loading.state).toBe('loading')
      expect(empty.state).toBe('empty')
      expect(empty.netEarnings).toBe(0)
      expect(empty.availableBalance).toBe(420_000)
      expect(stale.state).toBe('stale')
      expect(stale.netEarnings).toBe(500_000)
      expect(unavailable.state).toBe('unavailable')
      expect(unavailable.netEarnings).toBe(0)
      expect(unavailable.availableBalance).toBe(0)
    }, 'an absent response must never be rendered as a verified zero')
  })

  it('handles HCMC Monday and new-year boundaries without future buckets', () => {
    const monday = buildEarningsDashboardModel(buildEarnings(), 'week', new Date('2026-07-26T17:30:00.000Z'))
    const january = buildEarningsDashboardModel(buildEarnings(), 'year', new Date('2026-01-01T01:00:00.000Z'))

    expect(monday.points.map((point) => point.dateKey)).toEqual(['2026-07-27'])
    expect(january.points.map((point) => point.dateKey)).toEqual(['2026-01'])
  })

  it('validates and preserves the selected period in Salary replacement routes', () => {
    const salary = requireWorkerV5Screen('4.1-earnings-overview')

    expect(resolveWorkerEarningsPeriod('week')).toBe('week')
    expect(resolveWorkerEarningsPeriod(['year'])).toBe('year')
    expect(resolveWorkerEarningsPeriod('quarter')).toBe('month')
    expect(routeForWorkerV5Screen(salary, {
      ns_audit_role: 'worker',
      ns_worker_earnings_period: 'week',
      ns_worker_lang: 'vi',
    })).toContain('ns_worker_earnings_period=week')
    expect(routeForWorkerV5Screen(salary, {
      ns_worker_earnings_period: 'quarter',
    })).not.toContain('ns_worker_earnings_period')
  })
})
