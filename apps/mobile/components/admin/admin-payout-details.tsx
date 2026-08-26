import { Pressable, StyleSheet, View } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color, component, radius, spacing, typography } from '@/design/theme'
import type {
  AdminViewPayoutMethodDetailResponse,
  AdminViewPayoutMethodStatus,
  AdminViewSensitivePayoutAccessResponse,
  AdminViewWithdrawalRequestDetailResponse,
  AdminViewWithdrawalRequestStatus,
} from '@/lib/api-types/admin'
import { FinanceChoiceChip, FinanceSecondaryButton } from './admin-finance-controls'
import { AdminText } from './admin-text'

export type WithdrawalResolution = 'paid' | 'rejected' | 'failed'

type PayoutDetailCopy = {
  accountStatus: Record<AdminViewPayoutMethodStatus, string>
  amount: string
  assignmentReason: string
  availableBalance: string
  back: string
  bankAccount: string
  bankName: string
  claim: string
  confirmPaid: string
  confirmStatus: string
  failed: string
  holder: string
  manualTransferHint: string
  methodDecision: string
  noProcessCapability: string
  paid: string
  processingBy: string
  reason: string
  reference: string
  rejected: string
  release: string
  requestedAt: string
  reveal: string
  revealReason: string
  reviewAccount: string
  reviewReason: string
  save: string
  status: string
  takeover: string
  transferReview: string
  transferReviewHint: string
  verify: string
  withdrawalDetail: string
  withdrawalStatus: Record<AdminViewWithdrawalRequestStatus, string>
}

export function PayoutMethodDetail({ canProcess, copy, decision, formatDate, onBack, onChangeDecision, onChangeReason, onChangeSensitiveReason, onReveal, onSubmit, pending, reason, response, sensitiveData, sensitiveReason }: {
  canProcess: boolean
  copy: PayoutDetailCopy
  decision: 'verify' | 'reject'
  formatDate: (value: string | null) => string
  onBack: () => void
  onChangeDecision: (value: 'verify' | 'reject') => void
  onChangeReason: (value: string) => void
  onChangeSensitiveReason: (value: string) => void
  onReveal: () => void
  onSubmit: () => void
  pending: boolean
  reason: string
  response: AdminViewPayoutMethodDetailResponse
  sensitiveData: AdminViewSensitivePayoutAccessResponse | null
  sensitiveReason: string
}) {
  const method = response.payout_method
  const canDecide = canProcess && method.status === 'pending_verification'
  return <View style={styles.detailSurface} testID="admin-payout-method-detail">
    <DetailHeader backLabel={copy.back} onBack={onBack} subtitle={method.worker_name ?? method.worker_id} title={copy.reviewAccount} />
    <View style={styles.destinationBlock}>
      <DetailItem label={copy.holder} value={sensitiveData?.account_holder_name ?? '••••••'} />
      <DetailItem label={copy.bankName} value={method.bank_name} />
      <DetailItem label={copy.bankAccount} value={sensitiveData?.bank_account ?? method.bank_account_masked} mono />
    </View>
    {canProcess && !sensitiveData ? <View style={styles.sensitiveAccess}>
      <KaelTextField accessibilityLabel={copy.revealReason} onChangeText={onChangeSensitiveReason} placeholder={copy.revealReason} placeholderTextColor={color.text.muted} style={styles.singleInputText} inputShellStyle={styles.singleInput} value={sensitiveReason} />
      <FinanceSecondaryButton label={copy.reveal} loading={pending} onPress={onReveal} />
    </View> : null}
    {!canProcess ? <AdminText textRole="footnote" style={styles.modalHint}>{copy.noProcessCapability}</AdminText> : null}
    <View style={styles.detailGrid}>
      <DetailItem label={copy.status} value={copy.accountStatus[method.status]} />
      <DetailItem label={copy.requestedAt} value={formatDate(method.created_at)} />
    </View>
    {canDecide ? <>
      <AdminText textRole="title2" style={styles.modalSectionTitle}>{copy.methodDecision}</AdminText>
      <View style={styles.modalChipRow}>
        <FinanceChoiceChip accessibilityLabel={copy.verify} label={copy.verify} onPress={() => onChangeDecision('verify')} selected={decision === 'verify'} />
        <FinanceChoiceChip accessibilityLabel={copy.rejected} label={copy.rejected} onPress={() => onChangeDecision('reject')} selected={decision === 'reject'} tone="danger" />
      </View>
      {decision === 'reject' ? <KaelTextField accessibilityLabel={copy.reviewReason} multiline onChangeText={onChangeReason} placeholder={copy.reviewReason} placeholderTextColor={color.text.muted} style={styles.reasonText} inputShellStyle={styles.reasonInput} value={reason} /> : null}
      <KaelButton label={copy.save} loading={pending} onPress={onSubmit} style={styles.fullButton} variant={decision === 'reject' ? 'destructive' : 'primary'} />
    </> : null}
  </View>
}

