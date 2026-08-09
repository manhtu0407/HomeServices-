import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../..')
const migrationPath = resolve(root, 'supabase/migrations/20260808205000_worker_manual_payouts.sql')
const verificationPath = resolve(root, 'supabase/tests/worker_manual_payouts_verification.sql')
const workerServicePath = resolve(root, 'supabase/functions/mobile-api/_shared/services/worker-payout.service.ts')
const adminServicePath = resolve(root, 'supabase/functions/mobile-api/_shared/services/admin-payout.service.ts')

const read = (path: string) => readFileSync(path, 'utf8')

describe('worker manual payout persistence', () => {
  it('keeps raw payout data in RLS-protected service-only tables', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = read(migrationPath)

    for (const table of ['worker_payout_methods', 'worker_withdrawal_requests']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`)
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated`)
      expect(sql).toContain(`grant all on table public.${table} to service_role`)
    }
    expect(sql).toContain('worker_withdrawal_requests_snapshot_immutable')
    expect(sql).toContain('worker withdrawal request financial snapshot is immutable')
  })

  it('serializes balance reservation and payout resolution through locked service-only RPCs', () => {
    const sql = read(migrationPath)
    const functions = [
      'upsert_worker_payout_method(uuid, text, text, text)',
      'create_worker_withdrawal_request(uuid, integer, uuid)',
      'admin_review_worker_payout_method_atomic(uuid, uuid, text, text)',
      'admin_claim_worker_withdrawal_atomic(uuid, uuid)',
      'admin_resolve_worker_withdrawal_atomic(uuid, uuid, text, text, text)',
    ]

    for (const signature of functions) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated`)
      expect(sql).toContain(`grant execute on function public.${signature} to service_role`)
    }
    expect(sql.match(/security definer/g)?.length).toBeGreaterThanOrEqual(functions.length)
    expect(sql.match(/set search_path = ''/g)?.length).toBeGreaterThanOrEqual(functions.length)
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain("request.status in ('pending', 'processing', 'paid')")
    expect(sql).toContain("filter (where request.status in ('pending', 'processing'))")
    expect(sql).toContain("filter (where request.status = 'paid')")
    expect(sql).toContain("v_request.status <> 'processing'")
    expect(sql).toContain("'payouts.process' = any(operator_account.capabilities)")
  })

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
