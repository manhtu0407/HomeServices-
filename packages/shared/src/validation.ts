import { z } from 'zod'
import { HCMC_DISTRICTS, normalizeDistrict, SERVICE_TYPES, USER_ROLES } from './constants'
import { KAEL_PERFORMANCE_PROFILE_IDS } from './service-intake/types'
import { caseWorkEvidenceSchema } from './kael-case-work'

export const serviceTypeSchema = z.enum(SERVICE_TYPES)
const clientRequestIdSchema = z.uuidv4()
const uuidPathPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const jobMediaStages = [
  'before',
  'after',
  'kael_reference',
  'cancellation_evidence',
  'scope_change_evidence',
  'access_check_in',
] as const
const privateJobMediaRefSchema = z.string().min(10).max(500).regex(
  new RegExp(`^supabase://job-media/${uuidPathPattern}/(?:${jobMediaStages.join('|')})/(?!.*(?:\\.\\.|//))[^\\s?#/]+$`, 'i'),
  'Evidence must be an attached private job-media ref',
)
const workerVerificationRefSchema = (folder: 'cccd-front' | 'cccd-back' | 'selfie') => z
  .string()
  .max(500)
  .regex(
    new RegExp(`^supabase://worker-verification/${uuidPathPattern}/${folder}/(?!.*(?:\\.\\.|//))[^\\s?#/]+$`, 'i'),
    `Worker verification ${folder} must be an owned private storage ref`,
  )
const kaelChatEvidenceItemsSchema = z.array(caseWorkEvidenceSchema).max(20).optional()
const kaelChatScheduleWindowSchema = z.object({
  date: z.string().refine(isRealCalendarDate, 'date must be YYYY-MM-DD'),
  start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'start must be HH:mm'),
  end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'end must be HH:mm'),
  time_zone: z.literal('Asia/Ho_Chi_Minh'),
}).strict().superRefine((value, ctx) => {
  if (value.end <= value.start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'schedule window end must be after start',
      path: ['end'],
    })
  }
})

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

const kaelProfileByService = {
  electrical: 'electric_diagnose',
  plumbing: 'water_diagnose',
  cleaning: 'clean_scope',
  hvac: 'air_scope',
  upholstery: 'fabric_scope',
  handyman: 'task_scope',
} as const

export const kaelChatCreateSchema = z.object({
  service_type: serviceTypeSchema,
  profile_id: z.enum(KAEL_PERFORMANCE_PROFILE_IDS).optional(),
  session_id: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(5000).optional(),
  problem_chips: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  evidence_items: kaelChatEvidenceItemsSchema,
  defer_analysis: z.boolean().optional(),
  language: z.enum(['vi', 'en']).optional(),
  address_label: z.string().max(200).optional(),
  address_district: z.string().max(100).optional(),
  scheduled_at: z.string().datetime().optional(),
  schedule_window: kaelChatScheduleWindowSchema.optional(),
  apartment_access_profile: apartmentAccessProfileSchema.optional(),
  // Mobile-generated UUID v4 per submit.
  client_request_id: clientRequestIdSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.profile_id && kaelProfileByService[value.service_type] !== value.profile_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'profile_id must match service_type',
      path: ['profile_id'],
    })
  }
})

