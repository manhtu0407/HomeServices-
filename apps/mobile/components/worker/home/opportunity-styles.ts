import { StyleSheet } from 'react-native'

import { color, radius, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    fontFamily: typography.fontFamily,
  },
  iconTileMintAura: {
    opacity: 0.92,
  },
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  opportunityCaption: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    marginTop: 3,
  },
  opportunityOpenButton: {
    alignItems: 'center',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: 8,
    minHeight: 28,
    minWidth: 52,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  opportunityOpenButtonText: {
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  opportunityCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 84,
    overflow: 'hidden',
    padding: 11,
    position: 'relative',
    ...shadow.soft,
  },
  opportunityIcon: {
    height: 38,
    width: 38,
  },
  opportunityIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 16,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 48,
  },
  opportunityMeta: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    marginTop: 2,
  },
  opportunityPayout: {
    color: color.brand.primaryDark,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'right',
  },
  opportunityPayoutColumn: {
    alignItems: 'flex-end',
    maxWidth: 104,
    minWidth: 72,
  },
  opportunityTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  opportunityTitle: {
    color: color.text.strong,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
})