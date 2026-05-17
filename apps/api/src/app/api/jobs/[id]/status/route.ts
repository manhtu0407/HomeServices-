import { z } from 'zod'
import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { validateTransition, WORKER_UPDATABLE_STATUSES } from '@/lib/jobs/lifecycle'
import { logJobEvent } from '@/lib/jobs/event-log'
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
  final_price: z.number().int().positive().optional(),
})

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

  if (input.status === 'completed_by_worker' && !input.final_price) {
    return apiError('VALIDATION', 'Cần nhập giá cuối cùng khi hoàn thành', 400)
  }

  const { data: job, error: fetchError } = await auth.supabase
    .from('jobs')
    .select('id, status, worker_id')
    .eq('id', id)
    .single()

  if (fetchError || !job) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  if (job.worker_id !== auth.user.id) {
    return apiError('AUTH_FORBIDDEN', 'Bạn không có quyền thực hiện hành động này', 403)
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
    baseUpdate.final_price = input.final_price ?? null
    baseUpdate.completion_notes = input.completion_notes ?? null
    baseUpdate.completion_photo_urls = input.completion_photo_urls ?? []
  }

  const { error: updateError } = await auth.supabase
    .from('jobs')
    .update(baseUpdate)
    .eq('id', id)

  if (updateError) {
    return apiError('DB_ERROR', 'Không thể cập nhật trạng thái', 500)
  }

  await logJobEvent(auth.supabase, id, 'worker_status_update', auth.user.id, 'worker', job.status as JobStatus, input.status)

  return apiSuccess({
    job_id: id,
    from_status: job.status,
    to_status: input.status,
    updated_at: new Date().toISOString(),
  })
}
