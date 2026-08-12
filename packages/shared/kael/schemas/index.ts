import { z } from 'zod'
import { SERVICE_TYPES } from '../../src/constants'

export const KAEL_PRICE_DISCLAIMER_V3 =
  'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.'

const kaelServiceTypeSchema = z.enum(SERVICE_TYPES)
const kaelComplexitySchema = z.enum(['small', 'medium', 'large'])
const estimateConfidenceSchema = z.enum(['low', 'medium', 'high'])

const estimateAnalysisFindingSchema = z.object({
  confidence: estimateConfidenceSchema,
  evidence_index: z.number().int().min(1),
  evidence_kind: z.enum(['photo', 'video_frame']),
  observation: z.string().trim().min(1).max(240),
  possible_meaning: z.string().trim().min(1).max(240).nullable(),
}).strict()

const estimateAnalysisEvidenceSchema = z.object({
  analysis_status: z.enum(['analyzed', 'not_provided', 'unavailable']).optional(),
  findings: z.array(estimateAnalysisFindingSchema).max(5).optional(),
  photo_count: z.number().int().nonnegative(),
  video_frame_count: z.number().int().nonnegative(),
  voice_transcript_count: z.number().int().nonnegative(),
  skipped: z.boolean(),
}).strict().superRefine((evidence, ctx) => {
  const seen = new Set<string>()
  for (const [index, finding] of (evidence.findings ?? []).entries()) {
    const availableCount = finding.evidence_kind === 'photo'
      ? evidence.photo_count
      : evidence.video_frame_count
    const key = `${finding.evidence_kind}:${finding.evidence_index}`
    if (finding.evidence_index > availableCount) {
      ctx.addIssue({
        code: 'custom',
        path: ['findings', index, 'evidence_index'],
        message: 'finding must reference supplied evidence',
      })
    }
    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['findings', index, 'evidence_index'],
        message: 'finding evidence reference must be unique',
      })
    }
    seen.add(key)
  }
  if (evidence.skipped && (evidence.findings?.length ?? 0) > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['findings'],
      message: 'skipped evidence cannot contain findings',
    })
  }
  if (
    evidence.analysis_status &&
    evidence.analysis_status !== 'analyzed' &&
    (evidence.findings?.length ?? 0) > 0
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['findings'],
      message: 'unavailable or missing analysis cannot contain findings',
    })
  }
  if (evidence.skipped && evidence.analysis_status && evidence.analysis_status !== 'not_provided') {
    ctx.addIssue({
      code: 'custom',
      path: ['analysis_status'],
      message: 'skipped evidence must be marked not_provided',
    })
  }
})

const estimateAnalysisReceiptSchema = z.object({
  schema_version: z.literal('analysis_receipt.v1'),
  evidence: estimateAnalysisEvidenceSchema,
  market: z.object({
    accepted_source_count: z.number().int().nonnegative().nullable(),
    high_trust_source_count: z.number().int().nonnegative().nullable(),
    quorum_met: z.boolean().nullable(),
  }).strict(),
  problem: z.object({
    remaining_uncertainty: z.string().trim().min(1).max(300).nullable(),
    recommended_scope: z.string().trim().min(1).max(400).nullable(),
    severity_indicators: z.array(z.string().trim().min(1).max(200)).max(5),
    summary: z.string().trim().min(1).max(500),
  }).strict().optional(),
}).strict()

const priceReasoningComponentSchema = z.object({
  kind: z.enum([
    'service_package',
    'labor',
    'travel',
    'materials',
    'replacement_parts',
    'equipment',
    'other',
  ]),
  status: z.enum([
    'priced',
    'included_unitemized',
    'conditional_unpriced',
    'excluded',
    'undetermined',
  ]),
  amount_min: z.number().int().positive().nullable(),
  amount_max: z.number().int().positive().nullable(),
  explanation: z.string().trim().min(1).max(360),
}).strict().superRefine((component, ctx) => {
  const hasMin = component.amount_min !== null
  const hasMax = component.amount_max !== null
  if (hasMin !== hasMax) {
    ctx.addIssue({
      code: 'custom',
      path: ['amount_max'],
      message: 'component amounts must be both present or both absent',
    })
    return
  }
  const amountMin = component.amount_min
  const amountMax = component.amount_max
  if (amountMin !== null && amountMax !== null && amountMax < amountMin) {
    ctx.addIssue({
      code: 'custom',
      path: ['amount_max'],
      message: 'component amount_max must be >= amount_min',
    })
  }
  if (component.status === 'priced' && !hasMin) {
    ctx.addIssue({
      code: 'custom',
      path: ['amount_min'],
      message: 'priced components require both amounts',
    })
  }
  if (component.status === 'priced' && component.kind !== 'service_package') {
    ctx.addIssue({
      code: 'custom',
      path: ['kind'],
      message: 'only the governed service package may expose a numeric amount',
    })
  }
  if (component.status !== 'priced' && hasMin) {
    ctx.addIssue({
      code: 'custom',
      path: ['amount_min'],
      message: 'unpriced components must not expose a numeric amount',
    })
  }
})

