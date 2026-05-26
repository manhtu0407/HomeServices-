import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Section 25 R1 source trust research handoff', () => {
  it('documents candidates, untrust patterns, and the R2 approval gate', () => {
    const doc = read('docs/foundation/source-trust-research.md')
    const script = read('scripts/source-trust-research/run-perplexity-r1.mjs')

    expect(doc).toContain('Status: R1 live verified; R2 code implemented and staging smoke verified behind rollback flag.')
    expect(doc).toContain('20 domains verified with Perplexity API.')
    expect(doc).toContain('source-trust-r1-1779781564809.json')
    expect(doc).toContain('- [x] R2 Edge config implemented behind rollback flag.')
    expect(doc).toContain('- [ ] Production rollout approval and Section 25 R4-R8 gates.')
    expect((doc.match(/\| Candidate/g) ?? []).length).toBeGreaterThanOrEqual(20)
    expect(script).toContain('SOURCE_TRUST_RUN_LIVE')
    expect(script).toContain('search_domain_filter')
    expect(script).toContain('search_recency_filter')
  })

  it('keeps R2 staging smoke routed through request-scoped source trust config', () => {
    const router = read('supabase/functions/mobile-api/_shared/router.ts')
    const services = read('supabase/functions/mobile-api/_shared/services.ts')
    const env = read('supabase/functions/mobile-api/_shared/env.ts')

    expect(router).toContain('requestUrl: request.url')
    expect(router).toContain('requestProjectRef')
    expect(router).toContain('projectRefFromHost')
    expect(services).toContain('sourceTrustSecretsForRequest(secrets, ctx)')
    expect(services).toContain('sourceTrustPerplexityFilterEnabled: true')
    expect(services).toContain('sourceTrustPerplexityFilterExplicit')
    expect(services).toContain('xyylanuyflrjzbjzhqfl')
    expect(env).toContain('KAEL_TRUST_PERPLEXITY_FILTER_ENABLED')
    expect(env).toContain('KAEL_OPT_SOURCE_TRUST_ENABLED')
    expect(env).toContain('sourceTrustPerplexityFilterExplicit')
  })
})
