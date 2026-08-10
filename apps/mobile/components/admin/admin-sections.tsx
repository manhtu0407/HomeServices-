import { useCallback, useEffect, useState } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { FormulaMintCanvasAura } from '@/components/ui/formula-mint-canvas'
import { FormulaMintCardAura } from '@/components/ui/formula-mint-card'
import { KaelButton, KaelChip, KaelTextField } from '@/components/ui/kael-primitives'
import { color, component, radius, shadow, spacing, typography } from '@/design/theme'
import type { ApiResult } from '@/lib/api'
import { localizedStatusLabel, useAppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { adminControlService } from '@/lib/services'
import type {
  AdminViewActor,
  AdminViewManagerNominationSummary,
  AdminViewOperationsResponse,
  AdminViewSubAdminSummary,
  AdminViewTransactionDetailResponse,
  AdminViewTransactionSummary,
  AdminViewWorkerApplicationDecisionInput,
  AdminViewWorkerApplicationSummary,
} from '@/lib/api-types/admin'
import { adminSectionsCopy, type AdminSectionsCopy } from './admin-sections-copy'
import { AdminOperationsOverview, AdminSubAdminPanel } from './admin-operations-and-team'
import { AdminPagination } from './admin-pagination'
import { AdminPayoutsPanel } from './admin-payouts'
import { AdminTabNavigation } from './admin-tab-navigation'
import { AdminGovernancePanel } from './admin-governance'
import { MetaItem, TransactionCard, WorkerApplicationCard } from './admin-section-cards'

type AdminSectionTab = 'operations' | 'team' | 'governance'
type AdminOperationPanel = 'operations' | 'workers' | 'transactions'
type AdminTransactionView = 'services' | 'payouts'
type WorkerFilter = 'open' | 'all'
type AdminSectionRouteParams = { ns_admin_section?: string | string[] }
type DecisionModal = {
  decision: Exclude<AdminViewWorkerApplicationDecisionInput['decision'], 'approve'>
  worker: AdminViewWorkerApplicationSummary
} | null

function firstAdminSectionParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function isMissingAdminSession(result: ApiResult<unknown>) {
  return !result.success && (
    result.status === 401
    || result.code === 'AUTH_MISSING'
    || result.code === 'AUTH_REQUIRED'
  )
}

type WorkerAccessModal = {
  action: 'suspend' | 'reinstate'
  worker: AdminViewWorkerApplicationSummary
} | null

const TRANSACTIONS_PER_PAGE = 8
const WORKERS_PER_PAGE = 8
const ADMIN_AUTO_REFRESH_MS = 30_000

const serviceLabels = {
  vi: {
    electrical: 'Sửa điện',
    plumbing: 'Sửa nước',
    cleaning: 'Vệ sinh nhà',
    hvac: 'Điều hòa và không khí trong nhà',
    upholstery: 'Chăm sóc sofa và đồ vải',
    handyman: 'Sửa chữa nhỏ và lắp đặt',
  },
  en: {
    electrical: 'Electrical repair',
    plumbing: 'Plumbing repair',
    cleaning: 'Home cleaning',
    hvac: 'Air conditioning and indoor air',
    upholstery: 'Sofa and fabric care',
    handyman: 'Minor repair and installation',
  },
} as const

export function AdminSections() {
  const router = useRouter()
  const language = useAppLanguage()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const copy = adminSectionsCopy[language]
  const { signOut } = useAuth()
  const params = useLocalSearchParams<AdminSectionRouteParams>()
  const adminSection = firstAdminSectionParam(params.ns_admin_section)
  const initialPanel: AdminOperationPanel = adminSection === 'transactions' || adminSection === 'withdrawals'
    ? 'transactions'
    : adminSection === 'workers'
      ? 'workers'
      : 'operations'
  const [activeTab, setActiveTab] = useState<AdminSectionTab>(adminSection === 'team' ? 'team' : adminSection === 'governance' ? 'governance' : 'operations')
  const [activePanel, setActivePanel] = useState<AdminOperationPanel>(initialPanel)
  const [transactionView, setTransactionView] = useState<AdminTransactionView>(adminSection === 'withdrawals' ? 'payouts' : 'services')
  const [transactionPage, setTransactionPage] = useState(1)
  const [transactionsHasMore, setTransactionsHasMore] = useState(false)
  const [transactionsTotalCount, setTransactionsTotalCount] = useState<number | null>(null)
  const [workerPage, setWorkerPage] = useState(1)
  const [workersHasMore, setWorkersHasMore] = useState(false)
  const [workersTotalCount, setWorkersTotalCount] = useState<number | null>(null)
  const [workerFilter, setWorkerFilter] = useState<WorkerFilter>('open')
  const [searchQuery, setSearchQuery] = useState('')
  const [workers, setWorkers] = useState<AdminViewWorkerApplicationSummary[]>([])
  const [transactions, setTransactions] = useState<AdminViewTransactionSummary[]>([])
  const [operations, setOperations] = useState<AdminViewOperationsResponse | null>(null)
  const [subAdmins, setSubAdmins] = useState<AdminViewSubAdminSummary[]>([])
  const [managerNominations, setManagerNominations] = useState<AdminViewManagerNominationSummary[]>([])
  const [actor, setActor] = useState<AdminViewActor | null>(null)
  const [selectedWorker, setSelectedWorker] = useState<AdminViewWorkerApplicationSummary | null>(null)
  const [selectedTransaction, setSelectedTransaction] = useState<AdminViewTransactionDetailResponse | null>(null)
  const [decisionModal, setDecisionModal] = useState<DecisionModal>(null)
  const [decisionReason, setDecisionReason] = useState('')
  const [workerAccessModal, setWorkerAccessModal] = useState<WorkerAccessModal>(null)
  const [workerAccessReason, setWorkerAccessReason] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [operationsError, setOperationsError] = useState<string | null>(null)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [signOutConfirmationOpen, setSignOutConfirmationOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (adminSection === 'team') {
        setActiveTab('team')
        return
      }
      if (adminSection === 'governance') {
        setActiveTab('governance')
        return
      }
      setActiveTab('operations')
      setActivePanel(adminSection === 'transactions' || adminSection === 'withdrawals' ? 'transactions' : adminSection === 'workers' ? 'workers' : 'operations')
      setTransactionView(adminSection === 'withdrawals' ? 'payouts' : 'services')
      setTransactionPage(1)
      setWorkerPage(1)
    }, 0)
    return () => clearTimeout(timer)
  }, [adminSection])

  const loadData = useCallback(async (routeToLoginWhenSessionMissing = false) => {
    setLoading(true)
    setError(null)
    setOperationsError(null)
    setTeamError(null)
    const operationsResult = await adminControlService.getOperations()
    if (routeToLoginWhenSessionMissing && !operationsResult.success && isMissingAdminSession(operationsResult)) {
      setOperations(null)
      setOperationsError(operationsResult.error)
      setLoading(false)
      router.replace('/(auth)/login?stage=login' as never)
      return
    }
    const [workerResult, transactionResult, teamResult] = await Promise.all([
      adminControlService.listWorkerApplications({
        status: workerFilter,
        query: searchQuery,
        limit: WORKERS_PER_PAGE,
        offset: (workerPage - 1) * WORKERS_PER_PAGE,
      }),
      adminControlService.listTransactions({
        query: searchQuery,
        limit: TRANSACTIONS_PER_PAGE,
        offset: (transactionPage - 1) * TRANSACTIONS_PER_PAGE,
      }),
      adminControlService.listSubAdmins(),
    ])
    if (operationsResult.success) {
      setOperations(operationsResult.data)
      setActor(operationsResult.data.actor)
    } else {
      setOperations(null)
      setOperationsError(operationsResult.error)
    }
    if (workerResult.success) {
      setWorkers(workerResult.data.applications)
      setWorkersHasMore(workerResult.data.has_more)
      setWorkersTotalCount(workerResult.data.total_count)
    } else {
      setWorkersHasMore(false)
      setWorkersTotalCount(null)
    }
    if (transactionResult.success) {
      setTransactions(transactionResult.data.transactions)
      setTransactionsHasMore(transactionResult.data.has_more)
      setTransactionsTotalCount(transactionResult.data.total_count)
    } else {
      setTransactionsHasMore(false)
      setTransactionsTotalCount(null)
    }
    if (teamResult.success) {
      setSubAdmins(teamResult.data.members)
      setManagerNominations(teamResult.data.nominations)
      setActor((current) => current ?? teamResult.data.actor)
    } else {
      setSubAdmins([])
      setManagerNominations([])
      setTeamError(teamResult.error)
    }
    const activePanelFailed =
      activePanel === 'workers'
        ? !workerResult.success
        : activePanel === 'transactions'
          ? !transactionResult.success
          : false
    if (activePanelFailed) setError(copy.errors.load)
    setLoading(false)
  }, [activePanel, copy.errors.load, router, searchQuery, transactionPage, workerFilter, workerPage])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadData])

  useFocusEffect(useCallback(() => {
    const timer = setInterval(() => { void loadData() }, ADMIN_AUTO_REFRESH_MS)
    return () => clearInterval(timer)
  }, [loadData]))

  const visibleWorkers = workers
  const visibleTransactions = transactions

  const setWorkerStatus = useCallback((workerId: string, status: AdminViewWorkerApplicationSummary['status'], role?: AdminViewWorkerApplicationSummary['account_role']) => {
    setWorkers((current) => current.map((worker) => worker.id === workerId
      ? {
        ...worker,
        status,
        account_role: role ?? worker.account_role,
        worker_profile: role === 'worker' && !worker.worker_profile
          ? {
            verification_status: 'draft',
            is_approved: false,
            is_suspended: false,
            service_types: [],
            districts: [],
            has_cccd: false,
            has_selfie: false,
          }
          : worker.worker_profile,
      }
      : worker))
  }, [])

  const commitDecision = useCallback(async (worker: AdminViewWorkerApplicationSummary, decision: AdminViewWorkerApplicationDecisionInput['decision'], reason?: string) => {
    if ((decision === 'reject' || decision === 'request_changes') && !reason?.trim()) {
      setError(copy.errors.reasonRequired)
      return
    }
    const pendingKey = `${worker.id}:${decision}`
    setActionPending(pendingKey)
    setError(null)
    setNotice(null)
    const result = await adminControlService.decideWorkerApplication(worker.id, {
      decision,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    })
    if (result.success) {
      setWorkerStatus(worker.id, result.data.status, result.data.role)
      setNotice(decision === 'approve' ? copy.notices.approved : decision === 'request_changes' ? copy.notices.changesRequested : copy.notices.rejected)
      setDecisionModal(null)
      setSelectedWorker(null)
      setDecisionReason('')
    } else {
      setError(copy.errors.action)
    }
    setActionPending(null)
  }, [copy.errors.action, copy.errors.reasonRequired, copy.notices.approved, copy.notices.changesRequested, copy.notices.rejected, setWorkerStatus])

  const openTransaction = useCallback(async (transaction: AdminViewTransactionSummary) => {
    setError(null)
    setDetailLoading(true)
    const result = await adminControlService.getTransaction(transaction.job_id)
    if (result.success) setSelectedTransaction(result.data)
    else setError(copy.errors.load)
    setDetailLoading(false)
  }, [copy.errors.load])

  const completeSignOut = useCallback(async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSignOutConfirmationOpen(false)
      setSigningOut(false)
      router.replace('/(auth)/login?stage=login' as never)
    }
  }, [router, signOut, signingOut])

  const commitWorkerAccess = useCallback(async (worker: AdminViewWorkerApplicationSummary, action: 'suspend' | 'reinstate', reason: string) => {
    if (reason.trim().length < 3) {
      setError(language === 'vi' ? 'Nhập lý do thay đổi trạng thái thợ.' : 'Enter a reason for this worker status change.')
      return
    }
    const pendingKey = `${worker.id}:${action}`
    setActionPending(pendingKey)
    setError(null)
    const result = await adminControlService.setWorkerAccess(worker.worker_id, { action, reason: reason.trim() })
    if (result.success) {
      setWorkers((current) => current.map((item) => item.worker_id === result.data.worker_id && item.worker_profile
        ? {
          ...item,
          worker_profile: {
            ...item.worker_profile,
            verification_status: result.data.verification_status,
            is_approved: !result.data.is_suspended,
            is_suspended: result.data.is_suspended,
          },
        }
        : item))
      setNotice(action === 'suspend'
        ? (language === 'vi' ? 'Đã tạm dừng quyền hoạt động của thợ.' : 'Worker access is suspended.')
        : (language === 'vi' ? 'Đã khôi phục quyền hoạt động của thợ.' : 'Worker access is reinstated.'))
      setWorkerAccessModal(null)
      setSelectedWorker(null)
      setWorkerAccessReason('')
    } else {
      setError(copy.errors.action)
    }
    setActionPending(null)
  }, [copy.errors.action, language])

  const formatDate = useCallback((value: string | null | undefined) => {
    if (!value) return copy.notRecorded
    try {
      return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    } catch {
      return copy.notRecorded
    }
  }, [copy.notRecorded, language])

  const formatCurrency = useCallback((value: number | null) => {
    if (value === null) return copy.notRecorded
    return new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
      currency: 'VND',
      maximumFractionDigits: 0,
      style: 'currency',
    }).format(value)
  }, [copy.notRecorded, language])

  const serviceLabel = useCallback((value: AdminViewTransactionSummary['service_type']) => serviceLabels[language][value], [language])
  const statusLabel = useCallback((value: string | null) => value ? (copy.transactionStatus[value] ?? copy.notRecorded) : copy.notRecorded, [copy.notRecorded, copy.transactionStatus])
  const paymentProviderLabel = useCallback((value: string | null) => value ? (copy.paymentProvider[value] ?? copy.notRecorded) : copy.notRecorded, [copy.notRecorded, copy.paymentProvider])
  const disputeStatusLabel = useCallback((value: string | null) => value ? (copy.disputeStatus[value] ?? copy.notRecorded) : copy.notRecorded, [copy.disputeStatus, copy.notRecorded])
  const jobStatusLabel = useCallback((value: AdminViewTransactionSummary['status']) => localizedStatusLabel(value, language), [language])

  return (
    <SafeAreaView style={styles.safeArea} testID="admin-sections">
      <FormulaMintCanvasAura reduceTransparency={reduceTransparency} scope="AdminSections" testID="admin-sections-mint-aura" />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.page}>
          <View style={styles.hero}>
            <View style={styles.heroTopRow}>
              <Text style={styles.heroTitle}>{copy.heroTitle}</Text>
              <KaelButton label={copy.actions.signOut} onPress={() => setSignOutConfirmationOpen(true)} size="small" style={styles.heroSignOutButton} testID="admin-sign-out" variant="secondary" />
            </View>
            <Text style={styles.heroBody}>{copy.heroBody}</Text>
          </View>

          <AdminTabNavigation
            items={[
              { key: 'operations', label: copy.navigation.operations, onPress: () => { setActiveTab('operations'); setActivePanel('operations') }, selected: activeTab === 'operations', testID: 'admin-sections-operations-tab' },
              { key: 'team', label: copy.navigation.team, onPress: () => setActiveTab('team'), selected: activeTab === 'team', testID: 'admin-sections-team-tab' },
              ...(actor?.access_level === 'owner' ? [{ key: 'governance', label: language === 'vi' ? 'Hệ thống' : 'System', onPress: () => setActiveTab('governance'), selected: activeTab === 'governance', testID: 'admin-sections-governance-tab' }] : []),
            ]}
            testID="admin-sections-primary-navigation"
          />

          {activeTab === 'governance' ? <AdminGovernancePanel actor={actor} language={language} /> : activeTab === 'team' ? <AdminSubAdminPanel
            actor={actor}
            error={teamError}
            language={language}
            loading={loading}
            members={subAdmins}
            nominations={managerNominations}
            onRefresh={loadData}
            onRetry={() => { void loadData(true) }}
          /> : <>
            <AdminTabNavigation
              items={[
                { key: 'overview', label: copy.navigation.overview, onPress: () => setActivePanel('operations'), selected: activePanel === 'operations', testID: 'admin-sections-overview-tab' },
                { key: 'workers', label: copy.navigation.workers, onPress: () => { setActivePanel('workers'); setWorkerPage(1) }, selected: activePanel === 'workers', testID: 'admin-sections-worker-tab' },
                { key: 'transactions', label: copy.navigation.transactions, onPress: () => { setActivePanel('transactions'); setTransactionView('services'); setTransactionPage(1) }, selected: activePanel === 'transactions', testID: 'admin-sections-transactions-tab' },
              ]}
              testID="admin-sections-operation-navigation"
            />

            {activePanel === 'operations' ? <AdminOperationsOverview
              error={operationsError}
              language={language}
              loading={loading}
              onOpenPanel={(panel) => {
                setActivePanel(panel)
                if (panel === 'workers') setWorkerPage(1)
                if (panel === 'transactions') {
                  setTransactionView('services')
                  setTransactionPage(1)
                }
              }}
              onRetry={() => { void loadData(true) }}
              snapshot={operations}
            /> : <>
              {activePanel === 'transactions' ? <AdminTabNavigation
                items={[
                  { key: 'services', label: language === 'vi' ? 'Giao dịch dịch vụ' : 'Service transactions', onPress: () => { setTransactionView('services'); setTransactionPage(1) }, selected: transactionView === 'services', testID: 'admin-service-transactions-tab' },
                  { key: 'payouts', label: language === 'vi' ? 'Chi trả thợ' : 'Worker payouts', onPress: () => setTransactionView('payouts'), selected: transactionView === 'payouts', testID: 'admin-worker-payouts-tab' },
                ]}
                testID="admin-transaction-view-navigation"
              /> : null}

              {activePanel === 'transactions' && transactionView === 'payouts' ? <AdminPayoutsPanel actor={actor} initialTab={adminSection === 'withdrawals' ? 'withdrawals' : 'accounts'} key={adminSection === 'withdrawals' ? 'withdrawals' : 'accounts'} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} /> : <>
                <View style={styles.toolbar}>
                  <KaelTextField mode="search" accessibilityLabel={copy.filters.searchPlaceholder} placeholder={copy.filters.searchPlaceholder} placeholderTextColor={color.text.muted} value={searchQuery} onChangeText={(value) => { setSearchQuery(value); setTransactionPage(1); setWorkerPage(1) }} shellStyle={styles.searchField} inputShellStyle={styles.searchInput} style={styles.searchText} autoCapitalize="none" />
                  <KaelButton accessibilityLabel={copy.actions.refresh} label={copy.actions.refresh} onPress={() => { void loadData() }} style={styles.refreshButton} variant="secondary" />
                </View>

                {activePanel === 'workers' && <View style={styles.filterRow}>
                  <KaelChip accessibilityLabel={copy.filters.open} accessibilityState={{ selected: workerFilter === 'open' }} label={copy.filters.open} onPress={() => { setWorkerFilter('open'); setWorkerPage(1) }} variant={workerFilter === 'open' ? 'selected' : 'unselected'} />
                  <KaelChip accessibilityLabel={copy.filters.all} accessibilityState={{ selected: workerFilter === 'all' }} label={copy.filters.all} onPress={() => { setWorkerFilter('all'); setWorkerPage(1) }} variant={workerFilter === 'all' ? 'selected' : 'unselected'} />
                </View>}

                {notice && <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View>}
                {error && <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { setError(null); void loadData(true) }}><Text style={styles.errorAction}>{copy.actions.retry}</Text></Pressable></View>}

                {loading ? <View style={styles.loading}><ActivityIndicator color={color.brand.primary} /><Text style={styles.loadingText}>{copy.loading}</Text></View> : activePanel === 'workers' ? (
                  visibleWorkers.length === 0 ? <EmptyState body={copy.noData.workers} /> : <>
                    {visibleWorkers.map((worker) => (
                    <WorkerApplicationCard
                      key={worker.id}
                      copy={copy}
                      worker={worker}
                      serviceLabel={serviceLabel}
                      formatDate={formatDate}
                      actionPending={actionPending}
                      canReview={Boolean(actor?.capabilities.includes('workers.review'))}
                      onOpen={() => setSelectedWorker(worker)}
                      onApprove={() => void commitDecision(worker, 'approve')}
                      onRequestChanges={() => { setDecisionReason(''); setDecisionModal({ decision: 'request_changes', worker }) }}
                      onReject={() => { setDecisionReason(''); setDecisionModal({ decision: 'reject', worker }) }}
                    />
                    ))}
                    <AdminPagination
                      hasMore={workersHasMore}
                      labels={copy.pagination}
                      loading={loading}
                      onPageChange={setWorkerPage}
                      page={workerPage}
                      pageTestIDPrefix="admin-worker-page"
                      pageSize={WORKERS_PER_PAGE}
                      testID="admin-worker-pagination"
                      totalCount={workersTotalCount}
                    />
                  </>
                ) : (
                  visibleTransactions.length === 0 ? <EmptyState body={copy.noData.transactions} /> : <>
                    {visibleTransactions.map((transaction) => (
                      <TransactionCard key={transaction.job_id} transaction={transaction} copy={copy} serviceLabel={serviceLabel} statusLabel={statusLabel} paymentProviderLabel={paymentProviderLabel} disputeStatusLabel={disputeStatusLabel} jobStatusLabel={jobStatusLabel} formatCurrency={formatCurrency} formatDate={formatDate} onOpen={() => void openTransaction(transaction)} reduceTransparency={reduceTransparency} />
                    ))}
                    <AdminPagination
                      hasMore={transactionsHasMore}
                      labels={copy.pagination}
                      loading={loading}
                      onPageChange={setTransactionPage}
                      page={transactionPage}
                      pageTestIDPrefix="admin-transaction-page"
                      pageSize={TRANSACTIONS_PER_PAGE}
                      testID="admin-transaction-pagination"
                      totalCount={transactionsTotalCount}
                    />
                  </>
                )}
                {detailLoading && <View style={styles.detailLoading}><ActivityIndicator color={color.brand.primary} /></View>}
              </>}
            </>}
          </>}
        </View>
      </ScrollView>

      <WorkerDetailModal
        copy={copy}
        language={language}
        worker={selectedWorker}
        formatDate={formatDate}
        actionPending={actionPending}
        canReview={Boolean(actor?.capabilities.includes('workers.review'))}
        canManage={Boolean(actor?.capabilities.includes('workers.manage'))}
        onClose={() => setSelectedWorker(null)}
        onApprove={() => selectedWorker && void commitDecision(selectedWorker, 'approve')}
        onRequestChanges={() => { if (selectedWorker) { setDecisionReason(''); setDecisionModal({ decision: 'request_changes', worker: selectedWorker }) } }}
        onReject={() => { if (selectedWorker) { setDecisionReason(''); setDecisionModal({ decision: 'reject', worker: selectedWorker }) } }}
        onSuspend={() => { if (selectedWorker) { setWorkerAccessReason(''); setWorkerAccessModal({ action: 'suspend', worker: selectedWorker }) } }}
        onReinstate={() => { if (selectedWorker) { setWorkerAccessReason(''); setWorkerAccessModal({ action: 'reinstate', worker: selectedWorker }) } }}
      />

      <DecisionModalView
        copy={copy}
        modal={decisionModal}
        reason={decisionReason}
        pending={Boolean(actionPending)}
        onChangeReason={setDecisionReason}
        onClose={() => setDecisionModal(null)}
        onSubmit={() => decisionModal && void commitDecision(decisionModal.worker, decisionModal.decision, decisionReason)}
      />

      <WorkerAccessModalView
        actionPending={Boolean(actionPending)}
        language={language}
        modal={workerAccessModal}
        onChangeReason={setWorkerAccessReason}
        onClose={() => setWorkerAccessModal(null)}
        onSubmit={() => workerAccessModal && void commitWorkerAccess(workerAccessModal.worker, workerAccessModal.action, workerAccessReason)}
        reason={workerAccessReason}
      />

      <Modal animationType={reduceMotion ? 'none' : 'fade'} transparent visible={signOutConfirmationOpen} onRequestClose={() => { if (!signingOut) setSignOutConfirmationOpen(false) }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} testID="admin-sign-out-confirmation">
            <Text style={styles.modalTitle}>{copy.modal.signOutTitle}</Text>
            <Text style={styles.modalSubtitle}>{copy.modal.signOutBody}</Text>
            <View style={styles.modalActionRow}>
              <KaelButton label={copy.actions.staySignedIn} onPress={() => setSignOutConfirmationOpen(false)} disabled={signingOut} style={styles.modalActionButton} variant="secondary" />
              <KaelButton label={signingOut ? copy.actions.signingOut : copy.actions.signOut} loading={signingOut} onPress={() => { void completeSignOut() }} style={styles.modalActionButton} testID="admin-sign-out-confirm" variant="primary" />
            </View>
          </View>
        </View>
      </Modal>

      <TransactionDetailModal copy={copy} detail={selectedTransaction} formatCurrency={formatCurrency} formatDate={formatDate} language={language} serviceLabel={serviceLabel} statusLabel={statusLabel} paymentProviderLabel={paymentProviderLabel} disputeStatusLabel={disputeStatusLabel} jobStatusLabel={jobStatusLabel} onClose={() => setSelectedTransaction(null)} reduceTransparency={reduceTransparency} />
    </SafeAreaView>
  )
}

