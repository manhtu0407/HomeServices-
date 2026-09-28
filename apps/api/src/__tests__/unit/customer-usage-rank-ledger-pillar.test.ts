import { describe, expect, it, vi } from 'vitest'

import { getCustomerProfileInsights } from '../../../../../supabase/functions/mobile-api/_shared/domains/customer/profile-insights'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P227-customer-usage-rank-ledger',
  invariant:
    'the customer usage rank reads only the membership ledger that paid in-app orders move: Kael chats, reviews and unpaid jobs add nothing, the level and its thresholds come from one server step, and a failed ledger read fails the request instead of showing a zero rank',
  authority: [
    'governance/RULES.md #8',
    'supabase/migrations/20260925113000_customer_membership_ledger.sql',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/customer/profile-insights.ts',
  layer: 'unit',
  siblings: ['P215-customer-membership-ledger-sql', 'P226-customer-invite-rank-report'],
  mutation:
    'feed kael_interaction_count or completed_service_count back into usageRankPoints, or treat a failed membership read as zero points — the busy-but-unpaid or fail-closed case turns red',
} as const satisfies PillarManifest

const CUSTOMER = '11111111-1111-4111-8111-111111111111'

function aggregate(overrides: Record<string, unknown> = {}) {
  return {
    member_since: null, has_primary_address: true, kael_interaction_count: 0, completed_service_count: 0,
    preferred_service_count: 0, active_service_days: 0, active_streak_days: 0, positive_review_rate_percent: 0,
    fair_price_service_count: 0, price_savings_vnd: 0, total_spend_vnd: 0, reviewed_service_count: 0,
    protected_value_vnd: 0, protected_transaction_count: 0, total_transaction_count: 0, disputed_transaction_count: 0,
    ...overrides,
  }
}

function context(membership: { data: unknown; error: unknown }, row = aggregate()) {
  const rpc = vi.fn(async (name: string) => name === 'get_customer_membership_summary'
    ? membership
    : { data: [row], error: null })
  return {
    ctx: { success: true, user: { id: CUSTOMER }, role: 'customer', supabase: { rpc }, privilegedSupabase: { rpc } } as never,
    rpc,
  }
}

describe(`${PILLAR.id}: usage rank from the membership ledger`, () => {
  it('gives a busy customer with no paid in-app order no rank at all', async () => {
    const { ctx } = context({ data: { points: 0 }, error: null }, aggregate({
      kael_interaction_count: 200, completed_service_count: 12, reviewed_service_count: 12, fair_price_service_count: 12,
    }))
    const insights = await getCustomerProfileInsights(ctx)
    expect(insights.usage_rank_points, pillarWhy(PILLAR, 'chats and unpaid work are not points')).toBe(0)
    expect(insights.usage_rank_level).toBe(0)
    expect(insights.usage_rank_next_level_points).toBe(200)
  })

  it('derives the level and both thresholds from the ledger total', async () => {
    const { ctx, rpc } = context({ data: { points: 620 }, error: null })
    const insights = await getCustomerProfileInsights(ctx)
    expect(insights).toMatchObject({
      usage_rank_points: 620,
      usage_rank_level: 4,
      usage_rank_level_floor_points: 600,
      usage_rank_next_level_points: 800,
    })
    expect(rpc).toHaveBeenCalledWith('get_customer_membership_summary', { p_customer_id: CUSTOMER })
  })

  it('caps the level at five with no next threshold and keeps every point', async () => {
    const { ctx } = context({ data: { points: 5000 }, error: null })
    const insights = await getCustomerProfileInsights(ctx)
    expect(insights).toMatchObject({ usage_rank_points: 5000, usage_rank_level: 5, usage_rank_next_level_points: null })
  })

  it('fails the request when the ledger cannot be read', async () => {
    const { ctx } = context({ data: null, error: { code: 'XX000' } })
    await expect(getCustomerProfileInsights(ctx), pillarWhy(PILLAR, 'a missing ledger is not a zero rank')).rejects.toMatchObject({ status: 500 })
  })
})
