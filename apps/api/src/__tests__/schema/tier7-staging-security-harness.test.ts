import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const HARNESS_SQL = readFileSync(
  resolve(__dirname, '../../../../../supabase/tests/staging_security_verification.sql'),
  'utf-8'
)

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

  it('keeps worker fixtures valid for submitted-or-approved identity constraints', () => {
    expect(HARNESS_SQL).toContain('legal_name')
    expect(HARNESS_SQL).toContain('date_of_birth')
    expect(HARNESS_SQL).toContain("'Security Worker One'")
    expect(HARNESS_SQL).toContain("'Security Worker Two'")
  })

  it('reports a summary row that must show zero failures', () => {
    expect(HARNESS_SQL).toContain('__summary__')
    expect(HARNESS_SQL).toContain('0 failures')
    expect(HARNESS_SQL).toContain('count(*) filter (where pass = false) = 0')
  })
})
