import { describe, expect, it, vi } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
} from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P252-kael-chat-http-roundtrip',
  invariant:
    'A released client\'s Customer normal-chat turn travels the real mobile-api handler to a streamed, persisted Kael reply, while the same request from a client without a released identity (web) is refused with 426 before authentication, the database, or any AI provider is reached',
  authority: [
    'governance/RULES.md #0 (mobile -> mobile-api -> server-side AI)',
    'governance/RULES.md #8 (no fake success, no silent failure)',
    'supabase/functions/mobile-api/_shared/http/request-runtime.ts enforceStage1ClientCompatibility',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/customer/kael-conversation-turn.ts',
  layer: 'integration',
  siblings: ['P217-customer-assistant-image-analysis', 'P204-customer-kael-request-abort', 'P250-kael-unreleased-client-copy'],
  mutation:
    'skip the append_customer_kael_conversation_exchange write, or let the handler serve a POST without the release platform headers; the persisted-reply or the 426-before-auth assertion turns red',
} as const satisfies PillarManifest

const CUSTOMER = 'c252abcd-0000-4000-8000-000000000001'
const CONVERSATION = 'c252abcd-0000-4000-8000-0000000000c1'
const CLIENT_REQUEST = 'c252abcd-0000-4000-8000-0000000000a1'
const REPLY = 'Máy lạnh chảy nước thường do ống thoát nước bị tắc hoặc máng hứng bị đầy.'
const RELEASED_HEADERS = {
  'x-client-platform': 'ios',
  'x-client-application-id': 'com.phanmanhtu.homeservices',
  'x-client-build-number': '45',
}
const COMPATIBILITY = {
  contractEpoch: 2,
  releaseId: 'harness-p252-release',
  gitSha: 'b'.repeat(40),
  ios: { applicationId: 'com.phanmanhtu.homeservices', minimumBuildNumber: 45, easBuildId: null, runtimeVersion: null },
  android: { applicationId: 'com.phanmanhtu.nestscout', minimumBuildNumber: 4, easBuildId: null, runtimeVersion: null },
} as const

function sseBody(frames: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const frame of frames) controller.enqueue(encoder.encode(frame))
      controller.close()
    },
  })
}

// Provider stand-in: answers streaming requests with native SSE and plain ones with JSON, and
// counts every call so the refused request can prove no model was reached.
function providerFetch(content: string) {
  const calls: string[] = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const host = new URL(url).hostname
    calls.push(host)
    const body = JSON.parse(String(init?.body ?? '{}')) as { stream?: boolean }
    if (host === 'api.anthropic.com') {
      if (body.stream) {
        return new Response(sseBody([
          `event: message_start\ndata: ${JSON.stringify({ message: { usage: { input_tokens: 40 } } })}\n\n`,
          `event: content_block_delta\ndata: ${JSON.stringify({ delta: { type: 'text_delta', text: content } })}\n\n`,
          `event: message_delta\ndata: ${JSON.stringify({ usage: { output_tokens: 30 } })}\n\n`,
          'event: message_stop\ndata: {}\n\n',
        ]), { headers: { 'content-type': 'text/event-stream' } })
      }
      return new Response(JSON.stringify({ content: [{ type: 'text', text: content }], usage: { input_tokens: 40, output_tokens: 30 } }))
    }
    if (host === 'api.deepseek.com' || host === 'api.perplexity.ai') {
      if (body.stream) {
        return new Response(sseBody([
          `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
          `data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 40, completion_tokens: 30 } })}\n\n`,
          'data: [DONE]\n\n',
        ]), { headers: { 'content-type': 'text/event-stream' } })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 40, completion_tokens: 30 } }))
    }
    throw new Error(`unexpected provider URL ${url}`)
  })
  return { fetch: fetchImpl as unknown as typeof globalThis.fetch, calls }
}

function conversationRow(totalTurns: number) {
  return {
    id: CONVERSATION,
    customer_id: CUSTOMER,
    chat_mode: 'normal',
    case_session_id: null,
    client_request_id: 'c252abcd-0000-4000-8000-0000000000b1',
    title: null,
    pinned_at: null,
    archived_at: null,
    total_turns: totalTurns,
    created_at: '2026-09-28T00:00:00.000Z',
    updated_at: '2026-09-28T00:00:00.000Z',
  }
}

function setup() {
  let authentications = 0
  const client = makeSequenceClient([], {
    append_customer_kael_conversation_exchange: [{ data: 2, error: null }],
  }, {
    kael_customer_conversations: [
      { data: conversationRow(0), error: null },
      { data: conversationRow(2), error: null },
    ],
    kael_customer_conversation_turns: [
      { data: null, error: null },
      {
        data: [
          { id: 't1', conversation_id: CONVERSATION, customer_id: CUSTOMER, client_request_id: CLIENT_REQUEST, turn_index: 1, role: 'customer', text_content: 'Máy lạnh nhà tôi chảy nước', media_refs: [], created_at: '2026-09-28T00:00:01.000Z' },
          { id: 't2', conversation_id: CONVERSATION, customer_id: CUSTOMER, client_request_id: null, turn_index: 2, role: 'kael', text_content: REPLY, media_refs: [], created_at: '2026-09-28T00:00:02.000Z' },
        ],
        error: null,
      },
    ],
  })
  const handler = createMobileApiHandler({
    authenticate: async (): Promise<MobileApiAuthResult> => {
      authentications += 1
      return { success: true, user: { id: CUSTOMER }, role: 'customer', supabase: client, privilegedSupabase: client, userSupabase: client }
    },
    services: createEdgeServices({ anthropicApiKey: 'test-anthropic', deepseekApiKey: 'test-deepseek' } as Parameters<typeof createEdgeServices>[0]),
    clientCompatibility: COMPATIBILITY,
  })
  const send = (headers: Record<string, string>) => handler(new Request(
    `https://edge.test/me/kael/conversations/${CONVERSATION}/stream`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ client_request_id: CLIENT_REQUEST, language: 'vi', message: 'Máy lạnh nhà tôi chảy nước' }),
    },
  ))
  return { client, send, authentications: () => authentications }
}

