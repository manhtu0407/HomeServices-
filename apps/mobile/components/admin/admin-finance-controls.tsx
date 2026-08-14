import { StyleSheet, Text, View } from 'react-native'

import { KaelButton, KaelChip, KaelTextField } from '@/components/ui/kael-primitives'
import { color, component, spacing, typography } from '@/design/theme'
import type { AdminFinanceRange } from '@/lib/api-types/admin'

import { AdminTabNavigation } from './admin-tab-navigation'

export type FinanceView = 'overview' | 'cash' | 'commission' | 'tax'

type FinanceControlsCopy = {
  cashView: string
  commissionView: string
  customApply: string
  customFrom: string
  customRange: string
  customTo: string
  load: string
  overview: string
  period: string
  taxView: string
  timeZone: string
}

const RANGE_OPTIONS: AdminFinanceRange[] = ['day', 'week', 'month', 'year']

export function FinanceControls({ activeView, compact, copy, customEditorOpen, customFrom, customMode, customTo, language, onApplyCustom, onChangeCustomFrom, onChangeCustomTo, onRefresh, onSelectRange, onSelectView, onToggleCustom, range }: {
  activeView: FinanceView
  compact: boolean
  copy: FinanceControlsCopy
  customEditorOpen: boolean
  customFrom: string
  customMode: boolean
  customTo: string
  language: 'vi' | 'en'
  onApplyCustom: () => void
  onChangeCustomFrom: (value: string) => void
  onChangeCustomTo: (value: string) => void
  onRefresh: () => void
  onSelectRange: (range: AdminFinanceRange) => void
  onSelectView: (view: FinanceView) => void
  onToggleCustom: () => void
  range: AdminFinanceRange
}) {
  const views = compact
    ? [['overview', copy.overview], ['cash', language === 'vi' ? 'Dòng tiền' : 'Cash flow'], ['commission', language === 'vi' ? 'Hoa hồng' : 'Commission'], ['tax', language === 'vi' ? 'Thuế' : 'Tax']] as const
    : [['overview', copy.overview], ['cash', copy.cashView], ['commission', copy.commissionView], ['tax', copy.taxView]] as const
  return <>
    <AdminTabNavigation
      items={views.map(([view, label]) => ({
        accessibilityLabel: label,
        key: view,
        label,
        onPress: () => onSelectView(view),
        selected: activeView === view,
        testID: `admin-finance-tab-${view}`,
      }))}
      testID="admin-finance-view-navigation"
    />
    <View style={styles.controlsCard}>
      <View style={styles.toolbar}>
        <View style={styles.periodHeading}><Text style={styles.periodTitle}>{copy.period}</Text><Text style={styles.periodMeta}>{copy.timeZone}</Text></View>
        <KaelButton label={copy.load} onPress={onRefresh} size="small" variant="secondary" />
      </View>
      <View style={styles.rangeRow}>
        {RANGE_OPTIONS.map((option) => <KaelChip accessibilityLabel={rangeLabel(option, language)} accessibilityState={{ selected: !customMode && range === option }} key={option} label={rangeLabel(option, language)} onPress={() => onSelectRange(option)} testID={`admin-finance-range-${option}`} variant={!customMode && range === option ? 'selected' : 'unselected'} />)}
        <KaelChip accessibilityLabel={copy.customRange} accessibilityState={{ selected: customMode }} label={copy.customRange} onPress={onToggleCustom} testID="admin-finance-range-custom-toggle" variant={customMode ? 'selected' : 'unselected'} />
      </View>
      {customEditorOpen ? <View style={styles.customRangeRow}>
        <View style={styles.customRangeField}><KaelTextField accessibilityLabel={copy.customFrom} autoCapitalize="none" label={copy.customFrom} onChangeText={onChangeCustomFrom} testID="admin-finance-custom-from" value={customFrom} /></View>
        <View style={styles.customRangeField}><KaelTextField accessibilityLabel={copy.customTo} autoCapitalize="none" label={copy.customTo} onChangeText={onChangeCustomTo} testID="admin-finance-custom-to" value={customTo} /></View>
        <KaelButton label={copy.customApply} onPress={onApplyCustom} size="small" testID="admin-finance-range-custom" variant="primary" />
      </View> : customMode ? <Text style={styles.customRangeSummary}>{customFrom} — {customTo}</Text> : null}
    </View>
  </>
}

function rangeLabel(range: AdminFinanceRange, language: 'vi' | 'en') {
  const labels = language === 'vi'
    ? { day: 'Ngày', week: 'Tuần', month: 'Tháng', year: 'Năm' }
    : { day: 'Day', week: 'Week', month: 'Month', year: 'Year' }
  return labels[range]
}

const styles = StyleSheet.create({
  controlsCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  customRangeField: { flex: 1, minWidth: 180 },
  customRangeRow: { alignItems: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  customRangeSummary: { ...typography.footnote, color: color.text.secondary, fontVariant: ['tabular-nums'] },
  periodHeading: { flex: 1, gap: spacing.xs, minWidth: 180 },
  periodMeta: { ...typography.caption2, color: color.text.muted },
  periodTitle: { ...typography.subheadline, color: color.text.strong, fontWeight: '700' },
  rangeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  toolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' },
})
