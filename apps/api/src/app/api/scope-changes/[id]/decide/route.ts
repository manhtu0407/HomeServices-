import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { customerScopeDecisionSchema } from '@home-services/shared'
import { decideScopeChange } from '@/lib/jobs/scope-change'
import { logJobEvent } from '@/lib/jobs/event-log'
import type { JobStatus } from '@home-services/shared'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * POST /api/scope-changes/[id]/decide — A11
 *
 * Customer approves or rejects a worker's scope change request.
 * Job returns to 'repairing' either way (worker continues new or original scope).
 *
 * Per RULES.md #7 — no autonomous money action. Customer MUST tap to approve.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateRequest(request, ['customer'])
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
    'repairing' as JobStatus,
    { scope_change_id: id, decision: parsed.data.decision },
  )

  return apiSuccess({
    scope_change_id: result.scopeChangeId,
    job_id: result.jobId,
    status: result.status,
    decided_at: result.decidedAt,
  })
}
