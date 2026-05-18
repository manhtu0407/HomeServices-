import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { withDbTimeout } from '@/lib/db/query'
import { availabilityToggleSchema } from '@home-services/shared'

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
      auth.status === 401 ? 'AUTH_MISSING' : 'AUTH_FORBIDDEN',
      auth.error,
      auth.status,
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('VALIDATION', 'Invalid request body', 400)
  }

  const parsed = availabilityToggleSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION', 'Invalid request body', 400)
  }

  const { data, error } = await withDbTimeout(
    auth.supabase.rpc('set_worker_availability_atomic', {
      p_worker_id: auth.user.id,
      p_is_available: parsed.data.is_available,
    }),
  )

  if (error) {
    console.warn('Availability: RPC failed', { userId: auth.user.id, errorCode: error.code })
    return apiError('DB_ERROR', 'Cannot update availability', 500)
  }

  const row = (Array.isArray(data) ? data[0] : data) as AvailabilityRpcRow | null
  if (!row) return apiError('DB_ERROR', 'Cannot update availability', 500)
  if (!row.ok) return mapAvailabilityRpcError(row.error_code)

  return apiSuccess({
    worker_id: auth.user.id,
    is_available: Boolean(row.is_available),
    updated_at: row.updated_at_ts,
  })
}

function mapAvailabilityRpcError(errorCode: string | null) {
  if (errorCode === 'NOT_FOUND') {
    return apiError('NOT_FOUND', 'Complete worker registration first', 404)
  }
  if (errorCode === 'NOT_APPROVED') {
    return apiError('NOT_APPROVED', 'Worker profile is not approved for online work', 403)
  }
  if (errorCode === 'WORKER_BUSY') {
    return apiError('WORKER_BUSY', 'An active job is already assigned to this worker', 409)
  }
  return apiError('DB_ERROR', 'Cannot update availability', 500)
}
