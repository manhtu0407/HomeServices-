import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ADMIN_CAPABILITIES } from '@nestscout/shared'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
  type MobileApiServices,
} from '../../../../../supabase/functions/mobile-api/_shared/http'
import { ADMIN_CONTROL_CAPABILITIES } from '../../../../../supabase/functions/mobile-api/_shared/domains/contracts/admin-control'
import { matchRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes'

const root = resolve(__dirname, '../../../../../')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n')

const operatorAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '11111111-1111-4111-8111-111111111111' },
  role: 'admin_operator',
  supabase: {},
}

describe('mobile-api admin control plane', () => {
  it('keeps the client capability vocabulary aligned with the Edge boundary', () => {
    expect(ADMIN_CONTROL_CAPABILITIES).toEqual(ADMIN_CAPABILITIES)
  })

  it('routes operational reads to an owner or capability-scoped Sub Admin', () => {
    expect(matchRoute(new Request('https://edge.test/admin/actor'))).toMatchObject({
      kind: 'admin.actor.get',
      roles: ['admin', 'admin_operator'],
    })
    expect(matchRoute(new Request('https://edge.test/admin/operations'))).toMatchObject({
      kind: 'admin.operations.get',
      roles: ['admin', 'admin_operator'],
    })
    expect(matchRoute(new Request('https://edge.test/admin/worker-applications'))).toMatchObject({
      kind: 'admin.workerApplications.list',
      roles: ['admin', 'admin_operator'],
    })
    expect(matchRoute(new Request('https://edge.test/admin/transactions'))).toMatchObject({
      kind: 'admin.transactions.list',
      roles: ['admin', 'admin_operator'],
    })
    expect(matchRoute(new Request('https://edge.test/admin/workers/worker-1/access', {
      method: 'POST',
    }))).toMatchObject({
      kind: 'admin.workers.access',
      roles: ['admin', 'admin_operator'],
    })
    expect(matchRoute(new Request('https://edge.test/admin/governance/disputes'))).toMatchObject({
      kind: 'admin.governance.disputes',
      roles: ['admin'],
    })
  })

  it('returns the authenticated Admin capability envelope without requiring a section capability', async () => {
    const getAdminActor = vi.fn(async () => ({
      access_level: 'operator' as const,
      capabilities: ['finance.read'] as const,
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => operatorAuth),
      services: { getAdminActor } as unknown as MobileApiServices,
    })

    const response = await handler(new Request('https://edge.test/admin/actor'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      access_level: 'operator',
      capabilities: ['finance.read'],
    })
    expect(getAdminActor).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin_operator' }))
  })

  it('routes additive finance reads and keeps tax approval owner-only', () => {
    expect(matchRoute(new Request('https://edge.test/admin/finance/overview?range=month'))).toMatchObject({
      kind: 'admin.finance.overview',
      roles: ['admin', 'admin_operator'],
    })
    expect(matchRoute(new Request('https://edge.test/admin/finance/transactions?from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-13T00%3A00%3A00.000Z'))).toMatchObject({
      kind: 'admin.finance.transactions',
    })
    expect(matchRoute(new Request('https://edge.test/admin/finance/export.csv?from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-13T00%3A00%3A00.000Z'))).toMatchObject({
      kind: 'admin.finance.export',
    })
    expect(matchRoute(new Request('https://edge.test/admin/finance/tax-policies'))).toMatchObject({
      kind: 'admin.finance.taxPolicies.list',
    })
    expect(matchRoute(new Request('https://edge.test/admin/finance/tax-policies/policy-1/approve', {
      method: 'POST',
    }))).toMatchObject({
      kind: 'admin.finance.taxPolicies.approve',
      policyId: 'policy-1',
      roles: ['admin'],
    })
  })

  it('rejects finance date ranges longer than 366 days before dispatch', async () => {
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => operatorAuth),
      services: {} as MobileApiServices,
    })

    const response = await handler(new Request(
      'https://edge.test/admin/finance/transactions?from=2025-01-01T00%3A00%3A00.000Z&to=2026-08-13T00%3A00%3A00.000Z',
    ))

    expect(response.status).toBe(400)
  })

  it('keeps Sub Admin account changes owner-only while still dispatching an operational read', async () => {
    const getAdminOperations = vi.fn(async () => ({
      actor: { access_level: 'operator', capabilities: ['operations.read'] },
      attention: [],
      audit_events: [],
      flow: [],
      generated_at: '2026-08-08T07:00:00.000Z',
    }))
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => operatorAuth),
      services: { getAdminOperations } as unknown as MobileApiServices,
    })

    const response = await handler(new Request('https://edge.test/admin/operations'))

    expect(response.status).toBe(200)
    expect(getAdminOperations).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin_operator' }))
    expect(matchRoute(new Request('https://edge.test/admin/sub-admins/member-1/access', {
      method: 'POST',
    }))).toMatchObject({
      kind: 'admin.subAdmins.access',
      roles: ['admin'],
    })
    expect(matchRoute(new Request('https://edge.test/admin/manager-nominations/member-1', {
      method: 'POST',
    }))).toMatchObject({
      kind: 'admin.managerNominations.nominate',
      roles: ['admin'],
    })
  })

  it('dispatches owner-only dispute monitoring with validated pagination', async () => {
    const listAdminDisputes = vi.fn(async () => ({
      disputes: [],
      has_more: false,
      next_offset: null,
      total_count: 0,
    }))
    const ownerAuth: MobileApiAuthResult = { ...operatorAuth, role: 'admin' }
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => ownerAuth),
      services: { listAdminDisputes } as unknown as MobileApiServices,
    })

    const response = await handler(new Request('https://edge.test/admin/governance/disputes?limit=8&offset=16'))

    expect(response.status).toBe(200)
    expect(listAdminDisputes).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }), {
      limit: 8,
      offset: 16,
    })
  })

  it('requires a reason before an owner can revoke Sub Admin access', async () => {
    const setAdminSubAdminAccess = vi.fn()
    const ownerAuth: MobileApiAuthResult = { ...operatorAuth, role: 'admin' }
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => ownerAuth),
      services: { setAdminSubAdminAccess } as unknown as MobileApiServices,
    })

    const response = await handler(new Request('https://edge.test/admin/sub-admins/member-1/access', {
      body: JSON.stringify({ action: 'revoke', capabilities: [] }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }))

    expect(response.status).toBe(400)
    expect(setAdminSubAdminAccess).not.toHaveBeenCalled()
  })

  it('accepts a manager nomination only from Owner Admin and dispatches the target account id', async () => {
    const nominateAdminManager = vi.fn(async () => ({
      ok: true,
      nomination: {
        id: 'nomination-1',
        user_id: 'member-1',
        full_name: 'Registered manager',
        phone_masked: '•••• 4422',
        role: 'customer',
        nominated_at: '2026-08-09T05:00:00.000Z',
      },
    }))
    const ownerAuth: MobileApiAuthResult = { ...operatorAuth, role: 'admin' }
    const ownerHandler = createMobileApiHandler({
      authenticate: vi.fn(async () => ownerAuth),
      services: { nominateAdminManager } as unknown as MobileApiServices,
    })
    const operatorHandler = createMobileApiHandler({
      authenticate: vi.fn(async (_request, roles) => roles?.includes(operatorAuth.role)
        ? operatorAuth
        : { success: false as const, error: 'Không có quyền', status: 403 as const }),
      services: { nominateAdminManager } as unknown as MobileApiServices,
    })

    const ownerResponse = await ownerHandler(new Request('https://edge.test/admin/manager-nominations/member-1', { method: 'POST' }))
    const operatorResponse = await operatorHandler(new Request('https://edge.test/admin/manager-nominations/member-1', { method: 'POST' }))

    expect(ownerResponse.status).toBe(200)
    expect(operatorResponse.status).toBe(403)
    expect(nominateAdminManager).toHaveBeenCalledTimes(1)
    expect(nominateAdminManager).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }), 'member-1')
  })

  it('uses the worker payment ledger for a transaction reconciliation and exposes totals for numbered pagination', () => {
    const transactionService = read('supabase/functions/mobile-api/_shared/domains/admin/transactions.ts')
    const payoutService = read('supabase/functions/mobile-api/_shared/domains/admin/payout.ts')

    expect(transactionService).toContain('from("worker_payment_ledger")')
    expect(transactionService).toContain('serializeWorkerPaymentLedger(ledgerResult.data, result.data)')
    expect(transactionService).toContain('total_count: input.query ? null : nonNegativeInteger(result.count)')
    expect(payoutService).toContain('select(PAYOUT_METHOD_SAFE_SELECT, { count: "exact" })')
    expect(payoutService).toContain('select(WITHDRAWAL_SAFE_SELECT, { count: "exact" })')
  })

  it('keeps system monitoring owner-only and sourced from real database records', () => {
    const governanceService = read('supabase/functions/mobile-api/_shared/domains/admin/governance.ts')
    const routes = read('supabase/functions/mobile-api/_shared/http/routes/admin-control-routes.ts')

    expect(routes).toContain('admin.governance.aiCosts')
    expect(routes).toContain('roles: ["admin"]')
    expect(governanceService).toContain('from("disputes")')
    expect(governanceService).toContain('from("price_baselines")')
    expect(governanceService).toContain('from("kael_cost_daily_summary")')
    expect(governanceService).toContain('from("learning_rules")')
    expect(governanceService).toContain('requireOwnerAdmin(ctx)')
  })
})