const kaelChatMediaRefSchema = z.string().regex(
  /^supabase:\/\/kael-chat-media\/(?!\.{1,2}\/)[^/\s?#]+\/kael-chat\/(?:model_vision|private_video_original)\/(?!.*(?:\.\.|\/\/))[^\s?#]+$/i,
  'Kael chat media_refs must be Supabase kael-chat-media storage refs',
).refine(
  (value) => !/\.(?:aac|flac|m4a|mp3|oga|opus|wav)$/i.test(value),
  'Raw audio must stay on device; submit an editable voice transcript instead',
)

export const kaelChatMediaUploadSchema = z.object({
  file_name: z.string().trim().min(1).max(180).optional(),
  mime_type: z.string().trim().min(3).max(120),
  purpose: z.enum(['model_vision', 'private_video_original']),
  file_size_bytes: z.number().int().positive().max(50 * 1024 * 1024),
}).strict().superRefine((value, ctx) => {
  const mimeType = value.mime_type.toLowerCase()
  const rawAudio = mimeType.startsWith('audio/') ||
    /\.(?:aac|flac|m4a|mp3|oga|opus|wav)$/i.test(value.file_name ?? '')
  if (rawAudio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Raw voice audio must remain on device; submit a reviewed transcript',
      path: ['mime_type'],
    })
  }
  if (
    value.purpose === 'model_vision' &&
    !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Model vision uploads must be compatible JPEG, PNG, or WebP images',
      path: ['purpose'],
    })
  }
  if (value.purpose === 'model_vision' && value.file_size_bytes > 10 * 1024 * 1024) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Model vision images must not exceed 10 MB',
      path: ['file_size_bytes'],
    })
  }
  if (value.purpose === 'private_video_original' && !mimeType.startsWith('video/')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Private original evidence must be a video',
      path: ['purpose'],
    })
  }
})

export const kaelChatMediaRevokeSchema = z.object({
  media_refs: z.array(kaelChatMediaRefSchema).min(1).max(20),
}).strict()

export const kaelChatEvidenceSchema = z.object({
  decision: z.enum(['confirmed', 'skipped']),
  message: z.string().trim().min(1).max(5000).optional(),
  problem_chips: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  media_refs: z.array(kaelChatMediaRefSchema).max(5).default([]),
  evidence_items: kaelChatEvidenceItemsSchema,
  language: z.enum(['vi', 'en']).optional(),
  skip_reason: z.string().trim().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.decision === 'skipped' && !value.skip_reason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Skipping optional evidence requires a short reason.',
      path: ['skip_reason'],
    })
  }
  if (
    value.decision === 'skipped' &&
    (value.media_refs.length > 0 || value.photo_urls.length > 0 || (value.evidence_items?.length ?? 0) > 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Skipped evidence decisions must not retain evidence payloads.',
      path: ['decision'],
    })
  }
  if (
    value.decision === 'confirmed' &&
    value.media_refs.length === 0 &&
    (value.evidence_items?.length ?? 0) === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Evidence confirmation requires at least one durable media ref.',
      path: ['media_refs'],
    })
  }
})

export const kaelChatTurnSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  problem_chips: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  evidence_items: kaelChatEvidenceItemsSchema,
  language: z.enum(['vi', 'en']).optional(),
  address_label: z.string().max(200).optional(),
  address_district: z.string().max(100).optional(),
  scheduled_at: z.string().datetime().optional(),
  schedule_window: kaelChatScheduleWindowSchema.optional(),
  apartment_access_profile: apartmentAccessProfileSchema.optional(),
})

export const kaelAssistantSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  language: z.enum(['vi', 'en']).default('vi'),
  job_id: z.string().uuid().optional(),
  surface: z.enum(['customer_normal', 'customer_case']).default('customer_normal'),
}).strict().superRefine((input, ctx) => {
  if (input.surface === 'customer_case' && !input.job_id) {
    ctx.addIssue({
      code: 'custom',
      message: 'job_id is required for customer_case',
      path: ['job_id'],
    })
  }
})

export const customerKaelConversationModeSchema = z.enum(['normal', 'case'])

export const customerKaelConversationCreateSchema = z.object({
  mode: customerKaelConversationModeSchema,
  client_request_id: z.string().uuid(),
}).strict()

export const customerKaelConversationTurnSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  language: z.enum(['vi', 'en']).default('vi'),
  client_request_id: z.string().uuid(),
}).strict()

export const customerKaelConversationRenameSchema = z.object({
  title: z.string().trim().min(1).max(64),
}).strict()

export const customerKaelConversationPinSchema = z.object({
  pinned: z.boolean(),
}).strict()

export const kaelChatProgressSchema = z.object({
  current_stage: z.enum([
    'intent_classification',
    'vision_analysis',
    'clarification',
    'problem_synthesis',
    'market_lookup',
    'price_synthesis',
    'advisory_generation',
    'worker_brief',
    'worker_assist',
    'scope_change',
    'scope_reviewing',
    'scope_estimating',
    'post_job_learning',
    'educational_response',
  ]),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  progress: z.number().min(0).max(1),
  failure_reason: z.string().max(160).nullable().optional(),
  updated_at: z.string().datetime(),
}).strict()

