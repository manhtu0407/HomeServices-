import { z } from "zod";
export const edgeRefundSummarySchema = z.object({
  state: z.enum(["review_required", "refund_required"]),
  amount_vnd: z.number().int().positive().nullable(),
  obligation_ids: z.array(z.string().uuid()),
  requested_at: z.string().datetime({ offset: true }),
  receipt_verification_available: z.literal(false),
}).strict().refine((value) => value.state === "refund_required"
  ? value.amount_vnd !== null && value.obligation_ids.length > 0
  : value.amount_vnd === null && value.obligation_ids.length === 0);

export type EdgeRefundSummary = z.infer<typeof edgeRefundSummarySchema>;

import {
  customerCancellationRequestSchema,
  disputeAdminDecisionSchema,
  disputeCounterStatementSchema,
  disputeOpenRequestSchema,
  jobMediaAttachSchema,
  workerCancellationRequestSchema,
} from "../domain-evidence.ts";
export const reviewSchema = z.object({
  job_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
  comment: z.string().trim().max(1000).optional(),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
export type WorkerCancellationRequestInput = z.infer<
  typeof workerCancellationRequestSchema
>;
export type CustomerCancellationRequestInput = z.infer<
  typeof customerCancellationRequestSchema
>;
export type DisputeOpenRequestInput = z.infer<typeof disputeOpenRequestSchema>;
export type DisputeCounterStatementInput = z.infer<
  typeof disputeCounterStatementSchema
>;
export type DisputeAdminDecisionInput = z.infer<
  typeof disputeAdminDecisionSchema
>;
export type JobMediaAttachInput = z.infer<typeof jobMediaAttachSchema>;
