import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@home-services/shared'

export type EligibleWorker = {
  id: string
  full_name: string | null
  rating: number
  total_jobs: number
}

export type MatchResult =
  | { success: true; worker: EligibleWorker }
  | { success: false; reason: string }

export async function findAndMatchWorker(
  supabase: SupabaseClient<Database>,
  jobId: string,
  serviceType: string,
  district: string,
): Promise<MatchResult> {
  const eligible = await queryEligibleWorkers(supabase, serviceType, district)

  if (eligible.length === 0) {
    return { success: false, reason: 'Không tìm thấy thợ phù hợp trong khu vực' }
  }

  const worker = eligible[0]

  const { error: updateError } = await supabase
    .from('jobs')
    .update({
      worker_id: worker.id,
      matched_at: new Date().toISOString(),
      status: 'worker_matched' as const,
    })
    .eq('id', jobId)
    .eq('status', 'broadcasting')

  if (updateError) {
    return { success: false, reason: 'Lỗi khi gán thợ cho yêu cầu' }
  }

  const { error: broadcastError } = await supabase
    .from('job_broadcasts')
    .insert({
      job_id: jobId,
      worker_id: worker.id,
      status: 'accepted' as const,
      broadcast_at: new Date().toISOString(),
      responded_at: new Date().toISOString(),
    })

  if (broadcastError) {
    console.warn('Failed to insert broadcast record', {
      jobId,
      workerId: worker.id,
      errorCode: broadcastError.code,
    })
  }

  return { success: true, worker }
}

export async function queryEligibleWorkers(
  supabase: SupabaseClient<Database>,
  serviceType: string,
  district: string,
): Promise<EligibleWorker[]> {
  const { data: workerProfiles, error } = await supabase
    .from('worker_profiles')
    .select('id, rating, total_jobs, service_types, districts')
    .eq('is_approved', true)
    .eq('is_available', true)
    .eq('is_suspended', false)
    .contains('service_types', [serviceType])
    .contains('districts', [district])
    .order('rating', { ascending: false })
    .limit(20)

  if (error || !workerProfiles || workerProfiles.length === 0) {
    return []
  }

  const workerIds = workerProfiles.map((w) => w.id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', workerIds)

  const nameMap = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name]),
  )

  return workerProfiles.map((w) => ({
    id: w.id,
    full_name: nameMap.get(w.id) ?? null,
    rating: w.rating,
    total_jobs: w.total_jobs,
  }))
}
