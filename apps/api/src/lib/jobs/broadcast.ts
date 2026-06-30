import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeDistrict, type Database, type ServiceType } from '@nestscout/shared'
import { withDbTimeout } from '@/lib/db/query'

export type EligibleWorker = {
  id: string
  rating: number
  total_jobs: number
}

export type EligibleWorkerQueryResult =
  | { success: true; workers: EligibleWorker[] }
  | { success: false; reasonCode: 'DB_ERROR'; reason: string }

export type CreateBroadcastsResult =
  | { success: true; batchId: string; broadcastCount: number; workerIds: string[] }
  | { success: false; reasonCode: 'NO_WORKER' | 'DB_ERROR'; reason: string }

type BroadcastOptions = {
  batchSize?: number
  expirySec?: number
  excludeWorkerIds?: string[]
}

export const DEFAULT_BROADCAST_EXPIRY_SEC = 60
export const DEFAULT_BROADCAST_BATCH_SIZE = 5
const DEFAULT_CANDIDATE_POOL_SIZE = 50
const ACTIVE_WORKER_JOB_STATUSES = [
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'scope_change_pending',
  'completed_by_worker',
] as const

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
  serviceType: ServiceType,
  district: string,
  options: BroadcastOptions = {},
): Promise<CreateBroadcastsResult> {
  const batchSize = options.batchSize ?? DEFAULT_BROADCAST_BATCH_SIZE
  const expirySec = options.expirySec ?? DEFAULT_BROADCAST_EXPIRY_SEC

  const eligibleResult = await queryEligibleWorkers(supabase, serviceType, district, batchSize, {
    excludeWorkerIds: options.excludeWorkerIds,
  })
  if (!eligibleResult.success) {
    return {
      success: false,
      reasonCode: eligibleResult.reasonCode,
      reason: eligibleResult.reason,
    }
  }
  const eligible = eligibleResult.workers

  if (eligible.length === 0) {
    return {
      success: false,
      reasonCode: 'NO_WORKER',
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
    return {
      success: false,
      reasonCode: 'DB_ERROR',
      reason: 'Lỗi khi gửi yêu cầu đến thợ',
    }
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
  serviceType: ServiceType,
  district: string,
  limit: number = DEFAULT_BROADCAST_BATCH_SIZE,
  options: { excludeWorkerIds?: string[] } = {},
): Promise<EligibleWorkerQueryResult> {
  const candidateLimit = Math.max(limit, DEFAULT_CANDIDATE_POOL_SIZE)
  const districtCode = normalizeDistrict(district)
  const excludedWorkerIds = new Set(options.excludeWorkerIds ?? [])
  const { data, error } = await withDbTimeout(
    supabase
      .from('worker_profiles')
      .select('id, rating, total_jobs, service_types, districts')
      .eq('is_approved', true)
    .eq('is_available', true)
    .eq('is_suspended', false)
    .contains('service_types', [serviceType])
    .or(`districts.cs.{${districtCode}},districts.cs.{hcmc_all}`)
    .order('rating', { ascending: false })
      .limit(candidateLimit),
  )

  if (error) {
    console.warn('Broadcast: worker query failed', {
      serviceType,
      district: districtCode,
      errorCode: error.code,
    })
    return {
      success: false,
      reasonCode: 'DB_ERROR',
      reason: 'Lỗi khi tìm thợ phù hợp',
    }
  }
  if (!data) return { success: true, workers: [] }

  const candidates = data.filter((w) => !excludedWorkerIds.has(w.id))
  const candidateIds = candidates.map((w) => w.id)
  if (candidateIds.length === 0) return { success: true, workers: [] }

  const { data: activeJobs, error: activeErr } = await withDbTimeout(
    supabase
      .from('jobs')
      .select('worker_id')
      .in('worker_id', candidateIds)
      .in('status', [...ACTIVE_WORKER_JOB_STATUSES])
      .limit(candidateIds.length),
  )
  if (activeErr) {
    console.warn('Broadcast: active worker job query failed', {
      serviceType,
      district: districtCode,
      errorCode: activeErr.code,
    })
    return {
      success: false,
      reasonCode: 'DB_ERROR',
      reason: 'Lỗi khi tìm thợ phù hợp',
    }
  }

  const busyWorkerIds = new Set((activeJobs ?? []).flatMap((job) => job.worker_id ? [job.worker_id] : []))
  return {
    success: true,
    workers: candidates
      .filter((w) => !busyWorkerIds.has(w.id))
      .slice(0, limit)
      .map((w) => ({
        id: w.id,
        rating: w.rating,
        total_jobs: w.total_jobs,
      })),
  }
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
