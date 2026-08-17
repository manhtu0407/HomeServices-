import { StyleSheet } from 'react-native'

import { color, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    ...typography.body,
  },
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  historyCard: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  emptyState: {
    alignItems: 'center',
    minHeight: 190,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 32,
    position: 'relative',
    zIndex: 1,
  },
  emptyTitle: {
    color: color.text.strong,
    ...typography.callout,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyDetail: {
    color: color.text.muted,
    ...typography.caption1,
    marginTop: 6,
    textAlign: 'center',
  },
  transactionRow: {
    alignItems: 'center',
    borderBottomColor: color.surface.stroke,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 13,
    position: 'relative',
    zIndex: 1,
  },
  transactionRowLast: {
    borderBottomWidth: 0,
  },
  transactionCopy: {
    flex: 1,
    minWidth: 0,
  },
  transactionTitle: {
    color: color.text.strong,
    ...typography.subheadline,
    fontWeight: '600',
  },
  transactionMeta: {
    color: color.text.muted,
    ...typography.caption2,
    marginTop: 3,
  },
  transactionAmount: {
    color: color.brand.primaryDark,
    flexShrink: 0,
    ...typography.subheadline,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  transactionAmountDebit: {
    color: color.text.secondary,
  },
})
