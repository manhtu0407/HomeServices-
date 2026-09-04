import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Image } from 'expo-image'
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type PointerEvent as NativePointerEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'

import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'
import type { AppLanguage } from '@/lib/app-language'
import type { EarningsResponse } from '@/lib/api-types'

import { formatVndDong, textByLanguage } from '../ui/format'
import { workerIncomeDashboardAssets, workerIncomeDashboardTokens as tokens } from './income-dashboard-tokens'
import {
  buildEarningsDashboardModel,
  buildWorkerEarningsSnapshot,
  buildWorkerEarningsTrend,
  type WorkerEarningsComparison,
  type WorkerEarningsPeriod,
} from './overview-model'
import { WorkerEarningsPeriodSelector } from './period-selector'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)
const colors = tokens.colors
const ORB_PROXIMITY_PADDING = 24

function IncomeOrbWithdrawFill() {
  const gradientId = 'workerIncomeOrbWithdrawGradient'
  return (
    <Svg pointerEvents="none" preserveAspectRatio="none" style={StyleSheet.absoluteFill} testID="worker-v5-income-dashboard-orb-withdraw-gradient" viewBox="0 0 100 38">
      <Defs>
        <LinearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <Stop offset={0} stopColor={colors.purpleBorderOpaque} />
          <Stop offset={0.5} stopColor={colors.purple} />
          <Stop offset={1} stopColor={colors.purpleStrong} />
        </LinearGradient>
      </Defs>
      <Rect fill={`url(#${gradientId})`} height="38" rx="20" width="100" x="0" y="0" />
    </Svg>
  )
}

function MotionButton({
  accessibilityLabel,
  children,
  onPress,
  reduceMotion,
  style,
  testID,
}: {
  accessibilityLabel: string
  children: ReactNode
  onPress?: () => void
  reduceMotion: boolean
  style: object
  testID: string
}) {
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const setPressed = (pressed: boolean) => {
    scale.value = withTiming(pressed && !reduceMotion ? tokens.motion.pressScale : 1, {
      duration: motionDuration(motionTokens.feedback.durationMs, reduceMotion),
    })
  }

  useEffect(() => () => cancelAnimation(scale), [scale])

  return (
    <AnimatedPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[style, animatedStyle]}
      testID={testID}
    >
      {children}
    </AnimatedPressable>
  )
}

function LoadingValue({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      accessible={false}
      style={[styles.loadingValue, style]}
      testID="worker-v5-income-dashboard-loading-value"
    />
  )
}

