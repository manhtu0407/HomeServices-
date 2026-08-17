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
    ...typography.footnote,
  },
  summaryTitle: {
    color: color.text.strong,
    ...typography.callout,
  },
  workerCustomerFontText: {
    ...typography.body,
  },
})
