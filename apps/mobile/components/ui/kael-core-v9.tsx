import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient } from 'react-native-svg'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated'

import { AlphaStop as Stop } from './svg-alpha-stop'

export const KAEL_CORE_V9_SIZE = 68
export const KAEL_CORE_V9_BOW_DURATION_MS = 1220

export const KAEL_CORE_V9_CONTRACT = Object.freeze({
  accessoryCount: 0,
  bowDurationMs: KAEL_CORE_V9_BOW_DURATION_MS,
  handCount: 0,
  legacyMotionCount: 0,
  legacyStatusCount: 0,
  motionVocabulary: ['bow'] as const,
  renderer: 'inline-svg',
})

export type KaelCoreV9BowSource = 'api' | 'focus' | 'keyboard' | 'pointer-press' | 'proximity' | 'touch'

export type KaelCoreV9Handle = {
  bow: (source?: KaelCoreV9BowSource) => boolean
}

type KaelCoreV9Props = {
  onBowStart?: (source: KaelCoreV9BowSource) => void
  reduceMotion?: boolean
  size?: number
  style?: StyleProp<ViewStyle>
  testID?: string
}

const bowCooldownMs = 720

export const KaelCoreV9 = forwardRef<KaelCoreV9Handle, KaelCoreV9Props>(function KaelCoreV9({
  onBowStart,
  reduceMotion = false,
  size = KAEL_CORE_V9_SIZE,
  style,
  testID,
}, ref) {
  const bowInFlight = useRef(false)
  const lastBowAt = useRef(Number.NEGATIVE_INFINITY)
  const bowResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shellY = useSharedValue(0)
  const shellPitch = useSharedValue(0)
  const shellScaleY = useSharedValue(1)
  const leftEyeX = useSharedValue(0)
  const leftEyeY = useSharedValue(0)
  const leftEyeScaleY = useSharedValue(1)
  const rightEyeX = useSharedValue(0)
  const rightEyeY = useSharedValue(0)
  const rightEyeScaleY = useSharedValue(1)
  const monocleRotation = useSharedValue(0)

  const shellStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 620 },
      { translateY: shellY.value },
      { rotateX: `${shellPitch.value}deg` },
      { scaleY: shellScaleY.value },
    ],
  }))
  const leftEyeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: leftEyeX.value }, { translateY: leftEyeY.value }, { scaleY: leftEyeScaleY.value }],
  }))
  const rightEyeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rightEyeX.value }, { translateY: rightEyeY.value }, { scaleY: rightEyeScaleY.value }],
  }))
  const monocleStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${monocleRotation.value}deg` }] }))

  useEffect(() => () => {
    if (bowResetTimer.current) clearTimeout(bowResetTimer.current)
  }, [])

  const bow = useCallback((source: KaelCoreV9BowSource = 'api') => {
    const now = Date.now()
    if (bowInFlight.current || now - lastBowAt.current < bowCooldownMs) return false

    bowInFlight.current = true
    lastBowAt.current = now
    onBowStart?.(source)

    for (const value of [shellY, shellPitch, shellScaleY, leftEyeX, leftEyeY, leftEyeScaleY, rightEyeX, rightEyeY, rightEyeScaleY, monocleRotation]) {
      cancelAnimation(value)
    }

    if (reduceMotion) {
      shellY.value = withSequence(withTiming(2.2, { duration: 220 }), withTiming(0, { duration: 260 }))
      leftEyeY.value = withSequence(withTiming(1, { duration: 220 }), withTiming(0, { duration: 260 }))
      rightEyeY.value = withSequence(withDelay(6, withTiming(1, { duration: 220 })), withTiming(0, { duration: 254 }))
      monocleRotation.value = withSequence(withTiming(2, { duration: 220 }), withTiming(0, { duration: 260 }))
      bowResetTimer.current = setTimeout(() => { bowInFlight.current = false }, 480)
      return true
    }

    shellY.value = withSequence(
      withTiming(-1.2, { duration: 146 }),
      withTiming(0, { duration: 122 }),
      withTiming(6.4, { duration: 390 }),
      withTiming(6.4, { duration: 170 }),
      withTiming(-0.7, { duration: 220 }),
      withTiming(0, { duration: 172 }),
    )
    shellPitch.value = withSequence(
      withTiming(-1.2, { duration: 146 }),
      withTiming(0, { duration: 122 }),
      withTiming(16, { duration: 390 }),
      withTiming(16, { duration: 170 }),
      withTiming(-1, { duration: 220 }),
      withTiming(0, { duration: 172 }),
    )
    shellScaleY.value = withSequence(
      withTiming(0.998, { duration: 146 }),
      withTiming(1, { duration: 122 }),
      withTiming(0.94, { duration: 390 }),
      withTiming(0.94, { duration: 170 }),
      withTiming(1.002, { duration: 220 }),
      withTiming(1, { duration: 172 }),
    )
    leftEyeX.value = withSequence(withTiming(-0.05, { duration: 146 }), withTiming(0, { duration: 122 }), withTiming(0, { duration: 610 }), withTiming(0, { duration: 342 }))
    rightEyeX.value = withSequence(withDelay(10, withTiming(0.05, { duration: 146 })), withTiming(0, { duration: 122 }), withTiming(0, { duration: 610 }), withTiming(0, { duration: 332 }))
    leftEyeY.value = withSequence(withTiming(-0.34, { duration: 146 }), withTiming(0.15, { duration: 122 }), withTiming(2.3, { duration: 390 }), withTiming(2.3, { duration: 170 }), withTiming(-0.12, { duration: 195 }), withTiming(0, { duration: 197 }))
    rightEyeY.value = withSequence(withDelay(10, withTiming(-0.34, { duration: 146 })), withTiming(0.15, { duration: 122 }), withTiming(2.3, { duration: 390 }), withTiming(2.3, { duration: 170 }), withTiming(-0.12, { duration: 195 }), withTiming(0, { duration: 187 }))
    leftEyeScaleY.value = withSequence(withTiming(1.02, { duration: 146 }), withTiming(0.92, { duration: 122 }), withTiming(0.66, { duration: 390 }), withTiming(0.66, { duration: 170 }), withTiming(1.06, { duration: 195 }), withTiming(1, { duration: 197 }))
    rightEyeScaleY.value = withSequence(withDelay(10, withTiming(1.02, { duration: 146 })), withTiming(0.92, { duration: 122 }), withTiming(0.66, { duration: 390 }), withTiming(0.66, { duration: 170 }), withTiming(1.06, { duration: 195 }), withTiming(1, { duration: 187 }))
    monocleRotation.value = withSequence(withTiming(0, { duration: 268 }), withTiming(6, { duration: 342 }), withTiming(-2.2, { duration: 170 }), withTiming(-1.1, { duration: 220 }), withTiming(0, { duration: 220 }))
    bowResetTimer.current = setTimeout(() => { bowInFlight.current = false }, KAEL_CORE_V9_BOW_DURATION_MS)
    return true
  }, [leftEyeScaleY, leftEyeX, leftEyeY, monocleRotation, onBowStart, reduceMotion, rightEyeScaleY, rightEyeX, rightEyeY, shellPitch, shellScaleY, shellY])

  useImperativeHandle(ref, () => ({ bow }), [bow])

  const eyeWidth = size * (5.8 / 120)
  const eyeHeight = size * (16.6 / 120)

  return (
    <View pointerEvents="none" style={[styles.root, { height: size, width: size }, style]} testID={testID}>
      <Animated.View style={[styles.model, { height: size, width: size }, shellStyle]}>
        <Svg height={size} viewBox="0 0 120 120" width={size}>
          <Defs>
            <RadialGradient cx="36%" cy="22%" id="kael-v9-body" r="83%">
              <Stop offset="0" stopColor="#D9DDE0" />
              <Stop offset="0.13" stopColor="#AEB4B9" />
              <Stop offset="0.34" stopColor="#62686E" />
              <Stop offset="0.63" stopColor="#2A2E32" />
              <Stop offset="0.86" stopColor="#151719" />
              <Stop offset="1" stopColor="#090A0B" />
            </RadialGradient>
            <RadialGradient cx="73%" cy="82%" id="kael-v9-depth" r="68%">
              <Stop offset="0" stopColor="#030405" stopOpacity={0.94} />
              <Stop offset="0.62" stopColor="#0D0F11" stopOpacity={0.42} />
              <Stop offset="1" stopColor="#5D6368" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient cx="42%" cy="3%" id="kael-v9-bloom" r="72%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.34} />
              <Stop offset="0.28" stopColor="#F3F5F6" stopOpacity={0.14} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
            <LinearGradient id="kael-v9-rim" x1="21" x2="101" y1="17" y2="104">
              <Stop offset="0" stopColor="#F7F8F9" />
              <Stop offset="0.14" stopColor="#B8BEC3" />
              <Stop offset="0.39" stopColor="#40454A" />
              <Stop offset="0.69" stopColor="#111315" />
              <Stop offset="0.84" stopColor="#71777C" />
              <Stop offset="1" stopColor="#DFE2E4" />
            </LinearGradient>
            <LinearGradient id="kael-v9-monocle" x1="64" x2="87" y1="40" y2="67">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.16" stopColor="#CFD3D6" />
              <Stop offset="0.38" stopColor="#5B6166" />
              <Stop offset="0.62" stopColor="#171A1D" />
              <Stop offset="0.82" stopColor="#8E9499" />
              <Stop offset="1" stopColor="#ECEEEF" />
            </LinearGradient>
          </Defs>
          <Circle cx="60" cy="58" fill="#050607" opacity={0.98} r="47.1" />
          <Circle cx="60" cy="58" fill="url(#kael-v9-rim)" r="45.7" />
          <Circle cx="60" cy="58" fill="#08090A" r="43.8" />
          <Circle cx="60" cy="58" fill="url(#kael-v9-body)" r="42.6" />
          <Circle cx="60" cy="58" fill="url(#kael-v9-depth)" r="42.6" />
          <Circle cx="60" cy="58" fill="url(#kael-v9-bloom)" r="42.6" />
          <Circle cx="60" cy="58" fill="none" r="43.35" stroke="#E8EBED" strokeOpacity={0.42} strokeWidth="1.25" />
          <Path d="M25.8 36.5 A42.7 42.7 0 0 1 55.6 15.7" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeOpacity={0.56} strokeWidth="1.35" />
          <Path d="M91.2 31.1 A42.7 42.7 0 0 1 102.2 56.1" fill="none" stroke="#E9ECEE" strokeLinecap="round" strokeOpacity={0.31} strokeWidth="1.05" />
          <Path d="M76.8 97.1 A42.7 42.7 0 0 1 45.3 99.0" fill="none" stroke="#C9CED2" strokeLinecap="round" strokeOpacity={0.2} strokeWidth="0.8" />
        </Svg>
        <Animated.View style={[styles.eye, { height: eyeHeight, left: size * (46.2 / 120), top: size * (43.3 / 120), width: eyeWidth }, leftEyeStyle]} testID="kael-core-v9-eye" />
        <Animated.View style={[styles.eye, { height: eyeHeight, left: size * (68 / 120), top: size * (43.3 / 120), width: eyeWidth }, rightEyeStyle]} testID="kael-core-v9-eye" />
        <Animated.View pointerEvents="none" style={[styles.monocle, monocleStyle]} testID="kael-core-v9-monocle">
          <Svg height={size} viewBox="0 0 120 120" width={size}>
            <Circle cx="71.2" cy="51.9" fill="#111417" fillOpacity={0.2} r="12.25" stroke="#030405" strokeOpacity={0.42} strokeWidth="1.35" />
            <Circle cx="71.2" cy="51.9" fill="none" r="12.35" stroke="#0A0B0D" strokeOpacity={0.86} strokeWidth="2.7" />
            <Circle cx="71.2" cy="51.9" fill="none" r="12.05" stroke="url(#kael-v9-monocle)" strokeWidth="1.72" />
            <Circle cx="71.2" cy="51.9" fill="none" r="10.87" stroke="#EDF0F2" strokeOpacity={0.25} strokeWidth="0.56" />
            <Path d="M64.1 43.4 A11.1 11.1 0 0 1 70.1 40.9" fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeOpacity={0.35} strokeWidth="0.88" />
            <Path d="M80.65 44.55 l2.35 -1.55 1.35 1.75 -2.15 1.75 z" fill="url(#kael-v9-monocle)" stroke="#111417" strokeWidth="0.42" />
            <Path d="M79.7 60.7 l2.62 1.05 -.62 2.08 -2.78 -1.1 z" fill="url(#kael-v9-monocle)" stroke="#111417" strokeWidth="0.42" />
            <Path d="M81.2 62.35 C84.9 67.8 87.1 73.2 89.2 79.9 C90 82.5 90.1 84.4 90.1 86.1" fill="none" stroke="#C9CDD0" strokeDasharray=".95 1.42" strokeLinecap="round" strokeOpacity={0.68} strokeWidth="0.72" />
            <Ellipse cx="82.55" cy="64.8" fill="none" rx="1.05" ry="0.62" stroke="#E6E8EA" strokeWidth="0.47" />
            <Ellipse cx="84.1" cy="67.35" fill="none" rx="1.05" ry="0.62" stroke="#BFC4C8" strokeWidth="0.47" />
            <Ellipse cx="85.45" cy="70.2" fill="none" rx="1.05" ry="0.62" stroke="#E0E3E5" strokeWidth="0.47" />
            <Circle cx="90.05" cy="86.15" fill="#0A0C0E" r="2.25" stroke="url(#kael-v9-monocle)" strokeWidth="0.85" />
            <Circle cx="90.05" cy="86.15" fill="#DFE3E6" r="0.76" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  )
})

const styles = StyleSheet.create({
  eye: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    position: 'absolute',
  },
  model: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  monocle: {
    ...StyleSheet.absoluteFillObject,
    transformOrigin: '75% 52%',
  },
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
})
