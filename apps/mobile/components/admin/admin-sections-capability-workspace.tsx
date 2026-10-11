import { View } from 'react-native'
import { KaelButton } from '@/components/ui/kael-primitives'
import type { AdminViewActor, AdminViewOverviewDetailKey } from '@/lib/api-types/admin'
import { AdminOperationsOverview } from './admin-operations-and-team'
import { AdminPagination } from './admin-pagination'
import { AdminPayoutsPanel } from './admin-payouts'
import { AdminFinancePanel } from './admin-finance'
import { FinanceChoiceChip } from './admin-finance-controls'
import { TransactionCard, WorkerApplicationCard } from './admin-section-cards'
import { styles } from './admin-sections-styles'
import { AdminWorkerReviewModal } from './admin-worker-review-modal'
import { workerReviewCopy } from './admin-worker-review-copy'
import { type AdminProductionCapability, type AdminProductionCapabilityId } from './admin-sections-production-copy'
import { AdminOverviewDetailWorklist } from './admin-overview-detail-worklist'
import { AdminScopeChangeMonitor } from './admin-scope-change-monitor'
import { AdminSupportCaseCenter } from './admin-support-case-center'
import { AdminAmbassadorProgramWorkspace } from './admin-ambassador-program-workspace'
import { AdminDisciplineWorkspace } from './admin-discipline-workspace'
import { AdminSystemWorkspace } from './admin-system-workspace'
import { AdminTeamWorkspace } from './admin-team-workspace'
import { AdminText } from './admin-text'
import { TRANSACTIONS_PER_PAGE, WORKERS_PER_PAGE, type AdminSectionsState } from './admin-sections-state'
import { AdminUnavailableCapability } from './admin-sections-production-workspace'
import { AdminDataFeedback, AdminDataSearchToolbar, AdminWorkspaceLoading, EmptyState } from './admin-sections-support'
import type { AdminSectionsCopy } from './admin-sections-copy'
import type { AdminSectionsLayoutProps } from './admin-sections-layout-types'
function usesOverviewWorklist(
  capabilityId: AdminProductionCapabilityId,
  detailKey: AdminViewOverviewDetailKey,
) {
  if (capabilityId === 'operations-job-monitor') {
    return detailKey !== 'payment_attention' && detailKey !== 'open_disputes'
  }
  return capabilityId === 'workers-applications'
    || capabilityId === 'workers-profile-review'
    || capabilityId === 'workers-access'
}

function overviewDetailTitle(key: AdminViewOverviewDetailKey, language: 'vi' | 'en') {
  const copy = language === 'vi' ? {
    assigned: 'Đã nhận / đang di chuyển', coordination: 'Đang điều phối', finishing: 'Đang hoàn tất', inService: 'Đang thực hiện',
    open_disputes: 'Tranh chấp đang mở', other: 'Trạng thái công việc khác', other_admin_queue: 'Hàng chờ quản trị khác',
    payment_attention: 'Thanh toán cần chú ý', worker_applications: 'Hồ sơ thợ', workers_in_verification: 'Đang xác minh', workers_suspended: 'Đang tạm ngưng',
  } : {
    assigned: 'Assigned / travelling', coordination: 'Coordinating', finishing: 'Finishing', inService: 'In service',
    open_disputes: 'Open disputes', other: 'Other job states', other_admin_queue: 'Other Admin queue',
    payment_attention: 'Payments requiring attention', worker_applications: 'Worker applications', workers_in_verification: 'In verification', workers_suspended: 'Suspended',
  }
  return copy[key]
}

