import { Pressable, Text, View } from 'react-native'

import { FormulaMintCardAura } from '@/components/ui/formula-mint-card'
import { KaelButton } from '@/components/ui/kael-primitives'
import type {
  AdminViewTransactionSummary,
  AdminViewWorkerApplicationSummary,
} from '@/lib/api-types/admin'
import type { AdminSectionsCopy } from './admin-sections-copy'
import { workerReviewCopy } from './admin-worker-review-copy'
import { styles } from './admin-sections-styles'

type StatusTone = 'warning' | 'success' | 'danger' | 'neutral'

export function WorkerApplicationCard({
  copy,
  language,
  worker,
  serviceLabel,
  formatDate,
  actionPending,
  canReview,
  onOpen,
  onApprove,
  onRequestChanges,
  onReject,
}: {
  copy: AdminSectionsCopy
  language: 'vi' | 'en'
  worker: AdminViewWorkerApplicationSummary
  serviceLabel: (value: AdminViewTransactionSummary['service_type']) => string
  formatDate: (value: string | null | undefined) => string
  actionPending: string | null
  canReview: boolean
  onOpen: () => void
  onApprove: () => void
  onRequestChanges: () => void
  onReject: () => void
}) {
  const pending = actionPending?.startsWith(`${worker.id}:`)
  const canAct = worker.stage === 'pending_access' && (worker.status === 'open' || worker.status === 'acknowledged')
  const reviewCopy = workerReviewCopy[language]
  return <View style={styles.card} testID={`admin-worker-application-${worker.id}`}>
    <Pressable accessibilityRole="button" accessibilityLabel={worker.full_name ?? worker.id} onPress={onOpen} style={styles.cardPressArea}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>{worker.full_name ?? copy.notRecorded}</Text>
          <Text style={styles.cardSubtitle}>{worker.phone_masked ?? worker.contact_suffix ?? copy.notRecorded}</Text>
        </View>
        <StatusPill label={reviewCopy.stage[worker.stage]} tone={worker.stage === 'verified' ? 'success' : worker.stage === 'ready_verification' ? 'warning' : 'neutral'} />
      </View>
      <View style={styles.metaGrid}>
        <MetaItem label={copy.labels.accountRole} value={worker.account_role === 'worker' ? copy.labels.worker : copy.labels.customer} />
        <MetaItem label={copy.labels.submitted} value={formatDate(worker.submitted_at)} />
        <MetaItem label={copy.labels.profileStatus} value={worker.worker_profile ? copy.profileStatus[worker.worker_profile.verification_status] : copy.profileStatus.draft} />
        <MetaItem label={reviewCopy.progressLabel} value={reviewCopy.progress(worker.checklist.completed_count, worker.checklist.total_count)} />
      </View>
      {worker.checklist.missing.length > 0 ? <Text style={styles.cardHint}>{reviewCopy.missingLabel}: {worker.checklist.missing.map((field) => reviewCopy.field[field] ?? field).join(' · ')}</Text> : null}
      {worker.worker_profile?.service_types.length ? <Text style={styles.cardHint}>{worker.worker_profile.service_types.map(serviceLabel).join(' · ')}</Text> : <Text style={styles.cardHint}>{copy.workerProfileHint}</Text>}
    </Pressable>
    {canAct && canReview && <View style={styles.actionRow}>
      <KaelButton label={pending ? copy.actions.approving : copy.actions.approve} onPress={onApprove} disabled={Boolean(pending)} style={styles.actionButton} testID={`admin-worker-approve-${worker.id}`} variant="primary" />
      <KaelButton label={copy.actions.requestChanges} onPress={onRequestChanges} disabled={Boolean(pending)} style={styles.actionButton} testID={`admin-worker-request-${worker.id}`} variant="secondary" />
      <KaelButton label={copy.actions.reject} onPress={onReject} disabled={Boolean(pending)} style={styles.actionButton} testID={`admin-worker-reject-${worker.id}`} variant="destructive" />
    </View>}
  </View>
}

