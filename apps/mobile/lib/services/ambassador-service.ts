import { z } from 'zod'

import { api, type ApiResult } from '../api'
import type {
  AmbassadorRedeemReceiptView,
  WorkerAmbassadorSummary,
} from '../api-types/program'
import { validatedResult } from './validated-result'

const count = z.number().int().nonnegative()
const money = z.number().int().nonnegative()
const isoOrNull = z.string().nullable()

const milestoneSchema = z.object({
  id: z.string().min(1),
  rank: count,
  title_vi: z.string(),
  title_en: z.string(),
  points_required: z.number().int().positive(),
  reward_vnd: money,
})

const summarySchema = z.object({
  program: z.object({
    id: z.string().min(1),
    version: count,
    commission_vnd_per_point: z.number().int().positive(),
    link_months: count,
    network_window_days: count,
    invite_claim_days: count,
    milestones: z.array(milestoneSchema),
    multipliers: z.array(z.object({ min_active_customers: count, multiplier_bps: z.number().int().min(10000) })),
  }).nullable(),
  referral_code: z.string().nullable(),
  points_milli: z.number().int(),
  linked_customers: count,
  active_customers: count,
  multiplier_bps: z.number().int().min(10000),
  redemption_frozen_until: isoOrNull,
  network_frozen_until: isoOrNull,
  tax_policy_ready: z.boolean(),
  recent_entries: z.array(z.object({
    id: z.string().min(1),
    entry_kind: z.enum(['order_accrual', 'accrual_reversal', 'redemption', 'penalty_debit', 'penalty_forfeit', 'appeal_restore', 'admin_correction']),
    points_milli: z.number().int(),
    created_at: z.string(),
  })),
  redemptions: z.array(z.object({
    id: z.string().min(1),
    milestone_id: z.string().min(1),
    reward_vnd: money,
    tax_withheld_vnd: money,
    net_vnd: money,
    created_at: z.string(),
  })),
})

const receiptSchema = z.object({
  redemption_id: z.string().min(1),
  reward_vnd: money,
  tax_withheld_vnd: money,
  net_vnd: money,
  points_left_milli: z.number().int(),
  replayed: z.boolean(),
})

export const ambassadorService = {
  async getSummary(accessToken: string): Promise<ApiResult<WorkerAmbassadorSummary>> {
    return validatedResult(await api.getAuthenticated<unknown>('/workers/me/ambassador', accessToken), summarySchema)
  },
  async ensureReferralCode(accessToken: string): Promise<ApiResult<{ referral_code: string }>> {
    return validatedResult(
      await api.postAuthenticated<unknown>('/workers/me/ambassador/code', {}, accessToken),
      z.object({ referral_code: z.string().regex(/^[A-Z0-9]{8}$/) }),
    )
  },
  async redeem(
    milestoneId: string,
    clientRequestId: string,
    accessToken: string,
  ): Promise<ApiResult<AmbassadorRedeemReceiptView>> {
    return validatedResult(
      await api.postAuthenticatedWithIdempotency<unknown>(
        '/workers/me/ambassador/redemptions',
        { milestone_id: milestoneId, client_request_id: clientRequestId },
        accessToken,
        `mobile:${clientRequestId}`,
      ),
      receiptSchema,
    )
  },
}
