import { Pressable, View } from 'react-native'

import type { AdminViewPayoutMethodSummary, AdminViewWithdrawalRequestSummary } from '@/lib/api-types/admin'

import type { PanelCopy } from './admin-payouts'
import { adminPayoutStyles as styles } from './admin-payout-styles'
import { AdminText } from './admin-text'

export function PayoutMethodCard({ copy, method, onOpen }: {
  copy: PanelCopy
  method: AdminViewPayoutMethodSummary
  onOpen: () => void
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${copy.accounts}: ${method.worker_name ?? method.worker_id}`} onPress={onOpen} style={styles.card} testID={`admin-payout-method-${method.id}`}>
    <View style={styles.cardContent}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <AdminText textRole="headline" style={styles.cardTitle}>{method.worker_name ?? method.worker_id}</AdminText>
          <AdminText textRole="headline" style={styles.cardSubtitle}>{method.bank_name} · {method.bank_account_masked}</AdminText>
        </View>
        <StatusPill label={copy.accountStatus[method.status]} tone={method.status === 'verified' ? 'success' : method.status === 'rejected' ? 'danger' : 'warning'} />
      </View>
      <View style={styles.cardFooter}>
        <AdminText textRole="footnote" style={styles.cardMeta}>{method.reviewed_at ? copy.accountStatus[method.status] : copy.needReview}</AdminText>
        <AdminText textRole="headline" style={styles.cardAction}>{copy.openDetail}</AdminText>
      </View>
    </View>
  </Pressable>
}

export function WithdrawalRequestCard({ copy, formatCurrency, request, onOpen }: {
  copy: PanelCopy
  formatCurrency: (value: number) => string
  request: AdminViewWithdrawalRequestSummary
  onOpen: () => void
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${copy.withdrawals}: ${request.worker_name ?? request.worker_id}`} onPress={onOpen} style={styles.card} testID={`admin-withdrawal-request-${request.id}`}>
    <View style={styles.cardContent}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <AdminText textRole="headline" style={styles.cardTitle}>{request.worker_name ?? request.worker_id}</AdminText>
          <AdminText textRole="headline" style={styles.cardSubtitle}>{request.bank_name} · {request.bank_account_masked}</AdminText>
        </View>
        <StatusPill label={copy.withdrawalStatus[request.status]} tone={request.status === 'paid' ? 'success' : request.status === 'rejected' || request.status === 'failed' ? 'danger' : request.status === 'processing' ? 'neutral' : 'warning'} />
      </View>
      <View style={styles.withdrawalNumbers}>
        <AmountItem label={copy.amount} value={formatCurrency(request.amount_vnd)} />
        <AmountItem label={copy.availableBalance} value={formatCurrency(request.available_balance_before_vnd)} />
      </View>
      <View style={styles.cardFooter}>
        <AdminText textRole="footnote" style={styles.cardMeta}>{request.processing_by_name ? `${copy.processingBy}: ${request.processing_by_name}` : copy.requestedAt}</AdminText>
        <AdminText textRole="headline" style={styles.cardAction}>{copy.openDetail}</AdminText>
      </View>
    </View>
  </Pressable>
}

export function EmptyPayoutState({ body }: { body: string }) {
  return <View style={styles.empty}><AdminText textRole="subheadline" style={styles.emptyText}>{body}</AdminText></View>
}

function AmountItem({ label, value }: { label: string; value: string }) {
  return <View style={styles.amountItem}><AdminText numeric textRole="headline" style={styles.amountItemLabel}>{label}</AdminText><AdminText numeric textRole="headline" style={styles.amountItemValue}>{value}</AdminText></View>
}

function StatusPill({ label, tone }: { label: string; tone: 'warning' | 'success' | 'danger' | 'neutral' }) {
  return <View style={[styles.statusPill, tone === 'warning' ? styles.statusWarning : null, tone === 'success' ? styles.statusSuccess : null, tone === 'danger' ? styles.statusDanger : null]}><AdminText textRole="footnote" style={styles.statusPillText}>{label}</AdminText></View>
}
