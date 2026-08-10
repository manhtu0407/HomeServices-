import { z } from "zod";
import { customerPaymentMethodSaveSchema } from "./customer-account-contract.ts";

// The client submits account details once; the database assigns verification
// state and never returns the raw account number to Worker screens.
export const workerPayoutMethodSaveSchema = customerPaymentMethodSaveSchema
  .omit({ bank_name: true });

export const workerWithdrawalRequestCreateSchema = z.object({
  amount_vnd: z.number().int().positive().max(1_000_000_000),
  client_request_id: z.uuidv4(),
}).strict();

export type WorkerPayoutMethodSaveRequest = z.infer<
  typeof workerPayoutMethodSaveSchema
>;
export type EdgeWorkerWithdrawalRequestCreateInput = z.infer<
  typeof workerWithdrawalRequestCreateSchema
>;
