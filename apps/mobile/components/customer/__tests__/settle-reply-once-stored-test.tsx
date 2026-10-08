import { act, renderHook } from '@testing-library/react-native'

import { useSettleReplyOnceStored } from '../kael-chat/use-settle-reply-once-stored'

type Props = Parameters<typeof useSettleReplyOnceStored>[0]

function renderSettle(initial: Omit<Props, 'settle'>) {
  const settle = jest.fn()
  const view = renderHook((props: Props) => useSettleReplyOnceStored(props), {
    initialProps: { ...initial, settle },
  })
  return { settle, view, rerender: (next: Partial<Props>) => view.rerender({ ...initial, settle, ...next }) }
}

describe('Work reply hand-over waits for the stored turn', () => {
  it('keeps a revealed Work reply on screen until its stored turn arrives', () => {
    const { settle, view, rerender } = renderSettle({ mode: 'case', requestInFlight: true, storedTurns: [{ id: 'kael-question' }] })

    act(() => view.result.current('kael-reply'))
    expect(settle).not.toHaveBeenCalled()

    rerender({ requestInFlight: false, storedTurns: [{ id: 'kael-question' }, { id: 'kael-reply' }] })
    expect(settle).toHaveBeenCalledTimes(1)
    expect(settle).toHaveBeenCalledWith('kael-reply')
  })

  it('hands over at once when the stored turn is already there', () => {
    const { settle, view } = renderSettle({ mode: 'case', requestInFlight: true, storedTurns: [{ id: 'kael-reply' }] })
    act(() => view.result.current('kael-reply'))
    expect(settle).toHaveBeenCalledWith('kael-reply')
  })

  it('still hands over when the request ends without that turn, so nothing stays stuck', () => {
    const { settle, view, rerender } = renderSettle({ mode: 'case', requestInFlight: true, storedTurns: [] })
    act(() => view.result.current('kael-reply'))
    rerender({ requestInFlight: false, storedTurns: [] })
    expect(settle).toHaveBeenCalledTimes(1)
  })

  it('never defers a normal-chat reply', () => {
    const { settle, view } = renderSettle({ mode: 'normal', requestInFlight: true, storedTurns: [] })
    act(() => view.result.current('kael-response:abc'))
    expect(settle).toHaveBeenCalledWith('kael-response:abc')
  })
})
