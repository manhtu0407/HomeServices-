import { z } from 'zod'

export const KAEL_PRICE_DISCLAIMER_V3 =
  'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.'

export const kaelServiceTypeSchema = z.enum(['electrical', 'plumbing', 'cleaning'])
export const kaelComplexitySchema = z.enum(['small', 'medium', 'large'])
export const estimateConfidenceSchema = z.enum(['low', 'medium', 'high'])

export const estimateCardV3Schema = z.object({
  service_type: kaelServiceTypeSchema,
  problem_summary: z.string().min(10).max(200),
  complexity: kaelComplexitySchema,
  price_min: z.number().int().positive(),
  price_max: z.number().int().positive(),
  confidence: estimateConfidenceSchema,
  needs_inspection: z.boolean(),
  price_source: z.enum([
    'perplexity_validated',
    'baseline_with_market',
    'baseline_only',
    'inspection_required',
  ]),
  kael_reasoning: z.object({
    vision_findings: z.string().max(300).optional(),
    market_signals: z.string().max(300).optional(),
    baseline_used: z.string().max(100),
    complexity_reasoning: z.string().max(200),
    needs_inspection_reason: z.string().max(200).optional(),
  }).strict(),
  advisory: z.string().max(150).optional(),
  disclaimer: z.literal(KAEL_PRICE_DISCLAIMER_V3),
}).strict().superRefine((data, ctx) => {
  if (data.price_max < data.price_min) {
    ctx.addIssue({
      code: 'custom',
      path: ['price_max'],
      message: 'price_max must be >= price_min',
    })
  }
  if (data.needs_inspection && data.confidence !== 'low') {
    ctx.addIssue({
      code: 'custom',
      path: ['confidence'],
      message: 'needs_inspection requires low confidence',
    })
  }
  if (data.needs_inspection && !data.advisory?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['advisory'],
      message: 'needs_inspection requires advisory',
    })
  }
  if (data.price_source === 'inspection_required' && !data.needs_inspection) {
    ctx.addIssue({
      code: 'custom',
      path: ['needs_inspection'],
      message: 'inspection_required requires needs_inspection',
    })
  }
})

export const workerBriefSchema = z.object({
  schema_version: z.literal('worker_brief.v1'),
  stage: z.enum(['core', 'guidance']),
  visibility: z.enum(['pre_accept', 'post_accept']),
  service_type: kaelServiceTypeSchema,
  problem_summary: z.string().min(10).max(200),
  district: z.string().min(1).max(100),
  full_address: z.object({
    building: z.string().max(200).nullable(),
    floor: z.string().max(50).nullable(),
    unit: z.string().max(50).nullable(),
    district: z.string().max(100).nullable(),
  }).strict().nullable(),
  estimated_earning_min: z.number().int().positive().nullable().optional(),
  estimated_earning_max: z.number().int().positive().nullable().optional(),
  sections: z.object({
    context: z.array(z.string().min(1).max(180)).min(1).max(4),
    guidance: z.array(z.string().min(1).max(180)).min(1).max(5),
    safety: z.array(z.string().min(1).max(180)).max(4),
  }).strict(),
}).strict().superRefine((data, ctx) => {
  if (data.visibility === 'pre_accept' && data.full_address !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['full_address'],
      message: 'pre_accept worker brief must not expose full address',
    })
  }
  if (data.stage === 'core' && data.visibility !== 'pre_accept') {
    ctx.addIssue({
      code: 'custom',
      path: ['visibility'],
      message: 'core worker brief must be pre_accept',
    })
  }
  if (data.stage === 'guidance' && data.visibility !== 'post_accept') {
    ctx.addIssue({
      code: 'custom',
      path: ['visibility'],
      message: 'guidance worker brief must be post_accept',
    })
  }
})

export const scopeChangeWorkerChallengeSchema = z.object({
  schema_version: z.literal('scope_change_worker_challenge.v1'),
  challenge_required: z.boolean(),
  challenge_reason: z.string().min(1).max(220),
  requested_evidence: z.array(z.string().min(1).max(160)).min(1).max(5),
  worker_message: z.string().min(1).max(240),
}).strict()

export const scopeChangeCustomerCardSchema = z.object({
  schema_version: z.literal('scope_change_customer_card.v1'),
  service_type: kaelServiceTypeSchema,
  problem_summary: z.string().min(10).max(220),
  price_change: z.object({
    original_price_max: z.number().int().positive().nullable(),
    new_price_min: z.number().int().positive(),
    new_price_max: z.number().int().positive(),
  }).strict(),
  kael_assessment: z.enum(['reasonable', 'high_increase', 'requires_attention']),
  decision_required: z.literal(true),
  advisory: z.string().min(1).max(220),
  disclaimer: z.literal(KAEL_PRICE_DISCLAIMER_V3),
}).strict().superRefine((data, ctx) => {
  if (data.price_change.new_price_max < data.price_change.new_price_min) {
    ctx.addIssue({
      code: 'custom',
      path: ['price_change', 'new_price_max'],
      message: 'new_price_max must be >= new_price_min',
    })
  }
})

export type EstimateCardV3 = z.infer<typeof estimateCardV3Schema>
export type WorkerBrief = z.infer<typeof workerBriefSchema>
export type ScopeChangeWorkerChallenge = z.infer<typeof scopeChangeWorkerChallengeSchema>
export type ScopeChangeCustomerCard = z.infer<typeof scopeChangeCustomerCardSchema>
