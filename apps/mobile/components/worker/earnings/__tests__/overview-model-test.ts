import type { EarningsResponse } from '@/lib/api-types'

import { buildEarningsDashboardModel } from '../overview-model'

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
    total_jobs_paid: 4,
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

    expect(day.netEarnings).toBe(320_000)
    expect(day.platformFee).toBe(80_000)
    expect(day.points).toHaveLength(1)

    expect(week.netEarnings).toBe(500_000)
    expect(week.platformFee).toBe(120_000)
    expect(week.points).toHaveLength(7)

    expect(month.netEarnings).toBe(500_000)
    expect(month.platformFee).toBe(120_000)
    expect(month.points).toHaveLength(31)

    expect(year.netEarnings).toBe(1_380_000)
    expect(year.platformFee).toBe(240_000)
    expect(year.points).toHaveLength(12)
    expect(year.availableBalance).toBe(420_000)
  })

  it('keeps pending and hydrated-empty states distinct without inventing values', () => {
    const pending = buildEarningsDashboardModel(null, 'week', referenceDate)
    const empty = buildEarningsDashboardModel({
      ...buildEarnings(),
      daily_earnings: [],
      gross_earnings: 0,
      net_earnings: 0,
      platform_fee_total: 0,
    }, 'week', referenceDate)

    expect(pending.state).toBe('pending')
    expect(empty.state).toBe('empty')
    expect(empty.points.every((point) => point.value === 0)).toBe(true)
  })
})
