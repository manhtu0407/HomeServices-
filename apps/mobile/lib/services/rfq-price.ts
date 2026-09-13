import {
  rfqPriceProposalInputSchema, rfqPriceDecisionInputSchema, rfqPriceProposalSchema, rfqPriceStatusSchema,
  type RfqPriceProposal, type RfqPriceStatus, type RfqPriceProposalInput,
} from '@nestscout/shared'
import { api, createClientDiagnosticMetadata, type ApiResult } from '../api'

export type RfqIdentity = { ownerId: string; jobId: string; role: 'customer' | 'worker' }
export type RfqCommand = RfqIdentity & (
  { kind: 'propose'; input: RfqPriceProposalInput }
  | { kind: 'decide'; proposal: RfqPriceProposal; approve: boolean }
)

export const rfqPriceService = {
  async load(identity: RfqIdentity, token: string): Promise<ApiResult<RfqPriceStatus>> {
    const result = await api.getAuthenticated<unknown>(path(identity.jobId), token)
    if (!result.success) return result
    const parsed = rfqPriceStatusSchema.safeParse(result.data)
    if (!parsed.success || parsed.data.job_id !== identity.jobId ||
      (parsed.data.proposal && !belongs(parsed.data.proposal, identity))) return unknown(result)
    return { ...result, data: parsed.data }
  },
  async execute(command: RfqCommand, token: string): Promise<ApiResult<RfqPriceProposal>> {
    const input = command.kind === 'propose' ? rfqPriceProposalInputSchema.parse(command.input)
      : rfqPriceDecisionInputSchema.parse({ proposal_id: command.proposal.id, approve: command.approve })
    const result = await api.postAuthenticated<unknown>(
      path(command.jobId) + (command.kind === 'decide' ? '/decide' : ''), input, token)
    if (!result.success) return result
    const parsed = rfqPriceProposalSchema.safeParse(result.data)
    if (!parsed.success || !belongs(parsed.data, command)) return unknown(result)
    const proposal = parsed.data
    if (command.kind === 'propose') {
      if (command.role !== 'worker' || proposal.id !== command.input.request_id ||
        proposal.customer_total !== command.input.customer_total || proposal.scope_summary !== command.input.scope_summary) return unknown(result)
    } else if (command.role !== 'customer' || !samePrice(proposal, command.proposal) ||
      proposal.status !== (command.approve ? 'approved' : 'rejected')) return unknown(result)
    return { ...result, data: proposal }
  },
}

function path(jobId: string) { return `/jobs/${encodeURIComponent(jobId)}/rfq-price` }
function belongs(proposal: RfqPriceProposal, identity: RfqIdentity) {
  return proposal.job_id === identity.jobId &&
    (identity.role === 'worker' ? proposal.worker_id : proposal.customer_id) === identity.ownerId
}
function samePrice(left: RfqPriceProposal, right: RfqPriceProposal) {
  return left.id === right.id && left.job_id === right.job_id && left.worker_id === right.worker_id &&
    left.customer_id === right.customer_id && left.customer_total === right.customer_total &&
    left.scope_summary === right.scope_summary && left.currency === right.currency && left.quote_mode === right.quote_mode
}
function unknown(result: ApiResult<unknown>): ApiResult<never> {
  return { success: false, error: '', code: 'RFQ_PRICE_OUTCOME_UNKNOWN', status: 503,
    meta: result.meta ?? createClientDiagnosticMetadata() }
}
