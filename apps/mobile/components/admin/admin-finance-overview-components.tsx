import { StyleSheet, View, type ViewStyle } from 'react-native'
import Svg, { Circle, Polyline } from 'react-native-svg'

import { color, component, spacing, typography } from '@/design/theme'
import { AdminText } from './admin-text'
import type { FinanceMetricItem, FinanceOverviewCopy, FinanceOverviewMetric } from './admin-finance-overview-helpers'

type FinanceBreakdown = { amount: number; label: string }

export function FinanceMetricGrid({ cardStyle, items }: { cardStyle: ViewStyle; items: FinanceMetricItem[] }) {
  return <View style={styles.metricGrid}>{items.map((item) => <MetricCard comparison={item.comparison} dataSource={item.dataSource} direction={item.direction} key={item.key} label={item.label} style={cardStyle} testID={`admin-finance-metric-${item.key}`} value={item.value} />)}</View>
}

export function PendingMetric({ copy, formatValue, label, value }: { copy: FinanceOverviewCopy; formatValue: (value: number | null) => string; label: string; value: number | null | undefined }) {
  return <Metric dataSource={value === null || value === undefined ? copy.unavailable : undefined} label={label} value={value === null || value === undefined ? copy.unavailable : formatValue(value)} />
}

export function MetricCard({ comparison, dataSource, direction, label, style, testID, value }: { comparison?: string; dataSource?: string; direction?: FinanceOverviewMetric['direction']; label: string; style?: ViewStyle; testID?: string; value: string }) {
  return <View style={[styles.metricCard, style]} testID={testID}><Metric compact label={label} value={value} />{dataSource ? <AdminText textRole="footnote" style={styles.metricDataSource} testID={testID ? `${testID}-source` : undefined}>{dataSource}</AdminText> : null}{comparison ? <AdminText numeric textRole="footnote" style={[styles.metricComparison, direction === 'up' ? styles.metricComparisonUp : direction === 'down' ? styles.metricComparisonDown : null]}>{comparison}</AdminText> : null}</View>
}

export function Metric({ compact = false, dataSource, label, value }: { compact?: boolean; dataSource?: string; label: string; value: string }) {
  return <View style={[styles.metric, compact && styles.metricCompact]}><AdminText textRole="subheadline" style={styles.metricLabel}>{label}</AdminText><AdminText numeric textRole="headline" style={styles.metricValue}>{value}</AdminText>{dataSource ? <AdminText textRole="footnote" style={styles.metricDataSource}>{dataSource}</AdminText> : null}</View>
}

export function TrendChart({ copy, points }: { copy: FinanceOverviewCopy; points: { label: string; value: number }[] | null }) {
  if (!points?.length) return <View style={styles.emptyCard}><AdminText textRole="title2" style={styles.sectionTitle}>{copy.trend}</AdminText><AdminText textRole="subheadline" style={styles.emptyText}>{copy.noTrend}</AdminText></View>
  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const spread = Math.max(Math.max(...values) - min, 1)
  const plot = points.map((point, index) => {
    const x = points.length === 1 ? 160 : 12 + index * (296 / (points.length - 1))
    const y = 112 - ((point.value - min) / spread) * 88
    return { ...point, x, y }
  })
  return <View style={styles.chartCard}>
    <AdminText textRole="title2" style={styles.sectionTitle}>{copy.trend}</AdminText>
    <View accessibilityLabel={`${copy.trend}: ${points.map((point) => `${point.label} ${point.value}`).join(', ')}`} accessibilityRole="image">
      <Svg height={128} viewBox="0 0 320 128" width="100%">
        <Polyline fill="none" points={plot.map((point) => `${point.x},${point.y}`).join(' ')} stroke={color.brand.primary} strokeWidth={3} />
        {plot.map((point) => <Circle cx={point.x} cy={point.y} fill={color.surface.base} key={`${point.label}-${point.x}`} r={4} stroke={color.brand.primary} strokeWidth={2} />)}
      </Svg>
    </View>
  </View>
}

export function BreakdownCard({ copy, formatCurrency, items, title }: { copy: FinanceOverviewCopy; formatCurrency: (value: number | null) => string; items: FinanceBreakdown[] | null; title: string }) {
  const visibleItems = items?.filter((item) => item.label.trim()) ?? []
  return <View style={styles.breakdownCard}><AdminText textRole="title2" style={styles.sectionTitle}>{title}</AdminText>{visibleItems.length
    ? visibleItems.map((item) => <View key={item.label} style={styles.breakdownRow}><AdminText textRole="subheadline" style={styles.breakdownLabel}>{item.label}</AdminText><AdminText numeric textRole="subheadline" style={styles.breakdownValue}>{formatCurrency(item.amount)}</AdminText></View>)
    : <AdminText textRole="subheadline" style={styles.emptyText}>{copy.noBreakdown}</AdminText>}</View>
}

const styles = StyleSheet.create({
  breakdownCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, flex: 1, gap: spacing.md, minWidth: 240, padding: spacing.lg },
  breakdownLabel: { ...typography.subheadline, color: color.text.secondary, flex: 1 },
  breakdownRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  breakdownValue: { ...typography.label, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '600' },
  chartCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  emptyCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  emptyText: { ...typography.subheadline, color: color.text.secondary },
  metric: { flexBasis: 128, gap: spacing.xxs, minWidth: 128 },
  metricCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, flexBasis: '46%', flexGrow: 1, gap: spacing.sm, minWidth: 148, padding: spacing.md },
  metricCompact: { flexBasis: 'auto', minWidth: 0 },
  metricComparison: { ...typography.caption2, color: color.text.muted, marginTop: spacing.sm },
  metricComparisonDown: { color: color.text.secondary },
  metricComparisonUp: { color: color.brand.primaryDark },
  metricDataSource: { ...typography.caption1, color: color.text.secondary },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metricLabel: { ...typography.caption2, color: color.text.muted, fontWeight: '600' },
  metricValue: { ...typography.headline, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '600' },
  sectionTitle: { ...typography.headline, color: color.text.strong, fontWeight: '600' },
})
