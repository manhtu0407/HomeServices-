import { formatWorkerMoney, isAcceptedLocalWorkerDeal } from './chat-helpers'
import { styles } from './styles'
import { workerEarningsBarSurface, workerEarningsChartSurface, workerEarningsChromeBottomEdge, workerEarningsChromeCrispShell, workerEarningsChromeInnerInset, workerEarningsChromeRefraction, workerEarningsChromeTopEdge, workerEarningsChromeWash, workerEarningsLedgerSurface, workerEarningsMiniSurface, workerEarningsRowSurface, workerEarningsTrendSurface } from './surface-styles/glass-earnings'
import { workerHasReducedGlass } from './theme'
import { type WorkerEarningsChromeVariant, type WorkerIconName, type WorkerLanguageMode } from './types'
import { GlassSurface } from '@/components/ui/glass-surface'
import { type EarningsResponse } from '@/lib/api-types'
import { appCopy, localizedStatusLabel } from '@/lib/app-language'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { Text, View } from 'react-native'
import { WorkerFrame } from './shell'
import { WorkerImageIcon, WorkerUtilityIcon, getWorkerVisibleDeal, useWorkerFrameCopy, useWorkerUi } from './ui'
import type { WorkerImageIconName } from './ui'

const WORKER_NO_FAKE_PAYMENT_DATA = 'WORKER_NO_FAKE_PAYMENT_DATA: worker-no-fake-payment-data'

const workerEarningsImageIcons: Partial<Record<WorkerIconName, WorkerImageIconName>> = {
  bank: 'utilityEarningsWallet',
  document: 'utilityEarningsLedger',
  money: 'utilityEarningsWallet',
}

export function WorkerEarningsSurface() {
  const copy = useWorkerFrameCopy()

  return (
    <WorkerFrame
      active="earnings"
      eyebrow={copy.earnings.eyebrow}
      subtitle={copy.earnings.subtitle}
      title={copy.earnings.title}
      testID="worker-earnings-surface"
    >
      <WorkerEarningsHero />
      <WorkerEarningsSummary />
      <WorkerEarningsLedger />
    </WorkerFrame>
  )
}

function WorkerEarningsHero() {
  const { workerEarnings } = useFrontendWorkflow()

  return (
    <View style={styles.earningsHeroWrap} testID="worker-earnings-summary">
      <WorkerEarningsTrend />
      {workerEarnings ? <View style={styles.hiddenMarker} testID="worker-earnings-real-api-data" /> : null}
      <View style={styles.hiddenMarker} testID={WORKER_NO_FAKE_PAYMENT_DATA} />
    </View>
  )
}

function WorkerEarningsMaterialChrome({
  testID,
  variant,
}: {
  testID: string
  variant: WorkerEarningsChromeVariant
}) {
  const { tokens } = useWorkerUi()

  if (workerHasReducedGlass(tokens)) {
    return <View pointerEvents="none" style={styles.hiddenMarker} testID={`${testID}-opaque`} />
  }

  return (
    <>
      <View pointerEvents="none" style={[styles.workerEarningsChromeWash, workerEarningsChromeWash(tokens, variant)]} />
      <View pointerEvents="none" style={[styles.workerEarningsChromeRefraction, workerEarningsChromeRefraction(tokens, variant)]} />
      <View pointerEvents="none" style={[styles.workerEarningsChromeCrispShell, workerEarningsChromeCrispShell(tokens, variant)]} testID={testID} />
      <View pointerEvents="none" style={[styles.workerEarningsChromeInnerInset, workerEarningsChromeInnerInset(tokens, variant)]} />
      <View pointerEvents="none" style={[styles.workerEarningsChromeTopEdge, workerEarningsChromeTopEdge(tokens)]} />
      <View pointerEvents="none" style={[styles.workerEarningsChromeBottomEdge, workerEarningsChromeBottomEdge(tokens)]} />
    </>
  )
}

