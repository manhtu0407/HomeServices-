import { Image } from 'expo-image'
import { useEffect, useState } from 'react'
import { AppState, StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

const avatarArtwork = require('@/assets/kael/kael-phase-avatar.png')
const wingArtwork = require('@/assets/kael/kael-phase-avatar-wing.png')

const WING_OPACITY = 0.3
const GREETING_REPEATS = 3
const AMBIENT_REPEATS = 2
// Fractions of the 412px artwork: the box that holds the head and neck, and the eye inside it.
const HEAD_BOX = { height: 0.38, left: 0.42, top: 0.16, width: 0.46 }
const EYE = { height: 0.07, left: 0.652, top: 0.345, width: 0.07 }

// Kael's round avatar for a phase header. It keeps the original greeting: the head bows toward the customer
// and the eye blinks, as on the chat mascot. The wing highlight (a separate alpha sprite) and the halo move
// gently too. Every loop runs a few times and then rests, so nothing decorative repeats forever, and all of it
// stops under Reduce Motion.
export function KaelPhaseAvatar({
  reduceMotion = false,
  size,
  testID,
}: {
  reduceMotion?: boolean
  size: number
  testID?: string
}) {
  const [appActive, setAppActive] = useState(() => AppState.currentState === 'active')
  const blink = useSharedValue(0)
  const bow = useSharedValue(0)
  const flutter = useSharedValue(0)
  const breath = useSharedValue(0)
  const live = !reduceMotion && appActive
  const motionScale = Math.max(0.72, Math.min(1.2, size / 116))

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppActive(nextState === 'active')
    })

    return () => subscription.remove()
  }, [])

  useEffect(() => {
    cancelAnimation(blink)
    cancelAnimation(bow)
    cancelAnimation(flutter)
    cancelAnimation(breath)
    if (!live) {
      blink.value = 0
      bow.value = 0
      flutter.value = 0
      breath.value = 0
      return
    }

    blink.value = withRepeat(
      withSequence(
        withDelay(1200, withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) })),
        withTiming(1, { duration: 35 }),
        withTiming(0, { duration: 150, easing: Easing.inOut(Easing.quad) }),
        withDelay(2425, withTiming(0, { duration: 0 })),
      ),
      GREETING_REPEATS,
      false,
    )
    bow.value = withRepeat(
      withSequence(
        withTiming(0.12, { duration: 160, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 360, easing: Easing.inOut(Easing.cubic) }),
        withTiming(1, { duration: 220 }),
        withTiming(0.94, { duration: 100, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 460, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 150 }),
        withDelay(3550, withTiming(0, { duration: 0 })),
      ),
      GREETING_REPEATS,
      false,
    )
    flutter.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withDelay(450, withTiming(0, { duration: 0 })),
      ),
      GREETING_REPEATS,
      false,
    )
    breath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1750, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1750, easing: Easing.inOut(Easing.sin) }),
      ),
      AMBIENT_REPEATS,
      false,
    )

    return () => {
      cancelAnimation(blink)
      cancelAnimation(bow)
      cancelAnimation(flutter)
      cancelAnimation(breath)
    }
  }, [blink, bow, breath, flutter, live])

  const bowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: bow.value * 1.8 * motionScale },
      { rotateZ: `${bow.value * 4.8 * motionScale}deg` },
    ],
  }))
  const blinkStyle = useAnimatedStyle(() => ({
    opacity: blink.value,
    transform: [{ translateY: -size * EYE.height + blink.value * size * EYE.height }],
  }))
  const wingStyle = useAnimatedStyle(() => ({
    opacity: live ? WING_OPACITY : 0,
    transform: [
      { rotate: `${-0.9 + flutter.value * 2.9}deg` },
      { translateY: -flutter.value * size * 0.008 },
    ],
  }))
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.12 + breath.value * 0.11,
  }))
  const box = {
    height: size * HEAD_BOX.height,
    left: size * HEAD_BOX.left,
    top: size * HEAD_BOX.top,
    width: size * HEAD_BOX.width,
  }

  return (
    <View accessible={false} style={{ height: size, width: size }} testID={testID}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            borderRadius: size,
            height: size * 0.88,
            left: size * 0.07,
            top: size * 0.1,
            width: size * 0.88,
          },
          haloStyle,
        ]}
      />
      <Image accessible={false} contentFit="contain" source={avatarArtwork} style={{ height: size, width: size }} />
      <Animated.View pointerEvents="none" style={[styles.wing, { height: size, width: size }, wingStyle]}>
        <Image accessible={false} contentFit="contain" source={wingArtwork} style={{ height: size, width: size }} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.headPivot, { height: size, width: size }, bowStyle]}
        testID={testID ? `${testID}-bow` : undefined}
      >
        <View style={[styles.headBox, box]}>
          <Image
            accessible={false}
            contentFit="contain"
            source={avatarArtwork}
            style={{ height: size, left: -box.left, position: 'absolute', top: -box.top, width: size }}
          />
          <View
            style={[
              styles.eyeSlot,
              {
                height: size * EYE.height,
                left: size * EYE.left - box.left,
                top: size * EYE.top - box.top,
                width: size * EYE.width,
              },
            ]}
          >
            <Animated.View
              style={[styles.eyelid, { borderRadius: size * EYE.height, height: size * EYE.height }, blinkStyle]}
              testID={testID ? `${testID}-blink` : undefined}
            />
          </View>
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  eyeSlot: {
    overflow: 'hidden',
    position: 'absolute',
  },
  eyelid: {
    backgroundColor: '#F1F4F3',
    width: '100%',
  },
  halo: {
    backgroundColor: '#7BE9CF',
    position: 'absolute',
    transform: [{ scale: 1.08 }],
  },
  headBox: {
    overflow: 'hidden',
    position: 'absolute',
  },
  headPivot: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  wing: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
})
