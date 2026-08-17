import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  estimateWorkerNet,
  getWorkerCommissionTier,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/payment/commission'
import type { DbClient } from '../../../../../supabase/functions/mobile-api/_shared/platform/db'

export const PILLAR = {
  id: 'P01-commission-math',
  invariant:
    'worker net = gross - round(gross * rateBps / 10000); any unsafe or out-of-policy input yields null instead of a fabricated rate',
  authority: [
    'governance/RULES.md #8 (fallback is allowed, fake success is not)',
    'docs/test-debt-ledger.md §1 (commission tier policy)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/payment/commission.ts',
  layer: 'unit',
  siblings: ['P03-direct-payment-availability', 'P10-per-actor-rls'],
  mutation:
    'replace Math.round with Math.floor in estimateWorkerNet — the 0.5-boundary case turns red',
} as const satisfies PillarManifest

// Narrows the structural DB interface to the single method under test. getWorkerCommissionTier
// reaches the database only through client.rpc, so a from() call here is a defect in the
// function, not in the stub — hence the throw rather than a silent empty chain.
function clientAnswering(result: { data: unknown; error: unknown }): DbClient {
  return {
    from() {
      throw new Error(`${PILLAR.id}: getWorkerCommissionTier must not read tables directly`)
    },
    rpc() {
      return Promise.resolve(result)
    },
  } as unknown as DbClient
}

const VALID_TIER = { commission_level: 1, commission_rate_bps: 1500 }

describe('estimateWorkerNet', () => {
  // Expected values are computed by hand from the policy formula, not by re-running the
  // implementation. 1_000_000 * 15% = 150_000 deducted.
  it('deducts the tier rate from gross and returns the remainder in whole VND', () => {
    expect(
      estimateWorkerNet(1_000_000, { level: 1, rateBps: 1500 }),
      pillarWhy(PILLAR, 'gross=1_000_000 rateBps=1500 → 1_000_000 - 150_000'),
    ).toBe(850_000)
  })

  it('returns gross unchanged when the tier rate is zero', () => {
    expect(
      estimateWorkerNet(1_000_000, { level: 1, rateBps: 0 }),
      pillarWhy(PILLAR, 'a 0 bps tier must deduct nothing'),
    ).toBe(1_000_000)
  })

  // The distinguishing case: 333_333 * 15% = 49_999.95. Rounding half up deducts 50_000;
  // truncating deducts 49_999 and silently overpays the worker by 1 VND per job.
  it('rounds the deduction half up rather than truncating it', () => {
    expect(
      estimateWorkerNet(333_333, { level: 1, rateBps: 1500 }),
      pillarWhy(PILLAR, 'gross=333_333 rateBps=1500 → deduction 49_999.95 rounds to 50_000'),
    ).toBe(283_333)
  })

  it('applies the highest permitted rate exactly at the policy ceiling', () => {
    expect(
      estimateWorkerNet(2_000_000, { level: 3, rateBps: 1500 }),
      pillarWhy(PILLAR, 'rateBps=1500 is the ceiling from getWorkerCommissionTier'),
    ).toBe(1_700_000)
  })

  it.each([
    ['null gross', null],
    ['zero gross', 0],
    ['negative gross', -1],
    ['fractional gross', 1.5],
    ['NaN gross', Number.NaN],
    ['infinite gross', Number.POSITIVE_INFINITY],
    ['gross beyond safe integer range', Number.MAX_SAFE_INTEGER + 1],
  ])('returns null rather than a number for %s', (_label, gross) => {
    expect(
      estimateWorkerNet(gross as number | null, { level: 1, rateBps: 1500 }),
      pillarWhy(PILLAR, `unsafe gross ${String(gross)} must not produce a payable amount`),
    ).toBeNull()
  })

  it('returns null when no tier policy was resolved', () => {
    expect(
      estimateWorkerNet(1_000_000, null),
      pillarWhy(PILLAR, 'a missing tier must not fall back to a default rate'),
    ).toBeNull()
  })
})

describe('getWorkerCommissionTier', () => {
  it('accepts a policy row inside the permitted range', async () => {
    const tier = await getWorkerCommissionTier(clientAnswering({ data: [VALID_TIER], error: null }), 'worker-1')
    expect(tier, pillarWhy(PILLAR, 'level 1 / 1500 bps is the documented default policy')).toEqual({
      level: 1,
      rateBps: 1500,
    })
  })

  it.each([
    ['the floor of the rate range', 0],
    ['the ceiling of the rate range', 1500],
  ])('accepts %s', async (_label, rateBps) => {
    const tier = await getWorkerCommissionTier(
      clientAnswering({ data: [{ commission_level: 1, commission_rate_bps: rateBps }], error: null }),
      'worker-1',
    )
    expect(tier?.rateBps, pillarWhy(PILLAR, `rateBps=${rateBps} sits on the accepted boundary`)).toBe(rateBps)
  })

  it.each([
    ['one basis point above the ceiling', { commission_level: 1, commission_rate_bps: 1501 }],
    ['a negative rate', { commission_level: 1, commission_rate_bps: -1 }],
    ['a fractional rate', { commission_level: 1, commission_rate_bps: 1500.5 }],
    ['a NaN rate', { commission_level: 1, commission_rate_bps: Number.NaN }],
    ['a rate sent as a string', { commission_level: 1, commission_rate_bps: '1500' }],
    ['a level below the first tier', { commission_level: 0, commission_rate_bps: 1500 }],
    ['a fractional level', { commission_level: 1.5, commission_rate_bps: 1500 }],
    ['a missing rate', { commission_level: 1 }],
  ])('returns null for %s rather than clamping it', async (_label, row) => {
    const tier = await getWorkerCommissionTier(clientAnswering({ data: [row], error: null }), 'worker-1')
    expect(
      tier,
      pillarWhy(PILLAR, `out-of-policy row ${JSON.stringify(row)} must fail closed, never clamp`),
    ).toBeNull()
  })

  it.each([
    ['the policy lookup fails', { data: null, error: { message: 'boom' } }],
    ['no policy row exists for the worker', { data: [], error: null }],
    ['the projection returns null data', { data: null, error: null }],
  ])('returns null when %s', async (_label, result) => {
    const tier = await getWorkerCommissionTier(clientAnswering(result), 'worker-1')
    expect(
      tier,
      pillarWhy(PILLAR, 'an unresolved policy must not degrade into an assumed rate'),
    ).toBeNull()
  })
})
