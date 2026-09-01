import type { EarningsResponse } from '@/lib/api-types'

export type WorkerEarningsPeriod = 'day' | 'week' | 'month' | 'year'

export type WorkerEarningsChartPoint = {
  dateKey: string
  grossEarnings: number
  netEarnings: number
  paidJobCount: number
  platformFee: number
  value: number
}

export type WorkerEarningsComparison =
  | {
      direction: 'decrease' | 'flat' | 'increase'
      percentage: number
      previousGrossEarnings: number
      state: 'available'
    }
  | {
      previousGrossEarnings: 0
      state: 'zero-baseline'
    }
  | {
      state: 'missing-baseline'
    }

export type WorkerEarningsTrend = {
  endX: number
  endY: number
  path: string
}

export type WorkerEarningsDashboardModel = {
  availableBalance: number
  comparison: WorkerEarningsComparison
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

function dateRangeForPeriod(period: WorkerEarningsPeriod, referenceDate: Date) {
  const today = dateFromKey(hcmcDateKey(referenceDate))

  if (period === 'day') {
    return {
      current: { end: today, start: today },
      previous: { end: addDays(today, -1), start: addDays(today, -1) },
    }
  }

  if (period === 'week') {
    const weekday = today.getUTCDay()
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday
    const currentStart = addDays(today, mondayOffset)
    return {
      current: { end: today, start: currentStart },
      previous: { end: addDays(currentStart, -1), start: addDays(currentStart, -7) },
    }
  }

  if (period === 'month') {
    const currentStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    return {
      current: { end: today, start: currentStart },
      previous: {
        end: addDays(currentStart, -1),
        start: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)),
      },
    }
  }

  const currentStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1))
  return {
    current: { end: today, start: currentStart },
    previous: {
      end: new Date(Date.UTC(today.getUTCFullYear() - 1, 11, 31)),
      start: new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1)),
    },
  }
}

function buildPeriodComparison(
  earnings: EarningsResponse | null | undefined,
  currentGrossEarnings: number,
  period: WorkerEarningsPeriod,
  referenceDate: Date,
): WorkerEarningsComparison {
  if (!earnings) return { state: 'missing-baseline' }

  const { previous } = dateRangeForPeriod(period, referenceDate)
  const previousStart = dateKey(previous.start)
  const previousEnd = dateKey(previous.end)
  if (!earnings.from_date || !earnings.to_date) return { state: 'missing-baseline' }
  const coversPreviousPeriod = earnings.from_date <= previousStart && earnings.to_date >= previousEnd
  if (!coversPreviousPeriod) return { state: 'missing-baseline' }

  const previousGrossEarnings = earnings.daily_earnings
    .filter((row) => row.date >= previousStart && row.date <= previousEnd)
    .reduce((total, row) => total + row.gross_earnings, 0)

  if (previousGrossEarnings === 0 && currentGrossEarnings > 0) {
    return { previousGrossEarnings: 0, state: 'zero-baseline' }
  }

  const rawPercentage = previousGrossEarnings === 0
    ? 0
    : Math.round(((currentGrossEarnings - previousGrossEarnings) / previousGrossEarnings) * 100)
  const percentage = Object.is(rawPercentage, -0) ? 0 : rawPercentage

  return {
    direction: percentage > 0 ? 'increase' : percentage < 0 ? 'decrease' : 'flat',
    percentage,
    previousGrossEarnings,
    state: 'available',
  }
}

function coordinate(value: number) {
  return Number(value.toFixed(2))
}

export function buildWorkerEarningsTrend(
  points: readonly WorkerEarningsChartPoint[],
  width = 115,
  height = 35,
  padding = 3,
): WorkerEarningsTrend | null {
  if (points.length === 0) return null

  const left = padding
  const right = width - padding
  const middleY = coordinate(height / 2)
  if (points.length === 1) {
    return {
      endX: right,
      endY: middleY,
      path: `M ${left} ${middleY} L ${right} ${middleY}`,
    }
  }

  const maximum = Math.max(...points.map((point) => point.value), 0)
  const usableWidth = right - left
  const usableHeight = height - padding * 2
  const chartPoints = points.map((point, index) => ({
    x: coordinate(left + (usableWidth * index) / (points.length - 1)),
    y: maximum === 0
      ? middleY
      : coordinate(height - padding - (Math.max(0, point.value) / maximum) * usableHeight),
  }))
  const path = chartPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
  const end = chartPoints[chartPoints.length - 1]

  return { endX: end.x, endY: end.y, path }
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
      const grossEarnings = rows.reduce((total, row) => total + row.gross_earnings, 0)
      const paidJobCount = rows.reduce((total, row) => total + row.paid_job_count, 0)
      const platformFee = rows.reduce((total, row) => total + row.platform_fee_total, 0)
      return {
        dateKey: monthKey,
        grossEarnings,
        netEarnings,
        paidJobCount,
        platformFee,
        value: netEarnings,
      }
    })
    : periodKeys.map((key) => {
      const row = dailyByDate.get(key)
      const grossEarnings = row?.gross_earnings ?? 0
      const netEarnings = row?.net_earnings ?? 0
      const paidJobCount = row?.paid_job_count ?? 0
      const platformFee = row?.platform_fee_total ?? 0
      return {
        dateKey: key,
        grossEarnings,
        netEarnings,
        paidJobCount,
        platformFee,
        value: netEarnings,
      }
    })

  const netEarnings = points.reduce((total, point) => total + point.netEarnings, 0)
  const grossEarnings = points.reduce((total, point) => total + point.grossEarnings, 0)
  const paidJobCount = points.reduce((total, point) => total + point.paidJobCount, 0)
  const platformFee = points.reduce((total, point) => total + point.platformFee, 0)

  return {
    availableBalance: earnings?.available_balance ?? 0,
    comparison: buildPeriodComparison(earnings, grossEarnings, period, referenceDate),
    grossEarnings,
    netEarnings,
    paidJobCount,
    platformFee,
    provisionalAmount: earnings?.provisional_payment_amount ?? earnings?.pending_payment_amount ?? 0,
    provisionalCount: earnings?.provisional_payment_count ?? earnings?.pending_payment_count ?? 0,
    points,
    state: !earnings ? 'pending' : grossEarnings > 0 ? 'ready' : 'empty',
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
