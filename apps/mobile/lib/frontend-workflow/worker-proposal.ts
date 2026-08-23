import type {
  WorkerBroadcastProposalAction,
  WorkerBroadcastProposalInput,
} from '../api-types'

export type WorkerProposalDraft = {
  priceMaxText: string
  priceMinText: string
  scopeSummary: string
}

export type WorkerProposalValidation =
  | { success: true; input: WorkerBroadcastProposalInput }
  | { success: false; code: 'PROPOSAL_SCOPE_INVALID' | 'PROPOSAL_PRICE_REQUIRED' | 'PROPOSAL_PRICE_RANGE_INVALID' | 'PROPOSAL_ACTION_INVALID' }

export function validateWorkerProposal(
  action: WorkerBroadcastProposalAction,
  draft: WorkerProposalDraft,
): WorkerProposalValidation {
  const scopeSummary = draft.scopeSummary.trim()
  if (scopeSummary.length < 3 || scopeSummary.length > 2_000) {
    return { success: false, code: 'PROPOSAL_SCOPE_INVALID' }
  }
  if (action === 'submit_inspection_scope') {
    return { success: true, input: { scope_summary: scopeSummary } }
  }
  if (action !== 'submit_rfq_proposal') {
    return { success: false, code: 'PROPOSAL_ACTION_INVALID' }
  }
  const priceMin = positiveInteger(draft.priceMinText)
  const priceMax = positiveInteger(draft.priceMaxText)
  if (priceMin === null || priceMax === null) {
    return { success: false, code: 'PROPOSAL_PRICE_REQUIRED' }
  }
  if (priceMax < priceMin) {
    return { success: false, code: 'PROPOSAL_PRICE_RANGE_INVALID' }
  }
  return {
    success: true,
    input: {
      price_max: priceMax,
      price_min: priceMin,
      scope_summary: scopeSummary,
    },
  }
}

export function isWorkerBroadcastProposalAction(value: unknown): value is WorkerBroadcastProposalAction {
  return value === 'accept_priced_offer'
    || value === 'submit_rfq_proposal'
    || value === 'submit_inspection_scope'
}

function positiveInteger(value: string) {
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
