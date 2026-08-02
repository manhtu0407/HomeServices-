import { StyleSheet } from 'react-native'

import { color, radius, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  choiceBody: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  choiceBodyDark: {
    color: '#A9B7B3',
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
    borderColor: 'rgba(190,210,205,0.34)',
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
    backgroundColor: '#1D2522',
    borderColor: 'rgba(190,210,205,0.16)',
  },
  choiceRowSelected: {
    backgroundColor: 'rgba(231, 250, 246, 0.95)',
    borderColor: color.brand.primary,
  },
  choiceRowSelectedDark: {
    backgroundColor: '#173832',
    borderColor: '#63E6D0',
  },
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.992 }],
  },
  toggleKnob: {
    backgroundColor: color.mint.white,
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
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  toggleList: {
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow.soft,
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
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  workerCustomerFontText: {
    fontFamily: typography.fontFamily,
  },
  choiceTitle: {
    color: color.text.strong,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  choiceTitleDark: {
    color: '#F1F6F4',
  },
})
