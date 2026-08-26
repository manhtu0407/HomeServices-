import { z } from "zod";

import { SERVICE_TYPES } from "../../../../_shared/domain.ts";

const opaqueCursorSchema = z.string().trim().min(8).max(512);
const dateRangeFields = {
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
};

const commonListFields = {
  query: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: opaqueCursorSchema.optional(),
};

export const adminSystemListQuerySchema = z.object(commonListFields).strict();

export const adminSystemPriceListQuerySchema = z.object({
  ...commonListFields,
  ...dateRangeFields,
  service_type: z.enum([...SERVICE_TYPES, "all"]).default("all"),
  problem_id: z.string().uuid().optional(),
  complexity: z.enum(["all", "small", "medium", "large"]).default("all"),
  district: z.string().trim().max(40).default("all"),
  status: z.enum(["all", "active", "superseded", "retired"]).default("all"),
  evidence_source: z.string().trim().max(120).default("all"),
}).strict();

export const adminSystemTaxonomyListQuerySchema = z.object({
  ...commonListFields,
  status: z.enum(["all", "active", "inactive"]).default("all"),
  complexity: z.enum(["all", "small", "medium", "large"]).default("all"),
  baseline: z.enum(["all", "available", "missing"]).default("all"),
}).strict();

export const adminSystemLearningListQuerySchema = z.object({
  ...commonListFields,
  ...dateRangeFields,
  status: z.string().trim().max(60).default("all"),
  rule_type: z.string().trim().max(80).default("all"),
  service_type: z.enum([...SERVICE_TYPES, "all"]).default("all"),
  problem: z.string().trim().max(100).default("all"),
  district: z.string().trim().max(40).default("all"),
  confidence_min: z.coerce.number().min(0).max(1).optional(),
  confidence_max: z.coerce.number().min(0).max(1).optional(),
  rollback: z.enum(["all", "available", "unavailable"]).default("all"),
}).strict();

export const adminSystemModelHealthQuerySchema = z.object({
  ...commonListFields,
  ...dateRangeFields,
  view: z.enum(["overview", "incidents", "costs"]).default("overview"),
  provider: z.string().trim().max(80).default("all"),
  model: z.string().trim().max(120).default("all"),
  purpose: z.string().trim().max(100).default("all"),
  failure_kind: z.string().trim().max(100).default("all"),
  circuit: z.enum(["all", "open", "closed"]).default("all"),
}).strict();

export const adminSystemMutationSchema = z.object({
  expected_version: z.number().int().min(0),
  client_request_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export const adminSystemPriceValidateSchema = adminSystemMutationSchema.extend({
  baseline_id: z.string().uuid().optional(),
  evidence_package_id: z.string().uuid(),
  effective_from: z.iso.datetime({ offset: true }).optional(),
}).strict();

export const adminSystemPricePublishSchema = adminSystemPriceValidateSchema;

export const adminSystemTaxonomyValidateSchema = z.object({
  expected_revision: z.number().int().min(0),
  client_request_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
  service_patch: z.object({
    label_vi: z.string().trim().min(1).max(160).optional(),
    label_en: z.string().trim().min(1).max(160).optional(),
  }).strict().optional(),
  problem_changes: z.array(z.discriminatedUnion("action", [
    z.object({
      action: z.literal("create"),
      value: z.object({
        slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
        label_vi: z.string().trim().min(1).max(160),
        label_en: z.string().trim().min(1).max(160),
        default_complexity: z.enum(["small", "medium", "large"]),
        sort_order: z.number().int().min(0).max(10000),
      }).strict(),
    }).strict(),
    z.object({
      action: z.literal("update"),
      id: z.string().uuid(),
      patch: z.object({
        label_vi: z.string().trim().min(1).max(160).optional(),
        label_en: z.string().trim().min(1).max(160).optional(),
        default_complexity: z.enum(["small", "medium", "large"]).optional(),
      }).strict(),
    }).strict(),
    z.object({ action: z.enum(["activate", "deactivate"]), id: z.string().uuid() }).strict(),
    z.object({ action: z.literal("reorder"), id: z.string().uuid(), sort_order: z.number().int().min(0).max(10000) }).strict(),
  ])).min(0).max(200),
}).strict().superRefine((value, context) => {
  if (!value.service_patch && value.problem_changes.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "At least one taxonomy change is required." });
  }
});

export const adminSystemLearningActionSchema = adminSystemMutationSchema.extend({
  target_version: z.number().int().positive().optional(),
}).strict();

export function parseAdminSystemListQuery(url: URL) {
  return adminSystemListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
}

export function parseAdminSystemPriceListQuery(url: URL) {
  return adminSystemPriceListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
}

export function parseAdminSystemTaxonomyListQuery(url: URL) {
  return adminSystemTaxonomyListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
}

export function parseAdminSystemLearningListQuery(url: URL) {
  return adminSystemLearningListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
}

export function parseAdminSystemModelHealthQuery(url: URL) {
  return adminSystemModelHealthQuerySchema.safeParse(Object.fromEntries(url.searchParams));
}
