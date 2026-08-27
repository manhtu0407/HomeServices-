import { StyleSheet, View, type AccessibilityState, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'

import { KaelButton, KaelChip, KaelTextField } from '@/components/ui/kael-primitives'
import { color, component, spacing, typography } from '@/design/theme'
import type { AdminFinanceRange } from '@/lib/api-types/admin'

import { AdminText } from './admin-text'

export type FinanceView = 'overview' | 'cash' | 'commission' | 'tax'

type FinanceControlsCopy = {
  customApply: string
  customFrom: string
  customRange: string
  customTo: string
  load: string
  period: string
  timeZone: string
}

const RANGE_OPTIONS: AdminFinanceRange[] = ['day', 'week', 'month', 'year']

type FinanceChoiceChipProps = {
  accessibilityLabel?: string
  disabled?: boolean
  label: string
  onPress: () => void
  selected: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  tone?: 'neutral' | 'danger'
}

export function FinanceChoiceChip({ accessibilityLabel, disabled, label, onPress, selected, style, testID, tone = 'neutral' }: FinanceChoiceChipProps) {
  const accessibilityState: AccessibilityState = { disabled, selected }
  return <KaelChip
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={accessibilityState}
    disabled={disabled}
    label={selected ? `✓ ${label}` : label}
    onPress={onPress}
    style={[styles.choiceChip, selected ? styles.choiceChipSelected : null, style]}
    testID={testID}
    textStyle={[styles.choiceChipText, selected ? styles.choiceChipTextSelected : null]}
    variant={tone === 'danger' && selected ? 'error' : 'unselected'}
  />
}

type FinanceSecondaryButtonProps = {
  accessibilityLabel?: string
  accessibilityState?: AccessibilityState
  disabled?: boolean
  label: string
  loading?: boolean
  onPress: () => void
  size?: 'default' | 'small'
  style?: StyleProp<ViewStyle>
  testID?: string
  textStyle?: StyleProp<TextStyle>
}

export function FinanceSecondaryButton({ style, textStyle, ...props }: FinanceSecondaryButtonProps) {
  return <KaelButton
    {...props}
    style={[styles.secondaryAction, style]}
    textStyle={[styles.secondaryActionText, textStyle]}
    variant="secondary"
  />
}

export function FinanceControls({ copy, customEditorOpen, customFrom, customMode, customTo, language, onApplyCustom, onChangeCustomFrom, onChangeCustomTo, onRefresh, onSelectRange, onToggleCustom, range }: {
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
  onToggleCustom: () => void
  range: AdminFinanceRange
}) {
  return <View style={styles.controlsCard}>
      <View style={styles.toolbar}>
        <View style={styles.periodHeading}><AdminText textRole="headline" style={styles.periodTitle}>{copy.period}</AdminText><AdminText textRole="footnote" style={styles.periodMeta}>{copy.timeZone}</AdminText></View>
        <FinanceSecondaryButton label={copy.load} onPress={onRefresh} size="small" testID="admin-finance-refresh" />
      </View>
      <View style={styles.rangeRow}>
        {RANGE_OPTIONS.map((option) => <FinanceChoiceChip accessibilityLabel={rangeLabel(option, language)} key={option} label={rangeLabel(option, language)} onPress={() => onSelectRange(option)} selected={!customMode && range === option} testID={`admin-finance-range-${option}`} />)}
        <FinanceChoiceChip accessibilityLabel={copy.customRange} label={copy.customRange} onPress={onToggleCustom} selected={customMode} testID="admin-finance-range-custom-toggle" />
      </View>
      {customEditorOpen ? <View style={styles.customRangeRow}>
        <View style={styles.customRangeField}><KaelTextField accessibilityLabel={copy.customFrom} autoCapitalize="none" label={copy.customFrom} onChangeText={onChangeCustomFrom} testID="admin-finance-custom-from" value={customFrom} /></View>
        <View style={styles.customRangeField}><KaelTextField accessibilityLabel={copy.customTo} autoCapitalize="none" label={copy.customTo} onChangeText={onChangeCustomTo} testID="admin-finance-custom-to" value={customTo} /></View>
        <KaelButton label={copy.customApply} onPress={onApplyCustom} size="small" testID="admin-finance-range-custom" variant="primary" />
      </View> : customMode ? <AdminText textRole="footnote" style={styles.customRangeSummary}>{customFrom} — {customTo}</AdminText> : null}
    </View>
}

function rangeLabel(range: AdminFinanceRange, language: 'vi' | 'en') {
  const labels = language === 'vi'
    ? { day: 'Ngày', week: 'Tuần', month: 'Tháng', year: 'Năm' }
    : { day: 'Day', week: 'Week', month: 'Month', year: 'Year' }
  return labels[range]
}

const styles = StyleSheet.create({
  choiceChip: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, minHeight: 44 },
  choiceChipSelected: { borderColor: color.text.strong, borderWidth: 1.5 },
  choiceChipText: { color: color.text.secondary, fontWeight: '500' },
  choiceChipTextSelected: { color: color.text.strong, fontWeight: '700' },
  controlsCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  customRangeField: { flex: 1, minWidth: 180 },
  customRangeRow: { alignItems: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  customRangeSummary: { ...typography.footnote, color: color.text.secondary, fontVariant: ['tabular-nums'] },
  periodHeading: { flex: 1, gap: spacing.xs, minWidth: 180 },
  periodMeta: { ...typography.caption2, color: color.text.muted },
  periodTitle: { ...typography.subheadline, color: color.text.strong, fontWeight: '600' },
  rangeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  secondaryAction: { backgroundColor: color.surface.base, borderColor: color.surface.strokeStrong, minHeight: 44 },
  secondaryActionText: { color: color.text.strong, fontWeight: '600' },
  toolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' },
})
