import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Section 25 R1 source trust research handoff', () => {
  it('documents candidates, untrust patterns, and the R2 approval gate', () => {
    const doc = read('docs/foundation/source-trust-research.md')
    const script = read('scripts/source-trust-research/run-perplexity-r1.mjs')

    expect(doc).toContain('Status: started, not approved for R2.')
    expect(doc).toContain('Perplexity R1 live calls were not run in this batch.')
    expect(doc).toContain('- [ ] Tu approval before R2.')
    expect((doc.match(/\| Candidate \|/g) ?? []).length).toBe(20)
    expect(script).toContain('SOURCE_TRUST_RUN_LIVE')
    expect(script).toContain('search_domain_filter')
    expect(script).toContain('web_search_options')
  })
})
