import { StyleSheet } from 'react-native'

import { color, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  darkText: {
    color: '#F1F6F4',
  },
  stack: {
    gap: 18,
  },
  summary: {
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  summaryBody: {
    color: color.text.secondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  summaryTitle: {
    color: color.text.strong,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  workerCustomerFontText: {
    fontFamily: typography.fontFamily,
  },
})
