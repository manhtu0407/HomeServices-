import { z } from 'zod'
import { HCMC_DISTRICTS, normalizeDistrict, SERVICE_TYPES } from '../constants'
import {
  clientRequestIdSchema,
  serviceTypeSchema,
  uuidPathPattern,
  workerVerificationRefSchema,
} from './common'
export const WORKER_KAEL_MEMORY_PREFERENCE_KEYS = Object.freeze([
  'area_preference',
  'income_preference',
  'travel_limit',
  'skill_preference',
  'opportunity_filter',
  'auto_accept_work',
] as const)
export type WorkerKaelMemoryPreferenceKey = (typeof WORKER_KAEL_MEMORY_PREFERENCE_KEYS)[number]

export const workerKaelMemoryPreferenceUpdateSchema = z.object({
  key: z.enum(WORKER_KAEL_MEMORY_PREFERENCE_KEYS),
  enabled: z.boolean(),
}).strict()

function isWorkerApplicationContact(value: string): boolean {
  const trimmed = value.trim()
  const emailLike = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
  const phoneLike = /^(?:0|\+?84)\d{8,10}$/.test(trimmed.replace(/[\s.-]/g, ''))
  return emailLike || phoneLike
}

export const workerApplicationSubmitSchema = z.object({
  contact: z
    .string()
    .trim()
    .min(6)
    .max(200)
    .refine(isWorkerApplicationContact, 'contact must be an email or Vietnam phone number'),
  language: z.enum(['vi', 'en']).default('vi'),
  source: z.enum(['auth_worker_create']).default('auth_worker_create'),
  client_request_id: clientRequestIdSchema.optional(),
})

// Validates that a date-only string represents a real calendar date.
// Date silently rolls invalid month/day pairs, so compare ISO output to input.
function isRealCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return false
  return d.toISOString().slice(0, 10) === s
}

function isPastOrPresentCalendarDate(value: string): boolean {
  return isRealCalendarDate(value) && value <= new Date().toISOString().slice(0, 10)
}

const workerDistrictSchema = z
  .string()
  .min(1)
  .max(50)
  .refine((value) => {
    const canonical = normalizeDistrict(value)
    const trimmed = value.trim().toLowerCase()
    return canonical !== 'hcmc_all' ||
      trimmed === 'hcmc_all' ||
      trimmed === HCMC_DISTRICTS.hcmc_all.toLowerCase()
  }, 'districts[] must be a known HCMC district slug (e.g. binh_thanh, q1, thu_duc, hcmc_all)')

export const workerRegisterSchema = z.object({
  legal_name: z.string().trim().min(2).max(200),
  date_of_birth: z
    .string()
    .refine(isPastOrPresentCalendarDate, 'date_of_birth must be a real, non-future calendar date in YYYY-MM-DD'),
  gender: z.enum(['male', 'female', 'other']).optional(),
  service_types: z.array(serviceTypeSchema).min(1).max(SERVICE_TYPES.length),
  years_experience: z.number().int().min(0).max(60),
  // Reject inputs that don't normalize to
  // a known HCMC district slug. Explicit hcmc_all remains valid because broad
  // city-wide worker coverage is supported by the matching path.
  districts: z.array(workerDistrictSchema).min(1).max(20),
  home_lat: z.number().min(-90).max(90).optional(),
  home_lng: z.number().min(-180).max(180).optional(),
  service_radius_km: z.number().int().min(1).max(30).optional(),
  problem_specializations: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  cccd_front_url: workerVerificationRefSchema('cccd-front'),
  cccd_back_url: workerVerificationRefSchema('cccd-back'),
  selfie_url: workerVerificationRefSchema('selfie'),
  bank_account: z.string().trim().min(6).max(50),
  bank_name: z.string().trim().min(2).max(100),
}).superRefine((value, ctx) => {
  if ((value.home_lat === undefined) !== (value.home_lng === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: value.home_lat === undefined ? ['home_lat'] : ['home_lng'],
      message: 'home_lat and home_lng must be provided together',
    })
  }
  const owners = [value.cccd_front_url, value.cccd_back_url, value.selfie_url]
    .map((ref) => ref.match(/^supabase:\/\/worker-verification\/([^/]+)\//i)?.[1]?.toLowerCase())
    .filter((owner): owner is string => Boolean(owner))
  if (new Set(owners).size > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selfie_url'],
      message: 'Worker verification refs must belong to the same owner',
    })
  }
})