export function AdminCapabilityWorkspace({ actions, actor, capability, copy, financeView, formatters, language, onFinanceUpdated, payoutInitialTab, reduceMotion, reduceTransparency, state }: {
  actions: AdminSectionsLayoutProps['actions']
  actor: AdminViewActor
  capability: AdminProductionCapability
  copy: AdminSectionsCopy
  financeView: string
  formatters: AdminSectionsLayoutProps['formatters']
  language: 'vi' | 'en'
  onFinanceUpdated: () => void
  payoutInitialTab: 'accounts' | 'withdrawals'
  reduceMotion: boolean
  reduceTransparency: boolean
  state: AdminSectionsState
}) {
  const { commitDecision, handleSessionMissing, loadData, openSection, openTransaction, patch } = actions
  const { disputeStatusLabel, formatCurrency, formatDate, jobStatusLabel, paymentProviderLabel, serviceLabel, statusLabel } = formatters
  const {
    actionPending,
    error,
    readError,
    detailReadError,
    loading,
    managerNominations,
    notice,
    operations,
    operationsError,
    overviewDetailKey,
    pendingAdminAccounts,
    refreshing,
    searchQuery,
    subAdmins,
    teamError,
    transactionPage,
    transactions,
    transactionsHasMore,
    transactionsTotalCount,
    workerFilter,
    workerPage,
    workers,
    workersHasMore,
    workersTotalCount,
  } = state

  if (capability.status === 'missing') return <AdminUnavailableCapability language={language} />

  if (overviewDetailKey && usesOverviewWorklist(capability.id, overviewDetailKey)) {
    return <AdminOverviewDetailWorklist
      detailKey={overviewDetailKey}
      key={overviewDetailKey}
      language={language}
      onClearFilter={() => patch({ overviewDetailKey: null })}
      onSessionMissing={handleSessionMissing}
      title={overviewDetailTitle(overviewDetailKey, language)}
    />
  }

  switch (capability.id) {
    case 'operations-job-monitor':
      return <AdminOperationsOverview
        error={operationsError}
        language={language}
        loading={loading && !operations}
        onOpenPanel={(panel) => panel === 'workers'
          ? openSection('workers')
          : panel === 'transactions'
            ? patch({ selectedCapabilityId: 'operations-service-transactions' })
            : undefined}
        snapshot={operations}
      />
    case 'operations-service-transactions':
      return <>
        {overviewDetailKey === 'payment_attention' ? <View style={styles.filterRow} testID="admin-overview-payment-filter">
          <AdminText textRole="subheadline">{overviewDetailTitle(overviewDetailKey, language)}</AdminText>
          <KaelButton label={language === 'vi' ? 'Bỏ bộ lọc' : 'Clear filter'} onPress={() => patch({ overviewDetailKey: null, transactionPage: 1 })} variant="secondary" />
        </View> : null}
        <AdminDataSearchToolbar copy={copy} onChangeSearch={(searchQuery) => patch({ searchQuery })} searchQuery={searchQuery} />
        <AdminDataFeedback error={readError} notice={notice} />
        <AdminDataFeedback error={error} notice={null} />
        <AdminDataFeedback error={detailReadError} notice={null} />
        {loading && transactions.length === 0 ? <AdminWorkspaceLoading copy={copy} /> : transactions.length === 0 ? <EmptyState body={copy.noData.transactions} /> : <>
          {transactions.map((transaction) => <TransactionCard key={transaction.job_id} transaction={transaction} copy={copy} serviceLabel={serviceLabel} statusLabel={statusLabel} paymentProviderLabel={paymentProviderLabel} disputeStatusLabel={disputeStatusLabel} jobStatusLabel={jobStatusLabel} formatCurrency={formatCurrency} formatDate={formatDate} onOpen={() => void openTransaction(transaction)} />)}
          <AdminPagination hasMore={transactionsHasMore} labels={copy.pagination} loading={loading || refreshing} onPageChange={(transactionPage) => patch({ transactionPage })} page={transactionPage} pageTestIDPrefix="admin-transaction-page" pageSize={TRANSACTIONS_PER_PAGE} testID="admin-transaction-pagination" totalCount={transactionsTotalCount} />
        </>}
      </>
    case 'operations-scope-change':
      return <AdminScopeChangeMonitor language={language} onSessionMissing={handleSessionMissing} />
    case 'operations-disputes':
      return <AdminSupportCaseCenter actor={actor} language={language} onSessionMissing={handleSessionMissing} />
    case 'workers-applications':
    case 'workers-profile-review':
    case 'workers-access':
    case 'workers-finance':
      return <>
        <AdminDataSearchToolbar copy={copy} onChangeSearch={(searchQuery) => patch({ searchQuery })} searchQuery={searchQuery} />
        <View style={styles.filterRow}>
          {(['pending_access', 'missing_profile', 'ready_verification', 'verified', 'all'] as const).map((filter) => <FinanceChoiceChip key={filter} accessibilityLabel={workerReviewCopy[language].filter[filter]} label={workerReviewCopy[language].filter[filter]} onPress={() => patch({ workerFilter: filter, workerPage: 1 })} selected={workerFilter === filter} testID={`admin-worker-filter-${filter}`} />)}
        </View>
        <AdminDataFeedback error={readError} notice={notice} />
        <AdminDataFeedback error={error} notice={null} />
        {loading && workers.length === 0 ? <AdminWorkspaceLoading copy={copy} /> : workers.length === 0 ? <EmptyState body={copy.noData.workers} /> : <>
          {workers.map((worker) => <WorkerApplicationCard key={worker.id} copy={copy} language={language} worker={worker} serviceLabel={serviceLabel} formatDate={formatDate} actionPending={actionPending} canReview={actor.capabilities.includes('workers.review')} onOpen={() => patch({ selectedWorker: worker })} onApprove={() => void commitDecision(worker, 'approve')} onRequestChanges={() => patch({ decisionModal: { decision: 'request_changes', worker }, decisionReason: '' })} onReject={() => patch({ decisionModal: { decision: 'reject', worker }, decisionReason: '' })} />)}
          <AdminPagination hasMore={workersHasMore} labels={copy.pagination} loading={loading || refreshing} onPageChange={(workerPage) => patch({ workerPage })} page={workerPage} pageTestIDPrefix="admin-worker-page" pageSize={WORKERS_PER_PAGE} testID="admin-worker-pagination" totalCount={workersTotalCount} />
        </>}
      </>
    case 'workers-discipline':
      return <AdminDisciplineWorkspace language={language} />
    case 'workers-ambassador':
      return <AdminAmbassadorProgramWorkspace language={language} />
    case 'finance-overview':
    case 'finance-reconciliation':
    case 'finance-tax': {
      const effectiveView = capability.id === 'finance-reconciliation'
        ? 'cash'
        : capability.id === 'finance-tax'
          ? 'tax'
          : financeView
      return <AdminFinancePanel actor={actor} initialView={effectiveView} key={`${capability.id}-${effectiveView}`} onFinanceUpdated={onFinanceUpdated} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} />
    }
    case 'finance-payouts':
      return <AdminPayoutsPanel actor={actor} initialTab={payoutInitialTab} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} />
    case 'team-directory':
    case 'team-provisioning':
    case 'team-capabilities':
    case 'team-access-audit':
      return loading && subAdmins.length === 0 && !teamError
        ? <AdminWorkspaceLoading copy={copy} />
        : teamError
          ? <AdminDataFeedback error={teamError} notice={null} />
          : <AdminTeamWorkspace actor={actor} capability={capability.id} language={language} members={subAdmins} nominations={managerNominations} pendingAccounts={pendingAdminAccounts} onRefresh={loadData} />
    case 'system-price-baseline':
    case 'system-taxonomy':
    case 'system-learning-rules':
    case 'system-model-health':
    case 'system-health-monitor':
      return <AdminSystemWorkspace actor={actor} capability={capability.id} key={capability.id} language={language} />
    default:
      return <AdminUnavailableCapability language={language} />
  }
}
