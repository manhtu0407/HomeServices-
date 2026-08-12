import { z } from "zod";

const CLIENT_REQUEST_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const BANK_CODE = /^[A-Za-z0-9_-]{2,32}$/;

export const manualBankPaymentClaimSchema = z.object({
  transferred_at: z.string().datetime({ offset: true }),
  sending_bank: z.string().trim().toUpperCase().regex(BANK_CODE).optional(),
}).strict();

export const directWorkerPaymentSelectSchema = z.object({
  client_request_id: z.string().trim().regex(CLIENT_REQUEST_ID),
}).strict();

export const directWorkerPaymentResponseSchema = z.object({
  received: z.boolean(),
}).strict();
