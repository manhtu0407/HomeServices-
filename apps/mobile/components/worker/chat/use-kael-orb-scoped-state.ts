import { useCallback, useLayoutEffect, useMemo, useRef, useState, type SetStateAction } from 'react'
import type { WorkerKaelChatMode } from '@nestscout/shared'

import type { KaelChatProgress, WorkerKaelChatSession } from '@/lib/api-types'
import type { WorkerV5KaelOrbLocalTurn, WorkerV5KaelOrbMediaPreview } from './kael-orb-chat-model'

export type WorkerV5KaelOrbChatState = {
  activeSessionId: string | null
  busy: boolean
  creatingSession: boolean
  error: string | null
  mediaItems: WorkerV5KaelOrbMediaPreview[]
  openingSessionId: string | null
  pendingSessionIds: string[]
  progress: KaelChatProgress | null
  sessions: WorkerKaelChatSession[]
  sessionsError: string | null
  sessionsLoading: boolean
  turns: WorkerV5KaelOrbLocalTurn[]
}

export type WorkerV5KaelOrbChatOwner = {
  key: string
}

type WorkerV5KaelOrbStoredState = {
  owner: WorkerV5KaelOrbChatOwner
  state: WorkerV5KaelOrbChatState
}

type WorkerV5KaelOrbScopedStateOptions = {
  catalogKey: string | null
  catalogOwnerKey: string | null
  catalogReady: boolean
  catalogSessions: WorkerKaelChatSession[]
  jobId: string | null
  localVisualAuditSession: boolean
  mode: WorkerKaelChatMode
  ownerKey: string
  removedSessionIds: Set<string>
  workerId: string | null
}

export function useWorkerV5KaelOrbScopedState(options: WorkerV5KaelOrbScopedStateOptions) {
  const { ownerKey } = options
  const [stored, setStored] = useState<WorkerV5KaelOrbStoredState>(() => ({
    owner: { key: ownerKey },
    state: createState(options),
  }))
  let visibleStored = stored
  if (stored.owner.key !== ownerKey) {
    visibleStored = {
      owner: { key: ownerKey },
      state: createState(options),
    }
    setStored(visibleStored)
  }

  const owner = visibleStored.owner
  const activeOwnerRef = useRef(owner)
  useLayoutEffect(() => {
    activeOwnerRef.current = owner
  }, [owner])

  const setField = useCallback(<Key extends keyof WorkerV5KaelOrbChatState>(
    field: Key,
    action: SetStateAction<WorkerV5KaelOrbChatState[Key]>,
  ) => {
    setStored((current) => {
      if (current.owner !== owner || activeOwnerRef.current !== owner) return current
      const nextValue = resolveStateAction(current.state[field], action)
      if (Object.is(current.state[field], nextValue)) return current
      return {
        owner,
        state: { ...current.state, [field]: nextValue },
      }
    })
  }, [owner])

  const setActiveField = useCallback(<Key extends keyof WorkerV5KaelOrbChatState>(
    field: Key,
    action: SetStateAction<WorkerV5KaelOrbChatState[Key]>,
  ) => {
    setStored((current) => {
      if (current.owner !== activeOwnerRef.current) return current
      const nextValue = resolveStateAction(current.state[field], action)
      if (Object.is(current.state[field], nextValue)) return current
      return {
        owner: current.owner,
        state: { ...current.state, [field]: nextValue },
      }
    })
  }, [])

  const setters = useMemo(() => ({
    setActiveSessionId: (action: SetStateAction<WorkerV5KaelOrbChatState['activeSessionId']>) => setField('activeSessionId', action),
    setBusy: (action: SetStateAction<WorkerV5KaelOrbChatState['busy']>) => setField('busy', action),
    setCreatingSession: (action: SetStateAction<WorkerV5KaelOrbChatState['creatingSession']>) => setField('creatingSession', action),
    setError: (action: SetStateAction<WorkerV5KaelOrbChatState['error']>) => setField('error', action),
    setMediaItems: (action: SetStateAction<WorkerV5KaelOrbChatState['mediaItems']>) => setField('mediaItems', action),
    setOpeningSessionId: (action: SetStateAction<WorkerV5KaelOrbChatState['openingSessionId']>) => setField('openingSessionId', action),
    setPendingSessionIds: (action: SetStateAction<WorkerV5KaelOrbChatState['pendingSessionIds']>) => setField('pendingSessionIds', action),
    setProgress: (action: SetStateAction<WorkerV5KaelOrbChatState['progress']>) => setField('progress', action),
    setSessions: (action: SetStateAction<WorkerV5KaelOrbChatState['sessions']>) => setField('sessions', action),
    setSessionsError: (action: SetStateAction<WorkerV5KaelOrbChatState['sessionsError']>) => setField('sessionsError', action),
    setSessionsLoading: (action: SetStateAction<WorkerV5KaelOrbChatState['sessionsLoading']>) => setField('sessionsLoading', action),
    setTurns: (action: SetStateAction<WorkerV5KaelOrbChatState['turns']>) => setField('turns', action),
  }), [setField])

  return {
    activeOwnerRef,
    owner,
    setActiveField,
    ...setters,
    ...visibleStored.state,
  }
}

function createState({
  catalogKey,
  catalogOwnerKey,
  catalogReady,
  catalogSessions,
  jobId,
  localVisualAuditSession,
  mode,
  removedSessionIds,
  workerId,
}: WorkerV5KaelOrbScopedStateOptions): WorkerV5KaelOrbChatState {
  return {
    activeSessionId: null,
    busy: false,
    creatingSession: false,
    error: null,
    mediaItems: [],
    openingSessionId: null,
    pendingSessionIds: [],
    progress: null,
    sessions: jobId
      ? catalogSessions.filter((session) => (
          session.job_id === jobId
          && session.mode === mode
          && (localVisualAuditSession || session.worker_id === workerId)
          && !removedSessionIds.has(session.id)
        ))
      : [],
    sessionsError: null,
    sessionsLoading: Boolean(workerId && (
      catalogOwnerKey !== catalogKey || !catalogReady
    )),
    turns: [],
  }
}

function resolveStateAction<Value>(current: Value, action: SetStateAction<Value>) {
  return typeof action === 'function'
    ? (action as (value: Value) => Value)(current)
    : action
}
