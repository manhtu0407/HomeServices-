import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, JobStatus } from '@nestscout/shared'
import { withDbTimeout } from '@/lib/db/query'
import { logJobEvent } from './event-log'

export type AcceptResult =
  | {
      success: true
      jobId: string
      status: JobStatus
      candidateId: string
      awaitingCustomerConfirmation: true
      alreadyApplied: boolean
    }
  | { success: false; error: string; code: string; status: number }

export type DeclineResult =
  | { success: true; jobId: string }
  | { success: false; error: string; code: string; status: number }

function relatedJob(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return typeof value[0] === 'object' && value[0] !== null ? value[0] as Record<string, unknown> : null
  }
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

/**
 * Map error codes from PG RPC to HTTP-friendly responses + Vietnamese messages.
 */
function mapAcceptError(errorCode: string | null): {
  success: false
  error: string
  code: string
  status: number
} {
  switch (errorCode) {
    case 'NOT_FOUND':
      return { success: false, error: 'Yêu cầu này không dành cho bạn', code: 'NOT_FOUND', status: 404 }
    case 'BROADCAST_NOT_ACTIVE':
      return {
        success: false,
        error: 'Yêu cầu này đã được xử lý hoặc đã hết hạn',
        code: 'BROADCAST_NOT_ACTIVE',
        status: 409,
      }
    case 'EXPIRED':
      return { success: false, error: 'Yêu cầu đã hết hạn', code: 'EXPIRED', status: 410 }
    case 'ALREADY_TAKEN':
      return {
        success: false,
        error: 'Yêu cầu đã được thợ khác nhận trước',
        code: 'ALREADY_TAKEN',
        status: 409,
      }
    case 'WORKER_NOT_ELIGIBLE':
      return {
        success: false,
        error: 'Tài khoản thợ chưa đủ điều kiện nhận việc',
        code: 'WORKER_NOT_ELIGIBLE',
        status: 403,
      }
    default:
      return { success: false, error: 'Lỗi khi nhận yêu cầu', code: 'DB_ERROR', status: 500 }
  }
}

/**
 * B3 worker accept — atomic via `accept_broadcast_atomic` RPC.
 *
 * The PG function runs all writes (find broadcast, claim job, mark this
 * broadcast accepted, mark siblings reassigned) in a single transaction.
 * Replaces the previous JS-side flow which performed each write separately
 * and could leave orphan rows on partial fail.
 *
 * Race-safety: jobs status guard (`WHERE status='broadcasting'`) ensures only
 * one worker wins. Losers get ALREADY_TAKEN.
 *
 * If the RPC returns EXPIRED, this function also logs a `broadcast_expired`
 * event for operational visibility (preserved from the pre-RPC behavior).
 */
export async function acceptBroadcast(
  supabase: SupabaseClient<Database>,
  jobId: string,
  workerId: string,
): Promise<AcceptResult> {
  const { data, error } = await withDbTimeout(
    supabase.rpc('accept_broadcast_atomic', {
      p_job_id: jobId,
      p_worker_id: workerId,
    }),
  )

  if (error) {
    console.warn('Accept: RPC call failed', {
      jobId,
      workerId,
      errorCode: error.code,
    })
    return { success: false, error: 'Lỗi khi nhận yêu cầu', code: 'DB_ERROR', status: 500 }
  }

  const row = data?.[0]
  if (!row) {
    console.warn('Accept: RPC returned no row', { jobId, workerId })
    return { success: false, error: 'Lỗi khi nhận yêu cầu', code: 'DB_ERROR', status: 500 }
  }

  if (!row.ok) {
    // EXPIRED case: log for operational visibility (EXT14 preserved)
    if (row.error_code === 'EXPIRED') {
      await logJobEvent(
        supabase,
        jobId,
        'broadcast_expired',
        // The authenticated server route derives workerId; this is not client-owned authorization.
        // react-doctor-disable-next-line react-doctor/supabase-client-owned-authz-field
        { id: workerId, role: 'worker' },
        null,
        null,
        { reason: 'EXPIRED via RPC' },
      )
    }
    return mapAcceptError(row.error_code)
  }

  return {
    success: true,
    jobId,
    status: row.job_status as JobStatus,
    candidateId: row.candidate_id,
    awaitingCustomerConfirmation: true,
    alreadyApplied: row.already_applied,
  }
}

/**
 * B3 worker decline — single UPDATE, no atomic guarantee needed.
 * Kept as direct SQL (not RPC) because there's only one write.
 */
export async function declineBroadcast(
  supabase: SupabaseClient<Database>,
  jobId: string,
  workerId: string,
): Promise<DeclineResult> {
  const { data: broadcast, error } = await withDbTimeout(
    supabase
      .from('job_broadcasts')
      .select('id, status, expires_at, jobs(status)')
      .eq('job_id', jobId)
      .eq('worker_id', workerId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )

  if (error || !broadcast) {
    return { success: false, error: 'Yêu cầu này không dành cho bạn', code: 'NOT_FOUND', status: 404 }
  }

  if (broadcast.status !== 'sent') {
    return {
      success: false,
      error: 'Yêu cầu này đã được xử lý',
      code: 'BROADCAST_NOT_ACTIVE',
      status: 409,
    }
  }

  const parentJob = relatedJob((broadcast as { jobs?: unknown }).jobs)
  if (!parentJob || parentJob.status !== 'broadcasting') {
    return { success: false, error: 'Yêu cầu này đã được xử lý', code: 'BROADCAST_NOT_ACTIVE', status: 409 }
  }

  const now = new Date().toISOString()
  if (broadcast.expires_at && broadcast.expires_at <= now) {
    const { data: expiredRow, error: expiredErr } = await withDbTimeout(
      supabase
        .from('job_broadcasts')
        .update({ status: 'expired', responded_at: now })
        .eq('id', broadcast.id)
        .eq('status', 'sent')
        .select('id')
        .maybeSingle(),
    )
    if (expiredErr) {
      console.warn('Decline: expire update failed', { jobId, workerId, errorCode: expiredErr.code })
      return { success: false, error: 'Không thể cập nhật broadcast hết hạn', code: 'DB_ERROR', status: 500 }
    }
    if (!expiredRow) {
      return { success: false, error: 'Yêu cầu này đã được xử lý', code: 'BROADCAST_NOT_ACTIVE', status: 409 }
    }
    await logJobEvent(
      supabase,
      jobId,
      'broadcast_expired',
      { id: workerId, role: 'worker' },
      null,
      null,
      { reason: 'EXPIRED via decline' },
    )
    return { success: false, error: 'Yêu cầu đã hết hạn', code: 'EXPIRED', status: 410 }
  }

  const { data: updatedRow, error: updateErr } = await withDbTimeout(
    supabase
      .from('job_broadcasts')
      .update({ status: 'declined', responded_at: now })
      .eq('id', broadcast.id)
      .eq('status', 'sent')
      .select('id')
      .maybeSingle(),
  )

  if (updateErr) {
    console.warn('Decline: update failed', { jobId, workerId, errorCode: updateErr.code })
    return { success: false, error: 'Lỗi khi từ chối', code: 'DB_ERROR', status: 500 }
  }

  if (!updatedRow) {
    return { success: false, error: 'Yêu cầu này đã được xử lý', code: 'BROADCAST_NOT_ACTIVE', status: 409 }
  }

  return { success: true, jobId }
}
