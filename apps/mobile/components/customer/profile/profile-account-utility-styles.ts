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
  personalDetailsCard: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  personalDetailsDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  personalDetailsFieldLabel: {
    ...typography.footnote,
    fontWeight: '700',
  },
  personalDetailsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  personalDetailsHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  personalDetailsHeaderIcon: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  personalDetailsInput: {
    borderRadius: 16,
    borderWidth: 1,
    ...typography.body,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 0,
  },
  personalDetailsIntroBody: {
    ...typography.footnote,
    marginTop: 2,
  },
  personalDetailsIntroTitle: {
    ...typography.callout,
    fontWeight: '700',
  },
  personalDetailsPrivacy: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  personalDetailsPrivacyText: {
    flex: 1,
    ...typography.caption1,
  },
  personalDetailsReadonlyInput: {
    opacity: 0.88,
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
