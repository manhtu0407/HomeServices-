import { StyleSheet } from 'react-native'

import { color, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  darkText: {
    color: '#F1F6F4',
  },
  emptyBody: {
    color: color.text.secondary,
    ...typography.footnote,
  },
  emptyState: {
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyTitle: {
    color: color.text.strong,
    ...typography.subheadline,
  },
  notificationBody: {
    color: color.text.secondary,
    ...typography.caption1,
  },
  notificationCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  notificationReadDot: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(153, 188, 181, 0.56)',
    borderWidth: 1,
  },
  notificationRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    minHeight: 88,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  notificationStatus: {
    color: color.brand.primaryDark,
    flexShrink: 0,
    maxWidth: 52,
    textAlign: 'right',
    ...typography.caption2,
  },
  notificationTime: {
    color: color.text.muted,
    marginTop: 2,
    ...typography.caption2,
  },
  notificationTitle: {
    color: color.text.strong,
    ...typography.subheadline,
  },
  notificationUnreadDot: {
    backgroundColor: color.brand.primary,
    borderRadius: 5,
    height: 10,
    marginTop: 5,
    width: 10,
  },
  policyBody: {
    color: color.text.secondary,
    paddingBottom: 16,
    paddingHorizontal: 16,
    ...typography.footnote,
  },
  policyChevron: {
    color: color.brand.primaryDark,
    marginLeft: 12,
    ...typography.title2,
  },
  policyIntro: {
    gap: 5,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  policyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 59,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  policyTitle: {
    color: color.text.strong,
    flex: 1,
    ...typography.subheadline,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.992 }],
  },
  stack: {
    gap: 18,
  },
  summary: {
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  summaryBody: {
    color: color.text.secondary,
    ...typography.footnote,
  },
  summaryTitle: {
    color: color.text.strong,
    ...typography.callout,
  },
  workerCustomerFontText: {
    ...typography.body,
  },
})
