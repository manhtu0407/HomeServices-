import { z } from "zod";

export const legacyConfirmationRecoverySchema = z.object({
  job_id: z.string().uuid(),
  price_reasoning_receipt_id: z.string().min(8).max(160),
}).strict();

export type EdgeLegacyConfirmationRecoveryInput = z.infer<typeof legacyConfirmationRecoverySchema>;
