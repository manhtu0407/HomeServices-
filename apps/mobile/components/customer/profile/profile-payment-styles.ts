import { typography } from '@/design/theme'
import { StyleSheet } from 'react-native'

export const customerV21ProfilePaymentStyles = StyleSheet.create({
  bankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  bankLogo: {
    height: 28,
    width: 64,
  },
  bankLogoFrame: {
    alignItems: 'center',
    borderRadius: 17,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 78,
  },
  bankName: {
    ...typography.caption1,
    fontWeight: '700',
    marginTop: 6,
  },
  bankSelected: {
    ...typography.caption2,
    fontWeight: '700',
    marginTop: 2,
  },
  bankTile: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    minHeight: 88,
    minWidth: 94,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  fieldLabel: {
    ...typography.footnote,
    fontWeight: '700',
  },
  fieldLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  fieldMeta: {
    ...typography.caption2,
    fontWeight: '700',
  },
  fieldStack: {
    gap: 7,
  },
  formBody: {
    ...typography.footnote,
    marginTop: 2,
  },
  formCard: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  formDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  formHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  formHeaderCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  formHeaderIcon: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  formTitle: {
    ...typography.title3,
    fontWeight: '700',
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    ...typography.body,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 0,
  },
  paymentStack: {
    gap: 0,
  },
  privacyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  saveButton: {
    minHeight: 52,
  },
  sectionBody: {
    ...typography.caption1,
    marginTop: 2,
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 20,
  },
  sectionMeta: {
    ...typography.caption1,
    fontWeight: '700',
  },
  sectionTitle: {
    ...typography.title3,
    fontWeight: '700',
  },
  statusBody: {
    ...typography.caption1,
    marginTop: 2,
  },
  statusCard: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 16,
    padding: 16,
  },
  statusCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  statusHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  statusIcon: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  statusPill: {
    borderRadius: 14,
    borderWidth: 1,
    flexShrink: 0,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  statusPillText: {
    ...typography.caption1,
    fontWeight: '700',
  },
  statusTitle: {
    ...typography.callout,
    fontWeight: '700',
  },
  step: {
    alignItems: 'center',
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  stepLabel: {
    ...typography.caption2,
    fontWeight: '600',
    textAlign: 'center',
  },
  stepLine: {
    flex: 0.42,
    height: StyleSheet.hairlineWidth,
    marginTop: 14,
  },
  stepMark: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  stepNumber: {
    ...typography.caption2,
    fontWeight: '700',
  },
  stepRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 6,
  },
})
