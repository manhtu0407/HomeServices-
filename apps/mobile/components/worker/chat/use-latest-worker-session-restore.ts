import { useEffect, useRef } from 'react'

import type { WorkerKaelChatSession } from '@/lib/api-types'

type LatestWorkerSessionRestoreInput = {
  activeSessionId: string | null
  jobId: string | null
  openSession: (sessionId: string) => Promise<boolean>
  openingSessionId: string | null
  ownerKey: string
  sessions: WorkerKaelChatSession[]
  sessionsLoading: boolean
}

export function useLatestWorkerSessionRestore({
  activeSessionId,
  jobId,
  openSession,
  openingSessionId,
  ownerKey,
  sessions,
  sessionsLoading,
}: LatestWorkerSessionRestoreInput) {
  const openSessionRef = useRef(openSession)
  const restoredOwnerKeyRef = useRef<string | null>(null)
  openSessionRef.current = openSession

  useEffect(() => {
    if (!jobId || sessionsLoading || activeSessionId || openingSessionId || restoredOwnerKeyRef.current === ownerKey) return

    restoredOwnerKeyRef.current = ownerKey
    const activeSessions = sessions.filter((session) => session.status === 'active')
    const resumableSessions = activeSessions.length > 0 ? activeSessions : sessions
    const latestSession = resumableSessions.reduce<WorkerKaelChatSession | null>((latest, session) => (
      !latest || session.started_at > latest.started_at ? session : latest
    ), null)
    if (latestSession) void openSessionRef.current(latestSession.id)
  }, [activeSessionId, jobId, openingSessionId, ownerKey, sessions, sessionsLoading])
}
