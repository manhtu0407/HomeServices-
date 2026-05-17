import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, JobStatus } from '@home-services/shared'
import { withDbTimeout } from '@/lib/db/query'
import { logJobEvent } from './event-log'

export type AcceptResult =
  | {
      success: true
      jobId: string
      status: JobStatus
      fullAddress: {
        building: string | null
        unit: string | null
        floor: string | null
        district: string | null
      }
    }
  | { success: false; error: string; code: string; status: number }

export type DeclineResult =
  | { success: true; jobId: string }
  | { success: false; error: string; code: string; status: number }

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
    fullAddress: {
      building: row.address_building,
      unit: row.address_unit,
      floor: row.address_floor,
      district: row.address_district,
    },
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
      .select('id, status')
      .eq('job_id', jobId)
      .eq('worker_id', workerId)
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

  const { error: updateErr } = await withDbTimeout(
    supabase
      .from('job_broadcasts')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', broadcast.id),
  )

  if (updateErr) {
    console.warn('Decline: update failed', { jobId, workerId, errorCode: updateErr.code })
    return { success: false, error: 'Lỗi khi từ chối', code: 'DB_ERROR', status: 500 }
  }

  return { success: true, jobId }
}
