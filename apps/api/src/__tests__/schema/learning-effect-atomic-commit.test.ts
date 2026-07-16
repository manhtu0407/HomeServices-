import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../..')
const migrationsDir = resolve(root, 'supabase/migrations')
const verificationPath = resolve(
  root,
  'supabase/tests/learning_effect_atomic_commit_verification.sql',
)

function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\s+/g, ' ').toLowerCase()
}

function effectMigrationPath(): string | null {
  const name = readdirSync(migrationsDir).find((entry) =>
    entry.endsWith('_atomic_learning_effect_commits.sql')
  )
  return name ? resolve(migrationsDir, name) : null
}

describe('atomic Kael learning effect commits', () => {
  it('keeps candidate, promotion, lifecycle, item, and queue effects in one RPC', () => {
    const path = effectMigrationPath()
    expect(path).not.toBeNull()
    const migration = normalized(path as string)

    expect(migration).toContain('create table private.kael_learning_effect_receipts')
    expect(migration).toContain('function public.commit_kael_learning_effect_atomic')
    expect(migration).toContain('from private.kael_ai_batch_result_claims as claim')
    expect(migration).toContain('for update of item')
    expect(migration).toContain('for update of queue')
    expect(migration).toContain('public.promote_learning_candidate')
    expect(migration).toMatch(
      /alter function public\.promote_learning_candidate\([\s\S]*?\) set search_path = ''/,
    )
    expect(migration).toContain('insert into public.learning_candidates')
    expect(migration).toContain('insert into public.kael_rule_lifecycle_log')
    expect(migration).toContain('update public.kael_ai_batch_items as item')
    expect(migration).toContain('update public.kael_learning_queue as queue')
    expect(migration).toContain('insert into private.kael_learning_effect_receipts')
  })

  it('accepts only exact receipt replays and keeps the RPC service-only', () => {
    const path = effectMigrationPath()
    expect(path).not.toBeNull()
    const migration = normalized(path as string)

    expect(migration).toContain("message = 'learning_effect_replay_conflict'")
    expect(migration).toContain("message = 'learning_effect_replay_corrupt'")
    expect(migration).toContain('receipt.effect_payload is distinct from p_effect_payload')
    expect(migration).toMatch(
      /revoke execute on function public\.commit_kael_learning_effect_atomic\([\s\S]*?\) from public, anon, authenticated/,
    )
    expect(migration).toMatch(
      /grant execute on function public\.commit_kael_learning_effect_atomic\([\s\S]*?\) to service_role/,
    )
  })

  it('replaces the promotion RPC audit row with one canonical lifecycle sequence', () => {
    const path = effectMigrationPath()
    expect(path).not.toBeNull()
    const migration = normalized(path as string)

    expect(migration).toContain("lifecycle.transition_reason = 'promote_learning_candidate'")
    expect(migration).toContain("'evidence_gate_check', 'auto_promoted'")
    expect(migration).toContain("'auto_promoted', 'active'")
  })

  it('keeps a rollback-safe SQL proof for crash, replay, and foreign claims', () => {
    expect(existsSync(verificationPath)).toBe(true)
    const verification = normalized(verificationPath)

    expect(verification).toContain('begin;')
    expect(verification).toContain('rollback;')
    expect(verification).toContain('foreign batch claim committed a learning effect')
    expect(verification).toContain('foreign queue claim committed a learning effect')
    expect(verification).toContain('failed effect left a partial learning candidate')
    expect(verification).toContain('exact learning effect replay created duplicate rows')
    expect(verification).toContain('conflicting learning effect replay was accepted')
    expect(verification).toContain("has_function_privilege( 'anon'")
    expect(verification).toContain("has_function_privilege( 'service_role'")
  })
})
