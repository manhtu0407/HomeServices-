import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'

import { motionDuration } from '@/components/ui/motion-tokens'
import { useAppLanguage } from '@/lib/app-language'

import type { KaelProcessLine } from './kael-process-lines'
import type { KaelProcessLineRuntime } from './use-customer-kael-chat-ui-state'
import { useV21Theme } from './use-v21-theme'

export function KaelProcessLines({ state }: { state: KaelProcessLineRuntime }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const activeLine = state.activeIndex === null ? null : state.lines[state.activeIndex] ?? null
  if (state.collapse && state.activeIndex === null) {
    return (
      <View
        accessibilityLabel={state.collapse}
        style={styles.lines}
        testID="customer-v21-kael-process-lines"
      >
        <View style={styles.line} testID="customer-v21-kael-process-collapse">
          <Text style={[styles.text, styles.textActive, { color: tokens.primary }]}>
            {state.collapse}
          </Text>
        </View>
      </View>
    )
  }
  return (
    <View
      accessibilityLabel={language === 'vi' ? 'Kael đang xử lý' : 'Kael processing'}
      style={styles.lines}
      testID="customer-v21-kael-process-lines"
    >
      {activeLine ? (
        <KaelThinkingLine
          line={activeLine}
          testID={`customer-v21-kael-process-line-${state.activeIndex ?? 0}`}
        />
      ) : null}
    </View>
  )
}

function KaelThinkingLine({ line, testID }: { line: KaelProcessLine; testID: string }) {
  const { reduceMotion, tokens } = useV21Theme()
  const opacity = useSharedValue(reduceMotion ? 1 : 0.42)
  const translateY = useSharedValue(reduceMotion ? 0 : 3)
  const textStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))

  useEffect(() => {
    cancelAnimation(opacity)
    cancelAnimation(translateY)
    if (reduceMotion) {
      opacity.value = 1
      translateY.value = 0
      return
    }
    opacity.value = 0.42
    translateY.value = 3
    opacity.value = withTiming(1, { duration: motionDuration(260, reduceMotion) })
    translateY.value = withTiming(0, { duration: motionDuration(260, reduceMotion) })
  }, [line.key, opacity, reduceMotion, translateY])

  return (
    <Animated.View key={line.key} style={[styles.thinkingLine, textStyle]} testID={testID}>
      <Text numberOfLines={1} style={[styles.text, { color: tokens.muted }]}>
        {line.text}
      </Text>
      <KaelThinkingDots />
    </Animated.View>
  )
}

function KaelThinkingDots() {
  const { reduceMotion, tokens } = useV21Theme()
  const first = useSharedValue(reduceMotion ? 0.65 : 0.25)
  const second = useSharedValue(reduceMotion ? 0.65 : 0.25)
  const third = useSharedValue(reduceMotion ? 0.65 : 0.25)
  const firstStyle = useAnimatedStyle(() => ({ opacity: first.value }))
  const secondStyle = useAnimatedStyle(() => ({ opacity: second.value }))
  const thirdStyle = useAnimatedStyle(() => ({ opacity: third.value }))

  useEffect(() => {
    ;[first, second, third].forEach((dot) => cancelAnimation(dot))
    if (reduceMotion) {
      first.value = 0.65
      second.value = 0.65
      third.value = 0.65
      return
    }
    const dotCycle = (delayMs: number) => withRepeat(
      withSequence(
        withDelay(delayMs, withTiming(1, { duration: 360 })),
        withTiming(0.25, { duration: 520 }),
      ),
      -1,
      false,
    )
    first.value = dotCycle(0)
    second.value = dotCycle(170)
    third.value = dotCycle(340)
  }, [first, reduceMotion, second, third])

  return (
    <View accessible={false} style={styles.dots} testID="customer-v21-kael-thinking-dots">
      <Animated.View style={[styles.dot, { backgroundColor: tokens.primary }, firstStyle]} />
      <Animated.View style={[styles.dot, { backgroundColor: tokens.primary }, secondStyle]} />
      <Animated.View style={[styles.dot, { backgroundColor: tokens.primary }, thirdStyle]} />
    </View>
  )
}

const styles = StyleSheet.create({
  dot: {
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  dots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    paddingTop: 4,
  },
  line: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 7,
    minHeight: 16,
  },
  lines: {
    alignSelf: 'flex-start',
    gap: 5,
    marginBottom: 6,
    marginLeft: 6,
    marginTop: -1,
    maxWidth: '88%',
  },
  text: {
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16,
  },
  textActive: {
    fontWeight: '700',
  },
  thinkingLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minHeight: 18,
  },
})
