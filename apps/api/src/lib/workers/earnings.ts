import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@nestscout/shared'
import { withDbTimeout } from '@/lib/db/query'

const MAX_DAILY_EARNINGS_ROWS = 366
const MAX_RECENT_TRANSACTIONS = 20

export type EarningsSummary = {
  workerId: string
  totalJobsPaid: number
  grossEarnings: number
  platformFeeTotal: number
  netEarnings: number
  availableBalance: number
  cashCommissionCollectedTotal: number
  cashCommissionDueTotal: number
  pendingPaymentCount: number
  pendingPaymentAmount: number
  onHoldAmount: number
  currentCommissionLevel: number
  currentCommissionRateBps: number
  recentTransactions: WorkerPaymentTransaction[]
  dailyEarnings: DailyEarningsSummary[]
  fromDate: string | null
  toDate: string | null
}

export type WorkerPaymentTransaction = {
  jobId: string
  displayCode: string | null
  entryType: 'worker_credit' | 'cash_commission_debit'
  paymentState: 'pending' | 'available' | 'on_hold' | 'reversed' | 'cash_collected' | 'cash_reconciliation_due'
  grossAmount: number
  platformFee: number
  workerNet: number
  commissionLevel: number
  commissionRateBps: number
  cashCommissionCollected: number
  cashCommissionDue: number
  recordedAt: string
  availableAt: string | null
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
 *   - available balance:     verified immutable payment credits only
 *   - pending payment:       ledger credits waiting for provider verification
 *   - commission:            tier/rate frozen with each payment intent
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
    supabase.rpc('get_worker_earnings_summary_v2', {
      p_worker_id: workerId,
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
    availableBalance: number
    cashCommissionCollectedTotal: number
    cashCommissionDueTotal: number
    pendingPaymentCount: number
    pendingPaymentAmount: number
    onHoldAmount: number
    currentCommissionLevel: number
    currentCommissionRateBps: number
    recentTransactions: WorkerPaymentTransaction[]
    dailyEarnings: DailyEarningsSummary[]
  }
  try {
    if (row.worker_id !== workerId) throw new Error('INVALID_EARNINGS_OWNER')
    validated = {
      totalJobsPaid: nonnegativeSafeInteger(row.total_jobs_paid),
      grossEarnings: nonnegativeSafeInteger(row.gross_earnings),
      platformFeeTotal: nonnegativeSafeInteger(row.platform_fee_total),
      netEarnings: nonnegativeSafeInteger(row.net_earnings),
      availableBalance: nonnegativeSafeInteger(row.available_balance),
      cashCommissionCollectedTotal: nonnegativeSafeInteger(row.cash_commission_collected_total),
      cashCommissionDueTotal: nonnegativeSafeInteger(row.cash_commission_due_total),
      pendingPaymentCount: nonnegativeSafeInteger(row.pending_payment_count),
      pendingPaymentAmount: nonnegativeSafeInteger(row.pending_payment_amount),
      onHoldAmount: nonnegativeSafeInteger(row.on_hold_amount),
      currentCommissionLevel: positiveSafeInteger(row.current_commission_level),
      currentCommissionRateBps: commissionRateBps(row.current_commission_rate_bps),
      recentTransactions: parseRecentTransactions(
        (row as typeof row & { recent_transactions?: unknown }).recent_transactions,
      ),
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

function parseRecentTransactions(value: unknown): WorkerPaymentTransaction[] {
  if (!Array.isArray(value) || value.length > MAX_RECENT_TRANSACTIONS) {
    throw new Error('INVALID_RECENT_TRANSACTIONS')
  }

  let previousRecordedAt: string | null = null
  return value.map((entry) => {
    if (!isRecord(entry) || !isEntryType(entry.entry_type) || !isPaymentState(entry.payment_state)) {
      throw new Error('INVALID_RECENT_TRANSACTIONS')
    }
    const jobId = typeof entry.job_id === 'string' && entry.job_id.length > 0 ? entry.job_id : null
    const displayCode = entry.display_code === null || typeof entry.display_code === 'string'
      ? entry.display_code
      : undefined
    const recordedAt = typeof entry.recorded_at === 'string' ? entry.recorded_at : null
    const availableAt = entry.available_at === null || typeof entry.available_at === 'string'
      ? entry.available_at
      : undefined
    if (
      !jobId ||
      !recordedAt ||
      !isIsoTimestamp(recordedAt) ||
      displayCode === undefined ||
      availableAt === undefined ||
      (availableAt !== null && !isIsoTimestamp(availableAt)) ||
      (previousRecordedAt !== null && recordedAt > previousRecordedAt)
    ) {
      throw new Error('INVALID_RECENT_TRANSACTIONS')
    }
    previousRecordedAt = recordedAt

    return {
      jobId,
      displayCode,
      entryType: entry.entry_type,
      paymentState: entry.payment_state,
      grossAmount: nonnegativeSafeInteger(entry.gross_amount),
      platformFee: nonnegativeSafeInteger(entry.platform_fee),
      workerNet: positiveSafeInteger(entry.worker_net),
      commissionLevel: positiveSafeInteger(entry.commission_level),
      commissionRateBps: commissionRateBps(entry.commission_rate_bps),
      cashCommissionCollected: nonnegativeSafeInteger(entry.cash_commission_collected),
      cashCommissionDue: nonnegativeSafeInteger(entry.cash_commission_due),
      recordedAt,
      availableAt,
    }
  })
}

function isPaymentState(value: unknown): value is WorkerPaymentTransaction['paymentState'] {
  return value === 'pending' || value === 'available' || value === 'on_hold' || value === 'reversed' || value === 'cash_collected' || value === 'cash_reconciliation_due'
}

function isEntryType(value: unknown): value is WorkerPaymentTransaction['entryType'] {
  return value === 'worker_credit' || value === 'cash_commission_debit'
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

function positiveSafeInteger(value: unknown): number {
  const parsed = nonnegativeSafeInteger(value)
  if (parsed <= 0) throw new Error('INVALID_EARNINGS_RESPONSE')
  return parsed
}

function commissionRateBps(value: unknown): number {
  const parsed = nonnegativeSafeInteger(value)
  if (parsed > 1500) throw new Error('INVALID_EARNINGS_RESPONSE')
  return parsed
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

function isIsoTimestamp(value: string): boolean {
  const timestamp = Date.parse(value)
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(timestamp)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
