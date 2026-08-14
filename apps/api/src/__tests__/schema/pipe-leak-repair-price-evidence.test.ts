import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = join(process.cwd(), '..', '..')
const migration = readFileSync(join(
  repositoryRoot,
  'supabase',
  'migrations',
  '20260814111500_verified_pipe_leak_repair_price.sql',
), 'utf8')
const ledger = JSON.parse(readFileSync(join(
  repositoryRoot,
  'docs',
  'foundation',
  'source-trust-samples',
  'price-baseline-pipe-leak-20260814-ledger.json',
), 'utf8')) as {
  aggregate: { price_max: number; price_min: number }
  sources: Array<{
    artifacts: Record<string, string>
    domain: string
    price_url: string
  }>
}

describe('verified pipe-leak repair price evidence', () => {
  it('stores the two-source per-point labor aggregate for a medium pipe leak', () => {
    expect(migration).toContain("problem.slug = 'pipe_leak'")
    expect(migration).toContain("baseline.complexity = 'medium'")
    expect(migration).toContain("'per_repair_point'")
    expect(migration).toMatch(/price_min\s*=\s*150000/i)
    expect(migration).toMatch(/price_max\s*=\s*375000/i)
    expect(ledger.aggregate).toMatchObject({ price_min: 150_000, price_max: 375_000 })
  })

  it('pins every accepted source to byte-exact screenshots', () => {
    expect(ledger.sources).toHaveLength(2)
    for (const source of ledger.sources) {
      for (const prefix of ['price_snapshot', 'identity_snapshot']) {
        const relativePath = source.artifacts[prefix]
        const expectedHash = source.artifacts[`${prefix}_sha256`]
        const actualHash = createHash('sha256')
          .update(readFileSync(join(repositoryRoot, relativePath)))
          .digest('hex')
          .toUpperCase()
        expect(actualHash, `${source.domain} ${prefix}`).toBe(expectedHash)
        if (prefix === 'price_snapshot') expect(migration).toContain(expectedHash)
      }
      expect(migration).toContain(source.price_url)
    }
  })
})
