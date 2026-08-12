import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'

const root = resolve(process.cwd(), '../..')

describe('Harness learning provenance and manual review', () => {
  // Both runtimes previously had a path that wrote learning_rules directly.
  // These negative assertions are what stop either one coming back.
  it('routes application learning through the manual-review RPC instead of direct rule writes', () => {
    const edge = readFileSync(resolve(root, 'supabase/functions/mobile-api/_shared/kael/learning/learning-hook.ts'), 'utf8')
    const reference = readFileSync(resolve(root, 'apps/api/src/lib/learning/evidence-gate.ts'), 'utf8')

    expect(edge).toContain('queue_learning_candidate_manual_review')
    expect(reference).toContain('queue_learning_candidate_manual_review')
    expect(edge).not.toContain('client.rpc("auto_promote_learning_candidate_atomic"')
    expect(reference).not.toContain("supabase.rpc('auto_promote_learning_candidate_atomic'")
    expect(reference).not.toContain("supabase.from('learning_rules').insert")
  })

  it('retains the legacy RPC in the generated surface as a compatibility boundary', () => {
    const databaseTypes = readGeneratedDatabaseTypes()

    expect(databaseTypes).toContain('auto_promote_learning_candidate_atomic: {')
    expect(databaseTypes).toContain('p_candidate_id: string')
  })
})
