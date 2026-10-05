import { StyleSheet } from 'react-native'

import { color, customerTheme, glass, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    ...typography.body,
  },
  group: {
    gap: 8,
  },
  groupCard: {
    backgroundColor: color.surface.base,
    borderColor: 'rgba(205,225,221,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  groupCardDark: {
    backgroundColor: '#171D1B',
    borderColor: customerTheme.darkLayer.glassBorder,
    boxShadow: '0 14px 30px rgba(0,0,0,0.24)',
  },
  groupDivider: {
    backgroundColor: 'rgba(202,222,218,0.78)',
    height: 1,
    marginLeft: 74,
  },
  groupDividerDark: {
    backgroundColor: customerTheme.darkLayer.ghost,
  },
  groupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 78,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  groupRowCompact: {
    minHeight: 58,
    paddingVertical: 8,
  },
  groupRowChevron: {
    color: color.brand.primaryDark,
    marginLeft: 2,
    ...typography.title1,
  },
  groupRowChevronDark: {
    color: customerTheme.darkLayer.primary,
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
    color: customerTheme.darkLayer.muted,
  },
  groupRowIcon: {
    flexShrink: 0,
    height: 44,
    width: 44,
  },
  groupRowIconCompact: {
    height: 30,
    width: 30,
  },
  groupRowIconFrame: {
    alignItems: 'center',
    flexShrink: 0,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  groupRowIconFrameOutlined: {
    backgroundColor: 'transparent',
    borderColor: color.surface.stroke,
    borderRadius: 14,
    borderWidth: 1,
    height: 46,
    width: 46,
  },
  groupRowIconFrameOutlinedWhite: {
    backgroundColor: glass.bg,
  },
  groupRowIconFrameOutlinedWhiteReducedTransparency: {
    backgroundColor: color.surface.base,
  },
  groupRowIconFrameOutlinedDark: {
    borderColor: customerTheme.darkLayer.glassBorder,
  },
  groupRowIconFrameOutlinedWhiteDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  groupRowIconFrameOutlinedWhiteDarkReducedTransparency: {
    backgroundColor: '#171D1B',
  },
  groupRowIconFrameCompact: {
    height: 30,
    width: 30,
  },
  groupRowMeta: {
    color: color.text.muted,
    flexShrink: 1,
    maxWidth: 92,
    textAlign: 'right',
    ...typography.caption2,
  },
  groupRowMetaActiveDark: {
    color: customerTheme.darkLayer.primary,
  },
  groupRowMetaDark: {
    color: customerTheme.darkLayer.muted,
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
    color: customerTheme.darkLayer.text,
  },
  groupTitle: {
    color: color.text.strong,
    marginLeft: 4,
    ...typography.title3,
  },
  groupTitleDark: {
    color: customerTheme.darkLayer.text,
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.992 }],
  },
})
