import { StyleSheet } from 'react-native'

import { radius, spacing, typography } from '@/design/theme'

import { workerIncomeDashboardTokens as incomeTokens } from './income-dashboard-tokens'

export const styles = StyleSheet.create({
  workerCustomerFontText: { ...typography.body },
  dashboard: { gap: spacing.sm },
  utilitySection: { width: '100%' },
  utilityCard: { borderRadius: incomeTokens.layout.panelRadius, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', paddingHorizontal: spacing.lg },
  utilityRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: 68, paddingVertical: spacing.sm },
  iconTile: { alignItems: 'center', flexShrink: 0, height: 44, justifyContent: 'center', width: 44 },
  utilityCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  utilityTitle: { ...typography.callout, fontWeight: '600' },
  utilityDetail: { ...typography.footnote },
  utilityChevron: { fontSize: 24, fontWeight: '600', lineHeight: 28, textAlign: 'center', width: 20 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 56 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  dataNotice: { borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md },
  dataNoticeTitle: { ...typography.subheadline, fontWeight: '600' },
  dataNoticeBody: { ...typography.caption1 },
  dataNoticeRetry: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 44, marginTop: spacing.xs, paddingHorizontal: spacing.md },
  dataNoticeRetryLabel: { ...typography.caption1, fontWeight: '700' },
  dataNoticeRetryDisabled: { opacity: 0.5 },
})