export const placesAutocompleteSchema = z.object({
  input: z.string().trim().min(2).max(160),
  session_token: z.string().max(120).optional(),
})

export const placesResolveSchema = z.object({
  label: z.string().trim().min(2).max(240).optional(),
  place_id: z.string().trim().min(3).max(240),
})

export const customerKaelFeedbackSchema = z.object({
  message: z.string().trim().min(8).max(1200),
  source: z.enum(['profile']).default('profile'),
  language: z.enum(['vi', 'en']).default('vi'),
})

export const CUSTOMER_KAEL_MEMORY_PREFERENCE_KEYS = Object.freeze([
  'preferred_address',
  'preferred_time_window',
  'budget_limit_vnd',
  'message_interaction_memory',
  'share_preferences_with_worker',
] as const)
export type CustomerKaelMemoryPreferenceKey = (typeof CUSTOMER_KAEL_MEMORY_PREFERENCE_KEYS)[number]

export const customerKaelMemoryPreferenceUpdateSchema = z.object({
  key: z.enum(CUSTOMER_KAEL_MEMORY_PREFERENCE_KEYS),
  enabled: z.boolean(),
}).strict()

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

export const CUSTOMER_PAYMENT_BANK_KEYS = Object.freeze([
  'vietcombank',
  'techcombank',
  'bidv',
  'mbbank',
  'acb',
  'vietinbank',
] as const)
export type CustomerPaymentBankKey = (typeof CUSTOMER_PAYMENT_BANK_KEYS)[number]

export const customerPaymentMethodSaveSchema = z.object({
  bank_key: z.enum(CUSTOMER_PAYMENT_BANK_KEYS),
  bank_name: z.string().trim().min(2).max(100),
  account_holder_name: z.string().trim().min(2).max(200),
  bank_account: z.string().trim().min(6).max(50).regex(/^[0-9A-Za-z]+$/, 'bank_account must contain only letters or digits'),
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

export const reviewSchema = z.object({
  job_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
  comment: z.string().trim().max(1000).optional(),
})

export const chatMessageSchema = z.object({
  job_id: z.string().uuid(),
  content: z.string().trim().min(1).max(5000),
})

export const jobMessageSendSchema = z.object({
  content: z.string().trim().min(1).max(5000),
})

// =============================================================================
// Worker registration & lifecycle schemas (B0-B8)
// =============================================================================

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

export const kaelWorkerClarifySchema = z.object({
  question: z.string().trim().min(3).max(1000),
})

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
  job_id: z.string().uuid(),
  mode: workerKaelChatModeSchema.default('intake'),
  language: z.enum(['vi', 'en']).default('vi'),
  client_request_id: clientRequestIdSchema.optional(),
}).strict()

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
  message: z.string().trim().min(8).max(1200),
  source: z.enum(['worker_chat', 'profile']).default('worker_chat'),
  language: z.enum(['vi', 'en']).default('vi'),
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

export const customerCancellationRequestSchema = z.object({
  reason_code: z.string().trim().min(3).max(120),
  reason_note: z.string().trim().min(3).max(1000).optional(),
  requested_at: z.string().datetime().optional(),
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

export const workerCancellationDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  review_note: z.string().trim().max(1000).optional(),
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

export const devicePushTokenSchema = z.object({
  platform: z.enum(['ios', 'android', 'web', 'unknown']),
  push_token: z.string().min(8).max(4096),
  permission_status: z.enum(['granted', 'denied', 'undetermined']),
  safe_metadata: z.object({
    project_id_available: z.boolean().optional(),
    role: z.enum(USER_ROLES).nullable().optional(),
    source: z.literal('expo-notifications').optional(),
  }).strict().default({}),
})

export const devicePushTokenUnregisterSchema = z.object({
  push_token: z.string().min(8).max(4096),
}).strict()

export const customerScopeDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
})