function DashboardBackground({ reduceMotion, reduceTransparency }: { reduceMotion: boolean; reduceTransparency: boolean }) {
  const ambient = useSharedValue(0)
  const ambientStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ambient.value, [0, 1], [0.08, 0.18]),
    transform: [
      { translateX: interpolate(ambient.value, [0, 1], [-8, 8]) },
      { translateY: interpolate(ambient.value, [0, 1], [5, -4]) },
      { scale: interpolate(ambient.value, [0, 1], [0.98, 1.04]) },
    ],
  }))

  useEffect(() => {
    cancelAnimation(ambient)
    ambient.value = 0
    if (reduceMotion || reduceTransparency) return
    ambient.value = withRepeat(
      withSequence(
        withTiming(1, { duration: tokens.motion.ambientHalfCycleMs, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: tokens.motion.ambientHalfCycleMs, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    )
    return () => cancelAnimation(ambient)
  }, [ambient, reduceMotion, reduceTransparency])

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.whiteBase, reduceTransparency ? styles.opaqueBase : null]} />
      <Image contentFit="fill" source={workerIncomeDashboardAssets.background} style={styles.backgroundImage} testID="worker-v5-income-dashboard-background" />
      {!reduceTransparency ? (
        <Animated.View style={[styles.ambientAura, ambientStyle]} testID="worker-v5-income-dashboard-ambient">
          <Svg height="100%" viewBox="0 0 210 180" width="100%">
            <Defs>
              <RadialGradient id="workerIncomeAmbient" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%" stopColor={colors.violetAura} stopOpacity={0.55} />
                <Stop offset="76%" stopColor={colors.violetAura} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect fill="url(#workerIncomeAmbient)" height={180} width={210} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  )
}

function comparisonCopy(comparison: WorkerEarningsComparison, language: AppLanguage) {
  if (comparison.state === 'missing-baseline') {
    return textByLanguage(language, 'Chưa đủ dữ liệu kỳ trước', 'Not enough previous-period data')
  }
  if (comparison.state === 'zero-baseline') {
    return textByLanguage(language, 'Chưa có thu nhập kỳ trước', 'No income in the previous period')
  }
  const prefix = comparison.percentage > 0 ? '+' : ''
  return textByLanguage(
    language,
    `${prefix}${comparison.percentage}% so với kỳ trước`,
    `${prefix}${comparison.percentage}% vs previous period`,
  )
}

function DeltaRow({ comparison, language, statusCopy }: { comparison: WorkerEarningsComparison; language: AppLanguage; statusCopy?: string }) {
  const direction = comparison.state === 'available' ? comparison.direction : 'flat'
  const copy = statusCopy ?? comparisonCopy(comparison, language)
  return (
    <View accessibilityLabel={copy} style={styles.deltaRow} testID="worker-v5-income-dashboard-delta">
      {!statusCopy && comparison.state === 'available' && direction !== 'flat' ? (
        <View style={[styles.deltaArrow, direction === 'decrease' ? styles.deltaArrowDown : null]} />
      ) : null}
      <Text maxFontSizeMultiplier={2} style={[styles.deltaText, direction === 'decrease' ? styles.deltaTextDecrease : null]}>
        {copy}
      </Text>
    </View>
  )
}

function MiniTrendChart({ points }: { points: ReturnType<typeof buildEarningsDashboardModel>['visiblePoints'] }) {
  const trend = buildWorkerEarningsTrend(points)
  if (!trend) return null
  return (
    <View pointerEvents="none" style={styles.chartFrame}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 115 35" width="100%">
        <Path d={trend.path} fill="none" stroke={colors.chartGlow} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} />
        <Path d={trend.path} fill="none" stroke={colors.purple} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.18} />
        <Circle cx={trend.endX} cy={trend.endY} fill={colors.chartGlow} r={3} />
        <Circle cx={trend.endX} cy={trend.endY} fill={colors.purple} r={1.45} stroke={colors.white} strokeWidth={0.8} />
      </Svg>
    </View>
  )
}

