import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

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

type CustomerKaelCatalogState = {
  activeResponse: CustomerKaelConversationResponse | null
  catalogKey: string | null
  creatingSession: boolean
  openingSessionId: string | null
  pendingSessionIds: string[]
  sending: boolean
  sessions: CustomerKaelConversationSession[]
  sessionsError: string | null
  sessionsLoading: boolean
}

export function useCustomerKaelConversations(
  mode: CustomerKaelConversationMode,
  language: AppLanguage,
) {
  const { session: authSession } = useAuth()
  const customerId = authSession?.user.id ?? null
  const localVisualAuditSession = authSession?.user.app_metadata?.provider === 'local-visual-audit'
  const catalogKey = customerId ? customerCatalogKey(customerId, mode) : null
  const activeKeyRef = useRef(catalogKey)
  const activeModeRef = useRef(mode)
  const activeResponseByCatalogRef = useRef(new Map<string, CustomerKaelConversationResponse | null>())
  const visualAuditOwnerByCatalogRef = useRef(new Map<string, string>())
  const listRequestRef = useRef(new Map<string, Promise<CustomerKaelConversationSession[]>>())
  const operationRequestRef = useRef(0)
  const operationLockRef = useRef<number | null>(null)
  const pendingSessionIdSetRef = useRef(new Set<string>())
  const [storedCatalogState, setCatalogState] = useState(() => createCatalogState(
    catalogKey,
    activeResponseByCatalogRef.current,
  ))
  const catalogState = storedCatalogState.catalogKey === catalogKey
    ? storedCatalogState
    : createCatalogState(catalogKey, activeResponseByCatalogRef.current)
  const {
    activeResponse,
    creatingSession,
    openingSessionId,
    pendingSessionIds,
    sending,
    sessions,
    sessionsError,
    sessionsLoading,
  } = catalogState
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
    if (activeKeyRef.current === catalogKey) {
      setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'sessions', scoped)
    }
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
    setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'activeResponse', response)
    persistCatalog(upsertSession(catalogMemory.get(catalogKey) ?? [], response.session))
    setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'sessionsError', null)
    return true
  }, [catalogKey, customerId, localVisualAuditSession, matchesCatalogCustomer, mode, persistCatalog])

  const refreshSessions = useCallback((_force = false): Promise<CustomerKaelConversationSession[]> => {
    if (!customerId || !catalogKey) return Promise.resolve([])
    const existing = listRequestRef.current.get(catalogKey)
    if (existing) return existing
    if (!catalogMemory.has(catalogKey)) {
      setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'sessionsLoading', true)
    }
    setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'sessionsError', null)

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
        if (activeKeyRef.current === catalogKey) {
          setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'sessions', scoped)
        }
        return scoped
      })
      .catch(() => {
        if (activeKeyRef.current === catalogKey && !catalogMemory.has(catalogKey)) {
          setCatalogStateField(
            setCatalogState,
            catalogKey,
            activeResponseByCatalogRef.current,
            'sessionsError',
            copy(language, 'Chưa tải được các cuộc trò chuyện. Vui lòng thử lại.', 'Conversations could not be loaded. Please try again.'),
          )
        }
        return catalogMemory.get(catalogKey) ?? []
      })
      .finally(() => {
        if (listRequestRef.current.get(catalogKey) === request) listRequestRef.current.delete(catalogKey)
        if (activeKeyRef.current === catalogKey) {
          setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'sessionsLoading', false)
        }
      })
    listRequestRef.current.set(catalogKey, request)
    return request
  }, [catalogKey, customerId, language, localVisualAuditSession, mode])

  useEffect(() => {
    operationRequestRef.current += 1
    operationLockRef.current = null
    pendingSessionIdSetRef.current.clear()
    if (!customerId || !catalogKey) return
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
      patchCatalogState(setCatalogState, catalogKey, activeResponseByCatalogRef.current, {
        sessions: scoped,
        sessionsLoading: false,
      })
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
    patchCatalogState(setCatalogState, catalogKey, activeResponseByCatalogRef.current, {
      activeResponse: null,
      creatingSession: false,
      openingSessionId: null,
      sending: false,
      sessionsError: null,
    })
  }, [catalogKey])

  const startNewSession = useCallback(async (clientRequestId = generateClientRequestId()) => {
    if (!customerId || !catalogKey || operationLockRef.current !== null) return null
    const requestId = operationRequestRef.current + 1
    operationRequestRef.current = requestId
    operationLockRef.current = requestId
    patchCatalogState(setCatalogState, catalogKey, activeResponseByCatalogRef.current, {
      creatingSession: true,
      sessionsError: null,
    })
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
          setCatalogStateField(
            setCatalogState,
            catalogKey,
            activeResponseByCatalogRef.current,
            'sessionsError',
            copy(language, 'Chưa thể tạo cuộc trò chuyện mới.', 'A new conversation could not be created.'),
          )
        }
        return null
      }
      activateResponse(created.data)
      return created.data
    } catch {
      if (activeKeyRef.current === catalogKey) {
        setCatalogStateField(
          setCatalogState,
          catalogKey,
          activeResponseByCatalogRef.current,
          'sessionsError',
          copy(language, 'Chưa thể tạo cuộc trò chuyện mới.', 'A new conversation could not be created.'),
        )
      }
      return null
    } finally {
      if (operationLockRef.current === requestId) {
        operationLockRef.current = null
        if (activeKeyRef.current === catalogKey) {
          setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'creatingSession', false)
        }
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
    patchCatalogState(setCatalogState, catalogKey, activeResponseByCatalogRef.current, {
      openingSessionId: sessionId,
      sessionsError: null,
    })
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
          setCatalogStateField(
            setCatalogState,
            catalogKey,
            activeResponseByCatalogRef.current,
            'sessionsError',
            copy(language, 'Chưa thể mở cuộc trò chuyện này.', 'This conversation could not be opened.'),
          )
        }
        return null
      }
      activateResponse(loaded.data)
      return loaded.data
    } catch {
      if (activeKeyRef.current === catalogKey) {
        setCatalogStateField(
          setCatalogState,
          catalogKey,
          activeResponseByCatalogRef.current,
          'sessionsError',
          copy(language, 'Chưa thể mở cuộc trò chuyện này.', 'This conversation could not be opened.'),
        )
      }
      return null
    } finally {
      if (operationLockRef.current === requestId) {
        operationLockRef.current = null
        if (activeKeyRef.current === catalogKey) {
          setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'openingSessionId', null)
        }
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
    patchCatalogState(setCatalogState, catalogKey, activeResponseByCatalogRef.current, {
      sending: true,
      sessionsError: null,
    })
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
          setCatalogStateField(
            setCatalogState,
            catalogKey,
            activeResponseByCatalogRef.current,
            'sessionsError',
            copy(language, 'Kael chưa thể trả lời lúc này.', 'Kael could not reply right now.'),
          )
        }
        return null
      }
      activateResponse(sent.data)
      return sent.data
    } catch {
      if (operationRequestRef.current === requestId && activeKeyRef.current === catalogKey) {
        setCatalogStateField(
          setCatalogState,
          catalogKey,
          activeResponseByCatalogRef.current,
          'sessionsError',
          copy(language, 'Kael chưa thể trả lời lúc này.', 'Kael could not reply right now.'),
        )
      }
      return null
    } finally {
      if (operationLockRef.current === requestId) {
        operationLockRef.current = null
        if (activeKeyRef.current === catalogKey) {
          setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'sending', false)
        }
      }
    }
  }, [activateResponse, catalogKey, ensureActiveSession, language, mode])

  const archiveSession = useCallback(async (sessionId: string) => {
    const target = sessions.find((session) => session.id === sessionId)
    if (!target || target.mode !== mode || !matchesCatalogCustomer(target.customer_id) || pendingSessionIdSetRef.current.has(sessionId)) return false
    const previous = sessions
    const linkedCaseWork = Boolean(target.case_session_id)
    pendingSessionIdSetRef.current.add(sessionId)
    setCatalogStateField(
      setCatalogState,
      catalogKey,
      activeResponseByCatalogRef.current,
      'pendingSessionIds',
      (current) => [...new Set([...current, sessionId])],
    )
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
        setCatalogStateField(
          setCatalogState,
          catalogKey,
          activeResponseByCatalogRef.current,
          'sessionsError',
          copy(language, 'Chưa thể xóa cuộc trò chuyện.', 'This conversation could not be removed.'),
        )
      }
      return false
    } finally {
      pendingSessionIdSetRef.current.delete(sessionId)
      if (activeKeyRef.current === catalogKey) {
        setCatalogStateField(
          setCatalogState,
          catalogKey,
          activeResponseByCatalogRef.current,
          'pendingSessionIds',
          (current) => current.filter((id) => id !== sessionId),
        )
      }
    }
  }, [catalogKey, language, matchesCatalogCustomer, mode, persistCatalog, resetToBlank, sessions, visibleResponse?.session.id])

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const trimmed = title.trim()
    const target = sessions.find((session) => session.id === sessionId)
    if (!target || !trimmed || target.mode !== mode || !matchesCatalogCustomer(target.customer_id) || pendingSessionIdSetRef.current.has(sessionId)) return false
    pendingSessionIdSetRef.current.add(sessionId)
    setCatalogStateField(
      setCatalogState,
      catalogKey,
      activeResponseByCatalogRef.current,
      'pendingSessionIds',
      (current) => [...new Set([...current, sessionId])],
    )
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
        setCatalogStateField(
          setCatalogState,
          catalogKey,
          activeResponseByCatalogRef.current,
          'sessionsError',
          copy(language, 'Chưa thể đổi tên cuộc trò chuyện.', 'This conversation could not be renamed.'),
        )
      }
      return false
    } finally {
      pendingSessionIdSetRef.current.delete(sessionId)
      if (activeKeyRef.current === catalogKey) {
        setCatalogStateField(
          setCatalogState,
          catalogKey,
          activeResponseByCatalogRef.current,
          'pendingSessionIds',
          (current) => current.filter((id) => id !== sessionId),
        )
      }
    }
  }, [activateResponse, catalogKey, language, matchesCatalogCustomer, mode, persistCatalog, sessions, visibleResponse?.session.id])

  const setSessionPinned = useCallback(async (sessionId: string, pinned: boolean) => {
    const target = sessions.find((session) => session.id === sessionId)
    if (!target || target.mode !== mode || !matchesCatalogCustomer(target.customer_id) || pendingSessionIdSetRef.current.has(sessionId)) return false
    pendingSessionIdSetRef.current.add(sessionId)
    setCatalogStateField(
      setCatalogState,
      catalogKey,
      activeResponseByCatalogRef.current,
      'pendingSessionIds',
      (current) => [...new Set([...current, sessionId])],
    )
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
        setCatalogStateField(
          setCatalogState,
          catalogKey,
          activeResponseByCatalogRef.current,
          'sessionsError',
          copy(language, 'Chưa thể đổi trạng thái ghim.', 'The pin state could not be changed.'),
        )
      }
      return false
    } finally {
      pendingSessionIdSetRef.current.delete(sessionId)
      if (activeKeyRef.current === catalogKey) {
        setCatalogStateField(
          setCatalogState,
          catalogKey,
          activeResponseByCatalogRef.current,
          'pendingSessionIds',
          (current) => current.filter((id) => id !== sessionId),
        )
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
    setCatalogStateField(
      setCatalogState,
      catalogKey,
      activeResponseByCatalogRef.current,
      'openingSessionId',
      linked.id,
    )
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
        if (activeKeyRef.current === catalogKey) {
          setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'openingSessionId', null)
        }
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

function createCatalogState(
  catalogKey: string | null,
  activeResponseByCatalog: Map<string, CustomerKaelConversationResponse | null>,
): CustomerKaelCatalogState {
  return {
    activeResponse: catalogKey ? activeResponseByCatalog.get(catalogKey) ?? null : null,
    catalogKey,
    creatingSession: false,
    openingSessionId: null,
    pendingSessionIds: [],
    sending: false,
    sessions: catalogKey ? catalogMemory.get(catalogKey) ?? [] : [],
    sessionsError: null,
    sessionsLoading: Boolean(catalogKey && !catalogMemory.has(catalogKey)),
  }
}

function catalogStateForKey(
  current: CustomerKaelCatalogState,
  catalogKey: string | null,
  activeResponseByCatalog: Map<string, CustomerKaelConversationResponse | null>,
) {
  return current.catalogKey === catalogKey
    ? current
    : createCatalogState(catalogKey, activeResponseByCatalog)
}

function patchCatalogState(
  setState: Dispatch<SetStateAction<CustomerKaelCatalogState>>,
  catalogKey: string | null,
  activeResponseByCatalog: Map<string, CustomerKaelConversationResponse | null>,
  patch: Partial<Omit<CustomerKaelCatalogState, 'catalogKey'>>,
) {
  setState((current) => ({
    ...catalogStateForKey(current, catalogKey, activeResponseByCatalog),
    ...patch,
    catalogKey,
  }))
}

function setCatalogStateField<
  Field extends Exclude<keyof CustomerKaelCatalogState, 'catalogKey'>,
>(
  setState: Dispatch<SetStateAction<CustomerKaelCatalogState>>,
  catalogKey: string | null,
  activeResponseByCatalog: Map<string, CustomerKaelConversationResponse | null>,
  field: Field,
  next: SetStateAction<CustomerKaelCatalogState[Field]>,
) {
  setState((current) => {
    const scoped = catalogStateForKey(current, catalogKey, activeResponseByCatalog)
    const value = typeof next === 'function'
      ? (next as (previous: CustomerKaelCatalogState[Field]) => CustomerKaelCatalogState[Field])(scoped[field])
      : next
    return { ...scoped, [field]: value } as CustomerKaelCatalogState
  })
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
