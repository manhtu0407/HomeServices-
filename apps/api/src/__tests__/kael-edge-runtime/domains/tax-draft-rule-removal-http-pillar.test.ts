import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
} from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P285-tax-rule-removal-refused-http',
  invariant:
    'when a tax policy draft save leaves out a rule the draft already holds, the admin gets a 409 telling them to start a new draft, never a 500 that reads as a server fault',
  authority: [
    'governance/RULES.md #8',
    'supabase/migrations/20260928112000_ambassador_points_and_redemptions.sql',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/admin/finance.ts',
  layer: 'integration',
  siblings: ['P283-tax-draft-rules-edit-in-place-sql'],
  mutation:
    'delete the TAX_RULE_REMOVAL_NEEDS_NEW_DRAFT branch from updateAdminFinanceTaxPolicyDraft — the refusal falls through to DB_ERROR 500 and the status assertion turns red',
} as const satisfies PillarManifest

const OPERATOR = 'a2850000-0000-4000-8000-000000000001'
const POLICY = 'a2850000-0000-4000-8000-000000000101'

const draft = {
  name: 'Thuế thưởng thợ',
  rules: [{ tax_type: 'pit_bonus', subject: 'worker', basis: 'worker_bonus', rate_bps: 1000, applies_at_or_above_vnd: 2000000 }],
  effective_from: '2030-01-01',
  source_reference: 'Kế toán xác nhận',
}

function setup(rpcError: { code: string; message: string }) {
  const service = makeSequenceClient([], {
    admin_update_finance_tax_policy_draft: [{ data: null, error: rpcError }],
  }, {
    admin_operator_accounts: [{ data: { capabilities: ['finance.read', 'finance.tax.manage'], status: 'active' }, error: null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async (): Promise<MobileApiAuthResult> => ({
      success: true, user: { id: OPERATOR }, role: 'admin_operator', supabase: service, privilegedSupabase: service,
    }),
    services: createEdgeServices({}),
  })
  return () => handler(new Request(`https://edge.test/admin/finance/tax-policies/${POLICY}/draft`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'mobile:11111111-1111-4111-8111-111111111111' },
    body: JSON.stringify(draft),
  }))
}

describe(`${PILLAR.id}: removing a saved tax rule`, () => {
  installEdgeRuntimeTestHooks()

  it('answers 409 with a way forward', async () => {
    const response = await setup({ code: 'P0001', message: 'TAX_RULE_REMOVAL_NEEDS_NEW_DRAFT' })()
    expect(response.status, pillarWhy(PILLAR, 'a refused removal is a conflict, not a server fault')).toBe(409)
    expect(await response.json(), pillarWhy(PILLAR, 'the admin is told to start a new draft')).toMatchObject({
      code: 'INVALID_STATUS',
      error: expect.stringContaining('bản nháp mới'),
    })
  })

  it('keeps other database failures as 500', async () => {
    const response = await setup({ code: 'XX000', message: 'boom' })()
    expect(response.status, pillarWhy(PILLAR, 'only the named refusal is downgraded')).toBe(500)
  })
})