function LiquidBalanceOrb({
  amount,
  dynamicExtra,
  language,
  left,
  onWithdraw,
  reduceMotion,
  reduceTransparency,
  top,
  width,
}: {
  amount: string | null
  dynamicExtra: number
  language: AppLanguage
  left: number
  onWithdraw?: () => void
  reduceMotion: boolean
  reduceTransparency: boolean
  top: number
  width: number
}) {
  const orbExtra = dynamicExtra * 0.27
  const orbRatio = width / 176
  const orbHeight = width * 153 / 176 + orbExtra
  const loadingCopy = textByLanguage(language, 'Đang tải số dư có thể rút', 'Loading withdrawable balance')
  const interactionActive = useRef(false)
  const pressProgress = useSharedValue(0)
  const contactX = useSharedValue(0)
  const contactY = useSharedValue(0)
  const idleDrift = useSharedValue(0)
  const ripple = useSharedValue(0)
  const sheen = useSharedValue(0)
  const orbStyle = useAnimatedStyle(() => ({
    transform: reduceMotion
      ? []
      : [
          { translateX: contactX.value * 8 + idleDrift.value * 0.7 },
          { translateY: contactY.value * 6.5 - pressProgress.value * 2.4 - idleDrift.value * 1.2 },
          {
            scaleX: 1
              + pressProgress.value * 0.022
              + Math.abs(contactX.value) * 0.028
              - Math.abs(contactY.value) * 0.009
              + idleDrift.value * 0.005,
          },
          {
            scaleY: 1
              - pressProgress.value * 0.016
              + Math.abs(contactY.value) * 0.028
              - Math.abs(contactX.value) * 0.009
              - idleDrift.value * 0.004,
          },
        ],
  }), [reduceMotion])
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: 0.1
      + pressProgress.value * 0.16
      + interpolate(ripple.value, [0, 0.36, 1], [0, reduceMotion ? 0.12 : 0.32, 0]),
    transform: reduceMotion
      ? []
      : [{ scale: interpolate(ripple.value, [0, 1], [0.94, 1.055]) + pressProgress.value * 0.018 }],
  }), [reduceMotion])
  const frostStyle = useAnimatedStyle(() => ({
    opacity: 0.12 + pressProgress.value * 0.14 + (Math.abs(contactX.value) + Math.abs(contactY.value)) * 0.035,
    transform: reduceMotion
      ? []
      : [
          { translateX: contactX.value * 10 },
          { translateY: contactY.value * 8 },
          { scale: 1 + pressProgress.value * 0.025 },
        ],
  }), [reduceMotion])
  const causticStyle = useAnimatedStyle(() => ({
    opacity: pressProgress.value * 0.32 + interpolate(ripple.value, [0, 0.28, 1], [0, 0.22, 0]),
    transform: reduceMotion
      ? []
      : [
          { translateX: contactX.value * 18 },
          { translateY: contactY.value * 14 },
          { scale: 0.82 + pressProgress.value * 0.18 + interpolate(ripple.value, [0, 1], [0, 0.08]) },
        ],
  }), [reduceMotion])
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheen.value, [0, 0.16, 0.72, 1], [0, 0.48, 0.2, 0]),
    transform: [
      { translateX: interpolate(sheen.value, [0, 1], [-width * 0.46, width * 0.5]) },
      { rotate: '-13deg' },
    ],
  }), [width])
  const triggerReaction = () => {
    cancelAnimation(ripple)
    cancelAnimation(sheen)
    ripple.value = 0
    sheen.value = 0

    if (reduceMotion) {
      ripple.value = withSequence(
        withTiming(1, { duration: motionDuration(motionTokens.feedback.durationMs, true) }),
        withTiming(0, { duration: motionDuration(motionTokens.feedback.durationMs, true) }),
      )
      return
    }

    ripple.value = withTiming(1, { duration: motionTokens.stateChange.durationMs, easing: Easing.out(Easing.cubic) })
    if (!reduceTransparency) {
      sheen.value = withTiming(1, { duration: motionTokens.stateChange.durationMs, easing: Easing.inOut(Easing.quad) })
    }
  }

  const updateContact = (event: NativePointerEvent, targetWidth: number, targetHeight: number) => {
    if (reduceMotion) return
    const x = Math.max(-1, Math.min(1, (event.nativeEvent.offsetX / targetWidth - 0.5) * 2))
    const y = Math.max(-1, Math.min(1, (event.nativeEvent.offsetY / targetHeight - 0.5) * 2))
    contactX.value = x
    contactY.value = y
  }

  const beginInteraction = (event: NativePointerEvent, targetWidth: number, targetHeight: number) => {
    interactionActive.current = true
    cancelAnimation(pressProgress)
    cancelAnimation(contactX)
    cancelAnimation(contactY)
    cancelAnimation(idleDrift)
    idleDrift.value = 0
    updateContact(event, targetWidth, targetHeight)
    pressProgress.value = reduceMotion ? 0 : withSpring(1, motionTokens.liquid.press)
    triggerReaction()
  }

  const moveInteraction = (event: NativePointerEvent, targetWidth: number, targetHeight: number) => {
    if (!interactionActive.current) return
    updateContact(event, targetWidth, targetHeight)
  }

  const finishInteraction = () => {
    if (!interactionActive.current) return
    interactionActive.current = false
    contactX.value = reduceMotion ? 0 : withSpring(0, motionTokens.liquid.pill)
    contactY.value = reduceMotion ? 0 : withSpring(0, motionTokens.liquid.pill)
    pressProgress.value = reduceMotion ? 0 : withSpring(0, motionTokens.liquid.pill)
    idleDrift.value = reduceMotion
      ? 0
      : withDelay(80, withSequence(
          withSpring(0.62, motionTokens.liquid.pill),
          withSpring(-0.2, motionTokens.liquid.pill),
          withSpring(0, motionTokens.liquid.press),
        ))
  }

  useEffect(() => {
    idleDrift.value = reduceMotion
      ? 0
      : withDelay(420, withSequence(
          withSpring(0.48, motionTokens.liquid.pill),
          withSpring(-0.14, motionTokens.liquid.pill),
          withSpring(0, motionTokens.liquid.press),
        ))
    return () => {
      cancelAnimation(pressProgress)
      cancelAnimation(contactX)
      cancelAnimation(contactY)
      cancelAnimation(idleDrift)
      cancelAnimation(ripple)
      cancelAnimation(sheen)
    }
  }, [contactX, contactY, idleDrift, pressProgress, reduceMotion, ripple, sheen])

  const proximityWidth = width + ORB_PROXIMITY_PADDING * 2
  const proximityHeight = orbHeight + ORB_PROXIMITY_PADDING * 2

  return (
    <>
      <View
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        onPointerCancel={finishInteraction}
        onPointerDown={(event) => beginInteraction(event, proximityWidth, proximityHeight)}
        onPointerLeave={finishInteraction}
        onPointerMove={(event) => moveInteraction(event, proximityWidth, proximityHeight)}
        onPointerUp={finishInteraction}
        style={[
          styles.orbProximityZone,
          {
            height: proximityHeight,
            left: left - ORB_PROXIMITY_PADDING,
            top: top - ORB_PROXIMITY_PADDING,
            width: proximityWidth,
          },
        ]}
        testID="worker-v5-income-dashboard-orb-proximity-zone"
      />
      <Animated.View
        accessibilityLabel={amount ? `${textByLanguage(language, 'Có thể rút', 'Withdrawable')}: ${amount}` : loadingCopy}
        accessibilityState={{ busy: amount === null }}
        onPointerCancel={finishInteraction}
        onPointerDown={(event) => beginInteraction(event, width, orbHeight)}
        onPointerLeave={finishInteraction}
        onPointerMove={(event) => moveInteraction(event, width, orbHeight)}
        onPointerUp={finishInteraction}
        style={[styles.orbShell, { height: orbHeight, left, top, width }, orbStyle]}
        testID="worker-v5-income-dashboard-orb"
      >
        {reduceTransparency ? <View style={styles.orbOpaqueBacking} /> : null}
        <Image contentFit="fill" source={workerIncomeDashboardAssets.orb} style={styles.orbImage} testID="worker-v5-income-dashboard-orb-surface" />
        <View pointerEvents="none" style={styles.orbReactionClip}>
          {!reduceTransparency ? (
            <Animated.View style={[styles.orbReactionFrost, frostStyle]} testID="worker-v5-income-dashboard-orb-reaction-frost">
              <Svg height="100%" viewBox="0 0 176 153" width="100%">
                <Defs>
                  <RadialGradient id="workerIncomeOrbFrost" cx="27%" cy="16%" rx="84%" ry="84%">
                    <Stop offset="0%" stopColor={colors.white} stopOpacity={0.72} />
                    <Stop offset="48%" stopColor={colors.white} stopOpacity={0.16} />
                    <Stop offset="100%" stopColor={colors.purple} stopOpacity={0.04} />
                  </RadialGradient>
                </Defs>
                <Rect fill="url(#workerIncomeOrbFrost)" height={153} width={176} />
              </Svg>
            </Animated.View>
          ) : null}
          {!reduceTransparency ? (
            <Animated.View style={[styles.orbReactionCaustic, causticStyle]} testID="worker-v5-income-dashboard-orb-reaction-caustic">
              <Svg height="100%" viewBox="0 0 176 153" width="100%">
                <Defs>
                  <RadialGradient id="workerIncomeOrbReaction" cx="38%" cy="35%" rx="58%" ry="58%">
                    <Stop offset="0%" stopColor={colors.white} stopOpacity={0.8} />
                    <Stop offset="58%" stopColor={colors.green} stopOpacity={0.14} />
                    <Stop offset="100%" stopColor={colors.green} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Rect fill="url(#workerIncomeOrbReaction)" height={153} width={176} />
              </Svg>
            </Animated.View>
          ) : null}
          {!reduceMotion && !reduceTransparency ? (
            <Animated.View style={[styles.orbReactionSheen, sheenStyle]} testID="worker-v5-income-dashboard-orb-reaction-sheen" />
          ) : null}
        </View>
        <Animated.View pointerEvents="none" style={[styles.orbReactionRing, rippleStyle]} testID="worker-v5-income-dashboard-orb-reaction-ring" />
        <Text maxFontSizeMultiplier={2} style={[styles.orbLabel, { top: 41 * orbRatio }]}>{textByLanguage(language, 'Có thể rút', 'Withdrawable')}</Text>
        <View style={[styles.orbAmountFrame, { left: 17 * orbRatio, right: 17 * orbRatio, top: 56 * orbRatio }]} testID="worker-v5-earnings-amount">
          {amount === null ? (
            <View accessibilityLabel={loadingCopy} accessibilityRole="progressbar" accessibilityState={{ busy: true }} testID="worker-v5-earnings-metric-available-value">
              <LoadingValue style={styles.loadingOrbValue} />
            </View>
          ) : <Text maxFontSizeMultiplier={2} style={styles.orbAmount} testID="worker-v5-earnings-metric-available-value">{amount}</Text>}
        </View>
        <MotionButton
          accessibilityLabel={textByLanguage(language, 'Rút tiền từ số dư có thể rút', 'Withdraw available balance')}
          onPress={onWithdraw}
          reduceMotion={reduceMotion}
          style={[
            styles.orbWithdrawHitTarget,
            {
              left: (width - tokens.layout.orbActionWidth) / 2,
              top: 82 * orbRatio + orbExtra,
            },
          ]}
          testID="worker-v5-income-dashboard-orb-withdraw"
        >
          <View style={styles.orbWithdrawButton}>
            <IncomeOrbWithdrawFill />
            <Text maxFontSizeMultiplier={2} style={styles.orbWithdrawText}>{textByLanguage(language, 'Rút tiền', 'Withdraw')}</Text>
          </View>
        </MotionButton>
      </Animated.View>
    </>
  )
}

