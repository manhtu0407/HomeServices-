import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The request flow is request.ts plus the atomic persistence module split out of it, so the
// claim/replay assertions read both — otherwise the RPC-arg checks fall out of reach.
const service = () => [
  'request.ts',
  'persist.ts',
].map((path) => readFileSync(
  new URL(`../../../../../supabase/functions/mobile-api/_shared/domains/job/scope-change/${path}`, import.meta.url),
  'utf8',
)).join('\n')
const supportService = () => readFileSync(
  new URL('../../../../../supabase/functions/mobile-api/_shared/domains/job/scope-change/support.ts', import.meta.url),
  'utf8',
)

const effectService = () => [
  'effects.ts',
  'effects-incident.ts',
  'effects-payloads.ts',
  'effects-drain.ts',
].map((path) => readFileSync(
  new URL(`../../../../../supabase/functions/mobile-api/_shared/domains/job/scope-change/${path}`, import.meta.url),
  'utf8',
)).join('\n')

describe('scope-change request idempotency', () => {
  it('claims or replays before computing a new Kael estimate', () => {
    const source = service()
    const support = supportService()
    const claim = source.indexOf('claimDirectScopeChange(')
    const provider = source.indexOf('prepareScopeChangeEstimate(')

    expect(claim).toBeGreaterThan(-1)
    expect(provider).toBeGreaterThan(claim)
    expect(source).toContain('claim_scope_change_request_atomic')
    expect(support).toContain('computeScopeChangeEstimate')
    expect(support).toContain('release_scope_change_request_claim_atomic')
    expect(source).toContain('p_client_request_id = input.request.client_request_id')
    expect(source).toContain('p_claim_id = input.claimId')
  })

  it('persists and replays post-commit effects without repeating provider work', () => {
    const source = service()
    const effects = effectService()

    expect(source).toContain('drainDirectScopeChangeEffects')
    expect(effects).toContain('scope_effect_id: effectId')
    expect(effects).toContain('at-least-once rather than fake exactly-once')
  })

})
