// Edge evidence-domain schemas: private job-media references, cancellation/dispute evidence,
// and attached asset metadata. Re-exported by domain.ts to preserve the public contract.

import { z } from "zod";

const UUID_PATH_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export const JOB_MEDIA_STAGES = [
  "before",
  "after",
  "kael_reference",
  "cancellation_evidence",
  "scope_change_evidence",
  "access_check_in",
] as const;

const privateJobMediaRefSchema = z.string().min(10).max(500).regex(
  new RegExp(
    `^supabase://job-media/${UUID_PATH_PATTERN}/(?:${JOB_MEDIA_STAGES.join("|")})/(?!.*(?:\\.\\.|//))[^\\s?#/]+$`,
    "i",
  ),
  "Evidence must be an attached private job-media ref",
);

export const workerCancellationRequestSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
  evidence_photo_urls: z.array(z.string().regex(
    new RegExp(
      `^supabase://job-media/${UUID_PATH_PATTERN}/cancellation_evidence/(?!.*(?:\\.\\.|//))[^\\s?#/]+$`,
      "i",
    ),
    "Cancellation evidence must be an attached private job-media ref",
  )).max(5).default([]),
}).strict();

export const customerCancellationRequestSchema = z.object({
  reason_code: z.string().trim().min(3).max(120),
  reason_note: z.string().trim().min(3).max(1000).optional(),
  requested_at: z.string().datetime().optional(),
});

export const disputeOpenRequestSchema = z.object({
  dispute_type: z.enum([
    "completion_rejected",
    "damage_claim",
    "unpaid_service",
    "abusive_behavior_customer",
    "abusive_behavior_worker",
    "scope_disagreement_post_job",
    "other",
  ]),
  initiator_statement: z.string().trim().min(10).max(2000),
  evidence_photo_urls: z.array(privateJobMediaRefSchema).max(5).default([]),
}).strict();

export const disputeCounterStatementSchema = z.object({
  statement: z.string().trim().min(10).max(2000),
});

export const disputeAdminDecisionSchema = z.object({
  outcome: z.enum([
    "customer_favor_full",
    "customer_favor_partial",
    "worker_favor",
    "no_fault_both",
    "mutual_warning",
  ]),
  refund_amount: z.number().int().nonnegative().optional(),
  worker_credit_amount: z.number().int().nonnegative().optional(),
  customer_trust_impact: z.enum(["none", "minor_down", "major_down", "positive_resolved"]),
  worker_action: z.enum(["none", "warning", "temp_suspend_7d", "temp_suspend_30d", "permanent_suspend"]),
  reasoning: z.string().trim().min(50).max(2000),
});

const jobMediaAssetSchema = z.object({
  object_path: z.string().min(10).max(500).regex(
    new RegExp(
      `^${UUID_PATH_PATTERN}/(?:${JOB_MEDIA_STAGES.join("|")})/(?!.*(?:\\.\\.|//))[^\\s?#/]+$`,
      "i",
    ),
    "Job media object_path must be a private job-scoped storage path",
  ),
  stage: z.enum(JOB_MEDIA_STAGES),
  mime_type: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]).optional(),
  file_size_bytes: z.number().int().positive().max(26_214_400).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.object_path.split("/")[1] !== value.stage) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stage"],
      message: "Job media stage must match object_path",
    });
  }
});

export const jobMediaAttachSchema = z.object({
  assets: z.array(jobMediaAssetSchema).min(1).max(5),
}).strict().superRefine((value, ctx) => {
  const paths = value.assets.map((asset) => asset.object_path.toLowerCase());
  if (new Set(paths).size !== paths.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["assets"],
      message: "Job media object paths must be unique",
    });
  }
});
