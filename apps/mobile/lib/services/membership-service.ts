import { z } from 'zod'

import { api, type ApiResult } from '../api'
import { validatedResult } from './validated-result'

export const REFERRAL_CLAIM_OUTCOMES = [
  'LINKED',
  'ALREADY_LINKED',
  'CODE_NOT_FOUND',
  'LINKED_TO_OTHER_WORKER',
  'CLAIM_WINDOW_CLOSED',
  'ALREADY_TRANSACTED',
  'RATE_LIMITED',
  'PROGRAM_UNAVAILABLE',
] as const

export type ReferralClaimOutcome = (typeof REFERRAL_CLAIM_OUTCOMES)[number]

export const INVITE_CLAIM_STATUSES = ['open', 'linked', 'window_closed', 'transacted', 'program_unavailable'] as const

const membershipSchema = z.object({
  points: z.number().int().nonnegative(),
  customer_vnd_per_point: z.number().int().positive().nullable(),
  linked_worker: z.object({
    worker_id: z.string().min(1),
    display_name: z.string().nullable(),
    source: z.enum(['invite_code', 'rebook']),
    expires_at: z.string(),
  }).nullable(),
  // Optional so the app keeps working against an Edge that predates the field.
  invite_claim: z.object({
    status: z.enum(INVITE_CLAIM_STATUSES),
    closes_at: z.string().nullable(),
    claim_days: z.number().int().positive().nullable(),
    link_months: z.number().int().positive().nullable(),
  }).nullable().optional(),
})

export type CustomerMembership = z.infer<typeof membershipSchema>
export type InviteClaimStatus = (typeof INVITE_CLAIM_STATUSES)[number]

export const membershipService = {
  async getMembership(accessToken: string): Promise<ApiResult<CustomerMembership>> {
    return validatedResult(await api.getAuthenticated<unknown>('/me/membership', accessToken), membershipSchema)
  },
  async claimReferralCode(code: string, accessToken: string): Promise<ApiResult<{ outcome: ReferralClaimOutcome }>> {
    return validatedResult(
      await api.postAuthenticated<unknown>('/me/referral-claims', { code }, accessToken),
      z.object({ outcome: z.enum(REFERRAL_CLAIM_OUTCOMES) }),
    )
  },
}
