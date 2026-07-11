import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient } from 'react-native-svg'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated'

import { AlphaStop as Stop } from './svg-alpha-stop'
import {
  KAEL_CORE_V9_BOW_DURATION_MS,
  KAEL_CORE_V9_CONTRACT,
  KAEL_CORE_V9_SIZE,
  type KaelCoreV9BowSource,
  type KaelCoreV9Handle,
} from './kael-core-v9-contract'

type KaelCoreV9Props = {
  motionClip?: 'autoplay-once'
  onBowEnd?: (source: KaelCoreV9BowSource) => void
  onBowStart?: (source: KaelCoreV9BowSource) => void
  reduceMotion?: boolean
  ref?: Ref<KaelCoreV9Handle>
  size?: number
  style?: StyleProp<ViewStyle>
  testID?: string
}

const bowCooldownMs = 720

export function KaelCoreV9({
  motionClip,
  onBowEnd,
  onBowStart,
  reduceMotion = false,
  size = KAEL_CORE_V9_SIZE,
  style,
  testID,
  ref,
}: KaelCoreV9Props) {
  const bowInFlight = useRef(false)
  const lastBowAt = useRef(Number.NEGATIVE_INFINITY)
  const bowResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoplayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runAutoplayClipRef = useRef<() => boolean>(() => false)
  const shellX = useSharedValue(0)
  const shellY = useSharedValue(0)
  const shellRoll = useSharedValue(0)
  const shellPitch = useSharedValue(0)
  const shellScaleY = useSharedValue(1)
  const leftEyeX = useSharedValue(0)
  const leftEyeY = useSharedValue(0)
  const leftEyeScaleY = useSharedValue(1)
  const rightEyeX = useSharedValue(0)
  const rightEyeY = useSharedValue(0)
  const rightEyeScaleY = useSharedValue(1)
  const monocleRotation = useSharedValue(0)
  const bowShadeOpacity = useSharedValue(0)
  const lensGlintOpacity = useSharedValue(0.16)

  const resolvedSize = Math.min(720, Math.max(18, size))
  const compact = resolvedSize < 78
  const micro = resolvedSize < 42
  const shellStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 620 },
      { translateX: shellX.value },
      { translateY: shellY.value },
      { rotateZ: `${shellRoll.value}deg` },
      { rotateX: `${shellPitch.value}deg` },
      { scaleY: shellScaleY.value },
    ],
  }))
  const leftEyeStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: '-4deg' }, { translateX: leftEyeX.value }, { translateY: leftEyeY.value }, { scaleY: leftEyeScaleY.value }],
  }))
  const rightEyeStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: '3deg' }, { translateX: rightEyeX.value }, { translateY: rightEyeY.value }, { scaleY: rightEyeScaleY.value }],
  }))
  const monocleStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${monocleRotation.value}deg` }] }))
  const bowShadeStyle = useAnimatedStyle(() => ({ opacity: bowShadeOpacity.value }))
  const lensGlintStyle = useAnimatedStyle(() => ({ opacity: lensGlintOpacity.value }))

  const completeBow = useCallback((source: KaelCoreV9BowSource, duration: number) => {
    if (bowResetTimer.current) clearTimeout(bowResetTimer.current)
    bowResetTimer.current = setTimeout(() => {
      bowInFlight.current = false
      onBowEnd?.(source)
    }, duration)
  }, [onBowEnd])

  useEffect(() => () => {
    if (bowResetTimer.current) clearTimeout(bowResetTimer.current)
    if (autoplayTimer.current) clearTimeout(autoplayTimer.current)
  }, [])

  const runAutoplayClip = useCallback(() => {
    if (reduceMotion) return false

    for (const value of [shellX, shellY, shellRoll, shellPitch, shellScaleY, leftEyeX, leftEyeY, leftEyeScaleY, rightEyeX, rightEyeY, rightEyeScaleY, monocleRotation, bowShadeOpacity, lensGlintOpacity]) {
      cancelAnimation(value)
    }

    shellX.value = 0
    shellY.value = 0
    shellRoll.value = 0
    shellPitch.value = 0
    shellScaleY.value = 1
    leftEyeX.value = 0
    leftEyeY.value = 0
    leftEyeScaleY.value = 1
    rightEyeX.value = 0
    rightEyeY.value = 0
    rightEyeScaleY.value = 1
    monocleRotation.value = 0
    bowShadeOpacity.value = 0
    lensGlintOpacity.value = 0.08

    shellX.value = withSequence(withDelay(304, withTiming(-5.7, { duration: 532 })), withTiming(-6.4, { duration: 532 }), withTiming(-1.45, { duration: 532 }), withTiming(4.6, { duration: 494 }), withTiming(3.8, { duration: 342 }), withTiming(0.2, { duration: 380 }), withTiming(0, { duration: 342 }), withTiming(0, { duration: 342 }))
    shellY.value = withSequence(withDelay(304, withTiming(-2, { duration: 532 })), withTiming(-1.7, { duration: 532 }), withTiming(-0.6, { duration: 532 }), withTiming(-2.35, { duration: 494 }), withTiming(-1.75, { duration: 342 }), withTiming(2.3, { duration: 380 }), withTiming(-0.78, { duration: 342 }), withTiming(0, { duration: 342 }))
    shellRoll.value = withSequence(withDelay(304, withTiming(-3.4, { duration: 532 })), withTiming(-2.7, { duration: 532 }), withTiming(-0.4, { duration: 532 }), withTiming(2.8, { duration: 494 }), withTiming(1.9, { duration: 342 }), withTiming(0, { duration: 380 }), withTiming(-0.6, { duration: 342 }), withTiming(0, { duration: 342 }))
    shellPitch.value = withSequence(withDelay(304, withTiming(-1, { duration: 532 })), withTiming(-0.4, { duration: 532 }), withTiming(0, { duration: 532 }), withTiming(-1, { duration: 494 }), withTiming(-0.4, { duration: 342 }), withTiming(7, { duration: 380 }), withTiming(-0.6, { duration: 342 }), withTiming(0, { duration: 342 }))
    shellScaleY.value = withSequence(withDelay(304, withTiming(1.035, { duration: 532 })), withTiming(1.03, { duration: 532 }), withTiming(1.012, { duration: 532 }), withTiming(1.045, { duration: 494 }), withTiming(1.034, { duration: 342 }), withTiming(0.955, { duration: 380 }), withTiming(1.012, { duration: 342 }), withTiming(1, { duration: 342 }))
    leftEyeX.value = withSequence(withDelay(798, withTiming(-1.55, { duration: 38 })), withTiming(-1.55, { duration: 722 }), withTiming(-0.18, { duration: 494 }), withTiming(0.28, { duration: 342 }), withTiming(0.1, { duration: 380 }), withTiming(0, { duration: 684 }))
    rightEyeX.value = withSequence(withDelay(874, withTiming(-1.32, { duration: 38 })), withTiming(-1.32, { duration: 722 }), withTiming(0.14, { duration: 494 }), withTiming(-0.22, { duration: 342 }), withTiming(-0.08, { duration: 380 }), withTiming(0, { duration: 608 }))
    leftEyeY.value = withSequence(withDelay(342, withTiming(0.18, { duration: 38 })), withTiming(0, { duration: 38 }), withTiming(-0.2, { duration: 380 }), withTiming(-0.08, { duration: 494 }), withTiming(-0.38, { duration: 342 }), withTiming(-0.2, { duration: 342 }), withTiming(1.32, { duration: 380 }), withTiming(-0.16, { duration: 342 }), withTiming(0, { duration: 342 }))
    rightEyeY.value = withSequence(withDelay(380, withTiming(0.18, { duration: 38 })), withTiming(0, { duration: 38 }), withTiming(-0.18, { duration: 418 }), withTiming(-0.08, { duration: 494 }), withTiming(-0.38, { duration: 342 }), withTiming(-0.2, { duration: 342 }), withTiming(1.32, { duration: 380 }), withTiming(-0.16, { duration: 342 }), withTiming(0, { duration: 342 }))
    leftEyeScaleY.value = withSequence(withDelay(342, withTiming(0.22, { duration: 38 })), withTiming(1, { duration: 38 }), withTiming(1.04, { duration: 380 }), withTiming(1.02, { duration: 494 }), withTiming(1.13, { duration: 342 }), withTiming(1.08, { duration: 342 }), withTiming(0.58, { duration: 380 }), withTiming(1.08, { duration: 342 }), withTiming(1, { duration: 342 }))
    rightEyeScaleY.value = withSequence(withDelay(380, withTiming(0.22, { duration: 38 })), withTiming(1, { duration: 38 }), withTiming(1.04, { duration: 418 }), withTiming(1.02, { duration: 494 }), withTiming(1.13, { duration: 342 }), withTiming(1.08, { duration: 342 }), withTiming(0.58, { duration: 380 }), withTiming(1.08, { duration: 342 }), withTiming(1, { duration: 342 }))
    monocleRotation.value = withSequence(withDelay(874, withTiming(-3.4, { duration: 456 })), withTiming(1.2, { duration: 608 }), withTiming(4, { duration: 494 }), withTiming(-1.8, { duration: 342 }), withTiming(5.8, { duration: 380 }), withTiming(-0.8, { duration: 342 }), withTiming(0, { duration: 342 }))
    lensGlintOpacity.value = withSequence(withDelay(1026, withTiming(0.88, { duration: 76 })), withTiming(0.1, { duration: 266 }), withTiming(0.1, { duration: 798 }), withTiming(0.98, { duration: 76 }), withTiming(0.08, { duration: 152 }), withTiming(0.08, { duration: 1406 }))
    return true
  }, [bowShadeOpacity, leftEyeScaleY, leftEyeX, leftEyeY, lensGlintOpacity, monocleRotation, reduceMotion, rightEyeScaleY, rightEyeX, rightEyeY, shellPitch, shellRoll, shellScaleY, shellX, shellY])
  runAutoplayClipRef.current = runAutoplayClip

  useEffect(() => {
    if (motionClip !== 'autoplay-once' || reduceMotion) return
    autoplayTimer.current = setTimeout(() => {
      runAutoplayClipRef.current()
    }, 0)
    return () => {
      if (autoplayTimer.current) clearTimeout(autoplayTimer.current)
    }
  }, [motionClip, reduceMotion])

  const bow = useCallback((source: KaelCoreV9BowSource = 'api') => {
    const now = Date.now()
    if (bowInFlight.current || now - lastBowAt.current < bowCooldownMs) return false

    bowInFlight.current = true
    lastBowAt.current = now
    onBowStart?.(source)

    for (const value of [shellX, shellY, shellRoll, shellPitch, shellScaleY, leftEyeX, leftEyeY, leftEyeScaleY, rightEyeX, rightEyeY, rightEyeScaleY, monocleRotation, bowShadeOpacity, lensGlintOpacity]) {
      cancelAnimation(value)
    }
    shellX.value = 0
    shellRoll.value = 0

    if (reduceMotion) {
      shellY.value = withSequence(withTiming(2.2, { duration: 220 }), withTiming(0, { duration: 260 }))
      shellScaleY.value = withSequence(withTiming(0.965, { duration: 220 }), withTiming(1, { duration: 260 }))
      leftEyeY.value = withSequence(withTiming(1, { duration: 220 }), withTiming(0, { duration: 260 }))
      rightEyeY.value = withSequence(withDelay(6, withTiming(1, { duration: 220 })), withTiming(0, { duration: 254 }))
      leftEyeScaleY.value = withSequence(withTiming(0.84, { duration: 220 }), withTiming(1, { duration: 260 }))
      rightEyeScaleY.value = withSequence(withDelay(6, withTiming(0.84, { duration: 220 })), withTiming(1, { duration: 254 }))
      monocleRotation.value = withSequence(withTiming(2, { duration: 220 }), withTiming(0, { duration: 260 }))
      bowShadeOpacity.value = 0
      lensGlintOpacity.value = 0.16
      completeBow(source, KAEL_CORE_V9_CONTRACT.reducedMotionDuration)
      return true
    }

    shellY.value = withSequence(withTiming(-1.2, { duration: 146 }), withTiming(0, { duration: 122 }), withTiming(6.4, { duration: 390 }), withTiming(6.4, { duration: 170 }), withTiming(-0.7, { duration: 220 }), withTiming(0, { duration: 172 }))
    shellPitch.value = withSequence(withTiming(-1.2, { duration: 146 }), withTiming(0, { duration: 122 }), withTiming(16, { duration: 390 }), withTiming(16, { duration: 170 }), withTiming(-1, { duration: 220 }), withTiming(0, { duration: 172 }))
    shellScaleY.value = withSequence(withTiming(0.998, { duration: 146 }), withTiming(1, { duration: 122 }), withTiming(0.94, { duration: 390 }), withTiming(0.94, { duration: 170 }), withTiming(1.002, { duration: 220 }), withTiming(1, { duration: 172 }))
    leftEyeX.value = withSequence(withTiming(-0.05, { duration: 146 }), withTiming(0, { duration: 122 }), withTiming(0, { duration: 610 }), withTiming(0, { duration: 342 }))
    rightEyeX.value = withSequence(withDelay(10, withTiming(0.05, { duration: 146 })), withTiming(0, { duration: 122 }), withTiming(0, { duration: 610 }), withTiming(0, { duration: 332 }))
    leftEyeY.value = withSequence(withTiming(-0.34, { duration: 146 }), withTiming(0.15, { duration: 122 }), withTiming(2.3, { duration: 390 }), withTiming(2.3, { duration: 170 }), withTiming(-0.12, { duration: 195 }), withTiming(0, { duration: 197 }))
    rightEyeY.value = withSequence(withDelay(10, withTiming(-0.34, { duration: 146 })), withTiming(0.15, { duration: 122 }), withTiming(2.3, { duration: 390 }), withTiming(2.3, { duration: 170 }), withTiming(-0.12, { duration: 195 }), withTiming(0, { duration: 187 }))
    leftEyeScaleY.value = withSequence(withTiming(1.02, { duration: 146 }), withTiming(0.92, { duration: 122 }), withTiming(0.66, { duration: 390 }), withTiming(0.66, { duration: 170 }), withTiming(1.06, { duration: 195 }), withTiming(1, { duration: 197 }))
    rightEyeScaleY.value = withSequence(withDelay(10, withTiming(1.02, { duration: 146 })), withTiming(0.92, { duration: 122 }), withTiming(0.66, { duration: 390 }), withTiming(0.66, { duration: 170 }), withTiming(1.06, { duration: 195 }), withTiming(1, { duration: 187 }))
    monocleRotation.value = withSequence(withTiming(0, { duration: 268 }), withTiming(6, { duration: 342 }), withTiming(-2.2, { duration: 170 }), withTiming(-1.1, { duration: 220 }), withTiming(0, { duration: 220 }))
    bowShadeOpacity.value = withSequence(withTiming(0.03, { duration: 305 }), withTiming(0.26, { duration: 356 }), withTiming(0.26, { duration: 170 }), withTiming(0.04, { duration: 220 }), withTiming(0, { duration: 169 }))
    lensGlintOpacity.value = withSequence(withTiming(0.52, { duration: 146 }), withTiming(0.2, { duration: 195 }), withTiming(0.1, { duration: 464 }), withTiming(0.26, { duration: 220 }), withTiming(0.16, { duration: 195 }))
    completeBow(source, KAEL_CORE_V9_BOW_DURATION_MS)
    return true
  }, [bowShadeOpacity, completeBow, leftEyeScaleY, leftEyeX, leftEyeY, lensGlintOpacity, monocleRotation, onBowStart, reduceMotion, rightEyeScaleY, rightEyeX, rightEyeY, shellPitch, shellRoll, shellScaleY, shellX, shellY])

  useImperativeHandle(ref, () => ({ bow }), [bow])

  const eyeWidth = resolvedSize * (5.8 / 120)
  const eyeHeight = resolvedSize * (16.6 / 120)
  const shadeSize = resolvedSize * (85.2 / 120)
  const shadeInset = resolvedSize * (17.4 / 120)

  return (
    <View pointerEvents="none" style={[styles.root, { height: resolvedSize, width: resolvedSize }, style]} testID={testID}>
      <Animated.View style={[styles.model, { height: resolvedSize, width: resolvedSize }, shellStyle]}>
        <Svg height={resolvedSize} viewBox="0 0 120 120" width={resolvedSize}>
          <Defs>
            <RadialGradient cx="36%" cy="22%" id="kael-v9-body" r="83%">
              <Stop offset="0" stopColor="#D9DDE0" /><Stop offset="0.13" stopColor="#AEB4B9" /><Stop offset="0.34" stopColor="#62686E" /><Stop offset="0.63" stopColor="#2A2E32" /><Stop offset="0.86" stopColor="#151719" /><Stop offset="1" stopColor="#090A0B" />
            </RadialGradient>
            <RadialGradient cx="73%" cy="82%" id="kael-v9-depth" r="68%">
              <Stop offset="0" stopColor="#030405" stopOpacity={0.94} /><Stop offset="0.62" stopColor="#0D0F11" stopOpacity={0.42} /><Stop offset="1" stopColor="#5D6368" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient cx="42%" cy="3%" id="kael-v9-bloom" r="72%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.34} /><Stop offset="0.28" stopColor="#F3F5F6" stopOpacity={0.14} /><Stop offset="0.64" stopColor="#C9CDD1" stopOpacity={0.035} /><Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
            <LinearGradient id="kael-v9-rim" x1="21" x2="101" y1="17" y2="104">
              <Stop offset="0" stopColor="#F7F8F9" /><Stop offset="0.14" stopColor="#B8BEC3" /><Stop offset="0.39" stopColor="#40454A" /><Stop offset="0.69" stopColor="#111315" /><Stop offset="0.84" stopColor="#71777C" /><Stop offset="1" stopColor="#DFE2E4" />
            </LinearGradient>
            <LinearGradient id="kael-v9-rim-inner" x1="25" x2="96" y1="20" y2="101">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.72} /><Stop offset="0.28" stopColor="#D5D9DC" stopOpacity={0.12} /><Stop offset="0.7" stopColor="#020304" stopOpacity={0.72} /><Stop offset="1" stopColor="#C7CCD0" stopOpacity={0.42} />
            </LinearGradient>
            <LinearGradient id="kael-v9-monocle" x1="64" x2="87" y1="40" y2="67">
              <Stop offset="0" stopColor="#FFFFFF" /><Stop offset="0.16" stopColor="#CFD3D6" /><Stop offset="0.38" stopColor="#5B6166" /><Stop offset="0.62" stopColor="#171A1D" /><Stop offset="0.82" stopColor="#8E9499" /><Stop offset="1" stopColor="#ECEEEF" />
            </LinearGradient>
            <RadialGradient cx="34%" cy="22%" id="kael-v9-lens" r="84%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.055} /><Stop offset="0.42" stopColor="#CDD2D6" stopOpacity={0.012} /><Stop offset="1" stopColor="#090B0D" stopOpacity={0.035} />
            </RadialGradient>
          </Defs>
          <Circle cx="60" cy="58" fill="#050607" opacity={0.98} r="47.1" />
          <Circle cx="60" cy="58" fill="url(#kael-v9-rim)" r="45.7" />
          <Circle cx="60" cy="58" fill="#08090A" r="43.8" />
          <Circle cx="60" cy="58" fill="url(#kael-v9-body)" r="42.6" />
          <Circle cx="60" cy="58" fill="url(#kael-v9-depth)" r="42.6" />
          <Circle cx="60" cy="58" fill="url(#kael-v9-bloom)" r="42.6" />
          <Circle cx="60" cy="58" fill="none" r="43.35" stroke="url(#kael-v9-rim-inner)" strokeWidth="1.25" />
          <Path d="M25.8 36.5 A42.7 42.7 0 0 1 55.6 15.7" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeOpacity={0.56} strokeWidth="1.35" />
          <Path d="M91.2 31.1 A42.7 42.7 0 0 1 102.2 56.1" fill="none" stroke="#E9ECEE" strokeLinecap="round" strokeOpacity={0.31} strokeWidth="1.05" />
          <Path d="M76.8 97.1 A42.7 42.7 0 0 1 45.3 99.0" fill="none" stroke="#C9CED2" strokeLinecap="round" strokeOpacity={0.2} strokeWidth="0.8" />
        </Svg>
        <Animated.View style={[styles.bowShade, { borderRadius: shadeSize / 2, height: shadeSize, left: shadeInset, top: resolvedSize * (15.4 / 120), width: shadeSize }, bowShadeStyle]} />
        <Animated.View style={[styles.eye, { height: eyeHeight, left: resolvedSize * (46.2 / 120), top: resolvedSize * (43.3 / 120), width: eyeWidth }, leftEyeStyle]} testID="kael-core-v9-eye" />
        <Animated.View style={[styles.eye, { height: eyeHeight, left: resolvedSize * (68 / 120), top: resolvedSize * (43.3 / 120), width: eyeWidth }, rightEyeStyle]} testID="kael-core-v9-eye" />
        <Animated.View pointerEvents="none" style={[styles.monocle, monocleStyle]} testID="kael-core-v9-monocle">
          <Svg height={resolvedSize} viewBox="0 0 120 120" width={resolvedSize}>
            <Circle cx="71.2" cy="51.9" fill="none" r="12.25" stroke="#030405" strokeOpacity={0.42} strokeWidth="1.35" />
            <Circle cx="71.2" cy="51.9" fill="url(#kael-v9-lens)" r="11.55" />
            <Circle cx="71.2" cy="51.9" fill="none" r="12.35" stroke="#0A0B0D" strokeOpacity={0.86} strokeWidth="2.7" />
            <Circle cx="71.2" cy="51.9" fill="none" r="12.05" stroke="url(#kael-v9-monocle)" strokeWidth="1.72" />
            {!micro ? <Circle cx="71.2" cy="51.9" fill="none" r="10.87" stroke="#EDF0F2" strokeOpacity={0.25} strokeWidth="0.56" /> : null}
            {!micro ? <Path d="M80.65 44.55 l2.35 -1.55 1.35 1.75 -2.15 1.75 z" fill="url(#kael-v9-monocle)" stroke="#111417" strokeWidth="0.42" /> : null}
            {!micro ? <Circle cx="82.62" cy="44.55" fill="#DFE3E6" r="0.68" /> : null}
            {!micro ? <Path d="M79.7 60.7 l2.62 1.05 -.62 2.08 -2.78 -1.1 z" fill="url(#kael-v9-monocle)" stroke="#111417" strokeWidth="0.42" /> : null}
            {!micro ? <Circle cx="81.25" cy="62.38" fill="#DFE3E6" r="0.62" /> : null}
            {!micro ? <Path d="M81.2 62.35 C84.9 67.8 87.1 73.2 89.2 79.9 C90 82.5 90.1 84.4 90.1 86.1" fill="none" stroke="#C9CDD0" strokeDasharray=".95 1.42" strokeLinecap="round" strokeOpacity={0.68} strokeWidth="0.72" /> : null}
            {!micro ? <Ellipse cx="82.55" cy="64.8" fill="none" rx="1.05" ry="0.62" stroke="#E6E8EA" strokeWidth="0.47" transform="rotate(53 82.55 64.8)" /> : null}
            {!micro ? <Ellipse cx="84.1" cy="67.35" fill="none" rx="1.05" ry="0.62" stroke="#BFC4C8" strokeWidth="0.47" transform="rotate(58 84.1 67.35)" /> : null}
            {!micro ? <Ellipse cx="85.45" cy="70.2" fill="none" rx="1.05" ry="0.62" stroke="#E0E3E5" strokeWidth="0.47" transform="rotate(63 85.45 70.2)" /> : null}
            {!compact ? <Ellipse cx="86.65" cy="73.25" fill="none" rx="1.03" ry="0.6" stroke="#B7BCC0" strokeWidth="0.45" transform="rotate(67 86.65 73.25)" /> : null}
            {!compact ? <Ellipse cx="87.75" cy="76.4" fill="none" rx="1" ry="0.58" stroke="#D9DDE0" strokeWidth="0.44" transform="rotate(71 87.75 76.4)" /> : null}
            {!compact ? <Ellipse cx="88.7" cy="79.58" fill="none" rx="0.98" ry="0.56" stroke="#B5BABF" strokeWidth="0.43" transform="rotate(75 88.7 79.58)" /> : null}
            {!micro ? <Circle cx="90.05" cy="86.15" fill="#0A0C0E" r="2.25" stroke="url(#kael-v9-monocle)" strokeWidth="0.85" /> : null}
            {!micro ? <Circle cx="90.05" cy="86.15" fill="#DFE3E6" r="0.76" /> : null}
          </Svg>
          {!micro ? <Animated.View pointerEvents="none" style={[styles.lensGlint, lensGlintStyle]}><Svg height={resolvedSize} viewBox="0 0 120 120" width={resolvedSize}><Path d="M64.1 43.4 A11.1 11.1 0 0 1 70.1 40.9" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="0.88" /></Svg></Animated.View> : null}
        </Animated.View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  bowShade: { backgroundColor: 'rgba(3,4,5,0.58)', position: 'absolute' },
  eye: { backgroundColor: '#FFFFFF', borderRadius: 999, position: 'absolute' },
  lensGlint: { ...StyleSheet.absoluteFillObject },
  model: { alignItems: 'center', justifyContent: 'center', position: 'absolute' },
  monocle: { ...StyleSheet.absoluteFillObject, transformOrigin: '75% 52%' },
  root: { alignItems: 'center', justifyContent: 'center', overflow: 'visible', position: 'relative' },
})
