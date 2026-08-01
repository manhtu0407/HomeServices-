import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../..')
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8')

describe('customer refund-account persistence schema', () => {
  it('keeps customer payment-method data read-only to clients and excludes the raw account from grants', () => {
    const schema = read('supabase/migrations/20260627143000_customer_payment_methods.sql')
    const authenticatedGrant = schema.split('grant select (')[1]?.split(') on table')[0] ?? ''

    expect(schema).toContain('alter table public.customer_payment_methods enable row level security')
    expect(schema).toContain('create policy "Customers read own payment methods"')
    expect(schema).toContain('using (((select auth.uid()) = customer_id) or private.is_admin())')
    expect(authenticatedGrant).toContain('bank_account_masked')
    expect(authenticatedGrant).not.toMatch(/^\s*bank_account,\s*$/m)
    expect(schema).not.toContain('grant insert on table public.customer_payment_methods to authenticated')
    expect(schema).not.toContain('grant update on table public.customer_payment_methods to authenticated')
    expect(schema).not.toContain('grant delete on table public.customer_payment_methods to authenticated')
  })

  it('uses one locked service-role RPC and never returns raw financial data', () => {
    const migration = read('supabase/migrations/20260728110000_customer_refund_account_atomic.sql')
    const service = read('supabase/functions/mobile-api/_shared/services/customer-refund-account.service.ts')

    expect(migration).toContain('create or replace function public.upsert_customer_refund_payment_method')
    expect(migration).toContain('security definer')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain("v_bank_name := case v_bank_key")
    expect(migration).toContain('revoke all on function public.upsert_customer_refund_payment_method')
    expect(migration).toContain('grant execute on function public.upsert_customer_refund_payment_method')
    expect(migration).not.toMatch(/grant execute[^\n]*to authenticated/i)
    expect(service).toContain('upsert_customer_refund_payment_method')
    expect(service).toContain('bank_account_masked')
    expect(service).not.toContain('console.')
    expect(service).not.toContain('select("*")')
  })
})
