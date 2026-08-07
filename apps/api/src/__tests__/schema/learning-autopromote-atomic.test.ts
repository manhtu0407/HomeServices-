import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd(), '../..')
const migrationPath = resolve(root, 'supabase/migrations/20260806124000_harness_learning_provenance.sql')

describe('Harness learning provenance and manual review', () => {
  it('disables automatic rule activation and queues gate-passed candidates for review', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('queue_learning_candidate_manual_review')
    expect(migration).toContain("'MANUAL_REVIEW_REQUIRED'::text")
    expect(migration).toContain("status = 'manual_review'::public.learning_candidate_status")
    expect(migration).toContain('learning_candidate_provenance')
    expect(migration).toContain('learning_rule_dependencies')
    expect(migration).toContain('revoke_learning_rule_with_provenance')
    expect(migration).toContain('admin_review_and_approve_learning_candidate_atomic')
    expect(migration).toContain("revoke all on function public.admin_approve_learning_candidate_atomic(uuid,uuid,text)")
    expect(migration).toContain('grant execute on function public.queue_learning_candidate_manual_review')
    expect(migration).toContain("p_safe_metadata->>'pii_redacted' = 'true'")
    expect(migration).toContain("p_safe_metadata->>'consent_basis' = 'aggregate_only'")
    expect(migration).toContain("dispute.status not in ('communicated', 'resolved')")
    expect(migration).toContain("'EVIDENCE_QUALITY_INSUFFICIENT'::text")
    expect(migration).toContain("'PRIVACY_REVIEW_REQUIRED'::text")
    expect(migration).toContain("'UNRESOLVED_DISPUTE'::text")
  })

  it('routes application learning through the manual-review RPC instead of direct rule writes', () => {
    const edge = readFileSync(resolve(root, 'supabase/functions/mobile-api/_shared/kael/learning/learning-hook.ts'), 'utf8')
    const reference = readFileSync(resolve(root, 'apps/api/src/lib/learning/evidence-gate.ts'), 'utf8')

    expect(edge).toContain('queue_learning_candidate_manual_review')
    expect(reference).toContain("supabase.rpc('queue_learning_candidate_manual_review'")
    expect(edge).not.toContain('client.rpc("auto_promote_learning_candidate_atomic"')
    expect(reference).not.toContain("supabase.rpc('auto_promote_learning_candidate_atomic'")
    expect(reference).not.toContain("supabase.from('learning_rules').insert")
  })

  it('retains the legacy RPC contract only as a fail-closed compatibility boundary', () => {
    const migration = readFileSync(migrationPath, 'utf8')
    const databaseTypes = readFileSync(resolve(root, 'packages/shared/src/types/database.types.ts'), 'utf8')
    expect(migration).toContain('create or replace function public.auto_promote_learning_candidate_atomic')
    expect(databaseTypes).toContain('auto_promote_learning_candidate_atomic: {')
    expect(databaseTypes).toContain('p_candidate_id: string')
  })
})
