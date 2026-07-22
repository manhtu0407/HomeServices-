import { StyleSheet } from 'react-native'

export const styles = StyleSheet.create({
  completionDraftStack: {
    gap: 10,
  },
  completionNoteInput: {
    minHeight: 82,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  completionNoteShell: {
    minHeight: 108,
  },
  completionNotice: {
    color: '#086F65',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  completionPhotoAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(237, 251, 248, 0.86)',
    borderColor: 'rgba(13, 167, 151, 0.24)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  completionPhotoActionLabel: {
    color: '#077C72',
    fontSize: 14,
    fontWeight: '700',
  },
  completionPhotoActionMeta: {
    color: '#52706C',
    fontSize: 12,
    fontWeight: '600',
  },
  completionPhotoActionPressed: {
    opacity: 0.78,
  },
  sectionStack: {
    gap: 14,
  },
})