function CashflowCard({
  amount,
  dynamicExtra,
  language,
  left,
  points,
  state,
  top,
  width,
}: {
  amount: string | null
  dynamicExtra: number
  language: AppLanguage
  left: number
  points: ReturnType<typeof buildEarningsDashboardModel>['visiblePoints']
  state: ReturnType<typeof buildWorkerEarningsSnapshot>['state']
  top: number
  width: number
}) {
  const chartLabel = state === 'loading'
    ? textByLanguage(language, 'Đang tải biểu đồ thu nhập', 'Loading earnings chart')
    : state === 'empty'
      ? textByLanguage(language, 'Biểu đồ thu nhập chưa phát sinh trong kỳ đã chọn', 'No chart data for this period')
      : state === 'unavailable'
        ? textByLanguage(language, 'Biểu đồ thu nhập chưa có dữ liệu', 'Earnings chart data is unavailable')
        : textByLanguage(language, 'Biểu đồ thu nhập sau phí', 'Net income chart')
  return (
    <View
      accessibilityLabel={chartLabel}
      accessibilityRole="image"
      accessibilityState={{ busy: state === 'loading' }}
      style={[styles.cashflowCard, { height: tokens.layout.panelHeight + dynamicExtra * 0.15, left, top, width }]}
      testID="worker-v5-earnings-chart"
    >
      <View style={styles.cashflowCopy}>
        <Text maxFontSizeMultiplier={2} style={styles.cashflowLabel}>{textByLanguage(language, 'Dòng tiền sau phí', 'Cash flow after fees')}</Text>
        {amount === null ? (
          <View accessibilityLabel={chartLabel} accessibilityRole="progressbar" accessibilityState={{ busy: true }} style={styles.loadingCashflowFrame} testID="worker-v5-income-dashboard-cashflow">
            <LoadingValue style={styles.loadingCashflowValue} />
          </View>
        ) : <Text maxFontSizeMultiplier={2} style={styles.cashflowAmount} testID="worker-v5-income-dashboard-cashflow">{amount}</Text>}
        {state === 'empty' ? <Text maxFontSizeMultiplier={2} style={styles.cashflowEmpty}>{textByLanguage(language, 'Chưa phát sinh thu nhập trong kỳ đã chọn', 'No income in the selected period')}</Text> : null}
      </View>
      {state === 'ready' || state === 'stale' ? <MiniTrendChart points={points} /> : null}
    </View>
  )
}

