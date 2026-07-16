import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { withDbTimeout } from '@/lib/db/query'
import { PLATFORM_FEE_WORKER } from '@nestscout/shared'

/**
 * GET /api/workers/me/jobs — worker's active + historical jobs
 *
 * Returns jobs assigned to this worker. Excludes raw description (PII).
 * Estimated earning = final_price * (1 - PLATFORM_FEE_WORKER) when paid.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request, ['worker'])
  if (!auth.success) {
    return apiError(
      auth.code,
      auth.error,
      auth.status,
    )
  }

  const { data: rows, error } = await withDbTimeout(
    auth.supabase
      .from('jobs')
      .select('id, status, service_type, kael_problem_identified, address_building, address_unit, address_floor, address_district, final_price, created_at, matched_at, completed_at')
      .eq('worker_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(100),
  )

  if (error) {
    console.warn('GET /workers/me/jobs: query failed', { userId: auth.user.id, errorCode: error.code })
    return apiError('DB_ERROR', 'Không thể tải danh sách công việc', 500)
  }

  const jobs = (rows ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    service_type: row.service_type,
    problem_summary: row.kael_problem_identified,
    address_building: row.address_building,
    address_unit: row.address_unit,
    address_floor: row.address_floor,
    district: row.address_district,
    final_price: row.final_price,
    estimated_earning: row.final_price ? Math.round(row.final_price * (1 - PLATFORM_FEE_WORKER)) : null,
    created_at: row.created_at,
    matched_at: row.matched_at,
    completed_at: row.completed_at,
  }))

  return apiSuccess({ jobs })
}
