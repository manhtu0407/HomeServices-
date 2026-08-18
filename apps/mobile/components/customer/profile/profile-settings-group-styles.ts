import { typography } from '@/design/theme'
import { StyleSheet } from 'react-native'

export const customerV21ProfileSettingsGroupStyles = StyleSheet.create({
  container: {
    gap: 8,
    marginTop: 16,
  },
  group: {
    gap: 5,
  },
  groupLabel: {
    ...typography.caption1,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  groupSurface: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  rowCopy: {
    flex: 1,
    gap: 0,
    minWidth: 0,
  },
  rowDivider: {
    height: 1,
    marginLeft: 56,
  },
  rowIconFrame: {
    alignItems: 'center',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  rowIcon: {
    height: 20,
    width: 20,
  },
  rowMeta: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 0,
    maxWidth: 18,
  },
  rowStatus: {
    flexShrink: 1,
    ...typography.caption1,
    fontWeight: '600',
    textAlign: 'right',
  },
  rowSubtitle: {
    ...typography.caption1,
  },
  rowTitle: {
    ...typography.footnote,
    fontWeight: '600',
  },
  versionLabel: {
    ...typography.caption1,
    marginTop: 6,
    paddingBottom: 6,
    textAlign: 'center',
  },
})