function StatsStrip({
  dynamicExtra,
  expected,
  fees,
  language,
  left,
  top,
  transferred,
  width,
}: {
  dynamicExtra: number
  expected: string | null
  fees: string | null
  language: AppLanguage
  left: number
  top: number
  transferred: string | null
  width: number
}) {
  const items = [
    { id: 'withdrawn', label: textByLanguage(language, 'Đã chuyển', 'Transferred'), value: transferred },
    { id: 'pending', label: textByLanguage(language, 'Dự kiến', 'Expected'), value: expected },
    { id: 'fee', label: textByLanguage(language, 'Phí đã trừ', 'Fees deducted'), value: fees },
  ] as const
  return (
    <View style={[styles.statsStrip, { height: tokens.layout.panelHeight + dynamicExtra * 0.15, left, top, width }]} testID="worker-v5-income-dashboard-stats">
      {items.map((item, index) => (
        <View accessibilityLabel={item.value === null ? `${item.label}. ${textByLanguage(language, 'Đang tải dữ liệu', 'Loading data')}` : undefined} accessibilityState={item.value === null ? { busy: true } : undefined} key={item.id} style={[styles.stat, index > 0 ? styles.statDivider : null]}>
          <Text maxFontSizeMultiplier={2} style={styles.statLabel}>{item.label}</Text>
          {item.value === null ? (
            <View accessibilityRole="progressbar" testID={`worker-v5-earnings-metric-${item.id}-value`}>
              <LoadingValue style={styles.loadingStatValue} />
            </View>
          ) : <Text maxFontSizeMultiplier={2} style={styles.statValue} testID={`worker-v5-earnings-metric-${item.id}-value`}>{item.value}</Text>}
        </View>
      ))}
    </View>
  )
}

