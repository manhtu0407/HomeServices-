import { useRef, useState } from 'react'
import type { ServiceType } from '@nestscout/shared'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { useAppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { useJobChatThread } from '@/lib/use-job-chat-thread'

import { peekPendingKaelChatDraft } from '../kael-chat/pending-intake'
import { buildBookingDraftMessage } from './booking-intake-display-model'
import { customerV21CommonCopy, customerV21ServiceCopy } from './copy'
import {
  cleanRouteJobId,
  customerKaelChatRoute,
  customerKaelWorkRoute,
  customerCaseWorkRouteForDeal,
  isRealCaseDeal,
} from './customer-kael-routing'
import { deriveCustomerKaelPresentation } from './customer-kael-presentation'
import { useCustomerKaelRequestGuard } from './customer-kael-state-scope'
import { chatScreenModeParam, firstParam, serviceParam } from './route-params'
import type { CustomerKaelMode } from './types'
import { useCustomerCaseHydration } from './use-customer-case-hydration'
import { useCustomerKaelCaseUiState } from './use-customer-kael-case-ui-state'
import { useCustomerKaelChatUiState } from './use-customer-kael-chat-ui-state'
import { useCustomerKaelConversationState } from './use-customer-kael-conversation-state'
import { useCustomerKaelConversations } from './use-customer-kael-conversations'
import { useCustomerKaelDecisionActions } from './use-customer-kael-decision-actions'
import { useCustomerKaelEvidenceActions } from './use-customer-kael-evidence-actions'
import { useCustomerKaelMessageActions } from './use-customer-kael-message-actions'
import { useCustomerKaelModeMenu } from './use-customer-kael-mode-menu'
import { useCustomerKaelSessionCatalog } from './use-customer-kael-session-catalog'
import { useCustomerKaelSessionHydration } from './use-customer-kael-session-hydration'
import { useKaelProcessLineController } from './use-kael-process-line-controller'
import { useKaelTimelineHeadline } from './use-kael-timeline-headline'
import { useV21Theme } from './use-v21-theme'

type KaelRouteParams = {
  focus?: string | string[]
  jobId?: string | string[]
  mode?: string | string[]
  ns_audit_role?: string | string[]
  screen?: string | string[]
  sessionId?: string | string[]
  service?: string | string[]
}

export function useCustomerKaelSurfaceController(stateScopeKey: string) {
  const language = useAppLanguage()
  const params = useLocalSearchParams<KaelRouteParams>()
  const router = useRouter()
  const workflow = useFrontendWorkflow()
  const { session } = useAuth()
  const pendingDraftOwnerId = session?.user.id ?? null
  const sessionAccessToken = session?.access_token
  const { reduceMotion, reduceTransparency, tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const timelineHeadline = useKaelTimelineHeadline(language)
  const [initialPendingDraft] = useState(() => peekPendingKaelChatDraft(pendingDraftOwnerId))
  const routeModeParam = firstParam(params.mode)
  const explicitRouteMode: CustomerKaelMode | null = routeModeParam === 'case'
    ? 'case'
    : routeModeParam === 'normal'
      ? 'normal'
      : null
  const routeMode = explicitRouteMode ?? chatScreenModeParam(firstParam(params.screen)) ?? 'normal'
  const routeJobId = cleanRouteJobId(firstParam(params.jobId))
  const workflowDeal = workflow.state.deal
  const workflowCaseDeal = isRealCaseDeal(workflowDeal) ? workflowDeal : null
  const routeSessionId = firstParam(params.sessionId) ?? null
  const routeDerivedMode: CustomerKaelMode = routeMode === 'case' || routeJobId || initialPendingDraft
    ? 'case'
    : 'normal'
  const conversation = useCustomerKaelConversationState({
    initialLoading: Boolean(routeSessionId || (initialPendingDraft?.serviceType && sessionAccessToken)),
    initialMode: routeDerivedMode,
    pendingDraft: initialPendingDraft,
  })
  const pendingDraftLocalizedMessage = conversation.pendingDraft
    ? conversation.pendingDraft.description?.trim() || (
        conversation.pendingDraft.locale === language || !conversation.pendingDraft.serviceType
          ? conversation.pendingDraft.message
          : buildBookingDraftMessage({
              address: conversation.pendingDraft.addressLabel ?? conversation.pendingDraft.districtLabel ?? '',
              description: '',
              language,
              problems: conversation.pendingDraft.problemChips ?? [],
              scheduleLabel: conversation.pendingDraft.scheduleWindow
                ? `${conversation.pendingDraft.scheduleWindow.date} · ${conversation.pendingDraft.scheduleWindow.start}-${conversation.pendingDraft.scheduleWindow.end}`
                : null,
              serviceType: conversation.pendingDraft.serviceType,
            })
      )
    : null
  const chatUi = useCustomerKaelChatUiState()
  const mode: CustomerKaelMode = conversation.localMode
  const conversations = useCustomerKaelConversations(mode, language)
  const activeCatalogCaseSessionId = conversations.activeResponse?.session.case_session_id ?? null
  const catalogCaseOwnsSurface = mode === 'case' && (
    chatUi.blankCaseTransition || Boolean(conversations.activeSessionId)
  )
  const activeCatalogCaseMatchesWorkflowDeal = Boolean(
    activeCatalogCaseSessionId &&
    conversation.chat?.session.id === activeCatalogCaseSessionId &&
    conversation.chat.session.job_id &&
    conversation.chat.session.job_id === workflowCaseDeal?.id
  )
  const deal = catalogCaseOwnsSurface
    ? activeCatalogCaseMatchesWorkflowDeal ? workflowCaseDeal : null
    : workflowCaseDeal
  const candidateJobId = deal?.status === 'worker_candidate_pending' ? deal.id : null
  const caseServiceLabel = deal?.draft.serviceType
    ? customerV21ServiceCopy[language][deal.draft.serviceType].label
    : null
  const jobIncidentThread = useJobChatThread(
    deal?.id ?? null,
    Boolean(deal && mode === 'case'),
    language,
  )
  const caseHydration = useCustomerCaseHydration({
    active: mode === 'case',
    currentDealId: deal?.id ?? null,
    hydrate: workflow.actions.hydrateRemoteJobById,
    routeJobId,
  })
  const visibleError = caseHydration.failed
    ? (language === 'vi' ? 'Chưa có công việc thật.' : 'No job yet.')
    : conversation.error
  const selectedServiceRef = useRef<ServiceType | null>(
    initialPendingDraft?.serviceType ??
    deal?.draft.serviceType ??
    serviceParam(firstParam(params.service)),
  )
  const selectedService = selectedServiceRef.current
  const caseUi = useCustomerKaelCaseUiState({
    evidenceOwnerKey: deal ? `${deal.id}:${deal.draft.mediaCount ?? 0}` : null,
    optionsOwnerKey: deal?.status === 'awaiting_customer_confirm' ? deal.id : null,
  })
  const kaelRequestGuard = useCustomerKaelRequestGuard(stateScopeKey)
  const processController = useKaelProcessLineController({
    caseServiceLabel,
    deal,
    language,
    selectedService,
  })
  useCustomerKaelSessionHydration({
    conversation,
    kaelRequestGuard,
    language,
    pendingDraftLocalizedMessage,
    pendingDraftOwnerId,
    routeJobId,
    routeMode,
    routeSessionId,
    selectedServiceRef,
    sessionAccessToken,
  })
  const visualAuditCustomerSuffix = firstParam(params.ns_audit_role) === 'customer'
    ? '&ns_audit_role=customer'
    : ''
  const normalChatRoute = `${customerKaelChatRoute}${visualAuditCustomerSuffix}`
  const blankCaseWorkRoute = `${customerKaelWorkRoute}${visualAuditCustomerSuffix}`
  const caseWorkRoute = customerCaseWorkRouteForDeal(deal, visualAuditCustomerSuffix)
  const sessionCatalog = useCustomerKaelSessionCatalog({
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
    workflowActions: workflow.actions,
    workflowCaseDeal,
  })
  const presentation = deriveCustomerKaelPresentation({
    assistantTurns: conversation.assistantTurns,
    caseEditOpen: chatUi.caseEditOpen,
    catalogTurns: conversations.turns,
    chat: conversation.chat,
    deal,
    jobIncidentMessages: jobIncidentThread.messages,
    language,
    loading: conversation.loading,
    mode,
    pendingDraft: conversation.pendingDraft,
    pendingDraftLocalizedMessage,
    processLines: processController.processLines,
    routeDraftEvidencePending: conversation.routeDraftEvidencePending,
    submittingAgenticEvidence: chatUi.submittingAgenticEvidence,
    turns: conversation.turns,
  })
  const evidenceActions = useCustomerKaelEvidenceActions({
    agenticEvidenceGateActive: presentation.agenticEvidenceGateActive,
    caseEvidenceGateActive: presentation.caseEvidenceGateActive,
    caseUi,
    chatUi,
    conversation,
    deal,
    hydrateRemoteJobById: workflow.actions.hydrateRemoteJobById,
    kaelRequestGuard,
    language,
    mode,
    pendingDraftLocalizedMessage,
    pendingDraftOwnerId,
    processController,
    selectedService,
  })
  const messageActions = useCustomerKaelMessageActions({
    chatUi,
    conversation,
    conversations,
    deal,
    hasSharedJobIncident: presentation.hasSharedJobIncident,
    jobIncidentThread,
    kaelRequestGuard,
    language,
    mode,
    processController,
    requestOwnerKey: stateScopeKey,
    selectedService,
    selectedServiceRef,
  })
  const decisionActions = useCustomerKaelDecisionActions({
    chatEstimate: presentation.chatEstimate,
    chatUi,
    conversation,
    deal,
    kaelRequestGuard,
    language,
    mode,
    processController,
    router,
    workflow,
  })
  const modeMenu = useCustomerKaelModeMenu({
    caseWorkRoute,
    chatUi,
    conversation,
    kaelRequestGuard,
    normalChatRoute,
    processController,
    reduceMotion,
    reduceTransparency,
    router,
    stateScopeKey,
  })

  return {
    candidateJobId,
    caseHydration,
    caseUi,
    chatUi,
    conversation,
    conversations,
    copy,
    deal,
    decisionActions,
    evidenceActions,
    language,
    messageActions,
    mode,
    modeMenu,
    presentation,
    processController,
    reduceMotion,
    reduceTransparency,
    router,
    sessionCatalog,
    timelineHeadline,
    tokens,
    visibleError,
    workflow,
  }
}
