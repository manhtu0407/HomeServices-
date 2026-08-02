import {
  revealVerifiedResponse,
  splitVerifiedResponseDeltas,
  verifiedResponseCadenceMs,
} from '../verified-response-reveal'
import {
  initialKaelResponseStreamState,
  kaelResponseStreamReducer,
} from '../kael-response-stream'

describe('verified response reveal', () => {
  it('preserves Vietnamese text while splitting it into bounded deltas', () => {
    const response = 'Kael đã kiểm tra mô tả, địa chỉ và khung giờ trước khi xác nhận.'
    const deltas = splitVerifiedResponseDeltas(response)

    expect(deltas.length).toBeGreaterThan(1)
    expect(deltas.length).toBeLessThanOrEqual(72)
    expect(deltas.join('')).toBe(response)
  })

  it('adds progressively longer reading pauses at punctuation boundaries', () => {
    const wordCadence = verifiedResponseCadenceMs('đang kiểm tra ')
    const clauseCadence = verifiedResponseCadenceMs('phạm vi, ')
    const sentenceCadence = verifiedResponseCadenceMs('đã hoàn tất. ')
    const paragraphCadence = verifiedResponseCadenceMs('Cơ sở giá\n')

    expect(wordCadence).toBeGreaterThanOrEqual(80)
    expect(wordCadence).toBeLessThanOrEqual(95)
    expect(clauseCadence).toBeGreaterThan(wordCadence)
    expect(sentenceCadence).toBeGreaterThan(clauseCadence)
    expect(paragraphCadence).toBeGreaterThan(sentenceCadence)
  })

  it('emits ordered deltas and stops when the owning request becomes stale', async () => {
    const received: string[] = []
    const waits: number[] = []
    let current = true

    const completed = await revealVerifiedResponse({
      isCurrent: () => current,
      onDelta: (event) => {
        received.push(event.delta)
        if (received.length === 2) current = false
      },
      text: 'Kael đang kiểm tra lại thông tin bạn vừa cung cấp.',
      turnId: 'local-turn-1',
      wait: async (milliseconds) => {
        waits.push(milliseconds)
      },
    })

    expect(completed).toBe(false)
    expect(received).toHaveLength(2)
    expect(waits.every((milliseconds) => milliseconds >= 80 && milliseconds <= 360)).toBe(true)
  })

  it('reveals local fallback responses through the universal block lifecycle', async () => {
    const text = 'Doan dau tien.\n\n- Buoc mot\n- Buoc hai'
    let state = initialKaelResponseStreamState
    let responseMode: string | null = null

    const completed = await revealVerifiedResponse({
      isCurrent: () => true,
      onResponseEvent: (event) => {
        if (event.type === 'response.started') responseMode = event.mode
        state = kaelResponseStreamReducer(state, event)
      },
      text,
      turnId: 'local-turn-blocks',
      wait: async () => undefined,
    })

    expect(completed).toBe(true)
    expect(responseMode).toBe('standard')
    expect(state.status).toBe('completed')
    expect(state.blockOrder.map((blockId) => state.blocks[blockId].text).join('\n\n')).toBe(text)
  })
})
