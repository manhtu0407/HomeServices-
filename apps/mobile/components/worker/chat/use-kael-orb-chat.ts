import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { LocalDeal, WorkerKaelChatMode } from '@nestscout/shared'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerKaelChatResponse, WorkerKaelChatSession } from '@/lib/api-types'
import { useAuth } from '@/lib/auth-provider'
import { generateClientRequestId } from '@/lib/client-request-id'
import { localizeKaelConversationFailure } from '@/lib/kael-conversation-failure'
import { initialKaelReasoningReceiptState } from '@/lib/kael-reasoning-receipt'
import { workerKaelChatService } from '@/lib/services'
import { textByLanguage } from '../ui/format'
import { getWorkerV5ChatJobId } from '../ui/labels'
import {
  type WorkerV5KaelOrbSession, type WorkerV5KaelSessionListRequest,
  canUseWorkerV5KaelOrbSession,
  isWorkerV5KaelOrbReadOnly,
  PREFETCH_SESSION_LIMIT,
  reconcileWorkerV5KaelSessionCatalog,
  upsertWorkerV5KaelOrbSession,
  workerKaelSessionCatalogKey,
  workerKaelSessionMatchesScope,
  workerV5KaelAdvisoryUnavailableReply,
  workerV5KaelOrbTurnsFromResponse,
} from './kael-orb-chat-model'
import { pickWorkerKaelMedia } from './kael-orb-media-picker'
import { createWorkerKaelReasoningActions } from './kael-orb-reasoning-actions'
import { createWorkerKaelOrbSendAction } from './kael-orb-send-action'
import { readWorkerKaelSessionCatalog, writeWorkerKaelSessionCatalog } from './session-catalog-cache'
import { useWorkerV5KaelOrbScopedState } from './use-kael-orb-scoped-state'
import { useLatestWorkerSessionRestore } from './use-latest-worker-session-restore'
import { createLocalVisualAuditWorkerConversation } from './worker-kael-local-visual-audit'

