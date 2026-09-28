import { StyleSheet } from 'react-native'

import { color, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    ...typography.body,
  },
  stack: {
    gap: 14,
  },
  card: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 18,
    ...shadow.soft,
  },
  sectionTitle: {
    color: color.text.strong,
    ...typography.headline,
  },
  sectionHint: {
    color: color.text.secondary,
    ...typography.caption1,
    marginTop: 4,
  },
  ruleRow: {
    borderTopColor: color.surface.stroke,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
  },
  caseHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  levelBadge: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  levelBadgeSerious: {
    backgroundColor: color.text.strong,
    borderColor: color.text.strong,
  },
  levelBadgeText: {
    color: color.brand.primaryDark,
    ...typography.footnote,
    fontWeight: '600',
  },
  levelBadgeTextSerious: {
    color: color.text.inverse,
  },
  ruleCopy: {
    flex: 1,
    minWidth: 0,
  },
  ruleTitle: {
    color: color.text.strong,
    ...typography.subheadline,
    fontWeight: '600',
  },
  ruleBody: {
    color: color.text.secondary,
    ...typography.footnote,
    marginTop: 6,
  },
  status: {
    color: color.text.muted,
    ...typography.caption1,
    marginTop: 2,
  },
  statusCleared: {
    color: color.brand.primaryDark,
    fontWeight: '600',
  },
  consequenceList: {
    gap: 4,
    marginTop: 10,
  },
  consequence: {
    color: color.text.strong,
    ...typography.footnote,
  },
  consequenceRestored: {
    color: color.text.muted,
    textDecorationLine: 'line-through',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.strokeStrong,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  secondaryLabel: {
    color: color.brand.primaryDark,
    ...typography.footnote,
    fontWeight: '600',
  },
  appealSection: {
    borderTopColor: color.surface.stroke,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginTop: 6,
    paddingTop: 14,
  },
  errorText: {
    color: color.accent.destructive,
    ...typography.caption1,
    marginTop: 8,
  },
  pressed: {
    opacity: 0.72,
  },
})
