import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { reviewSchema } from '@home-services/shared'
import { validateTransition } from '@/lib/jobs/lifecycle'
import { logJobEvent } from '@/lib/jobs/event-log'
import type { JobStatus } from '@home-services/shared'

type RouteParams = { params: Promise<{ id: string }> }

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

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return apiError('VALIDATION', 'Dữ liệu không hợp lệ', 400)
  }

  const parsed = reviewSchema.safeParse({ ...body, job_id: id })
  if (!parsed.success) {
    return apiError('VALIDATION', 'Dữ liệu không hợp lệ', 400)
  }

  const input = parsed.data

  const { data: job, error: fetchError } = await auth.supabase
    .from('jobs')
    .select('id, status, customer_id, worker_id')
    .eq('id', id)
    .single()

  if (fetchError || !job) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  if (job.customer_id !== auth.user.id) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  if (!job.worker_id) {
    return apiError('INVALID_STATUS', 'Yêu cầu chưa có thợ', 409)
  }

  // Must be paid or confirmed_by_customer to review
  const transition = validateTransition(job.status as JobStatus, 'reviewed')
  if (!transition.valid) {
    return apiError('INVALID_STATUS', transition.error, 409)
  }

  // Insert review
  const { data: review, error: reviewError } = await auth.supabase
    .from('reviews')
    .insert({
      job_id: id,
      customer_id: auth.user.id,
      worker_id: job.worker_id,
      rating: input.rating,
      tags: input.tags,
      comment: input.comment ?? null,
    })
    .select('id')
    .single()

  if (reviewError || !review) {
    return apiError('DB_ERROR', 'Không thể gửi đánh giá', 500)
  }

  // Transition to reviewed
  const now = new Date().toISOString()
  const { error: statusErr } = await auth.supabase
    .from('jobs')
    .update({ status: 'reviewed', reviewed_at: now })
    .eq('id', id)

  if (statusErr) {
    return apiError('DB_ERROR', 'Không thể cập nhật trạng thái', 500)
  }

  await logJobEvent(auth.supabase, id, 'customer_reviewed', auth.user.id, 'customer', job.status as JobStatus, 'reviewed', { rating: input.rating })

  return apiSuccess({
    review_id: review.id,
    job_id: id,
    status: 'reviewed',
  }, 201)
}
