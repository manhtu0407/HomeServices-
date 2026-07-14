import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { AppLanguage } from '@/lib/app-language'
import type {
  CustomerKaelConversationMode,
  CustomerKaelConversationResponse,
  CustomerKaelConversationSession,
} from '@/lib/api-types/customer'
import { useAuth } from '@/lib/auth-provider'
import { generateClientRequestId } from '@/lib/client-request-id'
import { customerKaelConversationService } from '@/lib/services'

import {
  readCustomerKaelSessionCatalog,
  writeCustomerKaelSessionCatalog,
} from './customer-kael-session-catalog-cache'

const catalogMemory = new Map<string, CustomerKaelConversationSession[]>()
const responseMemory = new Map<string, CustomerKaelConversationResponse>()

export function useCustomerKaelConversations(
  mode: CustomerKaelConversationMode,
  language: AppLanguage,
) {
  const { session: authSession } = useAuth()
  const customerId = authSession?.user.id ?? null
  const localVisualAuditSession = authSession?.user.app_metadata?.provider === 'local-visual-audit'
  const catalogKey = customerId ? customerCatalogKey(customerId, mode) : null
  const [sessions, setSessions] = useState<CustomerKaelConversationSession[]>(() => (
    catalogKey ? catalogMemory.get(catalogKey) ?? [] : []
  ))
  const [activeResponse, setActiveResponse] = useState<CustomerKaelConversationResponse | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(() => Boolean(customerId && catalogKey && !catalogMemory.has(catalogKey)))
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [creatingSession, setCreatingSession] = useState(false)
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [pendingSessionIds, setPendingSessionIds] = useState<string[]>([])
  const activeKeyRef = useRef(catalogKey)
  const activeModeRef = useRef(mode)
  const activeResponseByCatalogRef = useRef(new Map<string, CustomerKaelConversationResponse | null>())
  const visualAuditOwnerByCatalogRef = useRef(new Map<string, string>())
  const listRequestRef = useRef(new Map<string, Promise<CustomerKaelConversationSession[]>>())
  const operationRequestRef = useRef(0)
  const operationLockRef = useRef<number | null>(null)
  const pendingSessionIdSetRef = useRef(new Set<string>())
  activeKeyRef.current = catalogKey
  activeModeRef.current = mode

  const matchesCatalogCustomer = useCallback((candidateCustomerId: string) => {
    if (!customerId || !catalogKey) return false
    if (!localVisualAuditSession) return candidateCustomerId === customerId
    const serverScopedCustomerId = visualAuditOwnerByCatalogRef.current.get(catalogKey)
    return !serverScopedCustomerId || candidateCustomerId === serverScopedCustomerId
  }, [catalogKey, customerId, localVisualAuditSession])

  const visibleResponse = activeResponse?.session.mode === mode
    && matchesCatalogCustomer(activeResponse.session.customer_id)
    ? activeResponse
    : null

  const persistCatalog = useCallback((nextSessions: CustomerKaelConversationSession[]) => {
    if (!customerId || !catalogKey) return []
    const catalogOwnerId = localVisualAuditSession
      ? visualAuditOwnerByCatalogRef.current.get(catalogKey) ?? nextSessions[0]?.customer_id ?? null
      : customerId
    if (localVisualAuditSession && catalogOwnerId) {
      visualAuditOwnerByCatalogRef.current.set(catalogKey, catalogOwnerId)
    }
    const scoped = sortSessions(nextSessions.filter((session) => (
      session.customer_id === catalogOwnerId && session.mode === mode
    ))).slice(0, 20)
    catalogMemory.set(catalogKey, scoped)
    if (activeKeyRef.current === catalogKey) setSessions(scoped)
    if (!localVisualAuditSession) {
      void writeCustomerKaelSessionCatalog(customerId, mode, scoped)
    }
    return scoped
  }, [catalogKey, customerId, localVisualAuditSession, mode])

  const activateResponse = useCallback((response: CustomerKaelConversationResponse) => {
    if (
      !customerId
      || !catalogKey
      || !matchesCatalogCustomer(response.session.customer_id)
      || response.session.mode !== mode
      || activeKeyRef.current !== catalogKey
    ) return false
    if (localVisualAuditSession) {
      visualAuditOwnerByCatalogRef.current.set(catalogKey, response.session.customer_id)
    }
    responseMemory.set(response.session.id, response)
    activeResponseByCatalogRef.current.set(catalogKey, response)
    setActiveResponse(response)
    persistCatalog(upsertSession(catalogMemory.get(catalogKey) ?? [], response.session))
    setSessionsError(null)
    return true
  }, [catalogKey, customerId, localVisualAuditSession, matchesCatalogCustomer, mode, persistCatalog])

  const refreshSessions = useCallback((_force = false): Promise<CustomerKaelConversationSession[]> => {
    if (!customerId || !catalogKey) return Promise.resolve([])
    const existing = listRequestRef.current.get(catalogKey)
    if (existing) return existing
    if (!catalogMemory.has(catalogKey)) setSessionsLoading(true)
    setSessionsError(null)

    const request = customerKaelConversationService.list(mode)
      .then((result) => {
        if (!result.success) throw new Error('list_failed')
        const catalogOwnerId = localVisualAuditSession
          ? result.data.sessions[0]?.customer_id ?? visualAuditOwnerByCatalogRef.current.get(catalogKey) ?? null
          : customerId
        if (localVisualAuditSession && catalogOwnerId) {
          visualAuditOwnerByCatalogRef.current.set(catalogKey, catalogOwnerId)
        }
        const scoped = sortSessions(result.data.sessions.filter((session) => (
          session.customer_id === catalogOwnerId && session.mode === mode
        )))
        catalogMemory.set(catalogKey, scoped)
        if (!localVisualAuditSession) {
          void writeCustomerKaelSessionCatalog(customerId, mode, scoped)
        }
        if (activeKeyRef.current === catalogKey) setSessions(scoped)
        return scoped
      })
      .catch(() => {
        if (activeKeyRef.current === catalogKey && !catalogMemory.has(catalogKey)) {
          setSessionsError(copy(language, 'Chưa tải được các cuộc trò chuyện. Vui lòng thử lại.', 'Conversations could not be loaded. Please try again.'))
        }
        return catalogMemory.get(catalogKey) ?? []
      })
      .finally(() => {
        if (listRequestRef.current.get(catalogKey) === request) listRequestRef.current.delete(catalogKey)
        if (activeKeyRef.current === catalogKey) setSessionsLoading(false)
      })
    listRequestRef.current.set(catalogKey, request)
    return request
  }, [catalogKey, customerId, language, localVisualAuditSession, mode])

  useEffect(() => {
    operationRequestRef.current += 1
    operationLockRef.current = null
    pendingSessionIdSetRef.current.clear()
    setPendingSessionIds([])
    setOpeningSessionId(null)
    setCreatingSession(false)
    setSending(false)
    setSessionsError(null)
    if (!customerId || !catalogKey) {
      setSessions([])
      setActiveResponse(null)
      setSessionsLoading(false)
      return
    }

    const memoryCatalog = catalogMemory.get(catalogKey)
    setSessions(memoryCatalog ?? [])
    setActiveResponse(activeResponseByCatalogRef.current.get(catalogKey) ?? null)
    setSessionsLoading(!memoryCatalog)
    if (localVisualAuditSession) {
      void refreshSessions()
      return
    }
    let cancelled = false
    void readCustomerKaelSessionCatalog(customerId, mode).then((cached) => {
      if (cancelled || !cached || activeKeyRef.current !== catalogKey) return
      const scoped = sortSessions(cached.filter((item) => (
        item.customer_id === customerId && item.mode === mode
      )))
      catalogMemory.set(catalogKey, scoped)
      setSessions(scoped)
      setSessionsLoading(false)
    }).finally(() => {
      if (!cancelled) void refreshSessions()
    })
    return () => {
      cancelled = true
    }
  }, [catalogKey, customerId, localVisualAuditSession, mode, refreshSessions])

  const resetToBlank = useCallback(() => {
    operationRequestRef.current += 1
    operationLockRef.current = null
    if (catalogKey) activeResponseByCatalogRef.current.set(catalogKey, null)
    setActiveResponse(null)
    setCreatingSession(false)
    setOpeningSessionId(null)
    setSending(false)
    setSessionsError(null)
  }, [catalogKey])

  const startNewSession = useCallback(async (clientRequestId = generateClientRequestId()) => {
    if (!customerId || !catalogKey || operationLockRef.current !== null) return null
    const requestId = operationRequestRef.current + 1
    operationRequestRef.current = requestId
    operationLockRef.current = requestId
    setCreatingSession(true)
    setSessionsError(null)
    try {
      const created = await customerKaelConversationService.create({
        client_request_id: clientRequestId,
        mode,
      })
      if (
        !created.success
        || operationRequestRef.current !== requestId
        || activeKeyRef.current !== catalogKey
        || !matchesCatalogCustomer(created.data.session.customer_id)
        || created.data.session.mode !== mode
      ) {
        if (!created.success && activeKeyRef.current === catalogKey) {
          setSessionsError(copy(language, 'Chưa thể tạo cuộc trò chuyện mới.', 'A new conversation could not be created.'))
        }
        return null
      }
      activateResponse(created.data)
      return created.data
    } catch {
      if (activeKeyRef.current === catalogKey) {
        setSessionsError(copy(language, 'Chưa thể tạo cuộc trò chuyện mới.', 'A new conversation could not be created.'))
      }
      return null
    } finally {
      if (operationLockRef.current === requestId) {
        operationLockRef.current = null
        if (activeKeyRef.current === catalogKey) setCreatingSession(false)
      }
    }
  }, [activateResponse, catalogKey, customerId, language, matchesCatalogCustomer, mode])

  const ensureActiveSession = useCallback(async (clientRequestId?: string) => {
    if (visibleResponse) return visibleResponse
    return startNewSession(clientRequestId)
  }, [startNewSession, visibleResponse])

  const openSession = useCallback(async (sessionId: string) => {
    if (!customerId || !catalogKey || operationLockRef.current !== null) return null
    const summary = sessions.find((session) => session.id === sessionId)
    if (!summary || !matchesCatalogCustomer(summary.customer_id) || summary.mode !== mode) return null
    const cached = responseMemory.get(sessionId)
    if (cached && matchesCatalogCustomer(cached.session.customer_id) && cached.session.mode === mode) {
      activateResponse(cached)
      return cached
    }

    const requestId = operationRequestRef.current + 1
    operationRequestRef.current = requestId
    operationLockRef.current = requestId
    setOpeningSessionId(sessionId)
    setSessionsError(null)
    try {
      const loaded = await customerKaelConversationService.get(sessionId)
      if (
        !loaded.success
        || operationRequestRef.current !== requestId
        || activeKeyRef.current !== catalogKey
        || !matchesCatalogCustomer(loaded.data.session.customer_id)
        || loaded.data.session.mode !== mode
      ) {
        if (!loaded.success && activeKeyRef.current === catalogKey) {
          setSessionsError(copy(language, 'Chưa thể mở cuộc trò chuyện này.', 'This conversation could not be opened.'))
        }
        return null
      }
      activateResponse(loaded.data)
      return loaded.data
    } catch {
      if (activeKeyRef.current === catalogKey) {
        setSessionsError(copy(language, 'Chưa thể mở cuộc trò chuyện này.', 'This conversation could not be opened.'))
      }
      return null
    } finally {
      if (operationLockRef.current === requestId) {
        operationLockRef.current = null
        if (activeKeyRef.current === catalogKey) setOpeningSessionId(null)
      }
    }
  }, [activateResponse, catalogKey, customerId, language, matchesCatalogCustomer, mode, sessions])

  const sendConversationTurn = useCallback(async (message: string) => {
    const content = message.trim()
    if (!content || operationLockRef.current !== null) return null
    const target = await ensureActiveSession()
    if (!target || target.session.mode !== mode || operationLockRef.current !== null) return null
    const targetId = target.session.id
    const requestId = operationRequestRef.current + 1
    operationRequestRef.current = requestId
    operationLockRef.current = requestId
    setSending(true)
    setSessionsError(null)
    try {
      const sent = await customerKaelConversationService.sendTurn(targetId, {
        client_request_id: generateClientRequestId(),
        language,
        message: content,
      })
      if (
        !sent.success
        || operationRequestRef.current !== requestId
        || activeModeRef.current !== mode
        || activeKeyRef.current !== catalogKey
      ) {
        if (!sent.success && operationRequestRef.current === requestId && activeKeyRef.current === catalogKey) {
          setSessionsError(copy(language, 'Kael chưa thể trả lời lúc này.', 'Kael could not reply right now.'))
        }
        return null
      }
      activateResponse(sent.data)
      return sent.data
    } catch {
      if (operationRequestRef.current === requestId && activeKeyRef.current === catalogKey) {
        setSessionsError(copy(language, 'Kael chưa thể trả lời lúc này.', 'Kael could not reply right now.'))
      }
      return null
    } finally {
      if (operationLockRef.current === requestId) {
        operationLockRef.current = null
        if (activeKeyRef.current === catalogKey) setSending(false)
      }
    }
  }, [activateResponse, catalogKey, ensureActiveSession, language, mode])

  const archiveSession = useCallback(async (sessionId: string) => {
    const target = sessions.find((session) => session.id === sessionId)
    if (!target || target.mode !== mode || !matchesCatalogCustomer(target.customer_id) || pendingSessionIdSetRef.current.has(sessionId)) return false
    const previous = sessions
    const linkedCaseWork = Boolean(target.case_session_id)
    pendingSessionIdSetRef.current.add(sessionId)
    setPendingSessionIds((current) => [...new Set([...current, sessionId])])
    if (!linkedCaseWork) {
      persistCatalog(previous.filter((session) => session.id !== sessionId))
      if (visibleResponse?.session.id === sessionId) resetToBlank()
    }
    try {
      const archived = await customerKaelConversationService.archive(
        sessionId,
        linkedCaseWork,
      )
      if (!archived.success) throw new Error('archive_failed')
      if (linkedCaseWork) {
        persistCatalog((catalogKey ? catalogMemory.get(catalogKey) ?? sessions : sessions)
          .filter((session) => session.id !== sessionId))
        if (visibleResponse?.session.id === sessionId) resetToBlank()
      }
      responseMemory.delete(sessionId)
      return true
    } catch {
      if (!linkedCaseWork) {
        persistCatalog(upsertSession(
          catalogKey ? catalogMemory.get(catalogKey) ?? [] : previous,
          target,
        ))
      }
      if (activeKeyRef.current === catalogKey) {
        setSessionsError(copy(language, 'Chưa thể xóa cuộc trò chuyện.', 'This conversation could not be removed.'))
      }
      return false
    } finally {
      pendingSessionIdSetRef.current.delete(sessionId)
      if (activeKeyRef.current === catalogKey) {
        setPendingSessionIds((current) => current.filter((id) => id !== sessionId))
      }
    }
  }, [catalogKey, language, matchesCatalogCustomer, mode, persistCatalog, resetToBlank, sessions, visibleResponse?.session.id])

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const trimmed = title.trim()
    const target = sessions.find((session) => session.id === sessionId)
    if (!target || !trimmed || target.mode !== mode || !matchesCatalogCustomer(target.customer_id) || pendingSessionIdSetRef.current.has(sessionId)) return false
    pendingSessionIdSetRef.current.add(sessionId)
    setPendingSessionIds((current) => [...new Set([...current, sessionId])])
    try {
      const renamed = await customerKaelConversationService.rename(sessionId, { title: trimmed })
      if (!renamed.success) throw new Error('rename_failed')
      responseMemory.set(sessionId, renamed.data)
      persistCatalog(upsertSession(
        catalogKey ? catalogMemory.get(catalogKey) ?? [] : sessions,
        renamed.data.session,
      ))
      if (visibleResponse?.session.id === sessionId) activateResponse(renamed.data)
      return true
    } catch {
      if (activeKeyRef.current === catalogKey) {
        setSessionsError(copy(language, 'Chưa thể đổi tên cuộc trò chuyện.', 'This conversation could not be renamed.'))
      }
      return false
    } finally {
      pendingSessionIdSetRef.current.delete(sessionId)
      if (activeKeyRef.current === catalogKey) {
        setPendingSessionIds((current) => current.filter((id) => id !== sessionId))
      }
    }
  }, [activateResponse, catalogKey, language, matchesCatalogCustomer, mode, persistCatalog, sessions, visibleResponse?.session.id])

  const setSessionPinned = useCallback(async (sessionId: string, pinned: boolean) => {
    const target = sessions.find((session) => session.id === sessionId)
    if (!target || target.mode !== mode || !matchesCatalogCustomer(target.customer_id) || pendingSessionIdSetRef.current.has(sessionId)) return false
    pendingSessionIdSetRef.current.add(sessionId)
    setPendingSessionIds((current) => [...new Set([...current, sessionId])])
    try {
      const updated = await customerKaelConversationService.setPinned(sessionId, { pinned })
      if (!updated.success) throw new Error('pin_failed')
      responseMemory.set(sessionId, updated.data)
      persistCatalog(upsertSession(
        catalogKey ? catalogMemory.get(catalogKey) ?? [] : sessions,
        updated.data.session,
      ))
      if (visibleResponse?.session.id === sessionId) activateResponse(updated.data)
      return true
    } catch {
      if (activeKeyRef.current === catalogKey) {
        setSessionsError(copy(language, 'Chưa thể đổi trạng thái ghim.', 'The pin state could not be changed.'))
      }
      return false
    } finally {
      pendingSessionIdSetRef.current.delete(sessionId)
      if (activeKeyRef.current === catalogKey) {
        setPendingSessionIds((current) => current.filter((id) => id !== sessionId))
      }
    }
  }, [activateResponse, catalogKey, language, matchesCatalogCustomer, mode, persistCatalog, sessions, visibleResponse?.session.id])

  const syncLinkedCaseSession = useCallback(async (caseSessionId: string) => {
    if (mode !== 'case') return null
    const refreshed = await refreshSessions(true)
    const linked = refreshed.find((session) => session.case_session_id === caseSessionId)
    if (!linked) return null
    const loaded = await customerKaelConversationService.get(linked.id)
    if (!loaded.success || loaded.data.session.mode !== 'case') return null
    return activateResponse(loaded.data) ? loaded.data : null
  }, [activateResponse, mode, refreshSessions])

  const syncLinkedJobSession = useCallback(async (jobId: string) => {
    if (mode !== 'case' || !customerId || !catalogKey) return null
    const syncVersion = operationRequestRef.current
    const refreshed = await refreshSessions(true)
    if (
      operationRequestRef.current !== syncVersion
      || operationLockRef.current !== null
      || activeKeyRef.current !== catalogKey
    ) return null
    const linked = refreshed.find((session) => session.case_job_id === jobId)
    if (!linked) return null
    const requestId = operationRequestRef.current + 1
    operationRequestRef.current = requestId
    operationLockRef.current = requestId
    setOpeningSessionId(linked.id)
    try {
      const loaded = await customerKaelConversationService.get(linked.id)
      if (
        !loaded.success
        || loaded.data.session.mode !== 'case'
        || operationRequestRef.current !== requestId
        || activeKeyRef.current !== catalogKey
      ) return null
      return activateResponse(loaded.data) ? loaded.data : null
    } finally {
      if (operationLockRef.current === requestId) {
        operationLockRef.current = null
        if (activeKeyRef.current === catalogKey) setOpeningSessionId(null)
      }
    }
  }, [activateResponse, catalogKey, customerId, mode, refreshSessions])

  return useMemo(() => ({
    activeResponse: visibleResponse,
    activeSessionId: visibleResponse?.session.id ?? null,
    archiveSession,
    busy: creatingSession || Boolean(openingSessionId) || sending,
    canCreateSession: Boolean(customerId) && !creatingSession && !openingSessionId && !sending,
    ensureActiveSession,
    openSession,
    openingSessionId,
    pendingSessionIds,
    refreshSessions,
    renameSession,
    resetToBlank,
    sendConversationTurn,
    sessions,
    sessionsError,
    sessionsLoading,
    setSessionPinned,
    startNewSession,
    syncLinkedCaseSession,
    syncLinkedJobSession,
    turns: visibleResponse?.turns ?? [],
  }), [
    archiveSession,
    creatingSession,
    customerId,
    ensureActiveSession,
    openSession,
    openingSessionId,
    pendingSessionIds,
    refreshSessions,
    renameSession,
    resetToBlank,
    sendConversationTurn,
    sending,
    sessions,
    sessionsError,
    sessionsLoading,
    setSessionPinned,
    startNewSession,
    syncLinkedCaseSession,
    syncLinkedJobSession,
    visibleResponse,
  ])
}

function customerCatalogKey(customerId: string, mode: CustomerKaelConversationMode) {
  return `${customerId}:${mode}`
}

function upsertSession(
  sessions: CustomerKaelConversationSession[],
  next: CustomerKaelConversationSession,
) {
  return sortSessions([next, ...sessions.filter((session) => session.id !== next.id)])
}

function sortSessions(sessions: CustomerKaelConversationSession[]) {
  return [...sessions].sort((left, right) => {
    const leftPinned = left.pinned_at ? 1 : 0
    const rightPinned = right.pinned_at ? 1 : 0
    if (leftPinned !== rightPinned) return rightPinned - leftPinned
    return Date.parse(right.updated_at) - Date.parse(left.updated_at)
  })
}

function copy(language: AppLanguage, vi: string, en: string) {
  return language === 'vi' ? vi : en
}