function amountOrState(
  earnings: EarningsResponse | null | undefined,
  earningsError: string | null,
  value: number,
  language: AppLanguage,
) {
  if (earnings) return formatVndDong(value, language)
  if (!earningsError) return null
  return textByLanguage(language, 'Chưa có dữ liệu', 'Data unavailable')
}

export function WorkerIncomeDashboard({
  earnings,
  earningsError,
  initialPeriod = 'month',
  language,
  onWithdraw,
  reduceMotion,
  reduceTransparency,
}: {
  earnings: EarningsResponse | null | undefined
  earningsError: string | null
  initialPeriod?: WorkerEarningsPeriod
  language: AppLanguage
  onWithdraw?: () => void
  reduceMotion: boolean
  reduceTransparency: boolean
}) {
  const [period, setPeriod] = useState<WorkerEarningsPeriod>(initialPeriod)
  const { fontScale, width: windowWidth } = useWindowDimensions()
  const [widthMeasurement, setWidthMeasurement] = useState(() => ({ availableWidth: Math.max(0, windowWidth), windowWidth }))
  const availableWidth = widthMeasurement.windowWidth === windowWidth
    ? widthMeasurement.availableWidth
    : Math.max(0, windowWidth)
  const dynamicExtra = Math.max(0, Math.min(fontScale, 2) - 1) * 170
  const stageHeight = tokens.layout.stageHeight + dynamicExtra
  const stageWidth = Math.max(0, availableWidth)
  const contentWidth = Math.min(tokens.layout.maxWidth, Math.max(0, stageWidth - tokens.layout.screenGutter * 2))
  const panelWidth = Math.max(0, contentWidth - tokens.layout.contentInset * 2)
  const panelLeft = (stageWidth - panelWidth) / 2
  const orbWidth = Math.min(tokens.layout.orbWidth, Math.max(176, contentWidth - tokens.layout.orbSideClearance))
  const orbLeft = (stageWidth - orbWidth) / 2
  const model = buildEarningsDashboardModel(earnings, period)
  const snapshot = buildWorkerEarningsSnapshot(earnings, earningsError, period)
  const transition = useSharedValue(1)
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(transition.value, [0, 1], [0.42, 1]),
    transform: [{ translateY: interpolate(transition.value, [0, 1], [2, 0]) }],
  }))
  const selectPeriod = (nextPeriod: WorkerEarningsPeriod) => {
    if (nextPeriod === period) return
    setPeriod(nextPeriod)
    transition.value = reduceMotion ? 1 : 0
    transition.value = withTiming(1, {
      duration: motionDuration(tokens.motion.fadeInMs, reduceMotion),
      easing: Easing.out(Easing.cubic),
    })
  }
  const onLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width
    if (width > 0 && (width !== widthMeasurement.availableWidth || widthMeasurement.windowWidth !== windowWidth)) {
      setWidthMeasurement({ availableWidth: width, windowWidth })
    }
  }
  const available = amountOrState(earnings, earningsError, model.availableBalance, language)
  const gross = amountOrState(earnings, earningsError, model.grossEarnings, language)
  const cashflow = amountOrState(earnings, earningsError, model.netEarnings, language)
  const transferred = amountOrState(earnings, earningsError, earnings?.withdrawn_total ?? 0, language)
  const expected = amountOrState(earnings, earningsError, model.provisionalAmount, language)
  const fees = amountOrState(earnings, earningsError, model.platformFee, language)
  const comparison = earnings ? model.comparison : { state: 'missing-baseline' } as const
  const comparisonStatus = earnings
    ? undefined
    : earningsError
      ? textByLanguage(language, 'Chưa có dữ liệu kỳ trước', 'Previous-period data unavailable')
      : null
  const lowerContentOffset = tokens.layout.lowerContentOffset
  const orbTop = 118 + dynamicExtra * 0.35
  const cashflowTop = 292 + lowerContentOffset + dynamicExtra * 0.7
  const statsTop = 364 + lowerContentOffset + dynamicExtra * 0.85
  const periodTop = stageHeight - tokens.layout.periodHeight

  useEffect(() => () => cancelAnimation(transition), [transition])

  return (
    <View onLayout={onLayout} style={[styles.root, { minHeight: stageHeight, width: stageWidth }]} testID="worker-v5-earnings-dashboard">
      <View
        pointerEvents="none"
        style={[
          styles.backgroundBleed,
          {
            height: stageHeight,
            top: 0,
            width: stageWidth,
          },
        ]}
        testID="worker-v5-income-dashboard-background-bleed"
      >
        <DashboardBackground reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} />
      </View>
      <View style={[styles.stage, { height: stageHeight, width: stageWidth }]} testID="worker-v5-income-dashboard-stage">
        <View style={[styles.dashboardCard, { height: stageHeight }]} testID="worker-v5-income-dashboard-card">
          <Animated.View style={[styles.dynamicContent, contentStyle]}>
            <View style={styles.hero} testID="worker-v5-income-dashboard-total-hero">
              <Text maxFontSizeMultiplier={2} style={styles.heroLabel}>{textByLanguage(language, 'Tổng thu nhập', 'Total income')}</Text>
              {gross === null ? (
                <View accessibilityLabel={textByLanguage(language, 'Đang tải tổng thu nhập', 'Loading total income')} accessibilityRole="progressbar" accessibilityState={{ busy: true }} style={styles.loadingTotalFrame} testID="worker-v5-earnings-metric-total-value">
                  <LoadingValue style={styles.loadingTotalValue} />
                </View>
              ) : <Text maxFontSizeMultiplier={2} style={styles.totalIncome} testID="worker-v5-earnings-metric-total-value">{gross}</Text>}
              {comparisonStatus === null ? null : <DeltaRow comparison={comparison} language={language} statusCopy={comparisonStatus} />}
            </View>
            <LiquidBalanceOrb amount={available} dynamicExtra={dynamicExtra} language={language} left={orbLeft} onWithdraw={onWithdraw} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} top={orbTop} width={orbWidth} />
            <CashflowCard amount={cashflow} dynamicExtra={dynamicExtra} language={language} left={panelLeft} points={model.visiblePoints} state={snapshot.state} top={cashflowTop} width={panelWidth} />
            <StatsStrip dynamicExtra={dynamicExtra} expected={expected} fees={fees} language={language} left={panelLeft} top={statsTop} transferred={transferred} width={panelWidth} />
          </Animated.View>

          <View
            style={[styles.periodPosition, { left: panelLeft, top: periodTop, width: panelWidth }]}
            testID="worker-v5-income-dashboard-period"
          >
            <WorkerEarningsPeriodSelector language={language} onPeriodChange={selectPeriod} period={period} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} />
          </View>
        </View>
      </View>
    </View>
  )
}

