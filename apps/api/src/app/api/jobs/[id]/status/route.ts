import { z } from 'zod'
import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { validateTransition } from '@/lib/jobs/lifecycle'
import { logJobEvent } from '@/lib/jobs/event-log'
import { withDbTimeout } from '@/lib/db/query'
import type { JobStatus, TablesUpdate } from '@home-services/shared'

const statusUpdateSchema = z.object({
  status: z.enum([
    'worker_on_way',
    'arrived',
    'inspecting',
    'repairing',
    'completed_by_worker',
  ]),
  completion_notes: z.string().max(2000).optional(),
  completion_photo_urls: z.array(z.string().url()).max(10).optional(),
}).strict()

type RouteParams = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: RouteParams) {
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

  const parsed = statusUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION', 'Dữ liệu không hợp lệ', 400)
  }

  const input = parsed.data

  const { data: job, error: fetchError } = await withDbTimeout(
    auth.supabase
      .from('jobs')
      .select('id, status, worker_id')
      .eq('id', id)
      .single(),
  )

  if (fetchError || !job) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  if (job.worker_id !== auth.user.id) {
    return apiError('AUTH_FORBIDDEN', 'Bạn không có quyền thực hiện hành động này', 403)
  }

  if (job.status === 'scope_change_pending') {
    return apiError('SCOPE_CHANGE_PENDING', 'Không thể cập nhật trạng thái khi Kael đang xét thay đổi phạm vi', 409)
  }

  const transition = validateTransition(job.status as JobStatus, input.status)
  if (!transition.valid) {
    return apiError('INVALID_STATUS', transition.error, 409)
  }

  const now = new Date().toISOString()
  const baseUpdate: TablesUpdate<'jobs'> = { status: input.status }

  if (transition.timestampColumn) {
    ;(baseUpdate as Record<string, unknown>)[transition.timestampColumn] = now
  }

  if (input.status === 'completed_by_worker') {
    baseUpdate.completion_notes = input.completion_notes ?? null
    baseUpdate.completion_photo_urls = input.completion_photo_urls ?? []
  }

  const { data: updated, error: updateError } = await withDbTimeout(
    auth.supabase
      .from('jobs')
      .update(baseUpdate)
      .eq('id', id)
      .eq('worker_id', auth.user.id)
      .eq('status', job.status)
      .select('id')
      .maybeSingle(),
  )

  if (updateError) {
    return apiError('DB_ERROR', 'Không thể cập nhật trạng thái', 500)
  }

  if (!updated) {
    return apiError(
      'STATUS_CHANGED',
      'Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.',
      409,
    )
  }

  await logJobEvent(auth.supabase, id, 'worker_status_update', { id: auth.user.id, role: 'worker' }, job.status as JobStatus, input.status)

  return apiSuccess({
    job_id: id,
    from_status: job.status,
    to_status: input.status,
    updated_at: now,
  })
}
