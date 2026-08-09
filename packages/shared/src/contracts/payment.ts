import { z } from 'zod'
import { privateJobMediaRefSchema } from './common'
export const reviewSchema = z.object({
  job_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
  comment: z.string().trim().max(1000).optional(),
})

export const disputeOpenRequestSchema = z.object({
  dispute_type: z.enum([
    'completion_rejected',
    'damage_claim',
    'unpaid_service',
    'abusive_behavior_customer',
    'abusive_behavior_worker',
    'scope_disagreement_post_job',
    'other',
  ]),
  initiator_statement: z.string().trim().min(10).max(2000),
  evidence_photo_urls: z.array(privateJobMediaRefSchema).max(5).default([]),
}).strict()

export const disputeCounterStatementSchema = z.object({
  statement: z.string().trim().min(10).max(2000),
})

export const disputeAdminDecisionSchema = z.object({
  outcome: z.enum([
    'customer_favor_full',
    'customer_favor_partial',
    'worker_favor',
    'no_fault_both',
    'mutual_warning',
  ]),
  refund_amount: z.number().int().nonnegative().optional(),
  worker_credit_amount: z.number().int().nonnegative().optional(),
  customer_trust_impact: z.enum(['none', 'minor_down', 'major_down', 'positive_resolved']),
  worker_action: z.enum(['none', 'warning', 'temp_suspend_7d', 'temp_suspend_30d', 'permanent_suspend']),
  reasoning: z.string().trim().min(50).max(2000),
})

export type ReviewInput = z.infer<typeof reviewSchema>
export type DisputeOpenRequestInput = z.infer<typeof disputeOpenRequestSchema>
export type DisputeCounterStatementInput = z.infer<typeof disputeCounterStatementSchema>
export type DisputeAdminDecisionInput = z.infer<typeof disputeAdminDecisionSchema>
