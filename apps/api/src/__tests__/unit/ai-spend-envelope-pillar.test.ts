import { afterEach, describe, expect, it, vi } from 'vitest'

import { makeLedgerClient } from '../kael-edge-runtime/harness'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  KAEL_AI_SPEND_CAP_DEFAULTS,
  finalizeAiSpend,
  isKaelAiKillSwitchEnabled,
  readKaelAiSpendCaps,
  reserveAiSpend,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/spend-gate'

export const PILLAR = {
  id: 'P16-ai-spend-envelope',
  invariant:
    'a malformed spend cap falls back to the declared default rather than to zero or NaN, and a reservation is booked before the spend and released when it does not happen',
  authority: [
    'governance/RULES.md #2 (the wrapper owns cost logging and caps)',
    'governance/RULES.md #8 (degrade honestly, never silently)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/spend-gate.ts',
  layer: 'unit',
  siblings: ['P14-kael-chat-cost-cap', 'P11-kael-routing-conformance', 'P01-commission-math'],
  mutation:
    'drop the `parsed > 0` conjunct from positiveUsd — the zero and negative cap cases turn red, because a cap of 0 would compare false against every spend',
} as const satisfies PillarManifest

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as { Deno?: unknown }).Deno
})

const envOf = (values: Record<string, string>) => (name: string) => values[name]
const noEnv = () => undefined

describe('readKaelAiSpendCaps', () => {
  it('uses the declared defaults when nothing is configured', () => {
    expect(
      readKaelAiSpendCaps(noEnv),
      pillarWhy(PILLAR, 'an unconfigured environment must still have a working ceiling'),
    ).toEqual(KAEL_AI_SPEND_CAP_DEFAULTS)
  })

  it('honours a valid override', () => {
    expect(
      readKaelAiSpendCaps(envOf({ KAEL_AI_USER_DAILY_CAP_USD: '2.5' })).userDailyUsd,
      pillarWhy(PILLAR, 'a deliberate override is the reason the variable exists'),
    ).toBe(2.5)
  })

  // A cap of 0 or NaN is worse than no cap: every comparison against it fails, so the ceiling
  // silently stops applying instead of loudly refusing.
  it.each([
    ['zero', '0'],
    ['a negative number', '-5'],
    ['not a number', 'abc'],
    ['an empty string', ''],
    ['infinity', 'Infinity'],
    ['whitespace', '   '],
  ])('falls back to the default when the user daily cap is %s', (_label, value) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const caps = readKaelAiSpendCaps(envOf({ KAEL_AI_USER_DAILY_CAP_USD: value }))
    expect(
      caps.userDailyUsd,
      pillarWhy(PILLAR, `'${value}' must not become the ceiling every spend is compared against`),
    ).toBe(KAEL_AI_SPEND_CAP_DEFAULTS.userDailyUsd)
    expect(
      Number.isFinite(caps.userDailyUsd) && caps.userDailyUsd > 0,
      pillarWhy(PILLAR, 'a cap that is not a positive finite number cannot refuse anything'),
    ).toBe(true)
  })

  it('keeps every declared default a positive finite number', () => {
    for (const [name, value] of Object.entries(KAEL_AI_SPEND_CAP_DEFAULTS)) {
      expect(
        Number.isFinite(value) && value > 0,
        pillarWhy(PILLAR, `${name} is the fallback every malformed config lands on`),
      ).toBe(true)
    }
  })
})

describe('isKaelAiKillSwitchEnabled', () => {
  it.each([
    ['1', true],
    ['true', true],
    ['YES', true],
    ['on', true],
    ['0', false],
    ['false', false],
    ['maybe', false],
  ])('reads %s as %s', (value, expected) => {
    expect(
      isKaelAiKillSwitchEnabled(envOf({ KAEL_AI_KILL_SWITCH: value })),
      pillarWhy(PILLAR, 'the emergency brake must not depend on how the value was spelled'),
    ).toBe(expected)
  })

  it('stays off when unset', () => {
    expect(
      isKaelAiKillSwitchEnabled(noEnv),
      pillarWhy(PILLAR, 'an unset variable must not disable the product'),
    ).toBe(false)
  })
})

