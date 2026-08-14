import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'

const root = resolve(__dirname, '../../../../..')
const verificationPath = resolve(
  root,
  'supabase/tests/learning_observations_atomic_verification.sql',
)

function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\s+/g, ' ').toLowerCase()
}

describe('atomic learning observation migration', () => {
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
    const types = readGeneratedDatabaseTypes()

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
