import { createElement, type ReactNode, useEffect } from 'react'
import { type StyleProp, type ViewStyle } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated'
import { motionDuration, motionTokens } from './motion-tokens'
import { useGlassAccessibility } from './accessibility-motion'

type ReduceMotionAwareEntranceViewProps = {
  children: ReactNode
  delayMs?: number
  distanceY?: number
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function reduceMotionAwarePressStyle(pressed: boolean, reduceMotion: boolean): ViewStyle | null {
  if (!pressed || reduceMotion) return null
  return { transform: [{ scale: motionTokens.press.scale }] }
}

export function ReduceMotionAwareEntranceView({
  children,
  delayMs = 0,
  distanceY = motionTokens.entrance.translateY,
  style,
  testID,
}: ReduceMotionAwareEntranceViewProps) {
  const { reduceMotion } = useGlassAccessibility()
  const opacity = useSharedValue(0)
  const translateY = useSharedValue(distanceY)

  useEffect(() => {
    opacity.value = 0
    translateY.value = reduceMotion ? 0 : distanceY

    const duration = motionDuration(motionTokens.entrance.durationMs, reduceMotion)
    opacity.value = withDelay(reduceMotion ? 0 : delayMs, withTiming(1, { duration }))
    translateY.value = reduceMotion
      ? withTiming(0, { duration })
      : withDelay(delayMs, withSpring(0, {
          damping: motionTokens.sheet.damping,
          stiffness: motionTokens.sheet.stiffness,
        }))

    return () => {
      cancelAnimation(opacity)
      cancelAnimation(translateY)
    }
  }, [delayMs, distanceY, opacity, reduceMotion, translateY])

  const animatedStyle = useAnimatedStyle(() => (
    reduceMotion
      ? { opacity: opacity.value }
      : { opacity: opacity.value, transform: [{ translateY: translateY.value }] }
  ), [reduceMotion])

  return createElement(
    Animated.View,
    {
      style: [style, animatedStyle],
      testID,
    },
    children,
  )
}
