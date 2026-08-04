import type {
  EstimateCardV3,
  WorkerBrief,
} from '../schemas'
import { sanitizeKaelOutputObject } from '../sanitizers'

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
