import { z } from "zod";

const PAYOUT_METHOD_STATUSES = [
  "pending_verification",
  "verified",
  "rejected",
  "all",
] as const;

const WITHDRAWAL_STATUSES = [
  "pending",
  "processing",
  "paid",
  "rejected",
  "failed",
  "all",
] as const;

const paginationFields = {
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).max(5_000).default(0),
};

export const adminPayoutMethodListQuerySchema = z.object({
  ...paginationFields,
  status: z.enum(PAYOUT_METHOD_STATUSES).default("pending_verification"),
}).strict();

export const adminWithdrawalRequestListQuerySchema = z.object({
  ...paginationFields,
  status: z.enum(WITHDRAWAL_STATUSES).default("pending"),
}).strict();

export const adminPayoutMethodDecisionSchema = z.object({
  decision: z.enum(["verify", "reject"]),
  reason: z.string().trim().max(500).optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === "reject" && (!value.reason || value.reason.length < 3)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "A rejection reason is required.",
    });
  }
});

export const adminWithdrawalRequestResolveSchema = z.object({
  decision: z.enum(["paid", "rejected", "failed"]),
  transfer_reference: z.string().trim().max(128).optional(),
  reason: z.string().trim().max(500).optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === "paid" && (!value.transfer_reference || !/^[A-Za-z0-9._/-]{3,128}$/.test(value.transfer_reference))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["transfer_reference"],
      message: "A transfer reference is required for paid withdrawals.",
    });
  }
  if (value.decision !== "paid" && (!value.reason || value.reason.length < 3)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "A resolution reason is required.",
    });
  }
});

export function parseAdminPayoutMethodListQuery(url: URL) {
  return adminPayoutMethodListQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
}

export function parseAdminWithdrawalRequestListQuery(url: URL) {
  return adminWithdrawalRequestListQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
}
