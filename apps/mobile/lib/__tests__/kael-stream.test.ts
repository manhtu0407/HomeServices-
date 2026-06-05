import { createKaelSseParser } from '../kael-stream'

describe('Kael SSE parser', () => {
  it('parses split stage, token, result, and heartbeat frames', () => {
    const parser = createKaelSseParser()
    const first = parser.push('event: stage\ndata: {"stage":"market_lookup","status":"running","progress":0.32')
    expect(first).toEqual([])

    const events = parser.push(',"updated_at":"2026-06-04T00:00:00.000Z"}\n\n: heartbeat\n\nevent: token\ndata: {"field":"clarification","delta":"B\\u1ea1n"}\n\nevent: result\ndata: {"session":{"id":"s1"},"turns":[]}\n\n')

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
    expect(events[2]).toEqual({ type: 'token', field: 'clarification', delta: 'B\u1ea1n' })
    expect(events[3]).toMatchObject({ type: 'result', data: { session: { id: 's1' }, turns: [] } })
  })

  it('drops malformed stage frames instead of surfacing fake progress', () => {
    const parser = createKaelSseParser()

    expect(parser.push('event: stage\ndata: {"stage":"market_lookup","status":"done","progress":2}\n\n')).toEqual([])
  })
})
