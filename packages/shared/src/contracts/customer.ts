import { z } from 'zod'
import { USER_ROLES } from '../constants'
import {
  WORKER_AVATAR_MAX_BYTES,
  workerAvatarUploadSchema,
} from './worker'
import { kaelChatVisionMediaRefSchema } from './kael-chat'
export const customerKaelConversationModeSchema = z.enum(['normal', 'case'])

export const customerKaelConversationCreateSchema = z.object({
  mode: customerKaelConversationModeSchema,
  client_request_id: z.string().uuid(),
}).strict()

export const customerKaelConversationTurnSchema = z.object({
  message: z.string().trim().max(2000),
  language: z.enum(['vi', 'en']).default('vi'),
  client_request_id: z.string().uuid(),
  media_refs: z.array(kaelChatVisionMediaRefSchema).max(5).optional().refine(
    (mediaRefs) => mediaRefs === undefined || new Set(mediaRefs).size === mediaRefs.length,
    'Customer normal chat media_refs must be unique',
  ),
}).strict().superRefine((value, ctx) => {
  if (!value.message && (value.media_refs?.length ?? 0) === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A Customer Kael turn needs text or an attached image.',
      path: ['message'],
    })
  }
})

export const normalChatSuggestionsRequestSchema = z.object({
  language: z.enum(['vi', 'en']),
  source_turn_id: z.string().uuid(),
}).strict()

export type NormalChatSuggestionsRequest = z.infer<typeof normalChatSuggestionsRequestSchema>
export type NormalChatSuggestionsResponse = {
  status: 'ready' | 'unavailable'
  session_id: string
  source_turn_id: string
  language: 'vi' | 'en'
  suggestions: { id: string; text: string }[]
}

export const customerKaelConversationRenameSchema = z.object({
  title: z.string().trim().min(1).max(64),
}).strict()

export const customerKaelConversationPinSchema = z.object({
  pinned: z.boolean(),
}).strict()

export const customerKaelFeedbackSchema = z.object({
  message: z.string().trim().min(8).max(1200).optional(),
  response_id: z.string().trim().min(1).max(128).optional(),
  rating: z.enum(['useful', 'not_useful']).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  source: z.enum(['customer_chat', 'profile']).default('profile'),
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

export const CUSTOMER_AVATAR_MAX_BYTES = WORKER_AVATAR_MAX_BYTES
const customerAvatarRefSchema = z.string().regex(
  /^supabase:\/\/customer-avatars\/[^/\s?#]+\/(?!.*(?:\.\.|\/\/))[A-Za-z0-9._-]+$/i,
  'avatar_ref must be a private customer-avatars storage ref',
)

export const customerAvatarUploadSchema = workerAvatarUploadSchema

export const customerAvatarUpdateSchema = z.object({
  avatar_ref: customerAvatarRefSchema,
}).strict()

export const customerCancellationRequestSchema = z.object({
  reason_code: z.string().trim().min(3).max(120),
  reason_note: z.string().trim().min(3).max(1000).optional(),
  requested_at: z.string().datetime().optional(),
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

export const matchingPushDeliveryAckSchema = z.object({
  matching_delivery_id: z.string().uuid(),
  device_push_token_id: z.string().uuid(),
  device_push_token_updated_at: z.string().datetime(),
}).strict()

export const customerScopeDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
})

export type CustomerKaelConversationMode = z.infer<typeof customerKaelConversationModeSchema>
export type CustomerKaelConversationCreateInput = z.infer<typeof customerKaelConversationCreateSchema>
export type CustomerKaelConversationTurnInput = z.infer<typeof customerKaelConversationTurnSchema>
export type CustomerKaelConversationRenameInput = z.infer<typeof customerKaelConversationRenameSchema>
export type CustomerKaelConversationPinInput = z.infer<typeof customerKaelConversationPinSchema>
export type CustomerKaelFeedbackInput = z.infer<typeof customerKaelFeedbackSchema>
export type CustomerKaelMemoryPreferenceUpdateInput = z.infer<typeof customerKaelMemoryPreferenceUpdateSchema>
export type CustomerPaymentMethodSaveInput = z.infer<typeof customerPaymentMethodSaveSchema>
export type CustomerAvatarUploadInput = z.infer<typeof customerAvatarUploadSchema>
export type CustomerAvatarUpdateInput = z.infer<typeof customerAvatarUpdateSchema>
export type CustomerCancellationRequestInput = z.infer<typeof customerCancellationRequestSchema>
export type DevicePushTokenInput = z.infer<typeof devicePushTokenSchema>
export type DevicePushTokenUnregisterInput = z.infer<typeof devicePushTokenUnregisterSchema>
export type MatchingPushDeliveryAckInput = z.infer<typeof matchingPushDeliveryAckSchema>
export type CustomerScopeDecisionInput = z.infer<typeof customerScopeDecisionSchema>
