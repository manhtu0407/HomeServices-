import { z } from "zod";
import { KAEL_PERFORMANCE_PROFILE_IDS } from "../../mobile-api/_shared/kael/learning/performance-profiles.ts";
import { kaelCaseEvidenceSchema } from "../../mobile-api/_shared/kael/contracts/artifact-contract.ts";
import { refineKaelChatCreateInput } from "../kael-chat-create-refinement.ts";
import { kaelChatMediaRefSchema } from "../kael-chat-media-contract.ts";
import { clientRequestIdSchema, serviceTypeSchema } from "./common.ts";
import { apartmentAccessProfileSchema } from "./job.ts";
const kaelChatEvidenceItemsSchema = z.array(kaelCaseEvidenceSchema).max(20).optional();
const kaelChatScheduleWindowSchema = z.object({
  date: z.string().refine(isRealCalendarDate, "date must be YYYY-MM-DD"),
  start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "start must be HH:mm"),
  end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "end must be HH:mm"),
  time_zone: z.literal("Asia/Ho_Chi_Minh"),
}).strict().superRefine((value, ctx) => {
  if (value.end <= value.start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "schedule window end must be after start",
      path: ["end"],
    });
  }
});

export const kaelChatCreateSchema = z.object({
  service_type: serviceTypeSchema,
  profile_id: z.enum(KAEL_PERFORMANCE_PROFILE_IDS).optional(),
  intake_source: z.enum(["booking", "direct_chat"]).optional(),
  intake_description: z.string().trim().min(10).max(2000).optional(),
  session_id: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(5000).optional(),
  problem_chips: z.array(z.string().trim().min(1).max(100)).max(10).default([]),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  evidence_items: kaelChatEvidenceItemsSchema,
  defer_analysis: z.boolean().optional(),
  language: z.enum(["vi", "en"]).optional(),
  address_label: z.string().max(200).optional(),
  address_district: z.string().max(100).optional(),
  apartment_access_profile: apartmentAccessProfileSchema.optional(),
  scheduled_at: z.string().datetime().optional(),
  schedule_window: kaelChatScheduleWindowSchema.optional(),
  // Optional UUID for idempotent session
  // creation. Same semantics as jobCreateSchema.client_request_id.
  client_request_id: clientRequestIdSchema.optional(),
}).superRefine(refineKaelChatCreateInput);

export const kaelChatIntakeConfirmationDecisionSchema = z.object({
  decision: z.enum(["confirmed", "correction_requested"]),
}).strict();

export const kaelChatEvidenceSchema = z.object({
  decision: z.enum(["confirmed", "skipped"]),
  message: z.string().trim().min(1).max(5000).optional(),
  problem_chips: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  media_refs: z.array(kaelChatMediaRefSchema).max(5).default([]),
  evidence_items: kaelChatEvidenceItemsSchema,
  language: z.enum(["vi", "en"]).optional(),
  skip_reason: z.string().trim().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.decision === "skipped" && !value.skip_reason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Skipping optional evidence requires a short reason.",
      path: ["skip_reason"],
    });
  }
  if (
    value.decision === "confirmed" &&
    value.media_refs.length === 0 &&
    (value.evidence_items?.length ?? 0) === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Evidence confirmation requires at least one durable media ref.",
      path: ["media_refs"],
    });
  }
  if (
    value.decision === "skipped" &&
    (
      value.media_refs.length > 0 ||
      value.photo_urls.length > 0 ||
      (value.evidence_items?.length ?? 0) > 0
    )
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Skipped evidence must not include media or evidence items.",
      path: ["evidence_items"],
    });
  }
});

export const kaelChatTurnSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  problem_chips: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  photo_urls: z.array(z.string().url()).max(5).default([]),
  evidence_items: kaelChatEvidenceItemsSchema,
  language: z.enum(["vi", "en"]).optional(),
  address_label: z.string().max(200).optional(),
  address_district: z.string().max(100).optional(),
  apartment_access_profile: apartmentAccessProfileSchema.optional(),
  scheduled_at: z.string().datetime().optional(),
  schedule_window: kaelChatScheduleWindowSchema.optional(),
});

export const kaelAssistantSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  language: z.enum(["vi", "en"]).default("vi"),
  job_id: z.string().uuid().optional(),
  surface: z.enum(["customer_normal", "customer_case"]).default("customer_normal"),
}).strict().superRefine((input, ctx) => {
  if (input.surface === "customer_case" && !input.job_id) {
    ctx.addIssue({
      code: "custom",
      message: "job_id is required for customer_case",
      path: ["job_id"],
    });
  }
});

export const kaelChatProgressSchema = z.object({
  current_stage: z.enum([
    "intent_classification",
    "vision_analysis",
    "clarification",
    "problem_synthesis",
    "market_lookup",
    "price_synthesis",
    "advisory_generation",
    "worker_brief",
    "worker_assist",
    "scope_change",
    "scope_reviewing",
    "scope_estimating",
    "post_job_learning",
    "educational_response",
  ]),
  status: z.enum(["queued", "running", "completed", "failed"]),
  progress: z.number().min(0).max(1),
  failure_reason: z.string().max(160).nullable().optional(),
  updated_at: z.string().datetime(),
}).strict();

function isRealCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

export const kaelWorkerClarifySchema = z.object({
  question: z.string().trim().min(3).max(1000),
});

export function sanitizeForLLM(input: string): string {
  const sanitized = input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB]/g, "")
    .trim();
  return truncateWithoutSplittingSurrogate(sanitized, 5000);
}

function truncateWithoutSplittingSurrogate(value: string, maxLength: number): string {
  const truncated = value.slice(0, maxLength);
  const lastCodeUnit = truncated.charCodeAt(truncated.length - 1);
  return lastCodeUnit >= 0xD800 && lastCodeUnit <= 0xDBFF
    ? truncated.slice(0, -1)
    : truncated;
}

export type KaelChatCreateInput = z.infer<typeof kaelChatCreateSchema>;
export type EdgeKaelChatIntakeConfirmationDecisionInput = z.infer<
  typeof kaelChatIntakeConfirmationDecisionSchema
>;
export type KaelChatEvidenceInput = z.infer<typeof kaelChatEvidenceSchema>;
export type KaelChatTurnInput = z.infer<typeof kaelChatTurnSchema>;
export type KaelAssistantInput = z.infer<typeof kaelAssistantSchema>;
export type KaelWorkerClarifyInput = z.infer<typeof kaelWorkerClarifySchema>;
