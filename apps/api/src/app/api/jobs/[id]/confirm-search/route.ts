import { NextResponse } from 'next/server'
import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { validateTransition } from '@/lib/jobs/lifecycle'
import { logJobEvent } from '@/lib/jobs/event-log'
import { createBroadcasts } from '@/lib/jobs/broadcast'
import { withDbTimeout } from '@/lib/db/query'
import type { JobStatus } from '@home-services/shared'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * POST /api/jobs/[id]/confirm-search — A7
 *
 * Customer confirms booking search. Transitions job to 'broadcasting' and
 * creates broadcast rows for top eligible workers. Job stays 'broadcasting'
 * until a worker accepts (B3) — no auto-match.
 */
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

  const { data: job, error: fetchError } = await withDbTimeout(
    auth.supabase
      .from('jobs')
      .select('id, status, customer_id, service_type, address_district')
      .eq('id', id)
      .single(),
  )

  if (fetchError || !job) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  if (job.customer_id !== auth.user.id) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  const transition = validateTransition(job.status, 'broadcasting')
  if (!transition.valid) {
    return apiError('INVALID_STATUS', transition.error, 409)
  }

  const now = new Date().toISOString()

  // Optimistic concurrency: only transition if status hasn't changed since the
  // fetch above. Prevents double-tap from creating two broadcast batches.
  const { data: updated, error: updateErr } = await withDbTimeout(
    auth.supabase
      .from('jobs')
      .update({
        status: 'broadcasting',
        broadcast_at: now,
        confirmed_search_at: now,
      })
      .eq('id', id)
      .eq('status', job.status)
      .select('id')
      .maybeSingle(),
  )

  if (updateErr) {
    return apiError('DB_ERROR', 'Không thể bắt đầu tìm thợ', 500)
  }

  if (!updated) {
    // Row exists but status changed between fetch and update — concurrent caller won.
    // Return current status so client can refresh UI without an extra GET roundtrip.
    const { data: current } = await withDbTimeout(
      auth.supabase.from('jobs').select('status').eq('id', id).maybeSingle(),
    )
    return NextResponse.json(
      {
        error: 'Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.',
        code: 'STATUS_CHANGED',
        current_status: current?.status ?? null,
      },
      { status: 409 },
    )
  }

  await logJobEvent(
    auth.supabase,
    id,
    'customer_confirmed_search',
    { id: auth.user.id, role: 'customer' },
    job.status as JobStatus,
    'broadcasting',
  )

  const district = job.address_district ?? 'hcmc_all'
  const broadcastResult = await createBroadcasts(
    auth.supabase,
    id,
    job.service_type,
    district,
  )

  if (!broadcastResult.success) {
    await logJobEvent(
      auth.supabase,
      id,
      'no_worker_found',
      { id: auth.user.id, role: 'customer' },
      'broadcasting',
      null,
      { reason: broadcastResult.reason, district, service_type: job.service_type },
    )

    return apiSuccess({
      job_id: id,
      status: 'broadcasting',
      worker: null,
      message: broadcastResult.reason,
    })
  }

  await logJobEvent(
    auth.supabase,
    id,
    'broadcast_sent',
    { id: auth.user.id, role: 'customer' },
    'broadcasting',
    null,
    { batch_id: broadcastResult.batchId, worker_count: broadcastResult.broadcastCount },
  )

  return apiSuccess({
    job_id: id,
    status: 'broadcasting',
    worker: null,
    message: `Đã gửi yêu cầu đến ${broadcastResult.broadcastCount} thợ. Đang chờ phản hồi.`,
  })
}
