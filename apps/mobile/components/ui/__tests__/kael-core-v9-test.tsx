import { render } from '@testing-library/react-native'
import { useEffect, useRef } from 'react'

import {
  KAEL_CORE_V9_BOW_DURATION_MS,
  KAEL_CORE_V9_CONTRACT,
  KAEL_CORE_V9_SIZE,
  KaelCoreV9,
  type KaelCoreV9Handle,
} from '../kael-core-v9'

describe('Kael Core v9', () => {
  it('renders the approved 68px Obsidian Pearl model with two pill eyes and one monocle', () => {
    const { getAllByTestId, getByTestId } = render(<KaelCoreV9 testID="kael-core-v9" />)

    expect(getByTestId('kael-core-v9')).toBeOnTheScreen()
    expect(getAllByTestId('kael-core-v9-eye')).toHaveLength(2)
    expect(getByTestId('kael-core-v9-monocle')).toBeOnTheScreen()
    expect(KAEL_CORE_V9_SIZE).toBe(68)
    expect(KAEL_CORE_V9_BOW_DURATION_MS).toBe(1220)
    expect(KAEL_CORE_V9_CONTRACT).toMatchObject({
      handCount: 0,
      legacyMotionCount: 0,
      legacyStatusCount: 0,
      motionVocabulary: ['bow'],
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
