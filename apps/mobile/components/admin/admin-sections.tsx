import { useCallback, useEffect, useEffectEvent, useReducer, useRef } from 'react'
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
  AdminViewOperatorProvisioningSummary,
  AdminViewSubAdminSummary,
  AdminViewTransactionDetailResponse,
  AdminViewTransactionSummary,
  AdminViewWorkerApplicationDecisionInput,
  AdminViewWorkerApplicationSummary,
  AdminViewWorkerReviewStage,
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
import { AdminWorkerReviewModal } from './admin-worker-review-modal'
import { workerReviewCopy } from './admin-worker-review-copy'

type AdminSectionTab = 'operations' | 'team' | 'governance' | 'finance'
type AdminOperationPanel = 'operations' | 'workers' | 'transactions'
type AdminTransactionView = 'services' | 'payouts'
type WorkerFilter = AdminViewWorkerReviewStage | 'all'
type AdminSectionRouteParams = { ns_admin_section?: string | string[]; ns_finance_view?: string | string[] }
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

function unavailableAdminResult<T>(error: string): ApiResult<T> {
  return { success: false, code: 'AUTH_FORBIDDEN', error, status: 403 }
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
  pendingAdminAccounts: AdminViewOperatorProvisioningSummary[]
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
type AdminActorResult = Awaited<ReturnType<typeof adminControlService.getActor>>
type AdminWorkerApplicationsResult = Awaited<ReturnType<typeof adminControlService.listWorkerApplications>>
type AdminTransactionsResult = Awaited<ReturnType<typeof adminControlService.listTransactions>>
type AdminTeamResult = Awaited<ReturnType<typeof adminControlService.listSubAdmins>>

type AdminSectionsAction =
  | { type: 'patch'; patch: Partial<AdminSectionsState> }
  | {
    type: 'load_complete'
    activePanel: AdminOperationPanel
    actorResult: AdminActorResult
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
    workerFilter: 'pending_access',
    searchQuery: '',
    workers: [],
    transactions: [],
    operations: null,
    subAdmins: [],
    managerNominations: [],
    pendingAdminAccounts: [],
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

function withFinanceReadBaseline(actor: AdminViewActor): AdminViewActor {
  if (actor.capabilities.includes('finance.read')) return actor
  return { ...actor, capabilities: ['finance.read', ...actor.capabilities] }
}

function adminSectionsReducer(state: AdminSectionsState, action: AdminSectionsAction): AdminSectionsState {
  if (action.type === 'patch') return { ...state, ...action.patch }
  if (action.type === 'update_workers') return { ...state, workers: action.update(state.workers) }
  if (action.type === 'load_complete') {
    const { actorResult, operationsResult, teamResult, transactionResult, workerResult } = action
    const loadedActor = actorResult.success
      ? actorResult.data
      : operationsResult.success
        ? operationsResult.data.actor
      : teamResult.success
        ? state.actor ?? teamResult.data.actor
        : state.actor
    const activePanelFailed = action.activePanel === 'workers'
      ? !workerResult.success
      : action.activePanel === 'transactions'
        ? !transactionResult.success
        : false
    return {
      ...state,
      actor: loadedActor ? withFinanceReadBaseline(loadedActor) : null,
      error: activePanelFailed ? action.errorCopy : null,
      loading: false,
      managerNominations: teamResult.success ? teamResult.data.nominations : state.managerNominations,
      pendingAdminAccounts: teamResult.success ? teamResult.data.pending_accounts ?? [] : state.pendingAdminAccounts,
      operations: operationsResult.success ? operationsResult.data : state.operations,
      operationsError: operationsResult.success ? null : operationsResult.error,
      subAdmins: teamResult.success ? teamResult.data.members : state.subAdmins,
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
  const { role, session, signOut } = useAuth()
  const params = useLocalSearchParams<AdminSectionRouteParams>()
  const adminSection = firstAdminSectionParam(params.ns_admin_section)
  const financeView = firstAdminSectionParam(params.ns_finance_view) ?? 'overview'
  const localVisualAuditSession = session?.user.app_metadata?.provider === 'local-visual-audit'
  const hasAuthenticatedAdminSession = Boolean(
    session
      && !localVisualAuditSession
      && (role === 'admin' || role === 'admin_operator'),
  )
  const loginRoute = localVisualAuditSession
    ? '/(auth)/login?stage=login&ns_audit_role=none'
    : '/(auth)/login?stage=login'
  const [state, dispatch] = useReducer(adminSectionsReducer, adminSection, initialAdminSectionsState)
  const loadRequestIdRef = useRef(0)
  const hasCompletedInitialLoadRef = useRef(false)
  const backgroundLoadInFlightRef = useRef(false)
  const { activePanel, searchQuery, signingOut, transactionPage, workerFilter, workerPage } = state
  const patch = useCallback((next: Partial<AdminSectionsState>) => {
    dispatch({ type: 'patch', patch: next })
  }, [])
  const openFinance = useCallback((view = 'overview') => {
    patch({ activeTab: 'finance' })
    router.replace(`/sections?ns_admin_section=finance&ns_finance_view=${view}` as never)
  }, [patch, router])

  useEffect(() => {
    dispatch({ type: 'sync_route', adminSection })
  }, [adminSection])

  useEffect(() => {
    if (!hasAuthenticatedAdminSession) router.replace(loginRoute as never)
  }, [hasAuthenticatedAdminSession, loginRoute, router])

  const loadData = useCallback(async ({ blocking }: { blocking?: boolean } = {}) => {
    const shouldBlock = blocking ?? !hasCompletedInitialLoadRef.current
    if (!shouldBlock && backgroundLoadInFlightRef.current) return
    if (!shouldBlock) backgroundLoadInFlightRef.current = true
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId
    patch({ ...(shouldBlock ? { loading: true } : {}), error: null, operationsError: null, teamError: null })
    try {
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const actorResult = await adminControlService.getActor()
      if (requestId !== loadRequestIdRef.current) return
      if (!actorResult.success && isMissingAdminSession(actorResult)) {
        patch({ actor: null, operations: null, operationsError: actorResult.error })
        router.replace(loginRoute as never)
        return
      }
      if (!actorResult.success) {
        patch({ actor: null, error: actorResult.error, operations: null })
        return
      }
      const actor = withFinanceReadBaseline(actorResult.data)
      const denied = copy.errors.load
      const operationsResultPromise = actor.capabilities.includes('operations.read')
        ? adminControlService.getOperations()
        : Promise.resolve(unavailableAdminResult<AdminViewOperationsResponse>(denied))
      const workerResultPromise = actor.capabilities.includes('workers.read')
        ? adminControlService.listWorkerApplications({
          status: 'all',
          stage: workerFilter,
          query: searchQuery,
          limit: WORKERS_PER_PAGE,
          offset: (workerPage - 1) * WORKERS_PER_PAGE,
        })
        : Promise.resolve(unavailableAdminResult<Awaited<ReturnType<typeof adminControlService.listWorkerApplications>> extends ApiResult<infer T> ? T : never>(denied))
      const transactionResultPromise = actor.capabilities.includes('transactions.read')
        ? adminControlService.listTransactions({
          query: searchQuery,
          limit: TRANSACTIONS_PER_PAGE,
          offset: (transactionPage - 1) * TRANSACTIONS_PER_PAGE,
        })
        : Promise.resolve(unavailableAdminResult<Awaited<ReturnType<typeof adminControlService.listTransactions>> extends ApiResult<infer T> ? T : never>(denied))
      const teamResultPromise = actor.capabilities.includes('team.read')
        ? adminControlService.listSubAdmins()
        : Promise.resolve(unavailableAdminResult<Awaited<ReturnType<typeof adminControlService.listSubAdmins>> extends ApiResult<infer T> ? T : never>(denied))
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const [operationsResult, workerResult, transactionResult, teamResult] = await Promise.all([
        operationsResultPromise,
        workerResultPromise,
        transactionResultPromise,
        teamResultPromise,
      ])
      if (requestId !== loadRequestIdRef.current) return
      const sessionFailure = ([operationsResult, workerResult, transactionResult, teamResult] as ApiResult<unknown>[])
        .find(isMissingAdminSession)
      if (sessionFailure && !sessionFailure.success) {
        patch({ actor: null, operations: null, operationsError: sessionFailure.error })
        router.replace(loginRoute as never)
        return
      }
      dispatch({
        activePanel,
        actorResult,
        errorCopy: copy.errors.load,
        operationsResult,
        teamResult,
        transactionResult,
        type: 'load_complete',
        workerResult,
      })
    } finally {
      if (requestId === loadRequestIdRef.current) {
        hasCompletedInitialLoadRef.current = true
        patch({ loading: false })
      }
      if (!shouldBlock) backgroundLoadInFlightRef.current = false
    }
  }, [activePanel, copy.errors.load, loginRoute, patch, router, searchQuery, transactionPage, workerFilter, workerPage])
  const startAdminDataLoad = useEffectEvent(() => {
    void loadData({ blocking: true })
  })

  useEffect(() => {
    if (!hasAuthenticatedAdminSession) return () => undefined
    const timer = setTimeout(() => {
      startAdminDataLoad()
    }, 0)
    return () => clearTimeout(timer)
  }, [activePanel, hasAuthenticatedAdminSession, searchQuery, transactionPage, workerFilter, workerPage])

  useFocusEffect(useCallback(() => {
    if (!hasAuthenticatedAdminSession) return () => undefined
    const timer = setInterval(() => { void loadData({ blocking: false }) }, ADMIN_AUTO_REFRESH_MS)
    return () => clearInterval(timer)
  }, [hasAuthenticatedAdminSession, loadData]))

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
      dispatch({ type: 'update_workers', update: (current) => current.filter((item) => item.id !== worker.id) })
      patch({
        decisionModal: null,
        decisionReason: '',
        notice: decision === 'approve' ? copy.notices.approved : decision === 'request_changes' ? copy.notices.changesRequested : copy.notices.rejected,
        selectedWorker: null,
      })
      await loadData()
    } else {
      patch({ error: copy.errors.action })
    }
    patch({ actionPending: null })
  }, [copy.errors.action, copy.errors.reasonRequired, copy.notices.approved, copy.notices.changesRequested, copy.notices.rejected, loadData, patch])

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
      router.replace(loginRoute as never)
    }
  }, [loginRoute, patch, router, signOut, signingOut])

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
    actions={{ commitDecision, commitWorkerAccess, completeSignOut, loadData, openFinance, openTransaction, patch }}
    adminSection={adminSection}
    copy={copy}
    canAccessFinance={hasAuthenticatedAdminSession && Boolean(state.actor?.capabilities.includes('finance.read'))}
    financeView={financeView}
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
    loadData: () => Promise<void>
    openFinance: (view?: string) => void
    openTransaction: (transaction: AdminViewTransactionSummary) => Promise<void>
    patch: (next: Partial<AdminSectionsState>) => void
  }
  adminSection: string | undefined
  canAccessFinance: boolean
  copy: AdminSectionsCopy
  financeView: string
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

