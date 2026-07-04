import { StyleSheet } from 'react-native'

import { color, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    fontFamily: typography.fontFamily,
  },
  acceptConfirmButton: {
    alignItems: 'center',
    backgroundColor: '#13CBB8',
    borderColor: 'rgba(0,137,124,0.2)',
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
    overflow: 'hidden',
    paddingHorizontal: 18,
    position: 'relative',
    shadowColor: '#059F8E',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.27,
    shadowRadius: 28,
  },
  acceptConfirmDisabled: {
    opacity: 0.88,
  },
  acceptConfirmText: {
    color: color.text.inverse,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    zIndex: 1,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  primaryActionButtonSource: {
    backgroundColor: '#13CBB8',
    borderColor: 'rgba(2,126,115,0.22)',
    borderWidth: 1,
    shadowColor: '#059F8E',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.27,
    shadowRadius: 28,
  },
})
