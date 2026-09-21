import { Platform, StyleSheet, type ViewStyle } from 'react-native'

import { typography } from '@/design/theme'

const customerV21WebFocusRing = Platform.OS === 'web'
  ? ({ outlineColor: 'rgba(13,167,151,0.62)' } as unknown as ViewStyle)
  : {}

export const customerV21ChatStyles = StyleSheet.create({
  chatBubble: {
    borderRadius: 22,
    borderWidth: 1,
    maxWidth: '84%',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chatBubbleCustomer: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 8,
  },
  chatBubbleKael: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 8,
  },
  chatBubbleText: {
    ...typography.footnote,
  },
  kaelResponse: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    maxWidth: '100%',
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  kaelResponseContent: {
    flex: 1,
    minWidth: 0,
  },
  kaelResponseBlock: {
    width: '100%',
  },
  kaelResponseCallout: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  kaelResponseHeading: {
    ...typography.callout,
    fontWeight: '600',
  },
  kaelResponseList: {
    gap: 7,
  },
  kaelResponseListMarker: {
    ...typography.footnote,
    fontWeight: '600',
    minWidth: 20,
  },
  kaelResponseListRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  kaelResponseListText: {
    flex: 1,
    ...typography.subheadline,
  },
  kaelResponseProse: {
    gap: 8,
  },
  kaelResponseText: {
    ...typography.subheadline,
  },
  kaelResponseIdentity: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  chatMediaCameraIcon: {
    height: 20,
    width: 20,
  },
  chatComposerAura: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
  chatComposer: {
    minHeight: 56,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#059B8A',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
  },
  chatComposerDisclaimer: {
    ...typography.caption2,
    fontWeight: '600',
    marginTop: -4,
    paddingBottom: 0,
    textAlign: 'center',
  },
  chatEmptyHero: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 300,
    paddingBottom: 18,
    paddingHorizontal: 24,
    paddingTop: 22,
  },
  chatEmptyHeroContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    maxWidth: 420,
    width: '100%',
  },
  chatEmptyHeroCopy: {
    ...typography.title3,
    flex: 1,
    flexShrink: 1,
    fontWeight: '500',
    maxWidth: 240,
    minWidth: 0,
    textAlign: 'left',
  },
  chatEmptyHeroModelStage: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
  },
  chatFrame: {
    flex: 1,
    gap: 10,
    paddingBottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    position: 'relative',
  },
  chatHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    minHeight: 58,
    zIndex: 21,
  },
  chatHeaderActions: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.72)',
    borderCurve: 'continuous',
    borderRadius: 22,
    borderWidth: 1,
    boxShadow: '0 7px 16px rgba(8,125,114,0.08)',
    flexDirection: 'row',
    height: 44,
    overflow: 'hidden',
  },
  chatHeaderActionsLiquid: {
    borderWidth: 0,
  },
  chatHeaderActionsOpen: {
    borderColor: 'rgba(255,255,255,0.86)',
  },
  chatHeaderModeLabel: {
    alignSelf: 'stretch',
    ...typography.footnote,
    fontWeight: '700',
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
    transform: [{ translateX: -14 }, { translateY: -1 }],
  },
  chatHeaderModeTrigger: {
    ...customerV21WebFocusRing,
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 21,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 11,
    width: 114,
  },
  chatHeaderModeTriggerOpen: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
  },
  chatHeaderNewConversation: {
    ...customerV21WebFocusRing,
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 21,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  chatHeaderNewConversationDisabled: {
    opacity: 0.52,
  },
  chatHeaderSpacer: {
    flex: 1,
    minWidth: 0,
  },
  chatLatestButton: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 16,
    minHeight: 32,
    paddingHorizontal: 14,
    paddingVertical: 7,
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
  },
  chatLatestButtonText: {
    ...typography.caption1,
    fontWeight: '600',
  },
  chatMediaBadge: {
    alignItems: 'center',
    borderRadius: 8,
    height: 16,
    justifyContent: 'center',
    minWidth: 16,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  chatMediaBadgeText: {
    ...typography.caption2,
    fontWeight: '600',
  },
  chatMediaButton: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },
  chatModeButton: {
    position: 'relative',
    zIndex: 1,
  },
  chatModeButtonActive: {
    boxShadow: '0 6px 14px rgba(4,99,88,0.07)',
  },
  chatModeMenu: {
    alignSelf: 'flex-end',
    flexDirection: 'column',
    gap: 3,
    minHeight: 0,
    paddingBottom: 4,
    paddingHorizontal: 4,
    paddingTop: 4,
    position: 'absolute',
    maxWidth: 208,
    right: 16,
    top: 68,
    width: '59%',
    zIndex: 20,
  },
  chatModeMenuButton: {
    borderRadius: 13,
    flex: 0,
    minHeight: 46,
    paddingHorizontal: 10,
    paddingVertical: 5,
    zIndex: 2,
  },
  chatModeMenuCheck: {
    ...typography.callout,
    fontWeight: '600',
    marginLeft: 8,
  },
  chatModeMenuCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  chatModeMenuDescription: {
    ...typography.caption2,
  },
  chatModeMenuOption: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.48)',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  chatModeMenuText: {
    ...typography.caption1,
    fontWeight: '600',
    textAlign: 'left',
  },
  chatModeSwitch: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 18,
    borderWidth: 1,
    boxShadow: '0 10px 22px rgba(8,125,114,0.10)',
    gap: 4,
    minHeight: 46,
    overflow: 'hidden',
    padding: 4,
    position: 'relative',
  },
  chatModeMenuLiquid: {
    borderWidth: 0,
  },
  chatTranscript: {
    flexGrow: 1,
    gap: 8,
    paddingVertical: 6,
  },
  chatTranscriptEmpty: {
    justifyContent: 'center',
  },
  chatTranscriptMenuOpen: {
    paddingTop: 112,
  },
  chatTranscriptScroll: {
    flex: 1,
  },
})

export const customerV21KaelChatRootStyles = StyleSheet.create({
  bodyText: {
    ...typography.footnote,
  },
  composer: {
    // flex-end, not center: the input grows taller as the draft wraps to more
    // lines, and the media/send buttons should stay pinned to the bottom edge
    // instead of drifting toward the middle of the taller row.
    alignItems: 'flex-end',
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 8,
  },
  composerInput: {
    flex: 1,
    ...typography.subheadline,
    minHeight: 44,
    paddingHorizontal: 10,
    // A multiline TextInput does not vertically center its text on its own —
    // browsers and iOS both top-align it — so this padding is what actually
    // levels the placeholder with the icons at the one-line resting height.
    // (44 minHeight - 20 lineHeight) / 2.
    paddingVertical: 12,
    position: 'relative',
    zIndex: 1,
  },
  composerTextFieldShell: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  composerTextFieldStack: {
    flex: 1,
  },
  errorText: {
    ...typography.footnote,
    fontWeight: '600',
    marginTop: 10,
  },
  flex: {
    flex: 1,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: 18,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  modeButtonText: {
    ...typography.footnote,
    fontWeight: '600',
    textAlign: 'center',
  },
  modeSwitch: {
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    padding: 5,
  },
  sendButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    minWidth: 44,
    position: 'relative',
    width: 44,
    zIndex: 1,
  },
})
