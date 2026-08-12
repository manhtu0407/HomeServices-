import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Defs, Rect } from 'react-native-svg'

import { motionDuration } from '@/components/ui/motion-tokens'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'

import { customerV21ProfileUtilityStyles as profileUtilityStyles } from './profile-utility-styles'
import { customerV21SharedStyles as sharedStyles } from '../ui/shared-styles'
import { useV21Theme } from '../ui/use-v21-theme'

export function ProfileProgressBar({ percent, testID }: { percent: number; testID?: string }) {
  const { reduceMotion, reduceTransparency, tokens } = useV21Theme()
  const clamped = Math.max(0, Math.min(100, percent))
  const fillWidth = useSharedValue(reduceMotion ? clamped : 0)
  const sheenX = useSharedValue(-72)
  const sheenOpacity = useSharedValue(0)

  useEffect(() => {
    cancelAnimation(fillWidth)
    cancelAnimation(sheenX)
    cancelAnimation(sheenOpacity)

    if (reduceMotion) {
      fillWidth.value = clamped
      sheenX.value = -72
      sheenOpacity.value = 0
      return
    }

    fillWidth.value = 0
    fillWidth.value = withTiming(clamped, { duration: motionDuration(620, reduceMotion) })
    sheenX.value = -72
    sheenOpacity.value = withTiming(clamped > 0 ? 0.8 : 0, { duration: motionDuration(120, reduceMotion) })
    sheenX.value = withTiming(260, { duration: motionDuration(820, reduceMotion) })
    sheenOpacity.value = withDelay(680, withTiming(0, { duration: motionDuration(160, reduceMotion) }))

    return () => {
      cancelAnimation(fillWidth)
      cancelAnimation(sheenX)
      cancelAnimation(sheenOpacity)
    }
  }, [clamped, fillWidth, reduceMotion, sheenOpacity, sheenX])

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value}%`,
  }))
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: sheenOpacity.value,
    transform: [{ translateX: sheenX.value }],
  }))

  return (
    <View style={[sharedStyles.protectionBar, { backgroundColor: tokens.border }]} testID={testID}>
      <Animated.View style={[sharedStyles.protectionBarFill, profileUtilityStyles.profileProgressFill, fillStyle]} testID={testID ? `${testID}-fill` : undefined}>
        {!reduceTransparency ? (
          <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 260 8" width="100%">
            <Defs>
              <LinearGradient id="profileProgressFillGradient" x1="0" x2="1" y1="0" y2="0">
                <Stop offset="0" stopColor="#7BE7D6" />
                <Stop offset="0.55" stopColor="#08AF9C" />
                <Stop offset="1" stopColor="#087D72" />
              </LinearGradient>
            </Defs>
            <Rect fill="url(#profileProgressFillGradient)" height="8" rx="4" width="260" />
          </Svg>
        ) : null}
      </Animated.View>
      {!reduceMotion && !reduceTransparency ? (
        <Animated.View pointerEvents="none" style={[profileUtilityStyles.profileProgressSheen, sheenStyle]} testID={testID ? `${testID}-sheen` : undefined} />
      ) : null}
    </View>
  )
}
