import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd(), '../..')
const migrationPath = resolve(root, 'supabase/migrations/20260714101000_atomic_learning_autopromotion.sql')

describe('atomic learning auto-promotion', () => {
  it('serializes candidate and scope promotion inside one service-role RPC', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('auto_promote_learning_candidate_atomic')
    expect(migration).toContain('for update')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('insert into public.learning_rule_versions')
    expect(migration).toContain("grant execute on function public.auto_promote_learning_candidate_atomic(uuid) to service_role")
    expect(migration).toContain("revoke execute on function public.auto_promote_learning_candidate_atomic(uuid) from authenticated")
  })

  it('routes application auto-promotion through the atomic RPC instead of direct rule writes', () => {
    const source = readFileSync(resolve(root, 'apps/api/src/lib/learning/evidence-gate.ts'), 'utf8')

    expect(source).toContain("supabase.rpc('auto_promote_learning_candidate_atomic'")
    expect(source).not.toContain("supabase.from('learning_rules').insert")
    expect(source).not.toContain("supabase.from('learning_rule_versions').insert")
  })

  it('keeps the generated database contract aware of the RPC', () => {
    const databaseTypes = readFileSync(resolve(root, 'packages/shared/src/types/database.types.ts'), 'utf8')
    expect(databaseTypes).toContain('auto_promote_learning_candidate_atomic: {')
    expect(databaseTypes).toContain('p_candidate_id: string')
  })
})