const priceReasoningScenarioSchema = z.object({
  total: z.number().int().positive(),
  conditions: z.array(z.string().trim().min(1).max(260)).min(1).max(5),
  scope: z.array(z.string().trim().min(1).max(260)).min(1).max(5),
}).strict()

export const priceReasoningReceiptSchema = z.object({
  schema_version: z.literal('price_reasoning_receipt.v1'),
  receipt_id: z.string().trim().min(8).max(160),
  problem: z.object({
    confirmed_facts: z.array(z.string().trim().min(1).max(300)).min(1).max(5),
    possible_causes: z.array(z.object({
      statement: z.string().trim().min(1).max(300),
      basis: z.array(z.enum([
        'customer_report',
        'visual_evidence',
        'service_profile',
        'knowledge',
      ])).min(1).max(4),
      confidence: estimateConfidenceSchema,
    }).strict()).max(5),
    unknowns: z.array(z.string().trim().min(1).max(300)).max(5),
  }).strict(),
  scope: z.object({
    included: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
    conditional: z.array(z.string().trim().min(1).max(300)).max(8),
    excluded: z.array(z.string().trim().min(1).max(300)).max(8),
  }).strict(),
  costs: z.object({
    currency: z.literal('VND'),
    total_min: z.number().int().positive(),
    total_max: z.number().int().positive(),
    reconciliation: z.enum(['package_total', 'exact']),
    components: z.array(priceReasoningComponentSchema).min(1).max(8),
  }).strict(),
  scenarios: z.object({
    low: priceReasoningScenarioSchema,
    high: priceReasoningScenarioSchema,
  }).strict(),
  fairness: z.object({
    price_source: z.enum([
      'perplexity_validated',
      'baseline_with_market',
      'baseline_only',
      'inspection_required',
    ]),
    confidence: estimateConfidenceSchema,
    market_source_count: z.number().int().nonnegative().nullable(),
    high_trust_source_count: z.number().int().nonnegative().nullable(),
    quorum_met: z.boolean().nullable(),
    cap_statement: z.string().trim().min(1).max(360),
    remaining_uncertainty: z.array(z.string().trim().min(1).max(300)).max(5),
  }).strict(),
}).strict().superRefine((receipt, ctx) => {
  if (receipt.costs.total_max < receipt.costs.total_min) {
    ctx.addIssue({
      code: 'custom',
      path: ['costs', 'total_max'],
      message: 'total_max must be >= total_min',
    })
  }
  if (receipt.scenarios.low.total !== receipt.costs.total_min) {
    ctx.addIssue({
      code: 'custom',
      path: ['scenarios', 'low', 'total'],
      message: 'low scenario must reconcile to total_min',
    })
  }
  if (receipt.scenarios.high.total !== receipt.costs.total_max) {
    ctx.addIssue({
      code: 'custom',
      path: ['scenarios', 'high', 'total'],
      message: 'high scenario must reconcile to total_max',
    })
  }
  const pricedComponents = receipt.costs.components.filter((component) => component.status === 'priced')
  if (receipt.costs.reconciliation === 'package_total') {
    const packageComponent = pricedComponents[0]
    if (
      pricedComponents.length !== 1 ||
      !packageComponent ||
      packageComponent.kind !== 'service_package' ||
      packageComponent.amount_min !== receipt.costs.total_min ||
      packageComponent.amount_max !== receipt.costs.total_max
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['costs', 'components'],
        message: 'package_total requires one priced service package matching the offered range',
      })
    }
  }
  if (receipt.costs.reconciliation === 'exact') {
    const totalMin = pricedComponents.reduce((sum, component) => sum + (component.amount_min ?? 0), 0)
    const totalMax = pricedComponents.reduce((sum, component) => sum + (component.amount_max ?? 0), 0)
    if (
      pricedComponents.length === 0 ||
      totalMin !== receipt.costs.total_min ||
      totalMax !== receipt.costs.total_max
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['costs', 'components'],
        message: 'exact components must sum to the offered range',
      })
    }
  }
  const marketCount = receipt.fairness.market_source_count
  const highTrustCount = receipt.fairness.high_trust_source_count
  if (marketCount !== null && highTrustCount !== null && highTrustCount > marketCount) {
    ctx.addIssue({
      code: 'custom',
      path: ['fairness', 'high_trust_source_count'],
      message: 'high-trust sources cannot exceed total market sources',
    })
  }
})

