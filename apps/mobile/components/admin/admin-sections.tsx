import { useCallback, useEffect, useReducer } from 'react'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { FormulaMintCanvasAura } from '@/components/ui/formula-mint-canvas'
import { FormulaMintCardAura } from '@/components/ui/formula-mint-card'
import { KaelButton, KaelChip, KaelTextField } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
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
import { AdminFinancePanel } from './admin-finance'
import { MetaItem, TransactionCard, WorkerApplicationCard } from './admin-section-cards'
import { styles } from './admin-sections-styles'

type AdminSectionTab = 'operations' | 'team' | 'governance' | 'finance'
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

type AdminSectionsState = {
  activeTab: AdminSectionTab
  activePanel: AdminOperationPanel
  transactionView: AdminTransactionView
  transactionPage: number
  transactionsHasMore: boolean
  transactionsTotalCount: number | null
  workerPage: number
  workersHasMore: boolean
  workersTotalCount: number | null
  workerFilter: WorkerFilter
  searchQuery: string
  workers: AdminViewWorkerApplicationSummary[]
  transactions: AdminViewTransactionSummary[]
  operations: AdminViewOperationsResponse | null
  subAdmins: AdminViewSubAdminSummary[]
  managerNominations: AdminViewManagerNominationSummary[]
  actor: AdminViewActor | null
  selectedWorker: AdminViewWorkerApplicationSummary | null
  selectedTransaction: AdminViewTransactionDetailResponse | null
  decisionModal: DecisionModal
  decisionReason: string
  workerAccessModal: WorkerAccessModal
  workerAccessReason: string
  notice: string | null
  error: string | null
  operationsError: string | null
  teamError: string | null
  loading: boolean
  actionPending: string | null
  detailLoading: boolean
  signOutConfirmationOpen: boolean
  signingOut: boolean
}

type AdminOperationsResult = Awaited<ReturnType<typeof adminControlService.getOperations>>
type AdminWorkerApplicationsResult = Awaited<ReturnType<typeof adminControlService.listWorkerApplications>>
type AdminTransactionsResult = Awaited<ReturnType<typeof adminControlService.listTransactions>>
type AdminTeamResult = Awaited<ReturnType<typeof adminControlService.listSubAdmins>>

type AdminSectionsAction =
  | { type: 'patch'; patch: Partial<AdminSectionsState> }
  | {
    type: 'load_complete'
    activePanel: AdminOperationPanel
    errorCopy: string
    operationsResult: AdminOperationsResult
    teamResult: AdminTeamResult
    transactionResult: AdminTransactionsResult
    workerResult: AdminWorkerApplicationsResult
  }
  | { type: 'sync_route'; adminSection: string | undefined }
  | { type: 'update_workers'; update: (workers: AdminViewWorkerApplicationSummary[]) => AdminViewWorkerApplicationSummary[] }

function initialAdminPanel(adminSection: string | undefined): AdminOperationPanel {
  return adminSection === 'transactions' || adminSection === 'withdrawals'
    ? 'transactions'
    : adminSection === 'workers'
      ? 'workers'
      : 'operations'
}

function initialAdminSectionsState(adminSection: string | undefined): AdminSectionsState {
  return {
    activeTab: adminSection === 'team' ? 'team' : adminSection === 'governance' ? 'governance' : adminSection === 'finance' ? 'finance' : 'operations',
    activePanel: initialAdminPanel(adminSection),
    transactionView: adminSection === 'withdrawals' ? 'payouts' : 'services',
    transactionPage: 1,
    transactionsHasMore: false,
    transactionsTotalCount: null,
    workerPage: 1,
    workersHasMore: false,
    workersTotalCount: null,
    workerFilter: 'open',
    searchQuery: '',
    workers: [],
    transactions: [],
    operations: null,
    subAdmins: [],
    managerNominations: [],
    actor: null,
    selectedWorker: null,
    selectedTransaction: null,
    decisionModal: null,
    decisionReason: '',
    workerAccessModal: null,
    workerAccessReason: '',
    notice: null,
    error: null,
    operationsError: null,
    teamError: null,
    loading: true,
    actionPending: null,
    detailLoading: false,
    signOutConfirmationOpen: false,
    signingOut: false,
  }
}