function EmptyState({ body }: { body: string }) {
  return <View style={styles.empty}><Text style={styles.emptyText}>{body}</Text></View>
}

function WorkerDetailModal({ copy, language, worker, formatDate, actionPending, canReview, canManage, onClose, onApprove, onRequestChanges, onReject, onSuspend, onReinstate }: {
  copy: AdminSectionsCopy
  language: 'vi' | 'en'
  worker: AdminViewWorkerApplicationSummary | null
  formatDate: (value: string | null | undefined) => string
  actionPending: string | null
  canReview: boolean
  canManage: boolean
  onClose: () => void
  onApprove: () => void
  onRequestChanges: () => void
  onReject: () => void
  onSuspend: () => void
  onReinstate: () => void
}) {
  if (!worker) return null
  const canAct = worker.status === 'open' || worker.status === 'acknowledged'
  return <Modal animationType="fade" transparent visible onRequestClose={onClose}>
    <View style={styles.modalBackdrop}><View style={styles.modalCard}>
      <View style={styles.modalHeader}><Text style={styles.modalTitle}>{worker.full_name ?? copy.notRecorded}</Text><Pressable accessibilityRole="button" accessibilityLabel={copy.actions.close} onPress={onClose}><Text style={styles.closeLabel}>×</Text></Pressable></View>
      <Text style={styles.modalSubtitle}>{copy.labels.accountAccess}: {copy.applicationStatus[worker.status]}</Text>
      <MetaItem label={copy.labels.contact} value={worker.phone_masked ?? worker.contact_suffix ?? copy.notRecorded} />
      <MetaItem label={copy.labels.submitted} value={formatDate(worker.submitted_at)} />
      <MetaItem label={copy.labels.profileStatus} value={worker.worker_profile ? copy.profileStatus[worker.worker_profile.verification_status] : copy.profileStatus.draft} />
      <Text style={styles.modalHint}>{copy.workerProfileHint}</Text>
      {canAct && canReview && <View style={styles.modalActionStack}>
        <KaelButton label={actionPending ? copy.actions.approving : copy.actions.approve} onPress={onApprove} disabled={Boolean(actionPending)} style={styles.modalButton} variant="primary" />
        <KaelButton label={copy.actions.requestChanges} onPress={onRequestChanges} disabled={Boolean(actionPending)} style={styles.modalButton} variant="secondary" />
        <KaelButton label={copy.actions.reject} onPress={onReject} disabled={Boolean(actionPending)} style={styles.modalButton} variant="destructive" />
      </View>}
      {canManage && worker.worker_profile && <View style={styles.modalActionStack}>
        <KaelButton
          label={worker.worker_profile.is_suspended ? (language === 'vi' ? 'Khôi phục hoạt động' : 'Reinstate access') : (language === 'vi' ? 'Tạm dừng hoạt động' : 'Suspend access')}
          onPress={worker.worker_profile.is_suspended ? onReinstate : onSuspend}
          disabled={Boolean(actionPending)}
          style={styles.modalButton}
          variant={worker.worker_profile.is_suspended ? 'secondary' : 'destructive'}
        />
      </View>}
    </View></View>
  </Modal>
}

