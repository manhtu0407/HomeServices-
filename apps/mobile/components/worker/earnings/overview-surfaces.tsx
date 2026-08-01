import { useRef, useState } from 'react'
import { Image } from 'expo-image'
import {
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type TextProps,
} from 'react-native'
import Svg, { Circle, Defs, LinearGradient, Path } from 'react-native-svg'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { motionTokens } from '@/components/ui/motion-tokens'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import type { AppLanguage } from '@/lib/app-language'
import type { EarningsResponse } from '@/lib/api-types'

import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { formatVndDong, textByLanguage } from '../ui/format'
import {
  buildEarningsDashboardModel,
  WORKER_EARNINGS_PERIODS,
  type WorkerEarningsChartPoint,
  type WorkerEarningsPeriod,
} from './overview-model'
import { styles } from './overview-styles'

const CHART_WIDTH = 340
const CHART_LEFT = 18
const CHART_RIGHT = 322
const CHART_TOP = 20
const CHART_BOTTOM = 112

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function periodLabel(period: WorkerEarningsPeriod, language: AppLanguage) {
  const labels = {
    day: textByLanguage(language, 'Ngày', 'Day'),
    month: textByLanguage(language, 'Tháng', 'Month'),
    week: textByLanguage(language, 'Tuần', 'Week'),
    year: textByLanguage(language, 'Năm', 'Year'),
  }
  return labels[period]
}

function periodTitle(period: WorkerEarningsPeriod, language: AppLanguage) {
  const titles = {
    day: textByLanguage(language, 'Thu nhập hôm nay', 'Income today'),
    month: textByLanguage(language, 'Thu nhập tháng này', 'Income this month'),
    week: textByLanguage(language, 'Thu nhập tuần này', 'Income this week'),
    year: textByLanguage(language, 'Thu nhập năm nay', 'Income this year'),
  }
  return titles[period]
}

function formatCommissionRate(rateBps: number | null | undefined) {
  if (typeof rateBps !== 'number' || !Number.isInteger(rateBps) || rateBps < 0) return null
  const whole = Math.floor(rateBps / 100)
  const decimal = rateBps % 100
  return decimal === 0 ? `${whole}%` : `${whole}.${String(decimal).padStart(2, '0')}%`
}

function displayAmount(
  amount: number,
  language: AppLanguage,
) {
  return formatVndDong(amount, language)
}

function chartGeometry(points: readonly WorkerEarningsChartPoint[]) {
  const maximum = Math.max(...points.map((point) => point.value), 0)
  const denominator = Math.max(points.length - 1, 1)
  const plotted = points.map((point, index) => {
    const x = points.length === 1
      ? CHART_WIDTH / 2
      : CHART_LEFT + index * ((CHART_RIGHT - CHART_LEFT) / denominator)
    const y = maximum <= 0
      ? CHART_BOTTOM
      : CHART_BOTTOM - (point.value / maximum) * (CHART_BOTTOM - CHART_TOP)
    return { x, y }
  })

  if (plotted.length === 0) return { areaPath: '', linePath: '', plotted }
  if (plotted.length === 1) {
    const point = plotted[0]
    return {
      areaPath: '',
      linePath: `M ${point.x - 14} ${point.y} L ${point.x + 14} ${point.y}`,
      plotted,
    }
  }

  const linePath = plotted.slice(1).reduce((path, point, index) => {
    const previous = plotted[index]
    const middleX = (previous.x + point.x) / 2
    return `${path} C ${middleX} ${previous.y}, ${middleX} ${point.y}, ${point.x} ${point.y}`
  }, `M ${plotted[0].x} ${plotted[0].y}`)
  const areaPath = `${linePath} L ${plotted.at(-1)?.x ?? CHART_RIGHT} ${CHART_BOTTOM} L ${plotted[0].x} ${CHART_BOTTOM} Z`

  return { areaPath, linePath, plotted }
}

