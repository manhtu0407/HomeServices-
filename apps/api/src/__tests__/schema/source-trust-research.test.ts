import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Section 25 R1 source trust research handoff', () => {
  // The research write-up's status banner and checkbox states were asserted here
  // too. A checkbox is edited by hand, so the case failed when someone updated
  // the document and never when the runner changed.
  it('keeps the R1 runner behind an explicit live flag with domain and recency filters', () => {
    const script = read('scripts/source-trust-research/run-perplexity-r1.mjs')

    expect(script).toContain('SOURCE_TRUST_RUN_LIVE')
    expect(script).toContain('search_domain_filter')
    expect(script).toContain('search_recency_filter')
  })

  it('keeps R2 staging smoke routed through request-scoped source trust config', () => {
    const router = read('supabase/functions/mobile-api/_shared/http.ts')
    const services = read('supabase/functions/mobile-api/_shared/domains.ts')
    const sourceTrustHelpers = read('supabase/functions/mobile-api/_shared/platform/domain-utils.ts')
    const edgeServiceLayer = [
      services,
      sourceTrustHelpers,
      read('supabase/functions/mobile-api/_shared/domains/job/create/create.ts'),
      read('supabase/functions/mobile-api/_shared/domains/job/create/analyze.ts'),
    ].join('\n')
    const env = read('supabase/functions/_shared/platform/env.ts')

    expect(router).toContain('requestUrl: request.url')
    expect(router).toContain('requestProjectRef')
    expect(router).toContain('projectRefFromHost')
    expect(edgeServiceLayer).toContain('sourceTrustSecretsForRequest(secrets, ctx)')
    expect(edgeServiceLayer).toContain('sourceTrustPerplexityFilterEnabled: true')
    expect(edgeServiceLayer).toContain('sourceTrustPerplexityFilterExplicit')
    expect(edgeServiceLayer).toContain('xyylanuyflrjzbjzhqfl')
    expect(env).toContain('KAEL_TRUST_PERPLEXITY_FILTER_ENABLED')
    expect(env).toContain('KAEL_OPT_SOURCE_TRUST_ENABLED')
    expect(env).toContain('sourceTrustPerplexityFilterExplicit')
  })

})
