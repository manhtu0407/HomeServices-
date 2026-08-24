import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P65-stage1-sql-volatility-runtime',
  invariant:
    'the canonical SQL verification lane executes the final Worker earnings volatility contract against PostgreSQL, so replay-safe migration behavior is proved by pg_proc rather than inferred from migration text',
  authority: [
    'governance/protocols/tdd.md (SQL behavior must be proved at the runtime layer)',
    'Stage 1 release integrity contract (canonical empty reset and SQL verification must pass)',
  ],
  target: 'supabase/tests/stage1_sql_volatility_verification.sql',
  layer: 'sql',
  siblings: ['P35-worker-earnings-fail-closed', 'P56-stage1-production-release-workflow'],
  mutation:
    'restore clock_timestamp() in either earnings summary function or mark either function VOLATILE — the rollback-only verification raises its named contract exception in the fresh Postgres lane',
} as const satisfies PillarManifest

const verificationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/tests/stage1_sql_volatility_verification.sql',
  ),
  'utf8',
)

describe('Stage 1 SQL volatility migration', () => {
  it('ships rollback-only runtime verification for the final volatility contract', () => {
    expect(
      verificationSql.trimStart().startsWith('-- Rollback-only'),
      pillarWhy(PILLAR, 'the SQL suite must leave the verification database unchanged'),
    ).toBe(true)
    expect(
      verificationSql,
      pillarWhy(PILLAR, 'the verification must own an explicit rollback transaction'),
    ).toMatch(/\nbegin;[\s\S]*\nrollback;\s*$/)
    expect(
      verificationSql,
      pillarWhy(PILLAR, 'the runtime assertion must name clock_timestamp drift'),
    ).toContain('worker earnings summary still calls clock_timestamp')
    expect(
      verificationSql,
      pillarWhy(PILLAR, 'the runtime assertion must name volatility drift'),
    ).toContain('worker earnings summary is not STABLE')
  })
})
