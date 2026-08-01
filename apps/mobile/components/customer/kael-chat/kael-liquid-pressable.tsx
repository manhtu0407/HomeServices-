import { useEffect, useRef, type ReactNode } from 'react'
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

type Props = Omit<PressableProps, 'children' | 'onPressIn' | 'onPressOut' | 'style'> & {
  children: ReactNode
  pressScale?: number
  reduceMotion: boolean
  selected?: boolean
  style?: StyleProp<ViewStyle>
}

export function KaelLiquidPressable({
  children,
  disabled = false,
  pressScale = 0.97,
  reduceMotion,
  selected = false,
  style,
  ...props
}: Props) {
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (reduceMotion || disabled) {
      opacity.value = 1
      scale.value = 1
      return
    }
    scale.value = withSequence(
      withSpring(selected ? 1.025 : 0.99, motionTokens.liquid.press),
      withSpring(1, motionTokens.liquid.press),
    )
  }, [disabled, opacity, reduceMotion, scale, selected])

  useEffect(() => () => {
    cancelAnimation(opacity)
    cancelAnimation(scale)
  }, [opacity, scale])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

  const setPressed = (pressed: boolean) => {
    if (disabled) return
    opacity.value = withTiming(pressed ? 0.82 : 1, {
      duration: motionDuration(pressed ? 85 : 145, reduceMotion),
    })
    if (!reduceMotion) {
      scale.value = withSpring(pressed ? pressScale : 1, motionTokens.liquid.press)
    }
  }

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  )
}
