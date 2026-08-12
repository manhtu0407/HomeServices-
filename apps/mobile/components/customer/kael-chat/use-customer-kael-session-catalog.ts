import type { LocalDeal, ServiceType } from '@nestscout/shared'
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import type { useRouter } from 'expo-router'

import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatResponse } from '@/lib/api-types'
import type { CustomerKaelConversationSession } from '@/lib/api-types/customer'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { initialKaelReasoningReceiptState } from '@/lib/kael-reasoning-receipt'
import { kaelChatService } from '@/lib/services'

import { clearPendingKaelChatDraft } from './pending-intake'
import { localizeKaelRequestFailure } from './customer-kael-chat-helpers'
import type { CustomerKaelMode } from '../ui/types'
import type { useCustomerKaelChatUiState } from './use-customer-kael-chat-ui-state'
import type { useCustomerKaelConversationState } from './use-customer-kael-conversation-state'
import type { useCustomerKaelConversations } from './use-customer-kael-conversations'
import type { useKaelProcessLineController } from './use-kael-process-line-controller'

type ChatUi = ReturnType<typeof useCustomerKaelChatUiState>
type Conversation = ReturnType<typeof useCustomerKaelConversationState>
type Conversations = ReturnType<typeof useCustomerKaelConversations>
type ProcessController = ReturnType<typeof useKaelProcessLineController>
type Router = ReturnType<typeof useRouter>
type WorkflowActions = ReturnType<typeof useFrontendWorkflow>['actions']
type CaseSessionFetchResult = Awaited<ReturnType<typeof kaelChatService.get>>

const CASE_SESSION_PREFETCH_LIMIT = 6
const CASE_SESSION_MEMORY_LIMIT = 40
const caseSessionMemory = new Map<string, KaelChatResponse>()

