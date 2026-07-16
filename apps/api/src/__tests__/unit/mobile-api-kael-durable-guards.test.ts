import { afterEach, describe, expect, it, vi } from 'vitest'

import { KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/circuit-breaker'
import {
  isDurableCircuitOpen,
  recordDurableCircuitFailure,
  recordDurableCircuitSuccess,
  takeDurableKaelChatRateLimit,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/durable-guards'
import { callAI } from '../../../../../supabase/functions/mobile-api/_shared/kael/provider-client'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  KAEL_CIRCUIT_BREAKER.reset()
})

describe('mobile-api Kael durable circuit adapter', () => {
  it('shares a provider-global credit circuit across clients and purposes', async () => {
    const database = makeSharedCircuitDatabase()

    await recordDurableCircuitFailure(database.clientA, {
      purpose: 'intent_classification',
      provider: 'deepseek',
      errorCode: 'HTTP_402',
    })

    await expect(isDurableCircuitOpen(
      database.clientB,
      'worker_assist',
      'deepseek',
    )).resolves.toBe(true)
    expect(database.calls).toContainEqual(expect.objectContaining({
      client: 'A',
      fn: 'record_circuit_failure',
      args: expect.objectContaining({
        p_scope: 'provider',
        p_key: 'deepseek',
        p_kind: 'credit',
      }),
    }))
  })

  it('keeps timeout/schema/server failures purpose-scoped and clears the matching purpose on success', async () => {
    const database = makeSharedCircuitDatabase()
    await recordDurableCircuitFailure(database.clientA, {
      purpose: 'vision_analysis',
      provider: 'anthropic',
      errorCode: 'TIMEOUT',
    })

    await expect(isDurableCircuitOpen(
      database.clientB,
      'vision_analysis',
      'anthropic',
    )).resolves.toBe(true)
    await expect(isDurableCircuitOpen(
      database.clientB,
      'scope_change',
      'anthropic',
    )).resolves.toBe(false)

    await recordDurableCircuitSuccess(
      database.clientB,
      'vision_analysis',
      'anthropic',
    )
    await expect(isDurableCircuitOpen(
      database.clientA,
      'vision_analysis',
      'anthropic',
    )).resolves.toBe(false)
  })

  it('does not let a purpose-level success clear a provider-global circuit', async () => {
    const database = makeSharedCircuitDatabase()
    await recordDurableCircuitFailure(database.clientA, {
      purpose: 'intent_classification',
      provider: 'deepseek',
      errorCode: 'HTTP_402',
    })

    await recordDurableCircuitSuccess(
      database.clientB,
      'worker_assist',
      'deepseek',
    )

    await expect(isDurableCircuitOpen(
      database.clientA,
      'scope_change',
      'deepseek',
    )).resolves.toBe(true)
  })

  it('fails open when the circuit RPC errors', async () => {
    const client = {
      rpc: vi.fn(async () => ({ data: null, error: { code: 'DB_DOWN' } })),
    }

    await expect(isDurableCircuitOpen(
      client,
      'intent_classification',
      'deepseek',
    )).resolves.toBe(false)
  })
})

describe('mobile-api Kael durable rate adapter', () => {
  it('returns the durable minute/hour verdict without exposing the key', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ allowed: false, retry_after_ms: 60_000, reason: 'minute' }],
      error: null,
    }))

    await expect(takeDurableKaelChatRateLimit(
      { rpc },
      '00000000-0000-0000-0000-000000000001',
    )).resolves.toEqual({
      allowed: false,
      retryAfterMs: 60_000,
      reason: 'minute',
    })
    expect(rpc).toHaveBeenCalledWith('rate_take', expect.objectContaining({
      p_scope: 'kael_chat',
      p_cost: 1,
      p_config: {
        buckets: [
          { name: 'minute', max_tokens: 5, refill_rate: 5, refill_interval_ms: 60_000 },
          { name: 'hour', max_tokens: 20, refill_rate: 20, refill_interval_ms: 3_600_000 },
        ],
      },
    }))
  })

  it('fails open on RPC errors and timeouts', async () => {
    await expect(takeDurableKaelChatRateLimit({
      rpc: vi.fn(async () => ({ data: null, error: { code: 'DB_DOWN' } })),
    }, 'actor-1')).resolves.toEqual({
      allowed: true,
      retryAfterMs: 0,
      reason: null,
    })

    vi.useFakeTimers()
    const pending = takeDurableKaelChatRateLimit({
      rpc: vi.fn(() =>
        new Promise<{ data: unknown; error: unknown }>(() => undefined)
      ),
    }, 'actor-2')
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(pending).resolves.toEqual({
      allowed: true,
      retryAfterMs: 0,
      reason: null,
    })
  })
})

describe('mobile-api Kael callAI durable circuit wiring', () => {
  const request = {
    purpose: 'intent_classification' as const,
    provider: 'deepseek' as const,
    model: 'deepseek-v4-flash',
    messages: [{ role: 'user' as const, content: 'safe metadata only' }],
    maxRetries: 0,
  }

  it('blocks before fetch when the shared circuit is open', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const rpc = vi.fn(async (fn: string) => ({
      data: fn === 'is_circuit_open' ? true : null,
      error: null,
    }))

    await expect(callAI(request, {
      deepseekApiKey: 'test-key',
      durableGuardsEnabled: true,
      durableGuardClient: { rpc },
    })).resolves.toMatchObject({ success: false, code: 'OPEN_CIRCUIT' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('records transport failure in the durable provider-global scope', async () => {
    const sensitiveBody = 'provider-private-credit-detail'
    const fetchSpy = vi.fn(async () => new Response(sensitiveBody, { status: 402 }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', fetchSpy)
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
      calls.push({ fn, args })
      return { data: fn === 'is_circuit_open' ? false : null, error: null }
    })

    await expect(callAI(request, {
      deepseekApiKey: 'test-key',
      durableGuardsEnabled: true,
      durableGuardClient: { rpc },
    })).resolves.toMatchObject({ success: false, code: 'HTTP_402' })
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'error' }),
    )
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(sensitiveBody)
    errorSpy.mockRestore()
    expect(calls).toContainEqual({
      fn: 'record_circuit_failure',
      args: expect.objectContaining({
        p_scope: 'provider',
        p_key: 'deepseek',
        p_kind: 'credit',
      }),
    })
  })

  it('continues through provider success when the guard store is unavailable', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchSpy)
    const rpc = vi.fn(async () => ({ data: null, error: { code: 'DB_DOWN' } }))

    await expect(callAI(request, {
      deepseekApiKey: 'test-key',
      durableGuardsEnabled: true,
      durableGuardClient: { rpc },
    })).resolves.toMatchObject({ success: true })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

function makeSharedCircuitDatabase() {
  const open = new Set<string>()
  const calls: Array<{
    client: 'A' | 'B'
    fn: string
    args: Record<string, unknown>
  }> = []
  const client = (name: 'A' | 'B') => ({
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      calls.push({ client: name, fn, args })
      if (fn === 'record_circuit_failure') {
        open.add(`${String(args.p_scope)}:${String(args.p_key)}`)
        return { data: [{ is_open: true }], error: null }
      }
      if (fn === 'is_circuit_open') {
        const key = String(args.p_key)
        const provider = key.split(':')[1]
        return {
          data: open.has(`purpose_provider:${key}`) || open.has(`provider:${provider}`),
          error: null,
        }
      }
      if (fn === 'record_circuit_success') {
        const key = String(args.p_key)
        open.delete(`purpose_provider:${key}`)
      }
      return { data: null, error: null }
    },
  })
  return { clientA: client('A'), clientB: client('B'), calls }
}
