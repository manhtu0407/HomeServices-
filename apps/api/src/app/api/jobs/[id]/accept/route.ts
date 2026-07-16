import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { acceptBroadcast } from '@/lib/jobs/accept-broadcast'
import { logJobEvent } from '@/lib/jobs/event-log'
import { isUuidRouteParam } from '@/lib/http/route-param'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * POST /api/jobs/[id]/accept — B3 worker accept
 *
 * Worker accepts an incoming broadcast within the 60s window. Race-safe:
 * first eligible worker to accept becomes a private candidate. The address
 * stays locked until the owning customer confirms that candidate.
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
    'worker_candidate_pending',
    { candidate_id: result.candidateId },
  )

  return apiSuccess({
    job_id: result.jobId,
    status: result.status,
    candidate_id: result.candidateId,
    awaiting_customer_confirmation: result.awaitingCustomerConfirmation,
    already_applied: result.alreadyApplied,
  })
}
