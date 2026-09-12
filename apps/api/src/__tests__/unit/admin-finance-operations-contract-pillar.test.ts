import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  adminFinanceBalanceSnapshotSchema,
  adminFinanceTransactionListQuerySchema,
  adminFinanceExportQuerySchema,
  adminPaymentReconciliationDecisionSchema,
} from '../../../../../supabase/functions/mobile-api/_shared/http/routes/admin-finance-contract'
import {
  adminWithdrawalRequestListQuerySchema,
  adminWithdrawalRequestResolveSchema,
} from '../../../../../supabase/functions/mobile-api/_shared/http/routes/admin-payout-contract'
import { matchAdminControlRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/admin-control-routes'

export const PILLAR = {
  id: 'P51-admin-finance-operations-contract',
  invariant:
    'Admin Finance money mutations are versioned and idempotent, paid withdrawals require explicit external-transfer confirmation, and every approved detail or release route is reachable',
  authority: [
    'user-approved Admin Finance Production completion plan',
    'governance/RULES.md #4 (money mutations are server-authoritative and idempotent)',
    'governance/RULES.md #9 (bank data stays behind audited access)',
  ],
  target:
    'supabase/functions/mobile-api/_shared/http/routes/admin-finance-contract.ts; supabase/functions/mobile-api/_shared/http/routes/admin-payout-contract.ts; supabase/functions/mobile-api/_shared/http/routes/admin-control-routes.ts',
  layer: 'security-negative',
  siblings: ['P34-admin-finance-bank-reference', 'P48-admin-finance-overview-contract'],
  mutation:
    'remove expected_version or client_request_id from a money schema, or allow paid without external_transfer_confirmed — the corresponding parser assertion turns red',
} as const satisfies PillarManifest

const requestId = 'c2f2d727-3809-4e16-b31c-9a9d98302819'

describe('Admin Finance money-operation contracts', () => {
  it('accepts cancelled-history filters without inventing a refunded status', () => {
    for (const schema of [adminFinanceTransactionListQuerySchema, adminFinanceExportQuerySchema]) {
      expect(schema.safeParse({ range: 'month', status: 'paid' }).success).toBe(true)
      expect(schema.safeParse({ range: 'month', status: 'cancelled' }).success).toBe(true)
      expect(schema.safeParse({ range: 'month', status: 'refunded' }).success).toBe(false)
    }
  })

  it('requires optimistic concurrency and idempotency for reconciliation decisions', () => {
    const parsed = adminPaymentReconciliationDecisionSchema.safeParse({
      amount_received: 450_000,
      bank_reference: 'VCB-998877',
      credited_at: '2026-08-25T08:00:00.000+07:00',
      decision: 'confirm',
    })

    expect(parsed.success, pillarWhy(PILLAR, 'a decision without expected_version and client_request_id must fail closed')).toBe(false)
    expect(adminPaymentReconciliationDecisionSchema.safeParse({
      amount_received: 450_000,
      bank_reference: 'VCB-998877',
      client_request_id: requestId,
      credited_at: '2026-08-25T08:00:00.000+07:00',
      decision: 'confirm',
      expected_version: 2,
    }).success).toBe(true)
  })

  it('requires explicit confirmation that a paid withdrawal was transferred outside NestScout', () => {
    expect(adminWithdrawalRequestResolveSchema.safeParse({
      client_request_id: requestId,
      decision: 'paid',
      expected_version: 3,
      transfer_reference: 'VCB-PAID-1234',
    }).success, pillarWhy(PILLAR, 'a reference alone does not prove the operator acknowledged the external transfer')).toBe(false)

    expect(adminWithdrawalRequestResolveSchema.safeParse({
      client_request_id: requestId,
      decision: 'paid',
      expected_version: 3,
      external_transfer_confirmed: true,
      transfer_reference: 'VCB-PAID-1234',
    }).success).toBe(true)
  })

  it('keeps the withdrawal assignment filter closed and explicit', () => {
    expect(adminWithdrawalRequestListQuerySchema.parse({}).assignment).toBe('all')
    expect(adminWithdrawalRequestListQuerySchema.safeParse({ assignment: 'mine' }).success).toBe(true)
    expect(adminWithdrawalRequestListQuerySchema.safeParse({ assignment: 'another_operator' }).success).toBe(false)
  })

  it('requires an idempotency key for observed bank snapshots', () => {
    expect(adminFinanceBalanceSnapshotSchema.safeParse({
      balance_vnd: 1_000_000,
      observed_at: '2026-08-25T08:00:00.000+07:00',
    }).success).toBe(false)
    expect(adminFinanceBalanceSnapshotSchema.safeParse({
      balance_vnd: 1_000_000,
      client_request_id: requestId,
      observed_at: '2026-08-25T08:00:00.000+07:00',
    }).success).toBe(true)
  })

  it.each([
    ['GET', '/admin/payment-reconciliations/payment-1', 'admin.paymentReconciliations.detail'],
    ['POST', '/admin/payment-reconciliations/payment-1/claim', 'admin.paymentReconciliations.claim'],
    ['POST', '/admin/payment-reconciliations/payment-1/release', 'admin.paymentReconciliations.release'],
    ['POST', '/admin/payout-methods/method-1/sensitive-access', 'admin.payoutMethods.sensitiveAccess'],
    ['POST', '/admin/withdrawal-requests/request-1/release', 'admin.withdrawalRequests.release'],
    ['POST', '/admin/withdrawal-requests/request-1/sensitive-access', 'admin.withdrawalRequests.sensitiveAccess'],
    ['GET', '/admin/finance/transactions/job-1', 'admin.finance.transactionDetail'],
    ['GET', '/admin/finance/balance-snapshots', 'admin.finance.balanceSnapshots'],
    ['GET', '/admin/finance/tax-policies/policy-1', 'admin.finance.taxPolicies.detail'],
  ] as const)('matches %s %s', (method, path, kind) => {
    expect(matchAdminControlRoute(path, method)?.kind, pillarWhy(PILLAR, `route ${method} ${path}`)).toBe(kind)
  })
})
