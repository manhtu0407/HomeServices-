import { Image } from 'expo-image'
import { useEffect } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'

import { useEntryAccessibility } from './components/materials'

const LOCKUP = require('@/assets/prototypes/nestscout-logo-motion/nestscout-horizontal-lockup.png')
const SYMBOL = require('@/assets/prototypes/nestscout-logo-motion/nestscout-symbol-transparent-1024.png')

const LOCKUP_ASPECT_RATIO = 2172 / 724
const WORDMARK_START = 0.286
const WORDMARK_END = 0.952
const SYMBOL_SIZE_RATIO = 0.694
const SYMBOL_LEFT_RATIO = 0.033
const SYMBOL_TOP_RATIO = 0.161
const SYMBOL_CROP_TOP_RATIO = 0.43
const LETTER_SEGMENTS = [
  [0, 0.14],
  [0.14, 0.27],
  [0.27, 0.39],
  [0.39, 0.5],
  [0.5, 0.64],
  [0.64, 0.75],
  [0.75, 0.86],
  [0.86, 0.96],
  [0.96, 1],
] as const
const REVEAL_DURATION_MS = 1600
export const NESTSCOUT_LOGO_MOTION_DURATION_MS = 2000
const SYMBOL_START_DELAY_MS = 180
const SYMBOL_REVEAL_DURATION_MS = NESTSCOUT_LOGO_MOTION_DURATION_MS - SYMBOL_START_DELAY_MS

type WordmarkLetterCoverProps = {
  end: number
  index: number
  progress: SharedValue<number>
  stageHeight: number
  start: number
  wordmarkLeft: number
  wordmarkWidth: number
}

function WordmarkLetterCover({
  end,
  index,
  progress,
  stageHeight,
  start,
  wordmarkLeft,
  wordmarkWidth,
}: WordmarkLetterCoverProps) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [start, end], [1, 0], Extrapolation.CLAMP),
    transform: [
      { scaleX: interpolate(progress.value, [start, end], [1.014, 1], Extrapolation.CLAMP) },
      { scaleY: interpolate(progress.value, [start, end], [1.008, 1], Extrapolation.CLAMP) },
    ],
  }))

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.letterCover,
        {
          height: stageHeight,
          left: wordmarkLeft + wordmarkWidth * start,
          top: 0,
          width: wordmarkWidth * (end - start),
        },
        style,
      ]}
      testID={`nestscout-logo-letter-cover-${index}`}
    />
  )
}

