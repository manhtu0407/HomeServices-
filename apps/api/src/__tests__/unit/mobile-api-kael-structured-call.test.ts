import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/circuit-breaker'
import { runCustomerAssistant } from '../../../../../supabase/functions/mobile-api/_shared/kael/customer-assistant'
import { classifyIntent } from '../../../../../supabase/functions/mobile-api/_shared/kael/intent'
import { searchMarketPrice } from '../../../../../supabase/functions/mobile-api/_shared/kael/market'
import { reviewScopeChange, computeScopeChangeEstimate } from '../../../../../supabase/functions/mobile-api/_shared/kael/scope-change'
import { callStructuredAI } from '../../../../../supabase/functions/mobile-api/_shared/kael/structured-call'
import type { AIRequest, EdgeGuardClient } from '../../../../../supabase/functions/mobile-api/_shared/kael/types'
import { runWorkerAssist } from '../../../../../supabase/functions/mobile-api/_shared/kael/worker-assist'

const request: AIRequest = {
  purpose: 'worker_assist',
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  messages: [{ role: 'user', content: 'safe structured request' }],
  maxRetries: 0,
}

describe('mobile-api Kael structured output health', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    KAEL_CIRCUIT_BREAKER.reset()
  })

  it('records one schema failure without opening, then blocks before fetch after the third', async () => {
    const guard = makeCircuitRpc()
    const fetchSpy = vi.fn(async () => deepseekResponse('{"unexpected":true}'))
    vi.stubGlobal('fetch', fetchSpy)
    const secrets = {
      deepseekApiKey: 'deepseek-test',
      durableGuardsEnabled: true,
      durableGuardClient: guard.client,
    }
    const schema = z.object({ answer: z.string() })

    await expect(callStructuredAI(request, schema, secrets)).resolves.toMatchObject({
      success: false,
      code: 'SCHEMA_INVALID',
    })
    expect(guard.isOpen('worker_assist:deepseek')).toBe(false)
    expect(guard.successCalls).toBe(0)

    await callStructuredAI(request, schema, secrets)
    await callStructuredAI(request, schema, secrets)
    expect(guard.isOpen('worker_assist:deepseek')).toBe(true)
    expect(guard.successCalls).toBe(0)

    await expect(callStructuredAI(request, schema, secrets)).resolves.toMatchObject({
      success: false,
      code: 'OPEN_CIRCUIT',
    })
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('lets the intent provider loop skip a persistently bad model and use its fallback', async () => {
    const guard = makeCircuitRpc()
    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('deepseek')) {
        return deepseekResponse('{"unexpected":true}')
      }
      return anthropicResponse(JSON.stringify({
        service_type: 'plumbing',
        problem_slug: 'pipe_leak',
        confidence: 0.88,
        needs_clarification: false,
      }))
    })
    vi.stubGlobal('fetch', fetchSpy)
    const secrets = {
      deepseekApiKey: 'deepseek-test',
      anthropicApiKey: 'anthropic-test',
      durableGuardsEnabled: true,
      durableGuardClient: guard.client,
    }

    for (let index = 0; index < 4; index += 1) {
      await expect(classifyIntent(
        'plumbing',
        ['Ống rò rỉ'],
        'Lavabo rò nước',
        secrets,
      )).resolves.toMatchObject({ success: true })
    }

    const urls = fetchSpy.mock.calls.map(([input]) => String(input))
    expect(urls.filter((url) => url.includes('deepseek'))).toHaveLength(3)
    expect(urls.filter((url) => url.includes('anthropic'))).toHaveLength(4)
    expect(guard.isOpen('intent_classification:deepseek')).toBe(true)
  })

  it('fails open when durable circuit RPCs throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => deepseekResponse('{"answer":"safe"}')))
    const rpc = vi.fn(async () => {
      throw new Error('guard unavailable')
    })

    await expect(callStructuredAI(request, z.object({ answer: z.string() }), {
      deepseekApiKey: 'deepseek-test',
      durableGuardsEnabled: true,
      durableGuardClient: { rpc },
    })).resolves.toMatchObject({
      success: true,
      data: { answer: 'safe' },
    })
  })

  it('does not count the market insufficient-data sentinel as malformed schema', async () => {
    const guard = makeCircuitRpc()
    vi.stubGlobal('fetch', vi.fn(async () => deepseekResponse(
      '{"error":"insufficient_trusted_data"}',
    )))

    await expect(searchMarketPrice(
      'plumbing',
      'pipe_leak',
      'small',
      'q7',
      {
        perplexityApiKey: 'perplexity-test',
        sourceTrustPerplexityFilterEnabled: false,
        durableGuardsEnabled: true,
        durableGuardClient: guard.client,
      },
    )).resolves.toMatchObject({ success: false })

    expect(guard.calls.filter(({ fn, args }) =>
      fn === 'record_circuit_failure' &&
      args.p_key === 'market_lookup:perplexity'
    )).toHaveLength(0)
    expect(guard.calls).toContainEqual(expect.objectContaining({
      fn: 'record_circuit_success',
      args: expect.objectContaining({ p_key: 'market_lookup:perplexity' }),
    }))
  })

  it('preserves worker and customer fallback metadata for schema-invalid responses', async () => {
    const invalidCall = vi.fn(async () => ({
      success: true as const,
      content: '{"unexpected":true}',
      usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.0001 },
      latencyMs: 12,
    }))

    const worker = await runWorkerAssist({
      job: {
        id: 'job-1',
        service_type: 'plumbing',
        description: 'Lavabo rò nước',
      },
      question: 'Tôi nên kiểm tra gì trước?',
      secrets: {},
      callAI: invalidCall,
    })
    expect(worker).toMatchObject({
      fallback_used: true,
      provider_attempts: [
        expect.objectContaining({ result: 'schema_invalid' }),
        expect.objectContaining({ result: 'schema_invalid' }),
      ],
    })

    const customer = await runCustomerAssistant({
      message: 'Giải thích quy trình đặt lịch giúp tôi.',
      language: 'vi',
      surface: 'customer_normal',
      secrets: { knowledgeRetrievalEnabled: false },
      callAI: invalidCall,
    })
    expect(customer.fallback_used).toBe(true)
    expect(customer.trace).toEqual(expect.arrayContaining([
      expect.objectContaining({
        validation: { status: 'fail', reason_code: 'INVALID_SCHEMA' },
      }),
    ]))
  })

  it('preserves both scope-change fallback contracts on schema failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => anthropicResponse('{"unexpected":true}')))
    const secrets = { anthropicApiKey: 'anthropic-test' }

    const review = await reviewScopeChange({
      serviceType: 'plumbing',
      originalDescription: 'Lavabo rò nước',
      originalProblemSummary: 'Ống xả rò',
      originalComplexity: 'small',
      originalPriceMin: 150_000,
      originalPriceMax: 250_000,
      requestedDescription: 'Cần thay siphon',
      requestedPriceMin: 250_000,
      requestedPriceMax: 420_000,
      reason: 'Siphon nứt tại hiện trường',
    }, secrets)
    expect(review).toMatchObject({
      fallback_used: true,
      failure_reason: 'INVALID_SCHEMA',
      provider: 'anthropic',
    })

    const estimate = await computeScopeChangeEstimate({
      serviceType: 'plumbing',
      district: 'Quận 7',
      originalDescription: 'Lavabo rò nước',
      originalProblemSummary: 'Ống xả rò',
      originalComplexity: 'small',
      originalPriceMin: 150_000,
      originalPriceMax: 250_000,
      workerReportedDescription: 'Siphon nứt, cần thay',
      workerReason: 'Bằng chứng hiện trường cho thấy vết nứt',
    }, secrets)
    expect(estimate).toMatchObject({
      fallback_used: true,
      failure_reason: 'INVALID_SCHEMA',
      provider: 'anthropic',
    })
  })

  it('routes every live structured Edge caller through the shared wrapper', () => {
    const callers: Record<string, number> = {
      'intent.ts': 2,
      'vision.ts': 2,
      'market.ts': 2,
      'scope-change.ts': 4,
      'worker-assist.ts': 1,
      'customer-assistant.ts': 1,
      'price-synthesis-ab.ts': 1,
    }
    for (const [file, expectedCalls] of Object.entries(callers)) {
      const source = readFileSync(
        new URL(`../../../../../supabase/functions/mobile-api/_shared/kael/${file}`, import.meta.url),
        'utf8',
      )
      expect(source.match(/callStructuredAI\(/g)).toHaveLength(expectedCalls)
      expect(source).not.toContain('safeParseJSON')
      expect(source).not.toContain('function parseJsonObject')
    }
  })
})

