import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../../../../..')
const migrationPath = 'supabase/migrations/20260727160000_worker_payment_ledger_commission.sql'
const paymentGateMigrationPath = 'supabase/migrations/20260614093000_sepay_vietqr_payment_gate.sql'
const read = (relative: string) => readFileSync(join(root, relative), 'utf8')

describe('worker payment ledger and commission policy', () => {
  it('keeps the base worker commission at 15% and allows only configured lower rates for higher tiers', () => {
    expect(existsSync(join(root, migrationPath))).toBe(true)
    const migration = read(migrationPath)

    expect(migration).toContain('create table if not exists public.worker_commission_tiers')
    expect(migration).toContain('commission_rate_bps integer not null check (commission_rate_bps between 0 and 1500)')
    expect(migration).toContain('values (1, 0, 0, 1500, true)')
    expect(migration).toContain('private.enforce_worker_commission_tier_policy')
    expect(migration).toContain('higher tiers must not have a higher commission rate')
    expect(migration).toContain('public.get_worker_current_commission_tier')
    expect(migration).toContain('grant execute on function public.get_worker_current_commission_tier')
    expect(read('packages/shared/src/constants.ts')).toContain('export const PLATFORM_FEE_WORKER = 0.15')
    expect(read('supabase/functions/_shared/contracts/common.ts')).toContain('export const PLATFORM_FEE_WORKER = 0.15;')
  })

  it('creates one private in-app credit per job and makes client-side money mutation impossible', () => {
    const migration = read(migrationPath)

    expect(migration).toContain('create table if not exists public.worker_payment_ledger')
    expect(migration).toContain('job_id uuid not null unique references public.jobs(id) on delete restrict')
    expect(migration).toContain("payment_state text not null check (payment_state in ('pending', 'available', 'on_hold', 'reversed'))")
    expect(migration).toContain('check (gross_amount = platform_fee + worker_net)')
    const paymentGate = read(paymentGateMigrationPath)
    expect(paymentGate).toContain('jobs_payment_code_uidx')
    expect(paymentGate).toContain('jobs_sepay_transaction_uidx')
    expect(migration).not.toContain('create unique index if not exists jobs_payment_code_key')
    expect(migration).toContain('alter table public.worker_payment_ledger enable row level security')
    expect(migration).toMatch(/revoke all on table public\.worker_payment_ledger\s+from anon, authenticated/i)
    expect(migration).toContain('Workers read own payment ledger')
    expect(migration).not.toMatch(/worker_payment_ledger[\s\S]*bank_account/i)
  })

  it('atomically freezes the configured tier at intent creation and credits the worker only after verified payment', () => {
    const migration = read(migrationPath)
    const paymentService = read('supabase/functions/mobile-api/_shared/domains/payment/sepay-vietqr.ts')

    expect(migration).toContain('create or replace function public.create_worker_vietqr_payment_intent')
    expect(migration).toContain('from public.jobs')
    expect(migration).toContain('for update')
    expect(migration).toContain("status is distinct from 'confirmed_by_customer'::public.job_status")
    expect(migration).toContain('private.resolve_worker_commission_tier')
    expect(migration).toContain('worker_commission_rate_bps')
    expect(migration).toContain('legacy SePay payment rows need reconciliation')
    expect(migration).toContain("payment_state = 'available'")
    expect(migration).toContain("payment_state = 'on_hold'")
    expect(migration).toContain('create or replace function public.apply_sepay_vietqr_payment_webhook')
    expect(migration).toContain('from public.worker_payment_ledger')
    expect(migration).toContain('grant execute on function public.create_worker_vietqr_payment_intent')
    expect(paymentService).toContain('client.rpc("create_worker_vietqr_payment_intent"')
    expect(paymentService).toContain('p_expected_gross_amount')
    expect(paymentService).not.toContain('PLATFORM_FEE_WORKER')
    expect(paymentService).not.toContain('.from("jobs")\n       .update(payment)')
  })

  it('serves worker balances from the ledger rather than from mutable job rows', () => {
    const migration = read(migrationPath)

    expect(migration).toContain('create function public.get_worker_earnings_summary(')
    expect(migration).toContain('available_balance bigint')
    expect(migration).toContain('current_commission_rate_bps integer')
    expect(migration).toContain('recent_transactions jsonb')
    expect(migration).toContain('from public.worker_payment_ledger ledger')
    expect(migration).toContain('all_worker_ledger as')
    expect(migration).toContain("ledger.payment_state = 'available'")
    expect(migration).toContain("ledger.payment_state = 'pending'")
  })
})
