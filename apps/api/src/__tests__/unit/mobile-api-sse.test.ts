import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  createSseResponse,
  encodeSseEvent,
  encodeSseHeartbeat,
} from '../../../../../supabase/functions/mobile-api/_shared/platform/sse'
import {
  createKaelResponseReporter,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/response-stream'

const kaelStreamSource = [
  'stream.ts',
  'customer-conversation-stream.ts',
  'worker-stream.ts',
].map((file) => fs.readFileSync(
  path.resolve(__dirname, '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat', file),
  'utf8',
)).join('\n')

describe('mobile-api SSE helper', () => {
  it('frames typed events as text/event-stream chunks', () => {
    expect(encodeSseEvent({
      event: 'stage',
      data: { stage: 'market_lookup', status: 'running', progress: 0.32 },
    })).toBe('event: stage\ndata: {"stage":"market_lookup","status":"running","progress":0.32}\n\n')
  })

  it('frames heartbeat comments and cache-safe SSE headers', () => {
    expect(encodeSseHeartbeat()).toBe(': heartbeat\n\n')
    const response = createSseResponse(new ReadableStream())
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(response.headers.get('Connection')).toBe('keep-alive')
  })

  it('emits only caller-provided answer prefixes with no simulated cadence', () => {
    const events: Array<{ event: string; data: Record<string, unknown> }> = []
    const reporter = createKaelResponseReporter({
      emit: (event, data) => events.push({ event, data: data as Record<string, unknown> }),
      responseId: 'reply-1',
      startedAt: new Date(),
    })

    reporter.preview('Da kiem tra yeu cau.')
    reporter.preview('Da kiem tra yeu cau. Hay khoa van nuoc truoc.')
    reporter.complete('Da kiem tra yeu cau. Hay khoa van nuoc truoc.')

    expect(events.map(({ event }) => event)).toEqual([
      'response.started',
      'block.started',
      'block.text.delta',
      'block.text.delta',
      'block.completed',
      'response.completed',
    ])
    expect(events.filter(({ event }) => event === 'block.text.delta')
      .map(({ data }) => data.delta).join('')).toBe(
      'Da kiem tra yeu cau. Hay khoa van nuoc truoc.',
    )
    expect(events.find(({ event }) => event === 'response.completed')?.data.elapsed_ms)
      .toEqual(expect.any(Number))
  })

  it('keeps deterministic fallbacks atomic instead of inventing a typing reveal', () => {
    const events: string[] = []
    const reporter = createKaelResponseReporter({
      emit: (event) => events.push(event),
      responseId: 'reply-fallback',
    })

    reporter.complete('Phan hoi an toan da san sang.')

    expect(events).toEqual([
      'response.started',
      'block.started',
      'block.text.delta',
      'block.completed',
      'response.completed',
    ])
  })

  it('closes a verified streamed prefix without appending a generic fallback', () => {
    const events: string[] = []
    const reporter = createKaelResponseReporter({
      emit: (event) => events.push(event),
      responseId: 'reply-published-prefix',
    })

    reporter.preview('Da kiem tra yeu cau truoc.')
    reporter.complete(reporter.publishedText())

    expect(events).toEqual([
      'response.started',
      'block.started',
      'block.text.delta',
      'block.completed',
      'response.completed',
    ])
    expect(events).not.toContain('response.failed')
  })

  it('opens customer and worker streams promptly without the retired post-hoc reveal', () => {
    expect(kaelStreamSource).toContain('write(encodeSseHeartbeat());')
    expect(kaelStreamSource).toContain('createKaelResponseReporter({ emit, language })')
    expect(kaelStreamSource).toContain('createKaelResponseReporter({ emit, language: input.language })')
    expect(kaelStreamSource).not.toContain('emitCommittedKaelReply')
    expect(kaelStreamSource).not.toContain('response_delta')
  })
})
