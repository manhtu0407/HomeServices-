import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { validateTransition } from '@/lib/jobs/lifecycle'
import { logJobEvent } from '@/lib/jobs/event-log'
import { withDbTimeout } from '@/lib/db/query'
import { isUuidRouteParam } from '@/lib/http/route-param'
import type { JobStatus } from '@nestscout/shared'

type RouteParams = { params: Promise<{ id: string }> }

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
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  const { data: job, error: fetchError } = await withDbTimeout(
    auth.supabase
      .from('jobs')
      .select('id, status, customer_id, final_price')
      .eq('id', id)
      .single(),
  )

  if (fetchError || !job) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  if (job.customer_id !== auth.user.id) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  const transition = validateTransition(job.status as JobStatus, 'confirmed_by_customer')
  if (!transition.valid) {
    return apiError('INVALID_STATUS', transition.error, 409)
  }
  const finalPrice = job.final_price
  if (!Number.isInteger(finalPrice) || finalPrice === null || finalPrice <= 0) {
    return apiError(
      'INVALID_STATUS',
      'Kael chưa chốt giá cuối cùng nên chưa thể xác nhận hoàn tất',
      409,
    )
  }

  const now = new Date().toISOString()

  // Optimistic concurrency: guard against customer double-tap or concurrent
  // admin write. Update only if status hasn't changed since the fetch above.
  const { data: updated, error: confirmErr } = await withDbTimeout(
    auth.supabase
      .from('jobs')
      .update({ status: 'confirmed_by_customer', confirmed_at: now })
      .eq('id', id)
      .eq('customer_id', auth.user.id)
      .eq('status', job.status)
      .select('id')
      .maybeSingle(),
  )

  if (confirmErr) {
    return apiError('DB_ERROR', 'Không thể xác nhận hoàn thành', 500)
  }

  if (!updated) {
    // Status changed between fetch and update — another caller won.
    return apiError(
      'STATUS_CHANGED',
      'Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.',
      409,
    )
  }

  await logJobEvent(
    auth.supabase,
    id,
    'customer_confirmed_completion',
    { id: auth.user.id, role: 'customer' },
    job.status as JobStatus,
    'confirmed_by_customer',
  )

  return apiSuccess({
    job_id: id,
    status: 'confirmed_by_customer',
    final_price: finalPrice,
  })
}
