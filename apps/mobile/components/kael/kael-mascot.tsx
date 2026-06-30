import { useEffect } from 'react'
import { Image } from 'expo-image'
import { StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { motionTokens } from '@/components/ui/motion-tokens'
import { resolveKaelMascotAsset, type KaelMascotEmotion, type KaelMascotState } from './kael-mascot-assets'

type KaelMascotProps = {
  emotion?: KaelMascotEmotion
  size?: number
  state?: KaelMascotState
  style?: StyleProp<ViewStyle>
  testID?: string
  variant?: 'full' | 'head'
}

export function KaelMascot({
  emotion,
  size = 128,
  state = 'welcome',
  style,
  testID = 'kael-mascot',
  variant = 'full',
}: KaelMascotProps) {
  const { reduceMotion } = useGlassAccessibility()
  const { source } = resolveKaelMascotAsset(state, variant, emotion)
  const imageSize = Math.max(32, size)
  const settle = useSharedValue(1)

  useEffect(() => {
    if (reduceMotion) {
      settle.value = withTiming(1, { duration: 80 })
      return
    }
    settle.value = 0
    settle.value = withSpring(1, motionTokens.liquid.entrance)
  }, [emotion, reduceMotion, settle, state, variant])

  const motionStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : 0.88 + settle.value * 0.12,
    transform: reduceMotion
      ? []
      : [
          { translateY: (1 - settle.value) * 2 },
          { scale: 0.96 + settle.value * 0.04 },
        ],
  }), [reduceMotion])

  return (
    <View
      accessibilityLabel={`Kael ${state}${emotion ? ` ${emotion}` : ''}`}
      accessibilityRole="image"
      style={[styles.shell, { height: imageSize, width: imageSize }, style]}
      testID={`${testID}-${state}`}
    >
      <Animated.View pointerEvents="none" style={[styles.motionLayer, { height: imageSize, width: imageSize }, motionStyle]}>
        <Image contentFit="contain" source={source} style={[styles.image, { height: imageSize, width: imageSize }] as ImageStyle} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  image: {
    transform: [{ translateY: 2 }],
  },
  motionLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
})