function AdminSectionsLayout({ actions, adminSection, canAccessFinance, copy, financeView, formatters, language, reduceMotion, reduceTransparency, state }: AdminSectionsLayoutProps) {
  const {
    activePanel: requestedActivePanel,
    activeTab: requestedActiveTab,
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
    pendingAdminAccounts,
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
  const { commitDecision, commitWorkerAccess, completeSignOut, loadData, openFinance, openTransaction, patch } = actions
  const { disputeStatusLabel, formatCurrency, formatDate, jobStatusLabel, paymentProviderLabel, serviceLabel, statusLabel } = formatters
  const capabilities = actor?.capabilities ?? []
  const canAccessOperations = capabilities.includes('operations.read')
  const canAccessWorkers = capabilities.includes('workers.read')
  const canAccessTransactions = capabilities.includes('transactions.read')
  const canAccessPayouts = capabilities.includes('payouts.read')
  const canAccessOperationalArea = canAccessOperations || canAccessWorkers || canAccessTransactions || canAccessPayouts
  const canAccessTeam = capabilities.includes('team.read')
  const activePanel = requestedActivePanel === 'operations' && canAccessOperations
    ? 'operations'
    : requestedActivePanel === 'workers' && canAccessWorkers
      ? 'workers'
      : requestedActivePanel === 'transactions' && (canAccessTransactions || canAccessPayouts)
        ? 'transactions'
        : canAccessOperations
          ? 'operations'
          : canAccessWorkers
            ? 'workers'
            : 'transactions'
  const effectiveTransactionView = transactionView === 'services' && !canAccessTransactions && canAccessPayouts
    ? 'payouts'
    : transactionView === 'payouts' && !canAccessPayouts && canAccessTransactions
      ? 'services'
      : transactionView
  const requestedTabAllowed = requestedActiveTab === 'finance'
    ? canAccessFinance
    : requestedActiveTab === 'team'
      ? canAccessTeam
      : requestedActiveTab === 'governance'
        ? actor?.access_level === 'owner'
        : canAccessOperationalArea
  const activeTab = requestedTabAllowed
    ? requestedActiveTab
    : canAccessFinance
      ? 'finance'
      : canAccessOperationalArea
        ? 'operations'
        : canAccessTeam
          ? 'team'
          : requestedActiveTab

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
            ...(canAccessOperationalArea ? [{ key: 'operations', label: copy.navigation.operations, onPress: () => patch({ activePanel, activeTab: 'operations' }), selected: activeTab === 'operations', testID: 'admin-sections-operations-tab' }] : []),
            ...(canAccessFinance ? [{ key: 'finance', label: language === 'vi' ? 'Tài chính' : 'Finance', onPress: () => openFinance(), selected: activeTab === 'finance', testID: 'admin-sections-finance-tab' }] : []),
            ...(canAccessTeam ? [{ key: 'team', label: copy.navigation.team, onPress: () => patch({ activeTab: 'team' }), selected: activeTab === 'team', testID: 'admin-sections-team-tab' }] : []),
            ...(actor?.access_level === 'owner' ? [{ key: 'governance', label: language === 'vi' ? 'Hệ thống' : 'System', onPress: () => patch({ activeTab: 'governance' }), selected: activeTab === 'governance', testID: 'admin-sections-governance-tab' }] : []),
          ]}
          testID="admin-sections-primary-navigation"
        />
        {activeTab === 'finance' ? <AdminFinancePanel actor={actor} initialView={financeView} onViewChange={openFinance} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} /> : activeTab === 'governance' ? <AdminGovernancePanel actor={actor} language={language} /> : activeTab === 'team' ? <AdminSubAdminPanel actor={actor} error={teamError} language={language} loading={loading} members={subAdmins} nominations={managerNominations} pendingAccounts={pendingAdminAccounts} onRefresh={loadData} onRetry={() => { void loadData() }} reduceMotion={reduceMotion} /> : <>
          <AdminTabNavigation
            items={[
              ...(canAccessOperations ? [{ key: 'overview', label: copy.navigation.overview, onPress: () => patch({ activePanel: 'operations' }), selected: activePanel === 'operations', testID: 'admin-sections-overview-tab' }] : []),
              ...(canAccessWorkers ? [{ key: 'workers', label: copy.navigation.workers, onPress: () => patch({ activePanel: 'workers', workerPage: 1 }), selected: activePanel === 'workers', testID: 'admin-sections-worker-tab' }] : []),
              ...(canAccessTransactions || canAccessPayouts ? [{ key: 'transactions', label: copy.navigation.transactions, onPress: () => patch({ activePanel: 'transactions', transactionPage: 1, transactionView: canAccessTransactions ? 'services' : 'payouts' }), selected: activePanel === 'transactions', testID: 'admin-sections-transactions-tab' }] : []),
            ]}
            testID="admin-sections-operation-navigation"
          />
          {activePanel === 'operations' ? <AdminOperationsOverview error={operationsError} language={language} loading={loading} onOpenPanel={(panel) => patch(panel === 'workers' ? { activePanel: panel, workerPage: 1 } : panel === 'transactions' ? { activePanel: panel, transactionPage: 1, transactionView: 'services' } : { activePanel: panel })} onRetry={() => { void loadData() }} snapshot={operations} /> : <>
            {activePanel === 'transactions' ? <AdminTabNavigation
              items={[
                ...(canAccessTransactions ? [{ key: 'services', label: language === 'vi' ? 'Giao dịch dịch vụ' : 'Service transactions', onPress: () => patch({ transactionPage: 1, transactionView: 'services' }), selected: effectiveTransactionView === 'services', testID: 'admin-service-transactions-tab' }] : []),
                ...(canAccessPayouts ? [{ key: 'payouts', label: language === 'vi' ? 'Chi trả thợ' : 'Worker payouts', onPress: () => patch({ transactionView: 'payouts' }), selected: effectiveTransactionView === 'payouts', testID: 'admin-worker-payouts-tab' }] : []),
              ]}
              testID="admin-transaction-view-navigation"
            /> : null}
            {activePanel === 'transactions' && effectiveTransactionView === 'payouts' ? <AdminPayoutsPanel actor={actor} initialTab={adminSection === 'withdrawals' ? 'withdrawals' : 'accounts'} key={adminSection === 'withdrawals' ? 'withdrawals' : 'accounts'} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} /> : <>
              <View style={styles.toolbar}>
                <KaelTextField mode="search" accessibilityLabel={copy.filters.searchPlaceholder} placeholder={copy.filters.searchPlaceholder} placeholderTextColor={color.text.muted} value={searchQuery} onChangeText={(value) => patch({ searchQuery: value, transactionPage: 1, workerPage: 1 })} shellStyle={styles.searchField} inputShellStyle={styles.searchInput} style={styles.searchText} autoCapitalize="none" />
                <KaelButton accessibilityLabel={copy.actions.refresh} label={copy.actions.refresh} onPress={() => { void loadData() }} style={styles.refreshButton} variant="secondary" />
              </View>
              {activePanel === 'workers' ? <View style={styles.filterRow}>
                {(['pending_access', 'missing_profile', 'ready_verification', 'verified', 'all'] as const).map((filter) => <KaelChip key={filter} accessibilityLabel={workerReviewCopy[language].filter[filter]} accessibilityState={{ selected: workerFilter === filter }} label={workerReviewCopy[language].filter[filter]} onPress={() => patch({ workerFilter: filter, workerPage: 1 })} variant={workerFilter === filter ? 'selected' : 'unselected'} />)}
              </View> : null}
              {notice ? <View accessibilityRole="alert" style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
              {error ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { patch({ error: null }); void loadData() }}><Text style={styles.errorAction}>{copy.actions.retry}</Text></Pressable></View> : null}
              {loading ? <View style={styles.loading}><ActivityIndicator color={color.brand.primary} /><Text style={styles.loadingText}>{copy.loading}</Text></View> : activePanel === 'workers' ? (workers.length === 0 ? <EmptyState body={copy.noData.workers} /> : <>
                {workers.map((worker) => <WorkerApplicationCard key={worker.id} copy={copy} language={language} worker={worker} serviceLabel={serviceLabel} formatDate={formatDate} actionPending={actionPending} canReview={Boolean(actor?.capabilities.includes('workers.review'))} onOpen={() => patch({ selectedWorker: worker })} onApprove={() => void commitDecision(worker, 'approve')} onRequestChanges={() => patch({ decisionModal: { decision: 'request_changes', worker }, decisionReason: '' })} onReject={() => patch({ decisionModal: { decision: 'reject', worker }, decisionReason: '' })} />)}
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
    <AdminWorkerReviewModal key={selectedWorker?.id ?? 'closed-worker-review'} copy={copy} language={language} worker={selectedWorker} serviceLabel={serviceLabel} formatDate={formatDate} actionPending={actionPending} canReview={Boolean(actor?.capabilities.includes('workers.review'))} canManage={Boolean(actor?.capabilities.includes('workers.manage'))} canReadFinance={Boolean(actor?.capabilities.includes('finance.read'))} onClose={() => patch({ selectedWorker: null })} onRefresh={loadData} onAccessApprove={() => { if (selectedWorker) { patch({ selectedWorker: null }); void commitDecision(selectedWorker, 'approve') } }} onAccessRequestChanges={() => { if (selectedWorker) patch({ selectedWorker: null, decisionModal: { decision: 'request_changes', worker: selectedWorker }, decisionReason: '' }) }} onAccessReject={() => { if (selectedWorker) patch({ selectedWorker: null, decisionModal: { decision: 'reject', worker: selectedWorker }, decisionReason: '' }) }} onSuspend={() => { if (selectedWorker) patch({ selectedWorker: null, workerAccessModal: { action: 'suspend', worker: selectedWorker }, workerAccessReason: '' }) }} onReinstate={() => { if (selectedWorker) patch({ selectedWorker: null, workerAccessModal: { action: 'reinstate', worker: selectedWorker }, workerAccessReason: '' }) }} reduceMotion={reduceMotion} />
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