function WorkerEarningsLedger() {
  const { copy, language, tokens } = useWorkerUi()
  const { selectors, state, workerEarnings } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const hasSettledEarnings = hasWorkerSettledEarnings(workerEarnings)
  const payoutAccountTitle = language === 'en' ? 'Payout account' : 'Tài khoản nhận tiền'
  const rows = hasSettledEarnings && workerEarnings
    ? [
        [copy.earnings.ledgerTitle, `${workerEarnings.total_jobs_paid} ${language === 'en' ? 'items' : 'mục'}`],
        [language === 'en' ? 'Gross earnings' : 'Tổng trước phí', formatWorkerMoney(workerEarnings.gross_earnings, language)],
        [language === 'en' ? 'Net earnings' : 'Thực nhận', formatWorkerMoney(workerEarnings.net_earnings, language)],
        [payoutAccountTitle, appCopy[language].common.noData],
      ]
    : acceptedDeal
    ? [
        [copy.earnings.ledgerTitle, localizedStatusLabel(selectors.currentStatus, language)],
        [payoutAccountTitle, appCopy[language].common.noData],
      ]
    : copy.earnings.rows

  return (
    <View style={[styles.earningsLedgerCard, workerEarningsLedgerSurface(tokens)]} testID="worker-earnings-ledger">
      <WorkerEarningsMaterialChrome testID="worker-earnings-ledger-crisp-shell" variant="ledger" />
      {rows.map((row, index) => (
        <EarningsLedgerRow key={row[0]} icon={earningsLedgerIcon(row[0], copy.earnings.ledgerTitle, payoutAccountTitle, index)} title={row[0]} meta={row[1]} />
      ))}
    </View>
  )
}

function earningsLedgerIcon(title: string, ledgerTitle: string, payoutAccountTitle: string, index: number): WorkerIconName {
  if (title === ledgerTitle) return 'document'
  if (title === payoutAccountTitle) return 'bank'
  return index === 1 ? 'money' : 'document'
}

function WorkerEarningsTrend() {
  const { copy, language, tokens } = useWorkerUi()
  const { workerEarnings } = useFrontendWorkflow()
  const realDays = buildWorkerEarningsDays(language, workerEarnings)
  const maxDailyValue = Math.max(...realDays.map((day) => day.netEarnings), 0)
  const hasDailyEarnings = maxDailyValue > 0
  const days = hasDailyEarnings ? realDays : buildWorkerEmptyEarningsDays(language)
  // The empty earnings chart must not fabricate a trend: varying bar heights
  // when backend earnings = 0 read as real data — a RULES.md #8 fake-data
  // violation. With no settled earning, all bars sit at a uniform flat
  // baseline (clearly "no data") and an explicit empty label is shown.
  const EMPTY_FLAT_BAR_HEIGHT = 10

  return (
    <GlassSurface material="liquid" mode={tokens.mode} style={[styles.earningsTrendCard, workerEarningsTrendSurface(tokens)]} testID="worker-earnings-seven-day-chart" variant="hero">
      <WorkerEarningsMaterialChrome testID="worker-earnings-hero-crisp-shell" variant="hero" />
      <View pointerEvents="none" style={[styles.earningsTrendGlow, { backgroundColor: tokens.primary }]} />
      <View style={[styles.earningsChartShell, workerEarningsChartSurface(tokens)]} testID="worker-earnings-chart-shell">
        <WorkerEarningsMaterialChrome testID="worker-earnings-chart-crisp-shell" variant="chart" />
        <View style={styles.earningsChartEmptyState} testID="worker-earnings-chart-empty-state">
          <View style={styles.earningsBarRail} testID={hasDailyEarnings ? 'worker-earnings-real-bar-shell' : 'worker-earnings-empty-bar-shell'}>
            {days.map((day) => (
              <View
                accessibilityLabel={hasDailyEarnings ? `${day.label}: ${formatWorkerMoney(day.netEarnings, language)}` : `${day.label}: ${copy.earnings.chartEmpty}`}
                key={day.date}
                style={[
                  styles.earningsEmptyBar,
                  workerEarningsBarSurface(tokens, hasDailyEarnings),
                  {
                    height: hasDailyEarnings
                      ? Math.max(30, Math.round(42 + (day.netEarnings / maxDailyValue) * 76))
                      : EMPTY_FLAT_BAR_HEIGHT,
                    opacity: hasDailyEarnings ? 0.98 : 0.4,
                  },
                ]}
              />
            ))}
          </View>
          {!hasDailyEarnings ? (
            <Text
              style={[styles.earningsChartEmptyLabel, { color: tokens.muted }]}
              numberOfLines={1}
              testID="worker-earnings-chart-empty-label"
            >
              {copy.earnings.chartEmpty}
            </Text>
          ) : null}
        </View>
        <View style={styles.earningsDayRail}>
          {days.map((day) => (
            <Text key={day.date} style={[styles.earningsDayLabel, { color: tokens.muted }]} numberOfLines={1}>
              {day.label}
            </Text>
          ))}
        </View>
      </View>
    </GlassSurface>
  )
}

