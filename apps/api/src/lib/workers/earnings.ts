import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@nestscout/shared'
import { PLATFORM_FEE_WORKER } from '@nestscout/shared'
import { withDbTimeout } from '@/lib/db/query'

const MAX_DAILY_EARNINGS_ROWS = 366

export type EarningsSummary = {
  workerId: string
  totalJobsPaid: number
  grossEarnings: number
  platformFeeTotal: number
  netEarnings: number
  pendingPaymentCount: number
  pendingPaymentAmount: number
  dailyEarnings: DailyEarningsSummary[]
  fromDate: string | null
  toDate: string | null
}

export type DailyEarningsSummary = {
  date: string
  grossEarnings: number
  platformFeeTotal: number
  netEarnings: number
  paidJobCount: number
}

export type EarningsRange = {
  /** ISO timestamp inclusive lower bound. Null = no lower bound. */
  from?: string | null
  /** ISO timestamp inclusive upper bound. Null = no upper bound. */
  to?: string | null
}

export class EarningsQueryError extends Error {
  constructor(public readonly code?: string) {
    super('Failed to load worker earnings')
    this.name = 'EarningsQueryError'
  }
}

/**
 * B8 — Worker earnings summary.
 *
 * The database aggregates the complete worker history in one snapshot:
 *   - paid amounts:          frozen gross_amount/platform_fee/worker_net
 *   - legacy paid fallback:  final_price and current worker fee rate
 *   - pending_payment:       jobs in confirmed_by_customer, payment_pending, or reviewed state
 *
 * Range bounds use paid_at for settled work and created_at for pending work.
 * Both bounds are optional and echoed in the response.
 *
 * Per RULES.md #8 — returns honest counts; never fabricates numbers.
 */
export async function computeEarnings(
  supabase: SupabaseClient<Database>,
  workerId: string,
  range: EarningsRange = {},
): Promise<EarningsSummary> {
  const { data: rows, error } = await withDbTimeout(
    supabase.rpc('get_worker_earnings_summary', {
      p_worker_id: workerId,
      p_platform_fee_rate: PLATFORM_FEE_WORKER,
      ...(range.from == null ? {} : { p_from: range.from }),
      ...(range.to == null ? {} : { p_to: range.to }),
    }),
  )
  const row = rows?.[0]

  if (error || !row) {
    console.warn('Earnings: query failed', { workerId, errorCode: error?.code })
    throw new EarningsQueryError(error?.code)
  }

  let validated: {
    totalJobsPaid: number
    grossEarnings: number
    platformFeeTotal: number
    netEarnings: number
    pendingPaymentCount: number
    pendingPaymentAmount: number
    dailyEarnings: DailyEarningsSummary[]
  }
  try {
    if (row.worker_id !== workerId) throw new Error('INVALID_EARNINGS_OWNER')
    validated = {
      totalJobsPaid: nonnegativeSafeInteger(row.total_jobs_paid),
      grossEarnings: nonnegativeSafeInteger(row.gross_earnings),
      platformFeeTotal: nonnegativeSafeInteger(row.platform_fee_total),
      netEarnings: nonnegativeSafeInteger(row.net_earnings),
      pendingPaymentCount: nonnegativeSafeInteger(row.pending_payment_count),
      pendingPaymentAmount: nonnegativeSafeInteger(row.pending_payment_amount),
      dailyEarnings: parseDailyEarnings(
        (row as typeof row & { daily_earnings?: unknown }).daily_earnings,
      ),
    }
  } catch {
    console.warn('Earnings: invalid aggregate response', { workerId })
    throw new EarningsQueryError('INVALID_RESPONSE')
  }

  return {
    workerId,
    ...validated,
    fromDate: range.from ?? null,
    toDate: range.to ?? null,
  }
}

function parseDailyEarnings(value: unknown): DailyEarningsSummary[] {
  if (!Array.isArray(value) || value.length > MAX_DAILY_EARNINGS_ROWS) {
    throw new Error('INVALID_DAILY_EARNINGS')
  }

  let previousDate: string | null = null
  return value.map((entry) => {
    if (!isRecord(entry) || !isIsoDate(entry.date)) {
      throw new Error('INVALID_DAILY_EARNINGS')
    }
    if (previousDate !== null && entry.date >= previousDate) {
      throw new Error('INVALID_DAILY_EARNINGS')
    }
    previousDate = entry.date

    return {
      date: entry.date,
      grossEarnings: nonnegativeSafeInteger(entry.gross_earnings),
      platformFeeTotal: nonnegativeSafeInteger(entry.platform_fee_total),
      netEarnings: nonnegativeSafeInteger(entry.net_earnings),
      paidJobCount: nonnegativeSafeInteger(entry.paid_job_count),
    }
  })
}

function nonnegativeSafeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('INVALID_DAILY_EARNINGS')
  }
  return value
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
