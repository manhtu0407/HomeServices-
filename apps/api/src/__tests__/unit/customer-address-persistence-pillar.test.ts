import { describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { saveCustomerAddress } from '../../../../../supabase/functions/mobile-api/_shared/domains/customer/address'

export const PILLAR = {
  id: 'P195-customer-address-persistence',
  invariant:
    'saving a customer default address upserts customer_profiles through the service client — the user-scoped client is refused because authenticated is read-only on that table, and an update-only write would report success while affecting zero rows if the customer row were ever missing',
  authority: [
    'supabase/migrations/20260518032000_revoke_authenticated_workflow_dml.sql (authenticated is read-only on customer_profiles; Edge writes through service_role)',
    'supabase/migrations/20260816120000_enforce_customer_profile_invariant.sql (a profiles trigger keeps every customer backed by a customer_profiles row; the upsert stays correct if that row is ever absent)',
    'governance/RULES.md #8 (Data Honesty — no fake data or silent degradation; forbidden: returning success while pretending a write happened)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/customer/address.ts',
  layer: 'unit',
  siblings: ['P13-autonomy-decision-durability', 'P19-job-access-ownership'],
  mutation:
    'replace `workflowDb(ctx)` with `db(ctx)` — the service-client case turns red because the write now lands on the user-scoped client that production refuses; then replace `.upsert({ id: ctx.user.id, default_address })` with `.update({ default_address }).eq("id", ctx.user.id)` — the upsert-not-update case turns red because update is the call the mock recorded, and an update against an absent row would silently affect zero rows. Both were observed',
} as const satisfies PillarManifest

const aggregateRow = {
  member_since: null,
  has_primary_address: true,
  kael_interaction_count: 0,
  completed_service_count: 0,
  preferred_service_count: 0,
  active_service_days: 0,
  active_streak_days: 0,
  positive_review_rate_percent: 0,
  fair_price_service_count: 0,
  price_savings_vnd: 0,
  total_spend_vnd: 0,
  reviewed_service_count: 0,
  protected_value_vnd: 0,
  protected_transaction_count: 0,
  total_transaction_count: 0,
  disputed_transaction_count: 0,
}

function context(options: {
  upsertResult?: { error: { code?: string } | null }
  rpcResult?: { data: Record<string, unknown>[] | null; error: { code?: string } | null }
  role?: string
} = {}) {
  // Service client: the only one production lets write customer_profiles or run the aggregate.
  const upsert = vi.fn(async () => options.upsertResult ?? { data: null, error: null })
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) }))
  const from = vi.fn(() => ({ update, upsert }))
  const rpc = vi.fn(async () => options.rpcResult ?? { data: [aggregateRow], error: null })

  // User-scoped client as production has it: authenticated holds no DML on customer_profiles
  // and no execute on the aggregate, so a double that accepted either would hide the bug.
  const refused = vi.fn(async () => ({
    data: null,
    error: { code: '42501', message: 'permission denied for table customer_profiles' },
  }))
  const userFrom = vi.fn(() => ({ update: refused, upsert: refused }))
  const userRpc = vi.fn(refused)

  const ctx = {
    success: true,
    user: { id: '11111111-1111-4111-8111-111111111111' },
    role: options.role ?? 'customer',
    supabase: { from: userFrom, rpc: userRpc },
    privilegedSupabase: { from, rpc },
  } as never

  return { ctx, from, rpc, update, upsert, userFrom, userRpc }
}

describe('P195 customer address — the write survives production access rules', () => {
  it('upserts through the service client, so a save is neither refused nor silently dropped', async () => {
    const { ctx, from, update, upsert, userFrom } = context()

    await saveCustomerAddress(ctx, { default_address: 'Tòa A, Quận 7' })

    expect(from, pillarWhy(PILLAR, 'the write must target customer_profiles')).toHaveBeenCalledWith('customer_profiles')
    expect(
      upsert,
      pillarWhy(PILLAR, 'the write must not depend on the customer_profiles row already existing'),
    ).toHaveBeenCalledWith({ id: '11111111-1111-4111-8111-111111111111', default_address: 'Tòa A, Quận 7' })
    expect(
      update,
      pillarWhy(PILLAR, 'update() against a missing row affects zero rows while still reporting success'),
    ).not.toHaveBeenCalled()
    expect(
      userFrom,
      pillarWhy(PILLAR, 'authenticated is read-only on customer_profiles, so the user-scoped client would be refused in production'),
    ).not.toHaveBeenCalled()
  })

  it('returns a fresh insights snapshot so the real address-saved signal is immediately consistent', async () => {
    const { ctx, rpc, userRpc } = context()

    await expect(saveCustomerAddress(ctx, { default_address: 'Tòa A, Quận 7' })).resolves.toMatchObject({
      saved_address_count: 1,
    })
    expect(
      rpc,
      pillarWhy(PILLAR, 'Home reads saved_address_count from the same aggregate the write should invalidate'),
    ).toHaveBeenCalledWith('get_customer_profile_insights_aggregate', {
      p_customer_id: '11111111-1111-4111-8111-111111111111',
    })
    expect(
      userRpc,
      pillarWhy(PILLAR, 'the aggregate is service-owned; authenticated has no execute on it'),
    ).not.toHaveBeenCalled()
  })

  it('fails closed when the upsert reports an error, instead of reporting a fake success', async () => {
    const { ctx, rpc } = context({ upsertResult: { error: { code: 'DB_ERROR' } } })

    await expect(
      saveCustomerAddress(ctx, { default_address: 'Tòa A, Quận 7' }),
      pillarWhy(PILLAR, 'a write error must raise, not resolve as if the address were saved'),
    ).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
    expect(
      rpc,
      pillarWhy(PILLAR, 'no fresh snapshot may be read back after a failed write, or the caller sees a state that was never persisted'),
    ).not.toHaveBeenCalled()
  })

  it('refuses a non-customer role before touching the database', async () => {
    const { ctx, from, userFrom } = context({ role: 'worker' })

    await expect(
      saveCustomerAddress(ctx, { default_address: 'Tòa A, Quận 7' }),
    ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN', status: 403 })
    expect(from, pillarWhy(PILLAR, 'a refused actor must never reach the write')).not.toHaveBeenCalled()
    expect(userFrom, pillarWhy(PILLAR, 'a refused actor must not reach the user-scoped client either')).not.toHaveBeenCalled()
  })
})
