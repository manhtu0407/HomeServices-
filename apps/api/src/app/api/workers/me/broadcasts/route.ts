import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { withDbTimeout } from '@/lib/db/query'
import { secondsRemaining } from '@/lib/jobs/broadcast'
import { PLATFORM_FEE_WORKER } from '@home-services/shared'
import type { Tables } from '@home-services/shared'

// Worker net = gross * (1 - platform fee). E.g., 10% fee → worker keeps 90%.
const WORKER_NET_MULTIPLIER = 1 - PLATFORM_FEE_WORKER

// Typed pick of the columns we select from the related jobs row. Replaces an
// inline object-literal cast — if schema changes, this won't compile.
type BroadcastJobSummary = Pick<
  Tables<'jobs'>,
  'service_type' | 'address_district' | 'kael_problem_identified' | 'kael_price_min' | 'kael_price_max'
>

/**
 * GET /api/workers/me/broadcasts — B3 inbox
 *
 * Returns pending incoming job requests for the authenticated worker.
 * Only shows broadcasts with status='sent' AND expires_at > now.
 * Per STRUCTURES.md B3: hides full address until accept.
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

  const now = new Date()
  const nowIso = now.toISOString()

  const { data: rows, error } = await withDbTimeout(
    auth.supabase
      .from('job_broadcasts')
      .select('id, job_id, status, sent_at, expires_at, jobs(service_type, address_district, kael_problem_identified, kael_price_min, kael_price_max)')
      .eq('worker_id', auth.user.id)
      .eq('status', 'sent')
      .gt('expires_at', nowIso)
      .order('sent_at', { ascending: false })
      .limit(20),
  )

  if (error) {
    console.warn('GET /workers/me/broadcasts: query failed', { userId: auth.user.id, errorCode: error.code })
    return apiError('DB_ERROR', 'Không thể tải yêu cầu', 500)
  }

  const broadcasts = (rows ?? [])
    .map((row) => {
      // Supabase nested select returns the related row as `unknown`-ish in the
      // generated types when the relation isn't 1:1 declared. Narrow via a
      // typed pick (BroadcastJobSummary) so callers fail-compile on schema drift.
      const job = (row.jobs as BroadcastJobSummary | null) ?? null
      if (!job) return null // FK guarantees it exists; defensive skip

      const earningMin = job.kael_price_min !== null ? Math.round(job.kael_price_min * WORKER_NET_MULTIPLIER) : null
      const earningMax = job.kael_price_max !== null ? Math.round(job.kael_price_max * WORKER_NET_MULTIPLIER) : null

      return {
        broadcast_id: row.id,
        job_id: row.job_id,
        status: row.status,
        service_type: job.service_type,
        problem_summary: job.kael_problem_identified,
        district: job.address_district,
        estimated_price_min: job.kael_price_min,
        estimated_price_max: job.kael_price_max,
        estimated_earning_min: earningMin,
        estimated_earning_max: earningMax,
        sent_at: row.sent_at,
        expires_at: row.expires_at,
        seconds_remaining: secondsRemaining(row.expires_at, now),
      }
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)

  return apiSuccess({ broadcasts })
}
