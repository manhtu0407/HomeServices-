import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations')
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith('_six_service_casework_foundation.sql'),
)

if (!migrationName) {
  throw new Error('six-service case-work foundation migration is missing')
}

const verificationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/tests/six_service_casework_foundation_verification.sql',
  ),
  'utf8',
)

describe('six-service case-work data foundation migration', () => {
  it('ships rollback-only positive and negative actor verification', () => {
    expect(verificationSql.trimStart().startsWith('-- Rollback-only')).toBe(true)
    expect(verificationSql).toMatch(/\nbegin;[\s\S]*\nrollback;\s*$/)
    expect(verificationSql).toContain("set local role authenticated")
    for (const actor of [
      'a1100000-0000-4000-8000-000000000001',
      'a1100000-0000-4000-8000-000000000002',
      'a1100000-0000-4000-8000-000000000003',
      'a1100000-0000-4000-8000-000000000004',
    ]) {
      expect(verificationSql).toContain(actor)
    }
    expect(verificationSql).toContain(
      'other customer read a worker candidate outside their job',
    )
    expect(verificationSql).toContain(
      'other customer wrote a private favorite-worker relation',
    )
    expect(verificationSql).toContain(
      'authenticated can update server-owned worker candidates',
    )
    expect(verificationSql).toContain('second active candidate unexpectedly succeeded')
  })
})