export function sanitizeForLLM(input: string): string {
  const sanitized = input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB]/g, '')
    .trim()
  return truncateWithoutSplittingSurrogate(sanitized, 5000)
}

function truncateWithoutSplittingSurrogate(value: string, maxLength: number): string {
  const truncated = value.slice(0, maxLength)
  const lastCodeUnit = truncated.charCodeAt(truncated.length - 1)
  return lastCodeUnit >= 0xD800 && lastCodeUnit <= 0xDBFF ? truncated.slice(0, -1) : truncated
}

function looksLikePrivateUnitIdentifier(value: string) {
  return /\d/u.test(value) || /^[A-Z](?:[A-Z0-9._/-]*)$/.test(value)
}

export function scrubSensitiveForLLM(input: string): string {
  return sanitizeForLLM(input)
    .replace(/(?<!\d)(?:\+?84|0)[\s().-]*(?:\d[\s().-]*){8,10}(?!\d)/g, '[phone]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{9,12}\b/g, '[id-number]')
    .replace(/\b\d{8}\b/g, '[bank-account]')
    .replace(/\b\d{13,20}\b/g, '[bank-account]')
    .replace(/\b(?:Vinhomes|Vincom|Masteri|Saigon Pearl|Saigon Royal|Saigon South|Sun Avenue|Sun Village|Sunwah|Estella|Lexington|Diamond Island|Empire City|Eco Green|Phu My Hung|Phú Mỹ Hưng|Hoang Anh Gia Lai|Hoàng Anh Gia Lai|Riviera Point|Vista Verde|Era Town|The Manor|Lancaster|City Garden|Lavila|Centana|Topaz|Jamila|Akari|Sunrise City|Botanica|Pearl Plaza|Landmark|The Sun|Citadines|Lumière|Lumiere)(?:\s+(?!tầng|tang|lầu|lau|căn|can|phòng|phong|block|toà|tòa|toa|số|so|STK|TK)[A-Za-zÀ-ỹ][\wÀ-ỹ.]*){0,2}/gi, '[building]')
    .replace(/\b(?:số|so)[^\S\r\n]+\d+[A-Za-z]?\b/gi, '[house-no]')
    .replace(/(?<![:\p{L}\p{N}])\d{1,5}[A-Za-z]?(?:[/-]\d{1,5}[A-Za-z]?)?(?=[^\S\r\n]+(?:(?:đường|duong|phố|pho|hẻm|hem)[^\S\r\n]+)?\p{Lu}[\p{L}'-]*(?:[^\S\r\n]+\p{Lu}[\p{L}'-]*){0,3}\b)/gu, '[house-no]')
    .replace(/(?<![:\p{L}\p{N}])\d{1,5}[A-Za-z]?(?:[/-]\d{1,5}[A-Za-z]?)?(?=[^\S\r\n]+(?:đường|duong|phố|pho|hẻm|hem)[^\S\r\n]+\p{L})/giu, '[house-no]')
    .replace(/\b(?:tầng|tang|lầu|lau)\s*\d{1,3}\b/gi, '[floor]')
    .replace(
      /(?<![\p{L}\p{N}])(?:căn(?:[^\S\r\n]+hộ)?|can(?:[^\S\r\n]+ho)?|phòng|phong|block|toà|tòa|toa)[^\S\r\n]+([\p{L}\p{N}](?:[\p{L}\p{N}._/-]*[\p{L}\p{N}])?)/giu,
      (match, identifier: string) => looksLikePrivateUnitIdentifier(identifier) ? '[unit]' : match,
    )
}

