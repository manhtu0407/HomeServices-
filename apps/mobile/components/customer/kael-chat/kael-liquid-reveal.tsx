import { useEffect } from 'react'
import {
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'

type Props = Omit<ViewProps, 'style'> & {
  durationMs?: number
  reduceMotion: boolean
  style?: StyleProp<ViewStyle>
}

export function KaelLiquidReveal({ durationMs = 125, reduceMotion, style, ...props }: Props) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0)
  const scale = useSharedValue(reduceMotion ? 1 : 0.985)
  const translateY = useSharedValue(reduceMotion ? 0 : -4)

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1
      scale.value = 1
      translateY.value = 0
      return
    }
    opacity.value = withTiming(1, { duration: motionDuration(durationMs, reduceMotion) })
    scale.value = withSpring(1, motionTokens.liquid.entrance)
    translateY.value = withSpring(0, motionTokens.liquid.pill)
  }, [durationMs, opacity, reduceMotion, scale, translateY])

  useEffect(() => () => {
    cancelAnimation(opacity)
    cancelAnimation(scale)
    cancelAnimation(translateY)
  }, [opacity, scale, translateY])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }))

  return <Animated.View {...props} style={[style, animatedStyle]} />
}
