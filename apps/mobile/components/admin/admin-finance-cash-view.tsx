import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'

import { KaelTextField } from '@/components/ui/kael-primitives'
import { color, component, radius, shadow, spacing, typography } from '@/design/theme'
import type {
  AdminFinanceOverviewResponse,
  AdminFinanceSummaryResponse,
  AdminPaymentReconciliationSummary,
} from '@/lib/api-types/admin'
import { FinanceChoiceChip, FinanceSecondaryButton } from './admin-finance-controls'
import { financePendingMetricItem } from './admin-finance-overview-helpers'
import { FinanceMetricGrid, Metric, PendingMetric } from './admin-finance-overview-components'
import { reconciliationStatusLabel, type FinanceReconciliationCopy } from './admin-finance-reconciliation-status'
import { AdminText } from './admin-text'

type FinanceCashCopy = FinanceReconciliationCopy & {
  accountBalance: string
  actualAmount: string
  actualBankChange: string
  allAssignments: string
  allMethods: string
  assignedMine: string
  bankTransfer: string
  closingBalance: string
  completedRefunds: string
  directPayment: string
  expectedBankChange: string
  incoming: string
  loadMore: string
  noBreakdown: string
  noQueue: string
  noTrend: string
  openingBalance: string
  paidOut: string
  partial: string
  previousUnavailable: string
  queueTotal: string
  readOnly: string
  reconciliationQueue: string
  saveBalance: string
  saveBalanceHint: string
  searchReconciliation: string
  trend: string
  unavailable: string
  unassigned: string
  variance: string
  versusPrevious: string
}

