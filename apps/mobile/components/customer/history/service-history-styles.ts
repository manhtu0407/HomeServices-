import { StyleSheet } from 'react-native'

export const customerV21ServiceHistoryStyles = StyleSheet.create({
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
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
  favoriteButton: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  favoriteIcon: {
    fontSize: 22,
    includeFontPadding: false,
    lineHeight: 22,
    textAlign: 'center',
    textAlignVertical: 'center',
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
  filterChipAura: {
    ...StyleSheet.absoluteFill,
    opacity: 0.94,
    zIndex: 0,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
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
  filterRailWrap: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    width: '100%',
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
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  historyGroup: {
    gap: 9,
  },
  historyGroupItems: {
    gap: 10,
  },
  historyGroupLabel: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  historyItemHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  historyItemMeta: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  historyItemTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
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
  historySectionTitle: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.35,
    lineHeight: 27,
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
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  priceEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  priceSlot: {
    flex: 1,
    minHeight: 36,
  },
  priceValue: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 1,
  },
  rebookButton: {
    minWidth: 84,
  },
  savedWorkerHint: {
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  savedWorkerHintContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    position: 'relative',
    zIndex: 1,
  },
  savedWorkerHintIcon: {
    fontSize: 16,
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
  statusPill: {
    borderRadius: 13,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  supportButton: {
    minWidth: 76,
  },
  workerAvatar: {
    borderRadius: 23,
    height: 46,
    width: 46,
  },
  workerAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  workerAvatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  workerCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  workerEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  workerName: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  workerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    marginBottom: 8,
    marginTop: -8,
  },
  workerUnavailable: {
    fontSize: 12,
    lineHeight: 18,
  },
})
