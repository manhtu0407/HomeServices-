import { typography } from '@/design/theme'
import { StyleSheet } from 'react-native'

export const customerV21ProfileFoundationUtilityStyles = StyleSheet.create({
  actionCopy: {
    flex: 1,
    gap: 3,
  },
  actionIcon: {
    height: 34,
    width: 34,
  },
  actionIconFrame: {
    alignItems: 'center',
    borderRadius: 16,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  body: {
    ...typography.subheadline,
  },
  centerText: {
    textAlign: 'center',
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 7,
    borderWidth: 1.5,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkboxLabel: {
    flex: 1,
    ...typography.footnote,
    fontWeight: '600',
  },
  checkboxMark: {
    ...typography.subheadline,
    fontWeight: '600',
  },
  checkboxRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  confirmationCard: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 20,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  confirmationCopy: {
    gap: 8,
  },
  confirmationInput: {
    borderRadius: 16,
    borderWidth: 1,
    ...typography.subheadline,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  confirmationPhrase: {
    ...typography.callout,
    fontWeight: '600',
  },
  dangerCard: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 18,
  },
  deleteButton: {
    minHeight: 56,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 72,
  },
  emptyCard: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  emptyIcon: {
    height: 56,
    marginBottom: 4,
    width: 56,
  },
  listSurface: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  message: {
    ...typography.footnote,
    fontWeight: '600',
    textAlign: 'center',
  },
  notificationCopy: {
    flex: 1,
    gap: 3,
  },
  notificationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  notificationState: {
    ...typography.caption2,
    fontWeight: '600',
  },
  notificationTime: {
    ...typography.caption2,
  },
  notificationTitle: {
    flex: 1,
    ...typography.subheadline,
    fontWeight: '600',
  },
  notificationTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  sectionLabel: {
    flex: 1,
    ...typography.footnote,
    fontWeight: '600',
  },
  summaryCard: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  summaryCopy: {
    flex: 1,
    gap: 5,
  },
  summaryIcon: {
    height: 64,
    width: 64,
  },
  summaryIconFrame: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    flexShrink: 0,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  title: {
    ...typography.callout,
    fontWeight: '600',
  },
  unreadDot: {
    borderRadius: 5,
    borderWidth: 1,
    height: 10,
    width: 10,
  },
  utilityStack: {
    gap: 14,
    width: '100%',
  },
})
