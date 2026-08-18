import { Image } from 'expo-image'
import { Pressable, StyleSheet, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'

import { KAEL_CORE_V9_SIZE } from './kael-core-v9-contract'

export type KaelNavigationRole = 'customer' | 'worker'

const kaelNavigationSources: Record<KaelNavigationRole, ImageSourcePropType> = {
  customer: require('@/assets/kael/navigation/kael-customer-navigation-monocle.png'),
  worker: require('@/assets/kael/navigation/kael-worker-navigation-monocle.png'),
}

type KaelNavigationAccessoryProps = {
  accessibilityLabel: string
  active?: boolean
  artworkSize?: number
  onPress: () => void
  reduceMotion?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  visualRole: KaelNavigationRole
}

export function KaelNavigationAccessory({
  accessibilityLabel,
  active,
  artworkSize = KAEL_CORE_V9_SIZE,
  onPress,
  reduceMotion = false,
  style,
  testID,
  visualRole,
}: KaelNavigationAccessoryProps) {
  const artworkScale = useSharedValue(1)
  const artworkY = useSharedValue(0)
  const animatePress = () => {
    if (reduceMotion) return

    artworkScale.value = withSequence(
      withTiming(0.975, { duration: 100 }),
      withTiming(1, { duration: 180 }),
    )
    artworkY.value = withSequence(
      withTiming(-2, { duration: 100 }),
      withTiming(0, { duration: 180 }),
    )
  }
  const artworkMotionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: artworkScale.value }, { translateY: artworkY.value }],
  }))

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={active === undefined ? undefined : { selected: active }}
      onFocus={animatePress}
      onHoverIn={animatePress}
      onPress={onPress}
      onPressIn={animatePress}
      style={[styles.accessory, style]}
      testID={testID}
    >
      <Animated.View style={artworkMotionStyle} testID={testID ? `${testID}-motion` : undefined}>
        <Image
          accessible={false}
          contentFit="contain"
          source={kaelNavigationSources[visualRole]}
          style={{ height: artworkSize, width: artworkSize }}
          testID={testID ? `${testID}-artwork` : undefined}
        />
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  accessory: {
    alignItems: 'center',
    flexShrink: 0,
    height: 68,
    justifyContent: 'center',
    overflow: 'visible',
    width: 68,
  },
})
