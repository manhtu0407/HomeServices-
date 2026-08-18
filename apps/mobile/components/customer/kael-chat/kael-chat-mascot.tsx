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

const kaelChatArtwork = require('@/assets/kael/kael-chat-support-wrap-monocle.png')

type KaelChatMascotProps = {
  accessibilityLabel?: string
  motion?: 'live' | 'static'
  reduceMotion?: boolean
  size?: number
  testID?: string
}

const ARTWORK_REFERENCE_SIZE = 112
const STAGE_REFERENCE_SIZE = 150
const HEAD_CUT_REFERENCE_SIZE = 60
const HEAD_LAYER_REFERENCE_SIZE = 68
const EYELID_LEFT_REFERENCE_SIZE = 79
const EYELID_TOP_REFERENCE_SIZE = 27
const EYELID_WIDTH_REFERENCE_SIZE = 14
const EYELID_HEIGHT_REFERENCE_SIZE = 8

export function KaelChatMascot({
  accessibilityLabel,
  motion = 'live',
  reduceMotion = false,
  size = 116,
  testID,
}: KaelChatMascotProps) {
  const [appActive, setAppActive] = useState(() => AppState.currentState === 'active')
  const blinkProgress = useSharedValue(0)
  const bowProgress = useSharedValue(0)
  const live = motion === 'live' && !reduceMotion && appActive
  const artworkSize = Math.max(18, Math.min(220, size))
  const stageSize = artworkSize * (STAGE_REFERENCE_SIZE / ARTWORK_REFERENCE_SIZE)
  const neckCut = artworkSize * (HEAD_CUT_REFERENCE_SIZE / ARTWORK_REFERENCE_SIZE)
  const headLayerSize = artworkSize * (HEAD_LAYER_REFERENCE_SIZE / ARTWORK_REFERENCE_SIZE)
  const motionScale = Math.max(0.72, Math.min(1.2, artworkSize / 116))

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppActive(nextState === 'active')
    })

    return () => subscription.remove()
  }, [])

  useEffect(() => {
    cancelAnimation(blinkProgress)
    if (!live) {
      blinkProgress.value = 0
      return
    }

    blinkProgress.value = withRepeat(
      withSequence(
        withDelay(1200, withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) })),
        withTiming(1, { duration: 35 }),
        withTiming(0, { duration: 150, easing: Easing.inOut(Easing.quad) }),
        withDelay(2425, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    )

    return () => cancelAnimation(blinkProgress)
  }, [blinkProgress, live])

  useEffect(() => {
    cancelAnimation(bowProgress)
    if (!live) {
      bowProgress.value = 0
      return
    }

    bowProgress.value = withRepeat(
      withSequence(
        withTiming(0.12, { duration: 160, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 360, easing: Easing.inOut(Easing.cubic) }),
        withTiming(1, { duration: 220 }),
        withTiming(0.94, { duration: 100, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 460, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 150 }),
        withDelay(3550, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    )

    return () => cancelAnimation(bowProgress)
  }, [bowProgress, live])

  const blinkStyle = useAnimatedStyle(() => ({
    opacity: blinkProgress.value,
    transform: [{ translateY: -artworkSize * (EYELID_HEIGHT_REFERENCE_SIZE / ARTWORK_REFERENCE_SIZE) + blinkProgress.value * artworkSize * (EYELID_HEIGHT_REFERENCE_SIZE / ARTWORK_REFERENCE_SIZE) }],
  }))
  const bowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: bowProgress.value * 1.8 * motionScale },
      { rotateZ: `${bowProgress.value * 4.8 * motionScale}deg` },
    ],
  }))

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessible={Boolean(accessibilityLabel)}
      style={[styles.stage, { height: stageSize, width: stageSize }]}
      testID={testID}
    >
      <View style={[styles.rig, { height: artworkSize, width: artworkSize }]}>
        <View
          pointerEvents="none"
          style={[styles.bodyLayer, { height: artworkSize - neckCut, top: neckCut, width: artworkSize }]}
        >
          <Image
            accessible={false}
            contentFit="contain"
            source={kaelChatArtwork}
            style={[styles.bodyArtwork, { height: artworkSize, top: -neckCut, width: artworkSize }]}
            testID={testID ? `${testID}-body` : undefined}
          />
        </View>
        <Animated.View
          pointerEvents="none"
          style={[styles.headPivot, { height: artworkSize, width: artworkSize }, bowStyle]}
          testID={testID ? `${testID}-bow` : undefined}
        >
          <View style={[styles.headLayer, { height: headLayerSize, width: artworkSize }]}>
            <Image
              accessible={false}
              contentFit="contain"
              source={kaelChatArtwork}
              style={{ height: artworkSize, width: artworkSize }}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.eyelid,
                {
                  borderRadius: Math.max(2, artworkSize * (EYELID_HEIGHT_REFERENCE_SIZE / ARTWORK_REFERENCE_SIZE) / 2),
                  height: artworkSize * (EYELID_HEIGHT_REFERENCE_SIZE / ARTWORK_REFERENCE_SIZE),
                  left: artworkSize * (EYELID_LEFT_REFERENCE_SIZE / ARTWORK_REFERENCE_SIZE),
                  top: artworkSize * (EYELID_TOP_REFERENCE_SIZE / ARTWORK_REFERENCE_SIZE),
                  width: artworkSize * (EYELID_WIDTH_REFERENCE_SIZE / ARTWORK_REFERENCE_SIZE),
                },
                blinkStyle,
              ]}
              testID={testID ? `${testID}-blink` : undefined}
            />
          </View>
        </Animated.View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bodyArtwork: {
    left: 0,
    position: 'absolute',
  },
  bodyLayer: {
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
  },
  eyelid: {
    backgroundColor: '#F3F8F6',
    position: 'absolute',
  },
  headLayer: {
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
  },
  headPivot: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  rig: {
    position: 'relative',
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
})
