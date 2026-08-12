import { StyleSheet } from 'react-native'
import { createSurfaceShadow } from '@/components/ui/tokens'

import { color, radius, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    fontFamily: typography.fontFamily,
  },
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  earningsHeroAmount: {
    color: color.text.strong,
    flexShrink: 1,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 33,
    marginTop: 7,
  },
  earningsHeroCard: {
    alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 0,
    minHeight: 136,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  earningsHeroCopy: {
    flex: 1,
    justifyContent: 'center',
    marginLeft: 46,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  earningsHeroMeta: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    position: 'relative',
    zIndex: 1,
  },
  memorySwitchCopy: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    marginLeft: 46,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  memorySwitchList: {
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 25,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  memorySwitchRow: {
    alignItems: 'stretch',
    borderBottomColor: 'rgba(176,222,214,0.38)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 0,
    minHeight: 86,
    paddingHorizontal: 12,
    paddingVertical: 0,
    position: 'relative',
    zIndex: 1,
  },
  memorySwitchRowLast: {
    borderBottomWidth: 0,
  },
  memorySwitchTitle: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  memorySwitchValue: {
    color: color.text.secondary,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  toggleKnob: {
    backgroundColor: color.mint.white,
    borderRadius: 10,
    boxShadow: createSurfaceShadow({ color: color.text.strong, offsetY: 3, opacity: 0.12, radius: 8 }),
    height: 20,
    width: 20,
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
  toggleTrackOn: {
    backgroundColor: color.brand.primary,
  },
})
