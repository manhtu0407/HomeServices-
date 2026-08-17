import { StyleSheet } from 'react-native'

import { color, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    ...typography.body,
  },
  group: {
    gap: 8,
  },
  groupCard: {
    backgroundColor: color.mint.white,
    borderColor: 'rgba(205,225,221,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  groupCardDark: {
    backgroundColor: '#171D1B',
    borderColor: 'rgba(190,210,205,0.16)',
    boxShadow: '0 14px 30px rgba(0,0,0,0.24)',
  },
  groupDivider: {
    backgroundColor: 'rgba(202,222,218,0.78)',
    height: 1,
    marginLeft: 74,
  },
  groupDividerDark: {
    backgroundColor: 'rgba(190,210,205,0.12)',
  },
  groupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 78,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  groupRowChevron: {
    color: color.brand.primaryDark,
    marginLeft: 2,
    ...typography.title1,
  },
  groupRowChevronDark: {
    color: '#63E6D0',
  },
  groupRowCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  groupRowDescription: {
    color: color.text.secondary,
    ...typography.caption1,
  },
  groupRowDescriptionDark: {
    color: '#A9B7B3',
  },
  groupRowIcon: {
    flexShrink: 0,
    height: 44,
    width: 44,
  },
  groupRowMeta: {
    color: color.text.muted,
    flexShrink: 1,
    maxWidth: 92,
    textAlign: 'right',
    ...typography.caption2,
  },
  groupRowMetaActiveDark: {
    color: '#63E6D0',
  },
  groupRowMetaDark: {
    color: '#A9B7B3',
  },
  groupRowMetaActive: {
    color: color.brand.primaryDark,
  },
  groupRowMetaDanger: {
    color: color.accent.destructive,
  },
  groupRowTitle: {
    color: color.text.strong,
    ...typography.subheadline,
  },
  groupRowTitleDark: {
    color: '#F1F6F4',
  },
  groupTitle: {
    color: color.text.strong,
    marginLeft: 4,
    ...typography.title3,
  },
  groupTitleDark: {
    color: '#F1F6F4',
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.992 }],
  },
})
