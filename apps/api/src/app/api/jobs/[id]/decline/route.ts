import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { declineBroadcast } from '@/lib/jobs/accept-broadcast'
import { logJobEvent } from '@/lib/jobs/event-log'
import { isUuidRouteParam } from '@/lib/http/route-param'

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
      auth.code,
      auth.error,
      auth.status,
    )
  }

  const { id } = await params
  if (!isUuidRouteParam(id)) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

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
