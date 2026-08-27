import { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color, component, spacing, typography } from '@/design/theme'
import type { AdminPaymentReconciliationDecisionInput, AdminPaymentReconciliationDetailResponse, AdminPaymentReconciliationSummary } from '@/lib/api-types/admin'

import { FinanceSecondaryButton } from './admin-finance-controls'
import { reconciliationStatusLabel, type FinanceReconciliationCopy } from './admin-finance-reconciliation-status'
import { AdminText } from './admin-text'

type ReconciliationDetailCopy = FinanceReconciliationCopy & {
  actualAmount: string
  assignedTo: string
  assignmentReason: string
  bankReference: string
  cancel: string
  cashConfirm: string
  cashConfirmationHint: string
  cashReject: string
  claim: string
  takeover: string
  release: string
  confirmDecision: string
  confirmDirect: string
  confirmIncoming: string
  customerReference: string
  detailTimeline: string
  detailUnavailable: string
  load: string
  notAssigned: string
  receiptStatus: string
  reconcile: string
  reconcileRequired: string
  reviewDecision: string
  responseDeadline: string
  serviceType: string
  waitingCustomer: string
  workerReference: string
  workerNet: string
}

export function ReconciliationModal({ actualAmount, assignmentReason, bankReference, canTakeover, copy, detail, detailError, detailLoading, formatCurrency, formatDate, onChangeActualAmount, onChangeAssignmentReason, onChangeBankReference, onChangeReason, onClaim, onClose, onRelease, onRetry, onSubmit, pending, reason, selected }: {
  actualAmount: string
  assignmentReason: string
  bankReference: string
  canTakeover: boolean
  copy: ReconciliationDetailCopy
  detail: AdminPaymentReconciliationDetailResponse | null
  detailError: string | null
  detailLoading: boolean
  formatCurrency: (value: number | null) => string
  formatDate: (value: string | null) => string
  onChangeActualAmount: (value: string) => void
  onChangeAssignmentReason: (value: string) => void
  onChangeBankReference: (value: string) => void
  onChangeReason: (value: string) => void
  onClaim: () => void
  onClose: () => void
  onRelease: () => void
  onRetry: () => void
  onSubmit: (decision: AdminPaymentReconciliationDecisionInput['decision']) => void
  pending: boolean
  reason: string
  selected: AdminPaymentReconciliationSummary | null
}) {
  const [reviewDecision, setReviewDecision] = useState<AdminPaymentReconciliationDecisionInput['decision'] | null>(null)

  if (!selected) return null

  const isManual = selected.payment_method === 'platform_bank_manual'
  const canDecideCash = selected.payment_method === 'direct_worker' && selected.status === 'direct_admin_confirmation_required'
  const canDecideDirect = selected.status === 'direct_reconcile_required'

  return <View style={styles.detail} testID="admin-finance-reconciliation-detail">
    <View style={styles.heading}>
      <View style={styles.headingCopy}>
        <AdminText textRole="title2" style={styles.title}>{copy.reconcile}</AdminText>
        <AdminText textRole="footnote" style={styles.status}>{reconciliationStatusLabel(selected.status, copy)}</AdminText>
      </View>
      <KaelButton disabled={pending} label={copy.cancel} onPress={onClose} size="small" variant="ghost" />
    </View>
    <AdminText numeric textRole="title1" style={styles.amount}>{formatCurrency(selected.gross_amount)}</AdminText>
    <View style={styles.summaryRow}>
      <Summary label={copy.receiptStatus} value={reconciliationStatusLabel(selected.status, copy)} />
      <Summary label={copy.assignedTo} value={selected.assigned_to_name ?? copy.notAssigned} />
    </View>
    {detailLoading ? <AdminText accessibilityLiveRegion="polite" textRole="subheadline" style={styles.hint}>{copy.load}…</AdminText> : null}
    {detailError ? <View accessibilityRole="alert" style={styles.detailError}>
      <AdminText textRole="subheadline" style={styles.hint}>{detailError}</AdminText>
      <FinanceSecondaryButton label={copy.load} onPress={onRetry} size="small" />
    </View> : null}
    {detail ? <>
      <View style={styles.summaryRow}>
        <Summary label={copy.customerReference} value={detail.customer_ref} />
        <Summary label={copy.workerReference} value={detail.worker_ref ?? copy.notAssigned} />
        <Summary label={copy.serviceType} value={detail.service_type} />
        <Summary label={copy.responseDeadline} value={formatDate(detail.reconciliation.response_deadline)} />
      </View>
      <View style={styles.timeline}>
        <AdminText textRole="headline" style={styles.reviewTitle}>{copy.detailTimeline}</AdminText>
        {detail.timeline.map((event) => <View key={event.event_id} style={styles.timelineRow}>
          <View style={styles.timelineDot} />
          <View style={styles.timelineCopy}>
            <AdminText textRole="body" style={styles.summaryValue}>{event.event_type}</AdminText>
            <AdminText numeric textRole="footnote" style={styles.hint}>{formatDate(event.occurred_at)}{event.actor_ref ? ` · ${event.actor_ref}` : ''}</AdminText>
          </View>
        </View>)}
      </View>
    </> : null}

    {detail ? !selected.assigned_to_me ? <View style={styles.claimBlock}>
      <AdminText textRole="footnote" style={styles.hint}>{selected.assigned_to ? copy.assignedTo : copy.notAssigned}</AdminText>
      {selected.assigned_to && canTakeover ? <KaelTextField accessibilityLabel={copy.assignmentReason} label={copy.assignmentReason} onChangeText={onChangeAssignmentReason} value={assignmentReason} /> : null}
      <View style={styles.reviewActions}>
        <KaelButton disabled={pending || Boolean(selected.assigned_to && !canTakeover)} label={selected.assigned_to ? copy.takeover : copy.claim} onPress={onClaim} variant="primary" />
        {selected.assigned_to && canTakeover ? <FinanceSecondaryButton disabled={pending} label={copy.release} onPress={onRelease} /> : null}
      </View>
    </View> : <>
      {isManual ? <>
        <KaelTextField accessibilityLabel={copy.actualAmount} keyboardType="number-pad" label={copy.actualAmount} onChangeText={onChangeActualAmount} value={actualAmount} />
        <KaelTextField accessibilityLabel={copy.bankReference} autoCapitalize="characters" label={copy.bankReference} onChangeText={onChangeBankReference} value={bankReference} />
        <ActionButton decision="confirm" label={copy.confirmIncoming} onReview={setReviewDecision} pending={pending} />
        <KaelTextField accessibilityLabel={copy.reconcileRequired} label={copy.reconcileRequired} onChangeText={onChangeReason} value={reason} />
        <ActionButton decision="reconcile_required" label={copy.reconcileRequired} onReview={setReviewDecision} pending={pending} secondary />
      </> : canDecideCash ? <>
        <AdminText textRole="footnote" style={styles.hint}>{copy.cashConfirmationHint}</AdminText>
        {selected.platform_fee !== undefined ? <AdminText numeric textRole="footnote" style={styles.hint}>{copy.cashConfirm}: {formatCurrency(selected.platform_fee)}</AdminText> : null}
        {selected.worker_net !== undefined ? <AdminText numeric textRole="footnote" style={styles.hint}>{copy.workerNet}: {formatCurrency(selected.worker_net)}</AdminText> : null}
        <ActionButton decision="cash_confirm" label={copy.cashConfirm} onReview={setReviewDecision} pending={pending} />
        <KaelTextField accessibilityLabel={copy.reconcileRequired} label={copy.reconcileRequired} onChangeText={onChangeReason} value={reason} />
        <ActionButton decision="cash_reject" label={copy.cashReject} onReview={setReviewDecision} pending={pending} secondary />
      </> : canDecideDirect ? <>
        <AdminText textRole="footnote" style={styles.hint}>{copy.waitingCustomer}</AdminText>
        <ActionButton decision="direct_paid" label={copy.confirmDirect} onReview={setReviewDecision} pending={pending} />
        <KaelTextField accessibilityLabel={copy.reconcileRequired} label={copy.reconcileRequired} onChangeText={onChangeReason} value={reason} />
        <ActionButton decision="direct_release" label={copy.reconcileRequired} onReview={setReviewDecision} pending={pending} secondary />
      </> : <AdminText textRole="footnote" style={styles.hint}>{copy.waitingCustomer}</AdminText>}
      <KaelTextField accessibilityLabel={copy.assignmentReason} label={copy.assignmentReason} onChangeText={onChangeAssignmentReason} value={assignmentReason} />
      <FinanceSecondaryButton disabled={pending} label={copy.release} onPress={onRelease} />
    </> : null}

    {reviewDecision ? <View accessibilityRole="summary" style={styles.review} testID="admin-finance-reconciliation-review">
      <AdminText textRole="headline" style={styles.reviewTitle}>{copy.reviewDecision}</AdminText>
      <AdminText textRole="body" style={styles.hint}>{decisionLabel(reviewDecision, copy)}</AdminText>
      <View style={styles.reviewActions}>
        <KaelButton disabled={pending} label={copy.cancel} onPress={() => setReviewDecision(null)} variant="ghost" />
        <KaelButton disabled={pending} label={copy.confirmDecision} onPress={() => onSubmit(reviewDecision)} testID="admin-finance-reconciliation-confirm" variant="primary" />
      </View>
    </View> : null}
  </View>
}

