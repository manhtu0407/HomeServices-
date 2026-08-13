import { z } from "zod";

export const ADMIN_CAPABILITY_VALUES = [
  "operations.read",
  "workers.read",
  "workers.review",
  "workers.manage",
  "transactions.read",
  "finance.read",
  "finance.reconcile",
  "finance.tax.manage",
  "payouts.read",
  "payouts.process",
  "team.read",
] as const;

const ADMIN_APPLICATION_STATUSES = [
  "open",
  "acknowledged",
  "resolved",
  "cancelled",
  "all",
] as const;

const ADMIN_WORKER_REVIEW_STAGES = [
  "pending_access",
  "missing_profile",
  "ready_verification",
  "verified",
  "all",
] as const;

const PAYMENT_STATUSES = [
  "not_started",
  "code_requested",
  "vietqr_ready",
  "pending",
  "received",
  "cash_confirmed",
  "amount_mismatch",
  "expired",
  "failed",
  "reconciled",
  "all",
] as const;

const paginationFields = {
  query: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
};

export const adminWorkerApplicationListQuerySchema = z.object({
  ...paginationFields,
  status: z.enum(ADMIN_APPLICATION_STATUSES).default("open"),
  stage: z.enum(ADMIN_WORKER_REVIEW_STAGES).optional(),
  cursor: z.string().regex(/^\d+$/).optional(),
}).strict();

export const adminWorkerProfileDecisionSchema = z.object({
  decision: z.enum(["approve", "request_changes"]),
  reason: z.string().trim().max(1000).optional(),
}).strict().superRefine((value, context) => {
  if (value.decision === "request_changes" && !value.reason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "A reason is required when requesting changes.",
    });
  }
});

export const adminTransactionListQuerySchema = z.object({
  ...paginationFields,
  payment_status: z.enum(PAYMENT_STATUSES).default("all"),
}).strict();

export const adminGovernanceListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
}).strict();

export const adminWorkerApplicationDecisionSchema = z.object({
  decision: z.enum(["approve", "request_changes", "reject"]),
  reason: z.string().trim().max(1000).optional(),
}).strict().superRefine((value, context) => {
  if (value.decision !== "approve" && !value.reason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "A reason is required for this decision.",
    });
  }
});

export const adminWorkerAccessSchema = z.object({
  action: z.enum(["suspend", "reinstate"]),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export const adminSubAdminAccountSearchQuerySchema = z.object({
  query: z.string().trim().min(2).max(100),
}).strict();

export const adminSubAdminAccessSchema = z.object({
  action: z.enum(["grant", "update", "revoke"]),
  capabilities: z.array(z.enum(ADMIN_CAPABILITY_VALUES)).max(11),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict().superRefine((value, context) => {
  if ((value.action === "grant" || value.action === "update") && value.capabilities.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["capabilities"],
      message: "At least one capability is required.",
    });
  }
  if (new Set(value.capabilities).size !== value.capabilities.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["capabilities"],
      message: "Capabilities must be unique.",
    });
  }
  if (value.action === "revoke" && !value.reason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "A revoke reason is required.",
    });
  }
});

export function parseAdminWorkerApplicationListQuery(url: URL) {
  return adminWorkerApplicationListQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    stage: url.searchParams.get("stage") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    query: url.searchParams.get("query") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
}

export function parseAdminTransactionListQuery(url: URL) {
  return adminTransactionListQuerySchema.safeParse({
    payment_status: url.searchParams.get("payment_status") ?? undefined,
    query: url.searchParams.get("query") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
}

export function parseAdminGovernanceListQuery(url: URL) {
  return adminGovernanceListQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
}

export function parseAdminSubAdminAccountSearchQuery(url: URL) {
  return adminSubAdminAccountSearchQuerySchema.safeParse({
    query: url.searchParams.get("query") ?? undefined,
  });
}
