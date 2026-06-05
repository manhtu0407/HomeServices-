import { describe, expect, it } from 'vitest'

import {
  createSseResponse,
  encodeSseEvent,
  encodeSseHeartbeat,
} from '../../../../../supabase/functions/mobile-api/_shared/sse'

describe('mobile-api SSE helper', () => {
  it('frames typed events as text/event-stream chunks', () => {
    expect(encodeSseEvent({
      event: 'stage',
      data: { stage: 'market_lookup', status: 'running', progress: 0.32 },
    })).toBe('event: stage\ndata: {"stage":"market_lookup","status":"running","progress":0.32}\n\n')
  })

  it('frames heartbeat comments without event data', () => {
    expect(encodeSseHeartbeat()).toBe(': heartbeat\n\n')
  })

  it('sets no-cache event-stream response headers', () => {
    const response = createSseResponse(new ReadableStream())

    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(response.headers.get('Connection')).toBe('keep-alive')
  })
})
