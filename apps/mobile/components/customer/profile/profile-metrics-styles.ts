import { typography } from '@/design/theme'
import { StyleSheet } from 'react-native'

export const customerV21ProfileMetricStyles = StyleSheet.create({
  caseOverviewScoreHighlight: {
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderRadius: 999,
    height: 12,
    left: 12,
    position: 'absolute',
    right: 12,
    top: 6,
  },
  caseOverviewScoreInside: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
  },
  caseOverviewScoreSvg: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }],
    zIndex: 1,
  },
  profileCompactMintAura: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
  profileLiquidScore: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
    position: 'relative',
  },
  profileLiquidScoreLarge: {
    alignSelf: 'center',
  },
  profileScoreLabel: {
    ...typography.caption2,
    fontWeight: '600',
    maxWidth: 82,
    textAlign: 'center',
  },
  profileScoreLabelLarge: {
    ...typography.caption2,
    maxWidth: 86,
  },
  profileScoreLens: {
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#04665B',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 24,
    zIndex: 1,
  },
  profileScoreMeta: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 82,
  },
  profileScoreMetaLarge: {
    maxWidth: 88,
  },
  profileScoreSubLabel: {
    ...typography.caption2,
    fontWeight: '600',
    maxWidth: 82,
    textAlign: 'center',
  },
  profileScoreSubLabelLarge: {
    ...typography.caption2,
    maxWidth: 88,
  },
  profileScoreValue: {
    ...typography.title1,
    fontWeight: '600',
  },
  profileScoreValueLarge: {
    ...typography.largeTitle,
  },
  profileScoreValueStatus: {
    ...typography.title3,
    maxWidth: 72,
    textAlign: 'center',
  },
  profileScoreValueStatusLarge: {
    maxWidth: 98,
  },
  profileStatCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 76,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 12,
    position: 'relative',
    shadowColor: '#087D72',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
  },
  profileStatCardWithIcon: {
    borderRadius: 20,
    minHeight: 126,
    paddingHorizontal: 6,
    paddingVertical: 14,
  },
  profileStatContent: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },
  profileStatContentWithIcon: {
    gap: 6,
  },
  profileStatIcon: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  profileStatLabel: {
    ...typography.caption1,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  profileStatLabelWithIcon: {
    marginTop: 0,
  },
  profileStatValue: {
    ...typography.title2,
    fontWeight: '600',
    textAlign: 'center',
  },
  profileStatValueWithIcon: {
    ...typography.title3,
    fontWeight: '600',
  },
  profileStatValueCompact: {
    ...typography.body,
  },
})
