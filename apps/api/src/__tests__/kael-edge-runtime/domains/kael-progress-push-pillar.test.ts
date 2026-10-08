import { afterEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'

export const PILLAR = {
  id: 'P334-kael-progress-push-to-stream',
  invariant:
    'a Kael Work stage written by the pipeline reaches the open SSE stream at the moment it is written, without waiting for the database poll; a listener that throws never fails the progress write, and a closed stream stops listening',
  authority: [
    'governance/RULES.md #8 (progress lines come only from real backend stages, never local timers)',
    'governance/STRUCTURES.md §4.5 (domains/ may reach kael/, never the reverse)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/pipeline/streaming.ts',
  layer: 'unit',
  siblings: ['P313-kael-chat-turn-images'],
  mutation:
    'drop the notify call from updateKaelProgress, stop subscribing in the stream, or let a listener error escape — the push, isolation, or unsubscribe case turns red',
} as const satisfies PillarManifest

const hooks = vi.hoisted(() => ({
  pollReads: 0,
  runTurn: null as null | (() => Promise<unknown>),
}))

vi.mock('../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/read.service', () => ({
  readKaelChatProgressSnapshot: vi.fn(async () => {
    hooks.pollReads += 1
    return { progress: null, session_id: 'session-push' }
  }),
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

import { streamKaelChatTurn } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/stream'
import {
  subscribeKaelProgress,
  updateKaelProgress,
} from '../../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/streaming'

function progressClient() {
  const writes: unknown[] = []
  return {
    client: {
      from: () => ({
        update: (payload: unknown) => ({
          eq: async () => {
            writes.push(payload)
            return { error: null }
          },
        }),
      }),
    },
    writes,
  }
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
  hooks.pollReads = 0
  hooks.runTurn = null
})

describe('P334 Kael progress push to the open stream', () => {
  it('delivers a pipeline stage to the stream while the turn is still running and the poll has seen nothing', async () => {
    const { client } = progressClient()
    let finishTurn: () => void = () => undefined
    hooks.runTurn = async () => {
      await updateKaelProgress(client, { table: 'kael_chat_sessions', id: 'session-push' }, {
        progress: 0.1,
        stage: 'intent_classification',
        status: 'running',
      })
      await new Promise<void>((resolve) => { finishTurn = resolve })
      return { session: { id: 'session-push' }, turns: [] }
    }

    const response = await streamKaelChatTurn({} as never, 'session-push', { message: 'x' } as never, {} as never)
    const reader = response.body!.getReader()
    const buffer = { text: '' }

    const stageArrived = await readUntil(reader, 'event: stage', buffer)
    expect(stageArrived, pillarWhy(PILLAR, 'the stage frame must arrive before the turn finishes, from the push alone')).toBe(true)
    expect(buffer.text).toContain('"stage":"intent_classification"')
    expect(buffer.text).not.toContain('event: result')

    finishTurn()
    expect(await readUntil(reader, 'event: result', buffer)).toBe(true)
    expect(buffer.text.match(/event: stage/g)).toHaveLength(1)
  })

  it('keeps writing progress when a listener throws, and stops calling a listener after unsubscribe', async () => {
    const target = { table: 'kael_chat_sessions' as const, id: 'session-isolation' }
    const { client, writes } = progressClient()
    const heard = vi.fn()
    const stopThrowing = subscribeKaelProgress(target, () => {
      throw new Error('listener failure')
    })
    const stopHearing = subscribeKaelProgress(target, heard)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await updateKaelProgress(client, target, { progress: 0.5, stage: 'clarification', status: 'running' })
    stopThrowing()
    stopHearing()
    await updateKaelProgress(client, target, { progress: 1, stage: 'clarification', status: 'completed' })

    expect(writes, pillarWhy(PILLAR, 'a broken listener must not cost the durable progress write')).toHaveLength(2)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(heard).toHaveBeenCalledWith(expect.objectContaining({ current_stage: 'clarification', status: 'running' }))
    warn.mockRestore()
  })
})
