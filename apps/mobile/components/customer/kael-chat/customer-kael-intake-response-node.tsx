import { IntakeConfirmationResponse } from '../kael-chat/intake-confirmation-response'
import { CaseWorkResponse } from './case-work-response'
import {
  buildCaseWorkResponseModel,
  buildIntakeConfirmationResponseModel,
} from './case-work-response-model'
import {
  resolveCaseWorkIntakePhase,
  shouldShowCaseWorkIntakeResponse,
} from './customer-kael-intake-response-model'
import type { useCustomerKaelSurfaceController } from './use-customer-kael-surface-controller'

type Controller = ReturnType<typeof useCustomerKaelSurfaceController>

export function CustomerKaelIntakeResponseNode({ controller }: { controller: Controller }) {
  const {
    conversation,
    deal,
    decisionActions,
    language,
    mode,
    presentation,
    processController,
    reduceMotion,
    tokens,
  } = controller
  const chat = conversation.chat
  if (!shouldShowCaseWorkIntakeResponse({
    dealExists: Boolean(deal),
    evidenceGateActive: presentation.agenticEvidenceGateActive,
    mode,
    offerReviewActive: presentation.offerReviewActive,
    serverPriceReviewBlocked: presentation.serverPriceReviewBlocked,
    workIntakeActive: presentation.workIntakeActive,
  })) return null
  if (chat?.session.status === 'abandoned' || chat?.session.status === 'unsupported') return null

  const phase = resolveCaseWorkIntakePhase({
    hasSession: Boolean(chat),
    loading: conversation.loading || Boolean(processController.processLines),
    nextAction: chat?.session.next_action ?? null,
    status: chat?.session.status ?? null,
  })
  const intakeConfirmation = presentation.intakeConfirmationActive
    ? presentation.intakeConfirmation
    : null
  const model = intakeConfirmation
    ? buildIntakeConfirmationResponseModel(language, intakeConfirmation.focus)
    : buildCaseWorkResponseModel({
        language,
        phase,
        subject: conversation.pendingDraft?.description,
      })

  return (
    <CaseWorkResponse
      details={intakeConfirmation ? (
        <IntakeConfirmationResponse
          busy={conversation.loading}
          confirmation={intakeConfirmation}
          language={language}
          onConfirm={() => void decisionActions.confirmIntakeInformation()}
          onCorrection={() => void decisionActions.requestIntakeCorrection()}
          tokens={tokens}
        />
      ) : undefined}
      model={model}
      reduceMotion={reduceMotion}
      testID="customer-v21-case-work-intake-response"
      tokens={tokens}
    />
  )
}
