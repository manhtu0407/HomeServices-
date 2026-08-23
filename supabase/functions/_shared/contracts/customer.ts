import { z } from "zod";
import {
  WORKER_AVATAR_MAX_BYTES,
  workerAvatarUploadSchema,
} from "./worker.ts";
export const CUSTOMER_AVATAR_MAX_BYTES = WORKER_AVATAR_MAX_BYTES;
const customerAvatarRefSchema = z.string().regex(
  /^supabase:\/\/customer-avatars\/[^/\s?#]+\/(?!.*(?:\.\.|\/\/))[A-Za-z0-9._-]+$/i,
  "avatar_ref must be a private customer-avatars storage ref",
);

export const customerAvatarUploadSchema = workerAvatarUploadSchema;

export const customerAvatarUpdateSchema = z.object({
  avatar_ref: customerAvatarRefSchema,
}).strict();

export const devicePushTokenSchema = z.object({
  platform: z.enum(["ios", "android", "web", "unknown"]),
  push_token: z.string().min(8).max(4096),
  permission_status: z.enum(["granted", "denied", "undetermined"]),
  safe_metadata: z.object({
    project_id_available: z.boolean().optional(),
    role: z.enum(["customer", "worker", "admin"]).nullable().optional(),
    source: z.literal("expo-notifications").optional(),
  }).strict().default({}),
});

export const devicePushTokenUnregisterSchema = z.object({
  push_token: z.string().min(8).max(4096),
}).strict();

export const matchingPushDeliveryAckSchema = z.object({
  matching_delivery_id: z.string().uuid(),
  device_push_token_id: z.string().uuid(),
  device_push_token_updated_at: z.string().datetime(),
}).strict();

export const customerScopeDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
});

export const updateKaelMemorySchema = z
  .object({
    language: z.enum(["vi", "en"]).optional(),
    preference_summary: z.string().trim().max(600).optional(),
  })
  .refine(
    (value) =>
      value.language !== undefined || value.preference_summary !== undefined,
    { message: "Cần ít nhất một trường để cập nhật" },
  );

export type EdgeCustomerAvatarUploadInput = z.infer<typeof customerAvatarUploadSchema>;
export type EdgeCustomerAvatarUpdateInput = z.infer<typeof customerAvatarUpdateSchema>;
export type DevicePushTokenInput = z.infer<typeof devicePushTokenSchema>;
export type EdgeDevicePushTokenUnregisterInput = z.infer<
  typeof devicePushTokenUnregisterSchema
>;
export type EdgeMatchingPushDeliveryAckInput = z.infer<
  typeof matchingPushDeliveryAckSchema
>;
export type CustomerScopeDecisionInput = z.infer<
  typeof customerScopeDecisionSchema
>;
export type UpdateKaelMemoryInput = z.infer<typeof updateKaelMemorySchema>;
