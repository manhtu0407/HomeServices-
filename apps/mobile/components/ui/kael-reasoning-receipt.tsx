import { typography } from '@/design/theme'
import { useEffect, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { motionDuration } from '@/components/ui/motion-tokens'
import { useKaelRespondStreamItems } from '@/components/ui/use-kael-respond-stream-presentation'
import type { AppLanguage } from '@/lib/app-language'
import type { KaelReasoningReceiptState } from '@/lib/kael-reasoning-receipt'

type KaelReasoningReceiptColors = {
  accent: string
  border: string
  mutedText: string
  surface: string
  text: string
}

export function KaelReasoningReceipt({
  colors,
  language,
  onToggle,
  state,
  testID,
}: {
  colors: KaelReasoningReceiptColors
  language: AppLanguage
  onToggle: () => void
  state: KaelReasoningReceiptState
  testID?: string
}) {
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const copy = receiptCopy(language)
  const status = state.status === 'running'
    ? copy.running
    : state.status === 'complete'
      ? copy.complete
      : copy.failed
  const elapsed = state.receiptId ? formatElapsed(state.elapsedMs) : null
  const uniqueSummary = state.summary.filter((item) => !state.steps.some(
    (step) => (step.detail ?? step.label) === item,
  ))
  const publicItems = [
    ...state.steps.map((step) => ({
      id: `step:${step.id}`,
      text: step.detail ?? step.label,
    })),
    ...uniqueSummary.map((item, index) => ({
      id: `summary:${index}`,
      text: item,
    })),
  ]
  const presentedPublicItems = useKaelRespondStreamItems({
    items: publicItems,
    reduceMotion,
    streamId: state.receiptId,
    streaming: state.status === 'running',
    terminal: state.status === 'complete',
  })
  const presentedPublicText = new Map(presentedPublicItems.map((item) => [item.id, item.text]))
  if (state.status === 'idle') return null
  const accessibleLabel = [
    copy.title,
    status,
    elapsed?.label,
    state.expanded ? copy.collapse : copy.expand,
  ].filter((item): item is string => Boolean(item)).join('. ')
  const hasDetails = state.steps.length > 0
    || uniqueSummary.length > 0
    || state.fallbackUsed
    || Boolean(state.failureMessage)

  return (
    <View
      accessibilityLiveRegion={state.status === 'running' ? 'polite' : 'none'}
      style={[styles.card, {
        backgroundColor: reduceTransparency ? colors.surface : 'transparent',
        borderColor: colors.border,
      }]}
      testID={testID}
    >
      <Pressable
        accessibilityHint={state.expanded ? copy.collapse : copy.expand}
        accessibilityLabel={accessibleLabel}
        accessibilityRole="button"
        accessibilityState={{ busy: state.status === 'running', expanded: state.expanded }}
        onPress={onToggle}
        style={styles.header}
        testID={testID ? `${testID}-toggle` : undefined}
      >
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
          <View style={styles.statusRow}>
            {state.status === 'running' ? (
              <MatrixDotLoader
                key={state.receiptId ?? 'pending'}
                color={colors.accent}
                reduceMotion={reduceMotion}
                testID={testID ? `${testID}-matrix-loader` : undefined}
              />
            ) : null}
            <ReceiptStatusText
              accentColor={colors.accent}
              color={colors.mutedText}
              receiptId={state.receiptId}
              reduceMotion={reduceMotion}
              status={state.status}
              testID={testID ? `${testID}-status` : undefined}
            >
              {status}
            </ReceiptStatusText>
          </View>
        </View>
        {elapsed ? (
          <View style={styles.elapsedSlot} testID={testID ? `${testID}-elapsed-slot` : undefined}>
            <Text style={[styles.elapsed, { color: colors.accent }]}>
              <Text
                style={styles.elapsedValue}
                testID={testID ? `${testID}-elapsed-value` : undefined}
              >
                {elapsed.value}
              </Text>
              <Text style={styles.elapsedUnit}> s</Text>
            </Text>
          </View>
        ) : null}
        <View style={styles.chevronSlot} testID={testID ? `${testID}-chevron-slot` : undefined}>
          <Svg
            height={16}
            testID={testID ? `${testID}-chevron` : undefined}
            viewBox="0 0 16 16"
            width={16}
          >
            <Path
              d={state.expanded ? 'M3 10.5 8 5.5l5 5' : 'M3 5.5 8 10.5l5-5'}
              fill="none"
              stroke={colors.mutedText}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.7}
              testID={testID ? `${testID}-chevron-path` : undefined}
            />
          </Svg>
        </View>
      </Pressable>
      {state.expanded && hasDetails ? (
        <View style={styles.details}>
          {state.steps.map((step) => (
            <ReasoningStep
              color={colors.text}
              dotColor={step.status === 'failed' ? colors.mutedText : colors.accent}
              key={step.id}
              text={presentedPublicText.get(`step:${step.id}`) ?? ''}
            />
          ))}
          {uniqueSummary.map((item, index) => (
            <Text key={`${index}-${item}`} style={[styles.summary, { color: colors.text }]}>
              {presentedPublicText.get(`summary:${index}`) ?? ''}
            </Text>
          ))}
          {state.fallbackUsed ? <Text style={[styles.note, { color: colors.mutedText }]}>{copy.fallback}</Text> : null}
          {state.failureMessage ? <Text style={[styles.note, { color: colors.mutedText }]}>{state.failureMessage}</Text> : null}
        </View>
      ) : null}
    </View>
  )
}

