import { AgenticEvidenceGateCard } from '../kael-chat/agentic-evidence-gate-card'
import { CompletionReviewCard } from '../kael-chat/completion-review-card'
import { AgenticCaseThreadPanel } from './chat-case-thread-stateful-surfaces'
import { AnimatedStageProgressBar } from './animated-stage-progress-bar'
import { canCustomerDecideScopeChange, caseDisplayCode } from './case-work-display-model'
import { caseWorkDataSourceFooterLabel } from './case-source-display-model'
import { customerV21TabCopy } from './copy'
import { makeAssistantTurnId } from './customer-kael-chat-helpers'
import { customerV21WebTextInputNoOutline } from './platform-styles'
import { customerV21KaelChatRootStyles as rootStyles } from './chat-styles'
import type { useCustomerKaelSurfaceController } from './use-customer-kael-surface-controller'

type Controller = ReturnType<typeof useCustomerKaelSurfaceController>

export function CustomerKaelCaseThreadNode({
  controller,
  onOpenActivity,
}: {
  controller: Controller
  onOpenActivity: () => void
}) {
  const {
    caseUi,
    chatUi,
    conversation,
    deal,
    decisionActions,
    evidenceActions,
    language,
    mode,
    presentation,
    tokens,
    workflow,
  } = controller
  if (mode !== 'case' || !deal) return null

  return (
    <AgenticCaseThreadPanel
      activityLabel={customerV21TabCopy[language].activity}
      deal={deal}
      editing={chatUi.caseEditOpen}
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
      onRequestEdit={() => {
        chatUi.setCaseEditOpen(true)
        conversation.setError(null)
      }}
      caseEvidenceGateActive={presentation.caseEvidenceGateActive}
      caseEvidenceGateNode={(
        <AgenticEvidenceGateCard
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
          textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
          tokens={tokens}
          voiceTranscript={chatUi.voiceTranscript}
        />
      )}
      caseQuoteRejectOpen={chatUi.caseQuoteRejectOpen}
      caseQuoteRejectReason={chatUi.caseQuoteRejectReason}
      caseOptionsAcknowledged={caseUi.caseOptionsAcknowledged}
      confirmingCaseQuote={chatUi.confirmingCaseQuote}
      completionReviewNode={deal.status === 'completed_by_worker' ? (
        <CompletionReviewCard
          busy={chatUi.confirmingCompletion}
          deal={deal}
          language={language}
          onConfirm={() => void decisionActions.confirmCaseCompletion()}
          onReportIssue={() => {
            chatUi.setCaseEditOpen(true)
            conversation.setError(null)
          }}
          tokens={tokens}
        />
      ) : null}
      onAcknowledgeOptions={() => caseUi.setCaseOptionsAcknowledged(true)}
      onApproveQuote={() => void decisionActions.confirmCaseQuote()}
      onQuoteRejectReasonChange={chatUi.setCaseQuoteRejectReason}
      onQuoteRejectReasonSubmit={() => void decisionActions.submitCaseQuoteRejectReason()}
      onRejectQuote={() => {
        chatUi.setCaseQuoteRejectOpen(true)
        conversation.setError(null)
      }}
      renderJobProgressBar={(active, progress) => (
        <AnimatedStageProgressBar active={active} progress={progress} />
      )}
      sourceFooterLabel={caseWorkDataSourceFooterLabel(caseDisplayCode(deal, language), language)}
      submittingCaseEvidence={caseUi.submittingCaseEvidence || chatUi.uploadingMedia}
      submittingCaseQuoteRejectReason={chatUi.submittingCaseQuoteRejectReason}
      textInputStyle={[rootStyles.composerInput, customerV21WebTextInputNoOutline]}
      tokens={tokens}
    />
  )
}
