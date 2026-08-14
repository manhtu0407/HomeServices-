import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = join(process.cwd(), '..', '..')
const migration = readFileSync(
  join(
    repositoryRoot,
    'supabase',
    'migrations',
    '20260814100000_weak_water_pressure_price_evidence.sql',
  ),
  'utf8',
)
const evidenceLedger = JSON.parse(readFileSync(
  join(
    repositoryRoot,
    'docs',
    'foundation',
    'source-trust-samples',
    'price-baseline-water-pressure-20260814-ledger.json',
  ),
  'utf8',
)) as {
  decision: string
  aggregate: { price_min: number; price_max: number }
  sources: Array<{
    domain: string
    artifacts: Record<string, string>
  }>
}

describe('weak water pressure price evidence migration', () => {
  it('pins the medium HCMC diagnostic baseline to three independent sources', () => {
    expect(migration).toContain("problem.slug = 'weak_water_pressure'")
    expect(migration).toContain("baseline.complexity = 'medium'")
    expect(migration).toContain('1fix.vn')
    expect(migration).toContain('aloviecnha.com')
    expect(migration).toContain('thoviet.com.vn')
    expect(migration).toContain("'unit', 'per_visit'")
    expect(evidenceLedger.decision).toBe(
      'accepted_for_three_source_high_value_hcmc_baseline',
    )
    expect(evidenceLedger.sources).toHaveLength(3)
  })

  it('reconciles the stored baseline to the equal-weight aggregate', () => {
    expect(migration).toMatch(/price_min\s*=\s*700000/i)
    expect(migration).toMatch(/price_max\s*=\s*1200000/i)
    expect(evidenceLedger.aggregate).toMatchObject({
      price_min: 700000,
      price_max: 1200000,
    })
  })

  it('pins every accepted source to byte-exact evidence artifacts', () => {
    for (const source of evidenceLedger.sources) {
      for (const prefix of ['price_snapshot', 'identity_snapshot']) {
        const relativePath = source.artifacts[prefix]
        const expectedHash = source.artifacts[`${prefix}_sha256`]
        const actualHash = createHash('sha256')
          .update(readFileSync(join(repositoryRoot, relativePath)))
          .digest('hex')
          .toUpperCase()
        expect(actualHash, `${source.domain} ${prefix} hash`).toBe(expectedHash)
        expect(migration).toContain(expectedHash)
      }
    }
  })
})
