import { useState } from 'react'
import { Image } from 'expo-image'
import {
  Pressable,
  Text as RNText,
  View,
  type TextProps,
} from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import { LiquidNavIcon, type LiquidNavIconName } from '@/components/customer/dock/liquid-nav-icons'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'
import type { AppLanguage } from '@/lib/app-language'
import type { EarningsResponse } from '@/lib/api-types'

import { getReducedTransparencyWorkerTokens, getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'
import { formatVndDong, textByLanguage } from '../ui/format'
import {
  buildEarningsDashboardModel,
  type WorkerEarningsPeriod,
} from './overview-model'
import { WorkerEarningsPeriodSelector, workerEarningsPeriodLabel } from './period-selector'
import { workerSalaryWorkartAssets } from './salary-assets'
import { styles } from './salary-overview-styles'

type WorkerSalaryTokens = ReturnType<typeof getWorkerThemeTokens>
type WorkerV5EarningsUtilityIconName = Extract<LiquidNavIconName, 'activity' | 'document' | 'earnings' | 'withdrawal'>

function Text({ color, style, ...props }: TextProps & { color?: string }) {
  return <RNText {...props} style={[styles.workerCustomerFontText, color ? { color } : null, style]} />
}

function formatCommissionRate(rateBps: number | null | undefined) {
  if (typeof rateBps !== 'number' || !Number.isInteger(rateBps) || rateBps < 0) return null
  const whole = Math.floor(rateBps / 100)
  const decimal = rateBps % 100
  return decimal === 0 ? `${whole}%` : `${whole}.${String(decimal).padStart(2, '0')}%`
}

function surface(tokens: WorkerSalaryTokens) {
  return {
    backgroundColor: tokens.raised,
    borderColor: tokens.border,
  }
}

function amountText(
  earnings: EarningsResponse | null | undefined,
  value: number,
  language: AppLanguage,
  unavailable: string,
) {
  return earnings ? formatVndDong(value, language) : unavailable
}

export function WorkerV5EarningsDataNotice({
  error,
  language,
  onRetry,
  reduceTransparency = false,
  retryTestID,
  testID,
}: {
  error: string | null
  language: AppLanguage
  onRetry: () => Promise<boolean>
  reduceTransparency?: boolean
  retryTestID: string
  testID: string
}) {
  const [retrying, setRetrying] = useState(false)
  const themeMode = useWorkerThemeMode()
  const baseTokens = getWorkerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens

  const retry = async () => {
    if (retrying) return
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  if (!error) {
    return <Text color={tokens.muted} style={styles.dataNoticeLoading} testID={`${testID}-loading`}>
      {textByLanguage(language, 'Đang tải dữ liệu thu nhập…', 'Loading earnings data…')}
    </Text>
  }

  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.dataNotice, surface(tokens)]} testID={testID}>
      <Text color={tokens.text} style={styles.dataNoticeTitle}>{textByLanguage(language, 'Chưa thể tải thông tin thu nhập', 'Earnings data is unavailable')}</Text>
      <Text color={tokens.muted} style={styles.dataNoticeBody}>{textByLanguage(language, 'Kiểm tra kết nối rồi thử lại. Số dư chưa được thay đổi.', 'Check your connection and try again. Your balance has not changed.')}</Text>
      <Pressable
        accessibilityLabel={textByLanguage(language, 'Thử lại tải thông tin thu nhập', 'Retry earnings data')}
        accessibilityRole="button"
        accessibilityState={{ disabled: retrying }}
        disabled={retrying}
        onPress={() => void retry()}
        style={({ pressed }) => [styles.dataNoticeRetry, { borderColor: tokens.borderStrong }, pressed && !retrying ? styles.pressed : null, retrying && styles.dataNoticeRetryDisabled]}
        testID={retryTestID}
      >
        <Text color={tokens.primary} style={styles.dataNoticeRetryLabel}>{retrying
          ? textByLanguage(language, 'Đang thử lại…', 'Retrying…')
          : textByLanguage(language, 'Thử lại', 'Try again')}</Text>
      </Pressable>
    </View>
  )
}

type EarningsMetric = {
  id: 'total' | 'withdrawn' | 'fee'
  label: string
  value: string
}

function MetricCell({ metric, testID, tokens }: { metric: EarningsMetric; testID?: string; tokens: WorkerSalaryTokens }) {
  return (
    <View accessibilityLabel={`${metric.label}: ${metric.value}`} style={styles.metricCell} testID={`worker-v5-earnings-metric-${metric.id}`}>
      <Text color={tokens.muted} numberOfLines={2} style={styles.metricLabel}>{metric.label}</Text>
      <Text color={tokens.text} numberOfLines={1} style={styles.metricValue} testID={testID ?? `worker-v5-earnings-metric-${metric.id}-value`}>
        {metric.value}
      </Text>
    </View>
  )
}

