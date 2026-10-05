import { StyleSheet } from 'react-native'

import { color, component, glass, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  authorityText: {
    color: color.text.strong,
    ...typography.subheadline,
    fontWeight: '600',
  },
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 30,
    borderWidth: 1,
    gap: 10,
    overflow: 'hidden',
    padding: 18,
    position: 'relative',
    ...shadow.raised,
  },
  iconTileMintAura: {
    opacity: 0.92,
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
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  primaryActionButtonSource: {
    borderColor: component.button.primary.border,
    borderWidth: 1,
    boxShadow: component.button.primary.boxShadow,
  },
  privateKaelMediaImage: {
    backgroundColor: color.mint.mint100,
    borderRadius: 10,
    height: 42,
    width: 42,
  },
  privateKaelMediaPreview: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: color.mint.mint100,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    maxWidth: 190,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  privateKaelMediaRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  privateKaelMediaText: {
    color: color.text.strong,
    flexShrink: 1,
    ...typography.caption1,
    fontWeight: '600',
  },
  scopePhotoPickerButton: {
    flexBasis: 112,
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 50,
    paddingHorizontal: 12,
  },
  scopePhotoPickerHint: {
    flex: 1,
    minWidth: 0,
    ...typography.body,
  },
  scopePhotoPickerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  scopeSubmitButton: {
    flex: 0,
    minHeight: 54,
    width: '100%',
  },
  scopeSubmitButtonText: {
    color: color.text.inverse,
    ...typography.subheadline,
    fontWeight: '600',
    textAlign: 'center',
    zIndex: 2,
  },
  scopeSubmitDisabled: {
    backgroundColor: 'rgba(229,247,243,0.92)',
    borderColor: color.mint.mint100,
    shadowOpacity: 0,
  },
  scopeSubmitDisabledText: {
    color: color.brand.primaryDark,
    opacity: 0.58,
  },
  sectionStack: {
    gap: 14,
  },
  workerChatTextFieldShell: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  workerChatTextFieldStack: {
    flex: 1,
  },
  workerCustomerFontText: {
    ...typography.body,
  },
})
