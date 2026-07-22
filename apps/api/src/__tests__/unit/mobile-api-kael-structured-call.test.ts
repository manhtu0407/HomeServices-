import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import { z } from 'zod'

import { KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/circuit-breaker'
import { runCustomerAssistant } from '../../../../../supabase/functions/mobile-api/_shared/kael/customer-assistant'
import { classifyIntent, diagnoseIntake } from '../../../../../supabase/functions/mobile-api/_shared/kael/intent'
import { searchMarketPrice } from '../../../../../supabase/functions/mobile-api/_shared/kael/market'
import { reviewScopeChange, computeScopeChangeEstimate } from '../../../../../supabase/functions/mobile-api/_shared/kael/scope-change'
import { callStructuredAI } from '../../../../../supabase/functions/mobile-api/_shared/kael/structured-call'
import type { AIRequest, EdgeGuardClient } from '../../../../../supabase/functions/mobile-api/_shared/kael/types'
import { runWorkerAssist } from '../../../../../supabase/functions/mobile-api/_shared/kael/worker-assist'
import { allowKaelSpendForTest } from './kael-spend-test-helper'

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

    await expect(callStructuredAI(request, schema, secrets, undefined)).resolves.toMatchObject({
      success: false,
      code: 'SCHEMA_INVALID',
    })
    expect(guard.isOpen('worker_assist:deepseek')).toBe(false)
    expect(guard.successCalls).toBe(0)

    await callStructuredAI(request, schema, secrets, undefined)
    await callStructuredAI(request, schema, secrets, undefined)
    expect(guard.isOpen('worker_assist:deepseek')).toBe(true)
    expect(guard.successCalls).toBe(0)

    await expect(callStructuredAI(request, schema, secrets, undefined)).resolves.toMatchObject({
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
        allowKaelSpendForTest('customer-1'),
      )).resolves.toMatchObject({ success: true })
    }

    const urls = fetchSpy.mock.calls.map(([input]) => String(input))
    expect(urls.filter((url) => url.includes('deepseek'))).toHaveLength(3)
    expect(urls.filter((url) => url.includes('anthropic'))).toHaveLength(4)
    expect(guard.isOpen('intent_classification:deepseek')).toBe(true)
  })

  it('accepts a valid intent core while discarding malformed optional model enrichment', async () => {
    const fetchSpy = vi.fn(async () => deepseekResponse(JSON.stringify({
      service_type: 'handyman',
      problem_slug: 'drill_or_mount_shelf',
      confidence: '0.86',
      needs_clarification: true,
      missing_slots: [
        'task_types_and_total_count',
        'invented_slot',
        'task_types_and_total_count',
      ],
      profile_facts: {
        task_types_and_total_count: 'Một vị trí cần khoan',
        invented_driver: 'Không được đưa vào artifact',
      },
      safety_signals: ['invented_hazard'],
      clarification_question: 'Kael cần biết: có bao nhiêu việc, và cần dụng cụ nào?',
      scope_signal: 'in_scope',
      suggested_service: 'painting',
      customer_sentiment: 'confused',
    })))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await diagnoseIntake(
      'handyman',
      ['Khoan/lắp kệ'],
      'Tôi cần khoan tường để lắp giá treo máy tập.',
      { deepseekApiKey: 'deepseek-test' },
      allowKaelSpendForTest('customer-1'),
      undefined,
      'vi',
    )

    expect(result).toMatchObject({
      success: true,
      intent: {
        service_type: 'handyman',
        problem_slug: 'drill_or_mount_shelf',
        confidence: 0.86,
        needs_clarification: true,
        missing_slots: ['task_types_and_total_count'],
        profile_facts: { task_types_and_total_count: 'Một vị trí cần khoan' },
        safety_signals: [],
        clarification_question: null,
        scope_signal: 'in_scope',
      },
    })
    expect(result.success && result.intent).not.toHaveProperty('suggested_service')
    expect(result.success && result.intent).not.toHaveProperty('customer_sentiment')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
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
    }, undefined)).resolves.toMatchObject({
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
      spendGate: allowKaelSpendForTest('worker-1'),
      callAI: invalidCall,
    })
    expect(worker).toMatchObject({
      fallback_used: true,
      provider_attempts: [
        expect.objectContaining({ result: 'schema_invalid' }),
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

  it('fails closed without a price when scope-change estimation schema validation fails', async () => {
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
    }, secrets, allowKaelSpendForTest('worker-1'))
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
    }, secrets, allowKaelSpendForTest('worker-1'))
    expect(estimate).toMatchObject({
      outcome: 'inspection_required',
      requires_human_inspection: true,
      fallback_used: true,
      failure_reason: 'INVALID_SCHEMA',
      provider: 'anthropic',
    })
    expect(estimate).not.toHaveProperty('price_min')
    expect(estimate).not.toHaveProperty('price_max')
    expect(estimate).not.toHaveProperty('complexity_assessment')
  })

  it('persists scope-change attempts exactly once across failure, direct, and incident paths', () => {
    const source = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/services/scope-change.service.ts', import.meta.url),
      'utf8',
    )
    const failClosedGuard = source.indexOf('if (estimate.fallback_used')
    const failureAudit = source.indexOf('await logScopeChangeEstimateApiCall(client, jobId, estimate)', failClosedGuard)
    const durableDirectAudit = source.indexOf('buildDirectScopeEffectPayloads(jobId, enrichedEstimate, learningInput)')
    const directReturn = source.indexOf('return response')
    const incidentAudit = source.indexOf('await logScopeChangeEstimateApiCall(client, jobId, enrichedEstimate)', directReturn)

    expect(failureAudit).toBeGreaterThan(failClosedGuard)
    expect(durableDirectAudit).toBeGreaterThan(failureAudit)
    expect(durableDirectAudit).toBeLessThan(directReturn)
    expect(incidentAudit).toBeGreaterThan(directReturn)
    expect(source.match(/logScopeChangeEstimateApiCall\(client, jobId,/g)).toHaveLength(2)
  })

  it('routes every live structured Edge caller through the shared wrapper', () => {
    const callers: Record<string, number> = {
      'intent.ts': 2,
      'vision.ts': 2,
      'market.ts': 2,
      'scope-change.ts': 4,
      'worker-assist.ts': 1,
      'customer-assistant.ts': 1,
      'job-incident.ts': 1,
      'price-synthesis-ab.ts': 1,
      'cron/process-learning-queue.ts': 1,
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

  it('requires every live structured Edge callsite to declare spend handling', () => {
    const missingSpendPolicy = structuredEdgeCallsites()
      .filter((callsite) => callsite.argumentCount < 4 || callsite.spendArgument === 'undefined')

    expect(missingSpendPolicy).toEqual([])
  })
})

function structuredEdgeCallsites() {
  const root = new URL(
    '../../../../../supabase/functions/mobile-api/_shared/kael/',
    import.meta.url,
  )
  const files = walkTypeScriptFiles(root)
  const callsites: Array<{
    file: string
    line: number
    argumentCount: number
    spendArgument: string | null
  }> = []

  for (const file of files) {
    const source = readFileSync(file.url, 'utf8')
    const parsed = ts.createSourceFile(file.name, source, ts.ScriptTarget.Latest, true)
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'callStructuredAI'
      ) {
        callsites.push({
          file: file.name,
          line: parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1,
          argumentCount: node.arguments.length,
          spendArgument: node.arguments[3]?.getText(parsed) ?? null,
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(parsed)
  }
  return callsites
}

function walkTypeScriptFiles(
  directory: URL,
  prefix = '',
): Array<{ name: string; url: URL }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    if (entry.isDirectory()) return walkTypeScriptFiles(url, name)
    return entry.isFile() && entry.name.endsWith('.ts')
      ? [{ name, url }]
      : []
  })
}

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