function MoneyRow({ label, testID, tokens, value }: { label: string; testID: string; tokens: WorkerSalaryTokens; value: string }) {
  return (
    <View style={styles.moneyRow}>
      <Text color={tokens.muted} style={styles.moneyLabel}>{label}</Text>
      <Text color={tokens.text} numberOfLines={1} style={styles.moneyValue} testID={testID}>{value}</Text>
    </View>
  )
}

function EarningsChart({
  language,
  model,
  period,
  tokens,
}: {
  language: AppLanguage
  model: ReturnType<typeof buildEarningsDashboardModel>
  period: WorkerEarningsPeriod
  tokens: WorkerSalaryTokens
}) {
  const points = model.visiblePoints
  const maximum = Math.max(...points.map((point) => point.value), 0)
  const isReady = model.state === 'ready' && maximum > 0
  const chartLabel = model.state === 'pending'
    ? textByLanguage(language, 'Đang tải biểu đồ thu nhập', 'Loading earnings chart')
    : isReady
      ? textByLanguage(language, 'Biểu đồ thu nhập sau phí', 'Net income chart')
      : textByLanguage(language, 'Biểu đồ thu nhập chưa phát sinh trong kỳ đã chọn', 'No chart data for this period')

  return (
    <View accessibilityLabel={chartLabel} accessibilityRole="image" accessibilityState={{ busy: model.state === 'pending' }} style={[styles.chartCard, surface(tokens)]} testID="worker-v5-earnings-chart">
      <View style={styles.sectionHeader}>
        <Text color={tokens.text} style={styles.cardTitle}>{textByLanguage(language, 'Dòng tiền sau phí', 'Cash flow after fees')}</Text>
        <Text color={tokens.muted} style={styles.sectionMeta}>{workerEarningsPeriodLabel(period, language)}</Text>
      </View>
      {isReady ? (
        <View style={styles.chartBars}>
          {points.map((point) => (
            <View key={point.dateKey} style={styles.chartBarColumn}>
              <View style={[styles.chartBarTrack, { backgroundColor: tokens.progressTrack }]}>
                <View style={[styles.chartBar, { backgroundColor: tokens.primary, height: Math.max(8, Math.round((point.value / maximum) * 88)) }]} />
              </View>
              <Text color={tokens.muted} style={styles.chartBarLabel}>{period === 'year' ? point.dateKey.slice(5, 7) : point.dateKey.slice(-2)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.chartEmpty} testID="worker-v5-earnings-chart-empty">
          <Text color={tokens.muted} style={styles.chartEmptyTitle}>{model.state === 'pending' ? textByLanguage(language, 'Đang tải dữ liệu…', 'Loading data…') : textByLanguage(language, 'Chưa phát sinh thu nhập trong kỳ đã chọn', 'No income in the selected period')}</Text>
          <View style={[styles.emptyRule, { backgroundColor: tokens.progressTrack }]} />
        </View>
      )}
    </View>
  )
}

function SalaryHeroWorkartWash({ surfaceColor }: { surfaceColor: string }) {
  return (
    <Svg height="100%" style={styles.heroWorkartWash} viewBox="0 0 100 120" width={112}>
      <Defs>
        <LinearGradient id="worker-salary-production-hero-wash" x1="0%" x2="100%" y1="0%" y2="0%">
          <Stop offset="0%" stopColor={surfaceColor} stopOpacity={0.98} />
          <Stop offset="48%" stopColor={surfaceColor} stopOpacity={0.76} />
          <Stop offset="78%" stopColor={surfaceColor} stopOpacity={0.24} />
          <Stop offset="100%" stopColor={surfaceColor} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect fill="url(#worker-salary-production-hero-wash)" height="120" width="100" />
    </Svg>
  )
}

export function WorkerV5EarningsDashboard({
  earningsError,
  earnings,
  initialPeriod = 'month',
  language,
  onRetry,
  reduceMotion,
  reduceTransparency,
}: {
  earnings: EarningsResponse | null | undefined
  earningsError: string | null
  initialPeriod?: WorkerEarningsPeriod
  language: AppLanguage
  onRetry: () => Promise<boolean>
  reduceMotion: boolean
  reduceTransparency: boolean
}) {
  const [period, setPeriod] = useState<WorkerEarningsPeriod>(initialPeriod)
  const themeMode = useWorkerThemeMode()
  const baseTokens = getWorkerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens
  const model = buildEarningsDashboardModel(earnings, period)
  const unavailable = textByLanguage(language, earningsError ? 'Chưa có dữ liệu' : 'Đang tải…', earningsError ? 'Data unavailable' : 'Loading…')
  const availableAmount = amountText(earnings, model.availableBalance, language, unavailable)
  const metrics: EarningsMetric[] = [
    { id: 'total', label: textByLanguage(language, 'Tổng thu nhập', 'Total income'), value: amountText(earnings, model.netEarnings, language, unavailable) },
    { id: 'withdrawn', label: textByLanguage(language, 'Đã rút', 'Withdrawn'), value: earnings ? formatVndDong(earnings.withdrawn_total, language) : unavailable },
    { id: 'fee', label: textByLanguage(language, 'Phí hoa hồng', 'Commission fee'), value: amountText(earnings, model.platformFee, language, unavailable) },
  ]

  return (
    <View style={styles.dashboard} testID="worker-v5-earnings-dashboard">
      <View style={[styles.heroCard, surface(tokens)]} testID="worker-v5-earnings-hero">
        <View style={styles.heroCopy}>
          <Text color={tokens.muted} style={styles.eyebrow}>{textByLanguage(language, 'Số dư có thể rút', 'Withdrawable balance')}</Text>
          <View testID="worker-v5-earnings-metric-available-value">
            <Text color={tokens.text} numberOfLines={1} style={styles.heroValue} testID="worker-v5-earnings-amount">{availableAmount}</Text>
          </View>
          <Text color={tokens.muted} numberOfLines={2} style={styles.heroMeta}>
            {earnings
              ? textByLanguage(language, `${earnings.total_jobs_paid} công việc đã ghi nhận`, `${earnings.total_jobs_paid} recorded jobs`)
              : textByLanguage(language, 'Đang đồng bộ dữ liệu thật', 'Syncing recorded data')}
          </Text>
        </View>
        <Image
          accessibilityIgnoresInvertColors
          contentFit="cover"
          contentPosition="right center"
          source={workerSalaryWorkartAssets.hero}
          style={styles.heroWorkart}
          testID="worker-v5-earnings-hero-workart"
        />
        <SalaryHeroWorkartWash surfaceColor={tokens.raised} />
      </View>

      <View style={styles.periodSection}>
        <View style={styles.sectionHeader}>
          <Text color={tokens.text} style={styles.sectionTitle}>{textByLanguage(language, 'Thu nhập theo kỳ', 'Income by period')}</Text>
          <Text color={tokens.muted} style={styles.sectionMeta}>{workerEarningsPeriodLabel(period, language)}</Text>
        </View>
        {!earnings || earningsError ? <WorkerV5EarningsDataNotice
          error={earningsError}
          language={language}
          onRetry={onRetry}
          reduceTransparency={reduceTransparency}
          retryTestID="worker-v5-earnings-retry"
          testID="worker-v5-earnings-error"
        /> : null}
        <WorkerEarningsPeriodSelector
          language={language}
          onPeriodChange={setPeriod}
          period={period}
          reduceMotion={reduceMotion}
          reduceTransparency={reduceTransparency}
        />
        <EarningsChart language={language} model={!earnings && earningsError ? { ...model, state: 'empty' } : model} period={period} tokens={tokens} />
      </View>

      <View accessibilityLabel={textByLanguage(language, 'Tóm tắt thu nhập', 'Earnings summary')} style={[styles.card, surface(tokens)]} testID="worker-v5-earnings-summary">
        <View style={styles.sectionHeader}>
          <Text color={tokens.text} style={styles.cardTitle}>{textByLanguage(language, 'Tóm tắt kỳ này', 'This period')}</Text>
          <Text color={tokens.muted} style={styles.sectionMeta}>{workerEarningsPeriodLabel(period, language)}</Text>
        </View>
        <View style={[styles.metricGrid, { borderColor: tokens.border }]}>
          {metrics.map((metric) => <MetricCell key={metric.id} metric={metric} testID={metric.id === 'total' ? 'worker-v5-earnings-metric-total-value' : undefined} tokens={tokens} />)}
        </View>
        <View style={styles.detailRows}>
          <MoneyRow label={textByLanguage(language, 'Thu nhập tạm ghi nhận', 'Provisional income')} testID="worker-v5-earnings-metric-pending-value" tokens={tokens} value={earnings ? formatVndDong(model.provisionalAmount, language) : unavailable} />
          <MoneyRow label={textByLanguage(language, 'Tiền đang giữ 24 giờ', 'Funds held for 24 hours')} testID="worker-v5-earnings-metric-hold-value" tokens={tokens} value={earnings ? formatVndDong(earnings.on_hold_amount, language) : unavailable} />
          <MoneyRow label={textByLanguage(language, 'Hoa hồng còn thiếu', 'Commission still due')} testID="worker-v5-earnings-metric-commission-due-value" tokens={tokens} value={earnings ? formatVndDong(earnings.cash_commission_due_total, language) : unavailable} />
        </View>
      </View>
    </View>
  )
}

function WorkerV5EarningsUtilityRow({
  detail,
  icon,
  onPress,
  reduceMotion,
  testID,
  title,
  tokens,
}: {
  detail: string
  icon: WorkerV5EarningsUtilityIconName
  onPress: () => void
  reduceMotion: boolean
  testID: string
  title: string
  tokens: WorkerSalaryTokens
}) {
  return (
    <Pressable
      accessibilityLabel={`${title}. ${detail}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.utilityRow, pressed && !reduceMotion ? styles.pressed : null]}
      testID={testID}
    >
      <View style={[styles.iconTile, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
        <LiquidNavIcon color={tokens.primary} name={icon} selected size={20} testID={`${testID}-icon`} />
      </View>
      <View style={styles.utilityCopy}>
        <Text color={tokens.text} style={styles.utilityTitle}>{title}</Text>
        <Text color={tokens.muted} numberOfLines={1} style={styles.utilityDetail}>{detail}</Text>
      </View>
      <Text color={tokens.primary} style={styles.utilityChevron}>›</Text>
    </Pressable>
  )
}

export function WorkerV5EarningsWithdrawalArea({
  language,
  onOpen,
  reduceMotion,
}: {
  language: AppLanguage
  onOpen: () => void
  reduceMotion: boolean
}) {
  const themeMode = useWorkerThemeMode()
  const tokens = getWorkerThemeTokens(themeMode)
  return (
    <View testID="worker-v5-earnings-withdrawal-area">
      <Pressable
        accessibilityLabel={textByLanguage(language, 'Tạo yêu cầu rút tiền', 'Create withdrawal request')}
        accessibilityRole="button"
        accessibilityState={{ disabled: false }}
        onPress={onOpen}
        style={({ pressed }) => [styles.primaryAction, { backgroundColor: tokens.primary }, pressed && !reduceMotion ? styles.pressed : null]}
        testID="worker-v5-earnings-withdraw-action"
      >
        <Text color={tokens.primaryText} style={styles.primaryActionLabel}>{textByLanguage(language, 'Tạo yêu cầu rút tiền', 'Create withdrawal request')}</Text>
      </Pressable>
    </View>
  )
}

export function WorkerV5EarningsUtilities({
  accountIcon,
  commissionIcon,
  commissionRateBps,
  historyIcon,
  language,
  onOpenAccount,
  onOpenCommission,
  onOpenHistory,
  reduceMotion,
  reduceTransparency,
}: {
  accountIcon: WorkerV5EarningsUtilityIconName
  commissionIcon: WorkerV5EarningsUtilityIconName
  commissionRateBps?: number | null
  historyIcon: WorkerV5EarningsUtilityIconName
  language: AppLanguage
  onOpenAccount: () => void
  onOpenCommission: () => void
  onOpenHistory: () => void
  reduceMotion: boolean
  reduceTransparency: boolean
}) {
  const themeMode = useWorkerThemeMode()
  const baseTokens = getWorkerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens
  const commissionRate = formatCommissionRate(commissionRateBps)

  return (
    <View>
      <Text color={tokens.text} style={styles.utilitySectionTitle}>{textByLanguage(language, 'Quản lý thu nhập', 'Manage income')}</Text>
      <View style={[styles.utilityCard, surface(tokens)]} testID="worker-v5-earnings-utilities">
        <WorkerV5EarningsUtilityRow detail={textByLanguage(language, 'Khoản ghi có và đối soát', 'Credits and reconciliation')} icon={historyIcon} onPress={onOpenHistory} reduceMotion={reduceMotion} testID="worker-v5-earnings-utility-history" title={textByLanguage(language, 'Lịch sử giao dịch', 'Transaction history')} tokens={tokens} />
        <View style={[styles.divider, { backgroundColor: tokens.border }]} />
        <WorkerV5EarningsUtilityRow detail={textByLanguage(language, 'Nơi nhận tiền của bạn', 'Where you receive funds')} icon={accountIcon} onPress={onOpenAccount} reduceMotion={reduceMotion} testID="worker-v5-earnings-utility-account" title={textByLanguage(language, 'Tài khoản nhận tiền', 'Receiving account')} tokens={tokens} />
        <View style={[styles.divider, { backgroundColor: tokens.border }]} />
        <WorkerV5EarningsUtilityRow detail={commissionRate ? textByLanguage(language, `Mức hiện tại ${commissionRate}`, `Current rate ${commissionRate}`) : textByLanguage(language, 'Theo giao dịch', 'Per transaction')} icon={commissionIcon} onPress={onOpenCommission} reduceMotion={reduceMotion} testID="worker-v5-earnings-utility-commission" title={textByLanguage(language, 'Chính sách hoa hồng', 'Commission policy')} tokens={tokens} />
      </View>
    </View>
  )
}
