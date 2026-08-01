import { StyleSheet } from 'react-native'

import { color, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    fontFamily: typography.fontFamily,
  },
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  policyCard: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 18,
    position: 'relative',
    ...shadow.soft,
  },
  rateHeader: {
    position: 'relative',
    zIndex: 1,
  },
  rateCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    lineHeight: 14,
  },
  rateValue: {
    color: color.brand.primaryDark,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
    marginTop: 2,
  },
  rateMeta: {
    color: color.text.secondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 1,
  },
  sectionTitle: {
    color: color.text.strong,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
    marginTop: 24,
    position: 'relative',
    zIndex: 1,
  },
  paragraph: {
    color: color.text.secondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    position: 'relative',
    zIndex: 1,
  },
  pointList: {
    gap: 10,
    marginTop: 15,
    position: 'relative',
    zIndex: 1,
  },
  point: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  pointDot: {
    backgroundColor: color.brand.primary,
    borderRadius: 5,
    height: 7,
    marginTop: 6,
    width: 7,
  },
  pointCopy: {
    color: color.text.secondary,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  progressCard: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.stroke,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 20,
    padding: 14,
    position: 'relative',
    zIndex: 1,
  },
  progressTitle: {
    color: color.text.strong,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  progressCopy: {
    color: color.text.secondary,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 6,
  },
  footnote: {
    color: color.text.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 16,
    position: 'relative',
    zIndex: 1,
  },
})
