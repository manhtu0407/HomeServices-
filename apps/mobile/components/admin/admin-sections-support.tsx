import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native'

import { FormulaMintCardAura } from '@/components/ui/formula-mint-card'
import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import type {
  AdminViewTransactionDetailResponse,
  AdminViewTransactionSummary,
  AdminViewWorkerApplicationDecisionInput,
  AdminViewWorkerApplicationSummary,
} from '@/lib/api-types/admin'

import { MetaItem } from './admin-section-cards'
import type { AdminSectionsCopy } from './admin-sections-copy'
import { FinanceSecondaryButton } from './admin-finance-controls'
import { styles } from './admin-sections-styles'
import { AdminText } from './admin-text'

export type DecisionModal = {
  decision: Exclude<AdminViewWorkerApplicationDecisionInput['decision'], 'approve'>
  worker: AdminViewWorkerApplicationSummary
} | null

export type WorkerAccessModal = {
  action: 'suspend' | 'reinstate'
  worker: AdminViewWorkerApplicationSummary
} | null

export function AdminDataSearchToolbar({ copy, onChangeSearch, onRefresh, refreshTestID, searchQuery }: {
  copy: AdminSectionsCopy
  onChangeSearch: (value: string) => void
  onRefresh: () => void
  refreshTestID?: string
  searchQuery: string
}) {
  return <View style={styles.toolbar}>
    <KaelTextField
      accessibilityLabel={copy.filters.searchPlaceholder}
      autoCapitalize="none"
      inputShellStyle={styles.searchInput}
      mode="search"
      onChangeText={onChangeSearch}
      placeholder={copy.filters.searchPlaceholder}
      placeholderTextColor={color.text.muted}
      shellStyle={styles.searchField}
      style={styles.searchText}
      value={searchQuery}
    />
    <FinanceSecondaryButton accessibilityLabel={copy.actions.refresh} label={copy.actions.refresh} onPress={onRefresh} size="small" style={styles.refreshButton} testID={refreshTestID} />
  </View>
}

export function AdminDataFeedback({ copy, error, notice, onDismissError, onRetry }: {
  copy: AdminSectionsCopy
  error: string | null
  notice: string | null
  onDismissError: () => void
  onRetry: () => void
}) {
  return <>
    {notice ? <View accessibilityRole="alert" style={styles.notice}><AdminText textRole="subheadline" style={styles.noticeText}>{notice}</AdminText></View> : null}
    {error ? <View accessibilityRole="alert" style={styles.error}><AdminText textRole="subheadline" style={styles.errorText}>{error}</AdminText><Pressable accessibilityRole="button" onPress={() => { onDismissError(); onRetry() }}><AdminText textRole="subheadline" style={styles.errorAction}>{copy.actions.retry}</AdminText></Pressable></View> : null}
  </>
}

export function AdminWorkspaceLoading({ copy }: { copy: AdminSectionsCopy }) {
  return <View style={styles.loading}><ActivityIndicator color={color.brand.primary} /><AdminText textRole="subheadline" style={styles.loadingText}>{copy.loading}</AdminText></View>
}

export function EmptyState({ body }: { body: string }) {
  return <View style={styles.empty}><AdminText textRole="subheadline" style={styles.emptyText}>{body}</AdminText></View>
}

