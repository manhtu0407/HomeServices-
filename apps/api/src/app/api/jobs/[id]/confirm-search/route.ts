import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { validateTransition } from '@/lib/jobs/lifecycle'
import { logJobEvent } from '@/lib/jobs/event-log'
import { findAndMatchWorker } from '@/lib/jobs/matching'
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

  const { data: job, error: fetchError } = await auth.supabase
    .from('jobs')
    .select('id, status, customer_id, service_type, address_district')
    .eq('id', id)
    .single()

  if (fetchError || !job) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  if (job.customer_id !== auth.user.id) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  // A7 gate: must be awaiting_customer_confirm
  const transition = validateTransition(job.status, 'broadcasting')
  if (!transition.valid) {
    return apiError('INVALID_STATUS', transition.error, 409)
  }

  // Transition to broadcasting
  const { error: updateErr } = await auth.supabase
    .from('jobs')
    .update({
      status: 'broadcasting',
      broadcast_at: new Date().toISOString(),
      confirmed_search_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateErr) {
    return apiError('DB_ERROR', 'Không thể bắt đầu tìm thợ', 500)
  }

  await logJobEvent(auth.supabase, id, 'customer_confirmed_search', auth.user.id, 'customer', job.status as JobStatus, 'broadcasting')

  // Prototype: auto-match first eligible worker
  const matchResult = await findAndMatchWorker(
    auth.supabase,
    id,
    job.service_type,
    job.address_district ?? 'default',
  )

  if (!matchResult.success) {
    return apiSuccess({
      job_id: id,
      status: 'broadcasting',
      worker: null,
      message: matchResult.reason,
    })
  }

  await logJobEvent(auth.supabase, id, 'worker_matched', matchResult.worker.id, 'worker', 'broadcasting', 'worker_matched')

  return apiSuccess({
    job_id: id,
    status: 'worker_matched',
    worker: {
      full_name: matchResult.worker.full_name,
      rating: matchResult.worker.rating,
      total_jobs: matchResult.worker.total_jobs,
    },
  })
}

