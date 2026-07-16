import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

import { motionDuration } from '@/components/ui/motion-tokens'

import { useV21Theme } from './use-v21-theme'

export function AnimatedStageProgressBar({
  active,
  progress,
}: {
  active: boolean
  progress: number
}) {
  const { reduceMotion } = useV21Theme()
  const clamped = Math.max(0, Math.min(100, progress))
  const fillWidth = useSharedValue(clamped)
  const sheenX = useSharedValue(-96)
  const sheenOpacity = useSharedValue(0)

  useEffect(() => {
    cancelAnimation(fillWidth)
    cancelAnimation(sheenX)
    cancelAnimation(sheenOpacity)

    if (reduceMotion) {
      fillWidth.value = clamped
      sheenX.value = -96
      sheenOpacity.value = 0
      return
    }

    fillWidth.value = 0
    fillWidth.value = withTiming(clamped, {
      duration: motionDuration(active ? 720 : 480, reduceMotion),
    })
    sheenX.value = -96
    sheenOpacity.value = withTiming(1, { duration: motionDuration(120, reduceMotion) })
    sheenX.value = withTiming(280, { duration: motionDuration(860, reduceMotion) })
    sheenOpacity.value = withDelay(
      700,
      withTiming(0, { duration: motionDuration(170, reduceMotion) }),
    )

    return () => {
      cancelAnimation(fillWidth)
      cancelAnimation(sheenX)
      cancelAnimation(sheenOpacity)
    }
  }, [active, clamped, fillWidth, reduceMotion, sheenOpacity, sheenX])

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value}%`,
  }))
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: sheenOpacity.value,
    transform: [{ translateX: sheenX.value }],
  }))

  return (
    <View style={styles.stageProgressBar} testID="customer-v21-job-progress-bar">
      <View pointerEvents="none" style={styles.stageProgressTrackAura} />
      <Animated.View
        pointerEvents="none"
        style={[styles.stageProgressSheen, sheenStyle]}
        testID="customer-v21-job-progress-bar-sheen"
      />
      <Animated.View
        style={[styles.stageProgressFill, fillStyle]}
        testID="customer-v21-job-progress-bar-fill"
      >
        <View pointerEvents="none" style={styles.stageProgressFillHighlight} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  stageProgressBar: {
    backgroundColor: 'rgba(208,228,224,0.56)',
    borderRadius: 7,
    height: 8,
    marginTop: 11,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  stageProgressFill: {
    backgroundColor: '#08AF9C',
    borderRadius: 7,
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
    boxShadow: '0 0 12px rgba(8,175,156,0.22)',
  },
  stageProgressFillHighlight: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderRadius: 7,
    height: 2,
    left: 2,
    position: 'absolute',
    right: 2,
    top: 1,
  },
  stageProgressSheen: {
    backgroundColor: 'rgba(18,188,168,0.28)',
    borderRadius: 7,
    height: '100%',
    position: 'absolute',
    top: 0,
    width: 96,
    zIndex: 1,
  },
  stageProgressTrackAura: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(93,228,211,0.12)',
  },
})
