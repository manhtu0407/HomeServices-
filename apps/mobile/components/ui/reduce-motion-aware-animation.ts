import { createElement, type ReactNode, useEffect, useRef } from 'react'
import { Animated, type StyleProp, type ViewStyle } from 'react-native'
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
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(distanceY)).current

  useEffect(() => {
    opacity.setValue(0)
    translateY.setValue(reduceMotion ? 0 : distanceY)

    const duration = motionDuration(motionTokens.entrance.durationMs, reduceMotion)
    const translateAnimation = reduceMotion
      ? Animated.timing(translateY, {
          duration,
          toValue: 0,
          useNativeDriver: true,
        })
      : Animated.sequence([
          Animated.delay(delayMs),
          Animated.spring(translateY, {
            damping: motionTokens.sheet.damping,
            stiffness: motionTokens.sheet.stiffness,
            toValue: 0,
            useNativeDriver: true,
          }),
        ])
    const entrance = Animated.parallel([
      Animated.timing(opacity, {
        delay: reduceMotion ? 0 : delayMs,
        duration,
        toValue: 1,
        useNativeDriver: true,
      }),
      translateAnimation,
    ])

    entrance.start()
    return () => entrance.stop()
  }, [delayMs, distanceY, opacity, reduceMotion, translateY])

  return createElement(
    Animated.View,
    {
      style: [
        style,
        reduceMotion ? { opacity } : { opacity, transform: [{ translateY }] },
      ],
      testID,
    },
    children,
  )
}
