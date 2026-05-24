// Phase 5.11 (plan §22.10.L, 2026-05-23): realtime subscription helper.
// Status: deferred wire-in. Phase 2.1 chat polling (8s interval) is in
// production and proven; the plan explicitly allows deferring full realtime
// until polling shows pain. This file exists so the future migration is a
// single helper swap rather than scattered subscription code.
//
// Use this as the seam when realtime is enabled. Until then, do NOT wire it
// up: it would add reconnect/race surface without proving the polling story
// is insufficient.

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