export type JobCreateInput = z.infer<typeof jobCreateSchema>
export type ApartmentAccessProfileInput = z.infer<typeof apartmentAccessProfileSchema>
export type KaelChatCreateInput = z.infer<typeof kaelChatCreateSchema>
export type KaelChatMediaUploadInput = z.infer<typeof kaelChatMediaUploadSchema>
export type KaelChatMediaRevokeInput = z.infer<typeof kaelChatMediaRevokeSchema>
export type KaelChatEvidenceInput = z.infer<typeof kaelChatEvidenceSchema>
export type KaelChatTurnInput = z.infer<typeof kaelChatTurnSchema>
export type KaelAssistantInput = z.infer<typeof kaelAssistantSchema>
export type CustomerKaelConversationMode = z.infer<typeof customerKaelConversationModeSchema>
export type CustomerKaelConversationCreateInput = z.infer<typeof customerKaelConversationCreateSchema>
export type CustomerKaelConversationTurnInput = z.infer<typeof customerKaelConversationTurnSchema>
export type CustomerKaelConversationRenameInput = z.infer<typeof customerKaelConversationRenameSchema>
export type CustomerKaelConversationPinInput = z.infer<typeof customerKaelConversationPinSchema>
export type KaelChatProgress = z.infer<typeof kaelChatProgressSchema>
export type PlacesAutocompleteInput = z.infer<typeof placesAutocompleteSchema>
export type PlacesResolveInput = z.infer<typeof placesResolveSchema>
export type CustomerKaelFeedbackInput = z.infer<typeof customerKaelFeedbackSchema>
export type CustomerKaelMemoryPreferenceUpdateInput = z.infer<typeof customerKaelMemoryPreferenceUpdateSchema>
export type WorkerKaelMemoryPreferenceUpdateInput = z.infer<typeof workerKaelMemoryPreferenceUpdateSchema>
export type CustomerPaymentMethodSaveInput = z.infer<typeof customerPaymentMethodSaveSchema>
export type WorkerApplicationSubmitInput = z.infer<typeof workerApplicationSubmitSchema>
export type ReviewInput = z.infer<typeof reviewSchema>
export type ChatMessageInput = z.infer<typeof chatMessageSchema>
export type JobMessageSendInput = z.infer<typeof jobMessageSendSchema>
export type WorkerRegisterInput = z.infer<typeof workerRegisterSchema>
export type WorkerServiceAreaUpdateInput = z.infer<typeof workerServiceAreaUpdateSchema>
export type WorkerAvatarUploadInput = z.infer<typeof workerAvatarUploadSchema>
export type WorkerAvatarUpdateInput = z.infer<typeof workerAvatarUpdateSchema>
export type AvailabilityToggleInput = z.infer<typeof availabilityToggleSchema>
export type WorkerScopeChangeInput = z.infer<typeof workerScopeChangeSchema>
export type JobIncidentScopeProposalInput = z.infer<typeof jobIncidentScopeProposalSchema>
export type KaelWorkerClarifyInput = z.infer<typeof kaelWorkerClarifySchema>
export type WorkerKaelChatMode = z.infer<typeof workerKaelChatModeSchema>
export type WorkerKaelChatCreateInput = z.infer<typeof workerKaelChatCreateSchema>
export type WorkerKaelChatTurnInput = z.infer<typeof workerKaelChatTurnSchema>
export type WorkerKaelChatRenameInput = z.infer<typeof workerKaelChatRenameSchema>
export type WorkerKaelChatPinInput = z.infer<typeof workerKaelChatPinSchema>
export type WorkerKaelFeedbackInput = z.infer<typeof workerKaelFeedbackSchema>
export type WorkerKaelTrainingConsentInput = z.infer<typeof workerKaelTrainingConsentSchema>
export type WorkerCancellationRequestInput = z.infer<typeof workerCancellationRequestSchema>
export type CustomerCancellationRequestInput = z.infer<typeof customerCancellationRequestSchema>
export type DisputeOpenRequestInput = z.infer<typeof disputeOpenRequestSchema>
export type DisputeCounterStatementInput = z.infer<typeof disputeCounterStatementSchema>
export type DisputeAdminDecisionInput = z.infer<typeof disputeAdminDecisionSchema>
export type WorkerCancellationDecisionInput = z.infer<typeof workerCancellationDecisionSchema>
export type JobMediaAttachInput = z.infer<typeof jobMediaAttachSchema>
export type DevicePushTokenInput = z.infer<typeof devicePushTokenSchema>
export type DevicePushTokenUnregisterInput = z.infer<typeof devicePushTokenUnregisterSchema>
export type CustomerScopeDecisionInput = z.infer<typeof customerScopeDecisionSchema>
