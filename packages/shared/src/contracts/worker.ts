import { z } from 'zod'
import { HCMC_DISTRICTS, normalizeDistrict, SERVICE_TYPES, WORKER_VERIFICATION_STATUSES } from '../constants'
import type { ServiceType, WorkerVerificationStatus } from '../constants'
import { WORKER_SERVICE_CAPABILITIES } from '../worker-capabilities'
import {
  clientRequestIdSchema,
  serviceTypeSchema,
  uuidPathPattern,
  workerVerificationRefSchema,
} from './common'
export const workerRegistrationCommandSchema = z.object({
  client_request_id: z.string().uuid().transform(value => value.toLowerCase()),
  expected_draft_updated_at: z.string().datetime({ offset: true })
    .refine(value => !/\.\d{7}/.test(value), "Draft revision supports microsecond precision"),
}).strict();

const workerRegistrationReceiptFields = {
  operation_id: z.string().uuid(),
  worker_id: z.string().uuid(),
  client_request_id: z.string().uuid(),
  draft_updated_at: z.string().datetime({ offset: true }),
  recorded_at: z.string().datetime({ offset: true }),
};

export const workerRegistrationCommandReceiptSchema = z.discriminatedUnion("outcome", [
  z.object({
    ...workerRegistrationReceiptFields,
    outcome: z.literal("submitted"), error_code: z.null(),
    verification_status: z.literal("submitted"),
    submitted_at: z.string().datetime({ offset: true }),
  }),
  z.object({
    ...workerRegistrationReceiptFields,
    outcome: z.literal("rejected"),
    error_code: z.enum(["DRAFT_NOT_FOUND", "STALE_DRAFT", "DRAFT_NOT_EDITABLE",
      "INVALID_INPUT", "ALREADY_FINALIZED", "WRITE_CONFLICT", "NOT_FOUND", "WRONG_ROLE", "NOT_OWNER"]),
    verification_status: z.enum(WORKER_VERIFICATION_STATUSES).nullable(),
    submitted_at: z.null(),
  }),
]);
export type WorkerRegistrationCommandInput = z.infer<typeof workerRegistrationCommandSchema>;
export type WorkerRegistrationCommandReceipt = z.infer<typeof workerRegistrationCommandReceiptSchema>;
export type WorkerRegistrationCommandResult =
  | { state: "unknown"; client_request_id: string }
  | { state: "resolved"; receipt: WorkerRegistrationCommandReceipt };
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

export const WORKER_APPLICATION_STATUSES = Object.freeze([
  'not_submitted',
  'pending_review',
  'changes_requested',
  'rejected',
  'approved',
] as const)
export type WorkerApplicationStatus = (typeof WORKER_APPLICATION_STATUSES)[number]

export const WORKER_READINESS_NEXT_ACTIONS = Object.freeze([
  'submit_application',
  'await_application_review',
  'revise_application',
  'contact_support',
  'complete_kyc',
  'await_kyc_review',
  'revise_kyc',
  'resolve_suspension',
  'configure_services',
  'configure_districts',
  'declare_capabilities',
  'enable_availability',
  'finish_active_work',
  'restore_reachability',
  'ready',
] as const)
export type WorkerReadinessNextAction = (typeof WORKER_READINESS_NEXT_ACTIONS)[number]

export type WorkerKycStatus = WorkerVerificationStatus | 'not_available'

export type WorkerReadiness = {
  worker_id: string
  application: {
    application_id: string | null
    status: WorkerApplicationStatus
    submitted_at: string | null
    decided_at: string | null
    reason: string | null
    can_submit: boolean
    can_resume: boolean
  }
  kyc: {
    status: WorkerKycStatus
    missing_fields: string[]
  }
  services: ServiceType[]
  districts: string[]
  capabilities: string[]
  availability: {
    enabled: boolean
    approved: boolean
    suspended: boolean
  }
  capacity: {
    active_job: boolean
    active_candidate: boolean
    active_reservation: boolean
  }
  reachability: {
    status: 'push_proven' | 'foreground_active' | 'unproven'
    push_token_registered: boolean
    push_proven_at: string | null
    foreground_active_until: string | null
  }
  ready_for_matching: boolean
  next_action: WorkerReadinessNextAction
  reason_codes: string[]
  observed_at: string
}

function isWorkerApplicationEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export const workerApplicationSubmitSchema = z.object({
  contact: z
    .string()
    .trim()
    .min(6)
    .max(200)
    .refine(isWorkerApplicationEmail, 'worker applications require an email address'),
  language: z.enum(['vi', 'en']).default('vi'),
  source: z.enum(['auth_worker_create']).default('auth_worker_create'),
  client_request_id: clientRequestIdSchema.optional(),
  revision_of_application_id: z.string().uuid().optional(),
}).strict()

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

const workerRegistrationFieldsSchema = z.object({
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
  problem_specializations: z.array(z.string().trim().min(1).max(100)).max(25).optional(),
  cccd_front_url: workerVerificationRefSchema('cccd-front'),
  cccd_back_url: workerVerificationRefSchema('cccd-back'),
  selfie_url: workerVerificationRefSchema('selfie'),
  bank_account: z.string().trim().min(6).max(50),
  bank_name: z.string().trim().min(2).max(100),
})

function validateWorkerRegistrationRelations(
  value: {
    home_lat?: number
    home_lng?: number
    service_types?: ServiceType[]
    problem_specializations?: string[]
    cccd_front_url?: string
    cccd_back_url?: string
    selfie_url?: string
  },
  ctx: z.RefinementCtx,
) {
  if (value.problem_specializations) {
    if (new Set(value.problem_specializations).size !== value.problem_specializations.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['problem_specializations'],
        message: 'problem_specializations must not contain duplicates',
      })
    }
    const allowedServices = value.service_types ?? SERVICE_TYPES
    const allowedCapabilities = new Set(allowedServices.flatMap(service =>
      Object.keys(WORKER_SERVICE_CAPABILITIES[service]),
    ))
    if (value.problem_specializations.some(capability => !allowedCapabilities.has(capability))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['problem_specializations'],
        message: 'problem_specializations must belong to a selected service',
      })
    }
  }
  if ((value.home_lat === undefined) !== (value.home_lng === undefined)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: value.home_lat === undefined ? ['home_lat'] : ['home_lng'],
      message: 'home_lat and home_lng must be provided together',
    })
  }
  const owners = [value.cccd_front_url, value.cccd_back_url, value.selfie_url]
    .filter((ref): ref is string => Boolean(ref))
    .map((ref) => ref.match(/^supabase:\/\/worker-verification\/([^/]+)\//i)?.[1]?.toLowerCase())
    .filter((owner): owner is string => Boolean(owner))
  if (new Set(owners).size > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selfie_url'],
      message: 'Worker verification refs must belong to the same owner',
    })
  }
}

export const workerRegisterSchema = workerRegistrationFieldsSchema
  .strict()
  .superRefine(validateWorkerRegistrationRelations)

export const workerRegistrationDraftSchema = workerRegistrationFieldsSchema
  .partial()
  .strict()
  .superRefine(validateWorkerRegistrationRelations)

export const workerServiceAreaUpdateSchema = z.object({
  districts: z.array(workerDistrictSchema).min(1).max(20),
  home_lat: z.number().min(-90).max(90).nullable().optional(),
  home_lng: z.number().min(-180).max(180).nullable().optional(),
  service_radius_km: z.number().int().min(1).max(30).optional(),
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
  problem_specializations: z.array(z.string().trim().min(1).max(100)).max(25).optional(),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.selected_service_types).size !== value.selected_service_types.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selected_service_types'],
      message: 'selected_service_types must not contain duplicates',
    })
  }
  if (value.problem_specializations) {
    if (new Set(value.problem_specializations).size !== value.problem_specializations.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['problem_specializations'],
        message: 'problem_specializations must not contain duplicates',
      })
    }
    const allowedCapabilities = new Set(value.selected_service_types.flatMap(service =>
      Object.keys(WORKER_SERVICE_CAPABILITIES[service]),
    ))
    if (value.problem_specializations.some(capability => !allowedCapabilities.has(capability))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['problem_specializations'],
        message: 'problem_specializations must belong to a selected service',
      })
    }
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
  quote_id: clientRequestIdSchema,
}).strict()

