import { z } from 'zod'

export const serviceTypeSchema = z.enum(['electrical', 'plumbing'])

export const jobCreateSchema = z.object({
  service_type: serviceTypeSchema,
  description: z.string().min(10).max(2000),
  problem_chips: z.array(z.string().max(100)).min(1).max(10),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  address_building: z.string().max(200).optional(),
  address_unit: z.string().max(50).optional(),
  address_floor: z.string().max(10).optional(),
  address_district: z.string().max(100).optional(),
  scheduled_at: z.string().datetime().optional(),
})

export const scopeChangeSchema = z
  .object({
    job_id: z.string().uuid(),
    description: z.string().min(10).max(2000),
    new_price_min: z.number().int().positive(),
    new_price_max: z.number().int().positive(),
    reason: z.string().min(10).max(1000),
  })
  .refine((data) => data.new_price_max >= data.new_price_min, {
    message: 'new_price_max must be >= new_price_min',
    path: ['new_price_max'],
  })

export const reviewSchema = z.object({
  job_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().max(50)).max(10).default([]),
  comment: z.string().max(1000).optional(),
})

export const chatMessageSchema = z.object({
  job_id: z.string().uuid(),
  content: z.string().min(1).max(5000),
})

export function sanitizeForLLM(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 5000)
}

export type JobCreateInput = z.infer<typeof jobCreateSchema>
export type ScopeChangeInput = z.infer<typeof scopeChangeSchema>
export type ReviewInput = z.infer<typeof reviewSchema>
export type ChatMessageInput = z.infer<typeof chatMessageSchema>
