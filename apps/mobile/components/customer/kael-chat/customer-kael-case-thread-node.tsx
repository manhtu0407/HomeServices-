import { useEffect, useMemo } from 'react'
import { AppState } from 'react-native'
import { RfqPricePanel } from '@/components/job/rfq-price-panel'

import { AgenticEvidenceGateResponse } from './agentic-evidence-gate-response'
import { CompletionReviewResponse } from './completion-review-response'
import { AgenticCaseThreadPanel } from './chat-case-thread-stateful-surfaces'
import { canCustomerDecideScopeChange } from './case-work-display-model'
import { customerV21TabCopy } from '../ui/copy'
import { makeAssistantTurnId } from './customer-kael-chat-helpers'
import { customerV21WebTextInputNoOutline } from '../ui/platform-styles'
import { customerV21KaelChatRootStyles as rootStyles } from './chat-styles'
import type { useCustomerKaelSurfaceController } from './use-customer-kael-surface-controller'

type Controller = ReturnType<typeof useCustomerKaelSurfaceController>

const TRIP_REFRESH_MS = 20_000

export function CustomerKaelCaseThreadNode({
  controller,
  onOpenActivity,
}: {
  controller: Controller
  onOpenActivity: () => void
}) {
  const { deal, mode } = controller
  if (mode !== 'case' || !deal) return null
  if (deal.status === 'worker_candidate_pending') return null
  return <CustomerKaelCaseThreadContent controller={controller} deal={deal} onOpenActivity={onOpenActivity} />
}

