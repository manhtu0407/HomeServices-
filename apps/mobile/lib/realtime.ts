// Realtime is the fast path for time-sensitive job, chat, and broadcast updates;
// polling remains the recovery path after a dropped socket. RLS scopes every
// subscription to the same participant boundary as REST reads. Callers treat a
// null handle as "stay on poll" when the client is unavailable.

import { supabase } from './supabase'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type RealtimeChannelHandle = {
  unsubscribe: () => Promise<string>
}

export function subscribeToJobMessages(
  jobId: string,
  onMessage: (payload: unknown) => void,
): RealtimeChannelHandle | null {
  if (!supabase || !UUID_PATTERN.test(jobId)) return null
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
  if (!supabase || !UUID_PATTERN.test(jobId)) return null
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

// Broadcasts are time-sensitive, but the callback still re-fetches the
// authoritative RLS-scoped list instead of trusting a realtime payload.
export function subscribeToWorkerBroadcasts(
  workerId: string,
  onChange: (payload: unknown) => void,
): RealtimeChannelHandle | null {
  if (!supabase || !UUID_PATTERN.test(workerId)) return null
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
