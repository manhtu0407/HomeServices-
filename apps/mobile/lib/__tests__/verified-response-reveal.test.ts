import {
  revealVerifiedResponse,
  splitVerifiedResponseDeltas,
  verifiedResponseCadenceMs,
} from '../verified-response-reveal'

describe('verified response reveal', () => {
  it('preserves Vietnamese text while splitting it into bounded deltas', () => {
    const response = 'Kael đã kiểm tra mô tả, địa chỉ và khung giờ trước khi xác nhận.'
    const deltas = splitVerifiedResponseDeltas(response)

    expect(deltas.length).toBeGreaterThan(1)
    expect(deltas.length).toBeLessThanOrEqual(40)
    expect(deltas.join('')).toBe(response)
  })

  it('adds progressively longer reading pauses at punctuation boundaries', () => {
    const wordCadence = verifiedResponseCadenceMs('đang kiểm tra ')
    const clauseCadence = verifiedResponseCadenceMs('phạm vi, ')
    const sentenceCadence = verifiedResponseCadenceMs('đã hoàn tất. ')
    const paragraphCadence = verifiedResponseCadenceMs('Cơ sở giá\n')

    expect(wordCadence).toBeGreaterThanOrEqual(100)
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
    expect(waits.every((milliseconds) => milliseconds >= 100 && milliseconds <= 320)).toBe(true)
  })
})