export function NestScoutLogoMotionMark({
  accessibilityLabel,
  testID,
}: {
  accessibilityLabel: string
  testID: string
}) {
  const { width: viewportWidth } = useWindowDimensions()
  const { reduceMotion } = useEntryAccessibility()
  const revealProgress = useSharedValue(0)
  const symbolRevealProgress = useSharedValue(0)
  const logoOpacity = useSharedValue(0)
  const stageWidth = Math.min(Math.max(viewportWidth - 32, 260), 520)
  const stageHeight = stageWidth / LOCKUP_ASPECT_RATIO
  const wordmarkLeft = stageWidth * WORDMARK_START
  const wordmarkWidth = stageWidth * (WORDMARK_END - WORDMARK_START)
  const symbolSize = stageHeight * SYMBOL_SIZE_RATIO
  const symbolLeft = stageWidth * SYMBOL_LEFT_RATIO
  const symbolTop = stageHeight * SYMBOL_TOP_RATIO

  useEffect(() => {
    cancelAnimation(revealProgress)
    cancelAnimation(symbolRevealProgress)
    cancelAnimation(logoOpacity)

    if (reduceMotion) {
      revealProgress.value = 1
      symbolRevealProgress.value = 1
      logoOpacity.value = 1
      return undefined
    }

    revealProgress.value = 0
    symbolRevealProgress.value = 0
    logoOpacity.value = 0
    logoOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) })
    revealProgress.value = withTiming(1, {
      duration: REVEAL_DURATION_MS,
      easing: Easing.inOut(Easing.cubic),
    })
    symbolRevealProgress.value = withDelay(
      SYMBOL_START_DELAY_MS,
      withTiming(1, {
        duration: SYMBOL_REVEAL_DURATION_MS,
        easing: Easing.inOut(Easing.cubic),
      }),
    )

    return () => {
      cancelAnimation(revealProgress)
      cancelAnimation(symbolRevealProgress)
      cancelAnimation(logoOpacity)
    }
  }, [logoOpacity, reduceMotion, revealProgress, symbolRevealProgress])

  const logoStyle = useAnimatedStyle(() => ({ opacity: logoOpacity.value }))
  const symbolSettleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(symbolRevealProgress.value, [0, 0.5, 1], [6, 3, 0], Extrapolation.CLAMP) }],
  }))
  const symbolBaseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      symbolRevealProgress.value,
      [0, 0.08, 0.24, 0.44, 0.62, 0.78, 1],
      [0, 0.2, 0.54, 0.72, 0.42, 0.08, 0],
      Extrapolation.CLAMP,
    ),
  }))
  const symbolUpperStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      symbolRevealProgress.value,
      [0, 0.16, 0.36, 0.56, 0.74, 1],
      [0, 0.02, 0.12, 0.22, 0.06, 0],
      Extrapolation.CLAMP,
    ),
  }))
  const symbolFullStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      symbolRevealProgress.value,
      [0, 0.16, 0.34, 0.56, 0.78, 1],
      [0, 0.02, 0.1, 0.28, 0.74, 1],
      Extrapolation.CLAMP,
    ),
  }))
  const nestlineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(revealProgress.value, [0.9, 1], [0, 0.68], Extrapolation.CLAMP),
    transform: [{ scaleX: interpolate(revealProgress.value, [0.9, 1], [0.82, 1], Extrapolation.CLAMP) }],
  }))

  return (
    <View accessible accessibilityLabel={accessibilityLabel} accessibilityRole="image" style={styles.logoMark} testID={testID}>
      <Animated.View
        style={[styles.logoStage, { height: stageHeight, width: stageWidth }, logoStyle]}
        testID={`${testID}-motion`}
      >
        <Image contentFit="fill" source={LOCKUP} style={StyleSheet.absoluteFill} />
        <View
          pointerEvents="none"
          style={[styles.symbolCover, { height: symbolSize, left: symbolLeft, top: symbolTop, width: symbolSize }]}
        />
        <Animated.View
          pointerEvents="none"
          style={[styles.symbolAsset, { height: symbolSize, left: symbolLeft, top: symbolTop, width: symbolSize }, symbolSettleStyle]}
          testID={`${testID}-symbol`}
        >
          <Animated.View
            style={[styles.symbolCrop, { height: symbolSize * SYMBOL_CROP_TOP_RATIO, width: symbolSize }, symbolUpperStyle]}
          >
            <Image contentFit="fill" source={SYMBOL} style={[styles.symbolImage, { height: symbolSize, width: symbolSize }]} />
          </Animated.View>
          <Animated.View
            style={[
              styles.symbolCrop,
              { height: symbolSize * (1 - SYMBOL_CROP_TOP_RATIO), top: symbolSize * SYMBOL_CROP_TOP_RATIO, width: symbolSize },
              symbolBaseStyle,
            ]}
          >
            <Image
              contentFit="fill"
              source={SYMBOL}
              style={[styles.symbolImage, { height: symbolSize, top: -symbolSize * SYMBOL_CROP_TOP_RATIO, width: symbolSize }]}
            />
          </Animated.View>
          <Animated.View style={[styles.symbolFullLayer, { height: symbolSize, width: symbolSize }, symbolFullStyle]}>
            <Image contentFit="fill" source={SYMBOL} style={[styles.symbolImage, { height: symbolSize, width: symbolSize }]} />
          </Animated.View>
        </Animated.View>
        {LETTER_SEGMENTS.map(([start, end], index) => (
          <WordmarkLetterCover
            end={end}
            index={index}
            key={`${start}-${end}`}
            progress={revealProgress}
            stageHeight={stageHeight}
            start={start}
            wordmarkLeft={wordmarkLeft}
            wordmarkWidth={wordmarkWidth}
          />
        ))}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.nestline,
            { height: stageHeight * 0.07, left: wordmarkLeft - wordmarkWidth * 0.06, top: stageHeight * 0.67, width: wordmarkWidth * 1.12 },
            nestlineStyle,
          ]}
          testID={`${testID}-nestline`}
        >
          <Svg height="100%" viewBox="0 0 200 24" width="100%">
            <Path d="M 2 11 C 38 17, 78 18, 116 12 C 148 7, 178 8, 198 13" fill="none" stroke="#78CFC3" strokeLinecap="round" strokeWidth="1.35" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  logoMark: { alignItems: 'center', width: '100%' },
  logoStage: {
    overflow: 'hidden',
  },
  nestline: { position: 'absolute' },
  letterCover: { backgroundColor: '#FFFFFF', position: 'absolute' },
  symbolAsset: { position: 'absolute' },
  symbolCover: { backgroundColor: '#FFFFFF', position: 'absolute' },
  symbolCrop: { overflow: 'hidden', position: 'absolute' },
  symbolFullLayer: { position: 'absolute' },
  symbolImage: { position: 'absolute' },
})
