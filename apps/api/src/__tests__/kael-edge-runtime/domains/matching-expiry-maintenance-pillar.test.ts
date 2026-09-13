import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { makeSequenceClient } from '../harness'
import type { DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'
import { reconcileExpiredMatchingLeases } from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/expiry-maintenance'

export const PILLAR = {
  id: 'P101-matching-expiry-maintainer-runtime',
  invariant: 'maintenance forwards exact server release identity, fails closed on missing identity or invalid SQL receipts, and is wired into the scheduler without Customer foreground',
  authority: ['approved Production Agentic Transaction Readiness plan', 'governance/RULES.md #7 and #8'],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/expiry-maintenance.ts',
  layer: 'integration',
  siblings: ['P100-matching-expiry-maintenance-sql'],
  mutation: 'omit release identity, coerce invalid database receipts, or remove the maintainer call; the corresponding boundary assertion fails',
} as const satisfies PillarManifest

const identity = {
  environment: 'production',
  releaseId: 'harness-000000000000-111111111111',
  deploymentId: 'iwevizmsedyqozxlawwl_10000000-0000-4000-8000-000000000058_1',
}
function client(data: unknown, error: { message: string } | null = null) {
  const database = makeSequenceClient([], { reconcile_expired_matching_leases: [{ data, error }] })
  return database as unknown as DbClient & Pick<typeof database, 'calls'>
}

describe('matching expiry maintenance boundary', () => {
  it('forwards exact server identity and bounded limit without simulating a Customer decision', async () => {
    const database = client(2)
    await expect(reconcileExpiredMatchingLeases(database, identity), pillarWhy(PILLAR)).resolves.toEqual({ reconciled: 2 })
    expect(database.calls).toHaveLength(1)
    expect(database.calls[0].operations).toContainEqual(['rpc', 'reconcile_expired_matching_leases', {
      p_environment: identity.environment, p_release_id: identity.releaseId,
      p_deployment_id: identity.deploymentId, p_limit: 50,
    }])
  })

  it.each([
    { ...identity, environment: 'unknown' },
    { ...identity, releaseId: 'unreleased' },
    { ...identity, deploymentId: null },
  ])('refuses an incomplete runtime identity before mutation: %j', async (invalid) => {
    const database = client(0)
    await expect(reconcileExpiredMatchingLeases(database, invalid)).rejects.toThrow('MATCHING_EXPIRY_RELEASE_UNAVAILABLE')
    expect(database.calls).toHaveLength(0)
  })

  it.each([null, '1', [], {}, -1, 51, 1.5, Number.NaN])('rejects an invalid receipt: %j', async (invalid) => {
    await expect(reconcileExpiredMatchingLeases(client(invalid), identity)).rejects.toThrow('MATCHING_EXPIRY_RECONCILE_FAILED')
  })

  it('keeps SQL failure visible without leaking database details', async () => {
    await expect(reconcileExpiredMatchingLeases(client(null, { message: 'private database detail' }), identity))
      .rejects.toThrow('MATCHING_EXPIRY_RECONCILE_FAILED')
  })

  it('accepts a zero-change receipt without claiming any delivery or assignment', async () => {
    await expect(reconcileExpiredMatchingLeases(client(0), identity)).resolves.toEqual({ reconciled: 0 })
  })

  it('retains the scheduler wire independently of any Customer API route', () => {
    const source = readFileSync(new URL('../../../../../../supabase/functions/kael-matching-maintainer/index.ts', import.meta.url), 'utf8')
    expect(source).toContain('await reconcileExpiredMatchingLeases(dbClient,')
    expect(source).toContain('matching_expiry: matchingExpiry')
  })
})
