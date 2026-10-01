import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
} from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P196-customer-address-http',
  invariant:
    'PATCH /me/address persists exactly one trimmed, bounded default_address for the authenticated Customer and nothing else — a Worker or Admin actor, an unknown field, an empty or oversize value all stop before any customer_profiles write, and a refused write never reads back as saved',
  authority: [
    'governance/RULES.md #0',
    'governance/RULES.md #8',
    'supabase/migrations/20260518032000_revoke_authenticated_workflow_dml.sql (Edge writes customer_profiles through service_role after actor authorization)',
  ],
  target: 'supabase/functions/mobile-api/_shared/http/dispatch/me.ts',
  layer: 'integration',
  siblings: ['P195-customer-address-persistence', 'P116-customer-cancellation-http'],
  mutation:
    'drop `.strict()` from customerAddressSaveSchema — the `id` and `customer_id` cases turn red because the extra key now parses and the request is served; then drop `.trim()` from the same schema — the trimmed-payload case turns red because the padded value is persisted as typed. Both were observed',
} as const satisfies PillarManifest

const CUSTOMER = 'c194abcd-0000-4000-8000-abcdef000001'
const OTHER_CUSTOMER = 'c194abcd-0000-4000-8000-abcdef000002'
const ADDRESS = 'Tòa A, Quận 7'

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

function setup(options: {
  role?: 'customer' | 'worker' | 'admin'
  writeError?: { code: string; message: string }
} = {}) {
  const role = options.role ?? 'customer'
  // Service client: the only one production lets write customer_profiles or run the aggregate.
  const service = makeSequenceClient([], {
    get_customer_profile_insights_aggregate: [{ data: [aggregateRow], error: null }],
    get_customer_membership_summary: [{ data: { points: 0 }, error: null }],
  }, {
    customer_profiles: [{ data: null, error: options.writeError ?? null }],
  })
  // User-scoped client as production has it: authenticated is read-only on customer_profiles.
  const user = makeSequenceClient([], {}, {
    customer_profiles: [{
      data: null,
      error: { code: '42501', message: 'permission denied for table customer_profiles' },
    }],
  })
  const handler = createMobileApiHandler({
    // Mirrors platform/auth.ts: a role outside the route's list is refused unless it is admin.
    authenticate: async (_request, allowedRoles): Promise<MobileApiAuthResult> => {
      if (allowedRoles && !allowedRoles.includes(role) && role !== 'admin') {
        return { success: false, error: 'Bạn không có quyền thực hiện hành động này', status: 403 }
      }
      return {
        success: true,
        user: { id: CUSTOMER },
        role,
        supabase: service,
        privilegedSupabase: service,
        userSupabase: user,
      }
    },
    services: createEdgeServices({}),
  })
  const save = (body: unknown) => handler(new Request('https://edge.test/me/address', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  const wrote = (client: { calls: Array<{ table: string }> }) =>
    client.calls.some((call) => call.table === 'customer_profiles')
  return { save, service, user, wrote }
}

describe('P196 PATCH /me/address — one Customer, one bounded address', () => {
  installEdgeRuntimeTestHooks()

  it('persists the trimmed address for the authenticated Customer through the service client and returns the fresh snapshot', async () => {
    const { save, service, user, wrote } = setup()

    const response = await save({ default_address: `  ${ADDRESS}  ` })
    const body = await response.json()

    expect(response.status, pillarWhy(PILLAR, JSON.stringify(body))).toBe(200)
    expect(body, pillarWhy(PILLAR, 'the response is the insights snapshot read after the write')).toMatchObject({
      customer_id: CUSTOMER,
      saved_address_count: 1,
    })
    expect(
      service.calls.find((call) => call.table === 'customer_profiles')?.operations,
      pillarWhy(PILLAR, 'the row is keyed to the authenticated actor and the value is stored trimmed'),
    ).toContainEqual(['upsert', { id: CUSTOMER, default_address: ADDRESS }])
    expect(
      wrote(user),
      pillarWhy(PILLAR, 'authenticated is read-only on customer_profiles, so the user-scoped client would be refused in production'),
    ).toBe(false)
  })

  it('stores an address of exactly the 300-character bound', async () => {
    const { save, service } = setup()
    const longest = 'x'.repeat(300)

    const response = await save({ default_address: longest })

    expect(response.status, pillarWhy(PILLAR, 'the bound is inclusive')).toBe(200)
    expect(service.calls.find((call) => call.table === 'customer_profiles')?.operations)
      .toContainEqual(['upsert', { id: CUSTOMER, default_address: longest }])
  })

  it.each([
    ['an empty string', { default_address: '' }],
    ['only whitespace', { default_address: '   ' }],
    ['a value over 300 characters', { default_address: 'x'.repeat(301) }],
    ['a missing field', {}],
    ['a non-string value', { default_address: 42 }],
    ['an id naming another customer', { default_address: ADDRESS, id: OTHER_CUSTOMER }],
    ['a customer_id naming another customer', { default_address: ADDRESS, customer_id: OTHER_CUSTOMER }],
    ['a bare string body', ADDRESS],
  ])('refuses %s before any write', async (_name, payload) => {
    const { save, service, user, wrote } = setup()

    const response = await save(payload)

    expect(response.status, pillarWhy(PILLAR, 'the body must satisfy the strict schema exactly')).toBe(400)
    expect(wrote(service), pillarWhy(PILLAR, 'a refused body must never reach the write')).toBe(false)
    expect(wrote(user), pillarWhy(PILLAR, 'nor the user-scoped client')).toBe(false)
  })

  it.each(['worker', 'admin'] as const)('denies a %s actor before any write', async (role) => {
    const { save, service, user, wrote } = setup({ role })

    const response = await save({ default_address: ADDRESS })

    expect(response.status, pillarWhy(PILLAR, `a ${role} actor must not write a Customer address`)).toBe(403)
    expect(wrote(service), pillarWhy(PILLAR, 'a refused actor must never reach the write')).toBe(false)
    expect(wrote(user), pillarWhy(PILLAR, 'nor the user-scoped client')).toBe(false)
  })

  it('reports a refused write as a private server error and never reads a snapshot back as saved', async () => {
    const { save, service } = setup({ writeError: { code: 'XX000', message: 'private connection details' } })

    const response = await save({ default_address: ADDRESS })
    const body = await response.json()

    expect(response.status, pillarWhy(PILLAR, 'a failed write must not resolve as success')).toBe(500)
    expect(body).toMatchObject({ code: 'DB_ERROR' })
    expect(
      JSON.stringify(body),
      pillarWhy(PILLAR, 'database error detail stays server-side'),
    ).not.toContain('private connection details')
    expect(
      service.calls.some((call) => call.table === 'rpc:get_customer_profile_insights_aggregate'),
      pillarWhy(PILLAR, 'reading a snapshot after a failed write would show a state that was never persisted'),
    ).toBe(false)
  })
})
