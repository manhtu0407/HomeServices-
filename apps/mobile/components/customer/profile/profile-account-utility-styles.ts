import { typography } from '@/design/theme'
import { StyleSheet } from 'react-native'

export const customerV21ProfileAccountUtilityStyles = StyleSheet.create({
  body: {
    ...typography.subheadline,
  },
  fieldGroup: {
    gap: 7,
  },
  fieldLabel: {
    ...typography.footnote,
    fontWeight: '600',
  },
  formCard: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 18,
    padding: 16,
  },
  formInput: {
    borderRadius: 17,
    borderWidth: 1,
    ...typography.subheadline,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  formIntro: {
    gap: 4,
  },
  formStack: {
    gap: 14,
  },
  memoryControl: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  memoryCopy: {
    flex: 1,
    gap: 2,
  },
  memoryStatus: {
    ...typography.footnote,
    fontWeight: '600',
  },
  message: {
    ...typography.footnote,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 52,
  },
  switchThumb: {
    borderRadius: 10,
    height: 20,
    width: 20,
  },
  switchTrack: {
    borderRadius: 14,
    flexDirection: 'row',
    height: 28,
    padding: 4,
    width: 48,
  },
  title: {
    ...typography.callout,
    fontWeight: '600',
  },
  utilityStack: {
    gap: 14,
    width: '100%',
  },
})
