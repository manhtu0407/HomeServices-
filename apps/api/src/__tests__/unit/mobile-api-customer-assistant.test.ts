import { describe, expect, it, vi } from 'vitest'
import {
  runCustomerAssistant,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/customer-assistant'
import type {
  AIRequest,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/types'

describe('mobile-api customer Kael assistant', () => {
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
