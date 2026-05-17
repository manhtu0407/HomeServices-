import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { declineBroadcast } from '@/lib/jobs/accept-broadcast'
import { logJobEvent } from '@/lib/jobs/event-log'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * POST /api/jobs/[id]/decline — B3 worker decline
 *
 * Worker declines an incoming broadcast. Job stays in 'broadcasting' for
 * other workers to accept. No status transition required on the job itself.
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

  const result = await declineBroadcast(auth.supabase, id, auth.user.id)
  if (!result.success) {
    return apiError(result.code, result.error, result.status)
  }

  await logJobEvent(
    auth.supabase,
    id,
    'worker_declined',
    { id: auth.user.id, role: 'worker' },
    null,
    null,
  )

  return apiSuccess({ job_id: result.jobId, declined: true })
}
