import type {
  EstimateCardV3,
  ScopeChangeCustomerCard,
  ScopeChangeWorkerChallenge,
  WorkerBrief,
} from '../schemas/index.ts'
import { sanitizeKaelOutputObject } from '../sanitizers/index.ts'

export function renderEstimateCardV3(card: EstimateCardV3): EstimateCardV3 {
  return sanitizeKaelOutputObject(card)
}

export function renderWorkerBrief(brief: WorkerBrief): WorkerBrief {
  const rendered = sanitizeKaelOutputObject(brief)
  if (rendered.visibility === 'pre_accept') {
    return {
      ...rendered,
      full_address: null,
    }
  }
  return rendered
}

export function renderScopeChangeCustomerCard(card: ScopeChangeCustomerCard): ScopeChangeCustomerCard {
  return sanitizeKaelOutputObject(card)
}

export function renderScopeChangeWorkerChallenge(
  challenge: ScopeChangeWorkerChallenge,
): ScopeChangeWorkerChallenge {
  return sanitizeKaelOutputObject(challenge)
}
