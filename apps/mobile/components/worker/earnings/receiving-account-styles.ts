import { StyleSheet } from 'react-native'

import { radius, shadow, spacing, typography } from '@/design/theme'

export const styles = StyleSheet.create({
  workerCustomerFontText: { ...typography.body },
  accountCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    ...shadow.soft,
  },
  recordedAccount: {
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  recordedLabel: {
    ...typography.caption1,
    fontWeight: '600',
  },
  recordedValue: {
    ...typography.subheadline,
    fontWeight: '600',
  },
  recordedStatus: {
    ...typography.caption2,
    fontWeight: '600',
  },
  sectionTitle: {
    ...typography.headline,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  bankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  bankOption: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    minHeight: 94,
    minWidth: 92,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    position: 'relative',
  },
  bankOptionSelected: {
    borderWidth: 1.5,
  },
  bankOptionPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  bankLogoFrame: {
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 78,
  },
  bankLogo: {
    height: 32,
    width: 72,
  },
  bankName: {
    ...typography.caption1,
    fontWeight: '600',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  selectedMark: {
    borderRadius: radius.pill,
    ...typography.caption2,
    fontWeight: '700',
    height: 20,
    lineHeight: 20,
    position: 'absolute',
    right: spacing.xs,
    textAlign: 'center',
    top: spacing.xs,
    width: 20,
  },
  fieldLabel: {
    ...typography.caption1,
    fontWeight: '600',
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    ...typography.body,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  validationText: {
    ...typography.caption2,
    marginTop: spacing.xs,
  },
  confirmActionSpacing: {
    marginTop: 14,
  },
  message: {
    ...typography.caption2,
    fontWeight: '600',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  privacyNote: {
    ...typography.caption2,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
})
