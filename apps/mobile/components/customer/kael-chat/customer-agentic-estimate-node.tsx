import {
  agenticEstimatePriceExplanation,
  agenticEstimateSourceExplanation,
} from './agentic-estimate-display-model'
import { AgenticChatEstimateResponse } from './agentic-chat-estimate-response'
import { customerV21KaelChatRootStyles as rootStyles } from './chat-styles'
import { customerV21WebTextInputNoOutline } from '../ui/platform-styles'
import type { useCustomerKaelSurfaceController } from './use-customer-kael-surface-controller'

type Controller = ReturnType<typeof useCustomerKaelSurfaceController>

export function CustomerAgenticEstimateNode({ controller }: { controller: Controller }) {
  const {
    chatUi,
    conversation,
    decisionActions,
    language,
    presentation,
    processController,
  } = controller

  if (
    !presentation.offerReviewActive ||
    !presentation.chatEstimate ||
    processController.processLines ||
    chatUi.submittingAgenticAdjustment ||
    chatUi.submittingAgenticRejectReason ||
    chatUi.confirmingAgenticEstimate
  ) return null

  return <AgenticChatEstimateResponse
    adjustmentOpen={chatUi.agenticAdjustmentOpen}
    adjustmentText={chatUi.agenticAdjustmentText}
    canConfirm={presentation.canConfirmAgenticEstimate}
    confirming={chatUi.confirmingAgenticEstimate}
    confirmed={presentation.agenticEstimateConfirmed}
    diagnosisScope={presentation.diagnosisScope}
    evidencePreviews={presentation.evidencePreviews}
    estimate={presentation.chatEstimate}
    language={language}
    onAskPrice={() => {
      chatUi.setAgenticPriceQuestionOpen((current) => !current)
      chatUi.setAgenticAdjustmentOpen(false)
      chatUi.setAgenticRejectOpen(false)
      conversation.setError(null)
    }}
    onAdjust={() => {
      chatUi.setAgenticAdjustmentOpen(true)
      chatUi.setAgenticPriceQuestionOpen(false)
      chatUi.setAgenticRejectOpen(false)
      conversation.setError(null)
    }}
    onAdjustmentChange={chatUi.setAgenticAdjustmentText}
    onConfirm={decisionActions.confirmAgenticEstimate}
    onReject={() => {
      chatUi.setAgenticAdjustmentOpen(false)
      chatUi.setAgenticPriceQuestionOpen(false)
      chatUi.setAgenticRejectOpen(true)
      conversation.setError(null)
    }}
    onReasonChange={chatUi.setAgenticRejectReason}
    onSubmitAdjustment={() => void decisionActions.submitAgenticAdjustment()}
    onSubmitRejectReason={() => void decisionActions.submitAgenticRejectReason()}
    onSubmitSchedule={decisionActions.submitAgenticSchedule}
    priceExplanationForEstimate={agenticEstimatePriceExplanation}
    priceQuestionOpen={chatUi.agenticPriceQuestionOpen}
    rejected={chatUi.agenticRejectOpen}
    rejectReason={chatUi.agenticRejectReason}
    sourceExplanationForLanguage={agenticEstimateSourceExplanation}
    scheduledAt={conversation.chat?.session.scheduled_at}
    submittingAdjustment={chatUi.submittingAgenticAdjustment}
    submittingRejectReason={chatUi.submittingAgenticRejectReason}
    textInputStyle={[rootStyles.composerInput, customerV21WebTextInputNoOutline]}
  />
}
