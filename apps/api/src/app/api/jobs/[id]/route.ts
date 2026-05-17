import { authenticateRequest, assertOwnership, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { withDbTimeout } from '@/lib/db/query'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await authenticateRequest(request)
  if (!auth.success) {
    return apiError(
      auth.status === 401 ? 'AUTH_MISSING' : 'AUTH_FORBIDDEN',
      auth.error,
      auth.status,
    )
  }

  const { id } = await params

  const selectColumns = 'id, status, service_type, description, problem_chips, photo_urls, address_building, address_unit, address_floor, address_district, scheduled_at, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, kael_advisory, customer_id, worker_id, final_price, completion_notes, completion_photo_urls, created_at, matched_at, arrived_at, completed_at, confirmed_at, paid_at, reviewed_at'

  const { data: job, error } = await withDbTimeout(
    auth.supabase
      .from('jobs')
      .select(selectColumns)
      .eq('id', id)
      .single(),
  )

  if (error || !job) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  const ownership = assertOwnership(job, auth.user.id, auth.role)
  if (!ownership.allowed) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  return apiSuccess({
    job: {
      id: job.id,
      status: job.status,
      service_type: job.service_type,
      description: job.description,
      problem_chips: job.problem_chips,
      photo_urls: job.photo_urls,
      address_building: job.address_building,
      address_unit: job.address_unit,
      address_floor: job.address_floor,
      address_district: job.address_district,
      scheduled_at: job.scheduled_at,
      kael_problem_identified: job.kael_problem_identified,
      kael_complexity: job.kael_complexity,
      kael_price_min: job.kael_price_min,
      kael_price_max: job.kael_price_max,
      kael_advisory: job.kael_advisory,
      final_price: job.final_price,
      completion_notes: job.completion_notes,
      completion_photo_urls: job.completion_photo_urls,
      created_at: job.created_at,
      matched_at: job.matched_at,
      arrived_at: job.arrived_at,
      completed_at: job.completed_at,
      confirmed_at: job.confirmed_at,
      paid_at: job.paid_at,
      reviewed_at: job.reviewed_at,
    },
  })
}
