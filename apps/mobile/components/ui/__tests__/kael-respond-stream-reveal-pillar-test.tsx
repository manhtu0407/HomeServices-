import { act, renderHook } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { useKaelRespondStreamItems } from '../use-kael-respond-stream-presentation'

export const PILLAR = {
  id: 'P336-kael-live-reply-reveals-complete-text',
  invariant:
    'a live Kael reply whose text is already complete at first paint still reveals progressively and reports settled exactly once, so the stored turn can replace it; a stored turn renders complete at once and never reveals',
  authority: [
    'governance/RULES.md #8 (the reveal paces text the server already validated; it never invents text)',
    'governance/protocols/frontend-test.md G3',
  ],
  target: 'apps/mobile/components/ui/use-kael-respond-stream-presentation.ts',
  layer: 'unit',
  siblings: ['P335-kael-work-reply-stream'],
  mutation:
    'drop revealOnMount from the reveal condition or from the initial active stream — the reveal or settle case turns red',
} as const satisfies PillarManifest

const reply = 'Kael đã nhận ảnh cầu dao. Cầu dao nhảy ngay khi bạn bật lại, hay sau vài phút mới nhảy?'
const items = [{ id: 'turn-reply:block:0', text: reply }]

describe('P336 live reply reveal', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('reveals a reply that arrived complete, then settles once', () => {
    const onSettled = jest.fn()
    const { result } = renderHook(() => useKaelRespondStreamItems({
      items,
      onSettled,
      reduceMotion: false,
      revealOnMount: true,
      streamId: 'turn-reply',
      streaming: false,
      terminal: true,
    }))

    withPillarContext(PILLAR, () => {
      expect(result.current[0].text.length).toBeLessThan(reply.length)
      expect(onSettled).not.toHaveBeenCalled()
    }, 'a complete live reply must not jump in whole')

    for (let step = 0; step < 400 && result.current[0].text !== reply; step += 1) {
      act(() => { jest.advanceTimersByTime(50) })
    }
    act(() => { jest.advanceTimersByTime(50) })

    withPillarContext(PILLAR, () => {
      expect(result.current[0].text).toBe(reply)
      expect(onSettled).toHaveBeenCalledTimes(1)
      expect(onSettled).toHaveBeenCalledWith('turn-reply')
    }, 'the live reply must report settled so the stored turn can take its place')
  })

  it('renders a stored turn complete at once', () => {
    const { result } = renderHook(() => useKaelRespondStreamItems({
      items,
      reduceMotion: false,
      streamId: 'turn-stored',
      streaming: false,
      terminal: true,
    }))

    withPillarContext(PILLAR, () => expect(result.current[0].text).toBe(reply))
  })

  it('shows the whole reply and settles at once under Reduce Motion', () => {
    const onSettled = jest.fn()
    const { result } = renderHook(() => useKaelRespondStreamItems({
      items,
      onSettled,
      reduceMotion: true,
      revealOnMount: true,
      streamId: 'turn-reduced',
      streaming: false,
      terminal: true,
    }))

    withPillarContext(PILLAR, () => {
      expect(result.current[0].text).toBe(reply)
      expect(onSettled).toHaveBeenCalledTimes(1)
    })
  })
})
