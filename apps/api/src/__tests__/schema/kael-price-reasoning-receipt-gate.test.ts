import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'

const root = resolve(__dirname, '../../../../../')
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260811114500_bind_kael_price_reasoning_receipt.sql'),
  'utf8',
)
const databaseTypes = readGeneratedDatabaseTypes()

describe('Kael price reasoning receipt confirmation gate', () => {
  it('requires the exact reviewed receipt inside the atomic confirmation transaction', () => {
    expect(migration).toContain('p_price_reasoning_receipt_id text')
    expect(migration).toContain("'price_reasoning_receipt.v1'")
    expect(migration).toContain("v_price_reasoning_receipt ->> 'receipt_id' <> p_price_reasoning_receipt_id")
    expect(migration).toContain("'MISSING_REASONING_RECEIPT'")
    expect(migration).toContain('for update')
    expect(migration).toContain("'service_package'")
  })

  it('makes the legacy two-argument RPC fail closed and types only the bound call', () => {
    expect(migration).toContain('null::text')
    expect(migration).toContain('grant execute on function public.confirm_kael_chat_atomic(uuid, uuid, text) to service_role')
    expect(databaseTypes).toContain('p_price_reasoning_receipt_id: string')
  })
})
