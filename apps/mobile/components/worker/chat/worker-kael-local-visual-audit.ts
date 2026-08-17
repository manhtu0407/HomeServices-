import type { WorkerKaelChatMode } from '@nestscout/shared'

import type { WorkerKaelChatResponse } from '@/lib/api-types'

export function createLocalVisualAuditWorkerConversation(
  workerId: string,
  mode: WorkerKaelChatMode,
  clientRequestId: string,
  jobId: string | null,
): WorkerKaelChatResponse {
  const timestamp = new Date().toISOString()
  return {
    session: {
      closed_at: null,
      id: `local-visual-audit-${clientRequestId}`,
      job_id: jobId,
      mode,
      worker_id: workerId,
      status: 'active',
      title: null,
      pinned_at: null,
      started_at: timestamp,
      total_turns: 0,
      progress: null,
    },
    turns: [],
  }
}
