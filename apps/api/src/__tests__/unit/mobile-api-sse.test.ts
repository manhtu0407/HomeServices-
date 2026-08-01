import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  createSseResponse,
  encodeSseEvent,
  encodeSseHeartbeat,
} from '../../../../../supabase/functions/mobile-api/_shared/sse'
import {
  splitVerifiedResponseDeltas,
  verifiedResponseCadenceMs,
} from '../../../../../supabase/functions/mobile-api/_shared/services/kael-verified-response-stream'

const kaelStreamSource = fs.readFileSync(
  path.resolve(__dirname, '../../../../../supabase/functions/mobile-api/_shared/services/kael-chat-stream.ts'),
  'utf8',
)

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

  it('splits a verified Unicode response without changing its content', () => {
    const response = [
      'Kael \u0111a kiem tra thong tin.',
      'Ban co the tiep tuc khi san sang.',
      '\ud83d\udee0\ufe0f',
    ].join('\n')
    const deltas = splitVerifiedResponseDeltas(response)

    expect(deltas.length).toBeGreaterThan(1)
    expect(deltas.length).toBeLessThanOrEqual(40)
    expect(deltas.join('')).toBe(response)
    expect(deltas.every((delta) => delta.length > 0)).toBe(true)
  })

  it('keeps medium replies granular enough for a visible conversational reveal', () => {
    const response = [
      'Kael đã kiểm tra nội dung bạn gửi.',
      'Bạn nên đối chiếu thời gian, địa chỉ và mô tả trước khi tiếp tục.',
      'Nếu có điểm chưa đúng, hãy sửa lại để Kael xử lý chính xác hơn.',
    ].join(' ')
    const deltas = splitVerifiedResponseDeltas(response)

    expect(deltas.length).toBeGreaterThanOrEqual(16)
    expect(deltas.join('')).toBe(response)
  })

  it('uses a readable cadence with natural pauses at clauses and sentences', () => {
    const wordCadence = verifiedResponseCadenceMs('đang kiểm tra ')
    const clauseCadence = verifiedResponseCadenceMs('phạm vi, ')
    const sentenceCadence = verifiedResponseCadenceMs('đã hoàn tất. ')
    const paragraphCadence = verifiedResponseCadenceMs('Cơ sở giá\n')

    expect(wordCadence).toBeGreaterThanOrEqual(100)
    expect(wordCadence).toBeLessThanOrEqual(130)
    expect(clauseCadence).toBeGreaterThan(wordCadence)
    expect(sentenceCadence).toBeGreaterThan(clauseCadence)
    expect(paragraphCadence).toBeGreaterThan(sentenceCadence)
  })

  it('flushes a heartbeat as soon as each Kael stream opens', () => {
    // A first byte keeps Expo connected while Storage or an AI provider starts.
    expect(kaelStreamSource).toMatch(
      /Vision\. Expo otherwise can time out while the server is still working\.\s*write\(encodeSseHeartbeat\(\)\);/,
    )
    expect(kaelStreamSource).toMatch(
      /needs more time than the client connection window\.\s*write\(encodeSseHeartbeat\(\)\);/,
    )
  })
})
