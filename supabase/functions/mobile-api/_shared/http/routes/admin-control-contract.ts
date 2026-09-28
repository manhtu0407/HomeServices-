import { z } from "zod";
import {
  ADMIN_OVERVIEW_DETAIL_KEYS,
  ADMIN_SCOPE_CHANGE_STATUSES,
  ADMIN_SUPPORT_QUEUE_TYPES,
} from "../../domains/contracts/admin-control.ts";
import { SERVICE_TYPES } from "../../../../_shared/domain.ts";

export const ADMIN_CAPABILITY_VALUES = [
  "operations.read",
  "operations.triage",
  "workers.read",
  "workers.review",
  "workers.manage",
  "workers.bonus.manage",
  "workers.discipline.manage",
  "transactions.read",
  "finance.read",
  "finance.reconcile",
  "finance.tax.manage",
  "payouts.read",
  "payouts.process",
  "team.read",
  "system.read",
  "system.manage",
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
  profile_review_queue_id: z.string().uuid(),
  expected_profile_updated_at: z.iso.datetime({ offset: true }),
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

export const adminOverviewDetailsQuerySchema = z.object({
  key: z.enum(ADMIN_OVERVIEW_DETAIL_KEYS),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  cursor: z.string().regex(/^\d+$/).optional(),
}).strict();

const opaqueCursorSchema = z.string().trim().min(8).max(500);

export const adminScopeChangeListQuerySchema = z.object({
  query: z.string().trim().max(100).default(""),
  status: z.enum([...ADMIN_SCOPE_CHANGE_STATUSES, "all"]).default("all"),
  service_type: z.enum([...SERVICE_TYPES, "all"]).default("all"),
  request_timing: z.enum(["all", "pre_arrival", "on_site"]).default("all"),
  requested_from: z.iso.datetime({ offset: true }).optional(),
  requested_to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: opaqueCursorSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.requested_from && value.requested_to && value.requested_from > value.requested_to) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["requested_to"],
      message: "Invalid date range.",
    });
  }
});

export const adminSupportCaseListQuerySchema = z.object({
  query: z.string().trim().max(100).default(""),
  type: z.enum(["all", "dispute", ...ADMIN_SUPPORT_QUEUE_TYPES]).default("all"),
  source_status: z.string().trim().max(80).default("all"),
  priority: z.enum(["all", "low", "medium", "high", "critical"]).default("all"),
  service_type: z.enum([...SERVICE_TYPES, "all"]).default("all"),
  preparation_status: z.enum(["all", "new", "acknowledged", "in_review", "ready"]).default("all"),
  assignee: z.enum(["all", "unassigned", "mine"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: opaqueCursorSchema.optional(),
}).strict();

export const adminSupportPreparationSchema = z.object({
  expected_version: z.number().int().min(0),
  idempotency_key: z.string().uuid(),
  assignment: z.enum(["claim", "unclaim", "keep"]).optional(),
  status: z.enum(["new", "acknowledged", "in_review", "ready"]).optional(),
  checklist: z.object({
    opening_request_reviewed: z.boolean().optional(),
    counterparty_response_reviewed_or_missing: z.boolean().optional(),
    locked_evidence_reviewed: z.boolean().optional(),
    job_timeline_reviewed: z.boolean().optional(),
    scope_and_payment_reviewed: z.boolean().optional(),
    ready_for_next_step: z.boolean().optional(),
  }).strict().optional(),
  note: z.string().trim().min(1).max(1000).optional(),
}).strict().superRefine((value, context) => {
  if (!value.assignment && !value.status && !value.checklist && !value.note) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one preparation change is required.",
    });
  }
});

export const adminWorkflowRecoveryListQuerySchema = z.object({
  status: z.enum(["all", "open", "acknowledged", "action_required", "resolved"]).default("all"),
  severity: z.enum(["all", "medium", "high", "critical"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
}).strict();

export const adminWorkflowRecoveryActionSchema = z.object({
  action: z.enum(["acknowledge", "mark_contact_required", "reconcile_capacity", "resolve_verified"]),
  reason: z.string().trim().min(3).max(500),
  idempotency_key: z.string().uuid(),
  expected_version: z.number().int().min(1),
}).strict();

export const adminEvidenceAccessSchema = z.object({
  evidence_id: z.string().trim().min(1).max(200),
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

export const adminSubAdminListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(512).optional(),
}).strict();

export const adminSubAdminAccessSchema = z.object({
  action: z.enum(["grant", "update", "revoke"]),
  capabilities: z.array(z.enum(ADMIN_CAPABILITY_VALUES)).max(ADMIN_CAPABILITY_VALUES.length),
  client_request_id: z.string().uuid(),
  expected_version: z.number().int().min(0),
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
  if (value.capabilities.includes("operations.triage") && !value.capabilities.includes("operations.read")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["capabilities"],
      message: "operations.triage requires operations.read.",
    });
  }
  if (value.capabilities.includes("system.manage") && !value.capabilities.includes("system.read")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["capabilities"],
      message: "system.manage requires system.read.",
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

export function parseAdminOverviewDetailsQuery(url: URL) {
  return adminOverviewDetailsQuerySchema.safeParse({
    key: url.searchParams.get("key") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
}

export function parseAdminScopeChangeListQuery(url: URL) {
  return adminScopeChangeListQuerySchema.safeParse({
    query: url.searchParams.get("query") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    service_type: url.searchParams.get("service_type") ?? undefined,
    request_timing: url.searchParams.get("request_timing") ?? undefined,
    requested_from: url.searchParams.get("requested_from") ?? undefined,
    requested_to: url.searchParams.get("requested_to") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
}

export function parseAdminSupportCaseListQuery(url: URL) {
  return adminSupportCaseListQuerySchema.safeParse({
    query: url.searchParams.get("query") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    source_status: url.searchParams.get("source_status") ?? undefined,
    priority: url.searchParams.get("priority") ?? undefined,
    service_type: url.searchParams.get("service_type") ?? undefined,
    preparation_status: url.searchParams.get("preparation_status") ?? undefined,
    assignee: url.searchParams.get("assignee") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
}

export function parseAdminWorkflowRecoveryListQuery(url: URL) {
  return adminWorkflowRecoveryListQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    severity: url.searchParams.get("severity") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    offset: url.searchParams.get("offset") ?? undefined,
  });
}

export function parseAdminSubAdminAccountSearchQuery(url: URL) {
  return adminSubAdminAccountSearchQuerySchema.safeParse({
    query: url.searchParams.get("query") ?? undefined,
  });
}

export function parseAdminSubAdminListQuery(url: URL) {
  return adminSubAdminListQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
}