function ActionButton({ decision, label, onReview, pending, secondary = false }: {
  decision: AdminPaymentReconciliationDecisionInput['decision']
  label: string
  onReview: (decision: AdminPaymentReconciliationDecisionInput['decision']) => void
  pending: boolean
  secondary?: boolean
}) {
  return secondary
    ? <FinanceSecondaryButton disabled={pending} label={label} onPress={() => onReview(decision)} />
    : <KaelButton disabled={pending} label={label} onPress={() => onReview(decision)} variant="primary" />
}

function Summary({ label, value }: { label: string; value: string }) {
  return <View style={styles.summary}><AdminText textRole="footnote" style={styles.summaryLabel}>{label}</AdminText><AdminText textRole="body" style={styles.summaryValue}>{value}</AdminText></View>
}

function decisionLabel(decision: AdminPaymentReconciliationDecisionInput['decision'], copy: ReconciliationDetailCopy) {
  if (decision === 'confirm') return copy.confirmIncoming
  if (decision === 'cash_confirm') return copy.cashConfirm
  if (decision === 'cash_reject') return copy.cashReject
  if (decision === 'direct_paid') return copy.confirmDirect
  return copy.reconcileRequired
}

const styles = StyleSheet.create({
  amount: { ...typography.title1, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '600' },
  claimBlock: { gap: spacing.md },
  detail: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.lg, padding: spacing.lg },
  detailError: { alignItems: 'flex-start', gap: spacing.sm },
  heading: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  headingCopy: { flex: 1, gap: spacing.xs },
  hint: { ...typography.footnote, color: color.text.secondary },
  review: { borderTopColor: color.surface.stroke, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.md, paddingTop: spacing.lg },
  reviewActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end' },
  reviewTitle: { ...typography.headline, color: color.text.strong, fontWeight: '600' },
  status: { ...typography.footnote, color: color.text.secondary },
  summary: { flex: 1, gap: spacing.xs, minWidth: 150 },
  summaryLabel: { ...typography.caption1, color: color.text.muted, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  summaryValue: { ...typography.body, color: color.text.strong },
  timeline: { borderTopColor: color.surface.stroke, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.md, paddingTop: spacing.lg },
  timelineCopy: { flex: 1, gap: spacing.xxs },
  timelineDot: { backgroundColor: color.brand.primary, borderRadius: 4, height: 8, marginTop: spacing.sm, width: 8 },
  timelineRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  title: { ...typography.title2, color: color.text.strong, fontWeight: '600' },
})
