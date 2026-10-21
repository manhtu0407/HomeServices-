import { vi } from 'vitest'

import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import {
  AI_SESSION_LIMIT,
  checkRateLimit,
} from '../../../../../../supabase/functions/mobile-api/_shared/platform/rate-limit'
import { makeSequenceClient } from './sequence-client'

// The normal-chat conversation route and the assistant route, driven through the real handler with a scripted client
// and a provider that records every call. A clear emergency is a deterministic answer, so nothing paid may run before it.
export const CUSTOMER = 'c412abcd-0000-4000-8000-000000000001'
export const CONVERSATION = 'c412abcd-0000-4000-8000-0000000000c1'
export const CLIENT_REQUEST = 'c412abcd-0000-4000-8000-0000000000a1'

function conversationRow(totalTurns: number) {
  return {
    id: CONVERSATION,
    customer_id: CUSTOMER,
    chat_mode: 'normal',
    case_session_id: null,
    client_request_id: 'c412abcd-0000-4000-8000-0000000000b1',
    title: null,
    pinned_at: null,
    archived_at: null,
    total_turns: totalTurns,
    created_at: '2026-10-20T00:00:00.000Z',
    updated_at: '2026-10-20T00:00:00.000Z',
  }
}

export function providerSpy() {
  const calls: string[] = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    calls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }], content: [{ type: 'text', text: '{}' }] }))
  })
  return { calls, fetch: fetchImpl as unknown as typeof globalThis.fetch }
}

export function normalChatSetup(options: { prior?: number; foreign?: boolean; replay?: boolean } = {}) {
  const prior = options.prior ?? 0
  const turnRows = Array.from({ length: prior }, (_unused, index) => ({
    id: `c412abcd-0000-4000-8000-${String(900 + index).padStart(12, '0')}`,
    conversation_id: CONVERSATION,
    customer_id: CUSTOMER,
    client_request_id: null,
    turn_index: index + 1,
    role: index % 2 === 0 ? 'customer' : 'kael',
    text_content: index % 2 === 0 ? 'Máy lạnh nhà mình chảy nước' : 'Do ống thoát nước bị tắc.',
    media_refs: [],
    safe_metadata: {},
    created_at: '2026-10-20T00:00:01.000Z',
  }))
  const client = makeSequenceClient([], {
    append_customer_kael_conversation_exchange: [{ data: prior + 2, error: null }],
  }, {
    kael_customer_conversations: options.foreign
      ? Array.from({ length: 12 }, () => ({ data: null, error: { code: 'PGRST116', message: 'no rows' } }))
      : Array.from({ length: 12 }, () => ({ data: conversationRow(prior), error: null })),
    kael_customer_conversation_turns: [
      { data: options.replay ? { id: 'c412abcd-0000-4000-8000-0000000000f9' } : null, error: null },
      ...Array.from({ length: 6 }, () => ({ data: turnRows, error: null })),
    ],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true as const,
      user: { id: CUSTOMER },
      role: 'customer' as const,
      supabase: client,
      privilegedSupabase: client,
      userSupabase: client,
    }) as never,
    services: createEdgeServices({ anthropicApiKey: 'test-anthropic', deepseekApiKey: 'test-deepseek' } as Parameters<typeof createEdgeServices>[0]),
  })
  const send = async (body: Record<string, unknown>) => {
    const response = await handler(new Request(`https://edge.test/mobile-api/me/kael/conversations/${CONVERSATION}/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_request_id: CLIENT_REQUEST, language: 'vi', ...body }),
    }))
    return { status: response.status, body: await response.json() as Record<string, any> }
  }
  const appended = () => client.calls.find((call) => call.table === 'rpc:append_customer_kael_conversation_exchange')
  return { client, send, appended }
}

export function assistantSetup(tableResults: Parameters<typeof makeSequenceClient>[2] = {}, role: 'customer' | 'worker' | 'admin' = 'customer') {
  const client = makeSequenceClient([], {}, tableResults)
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true as const,
      user: { id: CUSTOMER },
      role,
      supabase: client,
      privilegedSupabase: client,
      userSupabase: client,
    }) as never,
    services: createEdgeServices({ anthropicApiKey: 'test-anthropic', deepseekApiKey: 'test-deepseek' } as Parameters<typeof createEdgeServices>[0]),
  })
  const ask = async (body: Record<string, unknown>) => {
    const response = await handler(new Request('https://edge.test/mobile-api/kael/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'vi', surface: 'customer_normal', ...body }),
    }))
    return { status: response.status, body: await response.json() as Record<string, any> }
  }
  return { client, ask }
}

export const exhaustAssistantQuota = () => {
  for (let used = 0; used < AI_SESSION_LIMIT.maxTokens + 2; used += 1) {
    checkRateLimit(`kael_customer_assistant:${CUSTOMER}`, AI_SESSION_LIMIT)
  }
}