export function DecisionModalView({ copy, modal, reason, pending, onChangeReason, onClose, onSubmit }: {
  copy: AdminSectionsCopy
  modal: DecisionModal
  reason: string
  pending: boolean
  onChangeReason: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  if (!modal) return null
  const title = modal.decision === 'reject' ? copy.modal.rejectTitle : copy.modal.requestChangesTitle
  return <Modal animationType="fade" transparent visible onRequestClose={onClose}>
    <View style={styles.modalBackdrop}><View style={styles.modalCard}>
      <AdminText textRole="title2" style={styles.modalTitle}>{title}</AdminText>
      <AdminText textRole="headline" style={styles.modalSubtitle}>{modal.worker.full_name ?? copy.notRecorded}</AdminText>
      <KaelTextField testID="admin-worker-decision-reason" accessibilityLabel={copy.modal.decisionReasonPlaceholder} autoFocus multiline value={reason} onChangeText={onChangeReason} placeholder={copy.modal.decisionReasonPlaceholder} placeholderTextColor={color.text.muted} inputShellStyle={styles.reasonInput} style={styles.reasonText} />
      <View style={styles.modalActionRow}><KaelButton label={copy.actions.close} onPress={onClose} style={styles.modalActionButton} variant="secondary" /><KaelButton label={pending ? copy.actions.approving : copy.actions.refresh} onPress={onSubmit} disabled={pending} style={styles.modalActionButton} variant="primary" /></View>
    </View></View>
  </Modal>
}

export function WorkerAccessModalView({ actionPending, language, modal, onChangeReason, onClose, onSubmit, reason }: {
  actionPending: boolean
  language: 'vi' | 'en'
  modal: WorkerAccessModal
  onChangeReason: (value: string) => void
  onClose: () => void
  onSubmit: () => void
  reason: string
}) {
  if (!modal) return null
  const isSuspend = modal.action === 'suspend'
  const title = language === 'vi'
    ? (isSuspend ? 'Tạm dừng quyền hoạt động của thợ' : 'Khôi phục quyền hoạt động của thợ')
    : (isSuspend ? 'Suspend worker access' : 'Reinstate worker access')
  const placeholder = language === 'vi' ? 'Lý do thay đổi trạng thái' : 'Reason for this status change'
  return <Modal animationType="fade" transparent visible onRequestClose={onClose}>
    <View style={styles.modalBackdrop}><View style={styles.modalCard}>
      <AdminText textRole="title2" style={styles.modalTitle}>{title}</AdminText>
      <AdminText textRole="headline" style={styles.modalSubtitle}>{modal.worker.full_name ?? modal.worker.worker_id}</AdminText>
      <KaelTextField testID="admin-worker-access-reason" accessibilityLabel={placeholder} autoFocus multiline value={reason} onChangeText={onChangeReason} placeholder={placeholder} placeholderTextColor={color.text.muted} inputShellStyle={styles.reasonInput} style={styles.reasonText} />
      <View style={styles.modalActionRow}>
        <KaelButton label={language === 'vi' ? 'Đóng' : 'Close'} onPress={onClose} disabled={actionPending} style={styles.modalActionButton} variant="secondary" />
        <KaelButton label={actionPending ? (language === 'vi' ? 'Đang lưu...' : 'Saving...') : (isSuspend ? (language === 'vi' ? 'Tạm dừng' : 'Suspend') : (language === 'vi' ? 'Khôi phục' : 'Reinstate'))} onPress={onSubmit} disabled={actionPending} style={styles.modalActionButton} variant={isSuspend ? 'destructive' : 'primary'} />
      </View>
    </View></View>
  </Modal>
}

export function TransactionDetailModal({ copy, detail, formatCurrency, formatDate, language, serviceLabel, statusLabel, paymentProviderLabel, disputeStatusLabel, jobStatusLabel, onClose, reduceTransparency }: {
  copy: AdminSectionsCopy
  detail: AdminViewTransactionDetailResponse | null
  formatCurrency: (value: number | null) => string
  formatDate: (value: string | null | undefined) => string
  language: 'vi' | 'en'
  serviceLabel: (value: AdminViewTransactionSummary['service_type']) => string
  statusLabel: (value: string | null) => string
  paymentProviderLabel: (value: string | null) => string
  disputeStatusLabel: (value: string | null) => string
  jobStatusLabel: (value: AdminViewTransactionSummary['status']) => string
  onClose: () => void
  reduceTransparency: boolean
}) {
  if (!detail) return null
  const { transaction, ledger, timeline } = detail
  const commissionRate = ledger?.commission_rate_bps === null || ledger?.commission_rate_bps === undefined
    ? copy.notRecorded
    : `${(ledger.commission_rate_bps / 100).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 })}%`
  return <Modal animationType="fade" transparent visible onRequestClose={onClose}>
    <View style={styles.modalBackdrop}><View testID="admin-transaction-detail" style={[styles.modalCard, styles.transactionModal]}>
      <View pointerEvents="none" style={styles.transactionModalAuraClip}>
        <FormulaMintCardAura reduceTransparency={reduceTransparency} scope={`AdminTransactionDetail${transaction.job_id}`} testID="admin-transaction-detail-formula-mint-aura" />
      </View>
      <View style={styles.transactionModalContent} testID="admin-transaction-detail-content">
        <View style={styles.modalHeader}><View><AdminText textRole="title2" style={styles.modalTitle}>{copy.modal.transactionTitle}</AdminText><AdminText textRole="headline" style={styles.modalSubtitle}>{transaction.display_code} · {serviceLabel(transaction.service_type)}</AdminText></View><Pressable accessibilityRole="button" accessibilityLabel={copy.actions.close} onPress={onClose}><AdminText textRole="subheadline" style={styles.closeLabel}>×</AdminText></Pressable></View>
        <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false} style={styles.transactionModalScroll} testID="admin-transaction-detail-scroll">
          <View style={styles.amountBlock}>
            <FormulaMintCardAura reduceTransparency={reduceTransparency} scope={`AdminTransactionAmount${transaction.job_id}`} testID="admin-transaction-detail-amount-formula-mint-aura" />
            <View style={styles.amountContent}><AdminText numeric textRole="headline" style={styles.amountLabel}>{copy.labels.paymentAmount}</AdminText><AdminText numeric textRole="headline" style={styles.amountValue}>{formatCurrency(transaction.gross_amount)}</AdminText></View>
          </View>
          <View style={styles.metaGrid}><MetaItem label={copy.labels.customer} value={transaction.customer_name ?? copy.notRecorded} /><MetaItem label={copy.labels.worker} value={transaction.worker_name ?? copy.notRecorded} /><MetaItem label={copy.labels.paymentMethod} value={paymentProviderLabel(transaction.payment_provider)} /><MetaItem label={copy.labels.transactionStatus} value={statusLabel(transaction.payment_status)} /><MetaItem label={copy.labels.jobStatus} value={jobStatusLabel(transaction.status)} /><MetaItem label={copy.timeline.dispute_opened} value={disputeStatusLabel(transaction.dispute_status)} /></View>
          <AdminText textRole="title2" style={styles.sectionTitle}>{copy.labels.transactionStatus}</AdminText>
          <View style={styles.timeline}>{timeline.map((item) => <View key={`${item.key}-${item.occurred_at}`} style={styles.timelineRow}><View style={styles.timelineDot} /><View><AdminText textRole="footnote" style={styles.timelineLabel}>{copy.timeline[item.label_key]}</AdminText><AdminText textRole="footnote" style={styles.timelineDate}>{formatDate(item.occurred_at)}</AdminText></View></View>)}</View>
          {ledger && <View style={styles.ledgerBlock}>
            <AdminText textRole="title2" style={styles.sectionTitle}>{copy.labels.workerLedger}</AdminText>
            <View style={styles.metaGrid}>
              <MetaItem label={copy.labels.transactionStatus} value={statusLabel(ledger.payment_state)} />
              <MetaItem label={copy.labels.paymentAvailableAt} value={ledger.available_at ? formatDate(ledger.available_at) : copy.notRecorded} />
              <MetaItem label={copy.labels.paymentAmount} value={formatCurrency(ledger.gross_amount)} />
              <MetaItem label={copy.labels.platformFee} value={formatCurrency(ledger.platform_fee)} />
              <MetaItem label={copy.labels.workerNet} value={formatCurrency(ledger.worker_net)} />
              <MetaItem label={copy.labels.commissionRate} value={commissionRate} />
              <MetaItem label={copy.labels.ledgerRecordedAt} value={formatDate(ledger.created_at)} />
            </View>
          </View>}
        </ScrollView>
      </View>
    </View></View>
  </Modal>
}