function makeCircuitRpc() {
  const schemaFailures = new Map<string, number>()
  const open = new Set<string>()
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  let successCalls = 0
  const client: EdgeGuardClient = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
      calls.push({ fn, args })
      const key = String(args.p_key ?? '')
      if (fn === 'is_circuit_open') {
        return { data: open.has(key), error: null }
      }
      if (fn === 'record_circuit_failure') {
        const count = (schemaFailures.get(key) ?? 0) + 1
        schemaFailures.set(key, count)
        if (args.p_kind === 'schema' && count >= 3) open.add(key)
        return { data: [{ is_open: open.has(key) }], error: null }
      }
      if (fn === 'record_circuit_success') {
        successCalls += 1
        schemaFailures.delete(key)
        open.delete(key)
        return { data: null, error: null }
      }
      return { data: null, error: null }
    }),
  }
  return {
    client,
    calls,
    isOpen: (key: string) => open.has(key),
    get successCalls() {
      return successCalls
    },
  }
}

function deepseekResponse(content: string) {
  return new Response(JSON.stringify({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 20, completion_tokens: 10 },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function anthropicResponse(content: string) {
  return new Response(JSON.stringify({
    content: [{ type: 'text', text: content }],
    usage: { input_tokens: 20, output_tokens: 10 },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
