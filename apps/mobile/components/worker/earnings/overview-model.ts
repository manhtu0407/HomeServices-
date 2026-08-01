import type { EarningsResponse } from '@/lib/api-types'

export type WorkerEarningsPeriod = 'day' | 'week' | 'month' | 'year'

export type WorkerEarningsChartPoint = {
  dateKey: string
  netEarnings: number
  platformFee: number
  value: number
}

type WorkerEarningsDashboardModel = {
  availableBalance: number
  grossEarnings: number
  netEarnings: number
  platformFee: number
  points: WorkerEarningsChartPoint[]
  state: 'pending' | 'empty' | 'ready'
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
    return Array.from({ length: 7 }, (_, index) => dateKey(addDays(monday, index)))
  }

  if (period === 'month') {
    const year = today.getUTCFullYear()
    const month = today.getUTCMonth()
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    return Array.from(
      { length: daysInMonth },
      (_, index) => dateKey(new Date(Date.UTC(year, month, index + 1))),
    )
  }

  return Array.from(
    { length: 12 },
    (_, month) => `${today.getUTCFullYear()}-${String(month + 1).padStart(2, '0')}`,
  )
}

export function buildEarningsDashboardModel(
  earnings: EarningsResponse | null | undefined,
  period: WorkerEarningsPeriod,
  referenceDate = new Date(),
): WorkerEarningsDashboardModel {
  const periodKeys = dateKeysForPeriod(period, referenceDate)
  const dailyRows = earnings?.daily_earnings ?? []
  const dailyByDate = new Map(dailyRows.map((row) => [row.date, row]))

  const points = period === 'year'
    ? periodKeys.map((monthKey) => {
      const rows = dailyRows.filter((row) => row.date.startsWith(`${monthKey}-`))
      const netEarnings = rows.reduce((total, row) => total + row.net_earnings, 0)
      const platformFee = rows.reduce((total, row) => total + row.platform_fee_total, 0)
      return {
        dateKey: monthKey,
        netEarnings,
        platformFee,
        value: netEarnings,
      }
    })
    : periodKeys.map((key) => {
      const row = dailyByDate.get(key)
      const netEarnings = row?.net_earnings ?? 0
      const platformFee = row?.platform_fee_total ?? 0
      return {
        dateKey: key,
        netEarnings,
        platformFee,
        value: netEarnings,
      }
    })

  const netEarnings = points.reduce((total, point) => total + point.netEarnings, 0)
  const platformFee = points.reduce((total, point) => total + point.platformFee, 0)
  const grossEarnings = netEarnings + platformFee

  return {
    availableBalance: earnings?.available_balance ?? 0,
    grossEarnings,
    netEarnings,
    platformFee,
    points,
    state: !earnings ? 'pending' : netEarnings > 0 ? 'ready' : 'empty',
  }
}
