import type { LocalDeal, ServiceType } from '@nestscout/shared'
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import type { useRouter } from 'expo-router'

import type { AppLanguage } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { kaelChatService } from '@/lib/services'

import { clearPendingKaelChatDraft } from '../kael-chat/pending-intake'
import { localizeKaelRequestFailure } from './customer-kael-chat-helpers'
import type { CustomerKaelMode } from './types'
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
  const caseSessionLoadsRef = useRef(new Map<string, Promise<boolean>>())
  const loadGenerationRef = useRef(0)
  const activeCatalogCaseJobId = conversations.activeResponse?.session.case_job_id ?? null
  const activeCatalogCaseSessionId = conversations.activeResponse?.session.case_session_id ?? null
  const syncLinkedJobSession = conversations.syncLinkedJobSession

  const loadCatalogCaseSession = useCallback((caseSessionId: string) => {
    const inFlight = caseSessionLoadsRef.current.get(caseSessionId)
    if (inFlight) return inFlight

    const generation = loadGenerationRef.current + 1
    loadGenerationRef.current = generation
    conversation.setLoading(true)
    const request = kaelChatService.get(caseSessionId)
      .then((loaded) => {
        if (loadGenerationRef.current !== generation) return false
        if (!loaded.success) {
          conversation.rejectHydration(localizeKaelRequestFailure(loaded, language))
          return false
        }
        selectedServiceRef.current = loaded.data.session.service_type
        conversation.resolveHydration(loaded.data, false)
        if (
          loaded.data.session.job_id &&
          typeof workflowActions.hydrateRemoteJobById === 'function'
        ) {
          void workflowActions.hydrateRemoteJobById(loaded.data.session.job_id)
        }
        return true
      })
      .catch(() => {
        if (loadGenerationRef.current === generation) {
          conversation.rejectHydration(language === 'vi'
            ? 'Kael tạm thời chưa phản hồi.'
            : 'Kael is temporarily unavailable.')
        }
        return false
      })
      .finally(() => {
        if (caseSessionLoadsRef.current.get(caseSessionId) === request) {
          caseSessionLoadsRef.current.delete(caseSessionId)
        }
      })
    caseSessionLoadsRef.current.set(caseSessionId, request)
    return request
  }, [conversation, language, selectedServiceRef, workflowActions])

  const automaticCaseJobId = mode === 'case' && !chatUi.blankCaseTransition
    ? routeJobId ?? (!conversations.activeSessionId ? workflowCaseDeal?.id ?? null : null)
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
    caseSessionLoadsRef.current.clear()
    chatUi.setModeMenuOpen(false)
    chatUi.setSessionMenuOpen(false)
    chatUi.setCaseEditOpen(false)
    chatUi.setDraft('')
    chatUi.setVoiceTranscript('')
    chatUi.setUploadingMedia(false)
    chatUi.setAgenticRejectOpen(false)
    chatUi.setAgenticRejectReason('')
    chatUi.setAgenticEvidenceRejectOpen(false)
    chatUi.setAgenticEvidenceReason('')
    chatUi.setCaseQuoteRejectOpen(false)
    chatUi.setCaseQuoteRejectReason('')
    conversation.setComposerMediaDrafts([])
    conversation.setError(null)
    conversation.setLoading(false)
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
    if (conversation.loading || chatUi.uploadingMedia || conversations.busy) return
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
    chatUi.setBlankCaseTransition(false)
    router.replace(mode === 'case' ? blankCaseWorkRoute as never : normalChatRoute as never)
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
    if (conversation.loading || chatUi.uploadingMedia || conversations.busy) return
    chatUi.setBlankCaseTransition(false)
    chatUi.setSessionMenuOpen(false)
    const opened = await conversations.openSession(conversationId)
    if (!opened) return
    resetConversationVisualState()
    if (opened.session.mode === 'normal' || !opened.session.case_session_id) {
      router.replace(opened.session.mode === 'case'
        ? blankCaseWorkRoute as never
        : normalChatRoute as never)
      return
    }

    const loaded = await loadCatalogCaseSession(opened.session.case_session_id)
    if (loaded) router.replace(blankCaseWorkRoute as never)
  }, [
    blankCaseWorkRoute,
    chatUi,
    conversation.loading,
    conversations,
    loadCatalogCaseSession,
    normalChatRoute,
    resetConversationVisualState,
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