export const workerServiceAreaUpdateSchema = z.object({
  districts: z.array(workerDistrictSchema).min(1).max(20),
  home_lat: z.number().min(-90).max(90).nullable().optional(),
  home_lng: z.number().min(-180).max(180).nullable().optional(),
  service_radius_km: z.number().int().min(1).max(30).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  const hasLat = value.home_lat !== undefined
  const hasLng = value.home_lng !== undefined
  const hasMismatchedNullability = hasLat && hasLng && ((value.home_lat === null) !== (value.home_lng === null))
  if (hasLat !== hasLng || hasMismatchedNullability) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: !hasLat || value.home_lat === null ? ['home_lat'] : ['home_lng'],
      message: 'home_lat and home_lng must be provided together with matching nullability',
    })
  }
})

export const workerServicePreferencesUpdateSchema = z.object({
  selected_service_types: z.array(serviceTypeSchema).min(1).max(SERVICE_TYPES.length),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.selected_service_types).size !== value.selected_service_types.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selected_service_types'],
      message: 'selected_service_types must not contain duplicates',
    })
  }
})

export const WORKER_AVATAR_MAX_BYTES = 5 * 1024 * 1024
const workerAvatarRefSchema = z.string().regex(
  /^supabase:\/\/worker-avatars\/[^/\s?#]+\/(?!.*(?:\.\.|\/\/))[A-Za-z0-9._-]+$/i,
  'avatar_ref must be a private worker-avatars storage ref',
)

export const workerAvatarUploadSchema = z.object({
  file_name: z.string().trim().min(1).max(180).optional(),
  mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  file_size_bytes: z.number().int().positive().max(WORKER_AVATAR_MAX_BYTES),
}).strict()

export const workerAvatarUpdateSchema = z.object({
  avatar_ref: workerAvatarRefSchema,
}).strict()

export const availabilityToggleSchema = z.object({
  is_available: z.boolean(),
})

// worker không đề xuất giá ở B6. Kael compute new
// estimate từ original context + worker's reported scope. Schema accept
// description + reason + photo_urls only.
export const workerScopeChangeSchema = z.object({
  client_request_id: clientRequestIdSchema,
  new_description: z.string().trim().min(10).max(2000),
  reason: z.string().trim().min(10).max(1000),
  photo_urls: z.array(z.string().regex(
    /^supabase:\/\/job-media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(?:before|kael_reference|scope_change_evidence)\/[A-Za-z0-9._-]+$/i,
    'Scope evidence must be an attached private job-media ref',
  )).max(5).default([]),
})

export const jobIncidentScopeProposalSchema = z.object({
  client_request_id: clientRequestIdSchema,
}).strict()


const workerKaelMediaRefSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(
    /^supabase:\/\/job-media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/kael_reference\/(?!.*(?:\.\.|\/\/))[^\s?#/]+$/i,
    'Worker Kael media_refs must be Supabase job-media storage refs',
  )

const workerKaelMediaRefsSchema = z.array(workerKaelMediaRefSchema).max(5).default([])

export const workerKaelChatModeSchema = z.enum(['normal', 'intake'])

export const workerKaelChatCreateSchema = z.object({
  job_id: z.string().uuid().optional(),
  mode: workerKaelChatModeSchema.default('intake'),
  language: z.enum(['vi', 'en']).default('vi'),
  client_request_id: clientRequestIdSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.mode === 'intake' && !value.job_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Worker intake chat requires an active job.',
      path: ['job_id'],
    })
  }
  if (value.mode === 'normal' && value.job_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Worker normal chat must not be tied to a job.',
      path: ['job_id'],
    })
  }
})

