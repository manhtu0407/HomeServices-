import { useCallback, useEffect, useRef } from 'react'
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import type { LocalDeal, WorkerKaelChatMode } from '@nestscout/shared'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerKaelChatResponse, WorkerKaelChatSession } from '@/lib/api-types'
import { useAuth } from '@/lib/auth-provider'
import { generateClientRequestId } from '@/lib/client-request-id'
import { uploadJobMediaDrafts, type LocalMediaUploadDraft } from '@/lib/media-upload'
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
  workerV5KaelOrbMediaName,
  workerV5KaelOrbTurnsFromResponse,
} from './kael-orb-chat-model'
import { readWorkerKaelSessionCatalog, writeWorkerKaelSessionCatalog } from './session-catalog-cache'
import { useWorkerV5KaelOrbScopedState } from './use-kael-orb-scoped-state'
import { useLatestWorkerSessionRestore } from './use-latest-worker-session-restore'

export function useWorkerV5KaelOrbChat(
  deal: LocalDeal | null,
  language: AppLanguage,
  mode: WorkerKaelChatMode,
  workerJobsHydrated: boolean,
) {
  const { session: authSession } = useAuth()
  const workerId = authSession?.user.id ?? null
  const localVisualAuditSession = authSession?.user.app_metadata?.provider === 'local-visual-audit'
  const jobId = getWorkerV5ChatJobId(deal)
  const readOnly = isWorkerV5KaelOrbReadOnly(deal)
  const sessionJobId = mode === 'intake' ? jobId : null
  const hasJobKaelSessionAccess = Boolean(sessionJobId) && canUseWorkerV5KaelOrbSession(deal) && !readOnly
  const canUseKaelSession = mode === 'normal' ? Boolean(workerId) : hasJobKaelSessionAccess
  const activeWorkerIdRef = useRef<string | null>(workerId)
  const activeModeRef = useRef<WorkerKaelChatMode>(mode)
  const localVisualAuditSessionRef = useRef(localVisualAuditSession)
  const activeJobIdRef = useRef<string | null>(sessionJobId)
  const workerJobsHydratedRef = useRef(workerJobsHydrated)
  const sessionRef = useRef<WorkerV5KaelOrbSession | null>(null)
  const sessionCacheRef = useRef(new Map<string, WorkerKaelChatResponse>())
  const sessionLoadPromiseRef = useRef(new Map<string, Promise<WorkerKaelChatResponse | null>>())
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
    pendingSessionIds, progress, sessions, sessionsError,
    setActiveSessionId, setBusy, setCreatingSession, setError, setMediaItems,
    setOpeningSessionId, setPendingSessionIds, setProgress, setSessions,
    setSessionsError, setTurns, sessionsLoading: storedSessionsLoading, turns,
  } = useWorkerV5KaelOrbScopedState({
    catalogKey, catalogOwnerKey: sessionCatalogOwnerKeyRef.current,
    catalogReady: sessionCatalogReadyRef.current, catalogSessions: sessionCatalogRef.current,
    jobId: sessionJobId, localVisualAuditSession, mode, ownerKey,
    removedSessionIds: removedSessionIdsRef.current, workerId,
  })
  const sessionsLoading = Boolean(workerId && storedSessionsLoading && (sessionCatalogOwnerKeyRef.current !== catalogKey
    || !sessionCatalogReadyRef.current || (mode === 'intake' && !sessionJobId && !workerJobsHydrated)))
  activeWorkerIdRef.current = workerId
  activeModeRef.current = mode
  localVisualAuditSessionRef.current = localVisualAuditSession
  activeJobIdRef.current = sessionJobId
  workerJobsHydratedRef.current = workerJobsHydrated
  pendingSessionIdsRef.current = pendingSessionIds
  const advisoryUnavailableReply = workerV5KaelAdvisoryUnavailableReply(readOnly, language)
  const progressPercent = progress ? Math.max(0, Math.min(100, Math.round(progress.progress * 100))) : null
  const busyLabel = openingSessionId || creatingSession ? textByLanguage(language, 'Đang mở cuộc trò chuyện...', 'Opening conversation...')
    : busy ? textByLanguage(language, `Kael đang xử lý...${progressPercent != null ? ` ${progressPercent}%` : ''}`, `Kael is working...${progressPercent != null ? ` ${progressPercent}%` : ''}`) : null
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

    const requestEntry: { promise: Promise<WorkerKaelChatResponse | null> } = {
      promise: Promise.resolve(null),
    }
    requestEntry.promise = workerKaelChatService.get(sessionId).then((loaded) => {
      if (
        !loaded.success
        || loaded.data.session.job_id !== requestedJobId
        || loaded.data.session.mode !== requestedMode
        || activeOwnerRef.current !== requestedOwner
        || activeJobIdRef.current !== requestedJobId
        || activeModeRef.current !== requestedMode
        || removedSessionIdsRef.current.has(sessionId)
      ) return null
      sessionCacheRef.current.set(sessionId, loaded.data)
      return loaded.data
    }).catch(() => null).finally(() => {
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
      if (mode === 'normal' || currentJobId) {
        setActiveField('sessions', cachedCatalog.filter((session) =>
          workerKaelSessionMatchesScope(session, currentJobId, mode)
          && !removedSessionIdsRef.current.has(session.id)
        ))
      }
      setActiveField('sessionsLoading', Boolean(mode === 'intake' && !currentJobId && !workerJobsHydratedRef.current))
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
    pendingSessionIdsRef.current = []
    sessionRef.current = null

    if (
      (mode === 'normal' || sessionJobId)
      && workerId
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
            setActiveField('sessionsError', textByLanguage(language, 'Chưa tải được các cuộc trò chuyện Kael. Vui lòng thử lại.', 'Kael conversations could not be loaded. Please try again.'))
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
        if (requestedMode === 'normal' || currentJobId) {
          const matchingSessions = nextCatalog.filter((session) =>
            workerKaelSessionMatchesScope(session, currentJobId, requestedMode)
          )
          setActiveField('sessions', matchingSessions)
          prefetchSessions(matchingSessions, currentJobId)
        }
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
          setActiveField('sessionsLoading', Boolean(
            sessionCatalogReadyRef.current
            && requestedMode === 'intake'
            && !activeJobIdRef.current
            && !workerJobsHydratedRef.current
          ))
        }
      }
    })()
    sessionListRequestRef.current = request
    return request.promise
  }, [language, mode, persistSessionCatalog, prefetchSessions, setActiveField, workerId])

  useEffect(() => {
    if (!workerId) return
    void refreshSessions()
  }, [refreshSessions, workerId])

  const startNewSession = async (): Promise<boolean> => {
    const requestedJobId = sessionJobId
    const requestedMode = mode
    const requestedOwner = owner
    if (!canUseKaelSession || busy || creatingSession || openingSessionId) {
      setSessionsError(textByLanguage(language, 'Cần một công việc đang thực hiện để tạo cuộc trò chuyện này.', 'Active work is needed to create this conversation.'))
      return false
    }
    const requestId = openRequestRef.current + 1
    openRequestRef.current = requestId
    setCreatingSession(true)
    setSessionsError(null)
    try {
      const created = await workerKaelChatService.create({
        client_request_id: generateClientRequestId(),
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
        setSessionsError(textByLanguage(language, 'Chưa thể tạo cuộc trò chuyện Kael mới. Vui lòng thử lại.', 'A new Kael conversation could not be created. Please try again.'))
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
        setSessionsError(textByLanguage(language, 'Chưa thể mở cuộc trò chuyện này. Vui lòng thử lại.', 'This Kael conversation could not be opened. Please try again.'))
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

  useLatestWorkerSessionRestore({ activeSessionId, jobId, openSession, openingSessionId, ownerKey, sessions, sessionsLoading })

  const resetToNewSession = useCallback(() => {
    openRequestRef.current += 1
    sendRequestRef.current += 1
    sessionRef.current = null
    setActiveField('activeSessionId', null)
    setActiveField('openingSessionId', null)
    setActiveField('progress', null)
    setActiveField('busy', false)
    setActiveField('turns', [])
    setActiveField('mediaItems', [])
    setActiveField('error', null)
  }, [setActiveField])

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
    try {
      const archived = await workerKaelChatService.archive(sessionId)
      if (!archived.success) throw new Error('archive_failed')
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
        setSessionsError(textByLanguage(language, 'Chưa thể xóa cuộc trò chuyện khỏi danh sách. Vui lòng thử lại.', 'This conversation could not be removed from your list. Please try again.'))
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
    locallyUpdatedSessionIdsRef.current.add(sessionId)
    setSessionPending(sessionId, true)
    setSessionsError(null)
    applySessionUpdate(optimisticSession)
    try {
      const renamed = await workerKaelChatService.rename(sessionId, { title: trimmedTitle })
      if (
        !renamed.success
        || !workerKaelSessionMatchesScope(renamed.data.session, requestedJobId, requestedMode)
      ) throw new Error('rename_failed')
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
        setSessionsError(textByLanguage(language, 'Chưa thể đổi tên cuộc trò chuyện. Tên cũ đã được khôi phục.', 'This conversation could not be renamed. Its previous name was restored.'))
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
    locallyUpdatedSessionIdsRef.current.add(sessionId)
    setSessionPending(sessionId, true)
    setSessionsError(null)
    applySessionUpdate(optimisticSession)
    try {
      const updated = await workerKaelChatService.setPinned(sessionId, { pinned })
      if (
        !updated.success
        || updated.data.session.job_id !== requestedJobId
        || updated.data.session.mode !== requestedMode
      ) throw new Error('pin_failed')
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
        setSessionsError(textByLanguage(language, 'Chưa thể đổi trạng thái ghim. Trạng thái cũ đã được khôi phục.', 'The pin state could not be changed. Its previous state was restored.'))
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

  const pickMedia = async () => {
    if (busy || openingSessionId) return
    if (!hasJobKaelSessionAccess) {
      Alert.alert('Kael', textByLanguage(language, 'Cần việc đang thực hiện để gửi ảnh cho Kael.', 'Active work is needed to send a photo to Kael.'))
      return
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Kael', textByLanguage(language, 'Cần quyền thư viện ảnh để thêm ảnh cho Kael.', 'Photo library permission is needed to add a photo for Kael.'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.84,
    })
    if (result.canceled || result.assets.length === 0) return
    const asset = result.assets[0]
    setMediaItems([{ fileName: workerV5KaelOrbMediaName(asset, 0, language), uri: asset.uri }])
  }

  const send = async (message: string) => {
    const content = message.trim()
    if (!content || busy || openingSessionId) return
    const sendRequestId = sendRequestRef.current + 1
    sendRequestRef.current = sendRequestId
    setError(null)
    setTurns((current) => [...current, { id: `worker-orb-${Date.now()}`, role: 'worker', text: content }])

    if (!canUseKaelSession) {
      setTurns((current) => [...current, { id: `kael-orb-${Date.now()}`, role: 'kael', text: advisoryUnavailableReply }])
      setMediaItems([])
      return
    }

    setBusy(true)
    const currentJobId = sessionJobId
    const currentMode = mode
    const currentOwner = owner
    const isCurrentSend = () => (
      sendRequestRef.current === sendRequestId
      && activeOwnerRef.current === currentOwner
      && activeJobIdRef.current === currentJobId
      && activeModeRef.current === currentMode
    )
    try {
      let mediaRefs: string[] = []
      if (mediaItems.length > 0) {
        if (!currentJobId) {
          setError(textByLanguage(language, 'Ảnh chỉ dùng trong cuộc trò chuyện theo công việc.', 'Photos are only available in job conversations.'))
          return
        }
        const uploadDrafts: LocalMediaUploadDraft[] = mediaItems.map((item) => ({
          fileName: item.fileName,
          type: 'image',
          uri: item.uri,
        }))
        const uploaded = await uploadJobMediaDrafts(currentJobId, uploadDrafts, 'kael_reference')
        if (!isCurrentSend()) return
        if (!uploaded.success) {
          setError(uploaded.error)
          return
        }
        mediaRefs = uploaded.mediaRefs
      }

      let sessionId = sessionRef.current?.jobId === currentJobId
        && sessionRef.current.mode === currentMode
        ? sessionRef.current.sessionId
        : null
      if (!sessionId) {
        const created = await workerKaelChatService.create({
          client_request_id: generateClientRequestId(),
          language,
          mode: currentMode,
          ...(currentJobId ? { job_id: currentJobId } : {}),
        })
        if (!isCurrentSend()) return
        if (
          !created.success
          || created.data.session.job_id !== currentJobId
          || created.data.session.mode !== currentMode
        ) {
          setProgress(null)
          setError(textByLanguage(language, 'Kael chưa mở được cuộc trò chuyện riêng cho việc này.', 'Kael could not open the private work session yet.'))
          return
        }
        sessionId = created.data.session.id
        locallyCreatedSessionIdsRef.current.add(sessionId)
        cacheSessionResponse(created.data)
        sessionRef.current = { jobId: currentJobId, mode: currentMode, sessionId }
        setActiveSessionId(sessionId)
        commitSessionSummary(created.data.session)
        if (
          created.data.session.progress
          && activeJobIdRef.current === currentJobId
          && activeModeRef.current === currentMode
        ) {
          setProgress(created.data.session.progress)
        }
      }

      const streamed = await workerKaelChatService.streamTurn(sessionId, {
        client_request_id: generateClientRequestId(),
        language,
        media_refs: mediaRefs,
        message: content,
      }, {
        onStage: (event) => {
          if (!isCurrentSend()) return
          setProgress(event.progress)
        },
        onToken: () => undefined,
      })
      if (!isCurrentSend()) return

      let finalResponse = streamed.success ? streamed : null
      if (!finalResponse) {
        const recovered = await workerKaelChatService.get(sessionId)
        if (!isCurrentSend()) return
        if (recovered.success) finalResponse = recovered
      }

      if (
        !finalResponse
        || finalResponse.data.session.job_id !== currentJobId
        || finalResponse.data.session.mode !== currentMode
      ) {
        if (
          activeJobIdRef.current === currentJobId
          && activeModeRef.current === currentMode
        ) setProgress(null)
        setError(textByLanguage(language, 'Kael bỏ qua phản hồi không khớp việc hiện tại.', 'Kael ignored a response that did not match the current work.'))
        return
      }

      cacheSessionResponse(finalResponse.data)
      if (
        isCurrentSend()
        && sessionRef.current?.sessionId === finalResponse.data.session.id
      ) {
        sessionRef.current = {
          jobId: currentJobId,
          mode: currentMode,
          sessionId: finalResponse.data.session.id,
        }
        setActiveSessionId(finalResponse.data.session.id)
        setProgress(finalResponse.data.session.progress)
        setTurns(workerV5KaelOrbTurnsFromResponse(finalResponse.data.turns))
        setMediaItems([])
        commitSessionSummary(finalResponse.data.session)
      }
    } catch {
      if (isCurrentSend()) {
        setError(textByLanguage(language, 'Kael đang không kết nối được. Không có hành động nào được ghi vào việc.', 'Kael is unavailable. No work action was written.'))
      }
    } finally {
      if (sendRequestRef.current === sendRequestId) setBusy(false)
    }
  }

  return {
    activeSessionId,
    archiveSession,
    archiveActiveSession,
    busy: busy || creatingSession || Boolean(openingSessionId),
    busyLabel,
    canCreateSession: canUseKaelSession && !busy && !creatingSession && !openingSessionId,
    error,
    liveTurns: turns,
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
  }
}
