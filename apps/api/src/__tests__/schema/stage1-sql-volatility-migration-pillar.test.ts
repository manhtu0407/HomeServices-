import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260823173000_sql_volatility_contracts.sql',
  ),
  'utf8',
)

describe('Stage 1 SQL volatility migration', () => {
  it('is safe when canonical history already removed the volatile call', () => {
    expect(migrationSql).toContain('if v_rewritten <> v_definition then')
    expect(migrationSql).not.toContain('WORKER_EARNINGS_TIMESTAMP_FIX_SOURCE_DRIFT')
  })
})
