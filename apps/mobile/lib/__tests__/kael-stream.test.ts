import {
  createKaelStreamUtf8Decoder,
  createKaelSseParser,
  isCustomerKaelConversationStreamResult,
  isCustomerKaelStreamResult,
  isWorkerKaelStreamResult,
} from '../kael-stream'
import { SERVICE_TYPES } from '@nestscout/shared'

describe('Kael SSE parser', () => {
  it('parses split stage, verified response delta, token, result, and heartbeat frames', () => {
    const parser = createKaelSseParser()
    const first = parser.push('event: stage\ndata: {"stage":"market_lookup","status":"running","progress":0.32')
    expect(first).toEqual([])

    const events = parser.push(',"updated_at":"2026-06-04T00:00:00.000Z"}\n\n: heartbeat\n\nevent: response_delta\ndata: {"turn_id":"turn-1","delta":"Kael "}\n\nevent: token\ndata: {"field":"clarification","delta":"B\\u1ea1n"}\n\nevent: result\ndata: {"session":{"id":"s1"},"turns":[]}\n\n')

    expect(events[0]).toMatchObject({
      type: 'stage',
      progress: {
        current_stage: 'market_lookup',
        status: 'running',
        progress: 0.32,
        updated_at: '2026-06-04T00:00:00.000Z',
      },
    })
    expect(events[1]).toEqual({ type: 'heartbeat' })
    expect(events[2]).toEqual({
      type: 'response_delta',
      turnId: 'turn-1',
      delta: 'Kael ',
    })
    expect(events[3]).toEqual({ type: 'token', field: 'clarification', delta: 'B\u1ea1n' })
    expect(events[4]).toMatchObject({ type: 'result', data: { session: { id: 's1' }, turns: [] } })
  })

  it('drops malformed stage frames instead of surfacing fake progress', () => {
    const parser = createKaelSseParser()

    expect(parser.push('event: stage\ndata: {"stage":"market_lookup","status":"done","progress":2}\n\n')).toEqual([])
    expect(parser.push('event: stage\ndata: {"stage":"invented","status":"running","progress":0.5,"updated_at":"2026-06-04T00:00:00.000Z"}\n\n')).toEqual([])
    expect(parser.push('event: stage\ndata: {"stage":"market_lookup","status":"running","progress":2,"updated_at":"2026-06-04T00:00:00.000Z"}\n\n')).toEqual([])
    expect(parser.push('event: stage\ndata: {"stage":"market_lookup","status":"running","progress":0.5}\n\n')).toEqual([])
  })

  it('sanitizes hostile error frames before handlers or UI receive them', () => {
    const parser = createKaelSseParser()

    expect(parser.push('event: error\ndata: {"code":"not_found","message":"private\\u202Edetail"}\n\n')).toEqual([
      { code: 'STREAM_ERROR', message: 'Kael stream failed.', type: 'error' },
    ])
    expect(parser.push('event: error\ndata: {"code":"STREAM_BUSY","message":"Kael is busy"}\n\n')).toEqual([
      { code: 'STREAM_BUSY', message: 'Kael is busy', type: 'error' },
    ])
  })

  it('accepts only structurally complete customer stream results', () => {
    const valid = {
      session: {
        id: 'session-1',
        job_id: null,
        customer_id: 'customer-1',
        service_type: 'electrical',
        status: 'active',
        case_phase: 'analysis',
        diagnosis_scope: null,
        scheduled_at: null,
        estimate: null,
        started_at: '2026-07-15T00:00:00.000Z',
        estimate_ready_at: null,
        total_turns: 0,
        total_cost_usd: 0,
        next_action: 'await_input',
      },
      turns: [],
    }

    for (const serviceType of SERVICE_TYPES) {
      expect(isCustomerKaelStreamResult({
        ...valid,
        session: { ...valid.session, service_type: serviceType },
      })).toBe(true)
    }
    expect(isCustomerKaelStreamResult({
      ...valid,
      session: { ...valid.session, service_type: 'air_conditioning' },
    })).toBe(false)
    expect(isCustomerKaelStreamResult({ session: { id: 'session-1' }, turns: [] })).toBe(false)
    expect(isCustomerKaelStreamResult({
      ...valid,
      session: { ...valid.session, total_cost_usd: Number.POSITIVE_INFINITY },
    })).toBe(false)
  })

  it('accepts only complete Customer conversation stream results', () => {
    const valid = {
      session: {
        id: 'conversation-1',
        mode: 'normal',
        customer_id: 'customer-1',
        case_job_id: null,
        case_session_id: null,
        client_request_id: 'create-1',
        title: null,
        pinned_at: null,
        profile_id: null,
        service_type: null,
        started_at: '2026-07-29T00:00:00.000Z',
        updated_at: '2026-07-29T00:00:01.000Z',
        total_turns: 2,
      },
      turns: [
        {
          id: 'turn-1',
          conversation_id: 'conversation-1',
          client_request_id: 'request-1',
          turn_index: 1,
          role: 'customer',
          text_content: 'Xin chao',
          created_at: '2026-07-29T00:00:00.000Z',
        },
        {
          id: 'turn-2',
          conversation_id: 'conversation-1',
          client_request_id: null,
          turn_index: 2,
          role: 'kael',
          text_content: 'Chao ban',
          created_at: '2026-07-29T00:00:01.000Z',
        },
      ],
    }

    expect(isCustomerKaelConversationStreamResult(valid)).toBe(true)
    expect(isCustomerKaelConversationStreamResult({
      ...valid,
      session: { ...valid.session, total_turns: 1 },
    })).toBe(false)
    expect(isCustomerKaelConversationStreamResult({
      ...valid,
      turns: [{ ...valid.turns[0], role: 'worker' }],
    })).toBe(false)
  })

  it('accepts only structurally complete worker stream results', () => {
    const valid = {
      session: {
        id: 'session-1',
        job_id: 'job-1',
        worker_id: 'worker-1',
        status: 'active',
        started_at: '2026-07-15T00:00:00.000Z',
        closed_at: null,
        total_turns: 0,
        progress: null,
      },
      turns: [],
    }

    expect(isWorkerKaelStreamResult(valid)).toBe(true)
    expect(isWorkerKaelStreamResult({ ...valid, turns: {} })).toBe(false)
    expect(isWorkerKaelStreamResult({
      ...valid,
      session: { ...valid.session, total_turns: -1 },
    })).toBe(false)
  })

  it('rejects an unterminated frame before its buffer can grow without bound', () => {
    const parser = createKaelSseParser()

    expect(() => parser.push('x'.repeat(300_000))).toThrow('STREAM_FRAME_TOO_LARGE')
  })

  it('rejects invalid and truncated UTF-8 stream bytes', () => {
    const invalid = createKaelStreamUtf8Decoder()
    expect(() => invalid.push(new Uint8Array([0xc3, 0x28]))).toThrow('STREAM_INVALID_ENCODING')

    const truncated = createKaelStreamUtf8Decoder()
    expect(truncated.push(new Uint8Array([0xe2, 0x82]))).toBe('')
    expect(() => truncated.push(undefined, true)).toThrow('STREAM_INVALID_ENCODING')
  })
})
