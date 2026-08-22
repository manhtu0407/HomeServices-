import { z } from "zod";

export const ACCOUNT_DELETION_CONFIRMATION = "XÓA TÀI KHOẢN";

export const accountDeletionRequestSchema = z.object({
  acknowledge_data_loss: z.literal(true),
  client_request_id: z.string().uuid(),
  confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION),
}).strict();

export const customerAccountDeletionRequestSchema = accountDeletionRequestSchema;

export const customerKaelFeedbackSchema = z.object({
  message: z.string().trim().min(8).max(1200).optional(),
  response_id: z.string().trim().min(1).max(128).optional(),
  rating: z.enum(["useful", "not_useful"]).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  source: z.enum(["customer_chat", "profile"]).default("profile"),
  language: z.enum(["vi", "en"]).default("vi"),
}).strict().superRefine((value, ctx) => {
  if (!value.message && (!value.response_id || !value.rating)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Feedback requires a legacy message or a response_id with rating.",
      path: ["response_id"],
    });
  }
  if (Boolean(value.response_id) !== Boolean(value.rating)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Feedback response_id and rating must be provided together.",
      path: value.response_id ? ["rating"] : ["response_id"],
    });
  }
  if (value.reason && !value.rating) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Feedback reason requires a rating.",
      path: ["reason"],
    });
  }
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
export type AccountDeletionRequest = z.infer<typeof accountDeletionRequestSchema>;
export type CustomerAccountDeletionRequest = AccountDeletionRequest;
export type CustomerKaelMemoryPreferenceUpdateInput = z.infer<
  typeof customerKaelMemoryPreferenceUpdateSchema
>;
export type CustomerPaymentMethodSaveInput = z.infer<
  typeof customerPaymentMethodSaveSchema
>;
export type CustomerRefundAccountSaveRequest = z.infer<
  typeof customerRefundAccountSaveSchema
>;
