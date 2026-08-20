import { StyleSheet } from 'react-native'

import { color, component, glass, radius, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    ...typography.body,
  },
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  actionRailButtonText: {
    ...typography.footnote,
  },
  actionRailFormulaAura: {
    bottom: -42,
    left: -34,
    opacity: 0.82,
    right: -34,
    top: -48,
  },
  actionRailPrimaryText: {
    color: color.brand.primaryDark,
  },
  actionRailZipAura: {
    bottom: -18,
    height: 118,
    left: '42%',
    opacity: 0.56,
    right: -42,
    top: -26,
  },
  chatBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: color.surface.stroke,
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: '86%',
    minWidth: 0,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  chatBubbleBody: {
    color: color.text.strong,
    ...typography.caption1,
    fontWeight: '600',
  },
  chatBubbleLabel: {
    color: color.text.muted,
    ...typography.caption2,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'right',
  },
  chatBubbleRight: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(197,248,235,0.72)',
    borderColor: 'rgba(13,174,154,0.25)',
  },
  navButton: {
    alignItems: 'center',
    borderRadius: component.button.secondary.radius,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 14,
    position: 'relative',
    zIndex: 1,
  },
  navButtonDisabled: {
    opacity: 0.52,
  },
  navButtonDisabledText: {
    color: color.text.muted,
  },
  navButtonJobsReview: {
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  navButtonPrimary: {
    backgroundColor: color.brand.primary,
    ...shadow.primary,
  },
  navButtonPrimaryJobsReview: {
    backgroundColor: '#0EA897',
    borderColor: '#0A8D80',
    borderWidth: 1,
  },
  navButtonPrimaryText: {
    color: color.text.inverse,
  },
  navButtonSecondary: {
    backgroundColor: glass.bgStrong,
    borderColor: color.surface.strokeStrong,
    borderWidth: 1,
  },
  navButtonSecondaryJobsReview: {
    backgroundColor: '#FFFFFF',
    borderColor: '#B9DFD9',
  },
  navButtonText: {
    color: color.brand.primaryDark,
    ...typography.subheadline,
    fontWeight: '600',
    textAlign: 'center',
  },
  navButtonTextJobsReview: {
    ...typography.callout,
    fontWeight: '600',
  },
  navigationRow: {
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    position: 'relative',
  },
  navigationRowJobsReview: {
    gap: 10,
    minHeight: 52,
  },
  onsiteAdvisoryRail: {
    backgroundColor: 'rgba(239, 251, 246, 0.9)',
    borderColor: color.mint.mint100,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  onsiteAdvisoryText: {
    color: color.text.strong,
    ...typography.caption1,
    fontWeight: '600',
  },
  primaryActionButton: {
    alignItems: 'center',
    backgroundColor: color.brand.primary,
    borderColor: component.button.primary.border,
    borderRadius: 26,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
    overflow: 'hidden',
    paddingHorizontal: 18,
    position: 'relative',
    ...shadow.primary,
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
  primaryActionButtonJobsReview: {
    backgroundColor: '#11B5A4',
    borderColor: '#0C9588',
    borderRadius: 16,
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  primaryActionText: {
    color: color.text.inverse,
    ...typography.callout,
    fontWeight: '600',
    zIndex: 2,
  },
  sourceActionDisabled: {
    backgroundColor: component.button.disabled.bg,
    borderColor: component.button.disabled.border,
    shadowOpacity: 0,
  },
  sourceActionDisabledText: {
    color: component.button.disabled.text,
  },
  suggestionChip: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: '32%',
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  suggestionChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChipText: {
    color: color.brand.primaryDark,
    ...typography.caption2,
    fontWeight: '600',
    textAlign: 'center',
  },
})
