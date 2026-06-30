import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { logJobEvent } from '@/lib/jobs/event-log'
import type { JobStatus } from '@nestscout/shared'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * POST /api/jobs/[id]/cancel
 *
 * Reference/parity route for the mobile Edge contract. Customer can cancel
 * only before a worker accepts. The DB RPC cancels the job and active
 * broadcasts in one transaction.
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
  const { data, error } = await auth.supabase.rpc('cancel_job_before_accept_atomic', {
    p_job_id: id,
    p_customer_id: auth.user.id,
  })

  if (error) {
    return apiError('DB_ERROR', 'Không thể hủy yêu cầu', 500)
  }

  const row = data?.[0]
  if (!row) {
    return apiError('DB_ERROR', 'Không thể hủy yêu cầu', 500)
  }

  if (!row.ok) {
    if (row.error_code === 'NOT_FOUND') {
      return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
    }
    if (row.error_code === 'INVALID_STATUS') {
      return apiError('INVALID_STATUS', 'Chỉ có thể hủy trước khi thợ nhận việc', 409)
    }
    if (row.error_code === 'STATUS_CHANGED') {
      return apiError('STATUS_CHANGED', 'Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.', 409)
    }
    return apiError('DB_ERROR', 'Không thể hủy yêu cầu', 500)
  }

  await logJobEvent(
    auth.supabase,
    id,
    'customer_cancelled_before_accept',
    { id: auth.user.id, role: 'customer' },
    null,
    'cancelled',
  )

  return apiSuccess({
    job_id: id,
    status: row.job_status as JobStatus,
  })
}
