import type { KaelChatProgress } from '@/lib/api-types'
import { kaelChatProgressService } from '@/lib/services'

const KAEL_PROGRESS_POLL_MS = 1000

/** The first state the server records for a run, shown before any poll returns. */
export function queuedKaelProgress(): KaelChatProgress {
  return {
    current_stage: 'intent_classification',
    progress: 0,
    status: 'queued',
    updated_at: new Date().toISOString(),
  }
}

/**
 * Polls the server-recorded Kael progress while a non-streaming request is in
 * flight. Returns a stop function; failures are ignored because the request
 * response stays the source of truth.
 */
export function startKaelProgressPolling({
  isCurrent,
  onProgress,
  sessionId,
}: {
  isCurrent: () => boolean
  onProgress: (progress: KaelChatProgress) => void
  sessionId: string
}) {
  let active = true
  void (async () => {
    while (active) {
      await new Promise((resolve) => setTimeout(resolve, KAEL_PROGRESS_POLL_MS))
      if (!active || !isCurrent()) return
      try {
        const snapshot = await kaelChatProgressService.get(sessionId)
        if (active && isCurrent() && snapshot.success && snapshot.data.progress) {
          onProgress(snapshot.data.progress)
        }
      } catch {
        continue
      }
    }
  })()
  return () => {
    active = false
  }
}
