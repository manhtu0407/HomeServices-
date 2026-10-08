import { afterEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P335-kael-work-reply-stream',
  invariant:
    'a Kael Work reply streams to the open SSE stream as soon as its guarded text is stored, carrying the stored turn id as the response id and exactly the stored text; an estimate turn never streams as text, and only the first reply of a request streams, and no reply streams while two streams overlap on one session',
  authority: [
    'governance/RULES.md #3 (only validated Kael output reaches the customer)',
    'governance/RULES.md #8 (the streamed reply is the stored reply, never a draft)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/reply-channel.ts',
  layer: 'unit',
  siblings: ['P334-kael-progress-push-to-stream'],
  mutation:
    'stop publishing from appendKaelSystemTurn, publish the pre-brand text, stream estimates, or use a random response id — the publish, estimate, or stream case turns red',
} as const satisfies PillarManifest

const hooks = vi.hoisted(() => ({
  runTurn: null as null | (() => Promise<unknown>),
}))

vi.mock('../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/read.service', () => ({
  readKaelChatProgressSnapshot: vi.fn(async () => ({ progress: null, session_id: 'session-reply' })),
}))
vi.mock('../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/turn', () => ({
  sendKaelChatTurn: vi.fn(() => hooks.runTurn?.() ?? Promise.resolve({})),
}))
vi.mock('../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/evidence', () => ({
  submitKaelChatEvidence: vi.fn(async () => ({})),
}))
vi.mock('../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/stream-delay', () => ({
  waitForKaelChatProgressPoll: () => new Promise<void>((resolve) => setTimeout(resolve, 60_000)),
}))

import { appendKaelSystemTurn } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/session-store'
import {
  publishKaelChatReply,
  subscribeKaelChatReply,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/reply-channel'
import { streamKaelChatTurn } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/stream'

function sessionStoreClient(insertedId: string) {
  const inserts: Record<string, unknown>[] = []
  const query = (table: string) => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: { id: 'session-store', safe_metadata: {}, total_cost_usd: 0, total_turns: 2 }, error: null }),
      }),
    }),
    insert: (value: Record<string, unknown>) => {
      inserts.push({ table, ...value })
      return { select: () => ({ single: async () => ({ data: { id: insertedId }, error: null }) }) }
    },
    update: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'session-store' }, error: null }) }) }) }),
  })
  return { client: { from: query }, inserts }
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, marker: string, buffer: { text: string }) {
  const decoder = new TextDecoder()
  while (!buffer.text.includes(marker)) {
    const { done, value } = await reader.read()
    if (done) break
    buffer.text += decoder.decode(value, { stream: true })
  }
  return buffer.text.includes(marker)
}

afterEach(() => {
  hooks.runTurn = null
})

describe('P335 Kael Work reply stream', () => {
  it('publishes the stored clarification text with its turn id, and never an estimate', async () => {
    const heard = vi.fn()
    const stop = subscribeKaelChatReply('session-store', heard)
    const clarification = sessionStoreClient('turn-clarification')
    await appendKaelSystemTurn(clarification.client as never, 'session-store', {
      contentType: 'clarification',
      nextStatus: 'active',
      text: 'Cầu dao nhảy ngay khi bật lại, hay sau vài phút?',
    })
    const estimate = sessionStoreClient('turn-estimate')
    await appendKaelSystemTurn(estimate.client as never, 'session-store', {
      contentType: 'estimate',
      nextStatus: 'estimate_ready',
      text: 'Ước tính',
    })
    stop()

    expect(heard, pillarWhy(PILLAR, 'the reply must stream the exact stored text under the stored turn id')).toHaveBeenCalledTimes(1)
    expect(heard).toHaveBeenCalledWith({
      text: clarification.inserts[0].text_content,
      turnId: 'turn-clarification',
    })
  })

  it('streams the first reply as a response named by the turn id before the turn result arrives', async () => {
    let finishTurn: () => void = () => undefined
    hooks.runTurn = async () => {
      publishKaelChatReply('session-reply', { text: 'Kael đã nhận ảnh cầu dao.', turnId: 'turn-reply-1' })
      publishKaelChatReply('session-reply', { text: 'Một câu thứ hai.', turnId: 'turn-reply-2' })
      await new Promise<void>((resolve) => { finishTurn = resolve })
      return { session: { id: 'session-reply' }, turns: [] }
    }

    const response = await streamKaelChatTurn({} as never, 'session-reply', { language: 'vi', message: 'x' } as never, {} as never)
    const reader = response.body!.getReader()
    const buffer = { text: '' }

    const completed = await readUntil(reader, 'event: response.completed', buffer)
    expect(completed, pillarWhy(PILLAR, 'the reply must finish streaming before the turn result')).toBe(true)
    expect(buffer.text).toContain('"response_id":"turn-reply-1"')
    expect(buffer.text).toContain('"delta":"Kael đã nhận ảnh cầu dao."')
    expect(buffer.text).not.toContain('Một câu thứ hai.')
    expect(buffer.text).not.toContain('event: result')

    finishTurn()
    expect(await readUntil(reader, 'event: result', buffer)).toBe(true)
  })

  it('streams no reply while two streams overlap on one session, so neither gets the answer of the other request', () => {
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = subscribeKaelChatReply('session-overlap', first)
    const stopSecond = subscribeKaelChatReply('session-overlap', second)
    publishKaelChatReply('session-overlap', { turnId: 'turn-b', text: 'Câu trả lời của yêu cầu B' })
    expect(first, pillarWhy(PILLAR, 'an uncorrelated reply must not reach a stream it may not belong to')).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
    stopFirst()
    stopSecond()

    const later = vi.fn()
    const stopLater = subscribeKaelChatReply('session-overlap', later)
    publishKaelChatReply('session-overlap', { turnId: 'turn-c', text: 'Câu trả lời sau' })
    expect(later, pillarWhy(PILLAR, 'a lone stream streams again once the overlap has closed')).toHaveBeenCalledTimes(1)
    stopLater()
  })
})
