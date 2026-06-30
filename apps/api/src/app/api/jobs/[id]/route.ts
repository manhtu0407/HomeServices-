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

  let broadcastState: { active_count: number; seconds_remaining: number | null } | null = null
  if (job.status === 'broadcasting') {
    const now = new Date()
    const nowIso = now.toISOString()

    const { data: broadcasts, error: broadcastErr } = await withDbTimeout(
      auth.supabase
        .from('job_broadcasts')
        .select('id, expires_at')
        .eq('job_id', id)
        .eq('status', 'sent')
        .gt('expires_at', nowIso)
        .limit(20),
    )
    if (broadcastErr) {
      console.warn('Job detail: broadcast state query failed', { jobId: id, errorCode: broadcastErr.code })
      return apiError('DB_ERROR', 'Không thể kiểm tra trạng thái broadcast', 500)
    }

    let activeCount = 0
    const seconds: number[] = []
    for (const broadcast of broadcasts ?? []) {
      activeCount += 1
      if (broadcast.expires_at) {
        seconds.push(Math.max(0, Math.round((new Date(broadcast.expires_at).getTime() - now.getTime()) / 1000)))
      }
    }
    broadcastState = {
      active_count: activeCount,
      seconds_remaining: seconds.length > 0 ? Math.max(...seconds) : 0,
    }
  }

  let currentScopeChange: {
    id: string
    status: string
    requested_description: string | null
    reason: string | null
    price_min: number | null
    price_max: number | null
    kael_review: Record<string, unknown> | null
    created_at: string | null
  } | null = null
  if (job.status === 'scope_change_pending') {
    const { data: scopeRows, error: scopeErr } = await withDbTimeout(
      auth.supabase
        .from('scope_change_requests')
        .select('id, status, requested_description, reason, price_min, price_max, kael_review, created_at')
        .eq('job_id', id)
        .in('status', ['waiting_customer_decision', 'reviewing_by_kael'])
        .order('created_at', { ascending: false })
        .limit(1),
    )
    if (scopeErr) {
      console.warn('Job detail: current scope-change query failed', { jobId: id, errorCode: scopeErr.code })
      return apiError('DB_ERROR', 'Không thể tải yêu cầu đổi phạm vi hiện tại', 500)
    }
    const scope = scopeRows?.[0]
    currentScopeChange = scope
      ? {
          id: scope.id,
          status: scope.status,
          requested_description: scope.requested_description,
          reason: scope.reason,
          price_min: scope.price_min,
          price_max: scope.price_max,
          kael_review: isRecord(scope.kael_review) ? scope.kael_review : null,
          created_at: scope.created_at,
        }
      : null
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
    broadcast_state: broadcastState,
    current_scope_change: currentScopeChange,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
