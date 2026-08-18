import { StyleSheet } from 'react-native'

import { typography } from '@/design/theme'

export const customerV21ServiceHistoryStyles = StyleSheet.create({
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    justifyContent: 'flex-end',
  },
  dealFooter: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  detailButton: {
    minWidth: 118,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  favoriteButton: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: 44,
    justifyContent: 'center',
    minWidth: 84,
    paddingHorizontal: 11,
  },
  favoriteLabel: {
    ...typography.caption1,
    fontWeight: '700',
  },
  filterChip: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    overflow: 'hidden',
    paddingHorizontal: 15,
    position: 'relative',
  },
  filterChipText: {
    ...typography.footnote,
    fontWeight: '600',
    position: 'relative',
    zIndex: 1,
  },
  filterIndicatorHighlight: {
    borderRadius: 999,
    height: 1,
    left: 5,
    position: 'absolute',
    right: 5,
    top: 0,
  },
  filterIndicatorThumb: {
    borderRadius: 999,
    height: 3,
  },
  filterIndicatorTrack: {
    alignSelf: 'center',
    borderRadius: 999,
    height: 3,
    marginTop: 3,
  },
  filterRail: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    marginTop: 12,
    width: '100%',
  },
  filterRailContent: {
    gap: 8,
    paddingHorizontal: 1,
    paddingVertical: 3,
  },
  filterRailDragSurface: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    width: '100%',
  },
  filterRailFade: {
    height: 44,
    position: 'absolute',
    right: 0,
    top: 12,
    width: 32,
    zIndex: 2,
  },
  filterRailWrap: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    width: '100%',
  },
  filterIcon: {
    height: 21,
    position: 'relative',
    width: 21,
    zIndex: 1,
  },
  historyCard: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  historyAuraCard: {
    gap: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  historyAuraStack: {
    gap: 14,
    position: 'relative',
    zIndex: 1,
  },
  historyCardContent: {
    gap: 14,
    position: 'relative',
    zIndex: 1,
  },
  historyCount: {
    ...typography.footnote,
    fontWeight: '600',
  },
  historyGroup: {
    gap: 9,
  },
  historyGroupItems: {
    gap: 10,
  },
  historyGroupLabel: {
    ...typography.footnote,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  historyItemHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  historyMetaCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 8,
  },
  historyItemMeta: {
    flex: 1,
    ...typography.footnote,
    fontWeight: '600',
  },
  historyItemTitle: {
    ...typography.headline,
  },
  historyList: {
    gap: 18,
    marginTop: 4,
  },
  historySectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 18,
  },
  loadingCard: {
    gap: 0,
  },
  loadingCardContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    position: 'relative',
    width: '100%',
    zIndex: 1,
  },
  loadingText: {
    flex: 1,
    ...typography.footnote,
    fontWeight: '600',
  },
  priceEyebrow: {
    ...typography.caption1,
    fontWeight: '600',
  },
  priceSlot: {
    flex: 1,
    minHeight: 44,
  },
  priceValue: {
    ...typography.headline,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  rebookButton: {
    minWidth: 84,
  },
  historyErrorCard: {
    alignItems: 'center',
    borderRadius: 26,
    paddingBottom: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  historyErrorContent: {
    alignItems: 'center',
    position: 'relative',
    width: '100%',
    zIndex: 1,
  },
  historyErrorIconFrame: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginTop: -2,
    width: 48,
  },
  historyErrorIllustration: {
    height: 224,
    maxWidth: 340,
    width: '100%',
  },
  historyErrorIllustrationDark: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
  },
  historyErrorBody: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    maxWidth: 310,
    textAlign: 'center',
  },
  historyErrorRetry: {
    marginTop: 16,
    minHeight: 44,
    minWidth: 216,
  },
  historyErrorTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 23,
    marginTop: 12,
    textAlign: 'center',
  },
  savedWorkerHint: {
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  savedWorkerHintContent: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    position: 'relative',
    zIndex: 1,
  },
  savedWorkerHintCopy: {
    flex: 1,
    gap: 2,
  },
  savedWorkerHintIconTile: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  savedWorkerHintTitle: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  savedWorkerHintText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  screenContent: {
    alignSelf: 'center',
    minWidth: 0,
  },
  stateMark: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  statusPill: {
    borderRadius: 13,
    borderWidth: 1,
    flexShrink: 0,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusPillText: {
    ...typography.caption1,
    fontWeight: '600',
  },
  supportButton: {
    minWidth: 76,
  },
  workerAvatar: {
    borderWidth: 1,
    borderRadius: 23,
    height: 46,
    width: 46,
  },
  workerAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  workerCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  workerEyebrow: {
    ...typography.caption1,
    fontWeight: '600',
  },
  workerName: {
    ...typography.callout,
    fontWeight: '600',
  },
  workerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
  },
  workerUnavailable: {
    ...typography.caption1,
  },
})