export const workerKaelChatTurnSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  media_refs: workerKaelMediaRefsSchema,
  language: z.enum(['vi', 'en']).default('vi'),
  client_request_id: clientRequestIdSchema,
}).strict()

export const workerKaelChatRenameSchema = z.object({
  title: z.string().trim().min(1).max(64),
}).strict()

export const workerKaelChatPinSchema = z.object({
  pinned: z.boolean(),
}).strict()

export const workerKaelFeedbackSchema = z.object({
  message: z.string().trim().min(8).max(1200).optional(),
  response_id: z.string().trim().min(1).max(128).optional(),
  rating: z.enum(['useful', 'not_useful']).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  source: z.enum(['worker_chat', 'profile']).default('worker_chat'),
  language: z.enum(['vi', 'en']).default('vi'),
}).strict().superRefine((value, ctx) => {
  if (!value.message && (!value.response_id || !value.rating)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Feedback requires a legacy message or a response_id with rating.',
      path: ['response_id'],
    })
  }
  if (Boolean(value.response_id) !== Boolean(value.rating)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Feedback response_id and rating must be provided together.',
      path: value.response_id ? ['rating'] : ['response_id'],
    })
  }
  if (value.reason && !value.rating) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Feedback reason requires a rating.',
      path: ['reason'],
    })
  }
})

export const workerKaelTrainingConsentSchema = z.object({
  training_consent: z.boolean(),
  source: z.enum(['worker_chat', 'profile']).default('worker_chat'),
  language: z.enum(['vi', 'en']).default('vi'),
})

export const workerCancellationRequestSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
  evidence_photo_urls: z.array(z.string().regex(
    new RegExp(`^supabase://job-media/${uuidPathPattern}/cancellation_evidence/(?!.*(?:\\.\\.|//))[^\\s?#/]+$`, 'i'),
    'Cancellation evidence must be an attached private job-media ref',
  )).max(5).default([]),
}).strict()

export type WorkerKaelMemoryPreferenceUpdateInput = z.infer<typeof workerKaelMemoryPreferenceUpdateSchema>
export type WorkerApplicationSubmitInput = z.infer<typeof workerApplicationSubmitSchema>
export type WorkerRegisterInput = z.infer<typeof workerRegisterSchema>
export type WorkerServiceAreaUpdateInput = z.infer<typeof workerServiceAreaUpdateSchema>
export type WorkerServicePreferencesUpdateInput = z.infer<typeof workerServicePreferencesUpdateSchema>
export type WorkerAvatarUploadInput = z.infer<typeof workerAvatarUploadSchema>
export type WorkerAvatarUpdateInput = z.infer<typeof workerAvatarUpdateSchema>
export type AvailabilityToggleInput = z.infer<typeof availabilityToggleSchema>
export type WorkerScopeChangeInput = z.infer<typeof workerScopeChangeSchema>
export type JobIncidentScopeProposalInput = z.infer<typeof jobIncidentScopeProposalSchema>
export type WorkerKaelChatMode = z.infer<typeof workerKaelChatModeSchema>
export type WorkerKaelChatCreateInput = z.infer<typeof workerKaelChatCreateSchema>
export type WorkerKaelChatTurnInput = z.infer<typeof workerKaelChatTurnSchema>
export type WorkerKaelChatRenameInput = z.infer<typeof workerKaelChatRenameSchema>
export type WorkerKaelChatPinInput = z.infer<typeof workerKaelChatPinSchema>
export type WorkerKaelFeedbackInput = z.infer<typeof workerKaelFeedbackSchema>
export type WorkerKaelTrainingConsentInput = z.infer<typeof workerKaelTrainingConsentSchema>
export type WorkerCancellationRequestInput = z.infer<typeof workerCancellationRequestSchema>