function WorkerEarningsSummary() {
  const { copy, language, tokens } = useWorkerUi()
  const { workerEarnings } = useFrontendWorkflow()
  const empty = copy.earnings.noReconciliation
  const hasSettledEarnings = hasWorkerSettledEarnings(workerEarnings)
  const todayNet = getTodayWorkerNetEarnings(workerEarnings)
  const todayLabel = copy.earnings.today
  const monthLabel = copy.earnings.month
  const todayValue = todayNet > 0 ? formatWorkerMoney(todayNet, language) : empty
  const monthValue = hasSettledEarnings && workerEarnings ? formatWorkerMoney(workerEarnings.net_earnings, language) : empty

  return (
    <View style={styles.earningsSummaryGrid} testID="worker-earnings-day-month-summary">
      <View style={[styles.earningsSummaryCell, workerEarningsMiniSurface(tokens)]} testID="worker-earnings-today-cell">
        <WorkerEarningsMaterialChrome testID="worker-earnings-summary-crisp-shell" variant="cell" />
        <Text style={[styles.earningsSummaryLabel, { color: tokens.subtle }]} numberOfLines={1}>
          {todayLabel}
        </Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.88} style={[styles.earningsSummaryValue, { color: tokens.ink }]} numberOfLines={1}>
          {todayValue}
        </Text>
        <Text style={[styles.earningsSummaryHint, { color: tokens.muted }]} numberOfLines={1}>
          {copy.earnings.summaryHint}
        </Text>
      </View>
      <View style={[styles.earningsSummaryCell, workerEarningsMiniSurface(tokens)]} testID="worker-earnings-month-cell">
        <WorkerEarningsMaterialChrome testID="worker-earnings-summary-crisp-shell" variant="cell" />
        <Text style={[styles.earningsSummaryLabel, { color: tokens.subtle }]} numberOfLines={1}>
          {monthLabel}
        </Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.88} style={[styles.earningsSummaryValue, { color: tokens.ink }]} numberOfLines={1}>
          {monthValue}
        </Text>
        <Text style={[styles.earningsSummaryHint, { color: tokens.muted }]} numberOfLines={1}>
          {copy.earnings.summaryHint}
        </Text>
      </View>
    </View>
  )
}

function hasWorkerSettledEarnings(workerEarnings: ReturnType<typeof useFrontendWorkflow>['workerEarnings']) {
  return Boolean(workerEarnings && (
    workerEarnings.total_jobs_paid > 0 ||
    workerEarnings.gross_earnings > 0 ||
    workerEarnings.net_earnings > 0
  ))
}

function buildWorkerEarningsDays(language: WorkerLanguageMode, workerEarnings: EarningsResponse | null, referenceDate = new Date()) {
  const dailyByDate = new Map((workerEarnings?.daily_earnings ?? []).map((day) => [day.date, day]))
  const labels = language === 'en'
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(referenceDate)
    date.setDate(referenceDate.getDate() - (6 - index))
    const dateKey = workerDateKey(date)
    const bucket = dailyByDate.get(dateKey)
    return {
      date: dateKey,
      label: labels[date.getDay()],
      netEarnings: bucket?.net_earnings ?? 0,
      paidJobCount: bucket?.paid_job_count ?? 0,
    }
  })
}

function buildWorkerEmptyEarningsDays(language: WorkerLanguageMode) {
  const labels = language === 'en'
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
  return labels.map((label, index) => ({
    date: `empty-${index}`,
    label,
    netEarnings: 0,
    paidJobCount: 0,
  }))
}

function getTodayWorkerNetEarnings(workerEarnings: EarningsResponse | null, referenceDate = new Date()) {
  const todayKey = workerDateKey(referenceDate)
  return workerEarnings?.daily_earnings?.find((day) => day.date === todayKey)?.net_earnings ?? 0
}

function workerDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function EarningsLedgerRow({ icon, meta, title }: { icon: WorkerIconName; meta: string; title: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.earningsListRow, workerEarningsRowSurface(tokens)]}>
      <View style={styles.earningsListIcon}>
        <WorkerEarningsLedgerIcon icon={icon} />
      </View>
      <Text style={[styles.earningsListTitle, { color: tokens.ink }]} numberOfLines={1}>
        {title}
      </Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.86} style={[styles.earningsListMeta, { color: tokens.muted }]} numberOfLines={1}>
        {meta}
      </Text>
    </View>
  )
}

function WorkerEarningsLedgerIcon({ icon }: { icon: WorkerIconName }) {
  const imageIcon = workerEarningsImageIcons[icon]

  if (imageIcon) {
    return <WorkerImageIcon frameSize={34} name={imageIcon} size={34} style={styles.earningsListImageIcon} />
  }

  return <WorkerUtilityIcon frameSize={34} icon={icon} size={34} small />
}
