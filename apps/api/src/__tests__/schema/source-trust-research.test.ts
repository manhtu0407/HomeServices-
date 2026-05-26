import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Section 25 R1 source trust research handoff', () => {
  it('documents candidates, untrust patterns, and the R2 approval gate', () => {
    const doc = read('docs/foundation/source-trust-research.md')
    const script = read('scripts/source-trust-research/run-perplexity-r1.mjs')

    expect(doc).toContain('Status: R1 live verified, awaiting Tu approval for R2.')
    expect(doc).toContain('20 domains verified with Perplexity API.')
    expect(doc).toContain('source-trust-r1-1779781564809.json')
    expect(doc).toContain('- [ ] Tu approval before R2.')
    expect((doc.match(/\| Candidate/g) ?? []).length).toBeGreaterThanOrEqual(20)
    expect(script).toContain('SOURCE_TRUST_RUN_LIVE')
    expect(script).toContain('search_domain_filter')
    expect(script).toContain('search_recency_filter')
  })
})
