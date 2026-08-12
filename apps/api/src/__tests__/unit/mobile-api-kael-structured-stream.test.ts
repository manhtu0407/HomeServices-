import { describe, expect, it } from 'vitest'

import { createStructuredResponseStreamObserver } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/structured-call'

describe('mobile-api structured public response observer', () => {
  it('releases complete public summaries and answer prefixes in provider arrival order', () => {
    const summaries: Array<{ detail: string; index: number }> = []
    const textUpdates: Array<{ text: string; complete: boolean }> = []
    const observer = createStructuredResponseStreamObserver({
      textField: 'answer',
      onPublicReasoningSummary: (detail, index) => summaries.push({ detail, index }),
      onTextUpdate: (text, complete) => textUpdates.push({ text, complete }),
    })

    observer.push('{"public_reasoning_summary":["Checked the safety constraint","')
    expect(summaries).toEqual([{ detail: 'Checked the safety constraint', index: 0 }])
    expect(textUpdates).toEqual([])

    observer.push('Prepared a concise next step"],"answer":"Turn off the valve')
    expect(summaries).toEqual([
      { detail: 'Checked the safety constraint', index: 0 },
      { detail: 'Prepared a concise next step', index: 1 },
    ])
    expect(textUpdates).toEqual([{ text: 'Turn off the valve', complete: false }])

    observer.push(' before inspecting the leak."}')
    expect(textUpdates.at(-1)).toEqual({
      text: 'Turn off the valve before inspecting the leak.',
      complete: true,
    })
    expect(observer.hasSeenText()).toBe(true)
  })

  it('does not leak leading thought tags or a partial escape sequence', () => {
    const textUpdates: Array<{ text: string; complete: boolean }> = []
    const observer = createStructuredResponseStreamObserver({
      textField: 'text',
      onTextUpdate: (text, complete) => textUpdates.push({ text, complete }),
    })

    observer.push('<think>private provider rationale</think>{"public_reasoning_summary":["Checked the safe scope."],"text":"Safe \\u')
    expect(textUpdates).toEqual([{ text: 'Safe ', complete: false }])

    observer.push('0111pdate"}')
    expect(textUpdates).toEqual([
      { text: 'Safe ', complete: false },
      { text: `Safe ${String.fromCharCode(0x0111)}pdate`, complete: true },
    ])
    expect(textUpdates.flatMap(({ text }) => text)).not.toContain('private provider rationale')
  })

  it('withholds an answer field that arrives before its public summary', () => {
    const summaries: string[] = []
    const textUpdates: Array<{ text: string; complete: boolean }> = []
    const observer = createStructuredResponseStreamObserver({
      textField: 'answer',
      onPublicReasoningSummary: (detail) => summaries.push(detail),
      onTextUpdate: (text, complete) => textUpdates.push({ text, complete }),
    })

    observer.push('{"answer":"This answer must not stream first.","public_reasoning_summary":["Checked the request boundary."]}')

    expect(summaries).toEqual(['Checked the request boundary.'])
    expect(textUpdates).toEqual([])
    expect(observer.hasSeenText()).toBe(false)
  })

  it('does not treat a text field in a multi-part thinking wrapper as a reply', () => {
    const summaries: string[] = []
    const textUpdates: string[] = []
    const observer = createStructuredResponseStreamObserver({
      textField: 'text',
      onPublicReasoningSummary: (detail) => summaries.push(detail),
      onTextUpdate: (text) => textUpdates.push(text),
    })

    observer.push('[{"type":"thinking","text":"private provider rationale"},{"public_reasoning_summary":["Checked the safe scope."]},{"type":"final","text":"Safe final answer."}]')

    expect(summaries).toEqual(['Checked the safe scope.'])
    expect(textUpdates).toEqual([])
    expect(textUpdates.join(' ')).not.toContain('private provider rationale')
  })
})
