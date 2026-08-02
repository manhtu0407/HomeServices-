import { StyleSheet } from 'react-native'

import { color, component, glass, radius, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: {
    fontFamily: typography.fontFamily,
  },
  iconButtonIcon: {
    flexShrink: 0,
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
  sectionHeaderAction: {
    color: color.brand.primaryDark,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  sectionHeaderTitle: {
    color: color.text.strong,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
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
    ...shadow.primary,
  },
  navButtonPrimaryText: {
    color: color.text.inverse,
  },
  navButtonSecondary: {
    backgroundColor: glass.bgStrong,
    borderColor: color.surface.strokeStrong,
    borderWidth: 1,
  },
  navButtonText: {
    color: color.brand.primaryDark,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 19,
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
  primaryActionText: {
    color: color.text.inverse,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
    zIndex: 2,
  },
  primaryActionTopHighlight: {
    backgroundColor: 'rgba(255,255,255,0.64)',
    borderRadius: radius.pill,
    height: 1,
    left: 28,
    opacity: 0.8,
    position: 'absolute',
    right: 28,
    top: 1,
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
