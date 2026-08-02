import type { LocalDeal } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import type { CustomerKaelConversationTurn } from '@/lib/api-types/customer'
import type { KaelChatResponse, KaelChatTurn } from '@/lib/api-types'
import type { PendingKaelChatDraft } from '@/lib/pending-kael-chat-draft'
import type { useJobChatThread } from '@/lib/use-job-chat-thread'

import {
  localizedCaseWorkEvidencePrompt,
  localizedCaseWorkSafetyMessage,
} from './case-work-localization'
import {
  customerVisibleCaseRequestText,
  customerVisibleIntakeSummaryText,
  customerVisibleKaelTurnText,
  isScriptedKaelAcknowledgementTurn,
} from './kael-chat-turn-display-model'
import type { CustomerKaelMode } from '../ui/types'
import type { KaelProcessLineRuntime } from './use-customer-kael-chat-ui-state'
import type { CustomerAssistantLocalTurn } from './use-customer-kael-conversation-state'

type JobIncidentMessages = ReturnType<typeof useJobChatThread>['messages']

export function deriveCustomerKaelPresentation({
  assistantTurns,
  caseEditOpen,
  catalogTurns,
  chat,
  deal,
  intakeDisplayMessage,
  jobIncidentMessages,
  language,
  loading,
  mode,
  pendingDraft,
  pendingDraftLocalizedMessage,
  processLines,
  routeDraftEvidencePending,
  submittingAgenticEvidence,
  turns,
}: {
  assistantTurns: CustomerAssistantLocalTurn[]
  caseEditOpen: boolean
  catalogTurns: CustomerKaelConversationTurn[]
  chat: KaelChatResponse | null
  deal: LocalDeal | null
  intakeDisplayMessage: string | null
  jobIncidentMessages: JobIncidentMessages
  language: AppLanguage
  loading: boolean
  mode: CustomerKaelMode
  pendingDraft: PendingKaelChatDraft | null
  pendingDraftLocalizedMessage: string | null | undefined
  processLines: KaelProcessLineRuntime | null
  routeDraftEvidencePending: boolean
  submittingAgenticEvidence: boolean
  turns: KaelChatTurn[]
}) {
  const chatEstimate = chat?.session.estimate ?? turns.find((turn) => turn.estimate)?.estimate ?? null
  const normalVisibleTurns = turns
    .filter((turn) =>
      turn.content_type !== 'estimate' &&
      !isScriptedKaelAcknowledgementTurn(turn))
    .map((turn) => ({
      ...turn,
      text_content: turn.role === 'customer'
        ? mode === 'case'
          ? customerVisibleCaseRequestText(turn.text_content, language)
          : customerVisibleIntakeSummaryText(turn.text_content, language)
        : customerVisibleKaelTurnText(turn.text_content, language),
    }))
  const catalogConversationTurns = catalogTurns.map((turn) => ({
    id: turn.id,
    role: turn.role === 'customer' ? 'customer' as const : 'kael' as const,
    text_content: turn.role === 'customer'
      ? customerVisibleIntakeSummaryText(turn.text_content, language)
      : customerVisibleKaelTurnText(turn.text_content, language),
  }))
  const normalAssistantTurns = mode === 'normal' ? catalogConversationTurns : []
  const hasSharedJobIncident = jobIncidentMessages.some((message) =>
    message.sender_role === 'kael' && message.content.startsWith('Kael Công việc:'),
  )
  const sharedJobIncidentTurns = hasSharedJobIncident
    ? jobIncidentMessages.map((message) => ({
      id: `job-incident-${message.id}`,
      role: message.sender_role,
      surface: 'customer_case' as const,
      text_content: customerVisibleKaelTurnText(message.sender_role === 'worker'
        ? `${language === 'vi' ? 'Thợ: ' : 'Worker: '}${message.content}`
        : message.content, language),
    }))
    : []
  const localCaseAssistantTurns = assistantTurns
    .filter((turn) => turn.surface === 'customer_case')
    .map((turn) => turn.role === 'customer'
      ? { ...turn, text_content: customerVisibleCaseRequestText(turn.text_content, language) }
      : turn)
  const localCaseCustomerTexts = new Set(localCaseAssistantTurns
    .filter((turn) => turn.role === 'customer')
    .map((turn) => turn.text_content.trim())
    .filter(Boolean))
  const caseAssistantTurns = [
    ...localCaseAssistantTurns,
    ...sharedJobIncidentTurns,
  ]
  const backendDraftCustomerTurn = routeDraftEvidencePending || intakeDisplayMessage
    ? normalVisibleTurns.find((turn) => turn.role === 'customer' && turn.text_content?.trim())
    : null
  const pendingDraftMessage = pendingDraftLocalizedMessage?.trim() ??
    intakeDisplayMessage?.trim() ??
    backendDraftCustomerTurn?.text_content?.trim() ??
    ''
  const routeDraftHydrationPending = Boolean(pendingDraft || routeDraftEvidencePending)
  const routeDraftOwnsIntake = routeDraftHydrationPending || Boolean(intakeDisplayMessage)
  const hasPendingDraftTurn = pendingDraftMessage.length > 0 &&
    normalVisibleTurns.some((turn) => turn.role === 'customer' && turn.text_content?.trim() === pendingDraftMessage)
  const hasActionableAgenticTurn = normalVisibleTurns.some((turn) =>
    turn.role !== 'customer' &&
    (turn.content_type === 'clarification' ||
      turn.content_type === 'analysis' ||
      turn.content_type === 'error' ||
      turn.content_type === 'photo_request' ||
      turn.content_type === 'video_request'))
  const routeIntakeHasWorkState = Boolean(
    pendingDraft || intakeDisplayMessage || chat || loading || normalVisibleTurns.length > 0,
  )
  const workIntakeActive = mode === 'case' && !deal && routeIntakeHasWorkState
  const normalIntakeActive = mode === 'normal' && !routeDraftOwnsIntake && routeIntakeHasWorkState
  const agenticIntakeModeActive = normalIntakeActive || workIntakeActive
  const diagnosisScope = chat?.session.diagnosis_scope
  const evidencePreviews = chat?.session.evidence_previews ?? []
  const artifactNextAction = diagnosisScope && typeof diagnosisScope.next_action === 'object' && diagnosisScope.next_action
    ? diagnosisScope.next_action as Record<string, unknown>
    : null
  const serverRequestsEvidence = artifactNextAction?.kind === 'request_evidence'
  const serverEvidenceRequired = serverRequestsEvidence && artifactNextAction?.required !== false
  const serverEvidenceKind: 'photo' | 'video_frame' | 'voice_transcript' | undefined =
    artifactNextAction?.evidence_kind === 'photo' ||
      artifactNextAction?.evidence_kind === 'video_frame' ||
      artifactNextAction?.evidence_kind === 'voice_transcript'
      ? artifactNextAction.evidence_kind
      : undefined
  const artifactEvidencePrompt = typeof artifactNextAction?.prompt === 'string'
    ? artifactNextAction.prompt.trim()
    : ''
  const evidenceBlockers = Array.isArray(diagnosisScope?.quote_blockers)
    ? diagnosisScope.quote_blockers.filter((value: unknown): value is string => typeof value === 'string')
    : []
  const localizedEvidencePrompt = localizedCaseWorkEvidencePrompt({
    blockers: evidenceBlockers,
    evidenceKind: serverEvidenceKind,
    language,
  })
  const serverEvidencePrompt = serverRequestsEvidence
    ? evidenceBlockers.includes('handyman_visual_evidence')
      ? localizedEvidencePrompt
      : artifactEvidencePrompt || localizedEvidencePrompt
    : undefined
  const serverSafetyMessages = Array.isArray(diagnosisScope?.safety_flags)
    ? diagnosisScope.safety_flags.flatMap((flag: unknown) => {
      if (!flag || typeof flag !== 'object') return []
        const code = (flag as { code?: unknown }).code
        return typeof code === 'string' && code.trim()
          ? [localizedCaseWorkSafetyMessage(code, language)]
          : []
      })
    : []
  const agenticAnalysisActive = agenticIntakeModeActive && chat?.session.case_phase === 'analysis'
  const offerReviewActive = agenticIntakeModeActive &&
    chat?.session.case_phase === 'offer_review' &&
    chat.session.status === 'estimate_ready' &&
    chat.session.next_action === 'estimate_ready'
  const serverPriceReviewBlocked = artifactNextAction?.kind === 'escalate'
  const missingCaseWorkDeal = mode === 'case' && !deal && !workIntakeActive
  const routeDraftHasStructuredOutcome = Boolean(
    offerReviewActive ||
    chat?.session.job_id ||
    chat?.session.status === 'estimate_ready' ||
    chat?.session.status === 'confirmed' ||
    chat?.session.next_action === 'estimate_ready' ||
    chat?.session.next_action === 'confirmed',
  )
  const routeDraftAwaitingAgenticStep = workIntakeActive &&
    routeDraftHydrationPending &&
    !processLines &&
    !routeDraftHasStructuredOutcome &&
    (routeDraftEvidencePending || !chat || chat.session.status === 'collecting_evidence' || !hasActionableAgenticTurn)
  const showPendingDraftBubble = workIntakeActive &&
    pendingDraftMessage.length > 0 &&
    (routeDraftOwnsIntake || routeDraftAwaitingAgenticStep || !hasPendingDraftTurn)
  const routeDraftBackendCustomerTurnId = showPendingDraftBubble && routeDraftOwnsIntake
    ? normalVisibleTurns.find((turn) => turn.role === 'customer')?.id ?? null
    : null
  const visiblePendingDraftMessage = showPendingDraftBubble
    ? customerVisibleCaseRequestText(pendingDraftMessage, language).trim()
    : ''
  const candidateAgenticVisibleTurns = routeDraftAwaitingAgenticStep
    ? []
    : normalVisibleTurns.filter((turn) => (
        turn.id !== routeDraftBackendCustomerTurnId &&
        !(turn.role === 'customer' && visiblePendingDraftMessage && turn.text_content?.trim() === visiblePendingDraftMessage) &&
        !(mode === 'case' && turn.role === 'customer' && localCaseCustomerTexts.has(turn.text_content?.trim() ?? ''))
      ))
  const seenDetailedCustomerTurns = new Set<string>()
  const agenticVisibleTurns = candidateAgenticVisibleTurns.filter((turn) => {
    if (turn.role !== 'customer') return true
    const text = turn.text_content?.trim() ?? ''
    if (text.length < 110) return true
    if (seenDetailedCustomerTurns.has(text)) return false
    seenDetailedCustomerTurns.add(text)
    return true
  })
  const showNormalGreeting = mode === 'normal' &&
    !processLines &&
    normalAssistantTurns.length === 0 &&
    (routeDraftOwnsIntake || (!chat && turns.length === 0))
  const caseEvidenceGateActive = false
  const intakeConfirmation = chat?.session.intake_confirmation?.status === 'pending'
    ? chat.session.intake_confirmation
    : null
  const intakeConfirmationActive = agenticIntakeModeActive &&
    !processLines &&
    Boolean(intakeConfirmation)
  const agenticEvidenceGateActive = agenticIntakeModeActive &&
    !intakeConfirmationActive &&
    !submittingAgenticEvidence &&
    !processLines &&
    serverRequestsEvidence
  const canConfirmAgenticEstimate = offerReviewActive && Boolean(
    chat?.session.id &&
    chatEstimate &&
    chatEstimate.needs_inspection !== true &&
    chat?.session.status === 'estimate_ready' &&
    chat?.session.next_action === 'estimate_ready',
  )
  const agenticEstimateConfirmed = chat?.session.status === 'confirmed' ||
    chat?.session.next_action === 'confirmed' ||
    Boolean(chat?.session.job_id)

  return {
    agenticAnalysisActive,
    agenticEstimateConfirmed,
    agenticEvidenceGateActive,
    agenticIntakeModeActive,
    agenticVisibleTurns,
    artifactNextAction,
    canConfirmAgenticEstimate,
    caseAssistantTurns,
    caseEvidenceGateActive,
    chatEstimate,
    diagnosisScope,
    evidencePreviews,
    hasSharedJobIncident,
    intakeConfirmation,
    intakeConfirmationActive,
    missingCaseWorkDeal,
    normalAssistantTurns,
    offerReviewActive,
    pendingDraftMessage,
    serverEvidenceKind,
    serverEvidencePrompt,
    serverEvidenceRequired,
    serverPriceReviewBlocked,
    serverSafetyMessages,
    showCaseConversation: mode === 'case' && (caseAssistantTurns.length > 0 || (Boolean(deal) && caseEditOpen)),
    showComposer: (mode === 'normal' || mode === 'case') &&
      !intakeConfirmationActive &&
      !agenticEvidenceGateActive,
    showNormalGreeting,
    showPendingDraftBubble,
    workIntakeActive,
  }
}
