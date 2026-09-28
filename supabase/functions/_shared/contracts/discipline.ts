import { z } from "zod";

export const CUSTOMER_REPORTABLE_VIOLATIONS = [
  "off_app_dealing",
  "extra_cash",
  "theft",
  "intentional_damage",
  "harassment_sexual",
  "violence",
  "threats",
  "covert_recording",
] as const;

export const workerReportSchema = z.object({
  violation_code: z.enum(CUSTOMER_REPORTABLE_VIOLATIONS),
  statement: z.string().trim().min(10).max(2000),
}).strict();

export const appealEvidenceUploadSchema = z.object({
  content_type: z.enum(["image/jpeg", "image/png", "video/mp4", "audio/m4a", "application/pdf"]),
}).strict();

export const appealSubmitSchema = z.object({
  reason: z.string().trim().min(20).max(2000),
  evidence_paths: z.array(z.string().max(200)).max(6),
}).strict();

export const violationDecisionSchema = z.object({
  decision: z.enum(["confirm", "dismiss", "fabricated_report"]),
  reason: z.string().trim().min(10).max(2000),
  clawback_vnd: z.number().int().min(0).max(100_000_000).optional(),
}).strict();

export const violationSuspendSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
}).strict();

export const withdrawalHoldExtendSchema = z.object({
  authority_reference: z.string().trim().min(3).max(200),
  hold_until: z.string().datetime({ offset: true }),
}).strict();

export const compensationClaimSchema = z.object({
  amount_vnd: z.number().int().positive(),
  note: z.string().trim().min(10).max(1000),
  evidence_paths: z.array(z.string().max(200)).max(3).default([]),
}).strict();

export const compensationEvidenceUploadSchema = z.object({
  content_type: z.enum(["image/jpeg", "image/png"]),
}).strict();

export const compensationResponseSchema = z.object({
  action: z.enum(["accept", "counter", "decline"]),
  amount_vnd: z.number().int().positive().optional(),
  note: z.string().trim().max(1000).optional(),
}).strict().refine((input) => (input.action === "counter") === (input.amount_vnd !== undefined));

export const compensationPaidSchema = z.object({
  transfer_reference: z.string().trim().min(3).max(120),
}).strict();

export const appealDecisionSchema = z.object({
  decision: z.enum(["upheld", "overturned"]),
  reason: z.string().trim().min(10).max(2000),
}).strict();

export const workerIdentityNumberSchema = z.object({
  cccd_number: z.string().trim().regex(/^[0-9]{12}$/),
}).strict();

export const identityBlockLiftSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
}).strict();

export type EdgeWorkerReportInput = z.infer<typeof workerReportSchema>;
export type EdgeAppealEvidenceUploadInput = z.infer<typeof appealEvidenceUploadSchema>;
export type EdgeAppealSubmitInput = z.infer<typeof appealSubmitSchema>;
export type EdgeViolationDecisionInput = z.infer<typeof violationDecisionSchema>;
export type EdgeViolationSuspendInput = z.infer<typeof violationSuspendSchema>;
export type EdgeCompensationClaimInput = z.infer<typeof compensationClaimSchema>;
export type EdgeCompensationEvidenceUploadInput = z.infer<typeof compensationEvidenceUploadSchema>;
export type EdgeCompensationResponseInput = z.infer<typeof compensationResponseSchema>;
export type EdgeCompensationPaidInput = z.infer<typeof compensationPaidSchema>;
export type EdgeWithdrawalHoldExtendInput = z.infer<typeof withdrawalHoldExtendSchema>;
export type EdgeAppealDecisionInput = z.infer<typeof appealDecisionSchema>;
export type EdgeWorkerIdentityNumberInput = z.infer<typeof workerIdentityNumberSchema>;
export type EdgeIdentityBlockLiftInput = z.infer<typeof identityBlockLiftSchema>;
