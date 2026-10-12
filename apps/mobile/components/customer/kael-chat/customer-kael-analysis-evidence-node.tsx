import { AgenticEvidenceGateResponse } from '../kael-chat/agentic-evidence-gate-response'
import { QuoteReadinessReviewResponse } from '../kael-chat/quote-readiness-review-response'
import { ConfirmationReconciliationResponse } from '../kael-chat/intake-coverage-response'
import { customerV21WebTextInputNoOutline } from '../ui/platform-styles'
import type { useCustomerKaelSurfaceController } from './use-customer-kael-surface-controller'
import { KaelNextActionChips } from './kael-next-action-chips'
import { latestKaelNextActions, latestKaelReferencePrice } from './kael-next-actions-display-model'
import { ReferencePriceNote } from './reference-price-note'

type Controller = ReturnType<typeof useCustomerKaelSurfaceController>

export function CustomerKaelAnalysisEvidenceNode({
  controller,
}: {
  controller: Controller
}) {
  const {
    chatUi,
    conversation,
    decisionActions,
    evidenceActions,
    language,
    mode,
    nextActions,
    presentation,
    processController,
    reduceMotion,
    tokens,
  } = controller
  const workNextActions = mode === 'case' && !processController.processLines && !conversation.streamingReply
    ? latestKaelNextActions(conversation.turns)
    : null
  const nextActionChips = workNextActions ? (
    <KaelNextActionChips
      actions={workNextActions.actions}
      busy={conversation.loading}
      language={language}
      onPress={(action) => void nextActions.runNextAction(action)}
      sendingActionId={nextActions.sendingActionId}
      tokens={tokens}
    />
  ) : null

  if (presentation.intakeConfirmationActive) return null
  if (decisionActions.confirmationReconciling) {
    return (
      <ConfirmationReconciliationResponse
        language={language}
        supportCode={decisionActions.confirmationSupportCode}
        tokens={tokens}
      />
    )
  }
  if (presentation.agenticEvidenceGateActive) {
    return (
      <AgenticEvidenceGateResponse
        allowSkip={!presentation.serverEvidenceRequired}
        busy={conversation.loading ||
          chatUi.uploadingMedia ||
          chatUi.submittingAgenticEvidence ||
          !conversation.chat?.session.id}
        language={language}
        mediaDrafts={conversation.composerMediaDrafts}
        onAddMedia={evidenceActions.pickComposerMedia}
        onConfirm={() => void evidenceActions.submitAgenticEvidence('confirmed')}
        onReasonChange={chatUi.setAgenticEvidenceReason}
        onRemoveMedia={(index) => conversation.setComposerMediaDrafts((current) =>
          current.filter((_, currentIndex) => currentIndex !== index))}
        onReject={() => {
          chatUi.setAgenticEvidenceRejectOpen(true)
          conversation.setError(null)
        }}
        onSkip={() => void evidenceActions.submitAgenticEvidence('skipped')}
        onVoiceTranscriptChange={chatUi.setVoiceTranscript}
        prompt={presentation.serverEvidencePrompt}
        reduceMotion={reduceMotion}
        rejectOpen={chatUi.agenticEvidenceRejectOpen}
        rejectReason={chatUi.agenticEvidenceReason}
        requiredEvidenceKind={presentation.serverEvidenceKind}
        textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
        tokens={tokens}
        voiceTranscript={chatUi.voiceTranscript}
      />
    )
  }
  if (!presentation.serverPriceReviewBlocked) return nextActionChips
  const referencePrice = latestKaelReferencePrice(conversation.turns)
  return (
    <>
      <QuoteReadinessReviewResponse
        language={language}
        reduceMotion={reduceMotion}
        reason={typeof presentation.artifactNextAction?.reason === 'string'
          ? presentation.artifactNextAction.reason
          : undefined}
        safetyMessages={presentation.serverSafetyMessages}
        tokens={tokens}
      />
      {referencePrice ? <ReferencePriceNote language={language} reference={referencePrice} tokens={tokens} /> : null}
      {nextActionChips}
    </>
  )
}
