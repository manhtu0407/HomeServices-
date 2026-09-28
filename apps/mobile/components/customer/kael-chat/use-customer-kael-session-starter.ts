import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import type { AppLanguage } from '@/lib/app-language'
import type {
  CustomerKaelConversationMode,
  CustomerKaelConversationResponse,
} from '@/lib/api-types/customer'
import { generateClientRequestId } from '@/lib/client-request-id'
import { localizeKaelConversationFailure } from '@/lib/kael-conversation-failure'
import { customerKaelConversationService } from '@/lib/services'

import { customerConversationCopy as copy } from './customer-kael-conversation-catalog'
import { createLocalVisualAuditConversation } from './customer-kael-local-visual-audit'
import {
  catalogMemory,
  patchCatalogState,
  setCatalogStateField,
  type CustomerKaelCatalogState,
} from './customer-kael-conversation-catalog-state'
import { writeCustomerKaelSessionCatalog } from './customer-kael-session-catalog-cache'

type Props = {
  activateResponse: (response: CustomerKaelConversationResponse) => boolean
  activeKeyRef: MutableRefObject<string | null>
  activeResponseByCatalogRef: MutableRefObject<Map<string, CustomerKaelConversationResponse | null>>
  catalogKey: string | null
  customerId: string | null
  language: AppLanguage
  localVisualAuditSession: boolean
  matchesCatalogCustomer: (candidateCustomerId: string) => boolean
  mode: CustomerKaelConversationMode
  operationLockRef: MutableRefObject<number | null>
  operationRequestRef: MutableRefObject<number>
  options: { suppressActiveResponse?: boolean }
  sessionCreateRequestRef: MutableRefObject<Promise<CustomerKaelConversationResponse | null> | null>
  setCatalogState: Dispatch<SetStateAction<CustomerKaelCatalogState>>
  suppressInitialActiveResponse: boolean
  visibleResponse: CustomerKaelConversationResponse | null
}

export function useCustomerKaelSessionStarter({
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
}: Props) {
  const resetToBlank = useCallback(() => {
    operationRequestRef.current += 1
    operationLockRef.current = null
    sessionCreateRequestRef.current = null
    if (catalogKey) activeResponseByCatalogRef.current.set(catalogKey, null)
    if (customerId && catalogKey && !localVisualAuditSession) {
      void writeCustomerKaelSessionCatalog(
        customerId,
        mode,
        catalogMemory.get(catalogKey) ?? [],
        null,
      )
    }
    patchCatalogState(setCatalogState, catalogKey, activeResponseByCatalogRef.current, {
      activeResponse: null,
      creatingSession: false,
      openingSessionId: null,
      sending: false,
      sessionsError: null,
    })
  }, [activeResponseByCatalogRef, catalogKey, customerId, localVisualAuditSession, mode, operationLockRef, operationRequestRef, sessionCreateRequestRef, setCatalogState])

  const startNewSession = useCallback((
    clientRequestId = generateClientRequestId(),
    onFailure?: (message: string) => void,
  ) => {
    if (!customerId || !catalogKey) return Promise.resolve(null)
    const inFlight = sessionCreateRequestRef.current
    if (inFlight) return inFlight
    if (operationLockRef.current !== null) return Promise.resolve(null)
    const requestId = operationRequestRef.current + 1
    operationRequestRef.current = requestId
    operationLockRef.current = requestId
    patchCatalogState(setCatalogState, catalogKey, activeResponseByCatalogRef.current, {
      creatingSession: true,
      sessionsError: null,
    })
    let request!: Promise<CustomerKaelConversationResponse | null>
    request = (async () => {
      try {
        const created = localVisualAuditSession
          ? { data: createLocalVisualAuditConversation(customerId, mode, clientRequestId), success: true as const }
          : await customerKaelConversationService.create({
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
            const failureMessage = localizeKaelConversationFailure(
              created,
              language,
              copy(language, 'Chưa thể tạo cuộc trò chuyện mới.', 'A new conversation could not be created.'),
            )
            setCatalogStateField(
              setCatalogState,
              catalogKey,
              activeResponseByCatalogRef.current,
              'sessionsError',
              failureMessage,
            )
            onFailure?.(failureMessage)
          }
          return null
        }
        activateResponse(created.data)
        return created.data
      } catch {
        if (activeKeyRef.current === catalogKey) {
          const failureMessage = copy(language, 'Chưa thể tạo cuộc trò chuyện mới.', 'A new conversation could not be created.')
          setCatalogStateField(
            setCatalogState,
            catalogKey,
            activeResponseByCatalogRef.current,
            'sessionsError',
            failureMessage,
          )
          onFailure?.(failureMessage)
        }
        return null
      } finally {
        if (operationLockRef.current === requestId) {
          operationLockRef.current = null
          if (activeKeyRef.current === catalogKey) {
            setCatalogStateField(setCatalogState, catalogKey, activeResponseByCatalogRef.current, 'creatingSession', false)
          }
        }
        if (sessionCreateRequestRef.current === request) sessionCreateRequestRef.current = null
      }
    })()
    sessionCreateRequestRef.current = request
    return request
  }, [activateResponse, activeKeyRef, activeResponseByCatalogRef, catalogKey, customerId, language, localVisualAuditSession, matchesCatalogCustomer, mode, operationLockRef, operationRequestRef, sessionCreateRequestRef, setCatalogState])

  const ensureActiveSession = useCallback(async (clientRequestId?: string) => {
    if (visibleResponse) return visibleResponse
    const currentResponse = catalogKey ? activeResponseByCatalogRef.current.get(catalogKey) : null
    if (
      !options.suppressActiveResponse &&
      !suppressInitialActiveResponse &&
      currentResponse?.session.mode === mode
    ) return currentResponse
    const inFlight = sessionCreateRequestRef.current
    if (inFlight) return inFlight
    return startNewSession(clientRequestId)
  }, [activeResponseByCatalogRef, catalogKey, mode, options.suppressActiveResponse, sessionCreateRequestRef, startNewSession, suppressInitialActiveResponse, visibleResponse])

  return { ensureActiveSession, resetToBlank, startNewSession }
}
