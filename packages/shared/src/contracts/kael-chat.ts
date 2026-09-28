import { z } from 'zod'
import { KAEL_PERFORMANCE_PROFILE_IDS } from '../service-intake/types'
import { caseWorkEvidenceSchema } from '../kael-case-work'
import { clientRequestIdSchema, serviceTypeSchema } from './common'
import { apartmentAccessProfileSchema } from './job'
import { intakeConfirmationKindSchema } from './stage1-reliability'

function isRealCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return false
  return d.toISOString().slice(0, 10) === s
}

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
  intake_source: z.enum(['booking', 'direct_chat']).optional(),
  intake_description: z.string().trim().min(10).max(2000).optional(),
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
  preferred_worker_id: z.string().uuid().optional(),
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
  if (value.intake_source === 'booking') {
    const requiredBookingFields = [
      ['profile_id', value.profile_id],
      ['intake_description', value.intake_description],
      ['message', value.message],
      ['address_label', value.address_label],
      ['address_district', value.address_district],
      ['scheduled_at', value.scheduled_at],
      ['schedule_window', value.schedule_window],
    ] as const
    for (const [field, fieldValue] of requiredBookingFields) {
      if (fieldValue) continue
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} is required for booking intake`,
        path: [field],
      })
    }
    if (value.problem_chips.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'problem_chips are required for booking intake',
        path: ['problem_chips'],
      })
    }
  }
})

export const kaelChatIntakeConfirmationDecisionSchema = z.object({
  decision: z.enum(['confirmed', 'correction_requested']),
}).strict()

export const kaelChatConfirmSchema = z.object({
  price_reasoning_receipt_id: z.string().trim().min(8).max(160).optional(),
  confirmation_kind: intakeConfirmationKindSchema.exclude(['none']).optional(),
  matching_mode: z.enum(['prompt_if_saved']).optional(),
}).strict().superRefine((value, ctx) => {
  const pricedConfirmation = !value.confirmation_kind || value.confirmation_kind === 'priced_offer'
  if (pricedConfirmation && !value.price_reasoning_receipt_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'priced offer confirmation requires a price reasoning receipt',
      path: ['price_reasoning_receipt_id'],
    })
  }
})

export const kaelChatMediaRefSchema = z.string().regex(
  /^supabase:\/\/kael-chat-media\/(?!\.{1,2}\/)[^/\s?#]+\/kael-chat\/(?:model_vision|private_video_original)\/(?!.*(?:\.\.|\/\/))[^\s?#]+$/i,
  'Kael chat media_refs must be Supabase kael-chat-media storage refs',
).refine(
  (value) => !/\.(?:aac|flac|m4a|mp3|oga|opus|wav)$/i.test(value),
  'Raw audio must stay on device; submit an editable voice transcript instead',
)

export const kaelChatVisionMediaRefSchema = kaelChatMediaRefSchema.refine(
  (value) => /\/kael-chat\/model_vision\//i.test(value),
  'Customer normal chat accepts only private vision-image refs',
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
  turn_intent: z.enum(['price_question', 'scope_adjustment']).optional(),
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
  service_type: serviceTypeSchema.optional(),
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

export const kaelWorkerClarifySchema = z.object({
  question: z.string().trim().min(3).max(1000),
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

function looksLikePrivateUnitIdentifier(value: string, trailingContext = '') {
  const measurementCandidate = `${value}${trailingContext.slice(0, 8)}`.replace(/\s+/g, '')
  if (/^\d{1,4}(?:[.,]\d{1,2})?(?:m(?:2|²)|㎡|sqm)/iu.test(measurementCandidate)) return false
  return /\d/u.test(value) || /^[A-Z](?:[A-Z0-9._/-]*)$/.test(value)
}

function followsServiceMeasurementUnit(trailingContext: string) {
  return /^[^\S\r\n]*(?:HP|BTU|V|A|W|kW|KW|Hz)\b/u.test(trailingContext)
}

export function scrubSensitiveForLLM(input: string): string {
  return sanitizeForLLM(input)
    .replace(/(?<!\d)(?:\+?84|0)[\s().-]*(?:\d[\s().-]*){8,10}(?!\d)/g, '[phone]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{9,12}\b/g, '[id-number]')
    .replace(/\b\d{8}\b/g, '[bank-account]')
    .replace(/\b\d{13,20}\b/g, '[bank-account]')
    .replace(/\b(?:Vinhomes|Vincom|Masteri|Saigon Pearl|Saigon Royal|Saigon South|Sun Avenue|Sun Village|Sunwah|Estella|Lexington|Diamond Island|Empire City|Eco Green|Phu My Hung|Phú Mỹ Hưng|Hoang Anh Gia Lai|Hoàng Anh Gia Lai|Riviera Point|Vista Verde|Era Town|The Manor|Lancaster|City Garden|Lavila|Centana|Topaz|Jamila|Akari|Sunrise City|Botanica|Pearl Plaza|Landmark|The Sun|Citadines|Lumière|Lumiere)(?:\s+(?!tầng|tang|lầu|lau|căn|can|phòng|phong|block|toà|tòa|toa|số|so|STK|TK)[A-Za-zÀ-ỹ][\wÀ-ỹ.]*){0,2}/gi, '[building]')
    .replace(
      /\b(?:số|so)[^\S\r\n]+\d+[A-Za-z]?\b/gi,
      (match, offset: number, source: string) =>
        followsServiceMeasurementUnit(source.slice(offset + match.length)) ? match : '[house-no]',
    )
    .replace(
      /(?<![:\p{L}\p{N}])\d{1,5}[A-Za-z]?(?:[/-]\d{1,5}[A-Za-z]?)?(?=[^\S\r\n]+(?:(?:đường|duong|phố|pho|hẻm|hem)[^\S\r\n]+)?\p{Lu}[\p{L}'-]*(?:[^\S\r\n]+\p{Lu}[\p{L}'-]*){0,3}\b)/gu,
      (match, offset: number, source: string) =>
        followsServiceMeasurementUnit(source.slice(offset + match.length)) ? match : '[house-no]',
    )
    .replace(/(?<![:\p{L}\p{N}])\d{1,5}[A-Za-z]?(?:[/-]\d{1,5}[A-Za-z]?)?(?=[^\S\r\n]+(?:đường|duong|phố|pho|hẻm|hem)[^\S\r\n]+\p{L})/giu, '[house-no]')
    .replace(/\b(?:tầng|tang|lầu|lau)\s*\d{1,3}\b/gi, '[floor]')
    .replace(
      /(?<![\p{L}\p{N}])(?:căn(?:[^\S\r\n]+hộ)?|can(?:[^\S\r\n]+ho)?|phòng|phong|block|toà|tòa|toa)[^\S\r\n]+([\p{L}\p{N}](?:[\p{L}\p{N}._/-]*[\p{L}\p{N}])?)/giu,
      (match, identifier: string, offset: number, source: string) =>
        looksLikePrivateUnitIdentifier(identifier, source.slice(offset + match.length)) ? '[unit]' : match,
    )
}

export type KaelChatCreateInput = z.infer<typeof kaelChatCreateSchema>
export type KaelChatIntakeConfirmationDecisionInput = z.infer<
  typeof kaelChatIntakeConfirmationDecisionSchema
>
export type KaelChatConfirmInput = z.infer<typeof kaelChatConfirmSchema>
export type KaelChatMediaUploadInput = z.infer<typeof kaelChatMediaUploadSchema>
export type KaelChatMediaRevokeInput = z.infer<typeof kaelChatMediaRevokeSchema>
export type KaelChatEvidenceInput = z.infer<typeof kaelChatEvidenceSchema>
export type KaelChatTurnInput = z.infer<typeof kaelChatTurnSchema>
export type KaelAssistantInput = z.infer<typeof kaelAssistantSchema>
export type KaelChatProgress = z.infer<typeof kaelChatProgressSchema>
export type KaelWorkerClarifyInput = z.infer<typeof kaelWorkerClarifySchema>
