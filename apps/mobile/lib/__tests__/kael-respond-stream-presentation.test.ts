import {
  createKaelRespondStreamPresentationState,
  isKaelRespondStreamPresentationSettled,
  nextKaelRespondStreamPresentationStep,
  reconcileKaelRespondStreamPresentation,
  type KaelRespondStreamItem,
} from '../kael-respond-stream-presentation'

describe('Kael Respond Stream presentation', () => {
  it('releases only an already-received Vietnamese prefix and preserves its exact text', () => {
    const firstArrival: KaelRespondStreamItem[] = [{
      id: 'reply',
      text: 'Khóa van nước trước khi kiểm tra điểm rò.',
    }]
    let presentation = createKaelRespondStreamPresentationState(firstArrival, 'reply-1', false)
    const firstStep = nextKaelRespondStreamPresentationStep(presentation, firstArrival)

    expect(firstStep).not.toBeNull()
    presentation = firstStep?.state ?? presentation
    expect(firstArrival[0].text.startsWith(presentation.textById.reply)).toBe(true)
    expect(presentation.textById.reply).not.toContain('Gọi thợ')

    const secondArrival: KaelRespondStreamItem[] = [{
      id: 'reply',
      text: 'Khóa van nước trước khi kiểm tra điểm rò. Gọi thợ nếu nước vẫn chảy.',
    }]
    presentation = reconcileKaelRespondStreamPresentation(presentation, secondArrival, 'reply-1')
    while (!isKaelRespondStreamPresentationSettled(presentation, secondArrival, 'reply-1')) {
      presentation = nextKaelRespondStreamPresentationStep(presentation, secondArrival)?.state ?? presentation
    }

    expect(presentation.textById.reply).toBe(secondArrival[0].text)
  })

  it('keeps the backend block order even when later blocks are already available', () => {
    const items: KaelRespondStreamItem[] = [
      { id: 'reasoning-1', text: 'Đã xác định yêu cầu.' },
      { id: 'reasoning-2', text: 'Đã đối chiếu ngữ cảnh liên quan.' },
    ]
    let presentation = createKaelRespondStreamPresentationState(items, 'receipt-1', false)
    const first = nextKaelRespondStreamPresentationStep(presentation, items)
    presentation = first?.state ?? presentation

    expect(presentation.textById['reasoning-1']).not.toBe('')
    expect(presentation.textById['reasoning-2']).toBe('')
  })

  it('speeds up a burst without exposing text that was not received', () => {
    const items: KaelRespondStreamItem[] = [{
      id: 'reply',
      text: 'A'.repeat(900),
    }]
    const presentation = createKaelRespondStreamPresentationState(items, 'reply-burst', false)
    const next = nextKaelRespondStreamPresentationStep(presentation, items)

    expect(next?.delayMs).toBeLessThan(34)
    expect(next?.state.textById.reply.length).toBeLessThanOrEqual(items[0].text.length)
    expect(items[0].text.startsWith(next?.state.textById.reply ?? '')).toBe(true)
  })
})
