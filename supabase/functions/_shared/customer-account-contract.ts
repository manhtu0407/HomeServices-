import { z } from "zod";

export const CUSTOMER_ACCOUNT_DELETION_CONFIRMATION = "XÓA TÀI KHOẢN";

export const customerAccountDeletionRequestSchema = z.object({
  acknowledge_data_loss: z.literal(true),
  client_request_id: z.string().uuid(),
  confirmation: z.literal(CUSTOMER_ACCOUNT_DELETION_CONFIRMATION),
}).strict();

export const customerKaelFeedbackSchema = z.object({
  message: z.string().trim().min(8).max(1200),
  source: z.enum(["profile"]).default("profile"),
  language: z.enum(["vi", "en"]).default("vi"),
});

export const CUSTOMER_KAEL_MEMORY_PREFERENCE_KEYS = Object.freeze([
  "preferred_address",
  "preferred_time_window",
  "budget_limit_vnd",
  "message_interaction_memory",
  "share_preferences_with_worker",
] as const);
export type CustomerKaelMemoryPreferenceKey =
  (typeof CUSTOMER_KAEL_MEMORY_PREFERENCE_KEYS)[number];

export const customerKaelMemoryPreferenceUpdateSchema = z.object({
  key: z.enum(CUSTOMER_KAEL_MEMORY_PREFERENCE_KEYS),
  enabled: z.boolean(),
}).strict();

export const CUSTOMER_PAYMENT_BANK_KEYS = Object.freeze([
  "vietcombank",
  "techcombank",
  "bidv",
  "mbbank",
  "acb",
  "vietinbank",
] as const);
export type CustomerPaymentBankKey =
  (typeof CUSTOMER_PAYMENT_BANK_KEYS)[number];

export const customerPaymentMethodSaveSchema = z.object({
  bank_key: z.enum(CUSTOMER_PAYMENT_BANK_KEYS),
  bank_name: z.string().trim().min(2).max(100),
  account_holder_name: z.string().trim().min(2).max(200),
  bank_account: z
    .string()
    .trim()
    .min(6)
    .max(50)
    .regex(/^[0-9A-Za-z]+$/, "bank_account must contain only letters or digits"),
}).strict();

// Refund accounts are Customer-only and never accept a display bank name from the client.
// The persistence RPC resolves the canonical name from bank_key before storing it.
export const customerRefundAccountSaveSchema = customerPaymentMethodSaveSchema
  .omit({ bank_name: true });

export type CustomerKaelFeedbackInput = z.infer<
  typeof customerKaelFeedbackSchema
>;
export type CustomerAccountDeletionRequest = z.infer<
  typeof customerAccountDeletionRequestSchema
>;
export type CustomerKaelMemoryPreferenceUpdateInput = z.infer<
  typeof customerKaelMemoryPreferenceUpdateSchema
>;
export type CustomerPaymentMethodSaveInput = z.infer<
  typeof customerPaymentMethodSaveSchema
>;
export type CustomerRefundAccountSaveRequest = z.infer<
  typeof customerRefundAccountSaveSchema
>;
