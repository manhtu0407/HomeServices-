import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const HARNESS_SQL = readFileSync(
  resolve(__dirname, '../../../../../supabase/tests/staging_security_verification.sql'),
  'utf-8'
)

// run-sql-tests.ps1 executes this harness against real Postgres in the
// database-controls job, so whether its fixtures satisfy the identity
// constraints and whether it emits a summary row are settled by running it.
// Only rollback discipline and a committed-secret scan survive execution: a
// harness that commits, or one carrying a token, still passes when it runs.
describe('Staging security verification harness', () => {
  it('uses a rollback-only transaction for remote staging fixtures', () => {
    expect(HARNESS_SQL.trimStart()).toMatch(/^--/)
    expect(HARNESS_SQL).toMatch(/\bbegin;\s+/i)
    expect(HARNESS_SQL.trimEnd()).toMatch(/rollback;$/i)
  })

  it('does not persist Supabase management tokens or provider secrets', () => {
    expect(HARNESS_SQL).not.toMatch(/sbp_[A-Za-z0-9]{32,}/)
    expect(HARNESS_SQL).not.toMatch(/sk-[A-Za-z0-9]{20,}/)
    expect(HARNESS_SQL).not.toMatch(/pplx-[A-Za-z0-9]{20,}/)
  })
})
