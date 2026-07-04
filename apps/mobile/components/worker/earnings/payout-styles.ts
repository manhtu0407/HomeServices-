import { StyleSheet } from 'react-native'

import { color, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    fontFamily: typography.fontFamily,
  },
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  boundaryBody: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    position: 'relative',
    zIndex: 1,
  },
  boundaryTitle: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    position: 'relative',
    zIndex: 1,
  },
  payoutAmountCurrency: {
    color: color.text.secondary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    position: 'relative',
    zIndex: 1,
  },
  payoutAmountInputCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: color.brand.primary,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 54,
    overflow: 'hidden',
    paddingHorizontal: 14,
    position: 'relative',
  },
  payoutAmountInputValue: {
    color: color.brand.primaryDark,
    flex: 1,
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 25,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  payoutLimitPolicyCard: {
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 22,
    borderWidth: 1,
    gap: 7,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 12,
    position: 'relative',
    ...shadow.soft,
  },
  payoutLimitPolicyCopy: {
    textAlign: 'justify',
  },
})
