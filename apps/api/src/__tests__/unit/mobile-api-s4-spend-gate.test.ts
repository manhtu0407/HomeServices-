/**
 * Durable spend enforcement across ledger, provider, and reachable Edge seams.
 * Failed provider attempts retain a conservative estimate because transport errors
 * cannot prove that provider-side billing did not occur.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  finalizeAiSpend,
  isKaelAiKillSwitchEnabled,
  KAEL_AI_SPEND_CAPS,
  reserveAiSpend,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/spend-gate'
import { classifyIntent } from '../../../../../supabase/functions/mobile-api/_shared/kael/intent'
import { callAI } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/provider-client'
import { runWorkerAssist } from '../../../../../supabase/functions/mobile-api/_shared/kael/worker-assist'

// A stateful mock that plays the role of the durable DB ledger. reserve_kael_ai_spend
// does an ATOMIC check + insert of the estimate (returns the new row id); finalize
// reconciles that row to actual cost or releases it. The totals live in the mock (the
// "DB"), never in the gate module — which is the whole point of the durability fix.
function makeLedgerClient(capUsd: number) {
  const rows = new Map<number, number>()
  let nextId = 1
  const sum = () => [...rows.values()].reduce((a, b) => a + b, 0)
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'reserve_kael_ai_spend') {
      const est = Number(args.p_estimated_usd ?? 0)
      if (sum() + est > capUsd) {
        return { data: [{ allowed: false, blocked_scope: 'global_daily', reservation_id: null }], error: null }
      }
      const id = nextId++
      rows.set(id, est)
      return { data: [{ allowed: true, blocked_scope: null, reservation_id: id }], error: null }
    }
    if (fn === 'finalize_kael_ai_spend') {
      const id = Number(args.p_reservation_id)
      const actual = Number(args.p_actual_usd ?? 0)
      if (actual <= 0) rows.delete(id)
      else rows.set(id, actual)
      return { data: null, error: null }
    }
    if (fn === 'record_kael_ai_spend') {
      rows.set(nextId++, Number(args.p_cost_usd ?? 0))
      return { data: null, error: null }
    }
    return { data: null, error: null }
  })
  return { rpc, getTotal: sum }
}

afterEach(() => {
  delete (globalThis as { Deno?: unknown }).Deno
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('S4 spend-gate: reserve verdicts and fail-open policy', () => {
  it('allows + returns a reservation id when under cap', async () => {
    const ledger = makeLedgerClient(10)
    const r = await reserveAiSpend(ledger, { actorId: null, estimatedCostUsd: 1 })
    expect(r.allowed).toBe(true)
    expect(r.scope).toBeNull()
    expect(typeof r.reservationId).toBe('number')
  })

  it('blocks (no reservation) when estimate would exceed cap, with the blocked scope', async () => {
    const ledger = makeLedgerClient(0)
    const r = await reserveAiSpend(ledger, { actorId: null, estimatedCostUsd: 0.5 })
    expect(r.allowed).toBe(false)
    expect(r.scope).toBe('global_daily')
    expect(r.reservationId).toBeNull()
  })

  it('fails OPEN (allows + logs) on an rpc error — never wrongly blocks a real user', async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: { code: 'PGRST500' } })) }
    const r = await reserveAiSpend(client, { actorId: 'u1', estimatedCostUsd: 1 })
    expect(r.allowed).toBe(true)
    expect(r.scope).toBe('reserve_error_fail_open')
    expect(r.reservationId).toBeNull()
  })

  it('fails OPEN when no rpc surface is reachable', async () => {
    const r = await reserveAiSpend({}, { actorId: 'u1', estimatedCostUsd: 1 })
    expect(r.allowed).toBe(true)
    expect(r.scope).toBe('no_rpc_fail_open')
  })

  it('finalize reconciles a reservation to actual cost, and releases on zero', async () => {
    const ledger = makeLedgerClient(10)
    const r = await reserveAiSpend(ledger, { actorId: 'u1', estimatedCostUsd: 0.01, purpose: 'vision_analysis' })
    await finalizeAiSpend(ledger, { reservationId: r.reservationId, actorId: 'u1', purpose: 'vision_analysis', actualUsd: 0.02 })
    expect(ledger.getTotal()).toBeCloseTo(0.02)
    const r2 = await reserveAiSpend(ledger, { actorId: 'u1', estimatedCostUsd: 0.01, purpose: 'vision_analysis' })
    await finalizeAiSpend(ledger, { reservationId: r2.reservationId, actorId: 'u1', purpose: 'vision_analysis', actualUsd: 0 })
    expect(ledger.getTotal()).toBeCloseTo(0.02) // released, not counted
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
    const r = await reserveAiSpend(ledger, { actorId: null, estimatedCostUsd: 1 })
    expect(r.allowed).toBe(true)
    await finalizeAiSpend(ledger, { reservationId: r.reservationId, actorId: null, purpose: 'vision_analysis', actualUsd: cap })
    const blocked = await reserveAiSpend(ledger, { actorId: null, estimatedCostUsd: 0.01 })
    expect(blocked.allowed).toBe(false)
    expect(blocked.scope).toBe('global_daily')
  })

  it('(2) a cold isolate blocks from the ledger read alone — gate holds no in-memory state', async () => {
    const cap = 5
    const ledger = makeLedgerClient(cap)
    // Spend recorded by a PRIOR isolate; this gate instance has made no calls yet.
    const r = await reserveAiSpend(ledger, { actorId: null, estimatedCostUsd: cap })
    await finalizeAiSpend(ledger, { reservationId: r.reservationId, actorId: null, purpose: 'vision_analysis', actualUsd: cap })
    ledger.rpc.mockClear()
    // First-ever reserve on this "fresh" isolate: no in-memory counter to short-circuit
    // on, so it MUST read the ledger — and blocks from that read.
    const v1 = await reserveAiSpend(ledger, { actorId: null, estimatedCostUsd: 0.01 })
    expect(v1.allowed).toBe(false)
    expect(ledger.rpc).toHaveBeenCalledTimes(1)

    // And a literally fresh module import (simulated cold start) behaves identically.
    vi.resetModules()
    const fresh = await import(
      '../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/spend-gate'
    )
    const v2 = await fresh.reserveAiSpend(ledger, { actorId: null, estimatedCostUsd: 0.01 })
    expect(v2.allowed).toBe(false)
  })

  it('(3) reserves against the DB before EVERY call', async () => {
    const ledger = makeLedgerClient(100)
    await reserveAiSpend(ledger, { actorId: null })
    await reserveAiSpend(ledger, { actorId: null })
    await reserveAiSpend(ledger, { actorId: null })
    const reserves = ledger.rpc.mock.calls.filter((c) => c[0] === 'reserve_kael_ai_spend')
    expect(reserves.length).toBe(3)
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

describe('S4 reachable Edge callers', () => {
  it('blocks customer intent provider I/O when the durable ledger cap is zero', async () => {
    const fetchSpy = vi.fn(async () => deepseekResponse())
    vi.stubGlobal('fetch', fetchSpy)
    const ledger = makeLedgerClient(0)

    const result = await classifyIntent(
      'plumbing',
      ['Ống rò rỉ'],
      'Lavabo rò nước',
      { deepseekApiKey: 'deepseek-test', anthropicApiKey: 'anthropic-test' },
      { client: ledger, actorId: 'customer-1' },
    )

    expect(result.success).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('blocks worker-assist provider I/O when the durable ledger cap is zero', async () => {
    const fetchSpy = vi.fn(async () => deepseekResponse())
    vi.stubGlobal('fetch', fetchSpy)
    const ledger = makeLedgerClient(0)

    const result = await runWorkerAssist({
      job: {
        id: 'job-1',
        service_type: 'plumbing',
        description: 'Lavabo rò nước',
      },
      question: 'Tôi nên kiểm tra gì trước?',
      secrets: { deepseekApiKey: 'deepseek-test', anthropicApiKey: 'anthropic-test' },
      spendGate: { client: ledger, actorId: 'worker-1' },
    })

    expect(result.fallback_used).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('S4 retry accounting', () => {
  it('reserves the full retry envelope before the first provider attempt', async () => {
    const fetchSpy = vi.fn(async () => deepseekResponse())
    vi.stubGlobal('fetch', fetchSpy)
    const ledger = makeLedgerClient(0.5)

    const res = await callAI({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      messages: [],
      purpose: 'intent_classification',
      maxRetries: 1,
    }, { deepseekApiKey: 'test-key' }, {
      client: ledger,
      actorId: null,
      estimatedCostUsd: 0.3,
    })

    expect(res).toMatchObject({ success: false, code: 'SPEND_CAP' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps conservative spend for failed attempts when a retry succeeds', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response('busy', { status: 500 }))
      .mockResolvedValueOnce(deepseekResponse())
    vi.stubGlobal('fetch', fetchSpy)
    const ledger = makeLedgerClient(10)

    const resultPromise = callAI({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      messages: [],
      purpose: 'intent_classification',
      maxRetries: 1,
    }, { deepseekApiKey: 'test-key' }, {
      client: ledger,
      actorId: 'customer-1',
      estimatedCostUsd: 0.3,
    })
    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected provider success')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(ledger.getTotal()).toBeCloseTo(0.3 + result.usage.costUsd, 8)
  })

  it('keeps the estimate when a successful response omits usage metadata', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
    })))
    vi.stubGlobal('fetch', fetchSpy)
    const ledger = makeLedgerClient(10)

    const result = await callAI({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      messages: [],
      purpose: 'intent_classification',
      maxRetries: 0,
    }, { deepseekApiKey: 'test-key' }, {
      client: ledger,
      actorId: 'customer-1',
      estimatedCostUsd: 0.25,
    })

    expect(result.success).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(ledger.getTotal()).toBeCloseTo(0.25, 8)
  })

  it('bounds retries and retains the conservative envelope after terminal failure', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.fn(async () => new Response('busy', { status: 500 }))
    vi.stubGlobal('fetch', fetchSpy)
    const ledger = makeLedgerClient(10)

    const resultPromise = callAI({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      messages: [],
      purpose: 'intent_classification',
      maxRetries: 3,
    }, { deepseekApiKey: 'test-key' }, {
      client: ledger,
      actorId: 'customer-1',
      estimatedCostUsd: 0.2,
    })
    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result).toMatchObject({ success: false, code: 'HTTP_500' })
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(ledger.getTotal()).toBeCloseTo(0.6, 8)
  })
})

function deepseekResponse() {
  return new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          service_type: 'plumbing',
          problem_slug: 'pipe_leak',
          confidence: 0.9,
          needs_clarification: false,
        }),
      },
    }],
    usage: { prompt_tokens: 20, completion_tokens: 10 },
  }))
}
