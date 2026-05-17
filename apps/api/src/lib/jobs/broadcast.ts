import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@home-services/shared'
import { withDbTimeout } from '@/lib/db/query'

export type EligibleWorker = {
  id: string
  rating: number
  total_jobs: number
}

export type CreateBroadcastsResult =
  | { success: true; batchId: string; broadcastCount: number; workerIds: string[] }
  | { success: false; reason: string }

export const DEFAULT_BROADCAST_EXPIRY_SEC = 60
export const DEFAULT_BROADCAST_BATCH_SIZE = 5

/**
 * Find eligible workers + create broadcast rows (status='sent') in a single batch.
 * Each broadcast has expires_at = now + expirySec seconds (default 60).
 *
 * Workers see incoming jobs via GET /workers/me/broadcasts; first to accept wins
 * via atomic transition of jobs.status from 'broadcasting' to 'worker_matched'.
 */
export async function createBroadcasts(
  supabase: SupabaseClient<Database>,
  jobId: string,
  serviceType: 'electrical' | 'plumbing',
  district: string,
  options: { batchSize?: number; expirySec?: number } = {},
): Promise<CreateBroadcastsResult> {
  const batchSize = options.batchSize ?? DEFAULT_BROADCAST_BATCH_SIZE
  const expirySec = options.expirySec ?? DEFAULT_BROADCAST_EXPIRY_SEC

  const eligible = await queryEligibleWorkers(supabase, serviceType, district, batchSize)

  if (eligible.length === 0) {
    return {
      success: false,
      reason: 'Không tìm thấy thợ phù hợp đang online trong khu vực',
    }
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + expirySec * 1000)
  const batchId = crypto.randomUUID()

  const rows = eligible.map((worker) => ({
    job_id: jobId,
    worker_id: worker.id,
    status: 'sent' as const,
    broadcast_at: now.toISOString(),
    sent_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    batch_id: batchId,
  }))

  const { error: insertErr } = await withDbTimeout(
    supabase.from('job_broadcasts').insert(rows),
  )

  if (insertErr) {
    console.warn('Broadcast: insert failed', {
      jobId,
      errorCode: insertErr.code,
      workerCount: eligible.length,
    })
    return { success: false, reason: 'Lỗi khi gửi yêu cầu đến thợ' }
  }

  return {
    success: true,
    batchId,
    broadcastCount: eligible.length,
    workerIds: eligible.map((w) => w.id),
  }
}

/**
 * Query approved, available, not-suspended workers who serve this service+district.
 * Ordered by rating descending so best workers see jobs first.
 */
export async function queryEligibleWorkers(
  supabase: SupabaseClient<Database>,
  serviceType: 'electrical' | 'plumbing',
  district: string,
  limit: number = DEFAULT_BROADCAST_BATCH_SIZE,
): Promise<EligibleWorker[]> {
  const { data, error } = await withDbTimeout(
    supabase
      .from('worker_profiles')
      .select('id, rating, total_jobs, service_types, districts')
      .eq('is_approved', true)
      .eq('is_available', true)
      .eq('is_suspended', false)
      .contains('service_types', [serviceType])
      .contains('districts', [district])
      .order('rating', { ascending: false })
      .limit(limit),
  )

  if (error || !data) return []

  return data.map((w) => ({
    id: w.id,
    rating: w.rating,
    total_jobs: w.total_jobs,
  }))
}

/**
 * Compute seconds remaining until a broadcast expires. Negative => already expired.
 * Returns null if expires_at is null (legacy rows).
 */
export function secondsRemaining(expiresAt: string | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null
  const diff = new Date(expiresAt).getTime() - now.getTime()
  return Math.max(0, Math.round(diff / 1000))
}