function chartAxisLabels(
  period: WorkerEarningsPeriod,
  points: readonly WorkerEarningsChartPoint[],
  language: AppLanguage,
) {
  if (period === 'day') return [textByLanguage(language, 'Hôm nay', 'Today')]
  if (period === 'week') {
    return language === 'vi'
      ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  }
  if (period === 'year') {
    const indexes = [0, 2, 4, 6, 8, 10, 11]
    return indexes.map((index) => language === 'vi' ? `T${index + 1}` : new Date(2026, index, 1).toLocaleDateString('en', { month: 'short' }))
  }

  const indexes = [0, 4, 9, 14, 19, 24, Math.max(points.length - 1, 0)]
  return indexes.map((index) => points[index]?.dateKey.slice(-2) ?? '')
}

function WorkerV5EarningsPeriodTabs({
  language,
  onChange,
  reduceMotion,
  reduceTransparency,
  selected,
}: {
  language: AppLanguage
  onChange: (period: WorkerEarningsPeriod) => void
  reduceMotion: boolean
  reduceTransparency: boolean
  selected: WorkerEarningsPeriod
}) {
  const selectedIndex = WORKER_EARNINGS_PERIODS.indexOf(selected)
  const previousIndexRef = useRef(selectedIndex)
  const [railWidth, setRailWidth] = useState(0)
  const lensX = useSharedValue(0)
  const lensScaleX = useSharedValue(1)
  const lensScaleY = useSharedValue(1)
  const lensRadius = useSharedValue(24)
  const lensSkew = useSharedValue(0)
  const lensSheenX = useSharedValue(-84)
  const lensSheenOpacity = useSharedValue(0)
  const shimmerX = useSharedValue(0)
  const causticX = useSharedValue(0)
  const lensWidth = Math.max((railWidth - 8) / WORKER_EARNINGS_PERIODS.length, 0)

  const lensStyle = useAnimatedStyle(() => ({
    borderRadius: lensRadius.value,
    transform: [
      { translateX: lensX.value },
      { scaleX: lensScaleX.value },
      { scaleY: lensScaleY.value },
      { skewX: `${lensSkew.value}deg` },
    ],
    width: lensWidth,
  }), [lensWidth])
  const sheenStyle = useAnimatedStyle(() => ({
    opacity: lensSheenOpacity.value,
    transform: [{ translateX: lensSheenX.value }, { rotate: '-12deg' }],
  }))
  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: reduceTransparency ? 0 : 0.73,
    transform: [{ translateX: shimmerX.value }],
  }), [reduceTransparency])
  const causticStyle = useAnimatedStyle(() => ({
    opacity: reduceTransparency ? 0 : 1,
    transform: [{ translateX: causticX.value }],
  }), [reduceTransparency])

  const moveLens = (nextIndex: number, nextRailWidth: number) => {
    const nextLensWidth = Math.max(
      (nextRailWidth - 8) / WORKER_EARNINGS_PERIODS.length,
      0,
    )
    if (nextLensWidth <= 0) return

    const targetX = nextIndex * nextLensWidth
    const shimmerTarget = (0.18 + nextIndex * 0.22) * nextRailWidth
    const causticTarget = nextIndex * nextLensWidth
    const delta = nextIndex - previousIndexRef.current

    cancelAnimation(lensX)
    cancelAnimation(lensScaleX)
    cancelAnimation(lensScaleY)
    cancelAnimation(lensRadius)
    cancelAnimation(lensSkew)
    cancelAnimation(lensSheenX)
    cancelAnimation(lensSheenOpacity)
    cancelAnimation(shimmerX)
    cancelAnimation(causticX)

    if (reduceMotion || delta === 0) {
      lensX.value = withTiming(targetX, { duration: 120 })
      lensScaleX.value = 1
      lensScaleY.value = 1
      lensRadius.value = 24
      lensSkew.value = 0
      shimmerX.value = withTiming(shimmerTarget, { duration: 160 })
      causticX.value = withTiming(causticTarget, { duration: 160 })
      previousIndexRef.current = nextIndex
      return
    }

    const stretch = Math.min(1.21, 1.08 + Math.abs(delta) * 0.045)
    const direction = Math.sign(delta)
    lensX.value = withSpring(targetX, motionTokens.liquid.pill)
    lensScaleX.value = withSequence(
      withTiming(stretch, { duration: 235 }),
      withSpring(0.965, motionTokens.liquid.press),
      withSpring(1, motionTokens.liquid.press),
    )
    lensScaleY.value = withSequence(
      withTiming(0.91, { duration: 235 }),
      withSpring(1.035, motionTokens.liquid.press),
      withSpring(1, motionTokens.liquid.press),
    )
    lensRadius.value = withSequence(
      withTiming(27, { duration: 235 }),
      withTiming(22, { duration: 190 }),
      withSpring(24, motionTokens.liquid.press),
    )
    lensSkew.value = withSequence(
      withTiming(direction * -2.2, { duration: 235 }),
      withTiming(0, { duration: 325 }),
    )
    lensSheenX.value = -84
    lensSheenOpacity.value = withSequence(
      withTiming(0.84, { duration: 90 }),
      withTiming(0, { duration: 270 }),
    )
    lensSheenX.value = withTiming(84, { duration: 360 })
    shimmerX.value = withTiming(shimmerTarget, { duration: 580 })
    causticX.value = withTiming(causticTarget, { duration: 560 })
    previousIndexRef.current = nextIndex
  }

  const onLayout = (event: LayoutChangeEvent) => {
    const nextRailWidth = event.nativeEvent.layout.width
    setRailWidth(nextRailWidth)
    moveLens(selectedIndex, nextRailWidth)
  }

  const changePeriod = (period: WorkerEarningsPeriod) => {
    const nextIndex = WORKER_EARNINGS_PERIODS.indexOf(period)
    if (nextIndex === selectedIndex) return
    moveLens(nextIndex, railWidth)
    onChange(period)
  }

  return (
    <View
      accessibilityLabel={textByLanguage(language, 'Khoảng thời gian thu nhập', 'Earnings period')}
      accessibilityRole="tablist"
      onLayout={onLayout}
      style={[styles.periodRail, reduceTransparency && styles.periodRailOpaque]}
      testID="worker-v5-earnings-period-tabs"
    >
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="EarningsPeriodRail"
        testID="worker-v5-earnings-period-formula-mint-aura"
      />
      <Animated.View pointerEvents="none" style={[styles.periodShimmer, { width: railWidth * 0.72 }, shimmerStyle]} />
      <Animated.View pointerEvents="none" style={[styles.periodCaustic, { width: lensWidth }, causticStyle]} />
      <View pointerEvents="none" style={styles.periodInnerRefraction} />
      {lensWidth > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.periodLens, lensStyle]} testID="worker-v5-earnings-period-lens">
          <View pointerEvents="none" style={styles.periodLensBloom} />
          <View pointerEvents="none" style={styles.periodLensTopLight} />
          <Animated.View pointerEvents="none" style={[styles.periodLensSheen, sheenStyle]} />
          <View pointerEvents="none" style={styles.periodLensInnerShadow} />
        </Animated.View>
      ) : null}
      {WORKER_EARNINGS_PERIODS.map((period) => {
        const active = period === selected
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={period}
            onPress={() => changePeriod(period)}
            style={({ pressed }) => [styles.periodButton, pressed && !reduceMotion ? styles.periodButtonPressed : null]}
            testID={`worker-v5-earnings-period-${period}`}
          >
            <Text style={[styles.periodLabel, active && styles.periodLabelActive]}>{periodLabel(period, language)}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function WorkerV5EarningsChart({
  language,
  period,
  points,
  state,
}: {
  language: AppLanguage
  period: WorkerEarningsPeriod
  points: readonly WorkerEarningsChartPoint[]
  state: 'pending' | 'empty' | 'ready'
}) {
  const { areaPath, linePath, plotted } = chartGeometry(points)
  const axisLabels = chartAxisLabels(period, points, language)
  const chartLabel = state === 'pending'
    ? textByLanguage(language, 'Đang tải biểu đồ thu nhập', 'Loading earnings chart')
    : state === 'empty'
      ? textByLanguage(language, 'Biểu đồ thu nhập chưa phát sinh trong kỳ đã chọn', 'No income in the selected period')
      : textByLanguage(language, 'Biểu đồ thu nhập sau phí trong kỳ đã chọn', 'Net income chart for the selected period')

  return (
    <View
      accessibilityLabel={chartLabel}
      accessibilityRole="image"
      accessibilityState={{ busy: state === 'pending' }}
      style={styles.chart}
      testID="worker-v5-earnings-chart"
    >
      <View pointerEvents="none" style={styles.chartGrid}>
        <View style={styles.chartGridLine} />
        <View style={styles.chartGridLine} />
        <View style={styles.chartGridLine} />
      </View>
      <Svg height="150" pointerEvents="none" viewBox="0 0 340 150" width="100%">
        <Defs>
          <LinearGradient id="workerEarningsChartArea" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor="#08AF9C" stopOpacity={0.2} />
            <Stop offset="1" stopColor="#08AF9C" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {state === 'ready' && areaPath ? <Path d={areaPath} fill="url(#workerEarningsChartArea)" /> : null}
        {linePath ? (
          <Path
            d={linePath}
            fill="none"
            stroke="#08AF9C"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
          />
        ) : null}
        {state === 'ready' ? plotted.map((point, index) => (
          <Circle
            cx={point.x}
            cy={point.y}
            fill="#FFFFFF"
            key={`${point.x}-${index}`}
            r={index === plotted.length - 1 ? 3.8 : 2.7}
            stroke="#08AF9C"
            strokeWidth={2}
          />
        )) : null}
      </Svg>
      <View pointerEvents="none" style={styles.chartAxis}>
        {axisLabels.map((label, index) => (
          <Text key={`${label}-${index}`} style={styles.chartAxisLabel}>{label}</Text>
        ))}
      </View>
    </View>
  )
}

export function WorkerV5EarningsDashboard({
  earnings,
  language,
  reduceMotion,
  reduceTransparency,
}: {
  earnings: EarningsResponse | null | undefined
  language: AppLanguage
  reduceMotion: boolean
  reduceTransparency: boolean
}) {
  const [period, setPeriod] = useState<WorkerEarningsPeriod>('month')
  const contentOpacity = useSharedValue(1)
  const contentTranslateY = useSharedValue(0)
  const model = buildEarningsDashboardModel(earnings, period)
  const contentMotionStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }))
  const commissionRate = formatCommissionRate(earnings?.current_commission_rate_bps)

  const changePeriod = (nextPeriod: WorkerEarningsPeriod) => {
    if (nextPeriod === period) return
    if (!reduceMotion) {
      contentOpacity.value = withSequence(withTiming(0.48, { duration: 80 }), withTiming(1, { duration: 220 }))
      contentTranslateY.value = withSequence(withTiming(3, { duration: 80 }), withTiming(0, { duration: 220 }))
    }
    setPeriod(nextPeriod)
  }

  const periodAmount = displayAmount(model.netEarnings, language)
  const availableAmount = displayAmount(model.availableBalance, language)
  const metrics = [
    {
      id: 'total',
      label: textByLanguage(language, 'Tổng thu nhập', 'Total income'),
      note: textByLanguage(language, 'Sau phí nền tảng', 'After platform fees'),
      value: periodAmount,
    },
    {
      id: 'withdrawn',
      label: textByLanguage(language, 'Tổng đã rút', 'Total withdrawn'),
      note: textByLanguage(language, 'Chưa có luồng rút tiền', 'Payout rail not available'),
      value: displayAmount(0, language),
    },
    {
      id: 'fee',
      label: textByLanguage(language, 'Phí hoa hồng', 'Commission fee'),
      note: commissionRate
        ? textByLanguage(language, `Mức hiện tại ${commissionRate}`, `Current rate ${commissionRate}`)
        : textByLanguage(language, 'Theo giao dịch đã đối soát', 'From reconciled transactions'),
      value: displayAmount(model.platformFee, language),
    },
    {
      id: 'available',
      label: textByLanguage(language, 'Số dư có thể rút', 'Withdrawable balance'),
      note: textByLanguage(language, 'Số dư đã ghi có trên ứng dụng', 'Balance credited in app'),
      value: availableAmount,
    },
  ]

  return (
    <View style={[styles.dashboard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-earnings-dashboard">
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="EarningsDashboard"
        testID="worker-v5-earnings-dashboard-formula-mint-aura"
      />
      <View style={styles.dashboardHeading}>
        <View style={styles.dashboardHeadingCopy}>
          <Text style={styles.dashboardPeriodTitle}>{periodTitle(period, language)}</Text>
          <Text numberOfLines={2} style={styles.dashboardAmount} testID="worker-v5-earnings-amount">{periodAmount}</Text>
        </View>
        <Text style={styles.dashboardUnit}>{textByLanguage(language, 'Đơn vị: VNĐ', 'Unit: VND')}</Text>
      </View>
      <WorkerV5EarningsPeriodTabs
        language={language}
        onChange={changePeriod}
        reduceMotion={reduceMotion}
        reduceTransparency={reduceTransparency}
        selected={period}
      />
      <Animated.View style={contentMotionStyle}>
        <WorkerV5EarningsChart
          language={language}
          period={period}
          points={model.points}
          state={model.state}
        />
        <View accessibilityLabel={textByLanguage(language, 'Tổng quan thu nhập', 'Earnings summary')} style={styles.metricGrid}>
          {metrics.map((metric, index) => (
            <View
              key={metric.id}
              style={[
                styles.metric,
                index % 2 === 1 && styles.metricRightColumn,
                index >= 2 && styles.metricBottomRow,
              ]}
              testID={`worker-v5-earnings-metric-${metric.id}`}
            >
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text
                numberOfLines={2}
                style={[styles.metricValue, metric.id === 'available' && styles.metricValueAccent]}
                testID={`worker-v5-earnings-metric-${metric.id}-value`}
              >
                {metric.value}
              </Text>
              <Text style={styles.metricNote}>{metric.note}</Text>
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  )
}

function WorkerV5EarningsUtilityRow({
  detail,
  icon,
  last = false,
  onPress,
  testID,
  title,
}: {
  detail: string
  icon: ImageSourcePropType
  last?: boolean
  onPress: () => void
  testID: string
  title: string
}) {
  return (
    <Pressable
      accessibilityLabel={`${title}. ${detail}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.utilityRow,
        last && styles.utilityRowLast,
        pressed && styles.utilityRowPressed,
      ]}
      testID={testID}
    >
      <Image contentFit="contain" source={icon} style={styles.utilityIcon} testID={`${testID}-image`} />
      <View style={styles.utilityCopy}>
        <Text style={styles.utilityTitle}>{title}</Text>
        <Text style={styles.utilityDetail}>{detail}</Text>
      </View>
      <Text aria-hidden style={styles.utilityChevron}>›</Text>
    </Pressable>
  )
}

export function WorkerV5EarningsUtilities({
  accountIcon,
  commissionIcon,
  historyIcon,
  language,
  onOpenAccount,
  onOpenCommission,
  onOpenHistory,
  reduceTransparency,
}: {
  accountIcon: ImageSourcePropType
  commissionIcon: ImageSourcePropType
  historyIcon: ImageSourcePropType
  language: AppLanguage
  onOpenAccount: () => void
  onOpenCommission: () => void
  onOpenHistory: () => void
  reduceTransparency: boolean
}) {
  return (
    <View>
      <Text style={styles.utilitySectionTitle}>{textByLanguage(language, 'Tiện ích', 'Utilities')}</Text>
      <View style={[styles.utilityList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-earnings-utilities">
        <WorkerV5FormulaMintCardAura
          reduceTransparency={reduceTransparency}
          scope="EarningsUtilities"
          testID="worker-v5-earnings-utilities-formula-mint-aura"
        />
        <WorkerV5EarningsUtilityRow
          detail={textByLanguage(language, 'Xem khoản ghi có và đối soát', 'View credits and reconciliation')}
          icon={historyIcon}
          onPress={onOpenHistory}
          testID="worker-v5-earnings-utility-history"
          title={textByLanguage(language, 'Lịch sử giao dịch', 'Transaction history')}
        />
        <WorkerV5EarningsUtilityRow
          detail={textByLanguage(language, 'Xem tài khoản ngân hàng nhận tiền', 'View receiving bank account')}
          icon={accountIcon}
          onPress={onOpenAccount}
          testID="worker-v5-earnings-utility-account"
          title={textByLanguage(language, 'Tài khoản nhận tiền', 'Receiving account')}
        />
        <WorkerV5EarningsUtilityRow
          detail={textByLanguage(language, 'Xem mức phí đang áp dụng', 'View the current fee rate')}
          icon={commissionIcon}
          last
          onPress={onOpenCommission}
          testID="worker-v5-earnings-utility-commission"
          title={textByLanguage(language, 'Chính sách hoa hồng', 'Commission policy')}
        />
      </View>
    </View>
  )
}
