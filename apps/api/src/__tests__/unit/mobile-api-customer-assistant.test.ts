import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  runCustomerAssistant,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/customer-assistant'
import { KAEL_CIRCUIT_BREAKER } from '../../../../../supabase/functions/mobile-api/_shared/kael/guards/circuit-breaker'
import type {
  AIRequest,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/types'

describe('mobile-api customer Kael assistant', () => {
  afterEach(() => {
    KAEL_CIRCUIT_BREAKER.reset()
  })

  it('prioritizes NestScout knowledge for worker questions even without a service type', async () => {
    const { client, calls } = makeGeneralKnowledgeClient()
    const seenRequests: AIRequest[] = []
    const callAI = vi.fn(async (request: AIRequest) => {
      seenRequests.push(request)
      return {
        success: true as const,
        content: JSON.stringify({
          answer: 'Kael dựa trên quy trình NestScout: thợ được kiểm tra hồ sơ và chỉ trao đổi trong app.',
          safety_notes: ['Giữ trao đổi trong app NestScout.'],
          citations: ['platform:worker_verification'],
          suggested_actions: ['open_booking'],
          boundary: 'answered',
        }),
        latencyMs: 24,
        usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
        provider: 'deepseek' as const,
        model: 'deepseek-chat',
      }
    })

    const result = await runCustomerAssistant({
      client,
      callAI,
      language: 'vi',
      message: 'Thợ NestScout được xác minh thế nào?',
      secrets: { knowledgeRetrievalEnabled: true },
      surface: 'customer_normal',
    })

    expect(result.fallback_used).toBe(false)
    expect(result.citations).toContain('platform:worker_verification')
    expect(result.trace?.[0]).toMatchObject({
      trace_schema_version: 'kael_trace.v1',
      workflow_phase: 'intake',
      actor_role: 'customer',
      action: 'customer.submit_intake',
      policy_id: 'kael.path.customer_intake_to_estimate.v1',
      purpose: 'educational_response',
      provider: 'deepseek',
      validation: { status: 'pass' },
      fallback: { used: false },
    })
    expect(callAI).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(seenRequests[0]?.messages)).toContain('Runtime knowledge')
    expect(JSON.stringify(seenRequests[0]?.messages)).toContain('worker onboarding')
    expect(JSON.stringify(seenRequests[0]?.messages)).not.toContain('0901234567')
    expect(calls).toContainEqual({
      kind: 'rpc',
      name: 'match_kael_knowledge',
      args: expect.objectContaining({
        p_service_type: null,
      }),
    })
  })

  it('uses legal-awareness rows for service-law questions without turning them into legal advice', async () => {
    const { client, calls } = makeGeneralKnowledgeClient({
      legalRows: [{
        pattern_key: 'deposit_and_payment_dispute_awareness',
        topic: 'legal_safety_awareness',
        boundary_type: 'awareness_only',
        response_guidance: 'Kael chỉ giải thích ranh giới an toàn trong app; không thay luật sư.',
        is_enabled: true,
      }],
      semanticRows: [],
    })
    const seenRequests: AIRequest[] = []
    const callAI = vi.fn(async (request: AIRequest) => {
      seenRequests.push(request)
      return {
        success: true as const,
        content: JSON.stringify({
          answer: 'Kael chỉ giải thích ranh giới an toàn và sẽ chuyển bạn tới hỗ trợ khi cần.',
          safety_notes: [],
          citations: [],
          suggested_actions: ['contact_support'],
          boundary: 'educational_only',
        }),
        latencyMs: 24,
        usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
        provider: 'deepseek' as const,
        model: 'deepseek-chat',
      }
    })

    const result = await runCustomerAssistant({
      client,
      callAI,
      language: 'vi',
      message: 'Luật và trách nhiệm bảo hành dịch vụ trong app là gì?',
      secrets: { knowledgeRetrievalEnabled: true },
      surface: 'customer_normal',
    })

    expect(result.boundary).toBe('educational_only')
    expect(result.safety_notes[0]).toContain('luật sư')
    expect(JSON.stringify(seenRequests[0]?.messages)).toContain('Legal boundary awareness_only')
    expect(JSON.stringify(seenRequests[0]?.messages)).toContain('không thay luật sư')
    expect(calls).toContainEqual(expect.objectContaining({
      kind: 'select',
      table: 'legal_awareness_patterns',
    }))
  })

  it('keeps a deterministic unaccented legal-advice signal on the redirect path before provider invocation', async () => {
    const { client, calls } = makeGeneralKnowledgeClient({
      legalRows: [{
        pattern_key: 'professional_legal_advice_redirect',
        topic: 'legal_advice',
        boundary_type: 'redirect_required',
        response_guidance: 'Hãy tham vấn luật sư để được tư vấn pháp lý chuyên môn.',
        is_enabled: true,
      }],
    })
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for legal advice')
    })

    const result = await runCustomerAssistant({
      client,
      callAI,
      language: 'vi',
      message: 'Toi muon khoi kien tho da sua nha.',
      secrets: { knowledgeRetrievalEnabled: true },
      surface: 'customer_normal',
    })

    expect(result.fallback_used).toBe(true)
    expect(result.answer).toContain('luật sư')
    expect(callAI).not.toHaveBeenCalled()
    expect(calls).toContainEqual(expect.objectContaining({
      kind: 'select',
      table: 'legal_awareness_patterns',
    }))
  })

  it('falls back without a provider call when every educational route is open circuit', async () => {
    KAEL_CIRCUIT_BREAKER.recordFailure({
      purpose: 'educational_response',
      provider: 'deepseek',
      errorCode: 'HTTP_402',
    })
    KAEL_CIRCUIT_BREAKER.recordFailure({
      purpose: 'educational_response',
      provider: 'anthropic',
      errorCode: 'HTTP_402',
    })
    const callAI = vi.fn(async () => {
      throw new Error('provider should not be called while all educational routes are open circuit')
    })

    const result = await runCustomerAssistant({
      callAI,
      language: 'vi',
      message: 'Kael giải thích quy trình đặt lịch điện giúp tôi?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })

    expect(result.fallback_used).toBe(true)
    expect(result.boundary).toBe('fallback')
    expect(result.trace?.[0]).toMatchObject({
      workflow_phase: 'intake',
      actor_role: 'customer',
      action: 'customer.submit_intake',
      policy_id: 'kael.path.customer_intake_to_estimate.v1',
      purpose: 'educational_response',
      provider: null,
      validation: { status: 'skipped', reason_code: 'NO_PROVIDER_AVAILABLE' },
      fallback: { used: true, reason_code: 'NO_PROVIDER_AVAILABLE' },
    })
    expect(callAI).not.toHaveBeenCalled()
  })

  it('does not expose model-authored safety notes or citations', async () => {
    const callAI = vi.fn(async () => ({
      success: true as const,
      content: JSON.stringify({
        answer: 'Hãy tiếp tục trao đổi trong ứng dụng NestScout.',
        safety_notes: ['Gọi 090-123-4567 và chuyển 200k để được ưu tiên.'],
        citations: ['https://evil.example/model-invented', 'platform:invented'],
        suggested_actions: ['open_booking'],
        boundary: 'answered',
      }),
      latencyMs: 24,
      usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
      provider: 'deepseek' as const,
      model: 'deepseek-chat',
    }))

    const result = await runCustomerAssistant({
      callAI,
      language: 'vi',
      message: 'Tôi nên trao đổi với thợ thế nào?',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })

    expect(result.fallback_used).toBe(false)
    expect(result.safety_notes).toEqual([
      'Hãy dùng luồng trong app NestScout cho đặt lịch, phạm vi, thanh toán và hỗ trợ.',
    ])
    expect(result.citations).toEqual(['NestScout platform scope'])
    expect(JSON.stringify(result)).not.toContain('090-123-4567')
    expect(JSON.stringify(result)).not.toContain('evil.example')
  })

  it.each(['Giá khoảng 200k.', 'Giá khoảng 300.000.'])(
    'rejects an exact compact price without the estimate disclaimer: %s',
    async (answer) => {
      const callAI = vi.fn(async () => ({
        success: true as const,
        content: JSON.stringify({
          answer,
          safety_notes: [],
          citations: [],
          suggested_actions: ['open_booking'],
          boundary: 'answered',
        }),
        latencyMs: 24,
        usage: { costUsd: 0.0001, inputTokens: 12, outputTokens: 18 },
        provider: 'deepseek' as const,
        model: 'deepseek-chat',
      }))

      const result = await runCustomerAssistant({
        callAI,
        language: 'vi',
        message: 'Giá dịch vụ khoảng bao nhiêu?',
        secrets: { knowledgeRetrievalEnabled: false },
        surface: 'customer_normal',
      })

      expect(result.fallback_used).toBe(true)
      expect(result.answer).not.toBe(answer)
    },
  )

  it('scrubs separated phone, bare street number, and job UUID before the provider call', async () => {
    const seenRequests: AIRequest[] = []
    let seenGate: { actorId?: string | null } | undefined
    const callAI = vi.fn(async (request: AIRequest, _secrets: unknown, gate?: { actorId?: string | null }) => {
      seenRequests.push(request)
      seenGate = gate
      return {
        success: true as const,
        content: JSON.stringify({
          answer: 'Kael sẽ hướng dẫn kiểm tra rò nước an toàn trong ứng dụng.',
          safety_notes: [],
          citations: [],
          suggested_actions: ['open_booking'],
          boundary: 'answered',
        }),
        latencyMs: 20,
        usage: { costUsd: 0.0001, inputTokens: 10, outputTokens: 12 },
        provider: 'deepseek' as const,
        model: 'deepseek-chat',
      }
    })

    await runCustomerAssistant({
      actorId: 'customer-guard-test',
      callAI,
      job: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        service_type: 'plumbing',
        description: 'Ống nước rò tại 123 Nguyễn Huệ.',
      },
      language: 'vi',
      message: 'Ống nước rò, gọi tôi theo 090-123-4567 tại 123 Nguyễn Huệ.',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_case',
    })

    const providerPayload = JSON.stringify(seenRequests[0]?.messages)
    expect(providerPayload).toContain('[phone]')
    expect(providerPayload).toContain('[house-no]')
    expect(providerPayload).not.toContain('090-123-4567')
    expect(providerPayload).not.toContain('123 Nguyễn Huệ')
    expect(providerPayload).not.toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(seenGate?.actorId).toBe('customer-guard-test')
  })

  it('returns an English permission decline without leaking Vietnamese boundary copy', async () => {
    const callAI = vi.fn(async () => {
      throw new Error('provider must not run for legal advice')
    })

    const result = await runCustomerAssistant({
      callAI,
      language: 'en',
      message: 'I want legal advice to sue the worker.',
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })

    expect(result.fallback_used).toBe(true)
    expect(result.answer).toContain('professional legal advice')
    expect(result.answer).not.toContain('pháp lý')
    expect(callAI).not.toHaveBeenCalled()
  })
})