export const estimateCardV3Schema = z.object({
  service_type: kaelServiceTypeSchema,
  problem_summary: z.string().trim().min(10).max(200),
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
    vision_findings: z.string().trim().max(300).optional(),
    market_signals: z.string().trim().max(300).optional(),
    baseline_used: z.string().trim().min(1).max(100),
    complexity_reasoning: z.string().trim().min(1).max(200),
    needs_inspection_reason: z.string().trim().max(200).optional(),
  }).strict(),
  analysis_receipt: estimateAnalysisReceiptSchema.optional(),
  price_reasoning_receipt: priceReasoningReceiptSchema.optional(),
  advisory: z.string().trim().max(150).optional(),
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
  if (data.price_reasoning_receipt) {
    const receipt = data.price_reasoning_receipt
    if (
      receipt.costs.total_min !== data.price_min ||
      receipt.costs.total_max !== data.price_max
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['price_reasoning_receipt', 'costs'],
        message: 'price reasoning receipt must reconcile to the card range',
      })
    }
    if (receipt.fairness.price_source !== data.price_source) {
      ctx.addIssue({
        code: 'custom',
        path: ['price_reasoning_receipt', 'fairness', 'price_source'],
        message: 'price reasoning source must match the card source',
      })
    }
  }
})

export const workerBriefSchema = z.object({
  schema_version: z.literal('worker_brief.v1'),
  stage: z.enum(['core', 'guidance']),
  visibility: z.enum(['pre_accept', 'post_accept']),
  service_type: kaelServiceTypeSchema,
  problem_summary: z.string().trim().min(10).max(200),
  district: z.string().trim().min(1).max(100),
  full_address: z.object({
    building: z.string().trim().max(200).nullable(),
    floor: z.string().trim().max(50).nullable(),
    unit: z.string().trim().max(50).nullable(),
    district: z.string().trim().max(100).nullable(),
  }).strict().nullable(),
  estimated_earning_min: z.number().int().positive().nullable().optional(),
  estimated_earning_max: z.number().int().positive().nullable().optional(),
  sections: z.object({
    context: z.array(z.string().trim().min(1).max(180)).min(1).max(4),
    guidance: z.array(z.string().trim().min(1).max(180)).min(1).max(5),
    safety: z.array(z.string().trim().min(1).max(180)).max(4),
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
  const earningMin = data.estimated_earning_min ?? null
  const earningMax = data.estimated_earning_max ?? null
  if ((earningMin === null) !== (earningMax === null)) {
    ctx.addIssue({
      code: 'custom',
      path: ['estimated_earning_max'],
      message: 'worker earnings require both range bounds or neither bound',
    })
  } else if (earningMin !== null && earningMax !== null && earningMax < earningMin) {
    ctx.addIssue({
      code: 'custom',
      path: ['estimated_earning_max'],
      message: 'estimated_earning_max must be >= estimated_earning_min',
    })
  }
})

export const scopeChangeWorkerChallengeSchema = z.object({
  schema_version: z.literal('scope_change_worker_challenge.v1'),
  challenge_required: z.boolean(),
  challenge_reason: z.string().trim().min(1).max(220),
  requested_evidence: z.array(z.string().trim().min(1).max(160)).min(1).max(5),
  worker_message: z.string().trim().min(1).max(240),
}).strict()

export const scopeChangeCustomerCardSchema = z.object({
  schema_version: z.literal('scope_change_customer_card.v1'),
  service_type: kaelServiceTypeSchema,
  problem_summary: z.string().trim().min(10).max(220),
  price_change: z.object({
    original_price_max: z.number().int().positive().nullable(),
    new_price_min: z.number().int().positive(),
    new_price_max: z.number().int().positive(),
  }).strict(),
  kael_assessment: z.enum(['reasonable', 'high_increase', 'requires_attention']),
  decision_required: z.literal(true),
  advisory: z.string().trim().min(1).max(220),
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
export type PriceReasoningReceipt = z.infer<typeof priceReasoningReceiptSchema>
export type WorkerBrief = z.infer<typeof workerBriefSchema>
export type ScopeChangeWorkerChallenge = z.infer<typeof scopeChangeWorkerChallengeSchema>
export type ScopeChangeCustomerCard = z.infer<typeof scopeChangeCustomerCardSchema>
