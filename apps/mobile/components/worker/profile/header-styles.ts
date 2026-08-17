import { StyleSheet } from 'react-native'

import { color, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    ...typography.body,
  },
  iconTileMintAura: {
    opacity: 0.72,
  },
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  profileAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 18,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 54,
    ...shadow.soft,
  },
  profileAvatarDark: {
    backgroundColor: '#1D2522',
    borderColor: 'rgba(190,210,205,0.16)',
    boxShadow: '0 10px 22px rgba(0,0,0,0.22)',
  },
  profileAvatarAddGlyph: {
    color: color.brand.primaryDark,
    ...typography.title1,
  },
  profileAvatarAddGlyphDark: {
    color: '#63E6D0',
  },
  profileAvatarEmpty: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  profileAvatarImage: {
    height: '100%',
    width: '100%',
  },
  profileAvatarPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.975 }],
  },
  profileHeader: {
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 82,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 9,
    position: 'relative',
    width: '100%',
    ...shadow.soft,
  },
  profileHeaderDark: {
    backgroundColor: '#171D1B',
    borderColor: 'rgba(190,210,205,0.16)',
    boxShadow: '0 14px 30px rgba(0,0,0,0.24)',
  },
  profileHeaderMeta: {
    color: color.text.muted,
    ...typography.caption2,
  },
  profileHeaderMetaDark: {
    color: '#A9B7B3',
  },
  profileHeaderName: {
    color: color.text.strong,
    ...typography.callout,
  },
  profileHeaderNameDark: {
    color: '#F1F6F4',
  },
  profileHeaderText: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  profileProgressFill: {
    backgroundColor: '#08AF9C',
    borderRadius: 999,
    height: '100%',
  },
  profileProgressTrack: {
    backgroundColor: 'rgba(10,139,125,0.12)',
    borderColor: 'rgba(127,226,215,0.42)',
    borderRadius: 999,
    borderWidth: 1,
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  profileProgressTrackDark: {
    backgroundColor: 'rgba(99,230,208,0.16)',
    borderColor: 'rgba(99,230,208,0.34)',
  },
})
