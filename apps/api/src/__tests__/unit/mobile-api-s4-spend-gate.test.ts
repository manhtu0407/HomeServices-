/**
 * S4 / F1 + F4 (Plan.md §38) — durable AI-spend gate + global kill-switch.
 *
 * The audit's F1 gap was DURABILITY: cost caps lived in an in-memory Map that resets
 * per Edge isolate / cold start, so they gated nothing at system scale. These tests
 * prove the replacement is durable and fail-closed where it must be:
 *
 *  (1) cumulative recorded spend blocks once it reaches the cap;
 *  (2) a FRESH module import (simulated cold isolate) still blocks — purely from the
 *      ledger read, because the gate holds NO in-memory state;
 *  (3) the gate reads the DB counter BEFORE every call;
 *  (4) callAI hard-stops on the kill-switch and on a spend-cap block WITHOUT touching
 *      the network (no fake success — returns an AIError the caller maps to fallback).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkAiSpendAllowed,
  isKaelAiKillSwitchEnabled,
  KAEL_AI_SPEND_CAPS,
  recordAiSpend,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/spend-gate'
import { callAI } from '../../../../../supabase/functions/mobile-api/_shared/kael/provider-client'

// A stateful mock that plays the role of the durable DB ledger: it accumulates
// recorded spend and answers check_kael_ai_spend from that running total. The total
// lives in the mock (the "DB"), never in the gate module — which is the whole point.
function makeLedgerClient(capUsd: number) {
  let total = 0
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'check_kael_ai_spend') {
      const est = Number(args.p_estimated_usd ?? 0)
      const allowed = total + est <= capUsd
      return {
        data: [
          {
            allowed,
            blocked_scope: allowed ? null : 'global_daily',
            global_today_usd: total,
            user_today_usd: total,
            user_month_usd: total,
          },
        ],
        error: null,
      }
    }
    if (fn === 'record_kael_ai_spend') {
      total += Number(args.p_cost_usd ?? 0)
      return { data: null, error: null }
    }
    return { data: null, error: null }
  })
  return { rpc, getTotal: () => total }
}

afterEach(() => {
  delete (globalThis as { Deno?: unknown }).Deno
  vi.restoreAllMocks()
})

describe('S4 spend-gate: verdicts and fail-open policy', () => {
  it('allows when under cap', async () => {
    const ledger = makeLedgerClient(10)
    const v = await checkAiSpendAllowed(ledger, { actorId: null, estimatedCostUsd: 1 })
    expect(v.allowed).toBe(true)
    expect(v.scope).toBeNull()
  })

  it('blocks when estimate would exceed cap, with the blocked scope', async () => {
    const ledger = makeLedgerClient(0)
    const v = await checkAiSpendAllowed(ledger, { actorId: null, estimatedCostUsd: 0.5 })
    expect(v.allowed).toBe(false)
    expect(v.scope).toBe('global_daily')
  })

  it('fails OPEN (allows + logs) on an rpc error — never wrongly blocks a real user', async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: { code: 'PGRST500' } })) }
    const v = await checkAiSpendAllowed(client, { actorId: 'u1', estimatedCostUsd: 1 })
    expect(v.allowed).toBe(true)
    expect(v.scope).toBe('gate_error_fail_open')
  })

  it('fails OPEN when no rpc surface is reachable', async () => {
    const v = await checkAiSpendAllowed({}, { actorId: 'u1', estimatedCostUsd: 1 })
    expect(v.allowed).toBe(true)
    expect(v.scope).toBe('no_rpc_fail_open')
  })

  it('recordAiSpend writes positive cost and no-ops on zero/negative', async () => {
    const ledger = makeLedgerClient(10)
    await recordAiSpend(ledger, { actorId: 'u1', purpose: 'vision_analysis', costUsd: 0.02 })
    expect(ledger.getTotal()).toBeCloseTo(0.02)
    await recordAiSpend(ledger, { actorId: 'u1', purpose: 'vision_analysis', costUsd: 0 })
    await recordAiSpend(ledger, { actorId: 'u1', purpose: 'vision_analysis', costUsd: -5 })
    expect(ledger.getTotal()).toBeCloseTo(0.02)
  })
})

describe('S4 kill-switch reader', () => {
  it('true only for truthy env values', () => {
    expect(isKaelAiKillSwitchEnabled(() => 'true')).toBe(true)
    expect(isKaelAiKillSwitchEnabled(() => '1')).toBe(true)
    expect(isKaelAiKillSwitchEnabled(() => 'on')).toBe(true)
    expect(isKaelAiKillSwitchEnabled(() => undefined)).toBe(false)
    expect(isKaelAiKillSwitchEnabled(() => 'false')).toBe(false)
  })
})

describe('S4 DURABILITY ACCEPTANCE (F1 — the gate must survive cold isolates)', () => {
  it('(1) blocks once cumulative recorded spend reaches the cap', async () => {
    const cap = KAEL_AI_SPEND_CAPS.globalDailyUsd
    const ledger = makeLedgerClient(cap)
    expect((await checkAiSpendAllowed(ledger, { actorId: null, estimatedCostUsd: 1 })).allowed).toBe(true)
    await recordAiSpend(ledger, { actorId: null, purpose: 'vision_analysis', costUsd: cap })
    const v = await checkAiSpendAllowed(ledger, { actorId: null, estimatedCostUsd: 0.01 })
    expect(v.allowed).toBe(false)
    expect(v.scope).toBe('global_daily')
  })

  it('(2) a cold isolate blocks from the ledger read alone — gate holds no in-memory state', async () => {
    const cap = 5
    const ledger = makeLedgerClient(cap)
    // Spend recorded by a PRIOR isolate; this gate instance has made no calls yet.
    await recordAiSpend(ledger, { actorId: null, purpose: 'vision_analysis', costUsd: cap })
    ledger.rpc.mockClear()
    // First-ever check on this "fresh" isolate: there is no in-memory counter to
    // short-circuit on, so it MUST read the ledger — and blocks from that read.
    const v1 = await checkAiSpendAllowed(ledger, { actorId: null, estimatedCostUsd: 0.01 })
    expect(v1.allowed).toBe(false)
    expect(ledger.rpc).toHaveBeenCalledTimes(1)

    // And a literally fresh module import (simulated cold start) behaves identically.
    vi.resetModules()
    const fresh = await import(
      '../../../../../supabase/functions/mobile-api/_shared/kael/spend-gate'
    )
    const v2 = await fresh.checkAiSpendAllowed(ledger, { actorId: null, estimatedCostUsd: 0.01 })
    expect(v2.allowed).toBe(false)
  })

  it('(3) reads the DB counter before EVERY call', async () => {
    const ledger = makeLedgerClient(100)
    await checkAiSpendAllowed(ledger, { actorId: null })
    await checkAiSpendAllowed(ledger, { actorId: null })
    await checkAiSpendAllowed(ledger, { actorId: null })
    const checks = ledger.rpc.mock.calls.filter((c) => c[0] === 'check_kael_ai_spend')
    expect(checks.length).toBe(3)
  })
})

describe('S4 callAI enforcement (fail-closed, no network, no fake success)', () => {
  const req = {
    provider: 'deepseek' as const,
    model: 'deepseek-v4-flash',
    messages: [],
    purpose: 'intent_classification' as const,
  }
  const secrets = { deepseekApiKey: 'test-key' }

  it('kill-switch ON → AI_DISABLED without any provider fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    ;(globalThis as { Deno?: unknown }).Deno = {
      env: { get: (k: string) => (k === 'KAEL_AI_KILL_SWITCH' ? 'true' : undefined) },
    }
    // deno-lint type: callAI accepts AIRequest + secrets
    const res = await callAI(req as never, secrets as never)
    expect(res.success).toBe(false)
    expect((res as { code: string }).code).toBe('AI_DISABLED')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('spend cap exceeded → SPEND_CAP without any provider fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const ledger = makeLedgerClient(0) // any positive estimate is over cap
    const res = await callAI(req as never, secrets as never, {
      client: ledger,
      actorId: null,
      estimatedCostUsd: 0.01,
    })
    expect(res.success).toBe(false)
    expect((res as { code: string }).code).toBe('SPEND_CAP')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
