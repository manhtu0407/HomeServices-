import { z } from 'zod'
import { HCMC_DISTRICTS, normalizeDistrict } from './constants'

export const serviceTypeSchema = z.enum(['electrical', 'plumbing', 'cleaning'])

export const apartmentAccessProfileSchema = z.object({
  entry_method: z.string().max(300).optional(),
  parking_note: z.string().max(300).optional(),
  guard_note: z.string().max(300).optional(),
  building_note: z.string().max(300).optional(),
  customer_handoff_note: z.string().max(300).optional(),
}).default({})

export const jobCreateSchema = z.object({
  service_type: serviceTypeSchema,
  description: z.string().min(10).max(2000),
  problem_chips: z.array(z.string().max(100)).min(1).max(10),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  address_building: z.string().max(200).optional(),
  address_unit: z.string().max(50).optional(),
  address_floor: z.string().max(10).optional(),
  address_district: z.string().max(100).optional(),
  apartment_access_profile: apartmentAccessProfileSchema.optional(),
  scheduled_at: z.string().datetime().optional(),
  // X2 (Plan.md §27.5 — 2026-05-29): mobile-generated UUID v4 per submit.
  // Server returns the existing job on retry instead of creating duplicates.
  client_request_id: z.string().uuid().optional(),
})

export const kaelChatCreateSchema = z.object({
  service_type: serviceTypeSchema,
  session_id: z.string().uuid().optional(),
  message: z.string().min(1).max(5000).optional(),
  problem_chips: z.array(z.string().max(100)).max(10).default([]),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  defer_analysis: z.boolean().optional(),
  address_label: z.string().max(200).optional(),
  address_district: z.string().max(100).optional(),
  apartment_access_profile: apartmentAccessProfileSchema.optional(),
  // X2 (Plan.md §27.5 — 2026-05-29): mobile-generated UUID v4 per submit.
  client_request_id: z.string().uuid().optional(),
})

const kaelChatMediaRefSchema = z.string().regex(
  /^supabase:\/\/kael-chat-media\/[^/\s?#]+\/kael-chat\/(?!.*(?:\.\.|\/\/))[^\s?#]+$/i,
  'Kael chat media_refs must be Supabase kael-chat-media storage refs',
)

export const kaelChatMediaUploadSchema = z.object({
  file_name: z.string().trim().min(1).max(180).optional(),
  mime_type: z.string().trim().min(3).max(120),
  file_size_bytes: z.number().int().positive().max(50 * 1024 * 1024).optional(),
}).strict()

export const kaelChatEvidenceSchema = z.object({
  decision: z.enum(['confirmed', 'skipped']),
  message: z.string().trim().min(1).max(5000).optional(),
  problem_chips: z.array(z.string().max(100)).max(10).optional(),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  media_refs: z.array(kaelChatMediaRefSchema).max(5).default([]),
  skip_reason: z.string().trim().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.decision === 'confirmed' && value.photo_urls.length === 0 && value.media_refs.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Evidence confirmation requires at least one media ref.',
      path: ['media_refs'],
    })
  }
})

export const kaelChatTurnSchema = z.object({
  message: z.string().min(1).max(5000),
  problem_chips: z.array(z.string().max(100)).max(10).optional(),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  address_label: z.string().max(200).optional(),
  address_district: z.string().max(100).optional(),
  apartment_access_profile: apartmentAccessProfileSchema.optional(),
})

export const kaelAssistantSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  language: z.enum(['vi', 'en']).default('vi'),
  job_id: z.string().uuid().optional(),
  surface: z.enum(['customer_normal', 'customer_case']).default('customer_normal'),
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
  client_request_id: z.string().uuid().optional(),
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

export const jobMessageSendSchema = z.object({
  content: z.string().min(1).max(5000),
})

// =============================================================================
// Worker registration & lifecycle schemas (B0-B8)
// =============================================================================

// Validates that a "YYYY-MM-DD" string represents a real calendar date.
// Catches '2026-99-99' (regex passes but Date is invalid) and '2026-02-31'
// (Date constructor silently rolls to March, ISO no longer matches input).
function isRealCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return false
  // Compare ISO back to input — catches silent month-rollover (Feb 31 → Mar 3)
  return d.toISOString().slice(0, 10) === s
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
  legal_name: z.string().min(2).max(200),
  date_of_birth: z
    .string()
    .refine(isRealCalendarDate, 'date_of_birth must be a real calendar date in YYYY-MM-DD'),
  gender: z.enum(['male', 'female', 'other']).optional(),
  service_types: z.array(serviceTypeSchema).min(1).max(3),
  years_experience: z.number().int().min(0).max(60),
  // X3 (Plan.md §27.6 — 2026-05-29): reject inputs that don't normalize to
  // a known HCMC district slug. Explicit hcmc_all remains valid because broad
  // city-wide worker coverage is supported by the matching path.
  districts: z.array(workerDistrictSchema).min(1).max(20),
  home_lat: z.number().min(-90).max(90).optional(),
  home_lng: z.number().min(-180).max(180).optional(),
  service_radius_km: z.number().int().min(1).max(30).optional(),
  problem_specializations: z.array(z.string().min(1).max(100)).max(20).optional(),
  cccd_front_url: z.string().url(),
  cccd_back_url: z.string().url(),
  selfie_url: z.string().url(),
  bank_account: z.string().min(6).max(50),
  bank_name: z.string().min(2).max(100),
})

export const workerServiceAreaUpdateSchema = z.object({
  districts: z.array(workerDistrictSchema).min(1).max(20),
  home_lat: z.number().min(-90).max(90).nullable().optional(),
  home_lng: z.number().min(-180).max(180).nullable().optional(),
  service_radius_km: z.number().int().min(1).max(30).nullable().optional(),
}).strict()

