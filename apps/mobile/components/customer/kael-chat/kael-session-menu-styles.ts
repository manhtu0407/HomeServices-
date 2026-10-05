import { StyleSheet } from 'react-native'

import { typography } from '@/design/theme'

export const styles = StyleSheet.create({
  actionButton: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 44, minWidth: 0, paddingHorizontal: 3 },
  actionMenu: { backgroundColor: 'rgba(252,255,254,0.98)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', minHeight: 44, overflow: 'hidden' },
  actionText: { ...typography.caption2, fontWeight: '600' },
  check: { ...typography.callout, fontWeight: '600', marginLeft: 4 },
  disabled: { opacity: 0.48 },
  error: { ...typography.caption2, color: '#D94C51', fontWeight: '600', paddingHorizontal: 4 },
  feedback: { ...typography.caption2, fontWeight: '600', paddingHorizontal: 4 },
  menuGlass: { borderRadius: 18, overflow: 'hidden' },
  menuContent: { gap: 8, overflow: 'hidden', padding: 6 },
  menuPosition: { maxWidth: 208, position: 'absolute', right: 10, top: 74, width: '59%', zIndex: 42 },
  renameActions: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: 6, paddingRight: 7 },
  moreButtonOpen: { backgroundColor: 'rgba(217,246,240,0.78)' },
  session: { alignItems: 'center', backgroundColor: 'rgba(250,253,252,0.96)', borderCurve: 'continuous', borderRadius: 16, borderWidth: 1, flexDirection: 'row', minHeight: 44, overflow: 'hidden', position: 'relative' },
  sessionCopy: { flex: 1, gap: 0, minWidth: 0 },
  sessionGroup: { gap: 3 },
  sessionList: { gap: 3 },
  sessionListViewport: { maxHeight: 138 },
  sessionMain: { alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: 44, minWidth: 0, paddingLeft: 8, paddingRight: 8, position: 'relative', zIndex: 0 },
  moreButton: { alignItems: 'center', alignSelf: 'stretch', borderRadius: 13, flexShrink: 0, justifyContent: 'center', minHeight: 44, minWidth: 44, position: 'relative', width: 44, zIndex: 2, elevation: 2 },
  sessionMeta: { ...typography.caption2 },
  sessionTitle: { ...typography.caption2, flexShrink: 1, fontWeight: '600' },
  sessionTitleInput: { backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0, flex: 1, minWidth: 0, paddingHorizontal: 0, paddingVertical: 0, textAlignVertical: 'center' },
  sessionTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 3, minWidth: 0 },
  statusDot: { backgroundColor: 'rgba(143,174,169,0.68)', borderRadius: 4, height: 6, marginRight: 7, width: 6 },
})
