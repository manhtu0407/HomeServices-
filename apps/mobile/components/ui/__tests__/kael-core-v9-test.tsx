import { render } from '@testing-library/react-native'
import { useEffect, useRef } from 'react'

import { KaelCoreV9 } from '../kael-core-v9'
import {
  KAEL_CORE_V9_AUTOPLAY_CLIP_DURATION_MS,
  KAEL_CORE_V9_AUTOPLAY_REPEAT_COUNT,
  KAEL_CORE_V9_BOW_DURATION_MS,
  KAEL_CORE_V9_CONTRACT,
  KAEL_CORE_V9_SIZE,
  type KaelCoreV9Handle,
} from '../kael-core-v9-contract'

describe('Kael Core v9', () => {
  it('renders the approved 72px Obsidian Pearl model with the looping v11 clip and no ground shadow', () => {
    const { getAllByTestId, getByTestId, queryByTestId } = render(<KaelCoreV9 motionClip="autoplay-loop" testID="kael-core-v9" />)

    expect(getByTestId('kael-core-v9')).toBeOnTheScreen()
    expect(getAllByTestId('kael-core-v9-eye')).toHaveLength(2)
    expect(getByTestId('kael-core-v9-monocle')).toBeOnTheScreen()
    expect(KAEL_CORE_V9_SIZE).toBe(72)
    expect(KAEL_CORE_V9_BOW_DURATION_MS).toBe(1220)
    expect(KAEL_CORE_V9_AUTOPLAY_CLIP_DURATION_MS).toBe(3800)
    expect(KAEL_CORE_V9_AUTOPLAY_REPEAT_COUNT).toBe(-1)
    expect(queryByTestId('kael-core-v9-ground-shadow')).toBeNull()
    expect(KAEL_CORE_V9_CONTRACT).toMatchObject({
      defaultProximity: 112,
      defaultSize: 72,
      handCount: 0,
      legacyMotionCount: 0,
      legacyStatusCount: 0,
      maxEyeTravelPx: 1.55,
      autoplayRepeatCount: -1,
      motionVocabulary: ['autoplay-clip', 'formal-bow'],
      renderer: 'inline-svg',
      triggers: ['proximity', 'pointer-press', 'keyboard-focus', 'enter-space', 'api'],
      version: '11.0.0',
    })
  })

  it('exposes only the bow interaction through the parent control bridge', () => {
    const onBowStart = jest.fn()

    function Harness() {
      const ref = useRef<KaelCoreV9Handle>(null)

      useEffect(() => {
        ref.current?.bow('pointer-press')
      }, [])

      return <KaelCoreV9 onBowStart={onBowStart} ref={ref} testID="kael-core-v9-bridge" />
    }

    render(<Harness />)

    expect(onBowStart).toHaveBeenCalledWith('pointer-press')
  })
})
