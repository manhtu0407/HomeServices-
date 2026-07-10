import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../../../../supabase/migrations/20260710123000_preserve_provider_global_circuit.sql',
  import.meta.url,
)

describe('Kael provider-global circuit success migration', () => {
  it('keeps a provider-wide credit or rate-limit circuit open after a purpose-level success', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('create or replace function public.record_circuit_success')
    expect(sql).toContain('where c.scope = p_scope and c.key = p_key')
    expect(sql).not.toContain("and c.scope = 'provider'")
    expect(sql).toContain("set search_path = ''")
  })
})