export function useCustomerKaelSessionCatalog({
  blankCaseWorkRoute,
  chatUi,
  conversation,
  conversations,
  language,
  mode,
  normalChatRoute,
  pendingDraftOwnerId,
  processController,
  routeJobId,
  router,
  selectedServiceRef,
  workflowActions,
  workflowCaseDeal,
}: {
  blankCaseWorkRoute: string
  chatUi: ChatUi
  conversation: Conversation
  conversations: Conversations
  language: AppLanguage
  mode: CustomerKaelMode
  normalChatRoute: string
  pendingDraftOwnerId: string | null
  processController: ProcessController
  routeJobId: string | null
  router: Router
  selectedServiceRef: MutableRefObject<ServiceType | null>
  workflowActions: WorkflowActions
  workflowCaseDeal: LocalDeal | null
}) {
  const caseSessionLoadsRef = useRef(new Map<string, Promise<CaseSessionFetchResult | null>>())
  const loadGenerationRef = useRef(0)
  const activeCatalogCaseJobId = conversations.activeResponse?.session.case_job_id ?? null
  const activeCatalogCaseSessionId = conversations.activeResponse?.session.case_session_id ?? null
  const hydrateRemoteJobById = workflowActions.hydrateRemoteJobById
  const rejectConversationHydration = conversation.rejectHydration
  const resolveConversationHydration = conversation.resolveHydration
  const setConversationLoading = conversation.setLoading
  const syncLinkedJobSession = conversations.syncLinkedJobSession

  const findCatalogCaseSession = useCallback((caseSessionId: string) => (
    conversations.sessions.find((session) => session.case_session_id === caseSessionId) ?? null
  ), [conversations.sessions])

  const fetchCatalogCaseSession = useCallback((target: CustomerKaelConversationSession) => {
    const caseSessionId = target.case_session_id
    if (!caseSessionId) return Promise.resolve(null)
    const cacheKey = caseSessionCacheKey(target.customer_id, caseSessionId)
    const inFlight = caseSessionLoadsRef.current.get(cacheKey)
    if (inFlight) return inFlight

    const request = kaelChatService.get(caseSessionId)
      .then((loaded) => {
        if (loaded.success && matchesCatalogCaseSession(target, loaded.data)) {
          rememberCaseSession(cacheKey, loaded.data)
        }
        return loaded
      })
      .catch(() => null)
      .finally(() => {
        if (caseSessionLoadsRef.current.get(cacheKey) === request) {
          caseSessionLoadsRef.current.delete(cacheKey)
        }
      })
    caseSessionLoadsRef.current.set(cacheKey, request)
    return request
  }, [])

  const resolveCatalogCaseSession = useCallback((loaded: KaelChatResponse) => {
    selectedServiceRef.current = loaded.session.service_type
    resolveConversationHydration(loaded, false)
    if (
      loaded.session.job_id &&
      typeof hydrateRemoteJobById === 'function'
    ) {
      void hydrateRemoteJobById(loaded.session.job_id)
    }
  }, [hydrateRemoteJobById, resolveConversationHydration, selectedServiceRef])

  const loadCatalogCaseSession = useCallback((caseSessionId: string) => {
    const target = findCatalogCaseSession(caseSessionId)
    if (!target) return Promise.resolve(false)
    const generation = loadGenerationRef.current + 1
    loadGenerationRef.current = generation
    const cached = readRememberedCaseSession(target)

    if (cached) {
      resolveCatalogCaseSession(cached)
      void fetchCatalogCaseSession(target).then((refreshed) => {
        if (
          loadGenerationRef.current === generation &&
          refreshed?.success &&
          matchesCatalogCaseSession(target, refreshed.data)
        ) {
          resolveCatalogCaseSession(refreshed.data)
        }
      })
      return Promise.resolve(true)
    }

    setConversationLoading(true)
    return fetchCatalogCaseSession(target).then((loaded) => {
      if (loadGenerationRef.current !== generation) return false
      if (!loaded) {
        rejectConversationHydration(language === 'vi'
          ? 'Kael tạm thời chưa phản hồi.'
          : 'Kael is temporarily unavailable.')
        return false
      }
      if (!loaded.success) {
        rejectConversationHydration(localizeKaelRequestFailure(loaded, language))
        return false
      }
      if (!matchesCatalogCaseSession(target, loaded.data)) {
        rejectConversationHydration(language === 'vi'
          ? 'Không thể mở phiên xử lý công việc này.'
          : 'This Work handling session could not be opened.')
        return false
      }
      resolveCatalogCaseSession(loaded.data)
      return true
    })
  }, [
    fetchCatalogCaseSession,
    findCatalogCaseSession,
    language,
    rejectConversationHydration,
    resolveCatalogCaseSession,
    setConversationLoading,
  ])

  useEffect(() => {
    if (mode !== 'case') return
    conversations.sessions
      .filter((session) => Boolean(session.case_session_id))
      .slice(0, CASE_SESSION_PREFETCH_LIMIT)
      .forEach((session) => {
        if (!readRememberedCaseSession(session)) void fetchCatalogCaseSession(session)
      })
  }, [conversations.sessions, fetchCatalogCaseSession, mode])

  useEffect(() => {
    if (mode !== 'case' || !conversation.chat) return
    const target = findCatalogCaseSession(conversation.chat.session.id)
    if (!target || !matchesCatalogCaseSession(target, conversation.chat)) return
    rememberCaseSession(
      caseSessionCacheKey(target.customer_id, conversation.chat.session.id),
      conversation.chat,
    )
  }, [conversation.chat, findCatalogCaseSession, mode])

  const automaticCaseJobId = mode === 'case' && !chatUi.blankCaseTransition
    ? routeJobId
    : null

  useEffect(() => {
    if (!automaticCaseJobId || activeCatalogCaseJobId === automaticCaseJobId) return
    void syncLinkedJobSession(automaticCaseJobId)
  }, [activeCatalogCaseJobId, automaticCaseJobId, syncLinkedJobSession])

  useEffect(() => {
    if (
      mode !== 'case' ||
      !activeCatalogCaseSessionId ||
      conversation.chat?.session.id === activeCatalogCaseSessionId ||
      (routeJobId && activeCatalogCaseJobId !== routeJobId)
    ) return
    void loadCatalogCaseSession(activeCatalogCaseSessionId)
  }, [
    activeCatalogCaseJobId,
    activeCatalogCaseSessionId,
    conversation.chat?.session.id,
    loadCatalogCaseSession,
    mode,
    routeJobId,
  ])

  useEffect(() => () => {
    loadGenerationRef.current += 1
    caseSessionLoadsRef.current.clear()
  }, [])

  const resetConversationVisualState = useCallback(() => {
    loadGenerationRef.current += 1
    chatUi.setModeMenuOpen(false)
    chatUi.setSessionMenuOpen(false)
    chatUi.setCaseEditOpen(false)
    chatUi.setDraft('')
    chatUi.setVoiceTranscript('')
    chatUi.setUploadingMedia(false)
    chatUi.setAgenticAdjustmentOpen(false)
    chatUi.setAgenticAdjustmentText('')
    chatUi.setAgenticRejectOpen(false)
    chatUi.setAgenticRejectReason('')
    chatUi.setAgenticEvidenceRejectOpen(false)
    chatUi.setAgenticEvidenceReason('')
    chatUi.setCaseQuoteRejectOpen(false)
    chatUi.setCaseQuoteRejectReason('')
    conversation.setComposerMediaDrafts([])
    conversation.setError(null)
    conversation.setLoading(false)
    conversation.setPendingNormalMessage(null)
    conversation.setReasoningReceipt(initialKaelReasoningReceiptState)
    conversation.setStreamingReply(null)
    conversation.setAssistantTurns((current) => current.filter((turn) => (
      turn.surface !== (mode === 'normal' ? 'customer_normal' : 'customer_case')
    )))
    conversation.setChat(null)
    conversation.setTurns([])
    processController.stopProcessLines()

    if (mode === 'case') {
      if (pendingDraftOwnerId) void clearPendingKaelChatDraft(pendingDraftOwnerId)
      conversation.setPendingDraftState(null)
      conversation.setRouteDraftEvidencePending(false)
    }
    selectedServiceRef.current = null
  }, [chatUi, conversation, mode, pendingDraftOwnerId, processController, selectedServiceRef])

  const startNewConversation = useCallback(async () => {
    if (conversation.loading || chatUi.uploadingMedia || !conversations.canCreateSession) return
    chatUi.setBlankCaseTransition(mode === 'case')
    resetConversationVisualState()
    conversations.resetToBlank()
    const created = await conversations.startNewSession()
    if (!created) {
      chatUi.setBlankCaseTransition(false)
      conversation.setError(language === 'vi'
        ? 'Chưa thể tạo cuộc trò chuyện mới.'
        : 'A new conversation could not be created.')
      return
    }
    router.replace(mode === 'case' ? blankCaseWorkRoute as never : normalChatRoute as never)
    chatUi.setBlankCaseTransition(false)
  }, [
    blankCaseWorkRoute,
    chatUi,
    conversation,
    conversations,
    language,
    mode,
    normalChatRoute,
    resetConversationVisualState,
    router,
  ])

  const openConversation = useCallback(async (conversationId: string) => {
    const target = conversations.sessions.find((session) => session.id === conversationId)
    if (!target) return
    const opensLinkedCaseImmediately = Boolean(target.case_session_id)
    if (
      chatUi.uploadingMedia ||
      conversations.sending ||
      (!opensLinkedCaseImmediately && (conversation.loading || conversations.openingSessionId))
    ) return
    const cachedCaseSession = target.case_session_id
      ? readRememberedCaseSession(target)
      : null
    chatUi.setBlankCaseTransition(false)
    chatUi.setSessionMenuOpen(false)
    resetConversationVisualState()
    const mustResetRoutedJob = target.mode === 'case' && Boolean(
      routeJobId && routeJobId !== target.case_job_id,
    )
    if (target.mode !== mode || mustResetRoutedJob) {
      router.replace(target.mode === 'case' ? blankCaseWorkRoute as never : normalChatRoute as never)
    }
    if (cachedCaseSession) {
      resolveCatalogCaseSession(cachedCaseSession)
    } else {
      conversation.setLoading(true)
    }
    const opened = await conversations.openSession(conversationId)
    if (!opened) {
      conversation.setLoading(false)
      conversation.setError(conversations.sessionsError ?? (language === 'vi'
        ? 'Chưa thể mở cuộc trò chuyện này.'
        : 'This conversation could not be opened.'))
      return
    }
    if (opened.session.mode === 'normal' || !opened.session.case_session_id) {
      conversation.setLoading(false)
      return
    }

    await loadCatalogCaseSession(opened.session.case_session_id)
  }, [
    blankCaseWorkRoute,
    chatUi,
    conversation,
    conversations,
    language,
    loadCatalogCaseSession,
    mode,
    normalChatRoute,
    resetConversationVisualState,
    resolveCatalogCaseSession,
    routeJobId,
    router,
  ])

  const archiveConversation = useCallback(async (conversationId: string) => {
    const target = conversations.sessions.find((session) => session.id === conversationId)
    const wasActive = conversations.activeSessionId === conversationId
    const archived = await conversations.archiveSession(conversationId)
    if (!archived) return false

    const closesVisibleCase = Boolean(
      target?.case_session_id &&
      (wasActive || target.case_job_id === workflowCaseDeal?.id),
    )
    if (closesVisibleCase) {
      chatUi.setSessionMenuOpen(false)
      chatUi.setBlankCaseTransition(true)
      resetConversationVisualState()
      router.replace(blankCaseWorkRoute as never)
      if (target?.case_job_id && typeof workflowActions.hydrateRemoteJobById === 'function') {
        void workflowActions.hydrateRemoteJobById(target.case_job_id)
      }
    }
    return true
  }, [
    blankCaseWorkRoute,
    chatUi,
    conversations,
    resetConversationVisualState,
    router,
    workflowActions,
    workflowCaseDeal?.id,
  ])

  const toggleSessionMenu = useCallback(() => {
    chatUi.setModeMenuOpen(false)
    chatUi.setSessionMenuOpen((current) => {
      if (!current) void conversations.refreshSessions(true)
      return !current
    })
  }, [chatUi, conversations])

  return {
    archiveConversation,
    loadCatalogCaseSession,
    openConversation,
    resetConversationVisualState,
    startNewConversation,
    toggleSessionMenu,
  }
}

function caseSessionCacheKey(customerId: string, caseSessionId: string) {
  return `${customerId}:${caseSessionId}`
}

function matchesCatalogCaseSession(
  target: CustomerKaelConversationSession,
  response: KaelChatResponse,
) {
  return Boolean(
    target.case_session_id &&
    response.session.id === target.case_session_id &&
    response.session.customer_id === target.customer_id,
  )
}

function readRememberedCaseSession(target: CustomerKaelConversationSession) {
  if (!target.case_session_id) return null
  const remembered = caseSessionMemory.get(caseSessionCacheKey(target.customer_id, target.case_session_id)) ?? null
  return remembered && matchesCatalogCaseSession(target, remembered) ? remembered : null
}

function rememberCaseSession(cacheKey: string, response: KaelChatResponse) {
  caseSessionMemory.delete(cacheKey)
  caseSessionMemory.set(cacheKey, response)
  while (caseSessionMemory.size > CASE_SESSION_MEMORY_LIMIT) {
    const oldestKey = caseSessionMemory.keys().next().value
    if (!oldestKey) break
    caseSessionMemory.delete(oldestKey)
  }
}
