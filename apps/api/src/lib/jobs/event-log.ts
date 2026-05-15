import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, UserRole, JobStatus, TablesInsert } from '@home-services/shared'

type JobEventInsert = TablesInsert<'job_events'>

export async function logJobEvent(
  supabase: SupabaseClient<Database>,
  jobId: string,
  eventType: string,
  actorId: string,
  actorRole: UserRole,
  fromStatus: JobStatus | null,
  toStatus: JobStatus | null,
  metadata: Record<string, unknown> = {},
) {
  try {
    const { error } = await supabase.from('job_events').insert({
      job_id: jobId,
      event_type: eventType,
      actor_id: actorId,
      actor_role: actorRole,
      from_status: fromStatus,
      to_status: toStatus,
      safe_metadata: metadata as JobEventInsert['safe_metadata'],
    })
    if (error) {
      console.warn('Failed to log job event', { jobId, eventType, errorCode: error.code })
    }
  } catch {
    console.warn('Job event logging failed', { jobId, eventType })
  }
}