const WORKER = 'c252abcd-0000-4000-8000-000000000002'
const WORKER_SESSION = 'c252abcd-0000-4000-8000-0000000000d1'
const WORKER_REQUEST = 'c252abcd-0000-4000-8000-0000000000e1'
const WORKER_REPLY = 'Bạn nên kiểm tra CB tổng trước khi thay ổ cắm.'

function workerSessionRow(totalTurns: number) {
  return {
    id: WORKER_SESSION,
    job_id: null,
    chat_mode: 'normal',
    worker_id: WORKER,
    status: 'active',
    title: totalTurns > 0 ? 'Thay ổ cắm' : null,
    pinned_at: null,
    started_at: '2026-09-28T00:00:00.000Z',
    closed_at: null,
    total_turns: totalTurns,
    kael_progress: null,
    archived_at: null,
  }
}

function setupWorker() {
  let authentications = 0
  const client = makeSequenceClient([], {
    claim_worker_kael_general_turn_atomic: [{
      data: [{ ok: true, completed: false, request_id: 'c252abcd-0000-4000-8000-0000000000f1', worker_turn_id: 'c252abcd-0000-4000-8000-0000000000f2', error_code: null }],
      error: null,
    }],
    check_kael_worker_chat_rate: [{ data: [{ allowed: true, reason: null }], error: null }],
    complete_worker_kael_general_turn_atomic: [{ data: [{ ok: true, error_code: null }], error: null }],
  }, {
    // The route re-reads the session for ownership, the turn guard, progress, and the final
    // projection; each read sees the row as the database would at that point.
    kael_worker_chat_sessions: [
      ...Array.from({ length: 4 }, () => ({ data: workerSessionRow(0), error: null })),
      ...Array.from({ length: 6 }, () => ({ data: workerSessionRow(2), error: null })),
    ],
    kael_worker_chat_turns: [
      { data: [], error: null },
      {
        data: [
          { id: 'w1', session_id: WORKER_SESSION, turn_index: 0, role: 'worker', content_type: 'text', text_content: 'Ổ cắm bị cháy đen', media_refs: [], safety_notes: [], created_at: '2026-09-28T00:00:01.000Z' },
          { id: 'w2', session_id: WORKER_SESSION, turn_index: 1, role: 'kael', content_type: 'text', text_content: WORKER_REPLY, media_refs: [], safety_notes: [], created_at: '2026-09-28T00:00:02.000Z' },
        ],
        error: null,
      },
    ],
  })
  const handler = createMobileApiHandler({
    authenticate: async (): Promise<MobileApiAuthResult> => {
      authentications += 1
      return { success: true, user: { id: WORKER }, role: 'worker', supabase: client, privilegedSupabase: client, userSupabase: client }
    },
    services: createEdgeServices({ anthropicApiKey: 'test-anthropic', deepseekApiKey: 'test-deepseek' } as Parameters<typeof createEdgeServices>[0]),
    clientCompatibility: COMPATIBILITY,
  })
  const send = (headers: Record<string, string>) => handler(new Request(
    `https://edge.test/workers/me/kael/chat/${WORKER_SESSION}/stream`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ client_request_id: WORKER_REQUEST, language: 'vi', message: 'Ổ cắm bị cháy đen', media_refs: [] }),
    },
  ))
  return { client, send, authentications: () => authentications }
}

function sseEvents(text: string) {
  return text.split(/\n\n/).flatMap((frame) => {
    const event = frame.match(/^event: (.+)$/m)?.[1]
    const data = frame.match(/^data: (.+)$/m)?.[1]
    return event ? [{ event, data: data ? JSON.parse(data) as unknown : null }] : []
  })
}

