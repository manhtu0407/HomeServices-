import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { withDbTimeout } from '@/lib/db/query'
import { normalizeIsoTimestamp } from '@/lib/http/iso-timestamp'
import { readJsonRequestBounded } from '@/lib/http/request-json'
import { availabilityToggleSchema } from '@nestscout/shared'

type AvailabilityRpcRow = {
  ok: boolean
  error_code: string | null
  is_available: boolean | null
  updated_at_ts: string | null
}

/**
 * PATCH /api/workers/me/availability
 *
 * Reference-only Next route. Mobile runtime uses Supabase Edge mobile-api.
 * Availability still goes through the same atomic RPC so the reference backend
 * cannot drift into a race-prone direct table update.
 */
export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request, ['worker'])
  if (!auth.success) {
    return apiError(
      auth.code,
      auth.error,
      auth.status,
    )
  }

  let body: unknown
  try {
    body = await readJsonRequestBounded(request)
  } catch {
    return apiError('VALIDATION', 'Nội dung yêu cầu không hợp lệ', 400)
  }

  const parsed = availabilityToggleSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION', 'Nội dung yêu cầu không hợp lệ', 400)
  }

  const { data, error } = await withDbTimeout(
    auth.supabase.rpc('set_worker_availability_atomic', {
      p_worker_id: auth.user.id,
      p_is_available: parsed.data.is_available,
    }),
  )

  if (error) {
    console.warn('Availability: RPC failed', { userId: auth.user.id, errorCode: error.code })
    return apiError('DB_ERROR', 'Không thể cập nhật trạng thái nhận việc', 500)
  }

  const row = availabilityRpcRow(Array.isArray(data) ? data[0] : data)
  if (!row) return apiError('DB_ERROR', 'Không thể cập nhật trạng thái nhận việc', 500)
  if (!row.ok) return mapAvailabilityRpcError(row.error_code)

  if (
    typeof row.is_available !== 'boolean' ||
    typeof row.updated_at_ts !== 'string' ||
    normalizeIsoTimestamp(row.updated_at_ts) === null
  ) {
    return apiError('DB_ERROR', 'Không thể cập nhật trạng thái nhận việc', 500)
  }

  return apiSuccess({
    worker_id: auth.user.id,
    is_available: row.is_available,
    updated_at: row.updated_at_ts,
  })
}

function availabilityRpcRow(value: unknown): AvailabilityRpcRow | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (
    typeof row.ok !== 'boolean' ||
    (row.error_code !== null && typeof row.error_code !== 'string') ||
    (row.is_available !== null && typeof row.is_available !== 'boolean') ||
    (row.updated_at_ts !== null && typeof row.updated_at_ts !== 'string')
  ) return null
  return row as AvailabilityRpcRow
}

function mapAvailabilityRpcError(errorCode: string | null) {
  if (errorCode === 'NOT_FOUND') {
    return apiError('NOT_FOUND', 'Hoàn tất hồ sơ thợ trước khi nhận việc', 404)
  }
  if (errorCode === 'NOT_APPROVED') {
    return apiError('NOT_APPROVED', 'Hồ sơ thợ chưa được duyệt để nhận việc', 403)
  }
  if (errorCode === 'WORKER_BUSY') {
    return apiError('WORKER_BUSY', 'Thợ đang có yêu cầu đang xử lý', 409)
  }
  return apiError('DB_ERROR', 'Không thể cập nhật trạng thái nhận việc', 500)
}
