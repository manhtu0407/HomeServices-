import { StyleSheet } from 'react-native'
import { spacing } from '@/design/theme'

export const styles = StyleSheet.create({
  kaelOrbCustomerShell: {
    flex: 1,
    gap: 10,
    minHeight: 0,
    position: 'relative',
  },
  kaelOrbCustomerTranscript: {
    flexGrow: 1,
    gap: 8,
    justifyContent: 'flex-start',
    paddingVertical: 6,
  },
  kaelOrbCustomerTranscriptEmpty: {
    justifyContent: 'center',
    paddingBottom: 44,
  },
  kaelOrbCustomerTranscriptMenuOpen: {
    paddingTop: 94,
  },
  kaelOrbCustomerTranscriptScroll: {
    flex: 1,
  },
  kaelOrbLatestButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    bottom: 86,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 84,
    paddingHorizontal: 14,
    position: 'absolute',
    right: 12,
    zIndex: 10,
  },
  kaelOrbLatestButtonText: {
    fontWeight: '600',
  },
  kaelOrbChatBody: {
    gap: 8,
  },
  // A sent photo and its message stay one group: the photo never touches the bubble.
  kaelOrbTurnGroup: {
    gap: spacing.sm,
    width: '100%',
  },
})