function adminSectionsReducer(state: AdminSectionsState, action: AdminSectionsAction): AdminSectionsState {
  if (action.type === 'patch') return { ...state, ...action.patch }
  if (action.type === 'update_workers') return { ...state, workers: action.update(state.workers) }
  if (action.type === 'load_complete') {
    const { operationsResult, teamResult, transactionResult, workerResult } = action
    const activePanelFailed = action.activePanel === 'workers'
      ? !workerResult.success
      : action.activePanel === 'transactions'
        ? !transactionResult.success
        : false
    return {
      ...state,
      actor: operationsResult.success ? operationsResult.data.actor : teamResult.success ? state.actor ?? teamResult.data.actor : state.actor,
      error: activePanelFailed ? action.errorCopy : null,
      loading: false,
      managerNominations: teamResult.success ? teamResult.data.nominations : [],
      operations: operationsResult.success ? operationsResult.data : null,
      operationsError: operationsResult.success ? null : operationsResult.error,
      subAdmins: teamResult.success ? teamResult.data.members : [],
      teamError: teamResult.success ? null : teamResult.error,
      transactions: transactionResult.success ? transactionResult.data.transactions : state.transactions,
      transactionsHasMore: transactionResult.success ? transactionResult.data.has_more : false,
      transactionsTotalCount: transactionResult.success ? transactionResult.data.total_count : null,
      workers: workerResult.success ? workerResult.data.applications : state.workers,
      workersHasMore: workerResult.success ? workerResult.data.has_more : false,
      workersTotalCount: workerResult.success ? workerResult.data.total_count : null,
    }
  }
  if (action.adminSection === 'team') return { ...state, activeTab: 'team' }
  if (action.adminSection === 'governance') return { ...state, activeTab: 'governance' }
  if (action.adminSection === 'finance') return { ...state, activeTab: 'finance' }
  return {
    ...state,
    activeTab: 'operations',
    activePanel: initialAdminPanel(action.adminSection),
    transactionView: action.adminSection === 'withdrawals' ? 'payouts' : 'services',
    transactionPage: 1,
    workerPage: 1,
  }
}

