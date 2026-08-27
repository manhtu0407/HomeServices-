import { StyleSheet } from 'react-native'

import { color, component, radius, shadow, spacing, typography } from '@/design/theme'

export const adminFinancePanelStyles = StyleSheet.create({
  accessCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, padding: spacing.lg },
  accessText: { ...typography.subheadline, color: color.text.secondary },
  breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  dismiss: { ...typography.headline, color: color.text.secondary },
  emptyCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  error: { alignItems: 'center', backgroundColor: component.chip.error.bg, borderColor: component.chip.error.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', padding: spacing.md },
  errorAction: { ...typography.label, color: color.brand.primary, fontWeight: '600' },
  errorText: { ...typography.footnote, color: color.text.strong, flex: 1 },
  generatedAt: { ...typography.footnote, color: color.text.muted, fontVariant: ['tabular-nums'] },
  header: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.sm, padding: spacing.lg, ...shadow.soft },
  loading: { alignItems: 'center', backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, padding: spacing.xl },
  loadingText: { ...typography.subheadline, color: color.text.secondary },
  notice: { alignItems: 'center', backgroundColor: component.chip.successStatus.bg, borderColor: component.chip.successStatus.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', padding: spacing.md },
  noticeText: { ...typography.footnote, color: color.text.strong, flex: 1 },
  sectionTitle: { ...typography.headline, color: color.text.strong, fontWeight: '600' },
  stack: { gap: spacing.lg },
  subtitle: { ...typography.subheadline, color: color.text.secondary },
  title: { ...typography.title3, color: color.text.strong, fontWeight: '600' },
  viewStack: { gap: spacing.lg },
})
