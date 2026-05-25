import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { workerScopeChangeSchema } from '@home-services/shared'
import { requestScopeChange } from '@/lib/jobs/scope-change'
import { logJobEvent } from '@/lib/jobs/event-log'
import type { JobStatus } from '@home-services/shared'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * POST /api/jobs/[id]/scope-change — B6
 *
 * Edge-only money/status path. The Supabase Edge mobile-api must compute and
 * persist Kael's scope estimate before notifying the customer, so this
 * reference route returns EDGE_MOBILE_API_REQUIRED.
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('VALIDATION', 'Dữ liệu không hợp lệ', 400)
  }

  const parsed = workerScopeChangeSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION', 'Dữ liệu không hợp lệ', 400)
  }

  const result = await requestScopeChange(auth.supabase, id, auth.user.id, parsed.data)
  if (!result.success) {
    return apiError(result.code, result.error, result.status)
  }

  await logJobEvent(
    auth.supabase,
    id,
    'worker_requested_scope_change',
    { id: auth.user.id, role: 'worker' },
    null,
    'scope_change_pending' as JobStatus,
    { scope_change_id: result.scopeChangeId },
  )

  return apiSuccess(
    {
      scope_change_id: result.scopeChangeId,
      job_id: result.jobId,
      status: result.status,
      created_at: result.createdAt,
    },
    201,
  )
}