export const jobIncidentScopePricePreviewSchema = z.object({
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

const workerKaelGeneralChatMediaRefSchema = z.string().min(1).max(500).regex(
  /^supabase:\/\/kael-chat-media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/kael-chat\/model_vision\/(?!.*(?:\.\.|\/\/))[^\s?#/]+$/i,
  'Worker normal-chat media_refs must be private Kael model_vision refs',
)

const workerKaelMediaRefsSchema = z.array(z.union([
  workerKaelMediaRefSchema,
  workerKaelGeneralChatMediaRefSchema,
])).max(5).default([])

export const workerKaelChatModeSchema = z.enum(['normal', 'intake'])

export const workerKaelChatCreateSchema = z.object({
  job_id: z.string().uuid().optional(),
  mode: workerKaelChatModeSchema.default('intake'),
  language: z.enum(['vi', 'en']).default('vi'),
  client_request_id: clientRequestIdSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.mode === 'normal' && value.job_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Worker normal chat must not be tied to a job.',
      path: ['job_id'],
    })
  }
})

export const workerKaelChatTurnSchema = z.object({
  message: z.string().trim().max(1200),
  media_refs: workerKaelMediaRefsSchema,
  language: z.enum(['vi', 'en']).default('vi'),
  client_request_id: clientRequestIdSchema,
}).strict().superRefine((value, ctx) => {
  const hasGeneralChatImage = value.media_refs.some((ref) => ref.startsWith('supabase://kael-chat-media/'))
  if (!value.message && !hasGeneralChatImage) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A Worker Kael turn needs text or a normal-chat image.',
      path: ['message'],
    })
  }
})

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
export type WorkerRegistrationDraftInput = z.infer<typeof workerRegistrationDraftSchema>
export type WorkerServiceAreaUpdateInput = z.infer<typeof workerServiceAreaUpdateSchema>
export type WorkerServicePreferencesUpdateInput = z.infer<typeof workerServicePreferencesUpdateSchema>
export type WorkerAvatarUploadInput = z.infer<typeof workerAvatarUploadSchema>
export type WorkerAvatarUpdateInput = z.infer<typeof workerAvatarUpdateSchema>
export type AvailabilityToggleInput = z.infer<typeof availabilityToggleSchema>
export type WorkerScopeChangeInput = z.infer<typeof workerScopeChangeSchema>
export type JobIncidentScopeProposalInput = z.infer<typeof jobIncidentScopeProposalSchema>
export type JobIncidentScopePricePreviewInput = z.infer<typeof jobIncidentScopePricePreviewSchema>
export type WorkerKaelChatMode = z.infer<typeof workerKaelChatModeSchema>
export type WorkerKaelChatCreateInput = z.infer<typeof workerKaelChatCreateSchema>
export type WorkerKaelChatTurnInput = z.infer<typeof workerKaelChatTurnSchema>
export type WorkerKaelChatRenameInput = z.infer<typeof workerKaelChatRenameSchema>
export type WorkerKaelChatPinInput = z.infer<typeof workerKaelChatPinSchema>
export type WorkerKaelFeedbackInput = z.infer<typeof workerKaelFeedbackSchema>
export type WorkerKaelTrainingConsentInput = z.infer<typeof workerKaelTrainingConsentSchema>
export type WorkerCancellationRequestInput = z.infer<typeof workerCancellationRequestSchema>
