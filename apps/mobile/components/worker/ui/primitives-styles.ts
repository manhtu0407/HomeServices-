import { StyleSheet } from 'react-native'

import { color, component, glass, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    ...typography.body,
  },
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: -4,
    paddingHorizontal: 2,
  },
  sectionHeaderJobsReview: {
    marginBottom: -1,
  },
  sectionHeaderAction: {
    color: color.brand.primaryDark,
    ...typography.caption2,
    fontWeight: '600',
  },
  sectionHeaderActionJobsReview: {
    color: '#138E82',
    fontWeight: '600',
  },
  sectionHeaderTitle: {
    color: color.text.strong,
    ...typography.subheadline,
    fontWeight: '600',
  },
  sectionHeaderTitleJobsReview: {
    color: '#123A35',
    fontWeight: '700',
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
  navButtonPrimary: {
    backgroundColor: color.brand.primary,
    borderColor: component.button.primary.border,
    borderWidth: 1,
    boxShadow: component.button.primary.boxShadow,
  },
  navButtonPrimaryText: {
    color: color.text.inverse,
    position: 'relative',
    zIndex: 1,
  },
  navButtonSecondary: {
    backgroundColor: glass.bgStrong,
    borderColor: color.surface.strokeStrong,
    borderWidth: 1,
  },
  navButtonText: {
    color: color.brand.primaryDark,
    ...typography.subheadline,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
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
    boxShadow: component.button.primary.boxShadow,
  },
  primaryActionButtonSource: {
    borderColor: component.button.primary.border,
    borderWidth: 1,
    boxShadow: component.button.primary.boxShadow,
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
})
