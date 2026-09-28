import type { CompensationResponseInput } from '@nestscout/shared'
import { z } from 'zod'

import { api, type ApiResult } from '../api'
import { validatedResult } from './validated-result'

const amount = z.number().int().nonnegative()

const negotiationSchema = z.object({
  id: z.string().min(1),
  case_id: z.string().min(1),
  job_id: z.string().nullable(),
  violation_code: z.string().min(1),
  worker_name: z.string().nullable(),
  status: z.enum(['awaiting_worker', 'awaiting_customer', 'agreed', 'declined', 'expired']),
  current_amount_vnd: amount,
  respond_by: z.string().min(1),
  offers_left: z.number().int().nonnegative(),
  agreed_at: z.string().nullable(),
  payout: z.object({ status: z.enum(['reserved', 'paid']), amount_vnd: amount, paid_at: z.string().nullable() }).nullable(),
  offers: z.array(z.object({
    actor_role: z.enum(['customer', 'worker']),
    action: z.enum(['claim', 'counter', 'accept', 'decline']),
    amount_vnd: amount.nullable(),
    note: z.string().nullable(),
    created_at: z.string().min(1),
  })),
  evidence: z.array(z.object({ path: z.string().min(1), signed_url: z.string().nullable() })),
})

const policySchema = z.object({
  min_vnd: z.number().int().positive(),
  max_vnd: z.number().int().positive(),
  response_days: z.number().int().positive(),
  max_offers: z.number().int().positive(),
})

const customerSchema = z.object({
  policy: policySchema,
  refund_account_ready: z.boolean(),
  items: z.array(z.object({
    case_id: z.string().min(1),
    job_id: z.string().min(1),
    violation_code: z.string().min(1),
    worker_name: z.string().nullable(),
    decided_at: z.string().min(1),
    negotiation: negotiationSchema.nullable(),
  })),
})

const workerSchema = z.object({
  policy: policySchema,
  withdrawable_vnd: amount,
  negotiations: z.array(negotiationSchema),
})

export type CompensationNegotiation = z.infer<typeof negotiationSchema>
export type CompensationPolicy = z.infer<typeof policySchema>
export type CustomerCompensation = z.infer<typeof customerSchema>
export type WorkerCompensation = z.infer<typeof workerSchema>

const encode = encodeURIComponent

export const compensationService = {
  async listForCustomer(accessToken: string): Promise<ApiResult<CustomerCompensation>> {
    return validatedResult(await api.getAuthenticated<unknown>('/me/compensation', accessToken), customerSchema)
  },
  async openClaim(caseId: string, input: { amount_vnd: number; note: string; evidence_paths: string[] }, accessToken: string): Promise<ApiResult<CompensationNegotiation>> {
    return validatedResult(
      await api.postAuthenticated<unknown>(`/me/compensation/cases/${encode(caseId)}`, input, accessToken),
      negotiationSchema,
    )
  },
  async createEvidenceUpload(caseId: string, contentType: 'image/jpeg' | 'image/png', accessToken: string): Promise<ApiResult<{ path: string; token: string }>> {
    return validatedResult(
      await api.postAuthenticated<unknown>(`/me/compensation/cases/${encode(caseId)}/uploads`, { content_type: contentType }, accessToken),
      z.object({ path: z.string().min(1), signed_url: z.string().min(1), token: z.string().min(1) }),
    )
  },
  async respondAsCustomer(negotiationId: string, input: CompensationResponseInput, accessToken: string): Promise<ApiResult<CompensationNegotiation>> {
    return validatedResult(
      await api.postAuthenticated<unknown>(`/me/compensation/${encode(negotiationId)}/response`, input, accessToken),
      negotiationSchema,
    )
  },
  async listForWorker(accessToken: string): Promise<ApiResult<WorkerCompensation>> {
    return validatedResult(await api.getAuthenticated<unknown>('/workers/me/compensation', accessToken), workerSchema)
  },
  async respondAsWorker(negotiationId: string, input: CompensationResponseInput, accessToken: string): Promise<ApiResult<CompensationNegotiation>> {
    return validatedResult(
      await api.postAuthenticated<unknown>(`/workers/me/compensation/${encode(negotiationId)}/response`, input, accessToken),
      negotiationSchema,
    )
  },
}
