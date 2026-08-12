import { z } from "zod";

const FINANCE_RANGES = ["day", "week", "month", "year"] as const;
const RECONCILIATION_STATUSES = ["pending", "reconcile_required", "all"] as const;
const PAYMENT_DECISIONS = ["confirm", "reconcile_required", "direct_paid", "direct_release"] as const;
const BANK_REFERENCE = /^[A-Za-z0-9._/-]{3,128}$/;

export const adminPaymentReconciliationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).max(5_000).default(0),
  status: z.enum(RECONCILIATION_STATUSES).default("pending"),
}).strict();

export const adminPaymentReconciliationDecisionSchema = z.object({
  decision: z.enum(PAYMENT_DECISIONS),
  amount_received: z.coerce.number().int().positive().optional(),
  bank_reference: z.string().trim().regex(BANK_REFERENCE).optional(),
  credited_at: z.string().datetime({ offset: true }).optional(),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict().superRefine((value, context) => {
  const manualDecision = value.decision === "confirm" || value.decision === "reconcile_required";
  if (manualDecision && value.amount_received === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["amount_received"], message: "Actual amount is required." });
  }
  if (manualDecision && !value.bank_reference) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["bank_reference"], message: "Bank reference is required." });
  }
  if (manualDecision && !value.credited_at) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["credited_at"], message: "Credited time is required." });
  }
  if ((value.decision === "reconcile_required" || value.decision === "direct_release") && !value.reason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "A reconciliation reason is required." });
  }
});

export const adminFinanceSummaryQuerySchema = z.object({
  range: z.enum(FINANCE_RANGES),
  anchor: z.string().datetime({ offset: true }).optional(),
}).strict();

export const adminFinanceBalanceSnapshotSchema = z.object({
  balance_vnd: z.coerce.number().int().min(0),
  observed_at: z.string().datetime({ offset: true }),
}).strict();

export function parseAdminPaymentReconciliationListQuery(url: URL) {
  return adminPaymentReconciliationListQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
}

export function parseAdminFinanceSummaryQuery(url: URL) {
  return adminFinanceSummaryQuerySchema.safeParse({
    range: url.searchParams.get("range") ?? undefined,
    anchor: url.searchParams.get("anchor") ?? undefined,
  });
}
