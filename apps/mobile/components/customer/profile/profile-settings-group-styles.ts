import { StyleSheet } from 'react-native'

export const customerV21ProfileSettingsGroupStyles = StyleSheet.create({
  container: {
    gap: 22,
    marginTop: 12,
  },
  group: {
    gap: 8,
  },
  groupLabel: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  groupSurface: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowDivider: {
    height: 1,
    marginLeft: 68,
  },
  rowIconFrame: {
    alignItems: 'center',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  rowIcon: {
    height: 40,
    width: 40,
  },
  rowMeta: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 7,
    maxWidth: 132,
  },
  rowStatus: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    textAlign: 'right',
  },
  rowSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  versionLabel: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
    paddingBottom: 6,
    textAlign: 'center',
  },
})