export function WithdrawalDetail({ assignmentReason, canProcess, canTakeover, confirming, copy, formatCurrency, formatDate, onBack, onChangeAssignmentReason, onChangeReason, onChangeResolution, onChangeSensitiveReason, onChangeTransferReference, onClaim, onRelease, onReveal, onResolve, pending, reason, resolution, response, sensitiveData, sensitiveReason, transferReference }: {
  assignmentReason: string
  canProcess: boolean
  canTakeover: boolean
  confirming: boolean
  copy: PayoutDetailCopy
  formatCurrency: (value: number) => string
  formatDate: (value: string | null) => string
  onBack: () => void
  onChangeAssignmentReason: (value: string) => void
  onChangeReason: (value: string) => void
  onChangeResolution: (value: WithdrawalResolution) => void
  onChangeSensitiveReason: (value: string) => void
  onChangeTransferReference: (value: string) => void
  onClaim: () => void
  onRelease: () => void
  onReveal: () => void
  onResolve: () => void
  pending: boolean
  reason: string
  resolution: WithdrawalResolution
  response: AdminViewWithdrawalRequestDetailResponse
  sensitiveData: AdminViewSensitivePayoutAccessResponse | null
  sensitiveReason: string
  transferReference: string
}) {
  const request = response.withdrawal_request
  const canClaim = canProcess && request.status === 'pending'
  const canTakeOver = canTakeover && request.status === 'processing' && !request.processing_by_me
  const canRelease = canProcess && request.status === 'processing' && (request.processing_by_me || canTakeover)
  const canResolve = canProcess && request.status === 'processing' && request.processing_by_me
  return <View style={styles.detailSurface} testID="admin-withdrawal-request-detail">
    <DetailHeader backLabel={copy.back} onBack={onBack} subtitle={request.worker_name ?? request.worker_id} title={copy.withdrawalDetail} />
    <View style={styles.amountBlock}><View style={styles.amountContent}><AdminText numeric textRole="headline" style={styles.amountLabel}>{copy.amount}</AdminText><AdminText numeric textRole="headline" style={styles.amountValue}>{formatCurrency(request.amount_vnd)}</AdminText></View></View>
    <View style={styles.destinationBlock}>
      <DetailItem label={copy.holder} value={sensitiveData?.account_holder_name ?? '••••••'} />
      <DetailItem label={copy.bankName} value={request.bank_name} />
      <DetailItem label={copy.bankAccount} value={sensitiveData?.bank_account ?? request.bank_account_masked} mono />
    </View>
    {canProcess && !sensitiveData ? <View style={styles.sensitiveAccess}>
      <KaelTextField accessibilityLabel={copy.revealReason} onChangeText={onChangeSensitiveReason} placeholder={copy.revealReason} placeholderTextColor={color.text.muted} style={styles.singleInputText} inputShellStyle={styles.singleInput} value={sensitiveReason} />
      <FinanceSecondaryButton label={copy.reveal} loading={pending} onPress={onReveal} />
    </View> : null}
    <AdminText textRole="footnote" style={styles.modalHint}>{copy.manualTransferHint}</AdminText>
    <View style={styles.detailGrid}>
      <DetailItem label={copy.availableBalance} value={formatCurrency(request.available_balance_before_vnd)} />
      <DetailItem label={copy.status} value={copy.withdrawalStatus[request.status]} />
      <DetailItem label={copy.requestedAt} value={formatDate(request.requested_at)} />
      <DetailItem label={copy.processingBy} value={request.processing_by_name ?? '—'} />
    </View>
    {canClaim || canTakeOver || canRelease ? <View style={styles.assignmentActions}>
      {canTakeOver || canRelease ? <KaelTextField label={copy.assignmentReason} onChangeText={onChangeAssignmentReason} value={assignmentReason} /> : null}
      {canClaim || canTakeOver ? <KaelButton label={canTakeOver ? copy.takeover : copy.claim} loading={pending} onPress={onClaim} style={styles.fullButton} variant="primary" /> : null}
      {canRelease ? <FinanceSecondaryButton label={copy.release} loading={pending} onPress={onRelease} style={styles.fullButton} /> : null}
    </View> : null}
    {canResolve ? <>
      <AdminText textRole="title2" style={styles.modalSectionTitle}>{copy.confirmStatus}</AdminText>
      <View style={styles.modalChipRow}>
        <FinanceChoiceChip accessibilityLabel={copy.paid} label={copy.paid} onPress={() => onChangeResolution('paid')} selected={resolution === 'paid'} />
        <FinanceChoiceChip accessibilityLabel={copy.rejected} label={copy.rejected} onPress={() => onChangeResolution('rejected')} selected={resolution === 'rejected'} tone="danger" />
        <FinanceChoiceChip accessibilityLabel={copy.failed} label={copy.failed} onPress={() => onChangeResolution('failed')} selected={resolution === 'failed'} tone="danger" />
      </View>
      {resolution === 'paid' ? <KaelTextField accessibilityLabel={copy.reference} onChangeText={onChangeTransferReference} placeholder={copy.reference} placeholderTextColor={color.text.muted} style={styles.singleInputText} inputShellStyle={styles.singleInput} value={transferReference} /> : <KaelTextField accessibilityLabel={copy.reason} multiline onChangeText={onChangeReason} placeholder={copy.reason} placeholderTextColor={color.text.muted} style={styles.reasonText} inputShellStyle={styles.reasonInput} value={reason} />}
      {confirming ? <View accessibilityRole="alert" style={styles.confirmation}><AdminText textRole="headline" style={styles.confirmationTitle}>{copy.transferReview}</AdminText><AdminText textRole="subheadline" style={styles.modalHint}>{copy.transferReviewHint}</AdminText></View> : null}
      <KaelButton label={confirming ? (resolution === 'paid' ? copy.confirmPaid : copy.save) : copy.transferReview} loading={pending} onPress={onResolve} style={styles.fullButton} variant={resolution === 'paid' ? 'primary' : 'destructive'} />
    </> : null}
    {!canProcess ? <AdminText textRole="footnote" style={styles.modalHint}>{copy.noProcessCapability}</AdminText> : null}
  </View>
}

