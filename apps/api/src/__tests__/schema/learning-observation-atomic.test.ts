import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../..')
const migrationPath = resolve(
  root,
  'supabase/migrations/20260714102000_atomic_learning_observations.sql',
)
const verificationPath = resolve(
  root,
  'supabase/tests/learning_observations_atomic_verification.sql',
)

function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\s+/g, ' ').toLowerCase()
}

describe('atomic learning observation migration', () => {
  it('owns retry receipts and one pending candidate per learning scope', () => {
    const migration = normalized(migrationPath)

    expect(migration).toContain('create table public.learning_observation_receipts')
    expect(migration).toMatch(/unique\s*\(\s*job_id\s*,\s*candidate_type\s*\)/)
    expect(migration).toContain('create unique index learning_candidates_pending_scope_unique')
    expect(migration).toContain("candidate_type in ('price_prior_update', 'analysis_rule')")
    expect(migration).toContain("status in ('created', 'pending_evidence')")
    expect(migration).toContain('enable row level security')
  })

  it('serializes the full observation write set in a service-role-only RPC', () => {
    const migration = normalized(migrationPath)

    expect(migration).toContain('function public.record_learning_observation_atomic')
    expect(migration).toContain('security definer')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('for update')
    expect(migration).toContain('on conflict (job_id, candidate_type) do nothing')
    expect(migration).toContain('revoke execute on function public.record_learning_observation_atomic')
    expect(migration).toContain('from anon')
    expect(migration).toContain('from authenticated')
    expect(migration).toContain('grant execute on function public.record_learning_observation_atomic')
    expect(migration).toContain('to service_role')
  })

  it('admits only the canonical product taxonomy into learning tag aggregates', () => {
    const migration = normalized(migrationPath)

    expect(migration).toContain('v_safe_review_tags')
    expect(migration).toContain("'đúng giờ'")
    expect(migration).toContain("'chuyên nghiệp'")
    expect(migration).toContain("'sạch sẽ'")
    expect(migration).toContain("'giải thích rõ'")
    expect(migration).toContain("'giá hợp lý'")
    expect(migration).toContain("candidate.suggested_payload#>'{observed,common_tags}'")
    expect(migration).toContain('v_seed_payload')
    expect(migration).toContain('where tag = any(v_allowed_review_tags)')
  })

  it('wires both observers to the RPC and generated Database type', () => {
    const market = readFileSync(
      resolve(root, 'apps/api/src/lib/learning/market-memory.ts'),
      'utf8',
    )
    const review = readFileSync(
      resolve(root, 'apps/api/src/lib/learning/case-review.ts'),
      'utf8',
    )
    const rpc = readFileSync(
      resolve(root, 'apps/api/src/lib/learning/observation-rpc.ts'),
      'utf8',
    )
    const types = readFileSync(
      resolve(root, 'packages/shared/src/types/database.types.ts'),
      'utf8',
    )

    expect(market).toContain("recordLearningObservation(supabase, 'price_prior_update', input)")
    expect(review).toContain("recordLearningObservation(supabase, 'analysis_rule', input)")
    expect(rpc).toContain("rpc('record_learning_observation_atomic'")
    expect(market).not.toContain("from('learning_candidates')")
    expect(review).not.toContain("from('learning_candidates')")
    expect(types).toContain('learning_observation_receipts: {')
    expect(types).toContain('record_learning_observation_atomic: {')
  })

  it('keeps a rollback-safe local SQL verification for retry and scope invariants', () => {
    const verification = normalized(verificationPath)

    expect(verification).toContain('begin;')
    expect(verification).toContain('rollback;')
    expect(verification).toContain('record_learning_observation_atomic')
    expect(verification).toContain('duplicate retry changed evidence_count')
    expect(verification).toContain('duplicate pending candidate')
  })
})