function makeGeneralKnowledgeClient(options: {
  legalRows?: unknown[];
  semanticRows?: unknown[];
} = {}) {
  const calls: Array<Record<string, unknown>> = []
  const semanticRows = options.semanticRows ?? [{
    knowledge_table: 'service_knowledge_boxes',
    knowledge_id: 'worker-verification',
    citation_id: 'platform:worker_verification',
    content: 'NestScout worker onboarding checks service fit and keeps contact inside the app. Phone 0901234567 is never prompt material.',
    similarity: 0.84,
  }]
  return {
    calls,
    client: {
      from: (table: string) => makeTableQuery(
        table,
        calls,
        table === 'legal_awareness_patterns' ? options.legalRows ?? [] : [],
      ),
      rpc: (name: string, args?: Record<string, unknown>) => {
        calls.push({ kind: 'rpc', name, args })
        return Promise.resolve({
          data: semanticRows,
          error: null,
        })
      },
    },
  }
}

function makeTableQuery(
  table: string,
  calls: Array<Record<string, unknown>>,
  data: unknown[],
) {
  const filters: Array<[string, unknown]> = []
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push([column, value])
      return query
    },
    insert: (value: unknown) => {
      calls.push({ kind: 'insert', table, value })
      return Promise.resolve({ data: null, error: null })
    },
    then: <TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => {
      calls.push({ kind: 'select', table, filters })
      return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected)
    },
  }
  return query
}
