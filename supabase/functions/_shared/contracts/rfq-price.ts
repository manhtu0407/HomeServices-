import { z } from 'zod'

export const rfqPriceProposalInputSchema = z.object({
  request_id: z.string().uuid(),
  customer_total: z.number().int().positive().max(2147483647),
  scope_summary: z.string().trim().min(10).max(2000),
}).strict()

export const rfqPriceDecisionInputSchema = z.object({
  proposal_id: z.string().uuid(),
  approve: z.boolean(),
}).strict()

export const rfqPriceProposalSchema = z.object({
  id: z.string().uuid(),
  job_id: z.string().uuid(),
  worker_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  quote_mode: z.enum(['rfq', 'inspection_only']),
  scope_summary: z.string().min(10).max(2000),
  customer_total: z.number().int().positive().max(2147483647),
  currency: z.literal('VND'),
  status: z.enum(['pending', 'approved', 'rejected']),
  created_at: z.string().datetime({ offset: true }),
  decided_at: z.string().datetime({ offset: true }).nullable(),
}).strict().refine(value => (value.status === 'pending') === (value.decided_at === null))

export const rfqPriceStatusSchema = z.object({
  job_id: z.string().uuid(),
  quote_mode: z.enum(['kael_auto_quote', 'rfq', 'inspection_only', 'blocked']).nullable(),
  proposal: rfqPriceProposalSchema.nullable(),
}).strict().refine(value => !value.proposal || value.proposal.job_id === value.job_id)

export type EdgeRfqPriceProposalInput = z.infer<typeof rfqPriceProposalInputSchema>
export type EdgeRfqPriceDecisionInput = z.infer<typeof rfqPriceDecisionInputSchema>
export type EdgeRfqPriceProposal = z.infer<typeof rfqPriceProposalSchema>
export type EdgeRfqPriceStatus = z.infer<typeof rfqPriceStatusSchema>
