import { z } from 'zod'

// Smart-clarification intake-diagnosis slots (2026-06-04). The pieces of context
// Kael may still need before a reliable estimate. Used to drive ONE specific
// follow-up question (STRUCTURES.md A4), never a generic "please add more info".
export const KAEL_INTAKE_MISSING_SLOTS = [
  'location',
  'symptom',
  'severity',
  'duration',
  'photo',
  'district',
] as const

export const intentResultSchema = z.object({
  service_type: z.enum(['electrical', 'plumbing', 'cleaning', 'unsupported']),
  problem_slug: z.string().min(1).max(100),
  confidence: z.number().min(0).max(1),
  needs_clarification: z.boolean(),
  // Intake-diagnosis fields (2026-06-04). Optional so legacy AI responses and the
  // deterministic fallback stay valid (additive, backward compatible). Consumers
  // default at read time.
  missing_slots: z
    .array(z.enum(['location', 'symptom', 'severity', 'duration', 'photo', 'district']))
    .max(4)
    .optional(),
  clarification_question_vi: z.string().max(160).nullable().optional(),
  scope_signal: z.enum(['in_scope', 'out_of_scope', 'service_mismatch']).optional(),
  suggested_service: z.enum(['electrical', 'plumbing', 'cleaning']).nullable().optional(),
  customer_sentiment: z.enum(['neutral', 'detail_oriented', 'pressure']).optional(),
})

export type IntentResult = z.infer<typeof intentResultSchema>

export const visionResultSchema = z.object({
  problem_identified: z.string().min(1).max(500),
  severity_indicators: z.array(z.string().max(200)).max(5),
  complexity_hint: z.enum(['small', 'medium', 'large']),
})

export type VisionResult = z.infer<typeof visionResultSchema>

export const marketSourceTrustSignalsSchema = z.object({
  identity_verified: z.boolean(),
  source_type: z.enum(['direct_pricing', 'materials', 'reference', 'listing', 'unknown']),
  hcmc_relevant: z.boolean(),
  clear_price_and_unit: z.boolean(),
  integrity_verified: z.boolean(),
  evidence_verified: z.boolean(),
  review_overdue: z.boolean(),
  price_jump_suspected: z.boolean(),
}).strict()

export const marketSourceEvidenceSchema = z.object({
  domain: z.string().min(1).max(253),
  price_min: z.number().int().positive(),
  price_max: z.number().int().positive(),
  unit: z.enum(['per_visit', 'per_hour', 'per_m2']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  signals: marketSourceTrustSignalsSchema.optional(),
}).refine((value) => value.price_max >= value.price_min, {
  message: 'price_max must be >= price_min',
  path: ['price_max'],
})

export const marketPriceResultSchema = z.object({
  market_range_min: z.number().int().positive(),
  market_range_max: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  sources_summary: z.string().max(1000).optional(),
  sources: z.array(marketSourceEvidenceSchema).max(10).optional(),
})

export type MarketPriceResult = z.infer<typeof marketPriceResultSchema>

export const kaelEstimateSchema = z.object({
  service_type: z.enum(['electrical', 'plumbing', 'cleaning']),
  problem_category: z.string().min(1).max(100),
  problem_summary: z.string().min(1).max(500),
  complexity: z.enum(['small', 'medium', 'large']),
  price_min: z.number().int().positive(),
  price_max: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  advisory: z.string().max(500).nullable(),
  disclaimer: z.string().min(1),
})

export type { KaelEstimate } from '@nestscout/shared'

export const workerPrebriefSchema = z.object({
  job_id: z.string().uuid(),
  service_type: z.enum(['electrical', 'plumbing', 'cleaning']),
  problem_summary: z.string().min(1).max(500),
  customer_description: z.string().min(1).max(2000),
  complexity: z.enum(['small', 'medium', 'large']),
  key_observations: z.array(z.string().max(200)).max(5),
  suggested_tools: z.array(z.string().max(100)).max(10),
  estimated_duration_minutes: z.number().int().positive().max(480),
})

export type WorkerPrebrief = z.infer<typeof workerPrebriefSchema>

export const PRICE_DISCLAIMER =
  'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.'

export const UNSUPPORTED_SERVICE_MESSAGE =
  'Chúng tôi hiện chỉ hỗ trợ sửa điện, sửa nước và vệ sinh. Vui lòng quay lại khi chúng tôi mở rộng dịch vụ.'