describe('reserveAiSpend', () => {
  it('books a reservation before the spend happens', async () => {
    const ledger = makeLedgerClient(10)
    const reservation = await reserveAiSpend(ledger, {
      actorId: 'customer-p16',
      estimatedCostUsd: 0.01,
      purpose: 'price_synthesis',
    })

    expect(
      reservation.allowed,
      pillarWhy(PILLAR, 'a call inside the cap must be permitted'),
    ).toBe(true)
    expect(
      reservation.reservationId,
      pillarWhy(PILLAR, 'without an id there is nothing to reconcile the actual cost against'),
    ).not.toBeNull()
    expect(
      ledger.getTotal(),
      pillarWhy(PILLAR, 'the estimate is held immediately, so concurrent callers see it'),
    ).toBe(0.01)
  })

  it('refuses once the reservation would cross the cap', async () => {
    const ledger = makeLedgerClient(0.05)
    await reserveAiSpend(ledger, { actorId: 'customer-p16', estimatedCostUsd: 0.04 })
    const second = await reserveAiSpend(ledger, { actorId: 'customer-p16', estimatedCostUsd: 0.04 })

    expect(
      second.allowed,
      pillarWhy(PILLAR, 'two calls that each fit must not both fit together'),
    ).toBe(false)
    expect(
      second.reservationId,
      pillarWhy(PILLAR, 'a refused call must not hold a row it never earned'),
    ).toBeNull()
  })

  it('sends the resolved caps to the ledger rather than letting the database guess', async () => {
    const ledger = makeLedgerClient(10)
    await reserveAiSpend(ledger, { actorId: 'customer-p16', estimatedCostUsd: 0.01 })

    expect(
      ledger.rpc.mock.calls[0][1],
      pillarWhy(PILLAR, 'the caps the server resolved are the caps that must be enforced'),
    ).toMatchObject({
      p_global_daily_cap: KAEL_AI_SPEND_CAP_DEFAULTS.globalDailyUsd,
      p_user_daily_cap: KAEL_AI_SPEND_CAP_DEFAULTS.userDailyUsd,
      p_user_monthly_cap: KAEL_AI_SPEND_CAP_DEFAULTS.userMonthlyUsd,
    })
  })

  it('never reserves a negative estimate', async () => {
    const ledger = makeLedgerClient(10)
    await reserveAiSpend(ledger, { actorId: 'customer-p16', estimatedCostUsd: -5 })

    expect(
      ledger.rpc.mock.calls[0][1].p_estimated_usd,
      pillarWhy(PILLAR, 'a negative estimate would create headroom out of nothing'),
    ).toBe(0)
  })

  // Without a ledger there is nothing to enforce against, so the caller decides which risk it
  // prefers: refusing everyone, or serving them uncapped. Both must be reachable and explicit.
  it('defaults to fail-open when no ledger is reachable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const reservation = await reserveAiSpend(null, { actorId: 'customer-p16' })

    expect(
      reservation.allowed,
      pillarWhy(PILLAR, 'the default keeps the product usable when the ledger is down'),
    ).toBe(true)
    expect(
      reservation.reservationId,
      pillarWhy(PILLAR, 'nothing was reserved, so there is nothing to finalise'),
    ).toBeNull()
  })

  it('refuses when the caller asked to fail closed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const reservation = await reserveAiSpend(null, {
      actorId: 'customer-p16',
      failureMode: 'fail-closed',
    })

    expect(
      reservation.allowed,
      pillarWhy(PILLAR, 'a caller that chose fail-closed must actually be refused'),
    ).toBe(false)
    expect(
      reservation.scope,
      pillarWhy(PILLAR, 'the refusal has to say which path produced it'),
    ).toContain('fail_closed')
  })
})

describe('finalizeAiSpend', () => {
  it('replaces the estimate with what was actually spent', async () => {
    const ledger = makeLedgerClient(10)
    const reservation = await reserveAiSpend(ledger, {
      actorId: 'customer-p16',
      estimatedCostUsd: 0.05,
    })
    await finalizeAiSpend(ledger, {
      reservationId: reservation.reservationId,
      actorId: 'customer-p16',
      purpose: 'price_synthesis',
      actualUsd: 0.02,
    })

    expect(
      ledger.getTotal(),
      pillarWhy(PILLAR, 'holding the estimate forever would shrink the cap on every call'),
    ).toBe(0.02)
  })

  // An attempt that produced nothing must not keep consuming headroom, or a run of failures
  // would exhaust the day without a single answer being delivered.
  it('releases the hold when the attempt produced no cost', async () => {
    const ledger = makeLedgerClient(10)
    const reservation = await reserveAiSpend(ledger, {
      actorId: 'customer-p16',
      estimatedCostUsd: 0.05,
    })
    await finalizeAiSpend(ledger, {
      reservationId: reservation.reservationId,
      actorId: 'customer-p16',
      purpose: 'price_synthesis',
      actualUsd: 0,
    })

    expect(
      ledger.getTotal(),
      pillarWhy(PILLAR, 'a failed attempt must not permanently consume budget'),
    ).toBe(0)
    expect(
      ledger.reservationCount(),
      pillarWhy(PILLAR, 'the released row should be gone, not zeroed and kept'),
    ).toBe(0)
  })
})
