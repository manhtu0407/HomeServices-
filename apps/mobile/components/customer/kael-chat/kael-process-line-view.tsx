import { typography } from '@/design/theme'
import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { motionDuration } from '@/components/ui/motion-tokens'
import { useKaelRespondStreamItems } from '@/components/ui/use-kael-respond-stream-presentation'
import { useAppLanguage } from '@/lib/app-language'

import type { KaelProcessLine, KaelProcessLineStatus } from './kael-process-lines'
import type { KaelProcessLineRuntime } from './use-customer-kael-chat-ui-state'
import { useV21Theme } from '../ui/use-v21-theme'

export function KaelProcessLines({ state }: { state: KaelProcessLineRuntime }) {
  const language = useAppLanguage()
  const { reduceMotion, tokens } = useV21Theme()
  const usesBackendProgress = state.origin === 'backend'
  const visibleLines = useMemo(
    () => state.lines.slice(0, state.visibleCount),
    [state.lines, state.visibleCount],
  )
  const items = useMemo(() => visibleLines.map((line) => ({
    id: line.key,
    text: line.text,
  })), [visibleLines])
  const presentedItems = useKaelRespondStreamItems({
    items,
    reduceMotion,
    streamId: usesBackendProgress ? state.streamId : null,
    streaming: usesBackendProgress,
    terminal: false,
  })
  const presentedText = new Map(presentedItems.map((item) => [item.id, item.text]))
  if (state.collapse && state.activeIndex === null) {
    return (
      <View
        accessibilityLabel={state.collapse}
        accessibilityLiveRegion="polite"
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
  if (visibleLines.length === 0) return null

  return (
    <View
      accessibilityLabel={language === 'vi' ? 'Kael đang xử lý' : 'Kael processing'}
      accessibilityLiveRegion={usesBackendProgress ? 'none' : 'polite'}
      accessibilityState={{ busy: state.activeIndex !== null }}
      style={styles.lines}
      testID="customer-v21-kael-process-lines"
    >
      {visibleLines.map((line, index) => {
        const text = presentedText.get(line.key) ?? ''
        if (usesBackendProgress && !text) return null
        return (
          <KaelProcessLineView
            key={line.key}
            line={{ ...line, text }}
            status={resolveLineStatus(line, index, state.activeIndex)}
            testID={`customer-v21-kael-process-line-${index}`}
          />
        )
      })}
    </View>
  )
}

function KaelProcessLineView({
  line,
  status,
  testID,
}: {
  line: KaelProcessLine
  status: KaelProcessLineStatus
  testID: string
}) {
  const language = useAppLanguage()
  const { reduceMotion, tokens } = useV21Theme()
  const opacity = useSharedValue(reduceMotion ? 1 : 0.42)
  const translateY = useSharedValue(reduceMotion ? 0 : 3)
  const textStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))
  const color = status === 'failed'
    ? tokens.danger
    : status === 'running'
      ? tokens.primary
      : tokens.muted

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
  }, [line.key, opacity, reduceMotion, status, translateY])

  return (
    <Animated.View
      accessibilityLabel={`${line.text}. ${processStatusLabel(status, language)}`}
      style={[styles.processLine, textStyle]}
      testID={testID}
    >
      <View
        accessible={false}
        style={[
          styles.marker,
          { backgroundColor: status === 'failed' ? tokens.danger : status === 'running' ? tokens.primary : tokens.border },
          status === 'completed' ? styles.markerCompleted : null,
        ]}
      />
      <Text numberOfLines={2} style={[styles.text, status === 'running' ? styles.textActive : null, { color }]}>
        {line.text}
      </Text>
    </Animated.View>
  )
}

function resolveLineStatus(
  line: KaelProcessLine,
  index: number,
  activeIndex: number | null,
): KaelProcessLineStatus {
  if (line.status) return line.status
  if (activeIndex === null) return 'completed'
  if (index < activeIndex) return 'completed'
  return index === activeIndex ? 'running' : 'queued'
}

function processStatusLabel(status: KaelProcessLineStatus, language: 'vi' | 'en') {
  if (language === 'vi') {
    if (status === 'completed') return 'Đã hoàn tất'
    if (status === 'failed') return 'Chưa hoàn tất'
    if (status === 'queued') return 'Đang chờ'
    return 'Đang xử lý'
  }
  if (status === 'completed') return 'Completed'
  if (status === 'failed') return 'Not completed'
  if (status === 'queued') return 'Waiting'
  return 'Processing'
}

const styles = StyleSheet.create({
  line: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 7,
    minHeight: 16,
  },
  lines: {
    alignSelf: 'flex-start',
    gap: 7,
    marginBottom: 10,
    marginLeft: 8,
    marginTop: 10,
    maxWidth: '88%',
  },
  marker: {
    borderRadius: 4,
    height: 7,
    marginTop: 5,
    width: 7,
  },
  markerCompleted: {
    opacity: 0.7,
  },
  processLine: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 7,
    minHeight: 18,
  },
  text: {
    flexShrink: 1,
    ...typography.caption2,
    fontWeight: '600',
  },
  textActive: {
    fontWeight: '600',
  },
})
