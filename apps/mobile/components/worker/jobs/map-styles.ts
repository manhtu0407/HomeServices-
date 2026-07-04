import { StyleSheet } from 'react-native'

import { color, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    fontFamily: typography.fontFamily,
  },
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  etaLabel: {
    color: color.text.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  etaLens: {
    alignItems: 'center',
    backgroundColor: 'rgba(230,251,243,0.72)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 34,
    borderWidth: 1,
    height: 68,
    justifyContent: 'center',
    position: 'relative',
    width: 68,
    zIndex: 1,
    ...shadow.soft,
  },
  etaLensLabel: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
  etaLensValue: {
    color: color.brand.primaryDark,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  etaMeta: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 2,
  },
  etaSummaryCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 112,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  etaSummaryCopy: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  routeEtaSummaryAura: {
    bottom: -88,
    height: 280,
    left: -72,
    opacity: 1,
    right: -58,
    top: -84,
  },
  routeEtaSummaryZipAura: {
    height: 240,
    opacity: 0.82,
    right: -92,
    top: -76,
    width: 324,
  },
  etaValue: {
    color: color.text.strong,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 27,
    marginTop: 4,
  },
})
