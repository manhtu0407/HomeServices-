import type { AppLanguage } from '@/lib/app-language'
import type { LocalDeal } from '@nestscout/shared'

import {
  buildAgenticCaseThreadAcceptedWorkerCardModel,
  buildAgenticCaseThreadEtaCardModel,
  buildAgenticCaseThreadJobProgressCardModel,
  buildAgenticCaseThreadLiveNoticeCardModel,
  buildAgenticCaseThreadMatchingCardModel,
  buildAgenticCaseThreadOptionsCardModel,
  buildAgenticCaseThreadQuoteDecisionModel,
  type AgenticCaseThreadAcceptedWorkerCardModel,
  type AgenticCaseThreadEtaCardModel,
  type AgenticCaseThreadJobProgressCardModel,
  type AgenticCaseThreadLiveNoticeCardModel,
  type AgenticCaseThreadMatchingCardModel,
  type AgenticCaseThreadModel,
  type AgenticCaseThreadOptionsCardModel,
  type AgenticCaseThreadPaymentPanelModel,
  type AgenticCaseThreadQuoteDecisionModel,
} from './case-work-display-model'

export type AgenticCaseThreadStageCardModels = {
  acceptedWorker: AgenticCaseThreadAcceptedWorkerCardModel | null
  eta: AgenticCaseThreadEtaCardModel | null
  jobProgress: AgenticCaseThreadJobProgressCardModel | null
  liveNotice: AgenticCaseThreadLiveNoticeCardModel | null
  matching: AgenticCaseThreadMatchingCardModel | null
  options: AgenticCaseThreadOptionsCardModel | null
  payment: AgenticCaseThreadPaymentPanelModel | null
  quoteDecision: AgenticCaseThreadQuoteDecisionModel | null
}

export function buildAgenticCaseThreadStageCardModels(
  deal: LocalDeal,
  language: AppLanguage,
  threadModel: AgenticCaseThreadModel,
): AgenticCaseThreadStageCardModels {
  const {
    acceptedWorkerGateActive,
    casePaymentPanel,
    etaGateActive,
    jobProgressGateActive,
    liveNoticeGateActive,
    matchingGateActive,
    optionsGateActive,
    paymentGateActive,
    quoteDecision,
  } = threadModel

  return {
    acceptedWorker: !paymentGateActive && acceptedWorkerGateActive
      ? buildAgenticCaseThreadAcceptedWorkerCardModel(deal, language)
      : null,
    eta: !paymentGateActive && etaGateActive
      ? buildAgenticCaseThreadEtaCardModel(deal, language)
      : null,
    jobProgress: !paymentGateActive && jobProgressGateActive
      ? buildAgenticCaseThreadJobProgressCardModel(deal, language)
      : null,
    liveNotice: !paymentGateActive && liveNoticeGateActive
      ? buildAgenticCaseThreadLiveNoticeCardModel(deal, language)
      : null,
    matching: matchingGateActive
      ? buildAgenticCaseThreadMatchingCardModel(deal, language)
      : null,
    options: optionsGateActive
      ? buildAgenticCaseThreadOptionsCardModel(deal, language)
      : null,
    payment: paymentGateActive && casePaymentPanel ? casePaymentPanel : null,
    quoteDecision: quoteDecision
      ? buildAgenticCaseThreadQuoteDecisionModel(quoteDecision, threadModel.overview, language)
      : null,
  }
}
