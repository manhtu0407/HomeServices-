import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const verificationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/tests/stage1_sql_volatility_verification.sql',
  ),
  'utf8',
)

describe('Stage 1 SQL volatility migration', () => {
  it('ships rollback-only runtime verification for the final volatility contract', () => {
    expect(verificationSql.trimStart().startsWith('-- Rollback-only')).toBe(true)
    expect(verificationSql).toMatch(/\nbegin;[\s\S]*\nrollback;\s*$/)
    expect(verificationSql).toContain('worker earnings summary still calls clock_timestamp')
    expect(verificationSql).toContain('worker earnings summary is not STABLE')
  })
})
