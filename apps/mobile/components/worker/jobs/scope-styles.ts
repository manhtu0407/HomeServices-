import { StyleSheet } from 'react-native'
import { createSurfaceShadow } from '@/components/ui/tokens'

import { color, component, glass, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  authorityText: {
    color: color.text.strong,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
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
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  primaryActionButtonSource: {
    backgroundColor: '#13CBB8',
    borderColor: 'rgba(2,126,115,0.22)',
    borderWidth: 1,
    boxShadow: createSurfaceShadow({ color: '#059F8E', offsetY: 14, opacity: 0.27, radius: 28 }),
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
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
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
    lineHeight: 17,
    minWidth: 0,
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
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
    zIndex: 2,
  },
  scopeSubmitDisabled: {
    backgroundColor: 'rgba(229,247,243,0.92)',
    borderColor: color.mint.mint100,
    boxShadow: 'none',
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
    fontFamily: typography.fontFamily,
  },
})
