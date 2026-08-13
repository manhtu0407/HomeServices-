import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../..')
const verificationPath = resolve(root, 'supabase/tests/worker_manual_payouts_verification.sql')
const workerServicePath = resolve(root, 'supabase/functions/mobile-api/_shared/domains/worker/payout.ts')
const adminServicePath = resolve(root, 'supabase/functions/mobile-api/_shared/domains/admin/payout.ts')

const read = (path: string) => readFileSync(path, 'utf8')

describe('worker manual payout persistence', () => {
  it('keeps raw account numbers out of list serializers and loads them only in processing-detail paths', () => {
    const workerService = read(workerServicePath)
    const adminService = read(adminServicePath)
    const workerPayoutColumns = workerService.slice(
      workerService.indexOf('const PAYOUT_METHOD_COLUMNS'),
      workerService.indexOf('const WITHDRAWAL_REQUEST_COLUMNS'),
    )
    const adminPayoutSafeColumns = adminService.slice(
      adminService.indexOf('const PAYOUT_METHOD_SAFE_SELECT'),
      adminService.indexOf('const PAYOUT_METHOD_DETAIL_SELECT'),
    )
    const adminWithdrawalSafeColumns = adminService.slice(
      adminService.indexOf('const WITHDRAWAL_SAFE_SELECT'),
      adminService.indexOf('const WITHDRAWAL_DETAIL_SELECT'),
    )

    expect(workerPayoutColumns).toContain('bank_account_masked')
    expect(workerPayoutColumns).not.toMatch(/["']bank_account["']/)
    expect(adminPayoutSafeColumns).toContain('bank_account_masked')
    expect(adminPayoutSafeColumns).not.toContain('account_holder_name')
    expect(adminPayoutSafeColumns).not.toMatch(/"bank_account"/)
    expect(adminWithdrawalSafeColumns).toContain('bank_account_masked')
    expect(adminWithdrawalSafeColumns).not.toContain('account_holder_name')
    expect(adminWithdrawalSafeColumns).not.toMatch(/"bank_account"/)
    expect(adminService).toContain('await requireAdminCapability(ctx, "payouts.process")')
    expect(adminService).not.toContain('console.')
  })

  // The RLS, grant, and immutability claims are settled by database-controls
  // running this script against Postgres. Only its rollback discipline survives
  // execution, since committing does not fail the run.
  it('ships rollback-only database verification for RLS, service grants, immutability, and payout controls', () => {
    expect(existsSync(verificationPath)).toBe(true)
    const verification = read(verificationPath)

    expect(verification.trimStart()).toMatch(/^begin;/i)
    expect(verification.trimEnd()).toMatch(/rollback;$/i)
    expect(verification).toContain('direct client access is granted')
    expect(verification).toContain('locked-down definer function')
    expect(verification).toContain('financial snapshot trigger is missing')
    expect(verification).toContain('payout processing capability')
  })
})
