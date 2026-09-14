import { StyleSheet } from 'react-native'

import { typography } from '@/design/theme'

export const stageTwoStyles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    alignItems: 'center',
    borderRadius: 17,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 14,
  },
  actionLabel: {
    ...typography.body,
    fontWeight: '700',
    textAlign: 'center',
  },
  hero: {
    alignItems: 'stretch',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 168,
    overflow: 'hidden',
  },
  heroWorkart: {
    alignSelf: 'stretch',
    height: '100%',
    width: '100%',
  },
  heroWorkartPanel: {
    alignSelf: 'stretch',
    flexBasis: '40%',
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: 'center',
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
    width: '40%',
  },
  heroWorkartWash: {
    bottom: 0,
    position: 'absolute',
    right: -1,
    top: 0,
    width: 42,
  },
  heroCopy: {
    flex: 1,
    gap: 7,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  heroMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  heroMetaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minHeight: 22,
  },
  heroMetaText: {
    ...typography.caption2,
    fontWeight: '600',
  },
  heroPrice: {
    ...typography.caption1,
    fontWeight: '500',
  },
  heroService: {
    ...typography.title2,
    fontWeight: '700',
  },
  heroArea: {
    ...typography.footnote,
    fontWeight: '500',
  },
  section: {
    gap: 8,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sectionTitle: {
    ...typography.body,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
  },
  sectionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 80,
    paddingVertical: 11,
  },
  sectionRowDivider: {
    borderTopWidth: 1,
  },
  sectionIconFrame: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexShrink: 0,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  sectionRowCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  sectionRowTitle: {
    ...typography.footnote,
    fontWeight: '700',
  },
  sectionRowMeta: {
    ...typography.caption1,
    fontWeight: '500',
  },
  sectionRowStatus: {
    ...typography.caption2,
    fontWeight: '700',
    maxWidth: 104,
    textAlign: 'right',
  },
  checklistRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 78,
    paddingVertical: 10,
  },
  checklistCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  checklistLabel: {
    ...typography.footnote,
    fontWeight: '700',
  },
  checklistMeta: {
    ...typography.caption1,
    fontWeight: '500',
  },
  checklistState: {
    ...typography.caption2,
    fontWeight: '700',
    maxWidth: 76,
    textAlign: 'right',
  },
  etaCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 80,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  etaCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  etaTitle: {
    ...typography.footnote,
    fontWeight: '700',
  },
  etaMeta: {
    ...typography.caption1,
    fontWeight: '500',
  },
})
