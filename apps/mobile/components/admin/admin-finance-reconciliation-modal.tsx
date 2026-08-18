import { Modal, StyleSheet, Text, View } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color, component, shadow, spacing, typography } from '@/design/theme'
import type {
  AdminPaymentReconciliationDecisionInput,
  AdminPaymentReconciliationSummary,
} from '@/lib/api-types/admin'
import { reconciliationStatusLabel, type FinanceReconciliationCopy } from './admin-finance-reconciliation-status'

type ReconciliationModalCopy = FinanceReconciliationCopy & {
  actualAmount: string
  bankReference: string
  cancel: string
  confirmDirect: string
  confirmIncoming: string
  customerClaimedAt: string
  receiptStatus: string
  reconcile: string
  reconcileRequired: string
  waitingCustomer: string
  cashConfirm: string
  cashReject: string
  cashConfirmationHint: string
  workerNet: string
}

export function ReconciliationModal({
  actualAmount,
  bankReference,
  copy,
  formatCurrency,
  onChangeActualAmount,
  onChangeBankReference,
  onChangeReason,
  onClose,
  onSubmit,
  pending,
  reason,
  reduceMotion,
  reduceTransparency,
  selected,
}: {
  actualAmount: string
  bankReference: string
  copy: ReconciliationModalCopy
  formatCurrency: (value: number | null) => string
  onChangeActualAmount: (value: string) => void
  onChangeBankReference: (value: string) => void
  onChangeReason: (value: string) => void
  onClose: () => void
  onSubmit: (decision: AdminPaymentReconciliationDecisionInput['decision']) => void
  pending: boolean
  reason: string
  reduceMotion: boolean
  reduceTransparency: boolean
  selected: AdminPaymentReconciliationSummary | null
}) {
  if (!selected) return null
  const isManual = selected.payment_method === 'platform_bank_manual'
  const canDecideCash = selected.payment_method === 'direct_worker' && selected.status === 'direct_admin_confirmation_required'
  const canDecideDirect = selected.status === 'direct_reconcile_required'
  return <Modal animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose} transparent visible>
    <View style={[styles.modalBackdrop, reduceTransparency ? styles.modalBackdropSolid : null]}>
      <View style={[styles.modalCard, reduceTransparency ? styles.solidSurface : null]}>
        <Text style={styles.modalTitle}>{copy.reconcile}</Text>
        <Text style={styles.modalAmount}>{formatCurrency(selected.gross_amount)}</Text>
        <Text style={styles.modalStatus}>{reconciliationStatusLabel(selected.status, copy)}</Text>
        {isManual ? <>
          <KaelTextField accessibilityLabel={copy.actualAmount} keyboardType="number-pad" label={copy.actualAmount} onChangeText={onChangeActualAmount} value={actualAmount} />
          <KaelTextField accessibilityLabel={copy.bankReference} autoCapitalize="characters" label={copy.bankReference} onChangeText={onChangeBankReference} value={bankReference} />
          <KaelButton disabled={pending} label={copy.confirmIncoming} onPress={() => onSubmit('confirm')} variant="primary" />
          <KaelTextField accessibilityLabel={copy.reconcileRequired} label={copy.reconcileRequired} onChangeText={onChangeReason} value={reason} />
          <KaelButton disabled={pending} label={copy.reconcileRequired} onPress={() => onSubmit('reconcile_required')} variant="secondary" />
        </> : canDecideCash ? <>
          <Text style={styles.directHint}>{copy.cashConfirmationHint}</Text>
          {selected.platform_fee !== undefined ? <Text style={styles.directHint}>{copy.cashConfirm}: {formatCurrency(selected.platform_fee)}</Text> : null}
          {selected.worker_net !== undefined ? <Text style={styles.directHint}>{copy.workerNet}: {formatCurrency(selected.worker_net)}</Text> : null}
          <KaelButton disabled={pending} label={copy.cashConfirm} onPress={() => onSubmit('cash_confirm')} variant="primary" />
          <KaelTextField accessibilityLabel={copy.reconcileRequired} label={copy.reconcileRequired} onChangeText={onChangeReason} value={reason} />
          <KaelButton disabled={pending} label={copy.cashReject} onPress={() => onSubmit('cash_reject')} variant="secondary" />
        </> : canDecideDirect ? <>
          <Text style={styles.directHint}>{copy.waitingCustomer}</Text>
          <KaelButton disabled={pending} label={copy.confirmDirect} onPress={() => onSubmit('direct_paid')} variant="primary" />
          <KaelTextField accessibilityLabel={copy.reconcileRequired} label={copy.reconcileRequired} onChangeText={onChangeReason} value={reason} />
          <KaelButton disabled={pending} label={copy.reconcileRequired} onPress={() => onSubmit('direct_release')} variant="secondary" />
        </> : <Text style={styles.directHint}>{copy.waitingCustomer}</Text>}
        <KaelButton disabled={pending} label={copy.cancel} onPress={onClose} variant="ghost" />
      </View>
    </View>
  </Modal>
}

const styles = StyleSheet.create({
  directHint: { ...typography.footnote, color: color.text.secondary },
  modalAmount: { ...typography.title2, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '700' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(4, 20, 28, 0.42)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  modalBackdropSolid: { backgroundColor: color.surface.base },
  modalCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, maxWidth: 520, padding: spacing.lg, width: '100%', ...shadow.raised },
  modalStatus: { ...typography.footnote, color: color.text.secondary },
  modalTitle: { ...typography.title2, color: color.text.strong, fontWeight: '700' },
  solidSurface: { backgroundColor: color.surface.base },
})
