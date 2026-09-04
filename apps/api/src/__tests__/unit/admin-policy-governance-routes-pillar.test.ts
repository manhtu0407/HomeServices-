import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { matchAdminControlRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/admin-control-routes'

export const PILLAR = {
  id: 'P52-admin-policy-governance-routes',
  invariant:
    'The existing owner-only Admin Governance surface exposes explicit preview, draft, maker-checker lifecycle, and governed price-baseline routes without creating a second admin runtime',
  authority: [
    'governance/structures/admin-workflow.md (auditable and reversible Admin controls)',
    'governance/RULES.md #7 (server-side validation and auditability)',
  ],
  target: 'supabase/functions/mobile-api/_shared/http/routes/admin-control-routes.ts',
  layer: 'unit',
  siblings: ['P51-admin-intake-policy-governance'],
  mutation: 'remove an owner-only lifecycle matcher or loosen its role; the route matrix turns red',
} as const satisfies PillarManifest

describe('P52 Admin policy governance routes', () => {
  it.each([
    ['GET', '/admin/governance/intake-policies', 'admin.governance.intakePolicies.list'],
    ['POST', '/admin/governance/intake-policies/preview', 'admin.governance.intakePolicies.preview'],
    ['POST', '/admin/governance/intake-policies/drafts', 'admin.governance.intakePolicies.draft'],
    ['POST', '/admin/governance/intake-policies/policy-1/approve', 'admin.governance.intakePolicies.approve'],
    ['POST', '/admin/governance/intake-policies/policy-1/publish', 'admin.governance.intakePolicies.publish'],
    ['POST', '/admin/governance/intake-policies/policy-1/rollback', 'admin.governance.intakePolicies.rollback'],
    ['GET', '/admin/governance/price-baseline-versions', 'admin.governance.priceBaselineVersions.list'],
    ['POST', '/admin/governance/price-baseline-versions/drafts', 'admin.governance.priceBaselineVersions.draft'],
    ['POST', '/admin/governance/price-baseline-versions/version-1/approve', 'admin.governance.priceBaselineVersions.approve'],
    ['POST', '/admin/governance/price-baseline-versions/version-1/publish', 'admin.governance.priceBaselineVersions.publish'],
    ['POST', '/admin/governance/price-baseline-versions/version-1/rollback', 'admin.governance.priceBaselineVersions.rollback'],
  ])('matches %s %s as an owner-only route', (method, path, kind) => {
    const route = matchAdminControlRoute(path, method)
    expect(route?.kind, pillarWhy(PILLAR, 'the Admin transport must expose the governed action')).toBe(kind)
    expect(route?.roles, pillarWhy(PILLAR, 'policy governance remains Owner-only')).toEqual(['admin'])
  })
})
