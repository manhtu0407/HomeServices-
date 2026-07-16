import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { reviewSchema } from '@nestscout/shared'
import { logJobEvent } from '@/lib/jobs/event-log'
import { withDbTimeout } from '@/lib/db/query'
import { readJsonRequestBounded } from '@/lib/http/request-json'
import { isUuidRouteParam } from '@/lib/http/route-param'
import { runLearningHook } from '@/lib/learning/hook'

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

  let body: unknown
  try {
    body = await readJsonRequestBounded(request)
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

  const { data: rpcRows, error: rpcError } = await withDbTimeout(
    auth.supabase.rpc('submit_review_atomic', {
      p_job_id: id,
      p_customer_id: auth.user.id,
      p_rating: input.rating,
      p_tags: input.tags,
      p_comment: input.comment ?? '',
    }),
  )

  if (rpcError) {
    return apiError('DB_ERROR', 'Không thể gửi đánh giá', 500)
  }
  const row = rpcRows?.[0]
  if (!row) {
    return apiError('DB_ERROR', 'Không thể gửi đánh giá', 500)
  }
  if (!row.ok) {
    return reviewRpcError(row.error_code)
  }

  await logJobEvent(
    auth.supabase,
    id,
    'customer_reviewed',
    { id: auth.user.id, role: 'customer' },
    null,
    'reviewed',
    { rating: input.rating },
  )

  // Kael learning hook: fire-and-forget. Per RULES.md #8 + STRUCTURES.md §10F,
  // learning failures MUST NOT block the customer's review response.
  await runLearningHook(auth.supabase, id).catch((err: unknown) => {
    console.warn('Learning hook failed', {
      jobId: id,
      errorCode: 'LEARNING_FAILED',
      errorName: err instanceof Error ? err.name : typeof err,
    })
  })

  return apiSuccess({
    review_id: row.review_id,
    job_id: id,
    status: row.job_status,
  }, 201)
}

function reviewRpcError(code: string | null) {
  if (code === 'NOT_FOUND') {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }
  if (code === 'ALREADY_REVIEWED') {
    return apiError('ALREADY_REVIEWED', 'Yêu cầu này đã được đánh giá', 409)
  }
  if (code === 'INVALID_RATING') {
    return apiError('VALIDATION', 'Đánh giá phải từ 1 đến 5 sao', 400)
  }
  if (code === 'INVALID_STATUS') {
    return apiError('INVALID_STATUS', 'Chưa thể đánh giá yêu cầu này', 409)
  }
  if (code === 'STATUS_CHANGED') {
    return apiError(
      'STATUS_CHANGED',
      'Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.',
      409,
    )
  }
  return apiError('DB_ERROR', 'Không thể gửi đánh giá', 500)
}