export function AdminSections() {
  const router = useRouter()
  const language = useAppLanguage()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const copy = adminSectionsCopy[language]
  const { signOut } = useAuth()
  const params = useLocalSearchParams<AdminSectionRouteParams>()
  const adminSection = firstAdminSectionParam(params.ns_admin_section)
  const [state, dispatch] = useReducer(adminSectionsReducer, adminSection, initialAdminSectionsState)
  const { activePanel, searchQuery, signingOut, transactionPage, workerFilter, workerPage } = state
  const patch = useCallback((next: Partial<AdminSectionsState>) => {
    dispatch({ type: 'patch', patch: next })
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch({ type: 'sync_route', adminSection })
    }, 0)
    return () => clearTimeout(timer)
  }, [adminSection])

  const loadData = useCallback(async (routeToLoginWhenSessionMissing = false) => {
    patch({ loading: true, error: null, operationsError: null, teamError: null })
    const operationsResult = await adminControlService.getOperations()
    if (routeToLoginWhenSessionMissing && !operationsResult.success && isMissingAdminSession(operationsResult)) {
      patch({ loading: false, operations: null, operationsError: operationsResult.error })
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
    dispatch({
      activePanel,
      errorCopy: copy.errors.load,
      operationsResult,
      teamResult,
      transactionResult,
      type: 'load_complete',
      workerResult,
    })
  }, [activePanel, copy.errors.load, patch, router, searchQuery, transactionPage, workerFilter, workerPage])

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

  const setWorkerStatus = useCallback((workerId: string, status: AdminViewWorkerApplicationSummary['status'], role?: AdminViewWorkerApplicationSummary['account_role']) => {
    dispatch({ type: 'update_workers', update: (current) => current.map((worker) => worker.id === workerId
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
      : worker) })
  }, [])

  const commitDecision = useCallback(async (worker: AdminViewWorkerApplicationSummary, decision: AdminViewWorkerApplicationDecisionInput['decision'], reason?: string) => {
    if ((decision === 'reject' || decision === 'request_changes') && !reason?.trim()) {
      patch({ error: copy.errors.reasonRequired })
      return
    }
    const pendingKey = `${worker.id}:${decision}`
    patch({ actionPending: pendingKey, error: null, notice: null })
    const result = await adminControlService.decideWorkerApplication(worker.id, {
      decision,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    })
    if (result.success) {
      setWorkerStatus(worker.id, result.data.status, result.data.role)
      patch({
        decisionModal: null,
        decisionReason: '',
        notice: decision === 'approve' ? copy.notices.approved : decision === 'request_changes' ? copy.notices.changesRequested : copy.notices.rejected,
        selectedWorker: null,
      })
    } else {
      patch({ error: copy.errors.action })
    }
    patch({ actionPending: null })
  }, [copy.errors.action, copy.errors.reasonRequired, copy.notices.approved, copy.notices.changesRequested, copy.notices.rejected, patch, setWorkerStatus])

  const openTransaction = useCallback(async (transaction: AdminViewTransactionSummary) => {
    patch({ detailLoading: true, error: null })
    const result = await adminControlService.getTransaction(transaction.job_id)
    patch(result.success
      ? { detailLoading: false, selectedTransaction: result.data }
      : { detailLoading: false, error: copy.errors.load })
  }, [copy.errors.load, patch])

  const completeSignOut = useCallback(async () => {
    if (signingOut) return
    patch({ signingOut: true })
    try {
      await signOut()
    } finally {
      patch({ signOutConfirmationOpen: false, signingOut: false })
      router.replace('/(auth)/login?stage=login' as never)
    }
  }, [patch, router, signOut, signingOut])

  const commitWorkerAccess = useCallback(async (worker: AdminViewWorkerApplicationSummary, action: 'suspend' | 'reinstate', reason: string) => {
    if (reason.trim().length < 3) {
      patch({
        error: language === 'vi'
          ? 'Nhập lý do thay đổi trạng thái thợ.'
          : 'Enter a reason for this worker status change.',
      })
      return
    }
    const pendingKey = `${worker.id}:${action}`
    patch({ actionPending: pendingKey, error: null })
    const result = await adminControlService.setWorkerAccess(worker.worker_id, { action, reason: reason.trim() })
    if (result.success) {
      dispatch({ type: 'update_workers', update: (current) => current.map((item) => item.worker_id === result.data.worker_id && item.worker_profile
        ? {
          ...item,
          worker_profile: {
            ...item.worker_profile,
            verification_status: result.data.verification_status,
            is_approved: !result.data.is_suspended,
            is_suspended: result.data.is_suspended,
          },
        }
        : item) })
      patch({ notice: action === 'suspend'
        ? (language === 'vi' ? 'Đã tạm dừng quyền hoạt động của thợ.' : 'Worker access is suspended.')
        : (language === 'vi' ? 'Đã khôi phục quyền hoạt động của thợ.' : 'Worker access is reinstated.') })
      patch({ selectedWorker: null, workerAccessModal: null, workerAccessReason: '' })
    } else {
      patch({ error: copy.errors.action })
    }
    patch({ actionPending: null })
  }, [copy.errors.action, language, patch])

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

  return <AdminSectionsLayout
    actions={{ commitDecision, commitWorkerAccess, completeSignOut, loadData, openTransaction, patch }}
    adminSection={adminSection}
    copy={copy}
    formatters={{ disputeStatusLabel, formatCurrency, formatDate, jobStatusLabel, paymentProviderLabel, serviceLabel, statusLabel }}
    language={language}
    reduceMotion={reduceMotion}
    reduceTransparency={reduceTransparency}
    state={state}
  />
}

type AdminSectionsLayoutProps = {
  actions: {
    commitDecision: (worker: AdminViewWorkerApplicationSummary, decision: AdminViewWorkerApplicationDecisionInput['decision'], reason?: string) => Promise<void>
    commitWorkerAccess: (worker: AdminViewWorkerApplicationSummary, action: 'suspend' | 'reinstate', reason: string) => Promise<void>
    completeSignOut: () => Promise<void>
    loadData: (routeToLoginWhenSessionMissing?: boolean) => Promise<void>
    openTransaction: (transaction: AdminViewTransactionSummary) => Promise<void>
    patch: (next: Partial<AdminSectionsState>) => void
  }
  adminSection: string | undefined
  copy: AdminSectionsCopy
  formatters: {
    disputeStatusLabel: (value: string | null) => string
    formatCurrency: (value: number | null) => string
    formatDate: (value: string | null | undefined) => string
    jobStatusLabel: (value: AdminViewTransactionSummary['status']) => string
    paymentProviderLabel: (value: string | null) => string
    serviceLabel: (value: AdminViewTransactionSummary['service_type']) => string
    statusLabel: (value: string | null) => string
  }
  language: 'vi' | 'en'
  reduceMotion: boolean
  reduceTransparency: boolean
  state: AdminSectionsState
}

