import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { matchRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes'
import { dispatchAdminRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/dispatch/admin'
import {
  adminSubAdminAccessSchema,
  parseAdminSubAdminListQuery,
} from '../../../../../supabase/functions/mobile-api/_shared/http/routes/admin-control-contract'
import {
  adminSystemMutationSchema,
  parseAdminSystemListQuery,
} from '../../../../../supabase/functions/mobile-api/_shared/http/routes/admin-system-contract'

export const PILLAR = {
  id: 'P53-admin-team-system-contract',
  invariant:
    'System read and manage capabilities protect four dedicated keyset-paginated workspaces, and every System mutation is versioned, idempotent and receipt based',
  authority: [
    'user-approved Team and System implementation plan',
    'governance/RULES.md #0 (workflow-sensitive access stays behind mobile-api)',
    'governance/RULES.md #8 (Production data remains honest)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/admin/system.ts; supabase/functions/mobile-api/_shared/http/routes/admin-control-routes.ts',
  layer: 'security-negative',
  siblings: ['P18-capability-registry-parity', 'P44-admin-production-sections'],
  mutation:
    'restore finance.read on a System handler or remove expected-version/idempotency validation — the authorization and mutation assertions turn red',
} as const satisfies PillarManifest

const root = resolve(__dirname, '../../../../../')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

describe('Admin Team and System route contract', () => {
  it.each([
    ['/admin/system/price-baselines', 'admin.system.priceBaselines.list'],
    ['/admin/system/taxonomy', 'admin.system.taxonomy.list'],
    ['/admin/system/learning-rules', 'admin.system.learningRules.list'],
    ['/admin/system/model-health', 'admin.system.modelHealth.list'],
  ] as const)('allows active Admin actors to read %s', (path, kind) => {
    expect(matchRoute(new Request(`https://edge.test${path}`))).toMatchObject({
      kind,
      method: 'GET',
      roles: ['admin', 'admin_operator'],
    })
  })

  it('registers only the approved System mutation surface', () => {
    expect(matchRoute(new Request('https://edge.test/admin/system/price-baselines/validate', { method: 'POST' }))).toMatchObject({ kind: 'admin.system.priceBaselines.validate' })
    expect(matchRoute(new Request('https://edge.test/admin/system/price-baselines/versions', { method: 'POST' }))).toMatchObject({ kind: 'admin.system.priceBaselines.publish' })
    expect(matchRoute(new Request('https://edge.test/admin/system/price-baselines/baseline-1/retire', { method: 'POST' }))).toMatchObject({ kind: 'admin.system.priceBaselines.retire', baselineId: 'baseline-1' })
    expect(matchRoute(new Request('https://edge.test/admin/system/taxonomy/electrical', { method: 'PUT' }))).toMatchObject({ kind: 'admin.system.taxonomy.update', serviceType: 'electrical' })
    expect(matchRoute(new Request('https://edge.test/admin/system/learning-rules/rule-1/rollback', { method: 'POST' }))).toMatchObject({ kind: 'admin.system.learningRules.rollback', ruleId: 'rule-1' })
    expect(matchRoute(new Request('https://edge.test/admin/system/model-health', { method: 'POST' }))).toBeNull()
  })

  it('dispatches a System route through the Admin control workspace', async () => {
    let called = false
    const response = await dispatchAdminRoute(
      { kind: 'admin.system.taxonomy.list', method: 'GET', roles: ['admin', 'admin_operator'] },
      new Request('https://edge.test/admin/system/taxonomy'),
      {} as never,
      {
        listAdminSystemTaxonomy: async () => {
          called = true
          return { generated_at: '2026-08-26T00:00:00.000Z', data_quality: 'unavailable', summary: { canonical_service_count: 0, active_problem_count: 0, inactive_problem_count: 0, missing_baseline_count: 0 }, records: [], has_more: false, next_cursor: null, next_offset: null }
        },
      } as never,
    )

    expect(called).toBe(true)
    expect(response).toMatchObject({ data_quality: 'unavailable', records: [], next_cursor: null })
  })

  it('uses dedicated System capabilities and allowlisted DTOs', () => {
    const system = read('supabase/functions/mobile-api/_shared/domains/admin/system.ts')
    expect(system, pillarWhy(PILLAR, 'System reads do not borrow finance access')).toContain('requireAdminCapability(ctx, "system.read")')
    expect(system).toContain('requireAdminCapability(ctx, "system.manage")')
    expect(system).not.toContain('requireAdminCapability(ctx, "finance.read")')
    expect(system).not.toMatch(/return\s*\{\s*\.\.\.row/)
    expect(read('packages/shared/src/constants.ts')).toContain("'system.read'")
    expect(read('packages/shared/src/constants.ts')).toContain("'system.manage'")
    expect(system).toContain('listAdminSystemEvidencePackages')
    expect(system).toMatch(/listAdminSystemEvidencePackages[\s\S]*requireAdminCapability\(ctx, "system\.manage"\)/)
    expect(read('supabase/functions/mobile-api/_shared/domains/contracts/admin-system.ts')).not.toContain('package_hash:')
  })

  it('keeps model health observational and strips sensitive evidence internals', () => {
    const model = read('supabase/functions/mobile-api/_shared/domains/admin/system-model-health.ts')
    const price = read('supabase/functions/mobile-api/_shared/domains/admin/system-price.ts')

    expect(model).not.toMatch(/\bfetch\s*\(/)
    expect(model).not.toMatch(/prompt|response_body|api_key|secret/i)
    expect(price).not.toContain('package_hash')
    expect(price).not.toContain('raw_storage')
  })

  it('bounds System keyset pagination and validates common mutation guards', () => {
    const parsed = parseAdminSystemListQuery(new URL('https://edge.test/admin/system/price-baselines?limit=20&cursor=eyJpZCI6IjEifQ==&query=dien'))
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toMatchObject({ cursor: 'eyJpZCI6IjEifQ==', limit: 20, query: 'dien' })
    expect(parseAdminSystemListQuery(new URL('https://edge.test/admin/system/price-baselines?limit=51')).success).toBe(false)

    expect(adminSystemMutationSchema.safeParse({
      client_request_id: 'f6600000-0000-4000-8000-000000000002',
      expected_version: 2,
      reason: 'Cập nhật theo bằng chứng đã xác minh.',
    }).success).toBe(true)
    expect(adminSystemMutationSchema.safeParse({ expected_version: 2, reason: 'Thiếu khóa.' }).success).toBe(false)
  })

  it('requires optimistic concurrency and an idempotency key for Team access mutations', () => {
    const valid = adminSubAdminAccessSchema.safeParse({
      action: 'update',
      capabilities: ['finance.read', 'team.read'],
      client_request_id: 'f6600000-0000-4000-8000-000000000001',
      expected_version: 3,
    })

    expect(valid.success, pillarWhy(PILLAR, 'a versioned idempotent Owner mutation is accepted')).toBe(true)
    expect(adminSubAdminAccessSchema.safeParse({
      action: 'update',
      capabilities: ['finance.read', 'team.read'],
      expected_version: 3,
    }).success).toBe(false)
    expect(adminSubAdminAccessSchema.safeParse({
      action: 'update',
      capabilities: ['finance.read', 'team.read'],
      client_request_id: 'f6600000-0000-4000-8000-000000000001',
    }).success).toBe(false)
  })

  it('bounds Team pagination and keeps the cursor contract keyset-based', () => {
    const parsed = parseAdminSubAdminListQuery(new URL('https://edge.test/admin/sub-admins?limit=25&cursor=dGVzdA=='))
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data).toEqual({ cursor: 'dGVzdA==', limit: 25 })

    expect(parseAdminSubAdminListQuery(new URL('https://edge.test/admin/sub-admins?limit=101')).success).toBe(false)
    const control = read('supabase/functions/mobile-api/_shared/domains/admin/control.ts')
    expect(control).toContain('.order("updated_at", { ascending: false })')
    expect(control).toContain('.order("user_id", { ascending: false })')
    expect(control).toContain('next_cursor: hasMore && lastAccount ? encodeSubAdminCursor(lastAccount) : null')
  })
})