describe('P252 Kael chat over the real mobile-api handler', () => {
  installEdgeRuntimeTestHooks()

  it('streams and persists a Customer normal-chat reply for a released client', async () => {
    const provider = providerFetch(JSON.stringify({
      answer: REPLY,
      public_reasoning_summary: ['Xác định nguyên nhân phổ biến gây chảy nước.'],
    }))
    vi.stubGlobal('fetch', provider.fetch)
    const { client, send } = setup()

    const response = await send(RELEASED_HEADERS)
    const text = await response.text()
    const events = sseEvents(text)
    const append = client.calls.find((call) => call.table === 'rpc:append_customer_kael_conversation_exchange')

    expect(response.status, pillarWhy(PILLAR, text.slice(0, 400))).toBe(200)
    expect(provider.calls.length, pillarWhy(PILLAR, 'the turn must reach a server-side model')).toBeGreaterThan(0)
    expect(events.map((item) => item.event), pillarWhy(PILLAR, text.slice(0, 600))).toContain('result')
    expect(events.some((item) => item.event === 'error'), pillarWhy(PILLAR, text.slice(0, 600))).toBe(false)
    expect(append?.operations[0]?.[2], pillarWhy(PILLAR, 'the exchange must be persisted for the owning Customer')).toMatchObject({
      p_conversation_id: CONVERSATION,
      p_customer_id: CUSTOMER,
      p_client_request_id: CLIENT_REQUEST,
      p_media_refs: [],
      p_kael_text: expect.stringContaining('ống thoát nước'),
    })
    const result = events.find((item) => item.event === 'result')?.data as { turns?: Array<{ role: string; text_content: string }> }
    expect(result.turns?.at(-1), pillarWhy(PILLAR, 'the client receives the persisted Kael turn')).toMatchObject({
      role: 'kael',
      text_content: REPLY,
    })
  })

  it('refuses the same turn from a web client before auth, database, or provider', async () => {
    const provider = providerFetch('{}')
    vi.stubGlobal('fetch', provider.fetch)
    const { client, send, authentications } = setup()

    const response = await send({})
    const body = await response.json() as { code?: string }

    expect(response.status, pillarWhy(PILLAR, JSON.stringify(body))).toBe(426)
    expect(body.code).toBe('CLIENT_UPDATE_REQUIRED')
    expect(authentications(), pillarWhy(PILLAR, 'compatibility is decided before authentication')).toBe(0)
    expect(client.calls, pillarWhy(PILLAR, 'a refused turn must not touch the database')).toEqual([])
    expect(provider.calls, pillarWhy(PILLAR, 'a refused turn must not reach a model')).toEqual([])
  })

  it('streams and persists a Worker normal-chat reply for a released client', async () => {
    const provider = providerFetch(JSON.stringify({
      answer: WORKER_REPLY,
      safety_notes: [],
      redirect_scope_change: false,
      public_reasoning_summary: ['Ưu tiên an toàn điện trước khi thao tác.'],
    }))
    vi.stubGlobal('fetch', provider.fetch)
    const { client, send } = setupWorker()

    const response = await send({ ...RELEASED_HEADERS, 'x-client-platform': 'android', 'x-client-application-id': 'com.phanmanhtu.nestscout', 'x-client-build-number': '4' })
    const text = await response.text()
    const events = sseEvents(text)
    const complete = client.calls.find((call) => call.table === 'rpc:complete_worker_kael_general_turn_atomic')

    expect(response.status, pillarWhy(PILLAR, text.slice(0, 400))).toBe(200)
    expect(provider.calls.length, pillarWhy(PILLAR, 'the Worker turn must reach a server-side model')).toBeGreaterThan(0)
    expect(events.some((item) => item.event === 'error'), pillarWhy(PILLAR, JSON.stringify(events.filter((item) => item.event === 'error' || item.event === 'response.failed')) + ' calls=' + JSON.stringify(client.calls.map((call) => call.table)))).toBe(false)
    expect(complete?.operations[0]?.[2], pillarWhy(PILLAR, 'the Worker answer must be persisted for the owning Worker')).toMatchObject({
      p_session_id: WORKER_SESSION,
      p_worker_id: WORKER,
      p_text_content: expect.stringContaining('CB tổng'),
    })
    const result = events.find((item) => item.event === 'result')?.data as { turns?: Array<{ role: string; text_content: string }> }
    expect(result?.turns?.at(-1), pillarWhy(PILLAR, text.slice(0, 800))).toMatchObject({ role: 'kael', text_content: WORKER_REPLY })
  })

  it('refuses the same Worker turn from a web client before auth, database, or provider', async () => {
    const provider = providerFetch('{}')
    vi.stubGlobal('fetch', provider.fetch)
    const { client, send, authentications } = setupWorker()

    const response = await send({})

    expect(response.status).toBe(426)
    expect(authentications()).toBe(0)
    expect(client.calls).toEqual([])
    expect(provider.calls).toEqual([])
  })
})
