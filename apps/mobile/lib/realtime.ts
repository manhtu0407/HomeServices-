// Phase 5.11 (plan §22.10.L, 2026-05-23): realtime subscription helper.
// Status: WIRED (Notes.md MAP PLAN Phase 2, 2026-06-13). Perceived-perf audit
// (kael-perf-agentic-hardening-audit §9) confirmed the polling story is
// insufficient on the active-job phase: customer timeline poll 15s (B-1),
// worker broadcast poll 20s vs a 60s accept window (B-2), chat no live delivery
// (H9-1). These helpers are now the live fast-path; polling remains as a
// reduced-interval fallback so a dropped socket still recovers.
//
// All target tables (jobs, chat_messages, job_broadcasts) are in the
// supabase_realtime publication and RLS-scoped to the participant
// (jobs/chat_messages via is_job_participant, job_broadcasts via
// auth.uid() = worker_id), so realtime respects the same access boundary as
// the REST reads. Returns null when the Supabase client is unconfigured; every
// caller treats null as "stay on poll".

import { supabase } from './supabase'

export type RealtimeChannelEvent =
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | '*'

export type RealtimeChannelHandle = {
  unsubscribe: () => Promise<string>
}

export function subscribeToJobMessages(
  jobId: string,
  onMessage: (payload: unknown) => void,
): RealtimeChannelHandle | null {
  if (!supabase) return null
  const channel = supabase
    .channel(`job-messages:${jobId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `job_id=eq.${jobId}`,
      },
      (payload) => onMessage(payload),
    )
    .subscribe()

  return {
    unsubscribe: async () => {
      const status = await supabase!.removeChannel(channel)
      return String(status)
    },
  }
}

export function subscribeToJobStatus(
  jobId: string,
  onUpdate: (payload: unknown) => void,
): RealtimeChannelHandle | null {
  if (!supabase) return null
  const channel = supabase
    .channel(`job-status:${jobId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${jobId}`,
      },
      (payload) => onUpdate(payload),
    )
    .subscribe()

  return {
    unsubscribe: async () => {
      const status = await supabase!.removeChannel(channel)
      return String(status)
    },
  }
}

// B-2 (Notes.md): surface incoming broadcasts to an available worker without
// waiting out the 20s poll inside a 60s accept window. RLS on job_broadcasts is
// `auth.uid() = worker_id`, so a worker only ever receives realtime rows that
// are already theirs to read. INSERT = a new broadcast arrived; UPDATE = an
// existing broadcast changed (e.g. reassigned/expired). The handler should
// re-fetch the authoritative broadcast list rather than trust the payload.
export function subscribeToWorkerBroadcasts(
  workerId: string,
  onChange: (payload: unknown) => void,
): RealtimeChannelHandle | null {
  if (!supabase) return null
  const channel = supabase
    .channel(`worker-broadcasts:${workerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'job_broadcasts',
        filter: `worker_id=eq.${workerId}`,
      },
      (payload) => onChange(payload),
    )
    .subscribe()

  return {
    unsubscribe: async () => {
      const status = await supabase!.removeChannel(channel)
      return String(status)
    },
  }
}
