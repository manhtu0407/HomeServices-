import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260729210000_customer_account_deletion.sql'),
  'utf8',
)

describe('customer account deletion persistence boundary', () => {
  it('keeps an idempotent request record and locks deleted accounts out of authenticated data', () => {
    expect(migration).toContain('customer_account_deletion_requests')
    expect(migration).toContain('unique (customer_id, client_request_id)')
    expect(migration).toContain('avatar_storage_ref text')
    expect(migration).toContain('v_profile.avatar_url')
    expect(migration).toContain("account_state in ('active', 'deletion_processing', 'deleted')")
    expect(migration).toContain('as restrictive for all to authenticated')
    expect(migration).toContain('private.is_active_account()')
  })

  it('rechecks work, dispute, and payment blockers inside the database transaction', () => {
    expect(migration).toContain('ACCOUNT_DELETION_BLOCKED_ACTIVE_JOB')
    expect(migration).toContain('ACCOUNT_DELETION_BLOCKED_DISPUTE')
    expect(migration).toContain('ACCOUNT_DELETION_BLOCKED_PAYMENT')
    expect(migration).toContain("ledger.payment_state in ('pending', 'on_hold')")
  })

  it('removes direct personal data while retaining a de-identified transaction anchor', () => {
    expect(migration).toContain('delete from public.customer_payment_methods')
    expect(migration).toContain('delete from public.device_push_tokens')
    expect(migration).toContain('delete from public.notifications')
    expect(migration).toContain('delete from public.customer_kael_memory')
    expect(migration).toContain('full_name = null')
    expect(migration).toContain('address_building = null')
    expect(migration).not.toMatch(/delete\s+from\s+public\.profiles/i)
    expect(migration).not.toMatch(/delete\s+from\s+public\.jobs/i)
  })
})
