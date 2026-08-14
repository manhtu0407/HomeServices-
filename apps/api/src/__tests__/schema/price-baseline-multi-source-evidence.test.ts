import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = join(process.cwd(), '..', '..')
const migration = readFileSync(
  join(
    repositoryRoot,
    'supabase',
    'migrations',
    '20260813170000_price_baseline_multi_source_evidence.sql',
  ),
  'utf8',
)
const evidenceLedger = JSON.parse(readFileSync(
  join(
    repositoryRoot,
    'docs',
    'foundation',
    'source-trust-samples',
    'price-baseline-hinge-20260814-ledger.json',
  ),
  'utf8',
)) as {
  verified_at: string
  verified_by: string
  sources: Array<{
    domain: string
    artifacts: Record<string, string>
  }>
}

describe('price baseline multi-source evidence migration', () => {
  it('adds a versioned evidence document instead of trusting the legacy source label', () => {
    expect(migration).toMatch(/add column if not exists price_evidence jsonb not null/i)
    expect(migration).toContain('baseline_price_evidence.v1')
    expect(migration).toMatch(/jsonb_typeof\(price_evidence\) = 'object'/i)
  })

  it('records two current independent HCMC direct-price sources and their units', () => {
    expect(migration).toContain('suachuatainha.com.vn')
    expect(migration).toContain('nhabepsaigon.vn')
    expect(migration).toContain('https://suachuatainha.com.vn/thay-sua-ray-truot-ban-le-phu-kien-tu-go/')
    expect(migration).toContain('https://nhabepsaigon.vn/bao-gia-sua-tu-bep-moi-nhat')
    expect(migration).toContain('per_cabinet_door')
    expect(migration).toContain('2 cabinet hinges x published per-item range')
    expect(migration).toContain('source_published_at')
    expect(migration).toContain('price-baseline-hinge-20260814-ledger.json')
  })

  it('reconciles the stored one-door range to the weighted source aggregate', () => {
    expect(migration).toMatch(/price_min\s*=\s*140000/i)
    expect(migration).toMatch(/price_max\s*=\s*375000/i)
    expect(migration).not.toContain('daiphong_cabinet_hinge_replacement_per_piece_x2_2026_08')
  })

  it('pins every accepted source to a dated ledger and byte-exact price and identity snapshots', () => {
    expect(evidenceLedger.verified_at).toBe('2026-08-14')
    expect(evidenceLedger.verified_by).toBe('codex_agentic_e2e_price_audit')
    expect(evidenceLedger.sources).toHaveLength(2)

    for (const source of evidenceLedger.sources) {
      for (const prefix of ['price_snapshot', 'identity_snapshot']) {
        const relativePath = source.artifacts[prefix]
        const expectedHash = source.artifacts[`${prefix}_sha256`]
        expect(relativePath, `${source.domain} ${prefix} path`).toMatch(
          /^docs\/foundation\/source-trust-samples\/.*\.png$/,
        )
        const actualHash = createHash('sha256')
          .update(readFileSync(join(repositoryRoot, relativePath)))
          .digest('hex')
          .toUpperCase()
        expect(actualHash, `${source.domain} ${prefix} hash`).toBe(expectedHash)
        expect(migration).toContain(expectedHash)
      }
    }
  })

  it('blocks creation of a Kael job whose stored offer has no verified baseline or market quorum', () => {
    expect(migration).toContain('enforce_kael_estimate_price_evidence')
    expect(migration).toContain('KAEL_PRICE_EVIDENCE_REQUIRED')
    expect(migration).toContain("'baseline_price_evidence_receipt.v1'")
    expect(migration).toContain("'baseline_with_market', 'baseline_only'")
    expect(migration).toContain("'perplexity_validated', 'baseline_with_market'")
    expect(migration).toMatch(/before insert on public\.jobs/i)
  })
})