export function useWorkerV5KaelOrbChat(
  deal: LocalDeal | null,
  language: AppLanguage,
  mode: WorkerKaelChatMode,
  _workerJobsHydrated?: boolean,
) {
  const { session: authSession } = useAuth()
  const workerId = authSession?.user.id ?? null
  const localVisualAuditSession = authSession?.user.app_metadata?.provider === 'local-visual-audit'
  const jobId = getWorkerV5ChatJobId(deal)
  const readOnly = isWorkerV5KaelOrbReadOnly(deal)
  const sessionJobId = mode === 'intake' && canUseWorkerV5KaelOrbSession(deal) ? jobId : null
  const hasJobKaelSessionAccess = Boolean(sessionJobId) && canUseWorkerV5KaelOrbSession(deal) && !readOnly
  const canUseKaelSession = Boolean(workerId) && (mode === 'normal' || hasJobKaelSessionAccess)
  const activeWorkerIdRef = useRef<string | null>(workerId)
  const activeModeRef = useRef<WorkerKaelChatMode>(mode)
  const localVisualAuditSessionRef = useRef(localVisualAuditSession)
  const activeJobIdRef = useRef<string | null>(sessionJobId)
  const sessionRef = useRef<WorkerV5KaelOrbSession | null>(null)
  const sessionCacheRef = useRef(new Map<string, WorkerKaelChatResponse>())
  const sessionLoadPromiseRef = useRef(new Map<string, Promise<WorkerKaelChatResponse | null>>())
  const sessionLoadFailureRef = useRef(new Map<string, { code: string; status: number; meta?: { supportCode?: string | null } }>())
  const removedSessionIdsRef = useRef(new Set<string>())
  const locallyCreatedSessionIdsRef = useRef(new Set<string>())
  const locallyUpdatedSessionIdsRef = useRef(new Set<string>())
  const pendingSessionIdsRef = useRef<string[]>([])
  const sessionCatalogRef = useRef<WorkerKaelChatSession[]>([])
  const sessionCatalogReadyRef = useRef(false)
  const sessionCatalogNetworkKeyRef = useRef<string | null>(null)
  const catalogKey = workerId ? workerKaelSessionCatalogKey(workerId, mode) : null
  const sessionCatalogOwnerKeyRef = useRef<string | null>(catalogKey)
  const openRequestRef = useRef(0)
  const sendRequestRef = useRef(0)
  const sessionListRequestRef = useRef<WorkerV5KaelSessionListRequest | null>(null)
  const ownerKey = JSON.stringify([workerId, sessionJobId, mode, localVisualAuditSession])
  const {
    activeOwnerRef, owner, setActiveField,
    activeSessionId, busy, creatingSession, error, mediaItems, openingSessionId,
    pendingSessionIds, progress, reasoningReceipt, sessions, sessionsError, streamingReply,
    setActiveSessionId, setBusy, setCreatingSession, setError, setMediaItems,
    setOpeningSessionId, setPendingSessionIds, setProgress, setSessions,
    setReasoningReceipt, setSessionsError, setStreamingReply, setTurns, sessionsLoading, turns,
  } = useWorkerV5KaelOrbScopedState({
    catalogKey,
    jobId: sessionJobId, localVisualAuditSession, mode, ownerKey,
    workerId,
  })
  useLayoutEffect(() => {
    activeWorkerIdRef.current = workerId
    activeModeRef.current = mode
    localVisualAuditSessionRef.current = localVisualAuditSession
    activeJobIdRef.current = sessionJobId
    pendingSessionIdsRef.current = pendingSessionIds
  }, [localVisualAuditSession, mode, pendingSessionIds, sessionJobId, workerId])
  const advisoryUnavailableReply = workerV5KaelAdvisoryUnavailableReply(readOnly, language)
  const progressPercent = progress ? Math.max(0, Math.min(100, Math.round(progress.progress * 100))) : null
  const busyLabel = openingSessionId || creatingSession ? textByLanguage(language, 'Đang mở cuộc trò chuyện...', 'Opening conversation...')
    : busy ? textByLanguage(language, `Kael đang xử lý...${progressPercent != null ? ` ${progressPercent}%` : ''}`, `Kael is working...${progressPercent != null ? ` ${progressPercent}%` : ''}`) : null
  const reasoningActions = createWorkerKaelReasoningActions(
    setReasoningReceipt,
    (action) => setActiveField('reasoningReceipt', action),
  )
  const setSessionPending = (sessionId: string, pending: boolean) => {
    setPendingSessionIds((current) => {
      const next = pending ? (current.includes(sessionId) ? current : [...current, sessionId]) : current.filter((id) => id !== sessionId)
      pendingSessionIdsRef.current = next
      return next
    })
  }
  const persistSessionCatalog = useCallback((nextCatalog: WorkerKaelChatSession[]) => {
    const requestedWorkerId = activeWorkerIdRef.current
    const requestedMode = activeModeRef.current
    if (!requestedWorkerId) return
    const catalogOwnerId = localVisualAuditSessionRef.current ? sessionCatalogRef.current[0]?.worker_id ?? nextCatalog[0]?.worker_id ?? null : requestedWorkerId
    const scopedCatalog = catalogOwnerId
      ? nextCatalog.filter((session) => (
          session.worker_id === catalogOwnerId && session.mode === requestedMode
        ))
      : []
    sessionCatalogRef.current = scopedCatalog
    sessionCatalogOwnerKeyRef.current = workerKaelSessionCatalogKey(requestedWorkerId, requestedMode)
    sessionCatalogReadyRef.current = true
    if (!localVisualAuditSessionRef.current) {
      void writeWorkerKaelSessionCatalog(requestedWorkerId, requestedMode, scopedCatalog)
    }
  }, [])
  const commitSessionSummary = (nextSession: WorkerKaelChatSession) => {
    const requestedWorkerId = activeWorkerIdRef.current
    if (!requestedWorkerId) return
    if (nextSession.mode !== activeModeRef.current) return
    const currentCatalogOwnerId = sessionCatalogRef.current[0]?.worker_id ?? null
    if (localVisualAuditSessionRef.current) {
      if (currentCatalogOwnerId && nextSession.worker_id !== currentCatalogOwnerId) return
    } else if (nextSession.worker_id !== requestedWorkerId) {
      return
    }
    persistSessionCatalog(upsertWorkerV5KaelOrbSession(sessionCatalogRef.current, nextSession))
    if (activeJobIdRef.current === nextSession.job_id) {
      setSessions((current) => upsertWorkerV5KaelOrbSession(current, nextSession))
    }
  }
  const removeSessionSummary = (sessionId: string) => {
    persistSessionCatalog(sessionCatalogRef.current.filter((session) => session.id !== sessionId))
    setSessions((current) => current.filter((session) => session.id !== sessionId))
  }

  const cacheSessionResponse = (response: WorkerKaelChatResponse) => {
    if (!removedSessionIdsRef.current.has(response.session.id)) {
      sessionCacheRef.current.set(response.session.id, response)
    }
  }

  const activateWorkerV5KaelOrbSession = ({
    session,
    turns: nextTurns,
  }: WorkerKaelChatResponse) => {
    const currentJobId = sessionJobId
    const currentMode = mode
    if (
      activeOwnerRef.current !== owner
      || !workerKaelSessionMatchesScope(session, currentJobId, currentMode)
      || activeJobIdRef.current !== currentJobId
      || activeModeRef.current !== currentMode
    ) return false
    const response = { session, turns: nextTurns }
    cacheSessionResponse(response)
    sessionRef.current = { jobId: currentJobId, mode: currentMode, sessionId: session.id }
    setActiveSessionId(session.id)
    setProgress(session.progress)
    setTurns(workerV5KaelOrbTurnsFromResponse(nextTurns))
    setMediaItems([])
    commitSessionSummary(session)
    setError(null)
    return true
  }

  const loadSessionResponse = useCallback((sessionId: string, requestedJobId: string | null) => {
    const requestedMode = activeModeRef.current
    const requestedOwner = activeOwnerRef.current
    const cached = sessionCacheRef.current.get(sessionId)
    if (cached) return Promise.resolve(cached)
    const inFlight = sessionLoadPromiseRef.current.get(sessionId)
    if (inFlight) return inFlight

    sessionLoadFailureRef.current.delete(sessionId)
    const requestEntry: { promise: Promise<WorkerKaelChatResponse | null> } = {
      promise: Promise.resolve(null),
    }
    requestEntry.promise = workerKaelChatService.get(sessionId).then((loaded) => {
      if (!loaded.success) {
        sessionLoadFailureRef.current.set(sessionId, loaded)
        return null
      }
      if (
        loaded.data.session.job_id !== requestedJobId
        || loaded.data.session.mode !== requestedMode
        || activeOwnerRef.current !== requestedOwner
        || activeJobIdRef.current !== requestedJobId
        || activeModeRef.current !== requestedMode
        || removedSessionIdsRef.current.has(sessionId)
      ) return null
      sessionCacheRef.current.set(sessionId, loaded.data)
      sessionLoadFailureRef.current.delete(sessionId)
      return loaded.data
    }).catch(() => {
      sessionLoadFailureRef.current.set(sessionId, { code: 'NETWORK_ERROR', status: 0 })
      return null
    }).finally(() => {
      if (sessionLoadPromiseRef.current.get(sessionId) === requestEntry.promise) {
        sessionLoadPromiseRef.current.delete(sessionId)
      }
    })
    sessionLoadPromiseRef.current.set(sessionId, requestEntry.promise)
    return requestEntry.promise
  }, [activeOwnerRef])

  const prefetchSessions = useCallback((nextSessions: WorkerKaelChatSession[], requestedJobId: string | null) => {
    for (const session of nextSessions.slice(0, PREFETCH_SESSION_LIMIT)) {
      if (
        sessionCacheRef.current.has(session.id)
        || removedSessionIdsRef.current.has(session.id)
      ) continue
      void loadSessionResponse(session.id, requestedJobId)
    }
  }, [loadSessionResponse])

  useEffect(() => {
    removedSessionIdsRef.current.clear()
    locallyCreatedSessionIdsRef.current.clear()
    locallyUpdatedSessionIdsRef.current.clear()
    sessionCatalogRef.current = []
    sessionCatalogReadyRef.current = false
    sessionCatalogNetworkKeyRef.current = null
    sessionListRequestRef.current = null
    sessionCatalogOwnerKeyRef.current = catalogKey

    if (!workerId || localVisualAuditSession) return
    const requestedCatalogKey = workerKaelSessionCatalogKey(workerId, mode)
    let cancelled = false
    void readWorkerKaelSessionCatalog(workerId, mode).then((cachedCatalog) => {
      if (
        cancelled
        || cachedCatalog === null
        || activeWorkerIdRef.current !== workerId
        || activeModeRef.current !== mode
        || sessionCatalogNetworkKeyRef.current === requestedCatalogKey
      ) return
      sessionCatalogRef.current = cachedCatalog
      sessionCatalogReadyRef.current = true
      const currentJobId = activeJobIdRef.current
      setActiveField('sessions', cachedCatalog.filter((session) =>
        workerKaelSessionMatchesScope(session, currentJobId, mode)
        && !removedSessionIdsRef.current.has(session.id)
      ))
      setActiveField('sessionsLoading', false)
    })
    return () => {
      cancelled = true
    }
  }, [catalogKey, localVisualAuditSession, mode, setActiveField, workerId])

  useEffect(() => {
    openRequestRef.current += 1
    sendRequestRef.current += 1
    sessionCacheRef.current.clear()
    sessionLoadPromiseRef.current.clear()
    sessionLoadFailureRef.current.clear()
    pendingSessionIdsRef.current = []
    sessionRef.current = null

    if (
      workerId
      && sessionCatalogNetworkKeyRef.current === workerKaelSessionCatalogKey(workerId, mode)
    ) {
      prefetchSessions(
        sessionCatalogRef.current.filter((session) =>
          workerKaelSessionMatchesScope(session, sessionJobId, mode)
        ),
        sessionJobId,
      )
    }
  }, [mode, prefetchSessions, sessionJobId, workerId])

  const refreshSessions = useCallback((): Promise<void> => {
    const requestedWorkerId = workerId
    if (!requestedWorkerId) return Promise.resolve()
    const requestedMode = mode
    const catalogKey = workerKaelSessionCatalogKey(requestedWorkerId, requestedMode)
    if (localVisualAuditSession) {
      const localSessions = sessionCatalogRef.current.filter((session) => (
        workerKaelSessionMatchesScope(session, activeJobIdRef.current, requestedMode)
      ))
      sessionCatalogNetworkKeyRef.current = catalogKey
      sessionCatalogReadyRef.current = true
      setActiveField('sessions', localSessions)
      setActiveField('sessionsError', null)
      setActiveField('sessionsLoading', false)
      return Promise.resolve()
    }
    if (sessionCatalogNetworkKeyRef.current === catalogKey) return Promise.resolve()
    const inFlightRequest = sessionListRequestRef.current
    if (inFlightRequest?.catalogKey === catalogKey) return inFlightRequest.promise

    const needsBlockingLoader = !sessionCatalogReadyRef.current
    if (needsBlockingLoader) setActiveField('sessionsLoading', true)
    setActiveField('sessionsError', null)

    const request: WorkerV5KaelSessionListRequest = {
      catalogKey,
      promise: Promise.resolve(),
    }
    request.promise = (async () => {
      try {
        const listed = await workerKaelChatService.list(requestedMode)
        if (!listed.success) {
          if (
            activeWorkerIdRef.current === requestedWorkerId
            && activeModeRef.current === requestedMode
            && !sessionCatalogReadyRef.current
          ) {
            setActiveField('sessionsError', localizeKaelConversationFailure(
              listed,
              language,
              textByLanguage(language, 'Chưa tải được các cuộc trò chuyện Kael. Vui lòng thử lại.', 'Kael conversations could not be loaded. Please try again.'),
            ))
          }
          return
        }
        if (
          activeWorkerIdRef.current !== requestedWorkerId
          || activeModeRef.current !== requestedMode
        ) return
        const nextCatalog = reconcileWorkerV5KaelSessionCatalog(
          listed.data.sessions,
          sessionCatalogRef.current,
          requestedWorkerId,
          requestedMode,
          locallyCreatedSessionIdsRef.current,
          locallyUpdatedSessionIdsRef.current,
          pendingSessionIdsRef.current,
          removedSessionIdsRef.current,
          localVisualAuditSessionRef.current,
        )
        sessionCatalogNetworkKeyRef.current = catalogKey
        persistSessionCatalog(nextCatalog)

        const currentJobId = activeJobIdRef.current
        const matchingSessions = nextCatalog.filter((session) =>
          workerKaelSessionMatchesScope(session, currentJobId, requestedMode)
        )
        setActiveField('sessions', matchingSessions)
        prefetchSessions(matchingSessions, currentJobId)
      } catch {
        if (
          activeWorkerIdRef.current === requestedWorkerId
          && activeModeRef.current === requestedMode
          && !sessionCatalogReadyRef.current
        ) {
          setActiveField('sessionsError', textByLanguage(language, 'Chưa tải được các cuộc trò chuyện Kael. Vui lòng thử lại.', 'Kael conversations could not be loaded. Please try again.'))
        }
      } finally {
        if (sessionListRequestRef.current === request) sessionListRequestRef.current = null
        if (
          activeWorkerIdRef.current === requestedWorkerId
          && activeModeRef.current === requestedMode
        ) {
          setActiveField('sessionsLoading', false)
        }
      }
    })()
    sessionListRequestRef.current = request
    return request.promise
  }, [language, localVisualAuditSession, mode, persistSessionCatalog, prefetchSessions, setActiveField, workerId])

  useEffect(() => {
    if (!workerId) return
    void refreshSessions()
  }, [refreshSessions, workerId])

  const startNewSession = async (): Promise<boolean> => {
    const requestedWorkerId = workerId
    const requestedJobId = sessionJobId
    const requestedMode = mode
    const requestedOwner = owner
    if (!requestedWorkerId || !canUseKaelSession || busy || creatingSession || openingSessionId) {
      setSessionsError(textByLanguage(language, 'Chưa thể tạo cuộc trò chuyện này.', 'This conversation cannot be created right now.'))
      return false
    }
    reasoningActions.reset()
    const requestId = openRequestRef.current + 1
    openRequestRef.current = requestId
    setCreatingSession(true)
    setSessionsError(null)
    try {
      const clientRequestId = generateClientRequestId()
      const created = localVisualAuditSession
        ? {
            data: createLocalVisualAuditWorkerConversation(
              requestedWorkerId,
              requestedMode,
              clientRequestId,
              requestedJobId,
            ),
            status: 201,
            success: true as const,
          }
        : await workerKaelChatService.create({
          client_request_id: clientRequestId,
          language,
          mode: requestedMode,
          ...(requestedJobId ? { job_id: requestedJobId } : {}),
        })
      if (
        openRequestRef.current !== requestId
        || activeOwnerRef.current !== requestedOwner
        || activeModeRef.current !== requestedMode
      ) return false
      if (!created.success) {
        setSessionsError(localizeKaelConversationFailure(
          created,
          language,
          textByLanguage(language, 'Chưa thể tạo cuộc trò chuyện Kael mới. Vui lòng thử lại.', 'A new Kael conversation could not be created. Please try again.'),
        ))
        return false
      }
      if (
        created.data.session.job_id !== requestedJobId
        || created.data.session.mode !== requestedMode
        || activeJobIdRef.current !== requestedJobId
        || activeModeRef.current !== requestedMode
      ) {
        setSessionsError(textByLanguage(language, 'Kael bỏ qua cuộc trò chuyện không khớp với công việc hiện tại.', 'Kael ignored a conversation that did not match the current work.'))
        return false
      }
      locallyCreatedSessionIdsRef.current.add(created.data.session.id)
      return activateWorkerV5KaelOrbSession(created.data)
    } catch {
      setSessionsError(textByLanguage(language, 'Chưa thể tạo cuộc trò chuyện Kael mới. Vui lòng thử lại.', 'A new Kael conversation could not be created. Please try again.'))
      return false
    } finally {
      if (
        activeJobIdRef.current === requestedJobId
        && activeModeRef.current === requestedMode
      ) setCreatingSession(false)
    }
  }

  const openSession = async (sessionId: string): Promise<boolean> => {
    const requestedJobId = sessionJobId
    const requestedMode = mode
    const requestedOwner = owner
    if (!canUseKaelSession || busy || removedSessionIdsRef.current.has(sessionId)) return false
    const requestId = openRequestRef.current + 1
    openRequestRef.current = requestId
    setSessionsError(null)
    reasoningActions.reset()
    const cached = sessionCacheRef.current.get(sessionId)
    if (cached) {
      setOpeningSessionId(null)
      return activateWorkerV5KaelOrbSession(cached)
    }
    setOpeningSessionId(sessionId)
    try {
      const loaded = await loadSessionResponse(sessionId, requestedJobId)
      if (
        openRequestRef.current !== requestId
        || activeOwnerRef.current !== requestedOwner
        || activeModeRef.current !== requestedMode
      ) return false
      if (!loaded) {
        const failure = sessionLoadFailureRef.current.get(sessionId)
        setSessionsError(failure
          ? localizeKaelConversationFailure(
              failure,
              language,
              textByLanguage(language, 'Chưa thể mở cuộc trò chuyện này. Vui lòng thử lại.', 'This Kael conversation could not be opened. Please try again.'),
            )
          : textByLanguage(language, 'Chưa thể mở cuộc trò chuyện này. Vui lòng thử lại.', 'This Kael conversation could not be opened. Please try again.'))
        return false
      }
      if (
        loaded.session.job_id !== requestedJobId
        || loaded.session.mode !== requestedMode
        || activeJobIdRef.current !== requestedJobId
        || activeModeRef.current !== requestedMode
      ) {
        setSessionsError(textByLanguage(language, 'Kael bỏ qua cuộc trò chuyện không khớp với công việc hiện tại.', 'Kael ignored a conversation that did not match the current work.'))
        return false
      }
      return activateWorkerV5KaelOrbSession(loaded)
    } catch {
      if (openRequestRef.current === requestId) {
        setSessionsError(textByLanguage(language, 'Chưa thể mở cuộc trò chuyện này. Vui lòng thử lại.', 'This Kael conversation could not be opened. Please try again.'))
      }
      return false
    } finally {
      if (
        openRequestRef.current === requestId
        && activeJobIdRef.current === requestedJobId
        && activeModeRef.current === requestedMode
      ) {
        setOpeningSessionId(null)
      }
    }
  }

  useLatestWorkerSessionRestore({ activeSessionId, jobId: sessionJobId, openSession, openingSessionId, ownerKey, sessions, sessionsLoading })

  const resetToNewSession = useCallback(() => {
    openRequestRef.current += 1
    sendRequestRef.current += 1
    sessionRef.current = null
    setActiveField('activeSessionId', null)
    setActiveField('openingSessionId', null)
    setActiveField('progress', null)
    setActiveField('busy', false)
    setActiveField('reasoningReceipt', initialKaelReasoningReceiptState)
    setActiveField('streamingReply', null)
    setActiveField('turns', [])
    setActiveField('mediaItems', [])
    setActiveField('error', null)
  }, [setActiveField])

  const settleStreamingReply = useCallback((responseId: string) => {
    setStreamingReply((current) => current?.responseId === responseId ? null : current)
  }, [setStreamingReply])

  const archiveSession = async (sessionId: string): Promise<boolean> => {
    const requestedJobId = sessionJobId
    const requestedMode = mode
    const requestedOwner = owner
    const targetSession = sessions.find((session) => session.id === sessionId)
    if (
      !targetSession
      || !workerKaelSessionMatchesScope(targetSession, requestedJobId, requestedMode)
    ) return false
    const cached = sessionCacheRef.current.get(sessionId)
    const wasActive = sessionRef.current?.sessionId === sessionId
    removedSessionIdsRef.current.add(sessionId)
    sessionCacheRef.current.delete(sessionId)
    setSessionPending(sessionId, true)
    setSessionsError(null)
    removeSessionSummary(sessionId)
    if (wasActive) resetToNewSession()
    let failureMessage = textByLanguage(language, 'Chưa thể xóa cuộc trò chuyện khỏi danh sách. Vui lòng thử lại.', 'This conversation could not be removed from your list. Please try again.')
    try {
      if (localVisualAuditSessionRef.current) {
        if (activeOwnerRef.current !== requestedOwner) return true
        locallyCreatedSessionIdsRef.current.delete(sessionId)
        locallyUpdatedSessionIdsRef.current.delete(sessionId)
        return true
      }
      const archived = await workerKaelChatService.archive(sessionId)
      if (!archived.success) {
        failureMessage = localizeKaelConversationFailure(archived, language, failureMessage)
        throw new Error('archive_failed')
      }
      if (activeOwnerRef.current !== requestedOwner) return true
      locallyCreatedSessionIdsRef.current.delete(sessionId)
      locallyUpdatedSessionIdsRef.current.delete(sessionId)
      return true
    } catch {
      if (
        activeOwnerRef.current === requestedOwner
        && activeJobIdRef.current === requestedJobId
        && activeModeRef.current === requestedMode
      ) {
        removedSessionIdsRef.current.delete(sessionId)
        commitSessionSummary(targetSession)
        if (cached) cacheSessionResponse(cached)
        if (wasActive && cached) activateWorkerV5KaelOrbSession(cached)
        setSessionsError(failureMessage)
      }
      return false
    } finally {
      setSessionPending(sessionId, false)
    }
  }

  const archiveActiveSession = async (): Promise<boolean> => {
    const currentSessionId = sessionRef.current?.sessionId
    return currentSessionId ? archiveSession(currentSessionId) : false
  }

  const renameSession = async (sessionId: string, title: string): Promise<boolean> => {
    const requestedJobId = sessionJobId
    const requestedMode = mode
    const requestedOwner = owner
    const targetSession = sessions.find((session) => session.id === sessionId)
    const trimmedTitle = title.trim()
    if (
      !targetSession
      || !workerKaelSessionMatchesScope(targetSession, requestedJobId, requestedMode)
      || !trimmedTitle
    ) return false
    const optimisticSession = { ...targetSession, title: trimmedTitle }
    if (!localVisualAuditSessionRef.current) locallyUpdatedSessionIdsRef.current.add(sessionId)
    setSessionPending(sessionId, true)
    setSessionsError(null)
    applySessionUpdate(optimisticSession)
    let failureMessage = textByLanguage(language, 'Chưa thể đổi tên cuộc trò chuyện. Tên cũ đã được khôi phục.', 'This conversation could not be renamed. Its previous name was restored.')
    try {
      if (localVisualAuditSessionRef.current) return true
      const renamed = await workerKaelChatService.rename(sessionId, { title: trimmedTitle })
      if (
        !renamed.success
        || !workerKaelSessionMatchesScope(renamed.data.session, requestedJobId, requestedMode)
      ) {
        if (!renamed.success) failureMessage = localizeKaelConversationFailure(renamed, language, failureMessage)
        throw new Error('rename_failed')
      }
      if (
        activeOwnerRef.current !== requestedOwner || activeJobIdRef.current !== requestedJobId
        || activeModeRef.current !== requestedMode
      ) return true
      cacheSessionResponse(renamed.data)
      commitSessionSummary(renamed.data.session)
      return true
    } catch {
      if (
        activeOwnerRef.current === requestedOwner
        && activeJobIdRef.current === requestedJobId
        && activeModeRef.current === requestedMode
      ) {
        locallyUpdatedSessionIdsRef.current.delete(sessionId)
        applySessionUpdate(targetSession)
        setSessionsError(failureMessage)
      }
      return false
    } finally {
      setSessionPending(sessionId, false)
    }
  }

  const setSessionPinned = async (sessionId: string, pinned: boolean): Promise<boolean> => {
    const requestedJobId = sessionJobId
    const requestedMode = mode
    const requestedOwner = owner
    const targetSession = sessions.find((session) => session.id === sessionId)
    if (
      !targetSession
      || !workerKaelSessionMatchesScope(targetSession, requestedJobId, requestedMode)
    ) return false
    const optimisticSession = {
      ...targetSession,
      pinned_at: pinned ? new Date().toISOString() : null,
    }
    if (!localVisualAuditSessionRef.current) locallyUpdatedSessionIdsRef.current.add(sessionId)
    setSessionPending(sessionId, true)
    setSessionsError(null)
    applySessionUpdate(optimisticSession)
    let failureMessage = textByLanguage(language, 'Chưa thể đổi trạng thái ghim. Trạng thái cũ đã được khôi phục.', 'The pin state could not be changed. Its previous state was restored.')
    try {
      if (localVisualAuditSessionRef.current) return true
      const updated = await workerKaelChatService.setPinned(sessionId, { pinned })
      if (
        !updated.success
        || updated.data.session.job_id !== requestedJobId
        || updated.data.session.mode !== requestedMode
      ) {
        if (!updated.success) failureMessage = localizeKaelConversationFailure(updated, language, failureMessage)
        throw new Error('pin_failed')
      }
      if (
        activeOwnerRef.current !== requestedOwner || activeJobIdRef.current !== requestedJobId
        || activeModeRef.current !== requestedMode
      ) return true
      cacheSessionResponse(updated.data)
      commitSessionSummary(updated.data.session)
      return true
    } catch {
      if (
        activeOwnerRef.current === requestedOwner
        && activeJobIdRef.current === requestedJobId
        && activeModeRef.current === requestedMode
      ) {
        locallyUpdatedSessionIdsRef.current.delete(sessionId)
        applySessionUpdate(targetSession)
        setSessionsError(failureMessage)
      }
      return false
    } finally {
      setSessionPending(sessionId, false)
    }
  }

  function applySessionUpdate(nextSession: WorkerKaelChatSession) {
    commitSessionSummary(nextSession)
    const cached = sessionCacheRef.current.get(nextSession.id)
    if (cached) cacheSessionResponse({ ...cached, session: nextSession })
  }

  const pickMedia = () => pickWorkerKaelMedia({
    busy,
    hasJobKaelSessionAccess,
    language,
    openingSessionId,
    setMediaItems,
  })

  const send = async (message: string) => createWorkerKaelOrbSendAction({
    activeJobIdRef,
    activeModeRef,
    activeOwnerRef,
    advisoryUnavailableReply,
    busy,
    cacheSessionResponse,
    canUseKaelSession,
    commitSessionSummary,
    getCachedSessionResponse: (sessionId) => sessionCacheRef.current.get(sessionId),
    isLocalVisualAuditSession: localVisualAuditSession,
    language,
    locallyCreatedSessionIdsRef,
    mediaItems,
    mode,
    openingSessionId,
    owner,
    reasoningActions,
    sendRequestRef,
    sessionJobId,
    sessionRef,
    setActiveSessionId,
    setBusy,
    setError,
    setMediaItems,
    setProgress,
    setStreamingReply,
    setTurns,
  })(message)

  return {
    activeSessionId,
    archiveSession,
    archiveActiveSession,
    busy: busy || creatingSession || Boolean(openingSessionId),
    busyLabel,
    canCreateSession: canUseKaelSession && !busy && !creatingSession && !openingSessionId,
    error,
    liveTurns: turns,
    reasoningReceipt,
    streamingReply,
    settleStreamingReply,
    mediaCount: mediaItems.length,
    openSession,
    openingSessionId,
    pendingSessionIds,
    pickMedia,
    refreshSessions,
    renameSession,
    resetToNewSession,
    send,
    sessions,
    sessionsError,
    sessionsLoading,
    setSessionPinned,
    startNewSession,
    toggleReasoningReceipt: reasoningActions.toggle,
  }
}
