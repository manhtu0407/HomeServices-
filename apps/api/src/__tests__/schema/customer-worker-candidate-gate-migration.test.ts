import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const verificationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/tests/customer_worker_candidate_gate_verification.sql',
  ),
  'utf8',
)

// What the candidate gate does — proposal without assignment, single-winner
// confirmation, eligibility recheck, release on reject — is proven by running
// the verification script against Postgres in the database-controls job. The one
// property running it cannot prove is that it leaves no rows behind.
describe('customer-confirmed worker candidate gate migration', () => {
  it('ships rollback-only ownership, race, and retry verification', () => {
    expect(verificationSql.trimStart().startsWith('-- Rollback-only')).toBe(true)
    expect(verificationSql).toMatch(/\nbegin;[\s\S]*\nrollback;\s*$/)
    for (const marker of [
      'non-owner customer confirmation was denied',
      'second worker accept won the same job',
      'confirm retry was not idempotent',
      'reject retry was not idempotent',
      'candidate lifecycle overwrote worker availability preference',
      'jobs.worker_id leaked before customer confirmation',
    ]) {
      expect(verificationSql).toContain(marker)
    }
  })
})
