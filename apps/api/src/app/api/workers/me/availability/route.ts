import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { availabilityToggleSchema } from '@home-services/shared'
import { withDbTimeout } from '@/lib/db/query'

/**
 * PATCH /api/workers/me/availability — B2
 *
 * Worker toggles online/offline. Only approved & not-suspended workers may
 * become available. Setting is_available=false is always allowed (going offline).
 */
export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request, ['worker'])
  if (!auth.success) {
    return apiError(
      auth.status === 401 ? 'AUTH_MISSING' : 'AUTH_FORBIDDEN',
      auth.error,
      auth.status,
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('VALIDATION', 'Dữ liệu không hợp lệ', 400)
  }

  const parsed = availabilityToggleSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION', 'Dữ liệu không hợp lệ', 400)
  }

  const { is_available } = parsed.data

  const { data: worker, error: fetchErr } = await withDbTimeout(
    auth.supabase
      .from('worker_profiles')
      .select('id, is_approved, is_suspended, verification_status')
      .eq('id', auth.user.id)
      .maybeSingle(),
  )

  if (fetchErr) {
    console.warn('Availability: worker lookup failed', { userId: auth.user.id, errorCode: fetchErr.code })
    return apiError('DB_ERROR', 'Không thể tải hồ sơ thợ', 500)
  }

  if (!worker) {
    return apiError('NOT_FOUND', 'Vui lòng hoàn tất đăng ký trước', 404)
  }

  // Going online requires approved + not suspended
  if (is_available && (!worker.is_approved || worker.is_suspended)) {
    return apiError(
      'NOT_APPROVED',
      worker.is_suspended
        ? 'Tài khoản đang bị khóa, không thể bật online'
        : 'Tài khoản chưa được duyệt, không thể bật online',
      403,
    )
  }

  const now = new Date().toISOString()

  const { error: updateErr } = await withDbTimeout(
    auth.supabase
      .from('worker_profiles')
      .update({ is_available, updated_at: now })
      .eq('id', auth.user.id),
  )

  if (updateErr) {
    console.warn('Availability: update failed', { userId: auth.user.id, errorCode: updateErr.code })
    return apiError('DB_ERROR', 'Không thể cập nhật trạng thái', 500)
  }

  return apiSuccess({
    worker_id: auth.user.id,
    is_available,
    updated_at: now,
  })
}
