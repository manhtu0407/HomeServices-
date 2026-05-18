import { z } from 'zod'

export const intentResultSchema = z.object({
  service_type: z.enum(['electrical', 'plumbing', 'unsupported']),
  problem_slug: z.string().min(1).max(100),
  confidence: z.number().min(0).max(1),
  needs_clarification: z.boolean(),
})

export type IntentResult = z.infer<typeof intentResultSchema>

export const visionResultSchema = z.object({
  problem_identified: z.string().min(1).max(500),
  severity_indicators: z.array(z.string().max(200)).max(5),
  complexity_hint: z.enum(['small', 'medium', 'large']),
})

export type VisionResult = z.infer<typeof visionResultSchema>

export const marketPriceResultSchema = z.object({
  market_range_min: z.number().int().positive(),
  market_range_max: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  sources_summary: z.string().max(1000).optional(),
})

export type MarketPriceResult = z.infer<typeof marketPriceResultSchema>

export const kaelEstimateSchema = z.object({
  service_type: z.enum(['electrical', 'plumbing']),
  problem_category: z.string().min(1).max(100),
  problem_summary: z.string().min(1).max(500),
  complexity: z.enum(['small', 'medium', 'large']),
  price_min: z.number().int().positive(),
  price_max: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  advisory: z.string().max(500).nullable(),
  disclaimer: z.string().min(1),
})

export type { KaelEstimate } from '@home-services/shared'

export const workerPrebriefSchema = z.object({
  job_id: z.string().uuid(),
  service_type: z.enum(['electrical', 'plumbing']),
  problem_summary: z.string().min(1).max(500),
  customer_description: z.string().min(1).max(2000),
  complexity: z.enum(['small', 'medium', 'large']),
  key_observations: z.array(z.string().max(200)).max(5),
  suggested_tools: z.array(z.string().max(100)).max(10),
  estimated_duration_minutes: z.number().int().positive().max(480),
})

export type WorkerPrebrief = z.infer<typeof workerPrebriefSchema>

export const PRICE_DISCLAIMER =
  'Đây là ước tính dựa trên thị trường. Giá thực tế sẽ được xác nhận bởi thợ trước khi bắt đầu.'

export const UNSUPPORTED_SERVICE_MESSAGE =
  'Chúng tôi hiện chỉ hỗ trợ sửa điện và sửa nước. Vui lòng quay lại khi chúng tôi mở rộng dịch vụ.'
