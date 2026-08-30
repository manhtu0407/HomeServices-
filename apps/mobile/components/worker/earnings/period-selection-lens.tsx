import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'

import { motionTokens } from '@/components/ui/motion-tokens'

type PeriodSelectionLensColors = {
  bloom: string
  border: string
  fill: string
  innerBorder: string
  shadow: string
  sheen: string
  topLight: string
}

const LENS_INSET = 2
const LENS_RADIUS = 14

export function WorkerEarningsPeriodSelectionLens({
  colors,
  itemCount,
  reduceMotion,
  reduceTransparency,
  selectedIndex,
  surfaceWidth,
  testID = 'worker-v5-earnings-period-lens',
}: {
  colors: PeriodSelectionLensColors
  itemCount: number
  reduceMotion: boolean
  reduceTransparency: boolean
  selectedIndex: number
  surfaceWidth: number
  testID?: string
}) {
  const normalizedItemCount = Math.max(itemCount, 1)
  const normalizedSelectedIndex = Math.min(Math.max(selectedIndex, 0), normalizedItemCount - 1)
  const previousIndexRef = useRef(normalizedSelectedIndex)
  const cellWidth = Math.max(surfaceWidth, 0) / normalizedItemCount
  const lensWidth = Math.max(cellWidth - LENS_INSET * 2, 0)
  const lensX = useSharedValue(0)
  const lensScaleX = useSharedValue(1)
  const sheenX = useSharedValue(-28)
  const sheenOpacity = useSharedValue(0)

  const animatedLensStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: lensX.value },
      { scaleX: lensScaleX.value },
    ],
  }))
  const animatedSheenStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion || reduceTransparency ? 0 : sheenOpacity.value,
    transform: [{ translateX: sheenX.value }, { rotate: '-12deg' }],
  }), [reduceMotion, reduceTransparency])

  useEffect(() => {
    if (cellWidth === 0 || lensWidth === 0 || surfaceWidth === 0) return

    const targetX = normalizedSelectedIndex * cellWidth + LENS_INSET
    const delta = normalizedSelectedIndex - previousIndexRef.current

    cancelAnimation(lensX)
    cancelAnimation(lensScaleX)
    cancelAnimation(sheenX)
    cancelAnimation(sheenOpacity)

    if (reduceMotion || reduceTransparency || delta === 0) {
      lensX.value = targetX
      lensScaleX.value = 1
      sheenX.value = -28
      sheenOpacity.value = 0
      previousIndexRef.current = normalizedSelectedIndex
      return
    }

    lensX.value = withSpring(targetX, motionTokens.liquid.pill)
    lensScaleX.value = withSequence(
      withTiming(1.025, { duration: 90 }),
      withSpring(1, motionTokens.liquid.press),
    )
    sheenX.value = -28
    sheenOpacity.value = withSequence(
      withTiming(0.42, { duration: 55 }),
      withTiming(0, { duration: 175 }),
    )
    sheenX.value = withTiming(28, { duration: 230 })
    previousIndexRef.current = normalizedSelectedIndex
  }, [cellWidth, lensWidth, lensX, lensScaleX, normalizedSelectedIndex, reduceMotion, reduceTransparency, sheenOpacity, sheenX, surfaceWidth])

  if (reduceTransparency) return null

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.lens,
        {
          backgroundColor: colors.fill,
          borderColor: colors.border,
          boxShadow: colors.shadow,
          width: lensWidth,
        },
        animatedLensStyle,
      ]}
      testID={testID}
    >
      <View pointerEvents="none" style={[styles.bloom, { backgroundColor: colors.bloom }]} />
      <View pointerEvents="none" style={[styles.topLight, { backgroundColor: colors.topLight }]} />
      <Animated.View pointerEvents="none" style={[styles.sheen, { backgroundColor: colors.sheen }, animatedSheenStyle]} />
      <View pointerEvents="none" style={[styles.innerBorder, { borderColor: colors.innerBorder }]} />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  lens: {
    borderRadius: LENS_RADIUS,
    borderWidth: 1,
    bottom: LENS_INSET,
    left: LENS_INSET,
    overflow: 'hidden',
    position: 'absolute',
    top: LENS_INSET,
    zIndex: 1,
  },
  bloom: {
    borderRadius: LENS_RADIUS,
    bottom: 4,
    left: 5,
    opacity: 0.54,
    position: 'absolute',
    right: 5,
    top: 4,
  },
  innerBorder: {
    borderRadius: LENS_RADIUS - 2,
    borderWidth: 1,
    bottom: 3,
    left: 3,
    opacity: 0.48,
    position: 'absolute',
    right: 3,
    top: 3,
  },
  sheen: {
    borderRadius: 12,
    bottom: 1,
    left: 1,
    opacity: 0.42,
    position: 'absolute',
    top: 1,
    width: 14,
  },
  topLight: {
    borderRadius: 14,
    height: 8,
    left: 8,
    opacity: 0.42,
    position: 'absolute',
    right: 10,
    top: 4,
    transform: [{ rotate: '-8deg' }],
  },
})
