import { StyleSheet } from 'react-native'

import { color, customerTheme, radius, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  choiceBody: {
    color: color.text.secondary,
    ...typography.caption1,
  },
  choiceBodyDark: {
    color: customerTheme.darkLayer.muted,
  },
  choiceCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  choiceMark: {
    alignItems: 'center',
    borderColor: 'rgba(104, 185, 172, 0.55)',
    borderRadius: 11,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    marginLeft: 12,
    width: 22,
  },
  choiceMarkDark: {
    borderColor: customerTheme.darkLayer.glassBorder,
  },
  choiceMarkDot: {
    backgroundColor: color.brand.primary,
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  choiceMarkSelected: {
    borderColor: color.brand.primary,
  },
  choiceRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(248, 253, 252, 0.96)',
    borderColor: 'rgba(207, 227, 223, 0.86)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginHorizontal: 14,
    marginTop: 10,
    minHeight: 66,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  choiceRowDark: {
    backgroundColor: customerTheme.darkLayer.raised,
    borderColor: customerTheme.darkLayer.glassBorder,
  },
  choiceRowSelected: {
    backgroundColor: 'rgba(231, 250, 246, 0.95)',
    borderColor: color.brand.primary,
  },
  choiceRowSelectedDark: {
    backgroundColor: '#173832',
    borderColor: customerTheme.darkLayer.primary,
  },
  opaqueCard: {
    backgroundColor: color.surface.base,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.992 }],
  },
  toggleKnob: {
    backgroundColor: color.surface.base,
    borderRadius: 10,
    height: 20,
    shadowColor: color.text.strong,
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    width: 20,
  },
  toggleKnobOn: {
    marginLeft: 18,
  },
  toggleLabel: {
    color: color.text.strong,
    flexShrink: 1,
    ...typography.caption1,
  },
  toggleList: {
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow.soft,
  },
  toggleListFormula: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(204,223,219,0.94)',
    position: 'relative',
  },
  toggleRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(176,222,214,0.34)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 13,
    paddingVertical: 10,
    position: 'relative',
    zIndex: 1,
  },
  toggleTextColumn: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  toggleTrack: {
    backgroundColor: '#DFE9E7',
    borderRadius: radius.pill,
    flexShrink: 0,
    height: 26,
    padding: 3,
    width: 44,
  },
  toggleTrackOn: {
    backgroundColor: color.brand.primary,
  },
  toggleValue: {
    color: color.text.muted,
    ...typography.caption2,
  },
  workerCustomerFontText: {
    ...typography.body,
  },
  choiceTitle: {
    color: color.text.strong,
    ...typography.subheadline,
  },
  choiceTitleDark: {
    color: customerTheme.darkLayer.text,
  },
})
