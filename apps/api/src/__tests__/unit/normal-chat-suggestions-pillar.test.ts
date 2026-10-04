import { describe, expect, it, vi } from 'vitest'
import type { AIRequest, AIResponse, EdgeAiSecrets } from '../../../../../supabase/functions/mobile-api/_shared/kael/contracts/types'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/platform/auth'
import type { DbClient } from '../../../../../supabase/functions/mobile-api/_shared/platform/db'
import { createNormalChatSuggestions } from '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/normal-chat-suggestions'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../kael-edge-runtime/harness'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P300-normal-chat-suggestions',
  invariant: 'Normal-chat suggestions use only the authenticated Customer or Worker session context, validate the latest completed turn before and after one bounded DeepSeek call, scrub PII, and never write transcript or memory state',
  authority: ['governance/RULES.md #0, #2, #8, and #9', 'governance/protocols/ai-data-security.md §12 and §15', 'governance/Plan.md normal-chat suggestions contract'],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/normal-chat-suggestions.ts',
  layer: 'integration',
  siblings: ['P252-kael-chat-http-roundtrip', 'P253-kael-normal-chat-session-memory'],
  mutation: 'remove an actor/session filter, pass unsanitized recent turns, route away from DeepSeek, accept a stale source turn, or write a transcript/memory row; one of the scope, prompt, routing, stale-source, or no-write assertions fails',
} as const satisfies PillarManifest

const CUSTOMER_ID = 'c300abcd-0000-4000-8000-000000000001'
const CONVERSATION_ID = 'c300abcd-0000-4000-8000-0000000000c1'
const SOURCE_TURN_ID = 'c300abcd-0000-4000-8000-0000000000a1'

function session(actorRole: 'customer' | 'worker', actorId: string, sessionId: string) {
  return actorRole === 'customer'
    ? { id: sessionId, customer_id: actorId, chat_mode: 'normal', case_session_id: null, archived_at: null }
    : { id: sessionId, worker_id: actorId, chat_mode: 'normal', job_id: null, status: 'active', closed_at: null, archived_at: null }
}

function makeContext(actorRole: 'customer' | 'worker', client: ReturnType<typeof makeSequenceClient>, actorId = CUSTOMER_ID) {
  return {
    success: true as const,
    user: { id: actorId },
    role: actorRole,
    supabase: client,
    privilegedSupabase: client,
    userSupabase: client,
  } as unknown as MobileApiContext
}

function makeSuggestionClient(actorRole: 'customer' | 'worker' = 'customer', options: { sourceIds?: string[]; ownerId?: string; memoryError?: boolean } = {}) {
  const ownerId = options.ownerId ?? CUSTOMER_ID
  const sessionId = actorRole === 'customer' ? CONVERSATION_ID : 'c300abcd-0000-4000-8000-0000000000d1'
  const sessionTable = actorRole === 'customer' ? 'kael_customer_conversations' : 'kael_worker_chat_sessions'
  const turnTable = actorRole === 'customer' ? 'kael_customer_conversation_turns' : 'kael_worker_chat_turns'
  const sourceIds = options.sourceIds ?? [SOURCE_TURN_ID, SOURCE_TURN_ID]
  const rows = sourceIds.map((id, index) => ({
    id,
    turn_index: index === 0 ? 4 : 4,
    role: 'kael',
    text_content: 'Tôi đã giải thích cách kiểm tra ống thoát nước. Người dùng nhắc số điện thoại 0909123456.',
    safe_metadata: {},
  }))
  const client = makeSequenceClient([], {
    rate_take: [{ data: [{ allowed: true, retry_after_ms: 0, reason: null }], error: null }],
  }, {
    [sessionTable]: [
      { data: session(actorRole, ownerId, sessionId), error: null },
      { data: session(actorRole, ownerId, sessionId), error: null },
    ],
    [turnTable]: [
      { data: { id: sourceIds[0], turn_index: 4, role: 'kael' }, error: null },
      { data: [
        rows[0],
        { ...rows[0], id: 'c300abcd-0000-4000-8000-000000000099', turn_index: 3, role: actorRole, text_content: 'Máy lạnh đang chảy nước.' },
      ], error: null },
      { data: { id: sourceIds[1], turn_index: 4, role: 'kael' }, error: null },
    ],
    kael_normal_chat_session_memory: [{ data: null, error: options.memoryError ? { code: 'DB_DOWN' } : null }],
  })
  return { client, sessionId, turnTable }
}

function providerReply(content: string): AIResponse {
  return {
    success: true,
    content,
    usage: { inputTokens: 120, outputTokens: 40, costUsd: 0.0001 },
    latencyMs: 1,
  }
}

