import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../../../../..')
const migrationPath = 'supabase/migrations/20260729153000_worker_cash_commission_settlement.sql'

describe('worker cash commission settlement', () => {
  it('keeps cash collection separate from credited payout balance and makes it immutable', () => {
    const path = join(root, migrationPath)
    expect(existsSync(path)).toBe(true)

    const migration = readFileSync(path, 'utf8')
    expect(migration).toContain('create table if not exists public.worker_cash_commission_ledger')
    expect(migration).toContain('job_id uuid not null unique references public.jobs(id) on delete restrict')
    expect(migration).toContain('cash_commission_collected integer not null check (cash_commission_collected >= 0)')
    expect(migration).toContain('cash_commission_due integer not null check (cash_commission_due >= 0)')
    expect(migration).toContain('check (cash_commission_collected + cash_commission_due = platform_fee)')
    expect(migration).toContain('private.protect_worker_cash_commission_ledger_amounts')
    expect(migration).toContain('create table if not exists public.worker_cash_commission_reconciliations')
    expect(migration).toContain('cash_commission_ledger_id uuid not null references public.worker_cash_commission_ledger(id) on delete restrict')
    expect(migration).toContain('private.protect_worker_cash_commission_reconciliation')
    expect(migration).toContain('alter table public.worker_cash_commission_ledger enable row level security')
    expect(migration).toContain('alter table public.worker_cash_commission_reconciliations enable row level security')
    expect(migration).toMatch(/revoke all on table public\.worker_cash_commission_ledger\s+from anon, authenticated/i)
  })

  it('uses one locked server-side operation for the assigned worker and preserves an insufficient-balance debt', () => {
    const migration = readFileSync(join(root, migrationPath), 'utf8')

    expect(migration).toContain('create or replace function public.confirm_worker_cash_payment')
    expect(migration).toContain('perform pg_advisory_xact_lock')
    expect(migration).toContain('for update')
    expect(migration).toContain("v_job.status is distinct from 'confirmed_by_customer'::public.job_status")
    expect(migration).toContain("payment_provider = 'cash'")
    expect(migration).toContain("payment_status = 'cash_confirmed'")
    expect(migration).toContain("status = 'paid'::public.job_status")
    expect(migration).toContain('least(v_platform_fee, v_available_balance)')
    expect(migration).toContain('cash_commission_due')
    expect(migration).toContain("'cash_payment_confirmed'")
    expect(migration).toContain('v_reconciled_cash_debits')
    expect(migration).toContain('grant execute on function public.confirm_worker_cash_payment')
  })

  it('subtracts collected cash commission from the worker in-app balance without manufacturing a cash credit', () => {
    const migration = readFileSync(join(root, migrationPath), 'utf8')

    expect(migration).toContain('cash_commission_collected_total bigint')
    expect(migration).toContain('cash_commission_due_total bigint')
    expect(migration).toContain('from public.worker_cash_commission_ledger cash_ledger')
    expect(migration).toContain('sum(cash_commission_collected)')
    expect(migration).toContain('sum(cash_commission_due)')
    expect(migration).toContain('available_credits')
    expect(migration).toContain('cash_commission_collected_total')
    expect(migration).toContain('private.reconcile_worker_cash_commission')
    expect(migration).toContain('worker_payment_ledger_reconcile_cash_commission')
    expect(migration).toContain("'cash_reconciliation_due'::text")
  })
})
