import { StyleSheet } from 'react-native'

import { color, component, shadow, typography } from '@/design/theme'

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
    position: 'relative',
    ...shadow.soft,
  },
  eyebrow: {
    color: color.text.muted,
    ...typography.caption2,
    fontWeight: '600',
  },
  pointsValue: {
    color: color.brand.primaryDark,
    ...typography.largeTitle,
    fontWeight: '600',
    marginTop: 2,
  },
  meta: {
    color: color.text.secondary,
    ...typography.caption1,
    marginTop: 4,
  },
  progressTrack: {
    backgroundColor: color.surface.disabled,
    borderRadius: 4,
    height: 8,
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: color.brand.primary,
    borderRadius: 4,
    height: 8,
  },
  notice: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.stroke,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    padding: 12,
  },
  warningNotice: {
    backgroundColor: color.surface.soft,
    borderColor: color.accent.warning,
  },
  noticeTitle: {
    color: color.text.strong,
    ...typography.footnote,
    fontWeight: '600',
  },
  noticeBody: {
    color: color.text.secondary,
    ...typography.caption1,
    marginTop: 4,
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
  milestoneList: {
    marginTop: 10,
  },
  milestoneRow: {
    alignItems: 'center',
    borderTopColor: color.surface.stroke,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 60,
    paddingVertical: 10,
  },
  milestoneCopy: {
    flex: 1,
    minWidth: 0,
  },
  milestoneTitle: {
    color: color.text.strong,
    ...typography.subheadline,
    fontWeight: '600',
  },
  milestoneMeta: {
    color: color.text.secondary,
    ...typography.caption1,
    marginTop: 2,
  },
  milestoneReward: {
    color: color.brand.primaryDark,
    ...typography.subheadline,
    fontWeight: '600',
    textAlign: 'right',
  },
  redeemButton: {
    alignItems: 'center',
    borderColor: color.brand.primary,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: 12,
  },
  redeemButtonConfirm: {
    backgroundColor: '#24B3A1',
    borderColor: component.button.primary.border,
    boxShadow: component.button.primary.boxShadow,
    overflow: 'hidden',
  },
  redeemLabel: {
    color: color.brand.primaryDark,
    ...typography.footnote,
    fontWeight: '600',
  },
  redeemLabelConfirm: {
    color: color.text.inverse,
    position: 'relative',
    zIndex: 1,
  },
  receipt: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    marginTop: 12,
    padding: 12,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptLabel: {
    color: color.text.secondary,
    ...typography.footnote,
  },
  receiptValue: {
    color: color.text.strong,
    ...typography.footnote,
    fontWeight: '600',
  },
  receiptNet: {
    color: color.brand.primaryDark,
    ...typography.subheadline,
    fontWeight: '600',
  },
  codeBox: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 14,
  },
  codeValue: {
    color: color.text.strong,
    ...typography.title2,
    fontWeight: '600',
    letterSpacing: 4,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: color.surface.strokeStrong,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 44,
  },
  secondaryLabel: {
    color: color.brand.primaryDark,
    ...typography.footnote,
    fontWeight: '600',
  },
  entryRow: {
    borderTopColor: color.surface.stroke,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  entryLabel: {
    color: color.text.secondary,
    flex: 1,
    ...typography.footnote,
  },
  entryValue: {
    color: color.text.strong,
    ...typography.footnote,
    fontWeight: '600',
  },
  errorText: {
    color: color.accent.destructive,
    ...typography.caption1,
    marginTop: 8,
  },
  linkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  linkChevron: {
    color: color.brand.primary,
    ...typography.title3,
  },
  pressed: {
    opacity: 0.72,
  },
})
