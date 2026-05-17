import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@home-services/shared'
import { PLATFORM_FEE_WORKER } from '@home-services/shared'
import { withDbTimeout } from '@/lib/db/query'

export type EarningsSummary = {
  workerId: string
  totalJobsPaid: number
  grossEarnings: number
  platformFeeTotal: number
  netEarnings: number
  pendingPaymentCount: number
  pendingPaymentAmount: number
  fromDate: string | null
  toDate: string | null
}

export type EarningsRange = {
  /** ISO timestamp inclusive lower bound. Null = no lower bound. */
  from?: string | null
  /** ISO timestamp inclusive upper bound. Null = no upper bound. */
  to?: string | null
}

/**
 * B8 — Worker earnings summary.
 *
 * Aggregates from jobs table:
 *   - gross_earnings:        sum(final_price) where status in {paid, reviewed}
 *   - platform_fee_total:    gross * PLATFORM_FEE_WORKER (10%)
 *   - net_earnings:          gross - platform_fee_total
 *   - pending_payment:       jobs in confirmed_by_customer or payment_pending state
 *
 * `range.from` / `range.to` filter on jobs.created_at (ISO timestamptz).
 * Both bounds optional. Returns the effective range in the response.
 *
 * Per RULES.md #8 — returns honest counts; never fabricates numbers.
 */
export async function computeEarnings(
  supabase: SupabaseClient<Database>,
  workerId: string,
  range: EarningsRange = {},
): Promise<EarningsSummary> {
  let query = supabase
    .from('jobs')
    .select('id, status, final_price, created_at')
    .eq('worker_id', workerId)
    .in('status', ['paid', 'reviewed', 'confirmed_by_customer', 'payment_pending'])

  if (range.from) query = query.gte('created_at', range.from)
  if (range.to) query = query.lte('created_at', range.to)

  const { data: rows, error } = await withDbTimeout(query)

  if (error || !rows) {
    console.warn('Earnings: query failed', { workerId, errorCode: error?.code })
    return {
      workerId,
      totalJobsPaid: 0,
      grossEarnings: 0,
      platformFeeTotal: 0,
      netEarnings: 0,
      pendingPaymentCount: 0,
      pendingPaymentAmount: 0,
      fromDate: range.from ?? null,
      toDate: range.to ?? null,
    }
  }

  let gross = 0
  let paidCount = 0
  let pendingCount = 0
  let pendingAmount = 0

  for (const row of rows) {
    const price = row.final_price ?? 0
    if (row.status === 'paid' || row.status === 'reviewed') {
      gross += price
      paidCount++
    } else if (row.status === 'confirmed_by_customer' || row.status === 'payment_pending') {
      pendingAmount += price
      pendingCount++
    }
  }

  const platformFee = Math.round(gross * PLATFORM_FEE_WORKER)
  const net = gross - platformFee

  return {
    workerId,
    totalJobsPaid: paidCount,
    grossEarnings: gross,
    platformFeeTotal: platformFee,
    netEarnings: net,
    pendingPaymentCount: pendingCount,
    pendingPaymentAmount: pendingAmount,
    fromDate: range.from ?? null,
    toDate: range.to ?? null,
  }
}