export const availabilityToggleSchema = z.object({
  is_available: z.boolean(),
})

// Phase 2.0 (2026-05-23): worker không đề xuất giá ở B6. Kael compute new
// estimate từ original context + worker's reported scope. Schema accept
// description + reason + photo_urls only.
export const workerScopeChangeSchema = z.object({
  new_description: z.string().min(10).max(2000),
  reason: z.string().min(10).max(1000),
  photo_urls: z.array(z.string().url()).max(5).default([]),
})

export const kaelWorkerClarifySchema = z.object({
  question: z.string().min(3).max(1000),
})

const workerKaelMediaRefSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(
    /^supabase:\/\/job-media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(?:before|after|kael_reference|cancellation_evidence|scope_change_evidence)\/[^\s?#]+$/i,
    'Worker Kael media_refs must be Supabase job-media storage refs',
  )

const workerKaelMediaRefsSchema = z.array(workerKaelMediaRefSchema).max(5).default([])

export const workerKaelChatCreateSchema = z.object({
  job_id: z.string().uuid(),
  language: z.enum(['vi', 'en']).default('vi'),
  client_request_id: z.string().uuid().optional(),
}).strict()

export const workerKaelChatTurnSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  media_refs: workerKaelMediaRefsSchema,
  language: z.enum(['vi', 'en']).default('vi'),
  client_request_id: z.string().uuid().optional(),
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
  reason: z.string().min(10).max(1000),
  evidence_photo_urls: z.array(z.string().url()).max(5).default([]),
})

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
  evidence_photo_urls: z.array(z.string().min(10).max(500)).max(5).default([]),
})

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
  review_note: z.string().max(1000).optional(),
})

export const jobMediaAttachSchema = z.object({
  assets: z.array(z.object({
    object_path: z.string().min(10).max(500),
    stage: z.enum(['before', 'after', 'kael_reference', 'cancellation_evidence', 'scope_change_evidence', 'access_check_in']),
    mime_type: z.string().min(3).max(120).optional(),
    file_size_bytes: z.number().int().min(0).max(26_214_400).optional(),
  })).min(1).max(5),
})

export const devicePushTokenSchema = z.object({
  platform: z.enum(['ios', 'android', 'web', 'unknown']),
  push_token: z.string().min(8).max(4096),
  permission_status: z.enum(['granted', 'denied', 'undetermined']),
  safe_metadata: z.record(z.string(), z.unknown()).default({}),
})

export const customerScopeDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
})

export function sanitizeForLLM(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 5000)
}

export function scrubSensitiveForLLM(input: string): string {
  return sanitizeForLLM(input)
    .replace(/\b0\d{8,10}\b/g, '[phone]')
    .replace(/\b\+?84\d{8,10}\b/g, '[phone]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{9,12}\b/g, '[id-number]')
    .replace(/\b\d{8}\b/g, '[bank-account]')
    .replace(/\b\d{13,15}\b/g, '[bank-account]')
    .replace(/\b(?:Vinhomes|Vincom|Masteri|Saigon Pearl|Saigon Royal|Saigon South|Sun Avenue|Sun Village|Sunwah|Estella|Lexington|Diamond Island|Empire City|Eco Green|Phu My Hung|Phú Mỹ Hưng|Hoang Anh Gia Lai|Hoàng Anh Gia Lai|Riviera Point|Vista Verde|Era Town|The Manor|Lancaster|City Garden|Lavila|Centana|Topaz|Jamila|Akari|Sunrise City|Botanica|Pearl Plaza|Landmark|The Sun|Citadines|Lumière|Lumiere)(?:\s+(?!tầng|tang|lầu|lau|căn|can|phòng|phong|block|toà|tòa|toa|số|so|STK|TK)[A-Za-zÀ-ỹ][\wÀ-ỹ.]*){0,2}/gi, '[building]')
    .replace(/\b(?:tầng|tang|lầu|lau)\s*\d{1,3}\b/gi, '[floor]')
    .replace(/\b(?:căn(?:\s+hộ)?|can(?:\s+ho)?|phòng|phong|block|toà|tòa|toa)\s+[A-Za-z0-9.\-_/]+/gi, '[unit]')
    .replace(/\b(?:số|so)\s+\d+[A-Za-z]?\b/gi, '[house-no]')
}

export type JobCreateInput = z.infer<typeof jobCreateSchema>
export type ApartmentAccessProfileInput = z.infer<typeof apartmentAccessProfileSchema>
export type KaelChatCreateInput = z.infer<typeof kaelChatCreateSchema>
export type KaelChatMediaUploadInput = z.infer<typeof kaelChatMediaUploadSchema>
export type KaelChatEvidenceInput = z.infer<typeof kaelChatEvidenceSchema>
export type KaelChatTurnInput = z.infer<typeof kaelChatTurnSchema>
export type KaelAssistantInput = z.infer<typeof kaelAssistantSchema>
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
export type AvailabilityToggleInput = z.infer<typeof availabilityToggleSchema>
export type WorkerScopeChangeInput = z.infer<typeof workerScopeChangeSchema>
export type KaelWorkerClarifyInput = z.infer<typeof kaelWorkerClarifySchema>
export type WorkerKaelChatCreateInput = z.infer<typeof workerKaelChatCreateSchema>
export type WorkerKaelChatTurnInput = z.infer<typeof workerKaelChatTurnSchema>
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
export type CustomerScopeDecisionInput = z.infer<typeof customerScopeDecisionSchema>
