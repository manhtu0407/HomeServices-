import { StyleSheet } from 'react-native'

import { color, radius, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    fontFamily: typography.fontFamily,
  },
  iconTileMintAura: {
    opacity: 0.92,
  },
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.992 }],
  },
  approvalDecisionCopy: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    marginLeft: 46,
    minWidth: 0,
  },
  approvalDecisionIcon: {
    height: 42,
    width: 42,
  },
  approvalDecisionIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 22,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    width: 64,
  },
  approvalDecisionList: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(204,223,219,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow.soft,
  },
  approvalDecisionMeta: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  approvalDecisionRow: {
    alignItems: 'stretch',
    borderBottomColor: 'rgba(176,222,214,0.38)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 0,
    minHeight: 94,
    padding: 12,
    position: 'relative',
  },
  approvalDecisionRowPrimary: {
    minHeight: 94,
  },
  approvalDecisionStatus: {
    alignSelf: 'center',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    maxWidth: 92,
    marginLeft: 10,
    minWidth: 54,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: 'center',
  },
  approvalDecisionTitle: {
    color: color.text.strong,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  approvalDecisionTitlePrimary: {
    fontSize: 13,
    lineHeight: 17,
  },
  approvalServiceDetail: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  approvalServiceDivider: {
    backgroundColor: 'rgba(190,214,210,0.88)',
    height: 18,
    marginHorizontal: 5,
    width: 1,
  },
  approvalServiceList: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  approvalServiceMeta: {
    color: color.text.secondary,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  profileDossierRowAura: {
    opacity: 0.7,
    right: -72,
    top: -92,
  },
})