function AdminSectionsLayout({ actions, adminSection, copy, formatters, language, reduceMotion, reduceTransparency, state }: AdminSectionsLayoutProps) {
  const {
    activePanel,
    activeTab,
    actionPending,
    actor,
    decisionModal,
    decisionReason,
    detailLoading,
    error,
    loading,
    managerNominations,
    notice,
    operations,
    operationsError,
    searchQuery,
    selectedTransaction,
    selectedWorker,
    signOutConfirmationOpen,
    signingOut,
    subAdmins,
    teamError,
    transactionPage,
    transactions,
    transactionsHasMore,
    transactionsTotalCount,
    transactionView,
    workerAccessModal,
    workerAccessReason,
    workerFilter,
    workerPage,
    workers,
    workersHasMore,
    workersTotalCount,
  } = state
  const { commitDecision, commitWorkerAccess, completeSignOut, loadData, openTransaction, patch } = actions
  const { disputeStatusLabel, formatCurrency, formatDate, jobStatusLabel, paymentProviderLabel, serviceLabel, statusLabel } = formatters

  return <SafeAreaView style={styles.safeArea} testID="admin-sections">
    <FormulaMintCanvasAura reduceTransparency={reduceTransparency} scope="AdminSections" testID="admin-sections-mint-aura" />
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.page}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroTitle}>{copy.heroTitle}</Text>
            <KaelButton label={copy.actions.signOut} onPress={() => patch({ signOutConfirmationOpen: true })} size="small" style={styles.heroSignOutButton} testID="admin-sign-out" variant="secondary" />
          </View>
          <Text style={styles.heroBody}>{copy.heroBody}</Text>
        </View>
        <AdminTabNavigation
          items={[
            { key: 'operations', label: copy.navigation.operations, onPress: () => patch({ activePanel: 'operations', activeTab: 'operations' }), selected: activeTab === 'operations', testID: 'admin-sections-operations-tab' },
            ...(actor?.capabilities.includes('finance.reconcile') ? [{ key: 'finance', label: language === 'vi' ? 'Tài chính' : 'Finance', onPress: () => patch({ activeTab: 'finance' }), selected: activeTab === 'finance', testID: 'admin-sections-finance-tab' }] : []),
            { key: 'team', label: copy.navigation.team, onPress: () => patch({ activeTab: 'team' }), selected: activeTab === 'team', testID: 'admin-sections-team-tab' },
            ...(actor?.access_level === 'owner' ? [{ key: 'governance', label: language === 'vi' ? 'Hệ thống' : 'System', onPress: () => patch({ activeTab: 'governance' }), selected: activeTab === 'governance', testID: 'admin-sections-governance-tab' }] : []),
          ]}
          testID="admin-sections-primary-navigation"
        />
        {activeTab === 'finance' ? <AdminFinancePanel actor={actor} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} /> : activeTab === 'governance' ? <AdminGovernancePanel actor={actor} language={language} /> : activeTab === 'team' ? <AdminSubAdminPanel actor={actor} error={teamError} language={language} loading={loading} members={subAdmins} nominations={managerNominations} onRefresh={loadData} onRetry={() => { void loadData(true) }} /> : <>
          <AdminTabNavigation
            items={[
              { key: 'overview', label: copy.navigation.overview, onPress: () => patch({ activePanel: 'operations' }), selected: activePanel === 'operations', testID: 'admin-sections-overview-tab' },
              { key: 'workers', label: copy.navigation.workers, onPress: () => patch({ activePanel: 'workers', workerPage: 1 }), selected: activePanel === 'workers', testID: 'admin-sections-worker-tab' },
              { key: 'transactions', label: copy.navigation.transactions, onPress: () => patch({ activePanel: 'transactions', transactionPage: 1, transactionView: 'services' }), selected: activePanel === 'transactions', testID: 'admin-sections-transactions-tab' },
            ]}
            testID="admin-sections-operation-navigation"
          />
          {activePanel === 'operations' ? <AdminOperationsOverview error={operationsError} language={language} loading={loading} onOpenPanel={(panel) => patch(panel === 'workers' ? { activePanel: panel, workerPage: 1 } : panel === 'transactions' ? { activePanel: panel, transactionPage: 1, transactionView: 'services' } : { activePanel: panel })} onRetry={() => { void loadData(true) }} snapshot={operations} /> : <>
            {activePanel === 'transactions' ? <AdminTabNavigation
              items={[
                { key: 'services', label: language === 'vi' ? 'Giao dịch dịch vụ' : 'Service transactions', onPress: () => patch({ transactionPage: 1, transactionView: 'services' }), selected: transactionView === 'services', testID: 'admin-service-transactions-tab' },
                { key: 'payouts', label: language === 'vi' ? 'Chi trả thợ' : 'Worker payouts', onPress: () => patch({ transactionView: 'payouts' }), selected: transactionView === 'payouts', testID: 'admin-worker-payouts-tab' },
              ]}
              testID="admin-transaction-view-navigation"
            /> : null}
            {activePanel === 'transactions' && transactionView === 'payouts' ? <AdminPayoutsPanel actor={actor} initialTab={adminSection === 'withdrawals' ? 'withdrawals' : 'accounts'} key={adminSection === 'withdrawals' ? 'withdrawals' : 'accounts'} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} /> : <>
              <View style={styles.toolbar}>
                <KaelTextField mode="search" accessibilityLabel={copy.filters.searchPlaceholder} placeholder={copy.filters.searchPlaceholder} placeholderTextColor={color.text.muted} value={searchQuery} onChangeText={(value) => patch({ searchQuery: value, transactionPage: 1, workerPage: 1 })} shellStyle={styles.searchField} inputShellStyle={styles.searchInput} style={styles.searchText} autoCapitalize="none" />
                <KaelButton accessibilityLabel={copy.actions.refresh} label={copy.actions.refresh} onPress={() => { void loadData() }} style={styles.refreshButton} variant="secondary" />
              </View>
              {activePanel === 'workers' ? <View style={styles.filterRow}>
                <KaelChip accessibilityLabel={copy.filters.open} accessibilityState={{ selected: workerFilter === 'open' }} label={copy.filters.open} onPress={() => patch({ workerFilter: 'open', workerPage: 1 })} variant={workerFilter === 'open' ? 'selected' : 'unselected'} />
                <KaelChip accessibilityLabel={copy.filters.all} accessibilityState={{ selected: workerFilter === 'all' }} label={copy.filters.all} onPress={() => patch({ workerFilter: 'all', workerPage: 1 })} variant={workerFilter === 'all' ? 'selected' : 'unselected'} />
              </View> : null}
              {notice ? <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
              {error ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { patch({ error: null }); void loadData(true) }}><Text style={styles.errorAction}>{copy.actions.retry}</Text></Pressable></View> : null}
              {loading ? <View style={styles.loading}><ActivityIndicator color={color.brand.primary} /><Text style={styles.loadingText}>{copy.loading}</Text></View> : activePanel === 'workers' ? (workers.length === 0 ? <EmptyState body={copy.noData.workers} /> : <>
                {workers.map((worker) => <WorkerApplicationCard key={worker.id} copy={copy} worker={worker} serviceLabel={serviceLabel} formatDate={formatDate} actionPending={actionPending} canReview={Boolean(actor?.capabilities.includes('workers.review'))} onOpen={() => patch({ selectedWorker: worker })} onApprove={() => void commitDecision(worker, 'approve')} onRequestChanges={() => patch({ decisionModal: { decision: 'request_changes', worker }, decisionReason: '' })} onReject={() => patch({ decisionModal: { decision: 'reject', worker }, decisionReason: '' })} />)}
                <AdminPagination hasMore={workersHasMore} labels={copy.pagination} loading={loading} onPageChange={(workerPage) => patch({ workerPage })} page={workerPage} pageTestIDPrefix="admin-worker-page" pageSize={WORKERS_PER_PAGE} testID="admin-worker-pagination" totalCount={workersTotalCount} />
              </>) : (transactions.length === 0 ? <EmptyState body={copy.noData.transactions} /> : <>
                {transactions.map((transaction) => <TransactionCard key={transaction.job_id} transaction={transaction} copy={copy} serviceLabel={serviceLabel} statusLabel={statusLabel} paymentProviderLabel={paymentProviderLabel} disputeStatusLabel={disputeStatusLabel} jobStatusLabel={jobStatusLabel} formatCurrency={formatCurrency} formatDate={formatDate} onOpen={() => void openTransaction(transaction)} reduceTransparency={reduceTransparency} />)}
                <AdminPagination hasMore={transactionsHasMore} labels={copy.pagination} loading={loading} onPageChange={(transactionPage) => patch({ transactionPage })} page={transactionPage} pageTestIDPrefix="admin-transaction-page" pageSize={TRANSACTIONS_PER_PAGE} testID="admin-transaction-pagination" totalCount={transactionsTotalCount} />
              </>)}
              {detailLoading ? <View style={styles.detailLoading}><ActivityIndicator color={color.brand.primary} /></View> : null}
            </>}
          </>}
        </>}
      </View>
    </ScrollView>
    <WorkerDetailModal copy={copy} language={language} worker={selectedWorker} formatDate={formatDate} actionPending={actionPending} canReview={Boolean(actor?.capabilities.includes('workers.review'))} canManage={Boolean(actor?.capabilities.includes('workers.manage'))} onClose={() => patch({ selectedWorker: null })} onApprove={() => selectedWorker && void commitDecision(selectedWorker, 'approve')} onRequestChanges={() => { if (selectedWorker) patch({ decisionModal: { decision: 'request_changes', worker: selectedWorker }, decisionReason: '' }) }} onReject={() => { if (selectedWorker) patch({ decisionModal: { decision: 'reject', worker: selectedWorker }, decisionReason: '' }) }} onSuspend={() => { if (selectedWorker) patch({ workerAccessModal: { action: 'suspend', worker: selectedWorker }, workerAccessReason: '' }) }} onReinstate={() => { if (selectedWorker) patch({ workerAccessModal: { action: 'reinstate', worker: selectedWorker }, workerAccessReason: '' }) }} />
    <DecisionModalView copy={copy} modal={decisionModal} reason={decisionReason} pending={Boolean(actionPending)} onChangeReason={(decisionReason) => patch({ decisionReason })} onClose={() => patch({ decisionModal: null })} onSubmit={() => decisionModal && void commitDecision(decisionModal.worker, decisionModal.decision, decisionReason)} />
    <WorkerAccessModalView actionPending={Boolean(actionPending)} language={language} modal={workerAccessModal} onChangeReason={(workerAccessReason) => patch({ workerAccessReason })} onClose={() => patch({ workerAccessModal: null })} onSubmit={() => workerAccessModal && void commitWorkerAccess(workerAccessModal.worker, workerAccessModal.action, workerAccessReason)} reason={workerAccessReason} />
    <Modal animationType={reduceMotion ? 'none' : 'fade'} transparent visible={signOutConfirmationOpen} onRequestClose={() => { if (!signingOut) patch({ signOutConfirmationOpen: false }) }}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard} testID="admin-sign-out-confirmation">
        <Text style={styles.modalTitle}>{copy.modal.signOutTitle}</Text>
        <Text style={styles.modalSubtitle}>{copy.modal.signOutBody}</Text>
        <View style={styles.modalActionRow}>
          <KaelButton label={copy.actions.staySignedIn} onPress={() => patch({ signOutConfirmationOpen: false })} disabled={signingOut} style={styles.modalActionButton} variant="secondary" />
          <KaelButton label={signingOut ? copy.actions.signingOut : copy.actions.signOut} loading={signingOut} onPress={() => { void completeSignOut() }} style={styles.modalActionButton} testID="admin-sign-out-confirm" variant="primary" />
        </View>
      </View></View>
    </Modal>
    <TransactionDetailModal copy={copy} detail={selectedTransaction} formatCurrency={formatCurrency} formatDate={formatDate} language={language} serviceLabel={serviceLabel} statusLabel={statusLabel} paymentProviderLabel={paymentProviderLabel} disputeStatusLabel={disputeStatusLabel} jobStatusLabel={jobStatusLabel} onClose={() => patch({ selectedTransaction: null })} reduceTransparency={reduceTransparency} />
  </SafeAreaView>
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

export default AdminSections
