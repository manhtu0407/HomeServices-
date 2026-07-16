import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { customerScopeDecisionSchema } from '@nestscout/shared'
import { decideScopeChange } from '@/lib/jobs/scope-change'
import { logJobEvent } from '@/lib/jobs/event-log'
import { readJsonRequestBounded } from '@/lib/http/request-json'
import { isUuidRouteParam } from '@/lib/http/route-param'
import type { JobStatus } from '@nestscout/shared'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * POST /api/scope-changes/[id]/decide — A11
 *
 * Legacy/appeal path for a worker's scope change request.
 * Approve resumes repairing. Reject cancels the job until original-scope
 * continuation is modeled explicitly.
 *
 * Kael Autonomy v2 owns the default decision; this route remains for explicit
 * override/appeal compatibility while the Next app trails the Edge runtime.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateRequest(request, ['customer'])
  if (!auth.success) {
    return apiError(
      auth.code,
      auth.error,
      auth.status,
    )
  }

  const { id } = await params
  if (!isUuidRouteParam(id)) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu thay đổi', 404)
  }

  let body: unknown
  try {
    body = await readJsonRequestBounded(request)
  } catch {
    return apiError('VALIDATION', 'Dữ liệu không hợp lệ', 400)
  }

  const parsed = customerScopeDecisionSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION', 'Dữ liệu không hợp lệ', 400)
  }

  const result = await decideScopeChange(auth.supabase, id, auth.user.id, parsed.data.decision)
  if (!result.success) {
    return apiError(result.code, result.error, result.status)
  }

  await logJobEvent(
    auth.supabase,
    result.jobId,
    parsed.data.decision === 'approve'
      ? 'customer_approved_scope_change'
      : 'customer_rejected_scope_change',
    { id: auth.user.id, role: 'customer' },
    'scope_change_pending' as JobStatus,
    (parsed.data.decision === 'approve' ? 'repairing' : 'cancelled') as JobStatus,
    { scope_change_id: id, decision: parsed.data.decision },
  )

  return apiSuccess({
    scope_change_id: result.scopeChangeId,
    job_id: result.jobId,
    status: result.status,
    decided_at: result.decidedAt,
  })
}
