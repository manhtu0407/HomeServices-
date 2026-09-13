import { z } from "zod";

const FINANCE_RANGES = ["day", "week", "month", "year"] as const;
const RECONCILIATION_STATUSES = ["pending", "reconcile_required", "all"] as const;
const PAYMENT_DECISIONS = ["confirm", "reconcile_required", "direct_paid", "direct_release", "cash_confirm", "cash_reject"] as const;
const BANK_REFERENCE = /^[A-Za-z0-9._/-]{3,128}$/;
const FINANCE_FILTER = /^[a-z][a-z0-9_]{0,63}$/;
const FINANCE_CURSOR = /^[A-Za-z0-9_-]{1,512}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FINANCE_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;

const financePeriodFields = {
  range: z.enum(FINANCE_RANGES).optional(),
  anchor: z.string().datetime({ offset: true }).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
};

export const adminPaymentReconciliationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().regex(FINANCE_CURSOR).optional(),
  status: z.enum(RECONCILIATION_STATUSES).default("pending"),
  payment_method: z.enum(["platform_bank_manual", "direct_worker", "all"]).default("all"),
  assignment: z.enum(["mine", "unassigned", "all"]).default("all"),
  query: z.string().trim().min(2).max(80).optional(),
}).strict();

const moneyMutationFields = {
  expected_version: z.coerce.number().int().positive(),
  client_request_id: z.string().uuid(),
};

export const adminPaymentReconciliationClaimSchema = z.object({
  ...moneyMutationFields,
  takeover_reason: z.string().trim().min(3).max(500).optional(),
}).strict();

export const adminPaymentReconciliationReleaseSchema = z.object({
  ...moneyMutationFields,
  reason: z.string().trim().min(3).max(500),
}).strict();

export const adminPaymentReconciliationDecisionSchema = z.object({
  ...moneyMutationFields,
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
  client_request_id: z.string().uuid(),
  balance_vnd: z.coerce.number().int().min(0),
  observed_at: z.string().datetime({ offset: true }),
}).strict();

export const adminWorkerFinanceSnapshotQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((value, context) => {
  if (Boolean(value.from) !== Boolean(value.to)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [value.from ? "to" : "from"],
      message: "Both worker finance date bounds are required.",
    });
    return;
  }
  if (value.from && value.to) {
    const duration = Date.parse(value.to) - Date.parse(value.from);
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_FINANCE_RANGE_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Worker finance date range must be between 1 millisecond and 366 days.",
      });
    }
  }
});

export const adminFinanceOverviewQuerySchema = z.object(financePeriodFields)
  .strict()
  .superRefine(validateFinancePeriod);

export const adminFinanceTransactionListQuerySchema = z.object({
  ...financePeriodFields,
  cursor: z.string().regex(FINANCE_CURSOR).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  payment_method: z.string().regex(FINANCE_FILTER).optional(),
  service_type: z.string().regex(FINANCE_FILTER).optional(),
  status: z.enum(["paid", "reviewed", "cancelled"]).optional(),
}).strict().superRefine(validateFinancePeriod);

export const adminFinanceExportQuerySchema = z.object({
  ...financePeriodFields,
  payment_method: z.string().regex(FINANCE_FILTER).optional(),
  service_type: z.string().regex(FINANCE_FILTER).optional(),
  status: z.enum(["paid", "reviewed", "cancelled"]).optional(),
}).strict().superRefine(validateFinancePeriod);

export const adminFinanceTaxPolicyDraftSchema = z.object({
  name: z.string().trim().min(3).max(120),
  rules: z.array(z.object({
    tax_type: z.string().trim().regex(/^[A-Za-z0-9_]{2,40}$/),
    subject: z.enum(["platform", "worker"]),
    basis: z.enum(["gmv", "commission_collected", "commission_retained", "worker_net_paid"]),
    rate_bps: z.coerce.number().int().min(1).max(10_000),
  }).strict()).min(1).max(20),
  effective_from: z.string().regex(DATE_ONLY),
  effective_to: z.string().regex(DATE_ONLY).optional(),
  source_reference: z.string().trim().min(3).max(512),
}).strict().superRefine((value, context) => {
  if (value.effective_to && value.effective_to < value.effective_from) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effective_to"],
      message: "Effective end date must not precede the start date.",
    });
  }
});

export const adminFinanceTaxPolicyApproveSchema = z.object({
  accountant_approval_reference: z.string().trim().min(3).max(512),
}).strict();

export const adminFinanceTaxPolicyRetireSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();

export function parseAdminPaymentReconciliationListQuery(url: URL) {
  return adminPaymentReconciliationListQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    payment_method: url.searchParams.get("payment_method") ?? undefined,
    assignment: url.searchParams.get("assignment") ?? undefined,
    query: url.searchParams.get("query") ?? undefined,
  });
}

export function parseAdminFinanceSummaryQuery(url: URL) {
  return adminFinanceSummaryQuerySchema.safeParse({
    range: url.searchParams.get("range") ?? undefined,
    anchor: url.searchParams.get("anchor") ?? undefined,
  });
}

export function parseAdminWorkerFinanceSnapshotQuery(url: URL) {
  return adminWorkerFinanceSnapshotQuerySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
}

export function parseAdminFinanceOverviewQuery(url: URL) {
  const hasCustomRange = url.searchParams.has("from") || url.searchParams.has("to");
  return adminFinanceOverviewQuerySchema.safeParse({
    range: url.searchParams.get("range") ?? (hasCustomRange ? undefined : "month"),
    anchor: url.searchParams.get("anchor") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
}

export function parseAdminFinanceTransactionListQuery(url: URL) {
  return adminFinanceTransactionListQuerySchema.safeParse({
    range: url.searchParams.get("range") ?? undefined,
    anchor: url.searchParams.get("anchor") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    payment_method: url.searchParams.get("payment_method") ?? undefined,
    service_type: url.searchParams.get("service_type") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
}

export function parseAdminFinanceExportQuery(url: URL) {
  return adminFinanceExportQuerySchema.safeParse({
    range: url.searchParams.get("range") ?? undefined,
    anchor: url.searchParams.get("anchor") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    payment_method: url.searchParams.get("payment_method") ?? undefined,
    service_type: url.searchParams.get("service_type") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
}

function validateFinancePeriod(
  value: { range?: string; anchor?: string; from?: string; to?: string },
  context: z.RefinementCtx,
) {
  const hasPreset = Boolean(value.range);
  const hasCustomField = Boolean(value.from || value.to);
  if (hasPreset === hasCustomField) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["range"],
      message: "Use either a preset range or a custom date range.",
    });
    return;
  }
  if (value.anchor && !hasPreset) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["anchor"],
      message: "Anchor requires a preset range.",
    });
  }
  if (!hasCustomField) return;
  if (!value.from || !value.to) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [value.from ? "to" : "from"],
      message: "Both custom date bounds are required.",
    });
    return;
  }
  const duration = Date.parse(value.to) - Date.parse(value.from);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_FINANCE_RANGE_MS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["to"],
      message: "Finance date range must be between 1 millisecond and 366 days.",
    });
  }
}
