import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { computeEarnings, EarningsQueryError, type EarningsRange } from '@/lib/workers/earnings'

/**
 * GET /api/workers/me/earnings — B8
 *
 * Worker earnings summary: gross, platform fee (10%), net, pending payments.
 *
 * Query params (optional):
 *   ?from=ISO8601   — filter jobs.created_at >= from
 *   ?to=ISO8601     — filter jobs.created_at <= to
 *
 * Default returns all-time. Returns the effective range in the response.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request, ['worker'])
  if (!auth.success) {
    return apiError(
      auth.status === 401 ? 'AUTH_MISSING' : 'AUTH_FORBIDDEN',
      auth.error,
      auth.status,
    )
  }

  const url = new URL(request.url)
  const range: EarningsRange = {}

  const fromParam = url.searchParams.get('from')
  const toParam = url.searchParams.get('to')

  if (fromParam) {
    const parsed = Date.parse(fromParam)
    if (Number.isNaN(parsed)) {
      return apiError('VALIDATION', 'Tham số "from" không phải định dạng ISO hợp lệ', 400)
    }
    range.from = new Date(parsed).toISOString()
  }
  if (toParam) {
    const parsed = Date.parse(toParam)
    if (Number.isNaN(parsed)) {
      return apiError('VALIDATION', 'Tham số "to" không phải định dạng ISO hợp lệ', 400)
    }
    range.to = new Date(parsed).toISOString()
  }

  if (range.from && range.to && range.from > range.to) {
    return apiError('VALIDATION', '"from" phải nhỏ hơn hoặc bằng "to"', 400)
  }

  let summary
  try {
    summary = await computeEarnings(auth.supabase, auth.user.id, range)
  } catch (err) {
    if (err instanceof EarningsQueryError) {
      return apiError('DB_ERROR', 'Không thể tải thu nhập', 500)
    }
    throw err
  }

  return apiSuccess({
    worker_id: summary.workerId,
    total_jobs_paid: summary.totalJobsPaid,
    gross_earnings: summary.grossEarnings,
    platform_fee_total: summary.platformFeeTotal,
    net_earnings: summary.netEarnings,
    pending_payment_count: summary.pendingPaymentCount,
    pending_payment_amount: summary.pendingPaymentAmount,
    daily_earnings: summary.dailyEarnings.map((day) => ({
      date: day.date,
      gross_earnings: day.grossEarnings,
      platform_fee_total: day.platformFeeTotal,
      net_earnings: day.netEarnings,
      paid_job_count: day.paidJobCount,
    })),
    from_date: summary.fromDate,
    to_date: summary.toDate,
  })
}