const absoluteFill = { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 } as const

const styles = StyleSheet.create({
  root: { alignItems: 'center', alignSelf: 'center', overflow: 'visible' },
  backgroundBleed: { left: 0, overflow: 'hidden', position: 'absolute' },
  stage: { position: 'relative', zIndex: 1 },
  dashboardCard: { backgroundColor: colors.transparent, overflow: 'hidden', width: '100%' },
  whiteBase: { ...absoluteFill, backgroundColor: colors.page },
  opaqueBase: { backgroundColor: colors.opaqueTint },
  backgroundImage: { ...absoluteFill },
  ambientAura: { height: 220, position: 'absolute', right: -28, top: 154, width: 260 },
  dynamicContent: { ...absoluteFill },
  hero: { alignItems: 'center', left: 0, position: 'absolute', top: 44, width: '100%', zIndex: 4 },
  heroLabel: { color: colors.muted, fontSize: 14, fontWeight: '500', letterSpacing: -0.16, lineHeight: 18, textAlign: 'center' },
  totalIncome: { color: colors.inkStrong, fontSize: 28, fontVariant: ['tabular-nums'], fontWeight: '600', letterSpacing: -0.62, lineHeight: 34, marginTop: 2, maxWidth: 360, textAlign: 'center' },
  deltaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 3, maxWidth: 360, paddingHorizontal: 12 },
  deltaArrow: { borderBottomColor: colors.green, borderBottomWidth: 6, borderLeftColor: colors.transparent, borderLeftWidth: 4, borderRightColor: colors.transparent, borderRightWidth: 4, height: 0, marginRight: 4, width: 0 },
  deltaArrowDown: { borderBottomColor: colors.transparent, borderBottomWidth: 0, borderTopColor: colors.purpleStrong, borderTopWidth: 6 },
  deltaText: { color: colors.greenStrong, fontSize: 12, fontWeight: '600', letterSpacing: -0.04, lineHeight: 16, textAlign: 'center' },
  deltaTextDecrease: { color: colors.purpleStrong },
  orbProximityZone: { borderRadius: 999, position: 'absolute' },
  orbShell: { position: 'absolute', zIndex: 2 },
  orbOpaqueBacking: { backgroundColor: colors.white, borderRadius: 999, bottom: 8, left: 7, position: 'absolute', right: 8, top: 6 },
  orbImage: { ...absoluteFill },
  orbReactionClip: { ...absoluteFill, borderRadius: 999, overflow: 'hidden' },
  orbReactionFrost: { ...absoluteFill },
  orbReactionCaustic: { ...absoluteFill },
  orbReactionSheen: { backgroundColor: colors.white, borderRadius: 999, bottom: 10, left: '50%', opacity: 0, position: 'absolute', top: 8, width: 24 },
  orbReactionRing: { borderColor: colors.greenStrong, borderRadius: 999, borderWidth: 2, bottom: 7, left: 6, position: 'absolute', right: 7, top: 5 },
  orbLabel: { color: colors.muted, fontSize: 14, fontWeight: '600', left: 0, letterSpacing: -0.18, lineHeight: 18, position: 'absolute', right: 0, textAlign: 'center' },
  orbAmountFrame: { position: 'absolute' },
  orbAmount: { color: colors.inkStrong, fontSize: 24, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: -0.82, lineHeight: 30, textAlign: 'center' },
  orbWithdrawHitTarget: { alignItems: 'center', height: 48, justifyContent: 'center', position: 'absolute', width: tokens.layout.orbActionWidth },
  orbWithdrawButton: { alignItems: 'center', borderRadius: 20, height: 38, justifyContent: 'center', overflow: 'hidden', width: tokens.layout.orbActionWidth },
  orbWithdrawText: { color: colors.white, fontSize: 15, fontWeight: '700', letterSpacing: -0.18, lineHeight: 20 },
  cashflowCard: { backgroundColor: colors.contentSurface, borderColor: colors.borderSoft, borderRadius: tokens.layout.panelRadius, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', position: 'absolute' },
  cashflowCopy: { left: 16, maxWidth: '52%', position: 'absolute', top: 13, zIndex: 2 },
  cashflowLabel: { color: colors.muted, fontSize: 13, fontWeight: '600', letterSpacing: 0.12, lineHeight: 16 },
  cashflowAmount: { color: colors.inkValue, fontSize: 20, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: -0.56, lineHeight: 24, marginTop: 4 },
  cashflowEmpty: { color: colors.mutedSoft, fontSize: 10, lineHeight: 13, marginTop: 2 },
  chartFrame: { bottom: 10, height: 44, maxWidth: 160, position: 'absolute', right: 12, width: '40%' },
  statsStrip: { backgroundColor: colors.contentSurface, borderColor: colors.borderSoft, borderRadius: tokens.layout.panelRadius, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', overflow: 'hidden', position: 'absolute' },
  stat: { alignItems: 'center', flex: 1, justifyContent: 'center', minWidth: 0, paddingHorizontal: 6, paddingVertical: 7 },
  statDivider: { borderLeftColor: colors.borderSoft, borderLeftWidth: StyleSheet.hairlineWidth },
  statLabel: { color: colors.mutedSoft, fontSize: 12, fontWeight: '500', letterSpacing: 0.2, lineHeight: 15, textAlign: 'center' },
  statValue: { color: colors.ink, fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: -0.3, lineHeight: 18, marginTop: 4, textAlign: 'center' },
  loadingValue: { backgroundColor: colors.muted, borderRadius: 999, opacity: 0.18 },
  loadingTotalFrame: { alignItems: 'center', height: 28, justifyContent: 'center', marginTop: 1 },
  loadingTotalValue: { height: 18, width: 140 },
  loadingOrbValue: { alignSelf: 'center', height: 16, width: 128 },
  loadingCashflowFrame: { height: 24, justifyContent: 'center', marginTop: 4 },
  loadingCashflowValue: { height: 13, width: 148 },
  loadingStatValue: { height: 10, marginTop: 4, width: 64 },
  periodPosition: { height: tokens.layout.periodHeight, position: 'absolute', zIndex: 6 },
})
