import { AgenticEvidenceGateResponse } from '../kael-chat/agentic-evidence-gate-response'
import { QuoteReadinessReviewResponse } from '../kael-chat/quote-readiness-review-response'
import { customerV21WebTextInputNoOutline } from '../ui/platform-styles'
import type { useCustomerKaelSurfaceController } from './use-customer-kael-surface-controller'

type Controller = ReturnType<typeof useCustomerKaelSurfaceController>

export function CustomerKaelAnalysisEvidenceNode({
  controller,
}: {
  controller: Controller
}) {
  const {
    chatUi,
    conversation,
    evidenceActions,
    language,
    presentation,
    reduceMotion,
    tokens,
  } = controller

  if (presentation.intakeConfirmationActive) return null
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
  if (!presentation.serverPriceReviewBlocked) return null
  return (
    <QuoteReadinessReviewResponse
      language={language}
      reduceMotion={reduceMotion}
      reason={typeof presentation.artifactNextAction?.reason === 'string'
        ? presentation.artifactNextAction.reason
        : undefined}
      safetyMessages={presentation.serverSafetyMessages}
      tokens={tokens}
    />
  )
}
