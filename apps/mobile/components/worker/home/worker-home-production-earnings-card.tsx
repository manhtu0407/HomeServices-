import { LinearGradient } from 'expo-linear-gradient'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Circle, Polyline } from 'react-native-svg'

import {
  buildWorkerEarningsSnapshot,
  WORKER_EARNINGS_PERIODS,
  type WorkerEarningsPeriod,
} from '../earnings/overview-model'
import { workerEarningsPeriodLabel } from '../earnings/period-label'
import { formatVndDong, textByLanguage } from '../ui/format'
import type { AppLanguage } from '@/lib/app-language'
import type { EarningsResponse } from '@/lib/api-types'
import { WorkerHomeProductionIcon } from './worker-home-production-icon'

function pointLabel(dateKey: string, period: WorkerEarningsPeriod, language: AppLanguage) {
  if (period === 'year') return textByLanguage(language, `T${Number(dateKey.slice(5, 7))}`, `M${Number(dateKey.slice(5, 7))}`)
  if (period === 'day') return textByLanguage(language, 'Nay', 'Today')
  return dateKey.slice(-2)
}

function EarningsChart({
  language,
  period,
  points,
  themeMode,
}: {
  language: AppLanguage
  period: WorkerEarningsPeriod
  points: ReturnType<typeof buildWorkerEarningsSnapshot>['points']
  themeMode: 'dark' | 'light'
}) {
  const maximum = Math.max(...points.map((point) => point.value), 0)
  const ready = maximum > 0
  const plot = points.map((point, index) => ({
    ...point,
    x: points.length <= 1 ? 140 : 18 + index * (244 / (points.length - 1)),
    y: ready ? 72 - (point.value / maximum) * 50 : 72,
  }))
  const latest = points.at(-1)
  const summary = ready
    ? textByLanguage(language, `Biểu đồ thu nhập ròng có ${points.length} mốc. Mốc gần nhất ${formatVndDong(latest?.value ?? 0, language)}.`, `Net earnings chart with ${points.length} buckets. Latest ${formatVndDong(latest?.value ?? 0, language)}.`)
    : textByLanguage(language, 'Chưa phát sinh thu nhập trong kỳ đã chọn.', 'No income in the selected period.')

  return (
    <View accessibilityLabel={summary} accessibilityRole="image" style={styles.chart} testID="worker-home-production-income-chart">
      {ready ? (
        <>
          <View style={styles.chartPlot}>
            <Svg height={82} pointerEvents="none" style={styles.chartLine} viewBox="0 0 280 82" width="100%">
              <Polyline fill="none" points={plot.map((point) => `${point.x},${point.y}`).join(' ')} stroke="#68CFC0" strokeWidth={2} />
              {plot.map((point, index) => (
                <Circle
                  cx={point.x}
                  cy={point.y}
                  fill={index === plot.length - 1 ? (themeMode === 'dark' ? '#17312D' : '#FFFFFF') : '#55C9B7'}
                  key={point.dateKey}
                  r={index === plot.length - 1 ? 4 : 2.5}
                  stroke={index === plot.length - 1 ? '#0FAF93' : 'none'}
                  strokeWidth={index === plot.length - 1 ? 2 : 0}
                />
              ))}
            </Svg>
            <View style={styles.barRow}>
              {points.map((point) => (
                <View key={point.dateKey} style={styles.barColumn}>
                  <LinearGradient colors={['#94DDD2', themeMode === 'dark' ? '#21463F' : '#EFF9F7']} style={[styles.bar, { height: Math.max(7, Math.round((point.value / maximum) * 52)) }]} />
                  <Text style={[styles.axisLabel, themeMode === 'dark' && styles.mutedDark]}>{pointLabel(point.dateKey, period, language)}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.valueBadge} testID="worker-home-production-income-value-badge">
            <Text style={styles.valueBadgeText}>{formatVndDong(latest?.value ?? 0, language)}</Text>
          </View>
        </>
      ) : (
        <View style={styles.chartEmpty}>
          <Text style={[styles.chartEmptyText, themeMode === 'dark' && styles.mutedDark]}>{textByLanguage(language, 'Chưa phát sinh trong kỳ này', 'No income in this period')}</Text>
          <View style={[styles.chartEmptyRule, themeMode === 'dark' && styles.ruleDark]} />
        </View>
      )}
    </View>
  )
}

function PeriodPicker({
  language,
  onChange,
  period,
  reduceMotion,
  themeMode,
}: {
  language: AppLanguage
  onChange: (period: WorkerEarningsPeriod) => void
  period: WorkerEarningsPeriod
  reduceMotion: boolean
  themeMode: 'dark' | 'light'
}) {
  const [expanded, setExpanded] = useState(false)
  const label = workerEarningsPeriodLabel(period, language)

  if (!expanded) {
    return (
      <Pressable
        accessibilityHint={textByLanguage(language, 'Mở bốn kỳ thu nhập', 'Open four earnings periods')}
        accessibilityLabel={textByLanguage(language, `Kỳ thu nhập: ${label}`, `Earnings period: ${label}`)}
        accessibilityRole="button"
        accessibilityState={{ expanded: false }}
        hitSlop={11}
        onPress={() => setExpanded(true)}
        style={({ pressed }) => [styles.periodTrigger, themeMode === 'dark' && styles.periodTriggerDark, pressed && !reduceMotion && styles.pressed]}
        testID="worker-home-production-income-period-trigger"
      >
        <Text style={[styles.periodTriggerLabel, themeMode === 'dark' && styles.textDark]}>{label}</Text>
        <WorkerHomeProductionIcon color={themeMode === 'dark' ? '#AAC0BC' : '#5B6B7C'} name="chevron-down" size={10} />
      </Pressable>
    )
  }

  return (
    <View
      accessibilityLabel={textByLanguage(language, 'Chọn kỳ thu nhập', 'Select earnings period')}
      accessibilityRole="tablist"
      style={[styles.periodMenu, themeMode === 'dark' && styles.periodMenuDark]}
      testID="worker-home-production-income-period-menu"
    >
      {WORKER_EARNINGS_PERIODS.map((item) => {
        const selected = item === period
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={item}
            onPress={() => {
              onChange(item)
              setExpanded(false)
            }}
            style={[styles.periodOption, selected && styles.periodOptionSelected]}
            testID={`worker-home-production-income-period-${item}`}
          >
            <Text style={[styles.periodOptionLabel, themeMode === 'dark' && styles.mutedDark, selected && styles.periodOptionLabelSelected]}>{workerEarningsPeriodLabel(item, language)}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function WorkerHomeProductionEarningsCard({
  earnings,
  earningsError,
  language,
  onOpen,
  onRetry,
  reduceMotion,
  themeMode,
}: {
  earnings: EarningsResponse | null
  earningsError: string | null
  language: AppLanguage
  onOpen: (period: WorkerEarningsPeriod) => void
  onRetry: () => void
  reduceMotion: boolean
  themeMode: 'dark' | 'light'
}) {
  const { fontScale, width } = useWindowDimensions()
  const [period, setPeriod] = useState<WorkerEarningsPeriod>('month')
  const snapshot = buildWorkerEarningsSnapshot(earnings, earningsError, period)
  const stacked = fontScale >= 1.35 || width < 370
  const hasVerifiedData = snapshot.state === 'ready' || snapshot.state === 'empty' || snapshot.state === 'stale'
  const headline = hasVerifiedData
    ? formatVndDong(snapshot.netEarnings, language)
    : snapshot.state === 'loading'
      ? textByLanguage(language, 'Đang tải…', 'Loading…')
      : textByLanguage(language, 'Chưa thể tải thu nhập', 'Earnings unavailable')

  return (
    <View style={[styles.card, themeMode === 'dark' && styles.cardDark]} testID="worker-home-production-income">
      <View style={styles.periodHeader}>
        <Text style={[styles.title, themeMode === 'dark' && styles.textDark]}>{textByLanguage(language, 'Thu nhập theo kỳ', 'Income by period')}</Text>
        <PeriodPicker language={language} onChange={setPeriod} period={period} reduceMotion={reduceMotion} themeMode={themeMode} />
      </View>
      <View style={[styles.content, stacked && styles.contentStacked]}>
        <View style={styles.summary}>
          <Text accessibilityLiveRegion="polite" style={[styles.headline, themeMode === 'dark' && styles.textDark]} testID="worker-home-production-income-headline">{headline}</Text>
          {hasVerifiedData ? <Text style={[styles.meta, themeMode === 'dark' && styles.mutedDark]}>{textByLanguage(language, `${snapshot.paidJobCount} công việc đã ghi nhận`, `${snapshot.paidJobCount} recorded jobs`)}</Text> : null}
          {snapshot.state === 'stale' ? <Text style={styles.notice}>{textByLanguage(language, 'Chưa thể cập nhật', 'Unable to refresh')}</Text> : null}
          {snapshot.state === 'stale' || snapshot.state === 'unavailable' ? (
            <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry} testID="worker-home-production-income-retry">
              <Text style={styles.retryLabel}>{textByLanguage(language, 'Thử lại', 'Retry')}</Text>
            </Pressable>
          ) : null}
        </View>
        {hasVerifiedData ? <EarningsChart language={language} period={period} points={snapshot.points} themeMode={themeMode} /> : null}
      </View>
      <View style={[styles.footer, themeMode === 'dark' && styles.borderDark]}>
        <View style={styles.balance}>
          <Text style={[styles.balanceLabel, themeMode === 'dark' && styles.mutedDark]}>{textByLanguage(language, 'Có thể rút', 'Available to withdraw')}</Text>
          <Text style={[styles.balanceValue, themeMode === 'dark' && styles.textDark]}>{hasVerifiedData ? formatVndDong(snapshot.availableBalance, language) : textByLanguage(language, 'Chưa ghi nhận', 'Unavailable')}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => onOpen(period)} style={({ pressed }) => [styles.openButton, themeMode === 'dark' && styles.openButtonDark, pressed && !reduceMotion && styles.pressed]} testID="worker-home-production-income-open">
          <Text style={styles.openButtonLabel}>{textByLanguage(language, 'Xem thu nhập', 'View earnings')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  axisLabel: { color: '#637387', fontSize: 8, lineHeight: 11, marginTop: 3 },
  balance: { flex: 1, gap: 2, minWidth: 0 },
  balanceLabel: { color: '#66768A', fontSize: 10, lineHeight: 13 },
  balanceValue: { color: '#102437', fontSize: 14, fontVariant: ['tabular-nums'], fontWeight: '600', lineHeight: 18 },
  bar: { borderTopLeftRadius: 7, borderTopRightRadius: 7, minHeight: 7, width: 12 },
  barColumn: { alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  barRow: { alignItems: 'flex-end', bottom: 0, flexDirection: 'row', height: 68, left: 0, position: 'absolute', right: 0 },
  borderDark: { borderTopColor: 'rgba(174, 211, 204, 0.2)' },
  card: { backgroundColor: '#FFFEFF', borderColor: '#E1E9E7', borderCurve: 'continuous', borderRadius: 16, borderWidth: 1, boxShadow: '0 5px 16px rgba(24, 67, 66, 0.062)', gap: 9, marginHorizontal: 11, marginTop: 9, overflow: 'hidden', padding: 11 },
  cardDark: { backgroundColor: '#17312D', borderColor: 'rgba(174, 211, 204, 0.24)' },
  chart: { flex: 1.16, minHeight: 98, minWidth: 0, position: 'relative' },
  chartEmpty: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center', minHeight: 92 },
  chartEmptyRule: { backgroundColor: '#E7ECEF', borderRadius: 999, height: 6, width: '72%' },
  chartEmptyText: { color: '#66768A', fontSize: 10, lineHeight: 14, textAlign: 'center' },
  chartLine: { left: 0, position: 'absolute', right: 0, top: 0, zIndex: 2 },
  chartPlot: { bottom: 0, height: 82, left: 0, position: 'absolute', right: 0 },
  content: { alignItems: 'stretch', flexDirection: 'row', gap: 8 },
  contentStacked: { flexDirection: 'column' },
  footer: { alignItems: 'center', borderTopColor: '#E1E9E7', borderTopWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingTop: 8 },
  headline: { color: '#102437', fontSize: 22, fontVariant: ['tabular-nums'], fontWeight: '600', lineHeight: 27 },
  meta: { color: '#66768A', fontSize: 10, lineHeight: 14 },
  mutedDark: { color: '#AAC0BC' },
  notice: { color: '#A85C15', fontSize: 11, fontWeight: '600', lineHeight: 15 },
  openButton: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#DDE5E4', borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 30, paddingHorizontal: 12 },
  openButtonDark: { backgroundColor: '#1E3C37', borderColor: 'rgba(174, 211, 204, 0.28)' },
  openButtonLabel: { color: '#078F7A', fontSize: 10, fontWeight: '600', lineHeight: 13 },
  periodHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', minHeight: 44 },
  periodMenu: { backgroundColor: '#F8FBFA', borderColor: '#D9E4E2', borderRadius: 16, borderWidth: 1, flexBasis: '100%', flexDirection: 'row', minHeight: 44, padding: 4, width: '100%' },
  periodMenuDark: { backgroundColor: '#1E3C37', borderColor: 'rgba(174, 211, 204, 0.28)' },
  periodOption: { alignItems: 'center', borderRadius: 12, flex: 1, justifyContent: 'center', minHeight: 44, minWidth: 0, paddingHorizontal: 4 },
  periodOptionLabel: { color: '#66768A', fontSize: 11, fontWeight: '600', lineHeight: 15 },
  periodOptionLabelSelected: { color: '#078F7A' },
  periodOptionSelected: { backgroundColor: '#E6F7F3', borderColor: '#B9DED8', borderWidth: 1 },
  periodTrigger: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#DDE5E4', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 5, height: 22, justifyContent: 'center', paddingHorizontal: 9 },
  periodTriggerDark: { backgroundColor: '#1E3C37', borderColor: 'rgba(174, 211, 204, 0.28)' },
  periodTriggerLabel: { color: '#102437', fontSize: 8.8, lineHeight: 10 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  retry: { alignItems: 'center', alignSelf: 'flex-start', borderColor: '#B9DED8', borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 32, paddingHorizontal: 10 },
  retryLabel: { color: '#078F7A', fontSize: 11, fontWeight: '600' },
  ruleDark: { backgroundColor: '#2B4944' },
  summary: { flex: 0.84, gap: 5, justifyContent: 'center', minWidth: 0 },
  textDark: { color: '#F1F6F4' },
  title: { color: '#102437', flexGrow: 1, flexShrink: 1, fontSize: 14, fontWeight: '600', lineHeight: 19, minWidth: 120 },
  valueBadge: { backgroundColor: '#08A388', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3, position: 'absolute', right: 0, top: 0, zIndex: 3 },
  valueBadgeText: { color: '#FFFFFF', fontSize: 8, fontVariant: ['tabular-nums'], fontWeight: '700', lineHeight: 10 },
})
