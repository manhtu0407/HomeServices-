import { NextResponse } from 'next/server'
import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { validateTransition } from '@/lib/jobs/lifecycle'
import { logJobEvent } from '@/lib/jobs/event-log'
import { createBroadcasts } from '@/lib/jobs/broadcast'
import { withDbTimeout } from '@/lib/db/query'
import { normalizeServiceAreaDistrict, type JobStatus } from '@home-services/shared'

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
      .select('id, status, customer_id, service_type, address_district, kael_price_max, final_price')
      .eq('id', id)
      .single(),
  )

  if (fetchError || !job) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  if (job.customer_id !== auth.user.id) {
    return apiError('NOT_FOUND', 'Không tìm thấy yêu cầu', 404)
  }

  const district = normalizeServiceAreaDistrict(job.address_district ?? '')
  if (!district) {
    return apiError('VALIDATION', 'Địa chỉ cần có quận TP.HCM rõ ràng', 400)
  }

  const lockedFinalPrice =
    typeof job.final_price === 'number' && Number.isInteger(job.final_price) && job.final_price > 0
      ? job.final_price
      : job.kael_price_max

  const now = new Date().toISOString()
  let rollbackStatus: JobStatus | null = null
  if (job.status === 'broadcasting') {
    const { error: expireErr } = await withDbTimeout(
      auth.supabase
        .from('job_broadcasts')
        .update({ status: 'expired', responded_at: now })
        .eq('job_id', id)
        .eq('status', 'sent')
        .lte('expires_at', now),
    )
    if (expireErr) {
      return apiError('DB_ERROR', 'Không thể cập nhật broadcast đã hết hạn', 500)
    }

    const { data: activeBroadcasts, error: activeErr } = await withDbTimeout(
      auth.supabase
        .from('job_broadcasts')
        .select('id, expires_at')
        .eq('job_id', id)
        .eq('status', 'sent')
        .limit(20),
    )
    if (activeErr) {
      return apiError('DB_ERROR', 'Không thể kiểm tra broadcast hiện tại', 500)
    }
    const hasActiveBroadcast = (activeBroadcasts ?? []).some((broadcast) =>
      !broadcast.expires_at || broadcast.expires_at > now
    )
    if (hasActiveBroadcast) {
      return apiError(
        'BROADCAST_ACTIVE',
        'Yêu cầu đang được gửi đến thợ. Vui lòng chờ phản hồi hiện tại.',
        409,
      )
    }

    const lease = await acquireBroadcastRetryLease(auth.supabase, id, auth.user.id, now)
    if (!lease.success) {
      return apiError(lease.code, lease.error, lease.status)
    }

    await logJobEvent(
      auth.supabase,
      id,
      'customer_retried_search',
      { id: auth.user.id, role: 'customer' },
      'broadcasting',
      'broadcasting',
    )
  } else {
    const transition = validateTransition(job.status, 'broadcasting')
    if (!transition.valid) {
      return apiError('INVALID_STATUS', transition.error, 409)
    }
    if (typeof lockedFinalPrice !== 'number' || !Number.isInteger(lockedFinalPrice) || lockedFinalPrice <= 0) {
      return apiError(
        'KAEL_PRICE_MISSING',
        'Kael chưa chốt được giá tạm tính nên chưa thể tìm thợ',
        409,
      )
    }
    rollbackStatus = job.status as JobStatus

    // Optimistic concurrency: only transition if status hasn't changed since the
    // fetch above. Prevents double-tap from creating two broadcast batches.
    const { data: updated, error: updateErr } = await withDbTimeout(
      auth.supabase
        .from('jobs')
        .update({
          status: 'broadcasting',
          broadcast_at: now,
          confirmed_search_at: now,
          final_price: lockedFinalPrice,
        })
        .eq('id', id)
        .eq('customer_id', auth.user.id)
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
  }

  const broadcastResult = await createBroadcasts(
    auth.supabase,
    id,
    job.service_type,
    district,
  )

  if (!broadcastResult.success) {
    if (broadcastResult.reasonCode === 'DB_ERROR') {
      if (rollbackStatus) {
        const rolledBack = await rollbackFailedBroadcastStart(
          auth.supabase,
          id,
          auth.user.id,
          rollbackStatus,
        )
        if (!rolledBack) {
          return apiError('DB_ERROR', 'Không thể khôi phục yêu cầu sau lỗi gửi thợ', 500)
        }
        await logJobEvent(
          auth.supabase,
          id,
          'broadcast_start_failed',
          { id: auth.user.id, role: 'customer' },
          'broadcasting',
          rollbackStatus,
          { reason: broadcastResult.reason },
        )
      }
      return apiError('DB_ERROR', 'Không thể gửi yêu cầu đến thợ', 500)
    }

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
      broadcast_sent: false,
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
    broadcast_sent: true,
    worker: null,
    message: `Đã gửi yêu cầu đến ${broadcastResult.broadcastCount} thợ. Đang chờ phản hồi.`,
  })
}

async function rollbackFailedBroadcastStart(
  supabase: { from: (table: 'jobs') => unknown },
  jobId: string,
  customerId: string,
  previousStatus: JobStatus,
): Promise<boolean> {
  const query = supabase.from('jobs') as {
    update(value: unknown): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): {
          eq(column: string, value: unknown): {
            select(columns: string): {
              maybeSingle(): PromiseLike<{
                data: { id: string } | null
                error: { code?: string } | null
              }>
            }
          }
        }
      }
    }
  }
  const { data, error } = await withDbTimeout(
    query
      .update({
        status: previousStatus,
        broadcast_at: null,
        confirmed_search_at: null,
      })
      .eq('id', jobId)
      .eq('customer_id', customerId)
      .eq('status', 'broadcasting')
      .select('id')
      .maybeSingle(),
  )
  return !error && Boolean(data)
}

async function acquireBroadcastRetryLease(
  supabase: { from: (table: 'jobs') => unknown },
  jobId: string,
  customerId: string,
  nowIso: string,
): Promise<
  | { success: true }
  | { success: false; error: string; code: string; status: number }
> {
  const guardIso = new Date(Date.parse(nowIso) - 1_000).toISOString()
  const query = supabase.from('jobs') as {
    update(value: unknown): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): {
          eq(column: string, value: unknown): {
            or(filter: string): {
              select(columns: string): {
                maybeSingle(): PromiseLike<{
                  data: { id: string } | null
                  error: { code?: string } | null
                }>
              }
            }
          }
        }
      }
    }
  }
  const { data, error } = await withDbTimeout(
    query
      .update({ broadcast_at: nowIso, confirmed_search_at: nowIso })
      .eq('id', jobId)
      .eq('customer_id', customerId)
      .eq('status', 'broadcasting')
      .or(`broadcast_at.is.null,broadcast_at.lte.${guardIso}`)
      .select('id')
      .maybeSingle(),
  )
  if (error) {
    return { success: false, error: 'Không thể bắt đầu tìm thợ', code: 'DB_ERROR', status: 500 }
  }
  if (!data) {
    return {
      success: false,
      error: 'Yêu cầu đang được gửi đến thợ. Vui lòng chờ phản hồi hiện tại.',
      code: 'BROADCAST_ACTIVE',
      status: 409,
    }
  }
  return { success: true }
}
