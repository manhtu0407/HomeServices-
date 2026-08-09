import { z } from "zod";
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
