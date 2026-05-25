import { z } from 'zod'

export const serviceTypeSchema = z.enum(['electrical', 'plumbing', 'cleaning'])

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

export const kaelChatCreateSchema = z.object({
  service_type: serviceTypeSchema,
  session_id: z.string().uuid().optional(),
  message: z.string().min(1).max(5000).optional(),
  problem_chips: z.array(z.string().max(100)).max(10).default([]),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  address_label: z.string().max(200).optional(),
  address_district: z.string().max(100).optional(),
})

export const kaelChatTurnSchema = z.object({
  message: z.string().min(1).max(5000),
  problem_chips: z.array(z.string().max(100)).max(10).optional(),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  address_label: z.string().max(200).optional(),
  address_district: z.string().max(100).optional(),
})

export const placesAutocompleteSchema = z.object({
  input: z.string().trim().min(2).max(160),
  session_token: z.string().max(120).optional(),
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

export const workerRegisterSchema = z.object({
  legal_name: z.string().min(2).max(200),
  date_of_birth: z
    .string()
    .refine(isRealCalendarDate, 'date_of_birth must be a real calendar date in YYYY-MM-DD'),
  gender: z.enum(['male', 'female', 'other']).optional(),
  service_types: z.array(serviceTypeSchema).min(1).max(3),
  years_experience: z.number().int().min(0).max(60),
  districts: z.array(z.string().min(1).max(50)).min(1).max(20),
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

export const workerCancellationRequestSchema = z.object({
  reason: z.string().min(10).max(1000),
  evidence_photo_urls: z.array(z.string().url()).max(5).default([]),
})

export const workerCancellationDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  review_note: z.string().max(1000).optional(),
})

export const jobMediaAttachSchema = z.object({
  assets: z.array(z.object({
    object_path: z.string().min(10).max(500),
    stage: z.enum(['before', 'after', 'kael_reference', 'cancellation_evidence', 'scope_change_evidence']),
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
export type KaelChatCreateInput = z.infer<typeof kaelChatCreateSchema>
export type KaelChatTurnInput = z.infer<typeof kaelChatTurnSchema>
export type PlacesAutocompleteInput = z.infer<typeof placesAutocompleteSchema>
export type ReviewInput = z.infer<typeof reviewSchema>
export type ChatMessageInput = z.infer<typeof chatMessageSchema>
export type JobMessageSendInput = z.infer<typeof jobMessageSendSchema>
export type WorkerRegisterInput = z.infer<typeof workerRegisterSchema>
export type AvailabilityToggleInput = z.infer<typeof availabilityToggleSchema>
export type WorkerScopeChangeInput = z.infer<typeof workerScopeChangeSchema>
export type WorkerCancellationRequestInput = z.infer<typeof workerCancellationRequestSchema>
export type WorkerCancellationDecisionInput = z.infer<typeof workerCancellationDecisionSchema>
export type JobMediaAttachInput = z.infer<typeof jobMediaAttachSchema>
export type DevicePushTokenInput = z.infer<typeof devicePushTokenSchema>
export type CustomerScopeDecisionInput = z.infer<typeof customerScopeDecisionSchema>
