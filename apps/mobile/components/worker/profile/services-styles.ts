import { StyleSheet } from 'react-native'

import { color, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    ...typography.body,
  },
  iconTileMintAura: {
    opacity: 0.92,
  },
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  earningsHeroAmount: {
    color: color.text.strong,
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
    marginTop: 7,
    ...typography.title1,
  },
  earningsHeroCard: {
    alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(204,223,219,0.94)',
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 136,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  earningsHeroCopy: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  earningsHeroIcon: {
    height: 42,
    width: 42,
  },
  earningsHeroIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 25,
    borderWidth: 1,
    height: 70,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    width: 70,
  },
  earningsHeroMeta: {
    color: color.text.secondary,
    position: 'relative',
    zIndex: 1,
    ...typography.caption1,
  },
  serviceCardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    position: 'relative',
    zIndex: 1,
  },
  serviceSourceCard: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(204,223,219,0.94)',
    borderRadius: 23,
    borderWidth: 1,
    minHeight: 128,
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 12,
    position: 'relative',
    width: '31.8%',
    ...shadow.soft,
  },
  serviceSourceCardSelected: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(70,194,174,0.58)',
    shadowColor: '#79D8C8',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
  },
  serviceSourceCardInactive: {
    backgroundColor: 'rgba(245,250,249,0.9)',
    borderColor: 'rgba(196,214,211,0.78)',
    opacity: 0.68,
  },
  serviceSourceCardQualityLocked: {
    backgroundColor: 'rgba(255,248,241,0.96)',
    borderColor: 'rgba(220,166,112,0.58)',
  },
  serviceSourceCardPressed: {
    opacity: 0.82,
  },
  serviceSourceCardFull: {
    width: '100%',
  },
  serviceSourceCardHalf: {
    width: '48.7%',
  },
  serviceSourceCopy: {
    gap: 4,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  serviceSourceIcon: {
    height: 42,
    width: 42,
  },
  serviceSourceIconTile: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 22,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    marginBottom: 10,
    overflow: 'hidden',
    position: 'relative',
    width: 64,
    zIndex: 1,
  },
  serviceSourceIntegratedIcon: {
    marginBottom: 10,
  },
  serviceSourceIntegratedIconPlain: {
    backgroundColor: 'transparent',
  },
  serviceSourceMeta: {
    color: color.text.muted,
    textAlign: 'center',
    ...typography.caption2,
  },
  serviceSourceTitle: {
    color: color.text.strong,
    textAlign: 'center',
    ...typography.caption2,
  },
  serviceQualityNotice: {
    color: '#8A552D',
    marginTop: 4,
    textAlign: 'center',
    ...typography.caption2,
  },
  servicePreferenceControls: {
    gap: 8,
    marginTop: 3,
    width: '100%',
  },
  servicePreferenceHelper: {
    color: color.text.secondary,
    paddingHorizontal: 4,
    ...typography.caption1,
  },
  servicePreferenceMessage: {
    color: color.text.secondary,
    paddingHorizontal: 4,
    ...typography.caption1,
  },
  servicePreferenceSave: {
    minHeight: 52,
  },
  skillsServiceHeroAmount: {
    marginTop: 0,
    ...typography.title1,
  },
  skillsServiceHeroCopy: {
    gap: 6,
    justifyContent: 'center',
  },
})
