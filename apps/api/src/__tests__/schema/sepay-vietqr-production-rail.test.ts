import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../../../../..')
const readIfPresent = (relative: string) => {
  const path = join(root, relative)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

describe('SePay VietQR production payment rail', () => {
  const edgeFunctionPath = 'supabase/functions/sepay-webhook/index.ts'
  const paymentGateMigrationPath = 'supabase/migrations/20260614093000_sepay_vietqr_payment_gate.sql'
  const migrationPath = 'supabase/migrations/20260727153000_sepay_vietqr_webhook_atomic.sql'
  const ledgerMigrationPath = 'supabase/migrations/20260727160000_worker_payment_ledger_commission.sql'
  const edgeFunction = readIfPresent(edgeFunctionPath)
  const paymentGateMigration = readIfPresent(paymentGateMigrationPath)
  const migration = readIfPresent(migrationPath)
  const ledgerMigration = readIfPresent(ledgerMigrationPath)

  it('keeps the public callback behind HMAC verification over bounded raw JSON', () => {
    expect(existsSync(join(root, edgeFunctionPath))).toBe(true)
    expect(edgeFunction).toContain('readJsonTextRequestBounded')
    expect(edgeFunction).toContain('receiveSePayVietQrWebhook')
    expect(edgeFunction).toContain('x-sepay-signature')
    expect(edgeFunction).toContain('x-sepay-timestamp')
    expect(edgeFunction).not.toContain('request.json()')
    expect(edgeFunction).not.toMatch(/console\.(?:log|warn|error)\([^\n]*(?:rawBody|raw_body|payment_transfer_content)/)
  })

  it('has an explicitly configured JWT-free provider boundary only', () => {
    const config = readIfPresent('supabase/config.toml')
    const section = config.split('[functions.sepay-webhook]')[1]?.split('[')[0] ?? ''
    const deno = readIfPresent('supabase/functions/sepay-webhook/deno.json')

    expect(section).toContain('verify_jwt = false')
    expect(deno).toContain('"zod": "npm:zod@4.4.3"')
  })

  it('uses one locked service-role RPC to make provider payment transitions idempotent', () => {
    expect(existsSync(join(root, migrationPath))).toBe(true)
    expect(migration).toContain('create or replace function public.apply_sepay_vietqr_payment_webhook')
    expect(migration).toContain('security definer')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('for update')
    expect(migration).toContain("payment_provider is distinct from 'sepay_vietqr'")
    expect(migration).toContain("payment_status is distinct from 'vietqr_ready'")
    expect(migration).toContain("status is distinct from 'payment_pending'::public.job_status")
    expect(migration).toContain("status = 'paid'")
    expect(migration).toContain('revoke all on function public.apply_sepay_vietqr_payment_webhook')
    expect(migration).toContain('grant execute on function public.apply_sepay_vietqr_payment_webhook')
  })

  it('extends the payment transition into one immutable worker credit and a unique provider identity', () => {
    expect(existsSync(join(root, ledgerMigrationPath))).toBe(true)
    expect(ledgerMigration).toContain('create table if not exists public.worker_payment_ledger')
    expect(ledgerMigration).toContain('create or replace function public.create_worker_vietqr_payment_intent')
    expect(ledgerMigration).toContain('create or replace function public.apply_sepay_vietqr_payment_webhook')
    expect(ledgerMigration).toContain("payment_state = 'available'")
    expect(ledgerMigration).toContain("payment_state = 'on_hold'")
    expect(paymentGateMigration).toContain('create unique index if not exists jobs_payment_code_uidx')
    expect(paymentGateMigration).toContain('create unique index if not exists jobs_sepay_transaction_uidx')
    expect(ledgerMigration).not.toContain('create unique index if not exists jobs_payment_code_key')
    expect(ledgerMigration).toContain('grant execute on function public.create_worker_vietqr_payment_intent')
    expect(ledgerMigration).toContain('grant execute on function public.apply_sepay_vietqr_payment_webhook')
  })
})
