import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { AppLanguage } from '@/lib/app-language'
import type {
  CustomerKaelConversationMode,
  CustomerKaelConversationResponse,
  CustomerKaelConversationSession,
} from '@/lib/api-types/customer'
import { useAuth } from '@/lib/auth-provider'
import { generateClientRequestId } from '@/lib/client-request-id'
import {
  isAmbiguousKaelConversationFailure,
  kaelConversationOutcomeUncertainCopy,
  localizeKaelConversationFailure,
} from '@/lib/kael-conversation-failure'
import { customerKaelConversationService } from '@/lib/services'

import {
  readCustomerKaelSessionCatalogState,
  writeCustomerKaelSessionCatalog,
} from './customer-kael-session-catalog-cache'
import {
  customerCatalogKey,
  customerConversationCopy as copy,
  sortSessions,
  upsertSession,
} from './customer-kael-conversation-catalog'
import {
  fetchCustomerConversation,
  isAmbiguousConversationTurnFailure,
  recoverCommittedConversationTurn,
} from './customer-kael-conversation-requests'
import {
  activeResponseByCatalogMemory,
  archivedSessionIdsForCatalog,
  catalogMemory,
  createCatalogState,
  CUSTOMER_SESSION_PREFETCH_LIMIT,
  patchCatalogState,
  responseMemory,
  setCatalogStateField,
} from './customer-kael-conversation-catalog-state'
import {
  forwardCustomerKaelStreamEvent,
  type CustomerKaelTurnStreamOptions,
} from './customer-kael-conversation-stream-options'
import { useCustomerKaelSessionStarter } from './use-customer-kael-session-starter'

