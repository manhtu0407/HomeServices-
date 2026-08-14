import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import { z } from 'zod'

import { KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/circuit-breaker'
import { runCustomerAssistant } from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/customer-assistant'
import { normalizeAssistantPayload } from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/customer-assistant-provider-output'
import { classifyIntent, diagnoseIntake } from '../../../../../supabase/functions/mobile-api/_shared/kael/tools/intent'
import { searchMarketPrice } from '../../../../../supabase/functions/mobile-api/_shared/kael/tools/market'
import { reviewScopeChange, computeScopeChangeEstimate } from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/scope-change'
import { callStructuredAI } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/structured-call'
import type { AIRequest, EdgeGuardClient } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'
import { runWorkerAssist } from '../../../../../supabase/functions/mobile-api/_shared/kael/agents/worker-assist'
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

  it('validates JSON that follows a closed hidden thinking block without retaining it', async () => {
    const guard = makeCircuitRpc()
    vi.stubGlobal('fetch', vi.fn(async () => deepseekResponse(
      '<think>internal route note</think>\n{"answer":"safe"}',
    )))

    await expect(callStructuredAI(request, z.object({ answer: z.string() }), {
      deepseekApiKey: 'deepseek-test',
      durableGuardsEnabled: true,
      durableGuardClient: guard.client,
    }, undefined)).resolves.toMatchObject({
      success: true,
      data: { answer: 'safe' },
    })
    expect(guard.successCalls).toBe(1)
  })

  it('uses a later top-level JSON response when an earlier envelope fails the schema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => deepseekResponse(
      '{"type":"envelope"}\n{"answer":"safe"}',
    )))

    await expect(callStructuredAI(request, z.object({ answer: z.string() }), {
      deepseekApiKey: 'deepseek-test',
    }, undefined)).resolves.toMatchObject({
      success: true,
      data: { answer: 'safe' },
    })
  })

  it('rejects a payload when a hidden thinking block is not closed', async () => {
    const guard = makeCircuitRpc()
    vi.stubGlobal('fetch', vi.fn(async () => deepseekResponse(
      '<think>{"answer":"not visible"}',
    )))

    await expect(callStructuredAI(request, z.object({ answer: z.string() }), {
      deepseekApiKey: 'deepseek-test',
      durableGuardsEnabled: true,
      durableGuardClient: guard.client,
    }, undefined)).resolves.toMatchObject({
      success: false,
      code: 'SCHEMA_INVALID',
    })
    expect(guard.successCalls).toBe(0)
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
      ],
    })

    const customer = await runCustomerAssistant({
      message: 'Thợ NestScout được xác minh thế nào?',
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

  it('normalizes a singleton JSON wrapper before validating a worker streamed-style response', async () => {
    const wrappedCall = vi.fn(async () => ({
      success: true as const,
      content: JSON.stringify([{
        public_reasoning_summary: ['Xác nhận yêu cầu chỉ cần hướng dẫn an toàn.'],
        text: 'Kiểm tra van nước và chuẩn bị khu vực an toàn trước khi nhận việc.',
      }]),
      usage: { inputTokens: 10, outputTokens: 12, costUsd: 0.0001 },
      latencyMs: 12,
    }))

    const result = await runWorkerAssist({
      job: null,
      question: 'Tôi nên kiểm tra gì trước khi nhận việc sửa vòi nước?',
      secrets: {},
      spendGate: allowKaelSpendForTest('worker-1'),
      callAI: wrappedCall,
    })

    expect(result).toMatchObject({
      fallback_used: false,
      text: 'Kiểm tra van nước và chuẩn bị khu vực an toàn trước khi nhận việc.',
      public_reasoning_summary: ['Xác nhận yêu cầu chỉ cần hướng dẫn an toàn.'],
    })
  })

  it('normalizes bounded multi-part JSON wrappers without accepting arbitrary fields', async () => {
    const wrappedCall = vi.fn(async () => ({
      success: true as const,
      content: JSON.stringify([
        { public_reasoning_summary: ['Xác nhận yêu cầu chỉ cần hướng dẫn an toàn.'] },
        { text: 'Kiểm tra van nước và chuẩn bị khu vực an toàn trước khi nhận việc.' },
        { safety_notes: ['Không tự báo giá mới ngoài luồng Kael trong app.'] },
      ]),
      usage: { inputTokens: 10, outputTokens: 12, costUsd: 0.0001 },
      latencyMs: 12,
    }))

    const result = await runWorkerAssist({
      job: null,
      question: 'Tôi nên kiểm tra gì trước khi nhận việc sửa vòi nước?',
      secrets: {},
      spendGate: allowKaelSpendForTest('worker-1'),
      callAI: wrappedCall,
    })

    expect(result).toMatchObject({
      fallback_used: false,
      text: 'Kiểm tra van nước và chuẩn bị khu vực an toàn trước khi nhận việc.',
      public_reasoning_summary: ['Xác nhận yêu cầu chỉ cần hướng dẫn an toàn.'],
      safety_notes: [
        'Không tự báo giá mới ngoài luồng Kael trong ứng dụng.',
        'Không chuyển trạng thái thay cho bằng chứng thực tế.',
      ],
    })
  })

  it('skips an internal wrapper record before the public worker trace and final reply', async () => {
    const wrappedCall = vi.fn(async () => ({
      success: true as const,
      content: JSON.stringify([
        { type: 'thinking', text: 'private provider rationale' },
        { public_reasoning_summary: ['Checked the worker request boundary.'] },
        { type: 'final', text: 'Check the water valve and prepare the area safely before taking the job.' },
      ]),
      usage: { inputTokens: 10, outputTokens: 12, costUsd: 0.0001 },
      latencyMs: 12,
    }))

    const result = await runWorkerAssist({
      job: null,
      question: 'What should I check before accepting a plumbing job?',
      language: 'en',
      secrets: {},
      spendGate: allowKaelSpendForTest('worker-1'),
      callAI: wrappedCall,
    })

    expect(result).toMatchObject({
      fallback_used: false,
      text: 'Check the water valve and prepare the area safely before taking the job.',
      public_reasoning_summary: ['Checked the worker request boundary.'],
    })
    expect(result.text).not.toContain('private provider rationale')
  })

  it('normalizes a public Customer trace and answer after an internal wrapper record', () => {
    const result = normalizeAssistantPayload([
      { type: 'thinking', answer: 'private provider rationale' },
      { public_reasoning_summary: ['Checked the request boundary.'] },
      { type: 'final', answer: 'Please turn off the water valve and keep the area dry until the worker arrives.' },
    ])

    expect(result).toMatchObject({
      answer: 'Please turn off the water valve and keep the area dry until the worker arrives.',
      public_reasoning_summary: ['Checked the request boundary.'],
    })
    expect((result as { answer?: string }).answer).not.toContain('private provider rationale')
  })

  it('fails closed without a price when scope-change estimation schema validation fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('deepseek')
        ? deepseekResponse('{"unexpected":true}')
        : anthropicResponse('{"unexpected":true}')))
    const secrets = {
      anthropicApiKey: 'anthropic-test',
      deepseekApiKey: 'deepseek-test',
    }

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
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      trace: [
        {
          model: 'claude-sonnet-5',
          safe_metadata: {
            provider_shape: 'schema:keys=unexpected:problem_slug:invalid_type|complexity_assessment:invalid_value|confidence:invalid_type',
          },
        },
        {
          model: 'deepseek-v4-pro',
          safe_metadata: {
            provider_shape: 'schema:keys=unexpected:problem_slug:invalid_type|complexity_assessment:invalid_value|confidence:invalid_type',
          },
        },
      ],
    })
    expect(estimate).not.toHaveProperty('price_min')
    expect(estimate).not.toHaveProperty('price_max')
    expect(estimate).not.toHaveProperty('complexity_assessment')
  })

  it('recovers one schema-invalid scope classification through the configured provider fallback', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(anthropicResponse(JSON.stringify([
        { problem_slug: 'replace_cabinet_hinges' },
        { complexity_assessment: 'small' },
      ])))
      .mockResolvedValueOnce(deepseekResponse(JSON.stringify({
        problem_slug: 'replace_cabinet_hinges',
        complexity_assessment: 'small',
        confidence: 0.92,
        confirmed_facts: [
          'Hai bản lề kim loại nứt tại khớp.',
          'Gỗ và cánh tủ còn nguyên vẹn.',
        ],
        unknowns: [],
        pricing_factors: {
          quantity: 2,
          access_condition: 'normal',
          secondary_damage: 'none_confirmed',
          material_tier: 'standard',
        },
        problem_summary: 'Thay hai bản lề nứt và căn chỉnh lại một cánh tủ.',
        advisory: null,
      })))
    vi.stubGlobal('fetch', fetchSpy)

    const estimate = await computeScopeChangeEstimate({
      serviceType: 'handyman',
      district: 'hcmc_all',
      originalDescription: 'Một cánh tủ bị xệ do hai bản lề lỏng.',
      originalProblemSummary: 'Cần siết và căn chỉnh hai bản lề.',
      originalComplexity: 'small',
      originalPriceMin: 150_000,
      originalPriceMax: 350_000,
      workerReportedDescription: 'Thay hai bản lề âm giảm chấn tiêu chuẩn 35 mm.',
      workerReason: 'Hai bản lề nứt; gỗ và cánh tủ còn nguyên vẹn.',
    }, {
      anthropicApiKey: 'anthropic-test',
      deepseekApiKey: 'deepseek-test',
    }, allowKaelSpendForTest('worker-1'))

    expect(estimate).toMatchObject({
      fallback_used: false,
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      problem_slug: 'replace_cabinet_hinges',
      pricing_factors: { quantity: 2 },
      trace: [
        expect.objectContaining({ validation: { status: 'fail', reason_code: 'INVALID_SCHEMA' } }),
        expect.objectContaining({
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          validation: { status: 'pass', reason_code: 'MODEL_ESCALATION_SCHEMA_INVALID' },
        }),
      ],
    })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const recoveryRequest = JSON.parse(String(fetchSpy.mock.calls[1]?.[1]?.body))
    expect(JSON.stringify(recoveryRequest)).toContain(
      'Previous provider attempt returned a top-level JSON array',
    )
  })

  it('recovers a transient scope provider failure through the configured provider fallback', async () => {
    const fetchSpy = vi.fn()
      .mockRejectedValueOnce(new Error('transient provider response failure'))
      .mockResolvedValueOnce(deepseekResponse(JSON.stringify({
        problem_slug: 'pipe_leak',
        complexity_assessment: 'medium',
        confidence: 0.9,
        confirmed_facts: ['Đã khoanh vùng một điểm rò trên nhánh cấp âm.'],
        unknowns: ['Vật tư thay thế chưa thuộc phạm vi giá.'],
        pricing_factors: {
          quantity: 1,
          access_condition: 'normal',
          secondary_damage: 'none_confirmed',
          material_tier: 'unknown',
        },
        problem_summary: 'Một điểm rò trên nhánh ống cấp âm cần mở tiếp cận và sửa.',
        advisory: null,
      })))
    vi.stubGlobal('fetch', fetchSpy)

    const estimate = await computeScopeChangeEstimate({
      serviceType: 'plumbing',
      district: 'hcmc_all',
      originalDescription: 'Khảo sát áp lực và dò tìm không phá dỡ.',
      originalProblemSummary: 'Áp lực yếu toàn căn hộ.',
      originalComplexity: 'medium',
      originalPriceMin: 700_000,
      originalPriceMax: 1_200_000,
      workerReportedDescription: 'Mở một điểm tiếp cận và sửa một đoạn ống cấp âm bị nứt.',
      workerReason: 'Đã khoanh vùng một điểm rò; không gồm vật tư hoặc hoàn thiện bề mặt.',
    }, {
      anthropicApiKey: 'anthropic-test',
      deepseekApiKey: 'deepseek-test',
    }, allowKaelSpendForTest('worker-1'))

    expect(estimate).toMatchObject({
      fallback_used: false,
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      problem_slug: 'pipe_leak',
      trace: [
        expect.objectContaining({ validation: { status: 'fail', reason_code: 'AI_CALL_FAILED' } }),
        expect.objectContaining({
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          validation: { status: 'pass', reason_code: 'MODEL_ESCALATION_PROVIDER_FAILURE' },
        }),
      ],
    })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('persists scope-change attempts exactly once across failure, direct, and incident paths', () => {
    const requestSource = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/domains/job/scope-change/request.ts', import.meta.url),
      'utf8',
    )
    const supportSource = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/domains/job/scope-change/support.ts', import.meta.url),
      'utf8',
    )
    const effectsSource = [
      'effects.ts',
      'effects-incident.ts',
      'effects-payloads.ts',
      'effects-drain.ts',
    ].map((path) => readFileSync(
      new URL(`../../../../../supabase/functions/mobile-api/_shared/domains/job/scope-change/${path}`, import.meta.url),
      'utf8',
    )).join('\n')
    const failClosedGuard = supportSource.indexOf('if (\n    analysis.fallback_used')
    const failureAudit = supportSource.indexOf(
      'await logScopeChangeEstimateApiCall(client, jobId, analysis)',
      failClosedGuard,
    )
    const durableDirectAudit = requestSource.indexOf('buildDirectScopeEffectPayloads(')
    const directReturn = requestSource.indexOf('if (!incidentProposal)')
    const incidentFinalizer = requestSource.indexOf('await finalizeIncidentScopeChange', directReturn)
    const incidentAudit = effectsSource.indexOf('await logScopeChangeEstimateApiCall(client, jobId, enrichedEstimate)')

    expect(failureAudit).toBeGreaterThan(failClosedGuard)
    expect(durableDirectAudit).toBeGreaterThan(-1)
    expect(directReturn).toBeGreaterThan(durableDirectAudit)
    expect(incidentFinalizer).toBeGreaterThan(directReturn)
    expect(incidentAudit).toBeGreaterThan(-1)
    expect(
      (supportSource + '\n' + effectsSource).match(/logScopeChangeEstimateApiCall\(client, jobId,/g),
    ).toHaveLength(3)
  })

  it('routes every live structured Edge caller through the shared wrapper', () => {
    const callers: Record<string, number> = {
      'tools/intent.ts': 2,
      'tools/vision.ts': 2,
      'tools/market-provider.ts': 1,
      'agents/scope-change.ts': 4,
      'agents/worker-assist.ts': 1,
      'agents/customer-assistant.ts': 1,
      'agents/job-incident.ts': 1,
      'learning/price-synthesis-ab.ts': 1,
      'learning/provider-deepseek.ts': 1,
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
