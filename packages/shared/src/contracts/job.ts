import { z } from 'zod'
import {
  clientRequestIdSchema,
  jobMediaStages,
  privateJobMediaRefSchema,
  serviceTypeSchema,
  uuidPathPattern,
} from './common'
export const apartmentAccessProfileSchema = z.object({
  entry_method: z.string().max(300).optional(),
  parking_note: z.string().max(300).optional(),
  guard_note: z.string().max(300).optional(),
  building_note: z.string().max(300).optional(),
  customer_handoff_note: z.string().max(300).optional(),
}).default({})

export const jobCreateSchema = z.object({
  service_type: serviceTypeSchema,
  description: z.string().trim().min(10).max(2000),
  problem_chips: z.array(z.string().trim().min(1).max(100)).min(1).max(10),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  address_building: z.string().max(200).optional(),
  address_unit: z.string().max(50).optional(),
  address_floor: z.string().max(10).optional(),
  address_district: z.string().max(100).optional(),
  apartment_access_profile: apartmentAccessProfileSchema.optional(),
  scheduled_at: z.string().datetime().optional(),
  // Mobile-generated UUID v4 per submit.
  // Server returns the existing job on retry instead of creating duplicates.
  client_request_id: clientRequestIdSchema.optional(),
})

export const placesAutocompleteSchema = z.object({
  input: z.string().trim().min(2).max(160),
  session_token: z.string().max(120).optional(),
})

export const placesResolveSchema = z.object({
  label: z.string().trim().min(2).max(240).optional(),
  place_id: z.string().trim().min(3).max(240),
})

export const chatMessageSchema = z.object({
  job_id: z.string().uuid(),
  content: z.string().trim().min(1).max(5000),
})

export const jobMessageSendSchema = z.object({
  content: z.string().trim().min(1).max(5000),
})

const jobMediaAssetSchema = z.object({
  object_path: z.string().min(10).max(500).regex(
    new RegExp(`^${uuidPathPattern}/(?:${jobMediaStages.join('|')})/(?!.*(?:\\.\\.|//))[^\\s?#/]+$`, 'i'),
    'Job media object_path must be a private job-scoped storage path',
  ),
  stage: z.enum(jobMediaStages),
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']).optional(),
  file_size_bytes: z.number().int().positive().max(26_214_400).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.object_path.split('/')[1] !== value.stage) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['stage'],
      message: 'Job media stage must match object_path',
    })
  }
})

export const jobMediaAttachSchema = z.object({
  assets: z.array(jobMediaAssetSchema).min(1).max(5),
}).strict().superRefine((value, ctx) => {
  const paths = value.assets.map((asset) => asset.object_path.toLowerCase())
  if (new Set(paths).size !== paths.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['assets'],
      message: 'Job media object paths must be unique',
    })
  }
})

export type JobCreateInput = z.infer<typeof jobCreateSchema>
export type ApartmentAccessProfileInput = z.infer<typeof apartmentAccessProfileSchema>
export type PlacesAutocompleteInput = z.infer<typeof placesAutocompleteSchema>
export type PlacesResolveInput = z.infer<typeof placesResolveSchema>
export type ChatMessageInput = z.infer<typeof chatMessageSchema>
export type JobMessageSendInput = z.infer<typeof jobMessageSendSchema>
export type JobMediaAttachInput = z.infer<typeof jobMediaAttachSchema>
