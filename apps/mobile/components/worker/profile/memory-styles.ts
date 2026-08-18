import { StyleSheet } from 'react-native'

import { color, radius, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    ...typography.body,
  },
  opaqueCard: {
    backgroundColor: color.surface.base,
  },
  darkOpaqueCard: {
    backgroundColor: '#111614',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  earningsHeroAmount: {
    color: color.text.strong,
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
    ...typography.title3,
  },
  earningsHeroCard: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: 'rgba(205,225,221,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 96,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...shadow.soft,
  },
  earningsHeroCardDark: {
    backgroundColor: '#171D1B',
    borderColor: 'rgba(190,210,205,0.16)',
  },
  earningsHeroCopy: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  earningsHeroMeta: {
    color: color.text.secondary,
    ...typography.caption1,
  },
  memoryHeroIconFrame: {
    alignItems: 'center',
    borderColor: 'rgba(205,225,221,0.94)',
    borderRadius: 17,
    borderWidth: 1,
    flexShrink: 0,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  memoryHeroIconFrameDark: {
    borderColor: 'rgba(190,210,205,0.16)',
  },
  memorySwitchCopy: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    minWidth: 0,
  },
  memorySwitchList: {
    backgroundColor: color.surface.base,
    borderColor: 'rgba(205,225,221,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow.soft,
  },
  memorySwitchListDark: {
    backgroundColor: '#171D1B',
    borderColor: 'rgba(190,210,205,0.16)',
  },
  memorySwitchRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(176,222,214,0.38)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  memorySwitchRowDark: {
    borderBottomColor: 'rgba(190,210,205,0.16)',
  },
  memorySwitchRowLast: {
    borderBottomWidth: 0,
  },
  memorySwitchTitle: {
    color: color.text.strong,
    ...typography.subheadline,
  },
  darkText: {
    color: '#F1F6F4',
  },
  memorySwitchIconFrame: {
    alignItems: 'center',
    borderColor: 'rgba(205,225,221,0.94)',
    borderRadius: 14,
    borderWidth: 1,
    flexShrink: 0,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  memorySwitchIconFrameDark: {
    borderColor: 'rgba(190,210,205,0.16)',
  },
  memorySwitchValue: {
    color: color.text.secondary,
    ...typography.caption2,
  },
  memorySwitchValueDark: {
    color: '#A9B7B3',
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
  toggleKnobDark: {
    backgroundColor: '#F1F6F4',
  },
  toggleKnobOn: {
    marginLeft: 18,
  },
  toggleTrack: {
    backgroundColor: '#DFE9E7',
    borderRadius: radius.pill,
    flexShrink: 0,
    height: 26,
    marginRight: 2,
    alignSelf: 'center',
    padding: 3,
    width: 44,
  },
  toggleTrackDark: {
    backgroundColor: 'rgba(190,210,205,0.22)',
  },
  toggleTrackOn: {
    backgroundColor: color.brand.primary,
  },
})