export function FinanceCashView({
  canReconcile,
  copy,
  formatCount,
  formatCurrency,
  formatDate,
  metricCardStyle,
  observedBalance,
  onChangeAssignment,
  onChangeMethod,
  onChangeQuery,
  onChangeObservedBalance,
  onLoadMore,
  onOpenReconciliation,
  onSaveObservedBalance,
  overview,
  pendingAction,
  reconciliationAssignment,
  reconciliationMethod,
  reconciliationNextCursor,
  reconciliationQuery,
  reconciliationTotal,
  reconciliations,
  summary,
}: {
  canReconcile: boolean
  copy: FinanceCashCopy
  formatCount: (value: number | null) => string
  formatCurrency: (value: number | null) => string
  formatDate: (value: string | null) => string
  metricCardStyle: ViewStyle
  observedBalance: string
  onChangeAssignment: (value: 'all' | 'mine' | 'unassigned') => void
  onChangeMethod: (value: 'all' | 'platform_bank_manual' | 'direct_worker') => void
  onChangeQuery: (value: string) => void
  onChangeObservedBalance: (value: string) => void
  onLoadMore: () => void
  onOpenReconciliation: (item: AdminPaymentReconciliationSummary) => void
  onSaveObservedBalance: () => void
  overview: AdminFinanceOverviewResponse | null
  pendingAction: string | null
  reconciliationAssignment: 'all' | 'mine' | 'unassigned'
  reconciliationMethod: 'all' | 'platform_bank_manual' | 'direct_worker'
  reconciliationNextCursor: string | null
  reconciliationQuery: string
  reconciliationTotal: { amount: number | null; count: number | null }
  reconciliations: AdminPaymentReconciliationSummary[]
  summary: AdminFinanceSummaryResponse | null
}) {
  return <View style={styles.viewStack} testID="admin-finance-view-cash">
    {!canReconcile ? <View style={styles.readOnlyBadge}><AdminText textRole="subheadline" style={styles.readOnlyText}>{copy.readOnly}</AdminText></View> : null}
    <FinanceMetricGrid cardStyle={metricCardStyle} items={[
      financePendingMetricItem('incoming', copy.incoming, summary?.platform_incoming, formatCurrency, copy),
      financePendingMetricItem('paid-out', copy.paidOut, summary?.payout_outflow, formatCurrency, copy),
      financePendingMetricItem('direct-payment', copy.directPayment, summary?.direct_payment_total, formatCurrency, copy),
      financePendingMetricItem('completed-refunds', copy.completedRefunds, overview?.metrics.refund_completed_vnd.value, formatCurrency, copy),
    ]} />
    <View style={styles.balanceCard}>
      <AdminText textRole="title2" style={styles.sectionTitle}>{copy.accountBalance}</AdminText>
      <View style={styles.balanceGrid}>
        <PendingMetric label={copy.openingBalance} value={overview?.bank_reconciliation.opening_balance_vnd.value ?? summary?.opening_balance} formatValue={formatCurrency} copy={copy} />
        <PendingMetric label={copy.closingBalance} value={overview?.bank_reconciliation.closing_balance_vnd.value ?? summary?.closing_balance} formatValue={formatCurrency} copy={copy} />
        <PendingMetric label={copy.expectedBankChange} value={overview?.bank_reconciliation.expected_change_vnd.value ?? summary?.expected_bank_change} formatValue={formatCurrency} copy={copy} />
        <PendingMetric label={copy.actualBankChange} value={overview?.bank_reconciliation.actual_change_vnd.value ?? summary?.actual_bank_change} formatValue={formatCurrency} copy={copy} />
        <PendingMetric label={copy.variance} value={overview?.bank_reconciliation.unexplained_variance_vnd.value ?? summary?.unexplained_variance} formatValue={formatCurrency} copy={copy} />
      </View>
      {canReconcile ? <><AdminText textRole="headline" style={styles.subtitle}>{copy.saveBalanceHint}</AdminText><KaelTextField
        accessibilityLabel={copy.accountBalance}
        keyboardType="number-pad"
        label={copy.accountBalance}
        onChangeText={onChangeObservedBalance}
        placeholder="0"
        placeholderTextColor={color.text.muted}
        value={observedBalance}
      />
      <FinanceSecondaryButton disabled={pendingAction === 'snapshot'} label={copy.saveBalance} onPress={onSaveObservedBalance} /></> : null}
    </View>

    {canReconcile ? <><View style={styles.queueHeader}>
      <AdminText textRole="title2" style={styles.sectionTitle}>{copy.reconciliationQueue}</AdminText>
    </View>
    <View style={styles.queueSummary}>
      <Metric label={copy.queueTotal} value={formatCount(reconciliationTotal.count)} />
      <Metric label={copy.actualAmount} value={formatCurrency(reconciliationTotal.amount)} />
    </View>
    <KaelTextField
      accessibilityLabel={copy.searchReconciliation}
      label={copy.searchReconciliation}
      onChangeText={onChangeQuery}
      placeholder={copy.searchReconciliation}
      placeholderTextColor={color.text.muted}
      testID="admin-finance-reconciliation-search"
      value={reconciliationQuery}
    />
    <View style={styles.queueFilters}>
      {([['all', copy.allMethods], ['platform_bank_manual', copy.bankTransfer], ['direct_worker', copy.directPayment]] as const).map(([value, label]) => <FinanceChoiceChip key={value} label={label} onPress={() => onChangeMethod(value)} selected={reconciliationMethod === value} testID={`admin-finance-reconciliation-method-${value}`} />)}
    </View>
    <View style={styles.queueFilters}>
      {([['all', copy.allAssignments], ['unassigned', copy.unassigned], ['mine', copy.assignedMine]] as const).map(([value, label]) => <FinanceChoiceChip key={value} label={label} onPress={() => onChangeAssignment(value)} selected={reconciliationAssignment === value} testID={`admin-finance-reconciliation-assignment-${value}`} />)}
    </View>
    {reconciliations.length === 0 ? <View style={styles.emptyCard}><AdminText textRole="subheadline" style={styles.emptyText}>{copy.noQueue}</AdminText></View> : reconciliations.map((item) => <Pressable
      accessibilityLabel={`${copy.reconciliationQueue}: ${item.job_id}`}
      accessibilityRole="button"
      key={item.id}
      onPress={() => onOpenReconciliation(item)}
      style={styles.reconciliationCard}
      testID={`admin-finance-reconciliation-${item.id}`}
    >
      <View style={styles.reconciliationHeader}>
        <AdminText textRole="headline" style={styles.reconciliationTitle}>{item.payment_method === 'platform_bank_manual' ? copy.incoming : copy.directPayment}</AdminText>
        <AdminText textRole="footnote" style={styles.status}>{reconciliationStatusLabel(item.status, copy)}</AdminText>
      </View>
      <AdminText textRole="footnote" style={styles.jobId}>{item.job_id}</AdminText>
      <View style={styles.detailGrid}>
        <Metric label={copy.actualAmount} value={formatCurrency(item.amount_received ?? item.gross_amount)} />
        <Metric label={copy.customerClaimedAt} value={formatDate(item.customer_transfer_claimed_at)} />
      </View>
    </Pressable>)}
    {reconciliationNextCursor ? <FinanceSecondaryButton label={copy.loadMore} onPress={onLoadMore} /> : null}</> : null}
  </View>
}

const styles = StyleSheet.create({
  balanceCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, padding: spacing.lg, ...shadow.soft },
  balanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  emptyCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  emptyText: { ...typography.subheadline, color: color.text.secondary },
  jobId: { ...typography.caption2, color: color.text.muted, fontVariant: ['tabular-nums'] },
  queueFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  queueHeader: { marginTop: spacing.md },
  queueSummary: { backgroundColor: color.surface.soft, borderRadius: radius.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, padding: spacing.md },
  readOnlyBadge: { alignSelf: 'flex-start', backgroundColor: color.surface.soft, borderColor: color.surface.stroke, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  readOnlyText: { ...typography.label, color: color.text.secondary, fontWeight: '600' },
  reconciliationCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  reconciliationHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  reconciliationTitle: { ...typography.subheadline, color: color.text.strong, flex: 1, fontWeight: '600' },
  sectionTitle: { ...typography.headline, color: color.text.strong, fontWeight: '600' },
  status: { ...typography.caption2, color: color.brand.primary, fontWeight: '600', maxWidth: '48%', textAlign: 'right' },
  subtitle: { ...typography.subheadline, color: color.text.secondary },
  viewStack: { gap: spacing.lg },
})
