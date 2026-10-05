import { StyleSheet } from 'react-native'

import { color, customerTheme, shadow, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  actionDivider: {
    alignSelf: 'center',
    backgroundColor: 'rgba(13, 127, 112, 0.11)',
    height: 24,
    width: StyleSheet.hairlineWidth,
  },
  actionMenu: {
    ...shadow.soft,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(252,255,254,0.98)',
    borderColor: 'rgba(171, 220, 213, 0.72)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 44,
    overflow: 'hidden',
    width: '100%',
  },
  actionRow: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 3,
  },
  actionRowPressed: {
    backgroundColor: 'rgba(224, 247, 242, 0.78)',
  },
  actionText: {
    color: color.text.strong,
    ...typography.caption2,
    fontWeight: '600',
  },
  check: {
    color: color.brand.primary,
    ...typography.callout,
    fontWeight: '600',
    marginLeft: 5,
  },
  deleteActionText: {
    color: '#E5484D',
    ...typography.caption2,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.48,
  },
  error: {
    color: '#D94C51',
    ...typography.caption2,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  feedback: {
    color: color.text.muted,
    ...typography.caption2,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  menuGlass: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  menuInner: {
    gap: 3,
  },
  menuPosition: {
    maxWidth: 208,
    position: 'absolute',
    right: 10,
    top: 74,
    width: '59%',
    zIndex: 42,
  },
  menuContent: {
    gap: 8,
    overflow: 'hidden',
    padding: 6,
  },
  moreButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 13,
    elevation: 2,
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
    position: 'relative',
    width: 44,
    zIndex: 2,
  },
  moreButtonOpen: {
    backgroundColor: 'rgba(217, 246, 240, 0.78)',
  },
  pinnedIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 3,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  pressedReduced: {
    opacity: 0.78,
  },
  session: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderCurve: 'continuous',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 44,
    overflow: 'hidden',
    position: 'relative',
  },
  sessionCopy: {
    flex: 1,
    gap: 0,
    minWidth: 0,
  },
  sessionGroup: {
    gap: 3,
  },
  sessionList: {
    gap: 3,
  },
  sessionListViewport: {
    maxHeight: 138,
  },
  renameActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
    paddingRight: 7,
  },
  sessionMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minHeight: 44,
    minWidth: 0,
    paddingLeft: 8,
    paddingRight: 8,
    position: 'relative',
    zIndex: 0,
  },
  sessionMeta: {
    color: color.text.muted,
    ...typography.caption2,
  },
  sessionTitle: {
    color: color.text.strong,
    flexShrink: 1,
    ...typography.caption2,
    fontWeight: '600',
  },
  sessionTitleInput: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  sessionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    minWidth: 0,
  },
  statusDot: {
    backgroundColor: 'rgba(143, 174, 169, 0.68)',
    borderRadius: 4,
    height: 6,
    marginRight: 7,
    width: 6,
  },
  statusDotSelected: {
    backgroundColor: color.brand.primary,
  },
})

// Dark overrides for the light menu above, from the shared neutral dark tokens.
const dark = customerTheme.darkLayer
export const darkStyles = StyleSheet.create({
  actionDivider: { backgroundColor: dark.border },
  actionMenu: { backgroundColor: dark.raised, borderColor: dark.glassBorder },
  actionRowPressed: { backgroundColor: dark.ghost },
  actionText: { color: dark.text },
  check: { color: dark.primary },
  deleteActionText: { color: dark.danger },
  error: { color: dark.danger },
  feedback: { color: dark.muted },
  sessionMeta: { color: dark.muted },
  sessionTitle: { color: dark.text },
})
