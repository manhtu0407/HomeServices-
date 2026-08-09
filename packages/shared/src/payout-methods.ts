import { z } from 'zod'

export const CUSTOMER_PAYMENT_BANK_KEYS = Object.freeze([
  'vietcombank',
  'techcombank',
  'bidv',
  'mbbank',
  'acb',
  'vietinbank',
] as const)

export type CustomerPaymentBankKey = (typeof CUSTOMER_PAYMENT_BANK_KEYS)[number]

export const customerPaymentMethodSaveSchema = z.object({
  bank_key: z.enum(CUSTOMER_PAYMENT_BANK_KEYS),
  bank_name: z.string().trim().min(2).max(100),
  account_holder_name: z.string().trim().min(2).max(200),
  bank_account: z.string().trim().min(6).max(50).regex(/^[0-9A-Za-z]+$/, 'bank_account must contain only letters or digits'),
}).strict()

export const workerPayoutMethodSaveSchema = customerPaymentMethodSaveSchema
  .omit({ bank_name: true })

export const workerWithdrawalRequestCreateSchema = z.object({
  amount_vnd: z.number().int().positive().max(1_000_000_000),
  client_request_id: z.uuidv4(),
}).strict()

export type CustomerPaymentMethodSaveInput = z.infer<typeof customerPaymentMethodSaveSchema>
export type WorkerPayoutMethodSaveInput = z.infer<typeof workerPayoutMethodSaveSchema>
export type WorkerWithdrawalRequestCreateInput = z.infer<typeof workerWithdrawalRequestCreateSchema>