export function TransactionCard({ transaction, copy, serviceLabel, statusLabel, paymentProviderLabel, disputeStatusLabel, jobStatusLabel, formatCurrency, formatDate, onOpen, reduceTransparency }: {
  transaction: AdminViewTransactionSummary
  copy: AdminSectionsCopy
  serviceLabel: (value: AdminViewTransactionSummary['service_type']) => string
  statusLabel: (value: string | null) => string
  paymentProviderLabel: (value: string | null) => string
  disputeStatusLabel: (value: string | null) => string
  jobStatusLabel: (value: AdminViewTransactionSummary['status']) => string
  formatCurrency: (value: number | null) => string
  formatDate: (value: string | null | undefined) => string
  onOpen: () => void
  reduceTransparency: boolean
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={transaction.display_code} testID={`admin-transaction-${transaction.job_id}`} onPress={onOpen} style={[styles.card, styles.transactionCard]}>
    <View pointerEvents="none" style={styles.transactionAuraClip}>
      <FormulaMintCardAura reduceTransparency={reduceTransparency} scope={`AdminTransaction${transaction.job_id}`} testID={`admin-transaction-${transaction.job_id}-formula-mint-aura`} />
    </View>
    <View style={styles.transactionContent}>
      <View style={styles.transactionHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>{transaction.display_code}</Text>
          <Text style={styles.cardSubtitle}>{serviceLabel(transaction.service_type)} · {formatDate(transaction.updated_at)}</Text>
        </View>
        <StatusPill label={statusLabel(transaction.payment_status)} tone={transaction.dispute_status ? 'danger' : transaction.payment_status === 'received' ? 'success' : 'warning'} />
      </View>
      <View style={styles.transactionSummary}>
        <View style={styles.transactionSummaryItem}>
          <Text style={styles.transactionSummaryLabel}>{copy.labels.paymentAmount}</Text>
          <Text style={styles.transactionAmount}>{formatCurrency(transaction.gross_amount)}</Text>
        </View>
        <View style={styles.transactionSummaryItem}>
          <Text style={styles.transactionSummaryLabel}>{transaction.dispute_status ? copy.timeline.dispute_opened : copy.labels.jobStatusSummary}</Text>
          <Text style={styles.transactionStatus}>{transaction.dispute_status ? disputeStatusLabel(transaction.dispute_status) : jobStatusLabel(transaction.status)}</Text>
        </View>
      </View>
      <View style={styles.transactionMetaGrid}>
        <TransactionMetaItem label={copy.labels.customer} value={transaction.customer_name ?? copy.notRecorded} />
        <TransactionMetaItem label={copy.labels.worker} value={transaction.worker_name ?? copy.notRecorded} />
        <TransactionMetaItem label={copy.labels.paymentMethod} value={paymentProviderLabel(transaction.payment_provider)} />
        <TransactionMetaItem label={copy.labels.transactionStatus} value={statusLabel(transaction.payment_status)} />
      </View>
    </View>
  </Pressable>
}

export function MetaItem({ label, value }: { label: string; value: string }) {
  return <View style={styles.metaItem}><Text style={styles.metaLabel}>{label}</Text><Text style={styles.metaValue} numberOfLines={2}>{value}</Text></View>
}

function TransactionMetaItem({ label, value }: { label: string; value: string }) {
  return <View style={styles.transactionMetaItem}><Text style={styles.transactionMetaLabel}>{label}</Text><Text style={styles.transactionMetaValue} numberOfLines={2}>{value}</Text></View>
}

export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return <View style={[styles.statusPill, tone === 'warning' && styles.statusWarning, tone === 'success' && styles.statusSuccess, tone === 'danger' && styles.statusDanger]}><Text numberOfLines={2} style={styles.statusPillText}>{label}</Text></View>
}
