import { StyleSheet } from 'react-native'

import { spacing } from '@/design/theme'

import { workerIncomeDashboardTokens as incomeTokens } from './income-dashboard-tokens'

export const styles = StyleSheet.create({
  sectionStack: {
    alignSelf: 'center',
    backgroundColor: incomeTokens.colors.opaqueTint,
    maxWidth: 520,
    width: '100%',
  },
  productionContent: {
    backgroundColor: incomeTokens.colors.page,
    gap: 14,
    overflow: 'hidden',
    paddingBottom: incomeTokens.layout.overviewBottomClearance + spacing.xxxl,
    paddingHorizontal: incomeTokens.layout.screenGutter + incomeTokens.layout.contentInset,
    paddingTop: spacing.lg,
    position: 'relative',
  },
  productionBackground: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    transform: [{ scaleY: -1 }],
  },
})
