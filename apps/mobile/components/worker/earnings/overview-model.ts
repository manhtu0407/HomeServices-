import type { EarningsResponse } from '@/lib/api-types'

export type WorkerEarningsPeriod = 'day' | 'week' | 'month' | 'year'

export type WorkerEarningsChartPoint = {
  dateKey: string
  netEarnings: number
  paidJobCount: number
  platformFee: number
  value: number
}

export type WorkerEarningsDashboardModel = {
  availableBalance: number
  grossEarnings: number
  netEarnings: number
  paidJobCount: number
  platformFee: number
  provisionalAmount: number
  provisionalCount: number
  points: WorkerEarningsChartPoint[]
  state: 'pending' | 'empty' | 'ready'
  visiblePoints: WorkerEarningsChartPoint[]
}

export type WorkerEarningsSnapshot = {
  availableBalance: number
  netEarnings: number
  paidJobCount: number
  period: WorkerEarningsPeriod
  points: WorkerEarningsChartPoint[]
  state: 'empty' | 'loading' | 'ready' | 'stale' | 'unavailable'
}

const HCMC_UTC_OFFSET_MS = 7 * 60 * 60 * 1000

export const WORKER_EARNINGS_PERIODS: readonly WorkerEarningsPeriod[] = [
  'day',
  'week',
  'month',
  'year',
]

function hcmcDateKey(referenceDate: Date) {
  return new Date(referenceDate.getTime() + HCMC_UTC_OFFSET_MS).toISOString().slice(0, 10)
}

function dateFromKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function dateKeysForPeriod(period: WorkerEarningsPeriod, referenceDate: Date) {
  const todayKey = hcmcDateKey(referenceDate)
  const today = dateFromKey(todayKey)

  if (period === 'day') return [todayKey]

  if (period === 'week') {
    const weekday = today.getUTCDay()
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday
    const monday = addDays(today, mondayOffset)
    return Array.from({ length: Math.abs(mondayOffset) + 1 }, (_, index) => dateKey(addDays(monday, index)))
  }

  if (period === 'month') {
    const year = today.getUTCFullYear()
    const month = today.getUTCMonth()
    return Array.from(
      { length: today.getUTCDate() },
      (_, index) => dateKey(new Date(Date.UTC(year, month, index + 1))),
    )
  }

  return Array.from(
    { length: today.getUTCMonth() + 1 },
    (_, month) => `${today.getUTCFullYear()}-${String(month + 1).padStart(2, '0')}`,
  )
}

export function resolveWorkerEarningsPeriod(value: string | string[] | null | undefined): WorkerEarningsPeriod {
  const candidate = Array.isArray(value) ? value[0] : value
  return WORKER_EARNINGS_PERIODS.some((period) => period === candidate)
    ? candidate as WorkerEarningsPeriod
    : 'month'
}

export function buildEarningsDashboardModel(
  earnings: EarningsResponse | null | undefined,
  period: WorkerEarningsPeriod,
  referenceDate = new Date(),
): WorkerEarningsDashboardModel {
  const periodKeys = dateKeysForPeriod(period, referenceDate)
  const todayKey = hcmcDateKey(referenceDate)
  const dailyRows = (earnings?.daily_earnings ?? []).filter((row) => row.date <= todayKey)
  const dailyByDate = new Map(dailyRows.map((row) => [row.date, row]))

  const points = period === 'year'
    ? periodKeys.map((monthKey) => {
      const rows = dailyRows.filter((row) => row.date.startsWith(`${monthKey}-`))
      const netEarnings = rows.reduce((total, row) => total + row.net_earnings, 0)
      const paidJobCount = rows.reduce((total, row) => total + row.paid_job_count, 0)
      const platformFee = rows.reduce((total, row) => total + row.platform_fee_total, 0)
      return {
        dateKey: monthKey,
        netEarnings,
        paidJobCount,
        platformFee,
        value: netEarnings,
      }
    })
    : periodKeys.map((key) => {
      const row = dailyByDate.get(key)
      const netEarnings = row?.net_earnings ?? 0
      const paidJobCount = row?.paid_job_count ?? 0
      const platformFee = row?.platform_fee_total ?? 0
      return {
        dateKey: key,
        netEarnings,
        paidJobCount,
        platformFee,
        value: netEarnings,
      }
    })

  const netEarnings = points.reduce((total, point) => total + point.netEarnings, 0)
  const paidJobCount = points.reduce((total, point) => total + point.paidJobCount, 0)
  const platformFee = points.reduce((total, point) => total + point.platformFee, 0)
  const grossEarnings = netEarnings + platformFee

  return {
    availableBalance: earnings?.available_balance ?? 0,
    grossEarnings,
    netEarnings,
    paidJobCount,
    platformFee,
    provisionalAmount: earnings?.provisional_payment_amount ?? earnings?.pending_payment_amount ?? 0,
    provisionalCount: earnings?.provisional_payment_count ?? earnings?.pending_payment_count ?? 0,
    points,
    state: !earnings ? 'pending' : netEarnings > 0 ? 'ready' : 'empty',
    visiblePoints: points.slice(-7),
  }
}

export function buildWorkerEarningsSnapshot(
  earnings: EarningsResponse | null | undefined,
  earningsError: string | null | undefined,
  period: WorkerEarningsPeriod,
  referenceDate = new Date(),
): WorkerEarningsSnapshot {
  const model = buildEarningsDashboardModel(earnings, period, referenceDate)
  const state = !earnings
    ? earningsError ? 'unavailable' : 'loading'
    : earningsError
      ? 'stale'
      : model.state === 'ready' ? 'ready' : 'empty'

  return {
    availableBalance: model.availableBalance,
    netEarnings: model.netEarnings,
    paidJobCount: model.paidJobCount,
    period,
    points: model.visiblePoints,
    state,
  }
}
