import { View } from 'react-native'
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated'

import { LiquidSendArrowIcon } from './liquid-back-button'

const SWAP_IN_MS = 160
const SWAP_OUT_MS = 110
const ARROW_SIZE = 17
const STOP_SIZE = 10

// ChatGPT-style composer action: the up arrow and the stop square swap in place with a quick
// zoom-and-fade, so the same button reads "send" before a reply and "stop" while Kael answers.
export function KaelSendStopGlyph({
  arrowColor,
  reduceMotion,
  stopColor,
  stopping,
  testIDPrefix,
}: {
  arrowColor: string
  reduceMotion: boolean
  stopColor: string
  stopping: boolean
  testIDPrefix: string
}) {
  const entering = reduceMotion ? undefined : ZoomIn.duration(SWAP_IN_MS)
  const exiting = reduceMotion ? undefined : ZoomOut.duration(SWAP_OUT_MS)
  return stopping ? (
    <Animated.View entering={entering} exiting={exiting} key="stop" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{ backgroundColor: stopColor, borderCurve: 'continuous', borderRadius: 2.5, height: STOP_SIZE, width: STOP_SIZE }}
        testID={`${testIDPrefix}-stop-square`}
      />
    </Animated.View>
  ) : (
    <Animated.View entering={entering} exiting={exiting} key="send" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <LiquidSendArrowIcon color={arrowColor} size={ARROW_SIZE} testID={`${testIDPrefix}-send-arrow`} />
    </Animated.View>
  )
}
