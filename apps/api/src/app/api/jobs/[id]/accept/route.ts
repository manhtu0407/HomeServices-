import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { acceptBroadcast } from '@/lib/jobs/accept-broadcast'
import { logJobEvent } from '@/lib/jobs/event-log'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * POST /api/jobs/[id]/accept — B3 worker accept
 *
 * Worker accepts an incoming broadcast within the 60s window. Race-safe:
 * first worker to accept wins via atomic transition of job.status from
 * 'broadcasting' to 'worker_matched'. On success, returns full address (B4).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateRequest(request, ['worker'])
  if (!auth.success) {
    return apiError(
      auth.status === 401 ? 'AUTH_MISSING' : 'AUTH_FORBIDDEN',
      auth.error,
      auth.status,
    )
  }

  const { id } = await params

  const result = await acceptBroadcast(auth.supabase, id, auth.user.id)
  if (!result.success) {
    return apiError(result.code, result.error, result.status)
  }

  await logJobEvent(
    auth.supabase,
    id,
    'worker_accepted',
    { id: auth.user.id, role: 'worker' },
    'broadcasting',
    'worker_matched',
  )

  return apiSuccess({
    job_id: result.jobId,
    status: result.status,
    full_address: result.fullAddress,
  })
}
