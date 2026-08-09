import { z } from 'zod'
import { customerPaymentMethodSaveSchema } from './contracts/customer'

export const workerPayoutMethodSaveSchema = customerPaymentMethodSaveSchema
  .omit({ bank_name: true })

export const workerWithdrawalRequestCreateSchema = z.object({
  amount_vnd: z.number().int().positive().max(1_000_000_000),
  client_request_id: z.uuidv4(),
}).strict()

export type WorkerPayoutMethodSaveInput = z.infer<typeof workerPayoutMethodSaveSchema>
export type WorkerWithdrawalRequestCreateInput = z.infer<typeof workerWithdrawalRequestCreateSchema>