function DecisionModalView({ copy, modal, reason, pending, onChangeReason, onClose, onSubmit }: {
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
      <Text style={styles.modalTitle}>{title}</Text>
      <Text style={styles.modalSubtitle}>{modal.worker.full_name ?? copy.notRecorded}</Text>
      <KaelTextField testID="admin-worker-decision-reason" accessibilityLabel={copy.modal.decisionReasonPlaceholder} autoFocus multiline value={reason} onChangeText={onChangeReason} placeholder={copy.modal.decisionReasonPlaceholder} placeholderTextColor={color.text.muted} inputShellStyle={styles.reasonInput} style={styles.reasonText} />
      <View style={styles.modalActionRow}><KaelButton label={copy.actions.close} onPress={onClose} style={styles.modalActionButton} variant="secondary" /><KaelButton label={pending ? copy.actions.approving : copy.actions.refresh} onPress={onSubmit} disabled={pending} style={styles.modalActionButton} variant="primary" /></View>
    </View></View>
  </Modal>
}

function WorkerAccessModalView({ actionPending, language, modal, onChangeReason, onClose, onSubmit, reason }: {
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
      <Text style={styles.modalTitle}>{title}</Text>
      <Text style={styles.modalSubtitle}>{modal.worker.full_name ?? modal.worker.worker_id}</Text>
      <KaelTextField testID="admin-worker-access-reason" accessibilityLabel={placeholder} autoFocus multiline value={reason} onChangeText={onChangeReason} placeholder={placeholder} placeholderTextColor={color.text.muted} inputShellStyle={styles.reasonInput} style={styles.reasonText} />
      <View style={styles.modalActionRow}>
        <KaelButton label={language === 'vi' ? 'Đóng' : 'Close'} onPress={onClose} disabled={actionPending} style={styles.modalActionButton} variant="secondary" />
        <KaelButton label={actionPending ? (language === 'vi' ? 'Đang lưu...' : 'Saving...') : (isSuspend ? (language === 'vi' ? 'Tạm dừng' : 'Suspend') : (language === 'vi' ? 'Khôi phục' : 'Reinstate'))} onPress={onSubmit} disabled={actionPending} style={styles.modalActionButton} variant={isSuspend ? 'destructive' : 'primary'} />
      </View>
    </View></View>
  </Modal>
}

function TransactionDetailModal({ copy, detail, formatCurrency, formatDate, language, serviceLabel, statusLabel, paymentProviderLabel, disputeStatusLabel, jobStatusLabel, onClose, reduceTransparency }: {
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
      <View style={styles.transactionModalContent}>
        <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>{copy.modal.transactionTitle}</Text><Text style={styles.modalSubtitle}>{transaction.display_code} · {serviceLabel(transaction.service_type)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={copy.actions.close} onPress={onClose}><Text style={styles.closeLabel}>×</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.modalScrollContent}>
          <View style={styles.amountBlock}>
            <FormulaMintCardAura reduceTransparency={reduceTransparency} scope={`AdminTransactionAmount${transaction.job_id}`} testID="admin-transaction-detail-amount-formula-mint-aura" />
            <View style={styles.amountContent}><Text style={styles.amountLabel}>{copy.labels.paymentAmount}</Text><Text style={styles.amountValue}>{formatCurrency(transaction.gross_amount)}</Text></View>
          </View>
          <View style={styles.metaGrid}><MetaItem label={copy.labels.customer} value={transaction.customer_name ?? copy.notRecorded} /><MetaItem label={copy.labels.worker} value={transaction.worker_name ?? copy.notRecorded} /><MetaItem label={copy.labels.paymentMethod} value={paymentProviderLabel(transaction.payment_provider)} /><MetaItem label={copy.labels.transactionStatus} value={statusLabel(transaction.payment_status)} /><MetaItem label={copy.labels.jobStatus} value={jobStatusLabel(transaction.status)} /><MetaItem label={copy.timeline.dispute_opened} value={disputeStatusLabel(transaction.dispute_status)} /></View>
          <Text style={styles.sectionTitle}>{copy.labels.transactionStatus}</Text>
          <View style={styles.timeline}>{timeline.map((item) => <View key={`${item.key}-${item.occurred_at}`} style={styles.timelineRow}><View style={styles.timelineDot} /><View><Text style={styles.timelineLabel}>{copy.timeline[item.label_key]}</Text><Text style={styles.timelineDate}>{formatDate(item.occurred_at)}</Text></View></View>)}</View>
          {ledger && <View style={styles.ledgerBlock}>
            <Text style={styles.sectionTitle}>{copy.labels.workerLedger}</Text>
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

const styles = StyleSheet.create({
  safeArea: { backgroundColor: color.mint.canvas, flex: 1 },
  scrollContent: { paddingBottom: spacing.xxxl },
  page: { alignSelf: 'center', maxWidth: 1040, paddingHorizontal: spacing.screenHorizontalPadding, paddingTop: spacing.lg, width: '100%' },
  hero: { backgroundColor: color.surface.mint, borderColor: color.surface.strokeStrong, borderRadius: component.card.largeRadius, borderWidth: 1, marginBottom: spacing.lg, padding: spacing.lg, ...shadow.soft },
  heroTopRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  heroSignOutButton: { flexShrink: 0, minWidth: 108 },
  heroTitle: { ...typography.title2, color: color.text.strong, flex: 1, fontWeight: '700', includeFontPadding: false },
  heroBody: { ...typography.callout, color: color.text.secondary, includeFontPadding: false, marginTop: spacing.sm, maxWidth: 700 },
  summarySurface: { alignItems: 'center', backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.lg, padding: spacing.lg, ...shadow.soft },
  summaryItem: { alignItems: 'center', flex: 1, gap: spacing.xs },
  summaryValue: { ...typography.title2, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '700', includeFontPadding: false },
  summaryLabel: { ...typography.caption1, color: color.text.secondary, fontWeight: '600', textAlign: 'center' },
  summaryDivider: { backgroundColor: color.surface.stroke, height: 34, width: 1 },
  toolbar: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  searchField: { flex: 1 },
  searchInput: { backgroundColor: component.input.bg, borderColor: component.input.border, borderRadius: component.input.radius, borderWidth: 1, minHeight: component.input.height },
  searchText: { ...typography.body, color: color.text.primary, minHeight: component.input.height - 2, paddingHorizontal: 0 },
  refreshButton: { minHeight: component.button.secondary.height, paddingHorizontal: spacing.lg },
  filterRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  notice: { backgroundColor: component.chip.successStatus.bg, borderColor: component.chip.successStatus.border, borderRadius: radius.sm, borderWidth: 1, marginBottom: spacing.lg, padding: spacing.md },
  noticeText: { ...typography.footnote, color: component.chip.successStatus.text },
  error: { alignItems: 'center', backgroundColor: color.surface.mint, borderColor: color.surface.strokeStrong, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg, padding: spacing.md },
  errorText: { ...typography.footnote, color: color.brand.primaryDark, flex: 1 },
  errorAction: { ...typography.label, color: color.brand.primaryDark, fontWeight: '600' },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
  loadingText: { ...typography.label, color: color.text.secondary },
  detailLoading: { alignItems: 'center', padding: spacing.lg },
  empty: { alignItems: 'center', backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, padding: spacing.xxxl, ...shadow.soft },
  emptyText: { ...typography.body, color: color.text.secondary, textAlign: 'center' },
  card: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, marginBottom: spacing.lg, padding: spacing.lg, ...shadow.soft },
  cardPressArea: { gap: spacing.md },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  cardTitleBlock: { flex: 1, gap: spacing.xs },
  cardTitle: { ...typography.headline, color: color.text.strong, fontWeight: '700', includeFontPadding: false },
  cardSubtitle: { ...typography.footnote, color: color.text.secondary },
  statusPill: { alignSelf: 'flex-start', backgroundColor: color.surface.disabled, borderColor: color.surface.stroke, borderRadius: component.chip.radius, borderWidth: 1, flexShrink: 1, maxWidth: '48%', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  statusWarning: { backgroundColor: component.chip.warning.bg, borderColor: component.chip.warning.border },
  statusSuccess: { backgroundColor: component.chip.successStatus.bg, borderColor: component.chip.successStatus.border },
  statusDanger: { backgroundColor: component.chip.error.bg, borderColor: component.chip.error.border },
  statusPillText: { ...typography.caption2, color: color.text.strong, fontWeight: '600' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metaItem: { flexBasis: '45%', flexGrow: 1, gap: spacing.xs, minWidth: 120 },
  metaLabel: { ...typography.caption2, color: color.text.muted, fontWeight: '600', textTransform: 'uppercase' },
  metaValue: { ...typography.footnote, color: color.text.primary },
  cardHint: { ...typography.footnote, color: color.text.secondary },
  actionRow: { alignItems: 'center', borderTopColor: color.surface.stroke, borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg, paddingTop: spacing.md },
  actionButton: { flexGrow: 1 },
  modalButton: { width: '100%' },
  modalActionButton: { flex: 1 },
  transactionCard: { padding: spacing.lg },
  transactionAuraClip: { ...StyleSheet.absoluteFill, borderRadius: component.card.radius, overflow: 'hidden' },
  transactionContent: { position: 'relative', zIndex: 1 },
  transactionHeader: { alignItems: 'flex-start', borderBottomColor: color.surface.stroke, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingBottom: spacing.md },
  transactionSummary: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginVertical: spacing.md },
  transactionSummaryItem: { flexBasis: 120, flexGrow: 1, gap: spacing.xs, minWidth: 120 },
  transactionSummaryLabel: { ...typography.caption2, color: color.text.muted, fontWeight: '600' },
  transactionAmount: { ...typography.headline, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '700', includeFontPadding: false },
  transactionStatus: { ...typography.headline, color: color.text.strong, fontWeight: '700', includeFontPadding: false },
  transactionMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  transactionMetaItem: { flexBasis: '45%', flexGrow: 1, gap: spacing.xs, minWidth: 120 },
  transactionMetaLabel: { ...typography.caption2, color: color.text.muted, fontWeight: '600' },
  transactionMetaValue: { ...typography.footnote, color: color.text.primary },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(7,26,36,0.58)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.largeRadius, borderWidth: 1, maxHeight: '90%', maxWidth: 620, padding: spacing.xl, width: '100%', ...shadow.raised },
  transactionModal: { maxWidth: 720 },
  transactionModalAuraClip: { ...StyleSheet.absoluteFill, borderRadius: component.card.largeRadius, overflow: 'hidden' },
  transactionModalContent: { position: 'relative', zIndex: 1 },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  modalTitle: { ...typography.title2, color: color.text.strong, flex: 1, fontWeight: '700', includeFontPadding: false },
  modalSubtitle: { ...typography.footnote, color: color.text.secondary, marginBottom: spacing.lg },
  closeLabel: { ...typography.title1, color: color.text.secondary, fontWeight: '400', paddingLeft: spacing.md },
  modalHint: { ...typography.footnote, color: color.text.secondary, marginTop: spacing.lg },
  modalActionStack: { gap: spacing.sm, marginTop: spacing.xl },
  reasonInput: { backgroundColor: color.surface.soft, borderColor: component.input.border, borderRadius: component.input.radius, borderWidth: 1, minHeight: 112 },
  reasonText: { ...typography.body, color: color.text.primary, minHeight: 108, padding: spacing.md, textAlignVertical: 'top' },
  modalActionRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.lg },
  modalScrollContent: { gap: spacing.lg, paddingBottom: spacing.sm },
  amountBlock: { alignItems: 'flex-start', backgroundColor: color.mint.mint50, borderRadius: component.card.radius, overflow: 'hidden', padding: spacing.lg, position: 'relative' },
  amountContent: { position: 'relative', zIndex: 1 },
  amountLabel: { ...typography.caption1, color: color.text.secondary, fontWeight: '600', textAlign: 'left' },
  amountValue: { ...typography.title1, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '700', marginTop: spacing.xs, textAlign: 'left' },
  sectionTitle: { ...typography.headline, color: color.text.strong, fontWeight: '600' },
  timeline: { gap: spacing.lg },
  timelineRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  timelineDot: { backgroundColor: color.brand.primary, borderRadius: radius.pill, height: 10, marginTop: 5, width: 10 },
  timelineLabel: { ...typography.label, color: color.text.primary, fontWeight: '600' },
  timelineDate: { ...typography.caption1, color: color.text.secondary, marginTop: spacing.xs },
  ledgerBlock: { backgroundColor: color.surface.soft, borderRadius: component.card.radius, gap: spacing.md, padding: spacing.lg },
})

export default AdminSections
