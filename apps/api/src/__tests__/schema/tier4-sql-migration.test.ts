import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations')
const SQL = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8'))
  .join('\n')

// Scanning the migration text is the right layer for these three and only these
// three: the claim is that a string is absent from the committed files. Whether
// RLS is on, or a table exists, is a question for Postgres — see
// supabase/tests/, which the database-controls job runs against a real database.
describe('No hardcoded secrets or unsafe PII in migrations', () => {
  it('has no AI or Supabase management token patterns', () => {
    expect(SQL).not.toMatch(/sk-[a-zA-Z0-9]{20,}/)
    expect(SQL).not.toMatch(/pplx-[a-zA-Z0-9]{20,}/)
    expect(SQL).not.toMatch(/sbp_[A-Za-z0-9]{32,}/)
  })

  it('does not reference process.env inside SQL', () => {
    expect(SQL).not.toContain('process.env')
  })

  it('does not hardcode user emails or Vietnamese phone numbers', () => {
    expect(SQL).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    expect(SQL).not.toMatch(/\+84\d{9,10}/)
    expect(SQL).not.toMatch(/09\d{8}/)
  })
})