describe('P300 normal-chat suggestions', () => {
  installEdgeRuntimeTestHooks()

  it.each(['customer', 'worker'] as const)('uses only the %s normal-chat session and returns server-id suggestions', async (actorRole) => {
    const { client, sessionId, turnTable } = makeSuggestionClient(actorRole)
    const requests: AIRequest[] = []
    const invoke = vi.fn(async (request: AIRequest, _secrets: EdgeAiSecrets) => {
      requests.push(request)
      return providerReply(JSON.stringify({ suggestions: ['Mô tả giúp tôi bước kiểm tra tiếp theo.', 'Tôi muốn biết dấu hiệu nào cần gọi thợ.'] }))
    })
    const ctx = makeContext(actorRole, client)

    await withPillarContext(PILLAR, async () => {
      const result = await createNormalChatSuggestions(
        ctx,
        actorRole,
        sessionId,
        { language: 'vi', source_turn_id: SOURCE_TURN_ID },
        { deepseekApiKey: 'test-deepseek' },
        invoke,
      )
      const prompt = requests[0]?.messages.map((message) => message.content).join('\n') ?? ''
      const scopedTurnsRead = client.calls.find((call) => call.table === turnTable)

      expect(result.status, pillarWhy(PILLAR, 'a valid response is tied to its session and source turn')).toBe('ready')
      expect(result.session_id).toBe(sessionId)
      expect(result.source_turn_id).toBe(SOURCE_TURN_ID)
      expect(result.suggestions).toHaveLength(2)
      expect(result.suggestions.every((item) => item.id !== 'Mô tả giúp tôi bước kiểm tra tiếp theo.')).toBe(true)
      expect(requests[0]).toMatchObject({
        purpose: 'normal_chat_suggestions',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        maxTokens: 350,
        timeoutMs: 8_000,
        maxRetries: 0,
      })
      expect(prompt).toContain('Máy lạnh đang chảy nước.')
      expect(prompt).toContain('[phone]')
      expect(prompt).not.toContain('0909123456')
      expect(scopedTurnsRead?.operations).toContainEqual(['eq', actorRole === 'customer' ? 'conversation_id' : 'session_id', sessionId])
      expect(scopedTurnsRead?.operations).toContainEqual(actorRole === 'customer' ? ['eq', 'customer_id', CUSTOMER_ID] : ['is', 'job_id', null])
      expect(client.calls.filter((call) => call.operations.some((operation) => ['insert', 'upsert', 'update', 'delete'].includes(String(operation[0]))))).toEqual([])
    }, 'the role-owned session context is scrubbed before one read-only DeepSeek suggestion call')
  })

  it('rejects a stale source turn before any provider call', async () => {
    const { client, sessionId } = makeSuggestionClient('customer', { sourceIds: ['c300abcd-0000-4000-8000-000000000099'] })
    const invoke = vi.fn(async () => providerReply('{"suggestions":["Tôi muốn hỏi thêm."]}'))

    await expect(createNormalChatSuggestions(
      makeContext('customer', client),
      'customer',
      sessionId,
      { language: 'vi', source_turn_id: SOURCE_TURN_ID },
      { deepseekApiKey: 'test-deepseek' },
      invoke,
    )).rejects.toMatchObject({ status: 409 })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('discards a response if a newer turn appears while the provider is running', async () => {
    const { client, sessionId } = makeSuggestionClient('customer', {
      sourceIds: [SOURCE_TURN_ID, 'c300abcd-0000-4000-8000-000000000088'],
    })
    const invoke = vi.fn(async () => providerReply('{"suggestions":["Tôi muốn hỏi thêm."]}'))

    await expect(createNormalChatSuggestions(
      makeContext('customer', client),
      'customer',
      sessionId,
      { language: 'vi', source_turn_id: SOURCE_TURN_ID },
      { deepseekApiKey: 'test-deepseek' },
      invoke,
    )).rejects.toMatchObject({ status: 409 })
    expect(invoke).toHaveBeenCalledOnce()
  })

  it('returns unavailable when model output contains a PII value', async () => {
    const { client, sessionId } = makeSuggestionClient()
    const invoke = vi.fn(async () => providerReply(JSON.stringify({ suggestions: ['Gọi 0909123456 để đặt lịch.'] })))

    const result = await createNormalChatSuggestions(
      makeContext('customer', client),
      'customer',
      sessionId,
      { language: 'vi', source_turn_id: SOURCE_TURN_ID },
      { deepseekApiKey: 'test-deepseek' },
      invoke,
    )
    expect(result).toMatchObject({ status: 'unavailable', suggestions: [] })
  })

  it('fails the optional suggestion request when session memory cannot be read', async () => {
    const { client, sessionId } = makeSuggestionClient('customer', { memoryError: true })
    const invoke = vi.fn(async () => providerReply('{"suggestions":["Tôi muốn hỏi thêm."]}'))

    await expect(createNormalChatSuggestions(
      makeContext('customer', client),
      'customer',
      sessionId,
      { language: 'vi', source_turn_id: SOURCE_TURN_ID },
      { deepseekApiKey: 'test-deepseek' },
      invoke,
    )).rejects.toMatchObject({ status: 503 })
    expect(invoke).not.toHaveBeenCalled()
    expect(client.calls.filter((call) => call.operations.some((operation) => ['insert', 'upsert', 'update', 'delete'].includes(String(operation[0]))))).toEqual([])
  })
})

function withPillarContext<T>(pillar: PillarManifest, run: () => Promise<T>, detail: string) {
  return run().catch((error) => {
    if (error instanceof Error) error.message = `${pillarWhy(pillar, detail)}\n\n${error.message}`
    throw error
  })
}
