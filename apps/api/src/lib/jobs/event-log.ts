import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, UserRole, JobStatus, TablesInsert } from '@home-services/shared'

type JobEventInsert = TablesInsert<'job_events'>

export type EventActor = {
  id: string
  role: UserRole
}

export async function logJobEvent(
  supabase: SupabaseClient<Database>,
  jobId: string,
  eventType: string,
  actor: EventActor,
  fromStatus: JobStatus | null = null,
  toStatus: JobStatus | null = null,
  metadata: Record<string, unknown> = {},
) {
  try {
    const { error } = await supabase.from('job_events').insert({
      job_id: jobId,
      event_type: eventType,
      actor_id: actor.id,
      actor_role: actor.role,
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
