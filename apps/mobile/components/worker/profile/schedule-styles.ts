import { StyleSheet } from 'react-native'

import { color, customerTheme, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  darkText: {
    color: customerTheme.darkLayer.text,
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
  summaryDivider: {
    backgroundColor: 'rgba(202,222,218,0.78)',
    height: 1,
    marginHorizontal: 16,
  },
  summaryTitle: {
    color: color.text.strong,
    ...typography.callout,
  },
  workerCustomerFontText: {
    ...typography.body,
  },
})