function ReceiptStatusText({
  accentColor,
  children,
  color,
  receiptId,
  reduceMotion,
  status,
  testID,
}: {
  accentColor: string
  children: string
  color: string
  receiptId: string | null
  reduceMotion: boolean
  status: KaelReasoningReceiptState['status']
  testID?: string
}) {
  const progress = useSharedValue(0)
  const previousStatus = useRef({ receiptId, status })
  const animatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [color, accentColor]),
  }))

  useEffect(() => {
    cancelAnimation(progress)
    const previous = previousStatus.current
    previousStatus.current = { receiptId, status }
    const changedToTerminal = previous.receiptId === receiptId
      && previous.status === 'running'
      && (status === 'complete' || status === 'failed')
    if (!changedToTerminal || reduceMotion) {
      progress.value = 0
      return
    }
    progress.value = withSequence(
      withTiming(1, { duration: motionDuration(180, reduceMotion) }),
      withTiming(0, { duration: motionDuration(240, reduceMotion) }),
    )
    return () => cancelAnimation(progress)
  }, [progress, receiptId, reduceMotion, status])

  return (
    <Animated.Text
      style={[styles.status, { color }, animatedStyle]}
      testID={testID}
    >
      {children}
    </Animated.Text>
  )
}

function MatrixDotLoader({
  color,
  reduceMotion,
  testID,
}: {
  color: string
  reduceMotion: boolean
  testID?: string
}) {
  return (
    <View accessible={false} style={styles.matrixLoader} testID={testID}>
      {Array.from({ length: 16 }, (_, index) => (
        <MatrixDot
          color={color}
          index={index}
          key={index}
          reduceMotion={reduceMotion}
          testID={testID ? `${testID}-dot-${index}` : undefined}
        />
      ))}
    </View>
  )
}

function MatrixDot({
  color,
  index,
  reduceMotion,
  testID,
}: {
  color: string
  index: number
  reduceMotion: boolean
  testID?: string
}) {
  const opacity = useSharedValue(0.34)
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  useEffect(() => {
    cancelAnimation(opacity)
    if (reduceMotion) {
      opacity.value = 0.34
      return
    }
    opacity.value = withDelay(
      index * 36,
      withSequence(
        withTiming(1, { duration: 110 }),
        withTiming(0.34, { duration: 160 }),
      ),
    )
    return () => cancelAnimation(opacity)
  }, [index, opacity, reduceMotion])

  return <Animated.View style={[styles.matrixDot, { backgroundColor: color }, animatedStyle]} testID={testID} />
}

function formatElapsed(elapsedMs: number) {
  const seconds = Math.max(0, elapsedMs) / 1_000
  const value = String(seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1))
  return { label: `${value} s`, value }
}

function ReasoningStep({
  color,
  dotColor,
  text,
}: {
  color: string
  dotColor: string
  text: string
}) {
  if (!text) return null
  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepDot, { backgroundColor: dotColor }]} />
      <View style={styles.stepText}>
        <Text style={[styles.stepLabel, { color }]}>{text}</Text>
      </View>
    </View>
  )
}

function receiptCopy(language: AppLanguage) {
  return language === 'en'
    ? {
        collapse: 'Collapse reasoning process',
        complete: 'Finished thinking',
        expand: 'Expand reasoning process',
        failed: 'Thinking was interrupted',
        fallback: 'Kael used a safe alternative reply.',
        running: 'Thinking',
        title: 'Reasoning process',
      }
    : {
        collapse: 'Thu gọn quá trình suy luận',
        complete: 'Suy nghĩ xong',
        expand: 'Mở rộng quá trình suy luận',
        failed: 'Suy nghĩ bị gián đoạn',
        fallback: 'Kael đã dùng phản hồi thay thế an toàn.',
        running: 'Suy nghĩ',
        title: 'Quá trình suy luận',
      }
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: '94%',
    overflow: 'hidden',
  },
  details: {
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: 13,
  },
  chevronSlot: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    right: 9,
    top: 0,
    width: 26,
  },
  elapsed: {
    ...typography.caption1,
    fontVariant: ['tabular-nums'],
  },
  elapsedUnit: {
    fontWeight: '600',
  },
  elapsedValue: {
    fontWeight: '600',
  },
  elapsedSlot: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    right: 49,
    top: 0,
  },
  header: {
    alignItems: 'stretch',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 13,
    paddingVertical: 8,
    position: 'relative',
  },
  headerText: {
    flex: 1,
    gap: 1,
    justifyContent: 'center',
    paddingRight: 88,
  },
  note: {
    ...typography.caption1,
  },
  status: {
    ...typography.caption1,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  matrixLoader: {
    alignContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  matrixDot: {
    borderRadius: 1,
    height: 3,
    width: 3,
  },
  stepDot: {
    borderRadius: 4,
    height: 7,
    marginTop: 6,
    width: 7,
  },
  stepLabel: {
    ...typography.footnote,
    fontWeight: '600',
  },
  stepRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 9,
  },
  stepText: {
    flex: 1,
    gap: 1,
  },
  summary: {
    ...typography.footnote,
  },
  title: {
    ...typography.footnote,
    fontWeight: '600',
  },
})
