import { useEffect, useRef } from 'react'
import { View, type ViewStyle } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'

import { motionTokens } from '@/components/ui/motion-tokens'

import {
  CUSTOMER_LIQUID_NAV_LENS_RADIUS,
  CUSTOMER_LIQUID_NAV_RAIL_PADDING,
  customerV21DockStyles as dockStyles,
} from './dock-styles'

type LiquidSelectionLensProps = {
  itemCount: number
  reduceMotion: boolean
  reduceTransparency: boolean
  selectedIndex: number | null
  surfaceWidth: number
  testID: string
}

export function LiquidSelectionLens({ itemCount, reduceMotion, reduceTransparency, selectedIndex, surfaceWidth, testID }: LiquidSelectionLensProps) {
  const normalizedItemCount = Math.max(itemCount, 1)
  const normalizedSelectedIndex = selectedIndex === null
    ? null
    : Math.min(Math.max(selectedIndex, 0), normalizedItemCount - 1)
  const previousIndexRef = useRef(normalizedSelectedIndex ?? 0)
  const tabWidth = Math.max(surfaceWidth - CUSTOMER_LIQUID_NAV_RAIL_PADDING * 2, 0) / normalizedItemCount
  const lensX = useSharedValue(0)
  const lensScaleX = useSharedValue(1)
  const lensScaleY = useSharedValue(1)
  const lensRadius = useSharedValue<number>(CUSTOMER_LIQUID_NAV_LENS_RADIUS)
  const lensSkew = useSharedValue(0)
  const lensSheenX = useSharedValue(-84)
  const lensSheenOpacity = useSharedValue(0)
  const dockShimmerX = useSharedValue(0)
  const dockCausticX = useSharedValue(0)

  const dockCausticWidth = Math.min(118, Math.max(tabWidth + 48, 72))
  const dockCausticLeft = (tabWidth - dockCausticWidth) / 2
  const liquidDockStyles = dockStyles as typeof dockStyles & Record<
    | 'dockCaustic'
    | 'dockCausticGlow'
    | 'dockCausticSweep'
    | 'dockCausticSweepBright'
    | 'dockInnerRefraction'
    | 'dockLens'
    | 'dockLensBloom'
    | 'dockLensInnerShadow'
    | 'dockLensSheen'
    | 'dockLensTopLight'
    | 'dockShimmer',
    ViewStyle
  >

  const animatedLensStyle = useAnimatedStyle(() => ({
    borderRadius: lensRadius.value,
    transform: [
      { translateX: lensX.value },
      { scaleX: lensScaleX.value },
      { scaleY: lensScaleY.value },
      { skewX: `${lensSkew.value}deg` },
    ],
  }))
  const animatedLensSheenStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion || reduceTransparency ? 0 : lensSheenOpacity.value,
    transform: [{ translateX: lensSheenX.value }, { rotate: '-12deg' }],
  }), [reduceMotion, reduceTransparency])
  const animatedDockShimmerStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion || reduceTransparency ? 0 : 0.73,
    transform: [{ translateX: dockShimmerX.value }],
  }), [reduceMotion, reduceTransparency])
  const animatedDockCausticStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion || reduceTransparency ? 0 : 1,
    transform: [{ translateX: dockCausticX.value }],
  }), [reduceMotion, reduceTransparency])

  useEffect(() => {
    if (tabWidth === 0 || surfaceWidth === 0 || normalizedSelectedIndex === null) return

    const targetX = normalizedSelectedIndex * tabWidth
    const shimmerTarget = (0.18 + normalizedSelectedIndex * 0.22) * surfaceWidth
    const causticTarget = normalizedSelectedIndex * tabWidth
    const delta = normalizedSelectedIndex - previousIndexRef.current

    cancelAnimation(lensX)
    cancelAnimation(lensScaleX)
    cancelAnimation(lensScaleY)
    cancelAnimation(lensRadius)
    cancelAnimation(lensSkew)
    cancelAnimation(lensSheenX)
    cancelAnimation(lensSheenOpacity)
    cancelAnimation(dockShimmerX)
    cancelAnimation(dockCausticX)

    if (reduceMotion || reduceTransparency || delta === 0) {
      lensX.value = targetX
      lensScaleX.value = 1
      lensScaleY.value = 1
      lensRadius.value = CUSTOMER_LIQUID_NAV_LENS_RADIUS
      lensSkew.value = 0
      dockShimmerX.value = shimmerTarget
      dockCausticX.value = causticTarget
      lensSheenOpacity.value = 0
      previousIndexRef.current = normalizedSelectedIndex
      return
    }

    const stretch = Math.min(1.21, 1.08 + Math.abs(delta) * 0.045)
    const direction = Math.sign(delta)
    lensX.value = withSpring(targetX, motionTokens.liquid.pill)
    lensScaleX.value = withSequence(withTiming(stretch, { duration: 235 }), withSpring(0.965, motionTokens.liquid.press), withSpring(1, motionTokens.liquid.press))
    lensScaleY.value = withSequence(withTiming(0.91, { duration: 235 }), withSpring(1.035, motionTokens.liquid.press), withSpring(1, motionTokens.liquid.press))
    lensRadius.value = withSequence(withTiming(27, { duration: 235 }), withTiming(22, { duration: 190 }), withSpring(CUSTOMER_LIQUID_NAV_LENS_RADIUS, motionTokens.liquid.press))
    lensSkew.value = withSequence(withTiming(direction * -2.2, { duration: 235 }), withTiming(0, { duration: 325 }))
    lensSheenX.value = -84
    lensSheenOpacity.value = withSequence(withTiming(0.84, { duration: 90 }), withTiming(0, { duration: 270 }))
    lensSheenX.value = withTiming(84, { duration: 360 })
    dockShimmerX.value = withTiming(shimmerTarget, { duration: 580 })
    dockCausticX.value = withTiming(causticTarget, { duration: 560 })
    previousIndexRef.current = normalizedSelectedIndex
  }, [dockCausticX, dockShimmerX, lensRadius, lensScaleX, lensScaleY, lensSheenOpacity, lensSheenX, lensSkew, lensX, normalizedSelectedIndex, reduceMotion, reduceTransparency, surfaceWidth, tabWidth])

  if (reduceTransparency) return null

  return (
    <>
      <Animated.View pointerEvents="none" style={[liquidDockStyles.dockShimmer, { width: surfaceWidth * 0.72 }, animatedDockShimmerStyle]} testID={`${testID}-shimmer`} />
      <View pointerEvents="none" style={liquidDockStyles.dockCaustic} testID={`${testID}-caustic`}>
        <Animated.View pointerEvents="none" style={[liquidDockStyles.dockCausticGlow, { left: dockCausticLeft, width: dockCausticWidth }, animatedDockCausticStyle]} testID={`${testID}-caustic-glow`} />
        <View pointerEvents="none" style={liquidDockStyles.dockCausticSweep} />
        <View pointerEvents="none" style={liquidDockStyles.dockCausticSweepBright} />
      </View>
      <View pointerEvents="none" style={liquidDockStyles.dockInnerRefraction} testID={`${testID}-inner-refraction`} />
      <Animated.View
        pointerEvents="none"
        style={[liquidDockStyles.dockLens, { width: tabWidth }, animatedLensStyle]}
        testID={`${testID}-lens`}
      >
        <View pointerEvents="none" style={liquidDockStyles.dockLensBloom} />
        <View pointerEvents="none" style={liquidDockStyles.dockLensTopLight} />
        <Animated.View pointerEvents="none" style={[liquidDockStyles.dockLensSheen, animatedLensSheenStyle]} />
        <View pointerEvents="none" style={liquidDockStyles.dockLensInnerShadow} />
      </Animated.View>
    </>
  )
}
