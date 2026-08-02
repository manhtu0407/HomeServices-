import { StyleSheet } from 'react-native'

import { color, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  darkText: {
    color: '#F1F6F4',
  },
  emptyBody: {
    color: color.text.secondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  emptyState: {
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyTitle: {
    color: color.text.strong,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  notificationBody: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
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
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    maxWidth: 52,
    textAlign: 'right',
  },
  notificationTime: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
    marginTop: 2,
  },
  notificationTitle: {
    color: color.text.strong,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
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
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  policyChevron: {
    color: color.brand.primaryDark,
    fontSize: 22,
    lineHeight: 24,
    marginLeft: 12,
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
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
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
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  summaryTitle: {
    color: color.text.strong,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  workerCustomerFontText: {
    fontFamily: typography.fontFamily,
  },
})