function CustomerKaelCaseThreadContent({
  controller,
  deal,
  onOpenActivity,
}: {
  controller: Controller
  deal: NonNullable<Controller['deal']>
  onOpenActivity: () => void
}) {
  const {
    caseUi,
    chatUi,
    conversation,
    decisionActions,
    evidenceActions,
    language,
    presentation,
    reduceMotion,
    tokens,
    workflow,
  } = controller
  const paymentRailProvider = deal.paymentRailProvider ?? null
  const caseEvidenceGateNode = useMemo(() => (
    <AgenticEvidenceGateResponse
      busy={caseUi.submittingCaseEvidence || chatUi.uploadingMedia}
      language={language}
      mediaDrafts={conversation.composerMediaDrafts}
      onAddMedia={evidenceActions.pickComposerMedia}
      onConfirm={() => void evidenceActions.submitCaseEvidence('confirmed')}
      onReasonChange={caseUi.setCaseEvidenceReason}
      onRemoveMedia={(index) => conversation.setComposerMediaDrafts((current) =>
        current.filter((_, currentIndex) => currentIndex !== index))}
      onReject={() => {
        caseUi.setCaseEvidenceRejectOpen(true)
        conversation.setError(null)
      }}
      onSkip={() => void evidenceActions.submitCaseEvidence('skipped')}
      onVoiceTranscriptChange={chatUi.setVoiceTranscript}
      rejectOpen={caseUi.caseEvidenceRejectOpen}
      rejectReason={caseUi.caseEvidenceReason}
      reduceMotion={reduceMotion}
      textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
      tokens={tokens}
      voiceTranscript={chatUi.voiceTranscript}
    />
  ), [caseUi, chatUi, conversation, evidenceActions, language, reduceMotion, tokens])
  // The worker's position changes on the server while they are on the way; the customer's job is read
  // again at this pace so the trip moves, and only while the app is in the foreground.
  const followingTrip = deal.status === 'worker_on_way'
  useEffect(() => {
    if (!followingTrip) return
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void workflow.actions.refreshCurrentJob()
    }, TRIP_REFRESH_MS)
    return () => clearInterval(timer)
  }, [followingTrip, workflow.actions])
  const completionReviewNode = useMemo(() => (
    deal.status === 'completed_by_worker' ? (
      <CompletionReviewResponse
        busy={chatUi.confirmingCompletion}
        deal={deal}
        language={language}
        onConfirm={() => void decisionActions.confirmCaseCompletion()}
        onReportIssue={() => {
          chatUi.setCaseEditOpen(true)
          conversation.setError(null)
        }}
        reduceMotion={reduceMotion}
        tokens={tokens}
      />
    ) : null
  ), [chatUi, conversation, deal, decisionActions, language, reduceMotion, tokens])

  return (
    <>
    <AgenticCaseThreadPanel
      activityLabel={customerV21TabCopy[language].activity}
      deal={deal}
      language={language}
      onApproveScopeChange={(scopeChangeId) => {
        if (
          !deal.scopeChange ||
          deal.scopeChange.id !== scopeChangeId ||
          !canCustomerDecideScopeChange(deal.scopeChange)
        ) return
        void workflow.actions.decideScopeChange?.(scopeChangeId, { decision: 'approve' })
      }}
      onOpenActivity={onOpenActivity}
      onRejectScopeChange={(scopeChangeId) => {
        if (
          !deal.scopeChange ||
          deal.scopeChange.id !== scopeChangeId ||
          !canCustomerDecideScopeChange(deal.scopeChange)
        ) return
        chatUi.setCaseEditOpen(true)
        conversation.setError(null)
        conversation.setAssistantTurns((current) => [
          ...current,
          {
            id: makeAssistantTurnId('customer_case', 'kael'),
            role: 'kael',
            surface: 'customer_case',
            text_content: language === 'vi'
              ? 'Bạn muốn từ chối vì lý do gì? Kael sẽ ghi lại và chỉ đổi phạm vi khi bạn chốt.'
              : 'Why do you want to decline? Kael will capture the reason before changing the scope.',
          },
        ])
      }}
      caseEvidenceGateActive={presentation.caseEvidenceGateActive}
      caseEvidenceGateNode={caseEvidenceGateNode}
      caseQuoteRejectOpen={chatUi.caseQuoteRejectOpen}
      caseQuoteRejectReason={chatUi.caseQuoteRejectReason}
      caseOptionsAcknowledged={caseUi.caseOptionsAcknowledged}
      confirmingCaseQuote={chatUi.confirmingCaseQuote}
      completionReviewNode={completionReviewNode}
      onAcknowledgeOptions={() => caseUi.setCaseOptionsAcknowledged(true)}
      onAuthorizeApartmentAccess={async () => {
        await workflow.actions.authorizeApartmentAccess()
      }}
      apartmentAccessState={workflow.customerApartmentAccessState}
      onCreateManualBankPaymentOrder={workflow.actions.createManualBankPaymentOrder}
      onClaimManualBankPayment={workflow.actions.claimManualBankPayment}
      onChooseMatchingPreference={workflow.actions.setMatchingPreference}
      matchingSelectionState={workflow.customerMatchingSelectionState}
      onLoadSavedWorkers={workflow.actions.listFavoriteWorkersForMatching}
      onNudgeCompletion={workflow.actions.customerNudgeCompletion}
      onRefreshPayment={workflow.actions.refreshCurrentJob}
      onApproveQuote={() => void decisionActions.confirmCaseQuote()}
      onQuoteRejectReasonChange={chatUi.setCaseQuoteRejectReason}
      onQuoteRejectReasonSubmit={() => void decisionActions.submitCaseQuoteRejectReason()}
      onRejectQuote={() => {
        chatUi.setCaseQuoteRejectOpen(true)
        conversation.setError(null)
      }}
      onRetryWorkerSearch={decisionActions.retryWorkerSearch}
      onStopMatching={workflow.actions.cancelRemoteJob}
      onSubmitReview={workflow.actions.submitReview}
      reduceMotion={reduceMotion}
      retryingWorkerSearch={chatUi.retryingWorkerSearch}
      submittingCaseQuoteRejectReason={chatUi.submittingCaseQuoteRejectReason}
      paymentRailProvider={paymentRailProvider}
      textInputStyle={[rootStyles.composerInput, customerV21WebTextInputNoOutline]}
      tokens={tokens}
    />
    {deal.status === 'inspecting' && deal.finalPrice == null ? (
      <RfqPricePanel jobId={deal.id} actorRole="customer" language={language} tokens={tokens}
        onChanged={workflow.actions.refreshCurrentJob} />
    ) : null}
    </>
  )
}
