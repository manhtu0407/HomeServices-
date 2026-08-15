import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../..')
const migrations = resolve(root, 'supabase/migrations')
const migrationName = readdirSync(migrations).find((name) =>
  name.endsWith('_bilateral_payment_balance.sql'),
)

describe('bilateral payment balance', () => {
  it('keeps every supported ledger path on the accepted commission terms', () => {
    expect(migrationName).toBeDefined()
    const sql = readFileSync(resolve(migrations, migrationName!), 'utf8')

    expect(sql).toContain('private.resolve_job_commission_terms')
    expect(sql.match(/from private\.resolve_job_commission_terms/g)).toHaveLength(3)
    expect(sql).toContain('public.create_manual_bank_payment_order')
    expect(sql).toContain('public.create_worker_vietqr_payment_intent')
    expect(sql).toContain('public.confirm_worker_cash_payment')
    expect(sql).toContain("new.status = 'approved_by_customer'::public.scope_change_status")
    expect(sql).toContain('worker_commission_rate_bps = v_commission_rate_bps')
  })

  it('ships rollback-only SQL verification for frozen and legacy jobs', () => {
    const verification = readFileSync(
      resolve(root, 'supabase/tests/bilateral_payment_balance_verification.sql'),
      'utf8',
    )

    expect(verification.trimStart().startsWith('-- Rollback-only')).toBe(true)
    expect(verification).toMatch(/\nbegin;[\s\S]*\nrollback;\s*$/)
    expect(verification).toContain('frozen terms drifted')
    expect(verification).toContain('legacy fallback failed')
  })
})