function DetailHeader({ backLabel, onBack, subtitle, title }: { backLabel: string; onBack: () => void; subtitle: string; title: string }) {
  return <View style={styles.modalHeader}><Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} style={styles.backButton}><AdminText textRole="headline" style={styles.backLabel}>‹</AdminText></Pressable><View style={styles.modalHeaderText}><AdminText textRole="title2" style={styles.modalTitle}>{title}</AdminText><AdminText textRole="headline" style={styles.modalSubtitle}>{subtitle}</AdminText></View></View>
}

function DetailItem({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return <View style={styles.detailItem}><AdminText textRole="subheadline" style={styles.detailLabel}>{label}</AdminText><AdminText textRole="subheadline" selectable={mono} style={[styles.detailValue, mono ? styles.detailValueMono : null]}>{value}</AdminText></View>
}

const styles = StyleSheet.create({
  amountBlock: { alignItems: 'flex-start', backgroundColor: color.mint.mint50, borderRadius: component.card.radius, overflow: 'hidden', padding: spacing.lg, position: 'relative' },
  amountContent: { position: 'relative', zIndex: 1 },
  amountLabel: { ...typography.caption1, color: color.text.secondary, fontWeight: '600', textAlign: 'left' },
  amountValue: { ...typography.title1, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '600', marginTop: spacing.xs, textAlign: 'left' },
  assignmentActions: { gap: spacing.md },
  backButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44 },
  backLabel: { ...typography.title1, color: color.brand.primaryDark, fontWeight: '400' },
  confirmation: { backgroundColor: color.surface.soft, borderColor: color.surface.stroke, borderRadius: radius.sm, borderWidth: 1, gap: spacing.xs, padding: spacing.md },
  confirmationTitle: { ...typography.headline, color: color.text.strong, fontWeight: '600' },
  destinationBlock: { backgroundColor: color.surface.soft, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: StyleSheet.hairlineWidth, gap: spacing.md, padding: spacing.lg },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  detailItem: { flexBasis: '44%', flexGrow: 1, gap: spacing.xs, minWidth: 120 },
  detailLabel: { ...typography.caption2, color: color.text.muted, fontWeight: '600', textTransform: 'uppercase' },
  detailSurface: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, padding: spacing.lg, width: '100%' },
  detailValue: { ...typography.footnote, color: color.text.primary },
  detailValueMono: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  fullButton: { marginTop: spacing.sm, width: '100%' },
  modalChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  modalHeaderText: { flex: 1, gap: spacing.xs },
  modalHint: { ...typography.footnote, color: color.text.secondary },
  modalSectionTitle: { ...typography.label, color: color.text.strong, fontWeight: '600', marginTop: spacing.xs },
  modalSubtitle: { ...typography.footnote, color: color.text.secondary },
  modalTitle: { ...typography.title2, color: color.text.strong, fontWeight: '600', includeFontPadding: false },
  reasonInput: { backgroundColor: color.surface.soft, borderColor: component.input.border, borderRadius: component.input.radius, borderWidth: 1, minHeight: 104 },
  reasonText: { ...typography.body, color: color.text.primary, minHeight: 100, padding: spacing.md, textAlignVertical: 'top' },
  sensitiveAccess: { gap: spacing.sm },
  singleInput: { backgroundColor: color.surface.soft, borderColor: component.input.border, borderRadius: component.input.radius, borderWidth: 1, minHeight: component.input.height },
  singleInputText: { ...typography.body, color: color.text.primary, minHeight: component.input.height - 2, paddingHorizontal: spacing.md },
})