export function useCustomerKaelConversations(
  mode: CustomerKaelConversationMode,
  language: AppLanguage,
  options: {
    suppressActiveResponse?: boolean
    suppressActiveResponseUntilNewSession?: boolean
  } = {},
) {
  const { session: authSession } = useAuth()
  const customerId = authSession?.user.id ?? null
  const localVisualAuditSession = authSession?.user.app_metadata?.provider === 'local-visual-audit'
  const catalogKey = customerId ? customerCatalogKey(customerId, mode) : null
  const activeKeyRef = useRef(catalogKey)
  const activeModeRef = useRef(mode)
  const activeResponseByCatalogRef = useRef(activeResponseByCatalogMemory)
  const visualAuditOwnerByCatalogRef = useRef(new Map<string, string>())
  const listRequestRef = useRef(new Map<string, Promise<CustomerKaelConversationSession[]>>())
  const sessionCreateRequestRef = useRef<Promise<CustomerKaelConversationResponse | null> | null>(null)
  const operationRequestRef = useRef(0)
  const operationLockRef = useRef<number | null>(null)
  const catalogRevisionRef = useRef(0)
  const pendingSessionIdSetRef = useRef(new Set<string>())
  const archiveTombstones = useMemo(() => archivedSessionIdsForCatalog(catalogKey), [catalogKey])
  const [storedCatalogState, setCatalogState] = useState(() => createCatalogState(
    catalogKey,
    activeResponseByCatalogMemory,
  ))
  const [suppressInitialActiveResponse, setSuppressInitialActiveResponse] = useState(
    Boolean(options.suppressActiveResponseUntilNewSession),
  )
  const catalogState = storedCatalogState.catalogKey === catalogKey
    ? storedCatalogState
    : createCatalogState(catalogKey, activeResponseByCatalogMemory)
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
  useLayoutEffect(() => {
    activeKeyRef.current = catalogKey
    activeModeRef.current = mode
    return () => {
      // Ignore async catalog work once this conversation owner is no longer mounted.
      if (activeKeyRef.current === catalogKey) activeKeyRef.current = null
    }
  }, [catalogKey, mode])

  const matchesCatalogCustomer = useCallback((candidateCustomerId: string) => {
    if (!customerId || !catalogKey) return false
    if (!localVisualAuditSession) return candidateCustomerId === customerId
    const serverScopedCustomerId = visualAuditOwnerByCatalogRef.current.get(catalogKey)
    return !serverScopedCustomerId || candidateCustomerId === serverScopedCustomerId
  }, [catalogKey, customerId, localVisualAuditSession])

  const visibleResponse = !options.suppressActiveResponse && !suppressInitialActiveResponse && activeResponse?.session.mode === mode
    && (localVisualAuditSession || activeResponse.session.customer_id === customerId)
    ? activeResponse
    : null

  const persistCatalog = useCallback((nextSessions: CustomerKaelConversationSession[]) => {
    if (!customerId || !catalogKey) return []
    catalogRevisionRef.current += 1
    const catalogOwnerId = localVisualAuditSession
      ? visualAuditOwnerByCatalogRef.current.get(catalogKey) ?? nextSessions[0]?.customer_id ?? null
      : customerId
    if (localVisualAuditSession && catalogOwnerId) {
      visualAuditOwnerByCatalogRef.current.set(catalogKey, catalogOwnerId)
    }
    const scoped = sortSessions(nextSessions.filter((session) => (
      !archiveTombstones.has(session.id)
      && session.customer_id === catalogOwnerId
      && session.mode === mode
    ))).slice(0, 20)
    catalogMemory.set(catalogKey, scoped)
    if (activeKeyRef.current === catalogKey) {
      setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'sessions', scoped)
    }
    if (!localVisualAuditSession) {
      const activeSessionId = activeResponseByCatalogRef.current.get(catalogKey)?.session.id ?? null
      void writeCustomerKaelSessionCatalog(customerId, mode, scoped, activeSessionId)
    }
    return scoped
  }, [archiveTombstones, catalogKey, customerId, localVisualAuditSession, mode])
  const activateResponse = useCallback((response: CustomerKaelConversationResponse) => {
    if (
      !customerId
      || !catalogKey
      || !matchesCatalogCustomer(response.session.customer_id)
      || response.session.mode !== mode
      || activeKeyRef.current !== catalogKey
    ) return false
    setSuppressInitialActiveResponse(false)
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
    if (localVisualAuditSession) {
      const localSessions = catalogMemory.get(catalogKey) ?? []
      if (activeKeyRef.current === catalogKey) {
        patchCatalogState(setCatalogState, catalogKey, activeResponseByCatalogRef.current, {
          sessions: localSessions,
          sessionsError: null,
          sessionsLoading: false,
        })
      }
      return Promise.resolve(localSessions)
    }
    const existing = listRequestRef.current.get(catalogKey)
    if (existing) return existing
    if (!catalogMemory.has(catalogKey)) {
      setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'sessionsLoading', true)
    }
    setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'sessionsError', null)
    const refreshRevision = catalogRevisionRef.current

    const request = customerKaelConversationService.list(mode)
      .then((result) => {
        if (catalogRevisionRef.current !== refreshRevision) return catalogMemory.get(catalogKey) ?? []
        if (!result.success) {
          if (activeKeyRef.current === catalogKey && !catalogMemory.has(catalogKey)) {
            setCatalogStateField(
              setCatalogState,
              catalogKey,
              activeResponseByCatalogRef.current,
              'sessionsError',
              localizeKaelConversationFailure(
                result,
                language,
                copy(language, 'Chưa tải được các cuộc trò chuyện. Vui lòng thử lại.', 'Conversations could not be loaded. Please try again.'),
              ),
            )
          }
          return catalogMemory.get(catalogKey) ?? []
        }
        const catalogOwnerId = localVisualAuditSession
          ? result.data.sessions[0]?.customer_id ?? visualAuditOwnerByCatalogRef.current.get(catalogKey) ?? null
          : customerId
        if (localVisualAuditSession && catalogOwnerId) {
          visualAuditOwnerByCatalogRef.current.set(catalogKey, catalogOwnerId)
        }
        const scoped = sortSessions(result.data.sessions.filter((session) => (
          !archiveTombstones.has(session.id)
          && session.customer_id === catalogOwnerId
          && session.mode === mode
        )))
        catalogMemory.set(catalogKey, scoped)
        if (!localVisualAuditSession) {
          const activeSessionId = activeResponseByCatalogRef.current.get(catalogKey)?.session.id ?? null
          void writeCustomerKaelSessionCatalog(customerId, mode, scoped, activeSessionId)
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
  }, [archiveTombstones, catalogKey, customerId, language, localVisualAuditSession, mode])

  useEffect(() => {
    operationRequestRef.current += 1
    operationLockRef.current = null
    sessionCreateRequestRef.current = null
    pendingSessionIdSetRef.current.clear()
    if (!customerId || !catalogKey) return
    if (localVisualAuditSession) {
      void refreshSessions()
      return
    }
    let cancelled = false
    void readCustomerKaelSessionCatalogState(customerId, mode).then(async (cached) => {
      if (cancelled || !cached || activeKeyRef.current !== catalogKey) return
      const scoped = sortSessions(cached.sessions.filter((item) => (
        !archiveTombstones.has(item.id)
        && item.customer_id === customerId
        && item.mode === mode
      )))
      catalogMemory.set(catalogKey, scoped)
      patchCatalogState(setCatalogState, catalogKey, activeResponseByCatalogRef.current, {
        sessions: scoped,
        sessionsLoading: false,
      })
      if (!cached.activeSessionId || activeResponseByCatalogRef.current.get(catalogKey)) return
      const activeSummary = scoped.find((session) => session.id === cached.activeSessionId)
      if (!activeSummary) return
      if (activeSummary.case_session_id) {
        activateResponse({ session: activeSummary, turns: [] })
        return
      }
      const loaded = await fetchCustomerConversation(activeSummary.id)
      if (
        cancelled
        || !loaded?.success
        || activeKeyRef.current !== catalogKey
        || !matchesCatalogCustomer(loaded.data.session.customer_id)
        || loaded.data.session.mode !== mode
      ) return
      activateResponse(loaded.data)
    }).finally(() => {
      if (!cancelled) void refreshSessions()
    })
    return () => {
      cancelled = true
    }
  }, [
    activateResponse,
    archiveTombstones,
    catalogKey,
    customerId,
    localVisualAuditSession,
    matchesCatalogCustomer,
    mode,
    refreshSessions,
  ])

  useEffect(() => {
    if (!customerId || !catalogKey) return
    sessions
      .filter((summary) => !summary.case_session_id)
      .slice(0, CUSTOMER_SESSION_PREFETCH_LIMIT)
      .forEach((summary) => {
        const cached = responseMemory.get(summary.id)
        if (cached && matchesCatalogCustomer(cached.session.customer_id) && cached.session.mode === mode) return
        void fetchCustomerConversation(summary.id).then((loaded) => {
          if (
            !loaded?.success ||
            activeKeyRef.current !== catalogKey ||
            !matchesCatalogCustomer(loaded.data.session.customer_id) ||
            loaded.data.session.mode !== mode
          ) return
          responseMemory.set(summary.id, loaded.data)
        })
      })
  }, [catalogKey, customerId, matchesCatalogCustomer, mode, sessions])

  const { ensureActiveSession, resetToBlank, startNewSession } = useCustomerKaelSessionStarter({
    activateResponse,
    activeKeyRef,
    activeResponseByCatalogRef,
    catalogKey,
    customerId,
    language,
    localVisualAuditSession,
    matchesCatalogCustomer,
    mode,
    operationLockRef,
    operationRequestRef,
    options,
    sessionCreateRequestRef,
    setCatalogState,
    suppressInitialActiveResponse,
    visibleResponse,
  })

  const openSession = useCallback(async (sessionId: string) => {
    if (!customerId || !catalogKey) return null
    const summary = sessions.find((session) => session.id === sessionId)
    if (!summary || !matchesCatalogCustomer(summary.customer_id) || summary.mode !== mode) return null
    const cached = responseMemory.get(sessionId)
    if (cached && matchesCatalogCustomer(cached.session.customer_id) && cached.session.mode === mode) {
      operationRequestRef.current += 1
      operationLockRef.current = null
      patchCatalogState(setCatalogState, catalogKey, activeResponseByCatalogRef.current, {
        openingSessionId: null,
        sessionsError: null,
      })
      activateResponse(cached)
      return cached
    }
    if (summary.case_session_id) {
      operationRequestRef.current += 1
      operationLockRef.current = null
      patchCatalogState(setCatalogState, catalogKey, activeResponseByCatalogRef.current, {
        openingSessionId: null,
        sessionsError: null,
      })
      const linkedResponse = { session: summary, turns: [] }
      return activateResponse(linkedResponse) ? linkedResponse : null
    }
    if (operationLockRef.current !== null) return null

    const requestId = operationRequestRef.current + 1
    operationRequestRef.current = requestId
    operationLockRef.current = requestId
    patchCatalogState(setCatalogState, catalogKey, activeResponseByCatalogRef.current, {
      openingSessionId: sessionId,
      sessionsError: null,
    })
    try {
      const loaded = await fetchCustomerConversation(sessionId)
      if (
        !loaded?.success
        || operationRequestRef.current !== requestId
        || activeKeyRef.current !== catalogKey
        || !matchesCatalogCustomer(loaded.data.session.customer_id)
        || loaded.data.session.mode !== mode
      ) {
        if (!loaded?.success && activeKeyRef.current === catalogKey) {
          setCatalogStateField(
            setCatalogState,
            catalogKey,
            activeResponseByCatalogRef.current,
            'sessionsError',
            localizeKaelConversationFailure(
              loaded ?? { code: 'NETWORK_ERROR', status: 0 },
              language,
              copy(language, 'Chưa thể mở cuộc trò chuyện này.', 'This conversation could not be opened.'),
            ),
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

  const sendConversationTurn = useCallback(async (
    message: string,
    options?: CustomerKaelTurnStreamOptions,
  ) => {
    const content = message.trim()
    if (!content && !options?.mediaRefs?.length) return null
    if (localVisualAuditSession) {
      setCatalogStateField(
        setCatalogState,
        catalogKey,
        activeResponseByCatalogRef.current,
        'sessionsError',
        copy(language,
          'Chế độ xem trước chỉ dùng để kiểm tra giao diện. Đăng nhập tài khoản khách hàng thật để gửi tin nhắn.',
          'Preview audit mode is for visual checks only. Sign in with a real Customer account to send messages.'),
      )
      return null
    }
    if (options?.signal?.aborted) return null
    if (operationLockRef.current !== null && !sessionCreateRequestRef.current) return null
    const target = await ensureActiveSession()
    if (
      !target || target.session.mode !== mode || operationLockRef.current !== null ||
      options?.signal?.aborted
    ) return null
    if (target.session.case_session_id) {
      setCatalogStateField(
        setCatalogState,
        catalogKey,
        activeResponseByCatalogRef.current,
        'sessionsError',
        copy(language, 'Hãy tiếp tục trong phiên Xử lý công việc đang liên kết.', 'Continue in the linked Work handling session.'),
      )
      return null
    }
    const targetId = target.session.id
    const requestId = operationRequestRef.current + 1
    operationRequestRef.current = requestId
    operationLockRef.current = requestId
    patchCatalogState(setCatalogState, catalogKey, activeResponseByCatalogRef.current, {
      sending: true,
      sessionsError: null,
    })
    try {
      const clientRequestId = generateClientRequestId()
      const turnInput = {
        client_request_id: clientRequestId,
        language,
        message: content,
        ...(options?.mediaRefs?.length ? { media_refs: [...options.mediaRefs] } : {}),
      }
      const isCurrentStream = () => (
        operationRequestRef.current === requestId
        && activeModeRef.current === mode
        && activeKeyRef.current === catalogKey
      )
      const streamed = await customerKaelConversationService.streamTurn(
        targetId,
        turnInput,
        {
          onResponseDelta: (event) => forwardCustomerKaelStreamEvent(
            event,
            isCurrentStream,
            options?.onResponseDelta,
          ),
          onResponseEvent: (event) => forwardCustomerKaelStreamEvent(
            event,
            isCurrentStream,
            options?.onResponseEvent,
          ),
          onReasoning: (event) => forwardCustomerKaelStreamEvent(
            event,
            isCurrentStream,
            options?.onReasoning,
          ),
        },
        options?.signal,
      )
      const sent = !streamed.success && streamed.code === 'STREAM_UNSUPPORTED' && !options?.signal?.aborted
        ? await customerKaelConversationService.sendTurn(targetId, turnInput, options?.signal)
        : streamed
      if (!sent.success && sent.code === 'REQUEST_CANCELLED') {
        const committed = await recoverCommittedConversationTurn(targetId, clientRequestId)
        if (
          committed && operationRequestRef.current === requestId
          && activeModeRef.current === mode && activeKeyRef.current === catalogKey
        ) {
          options?.onResponseCommitted?.()
          activateResponse(committed)
          return committed
        }
        options?.onOutcomeUncertain?.()
        return null
      }
      const committed = sent.success
        ? sent.data
        : isAmbiguousConversationTurnFailure(sent)
          ? await recoverCommittedConversationTurn(targetId, clientRequestId)
          : null
      if (
        !committed
        || operationRequestRef.current !== requestId
        || activeModeRef.current !== mode
        || activeKeyRef.current !== catalogKey
      ) {
        if (committed || (!sent.success && isAmbiguousKaelConversationFailure(sent))) options?.onOutcomeUncertain?.()
        if (!committed && operationRequestRef.current === requestId && activeKeyRef.current === catalogKey) {
          setCatalogStateField(
            setCatalogState,
            catalogKey,
            activeResponseByCatalogRef.current,
            'sessionsError',
            !sent.success && isAmbiguousKaelConversationFailure(sent)
              ? kaelConversationOutcomeUncertainCopy(language)
              : !sent.success
                ? localizeKaelConversationFailure(
                    sent,
                    language,
                    copy(language, 'Kael chưa thể trả lời lúc này.', 'Kael could not reply right now.'),
                  )
                : copy(language, 'Kael chưa thể trả lời lúc này.', 'Kael could not reply right now.'),
          )
        }
        return null
      }
      options?.onResponseCommitted?.()
      activateResponse(committed)
      return committed
    } catch {
      options?.onOutcomeUncertain?.()
      if (operationRequestRef.current === requestId && activeKeyRef.current === catalogKey) {
        setCatalogStateField(
          setCatalogState,
          catalogKey,
          activeResponseByCatalogRef.current,
          'sessionsError',
          kaelConversationOutcomeUncertainCopy(language),
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
  }, [activateResponse, catalogKey, ensureActiveSession, language, localVisualAuditSession, mode])

  const archiveSession = useCallback(async (sessionId: string) => {
    const target = sessions.find((session) => session.id === sessionId)
    // A turn in flight holds the operation lock; archiving under it would race the server append.
    if (operationLockRef.current !== null) return false
    if (!target || target.mode !== mode || !matchesCatalogCustomer(target.customer_id) || pendingSessionIdSetRef.current.has(sessionId)) return false
    const previous = sessions
    const linkedCaseWork = Boolean(target.case_session_id)
    archiveTombstones.add(sessionId)
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
    let failureMessage = copy(language, 'Chưa thể xóa cuộc trò chuyện.', 'This conversation could not be removed.')
    try {
      if (localVisualAuditSession) {
        if (linkedCaseWork) {
          persistCatalog((catalogKey ? catalogMemory.get(catalogKey) ?? sessions : sessions)
            .filter((session) => session.id !== sessionId))
          if (visibleResponse?.session.id === sessionId) resetToBlank()
        }
        responseMemory.delete(sessionId)
        return true
      }
      const archived = await customerKaelConversationService.archive(
        sessionId,
        linkedCaseWork,
      )
      if (!archived.success) {
        failureMessage = localizeKaelConversationFailure(
          archived,
          language,
          failureMessage,
        )
        throw new Error('archive_failed')
      }
      if (linkedCaseWork) {
        persistCatalog((catalogKey ? catalogMemory.get(catalogKey) ?? sessions : sessions)
          .filter((session) => session.id !== sessionId))
        if (visibleResponse?.session.id === sessionId) resetToBlank()
      }
      responseMemory.delete(sessionId)
      return true
    } catch {
      archiveTombstones.delete(sessionId)
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
          failureMessage,
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
  }, [archiveTombstones, catalogKey, language, localVisualAuditSession, matchesCatalogCustomer, mode, persistCatalog, resetToBlank, sessions, visibleResponse?.session.id])

  const updateSessionMetadata = useCallback(async (
    sessionId: string,
    localPatch: Pick<Partial<CustomerKaelConversationSession>, 'pinned_at' | 'title'>,
    request: () => ReturnType<typeof customerKaelConversationService.rename>,
    fallbackFailure: string,
  ) => {
    const target = sessions.find((session) => session.id === sessionId)
    if (operationLockRef.current !== null) return false
    if (!target || target.mode !== mode || !matchesCatalogCustomer(target.customer_id) || pendingSessionIdSetRef.current.has(sessionId)) return false
    pendingSessionIdSetRef.current.add(sessionId)
    setCatalogStateField(
      setCatalogState,
      catalogKey,
      activeResponseByCatalogRef.current,
      'pendingSessionIds',
      (current) => [...new Set([...current, sessionId])],
    )
    let failureMessage = fallbackFailure
    try {
      if (localVisualAuditSession) {
        const updatedSession = { ...target, ...localPatch, updated_at: new Date().toISOString() }
        const cached = responseMemory.get(sessionId)
        if (cached) responseMemory.set(sessionId, { ...cached, session: updatedSession })
        persistCatalog(upsertSession(
          catalogKey ? catalogMemory.get(catalogKey) ?? sessions : sessions,
          updatedSession,
        ))
        if (visibleResponse?.session.id === sessionId && cached) {
          activateResponse({ ...cached, session: updatedSession })
        }
        return true
      }
      const updated = await request()
      if (!updated.success) {
        failureMessage = localizeKaelConversationFailure(updated, language, failureMessage)
        throw new Error('session_update_failed')
      }
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
          failureMessage,
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
  }, [activateResponse, catalogKey, language, localVisualAuditSession, matchesCatalogCustomer, mode, persistCatalog, sessions, visibleResponse?.session.id])

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return false
    return updateSessionMetadata(
      sessionId,
      { title: trimmed },
      () => customerKaelConversationService.rename(sessionId, { title: trimmed }),
      copy(language, 'Chưa thể đổi tên cuộc trò chuyện.', 'This conversation could not be renamed.'),
    )
  }, [language, updateSessionMetadata])

  const setSessionPinned = useCallback(async (sessionId: string, pinned: boolean) => updateSessionMetadata(
    sessionId,
    { pinned_at: pinned ? new Date().toISOString() : null },
    () => customerKaelConversationService.setPinned(sessionId, { pinned }),
    copy(language, 'Chưa thể đổi trạng thái ghim.', 'The pin state could not be changed.'),
  ), [language, updateSessionMetadata])

  const syncLinkedCaseSession = useCallback(async (caseSessionId: string) => {
    if (mode !== 'case' || !customerId || !catalogKey) return null
    const syncVersion = operationRequestRef.current
    const refreshed = await refreshSessions(true)
    const linked = refreshed.find((session) => session.case_session_id === caseSessionId)
    if (
      !linked
      || operationRequestRef.current !== syncVersion
      || operationLockRef.current !== null
      || activeKeyRef.current !== catalogKey
    ) return null
    const linkedResponse = { session: linked, turns: [] }
    return activateResponse(linkedResponse) ? linkedResponse : null
  }, [activateResponse, catalogKey, customerId, mode, refreshSessions])

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
    const linkedResponse = { session: linked, turns: [] }
    return activateResponse(linkedResponse) ? linkedResponse : null
  }, [activateResponse, catalogKey, customerId, mode, refreshSessions])

  return useMemo(() => ({
    activeResponse: visibleResponse,
    activeSessionId: visibleResponse?.session.id ?? null,
    archiveSession,
    busy: creatingSession || Boolean(openingSessionId) || sending,
    canCreateSession: Boolean(customerId) && !creatingSession && !openingSessionId && !sending,
    creatingSession,
    ensureActiveSession,
    isLocalVisualAuditSession: localVisualAuditSession,
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
    turns: visibleResponse?.turns ?? [],
  }), [
    archiveSession,
    creatingSession,
    customerId,
    ensureActiveSession,
    localVisualAuditSession,
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
