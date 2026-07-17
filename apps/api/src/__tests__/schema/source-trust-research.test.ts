import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Section 25 R1 source trust research handoff', () => {
  it('documents candidates, untrust patterns, and the R2 approval gate', () => {
    const doc = read('docs/foundation/source-trust-research.md')
    const script = read('scripts/source-trust-research/run-perplexity-r1.mjs')

    expect(doc).toContain('Status: R1 live verified; R2 code implemented; F26 R3-R6 source-trust registry, citation quorum, and LS1 aggregation verified on staging.')
    expect(doc).toContain('20 domains verified with Perplexity API.')
    expect(doc).toContain('source-trust-r1-1779781564809.json')
    expect(doc).toContain('- [x] R2 Edge config implemented behind rollback flag.')
    expect(doc).toContain('- [x] F26 R3 citations persisted in staging market artifacts.')
    expect(doc).toContain('- [ ] Production source-trust rollout approval.')
    expect((doc.match(/\| Candidate/g) ?? []).length).toBeGreaterThanOrEqual(20)
    expect(script).toContain('SOURCE_TRUST_RUN_LIVE')
    expect(script).toContain('search_domain_filter')
    expect(script).toContain('search_recency_filter')
  })

  it('keeps R2 staging smoke routed through request-scoped source trust config', () => {
    const router = read('supabase/functions/mobile-api/_shared/router.ts')
    const services = read('supabase/functions/mobile-api/_shared/services.ts')
    const sharedHelpers = read('supabase/functions/mobile-api/_shared/services/_shared.ts')
    const edgeServiceLayer = services + sharedHelpers + read('supabase/functions/mobile-api/_shared/services/jobs/create.ts')
    const env = read('supabase/functions/mobile-api/_shared/env.ts')

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

  it('adds F26 source_trust_registry migration with admin RLS and 20 Tier 1 seeds', () => {
    const migration = read('supabase/migrations/20260526195300_source_trust_registry_f26.sql')

    expect(migration).toContain('create table if not exists public.source_trust_registry')
    expect(migration).toContain("tier text not null check (tier in ('tier_1', 'tier_2', 'tier_3', 'blocked'))")
    expect(migration).toContain('create index if not exists source_trust_registry_lookup_idx')
    expect(migration).toContain('alter table public.source_trust_registry enable row level security')
    expect(migration).toContain('create policy "Admin write source trust"')
    expect(migration).toContain('with check (private.is_admin())')
    expect((migration.match(/'tier_1'/g) ?? []).length).toBeGreaterThanOrEqual(21)
    expect(migration).toContain("'btaskee.com', 'tier_1'")
    expect(migration).toContain("'diennuochuongthinh.com', 'tier_1'")
  })
})
