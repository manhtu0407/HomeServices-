import { CaseWorkResponse } from './case-work-response'
import { buildCaseWorkResponseModel } from './case-work-response-model'
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
  const model = buildCaseWorkResponseModel({
    language,
    phase,
    subject: conversation.pendingDraft?.description,
  })

  return (
    <CaseWorkResponse
      model={model}
      reduceMotion={reduceMotion}
      testID="customer-v21-case-work-intake-response"
      tokens={tokens}
    />
  )
}
