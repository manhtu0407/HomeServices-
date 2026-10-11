import { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useRef } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Modal,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelButton } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import type { ApiResult } from '@/lib/api'
import { useAppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { AdminDataSyncProvider, useAdminSectionAutoRefresh } from '@/lib/admin-data-sync'
import { adminControlService } from '@/lib/services'
import type {
  AdminViewActor,
  AdminViewOverviewDetailKey,
  AdminViewTransactionSummary,
  AdminViewWorkerApplicationDecisionInput,
  AdminViewWorkerApplicationSummary,
} from '@/lib/api-types/admin'
import { adminSectionsCopy, type AdminSectionsCopy } from './admin-sections-copy'
import { useAdminSectionFormatters } from './admin-sections-formatters'
import { AdminOperationsOverview } from './admin-operations-and-team'
import { AdminPagination } from './admin-pagination'
import { AdminPayoutsPanel } from './admin-payouts'
import { AdminFinancePanel } from './admin-finance'
import { FinanceChoiceChip } from './admin-finance-controls'
import { TransactionCard, WorkerApplicationCard } from './admin-section-cards'
import { styles } from './admin-sections-styles'
import type { AdminSectionsLayoutProps } from './admin-sections-layout-types'
import { AdminCapabilityWorkspace } from './admin-sections-capability-workspace'
import { AdminWorkerReviewModal } from './admin-worker-review-modal'
import { workerReviewCopy } from './admin-worker-review-copy'
import {
  resolveAdminProductionCapability,
  resolveAdminProductionRoute,
  visibleAdminProductionSections,
  type AdminProductionRouteParams,
} from './admin-sections-production-registry'
import {
  findAdminProductionCapability,
  findAdminProductionSection,
  type AdminProductionCapability,
  type AdminProductionCapabilityId,
} from './admin-sections-production-copy'
import { AdminSectionsProductionShell } from './admin-sections-production-shell'
import { AdminOverviewDashboard, type AdminOverviewOpenTarget } from './admin-overview-dashboard'
import { AdminOverviewDetailWorklist } from './admin-overview-detail-worklist'
import { AdminScopeChangeMonitor } from './admin-scope-change-monitor'
import { AdminSupportCaseCenter } from './admin-support-case-center'
import { AdminAmbassadorProgramWorkspace } from './admin-ambassador-program-workspace'
import { AdminDisciplineWorkspace } from './admin-discipline-workspace'
import { AdminSystemWorkspace } from './admin-system-workspace'
import { AdminTeamWorkspace } from './admin-team-workspace'
import { AdminText } from './admin-text'
import {
  adminSectionsReducer,
  initialAdminSectionsState,
  TRANSACTIONS_PER_PAGE,
  withFinanceReadBaseline,
  WORKERS_PER_PAGE,
  type AdminSectionsState,
  type AdminSectionTab,
  type WorkerFilter,
} from './admin-sections-state'
import {
  AdminProductionCapabilitySheet,
  AdminProductionSectionIndex,
  AdminUnavailableCapability,
} from './admin-sections-production-workspace'
import {
  AdminDataFeedback,
  AdminDataSearchToolbar,
  AdminWorkspaceLoading,
  DecisionModalView,
  EmptyState,
  TransactionDetailModal,
  WorkerAccessModalView,
} from './admin-sections-support'
import { canAccessProductionCapability } from './admin-sections-access'

type AdminSectionRouteParams = AdminProductionRouteParams

const ADMIN_SECTION_NAVIGATION_TEST_IDS: Record<AdminSectionTab, string> = {
  finance: 'admin-sections-finance-tab',
  operations: 'admin-sections-transactions-tab',
  overview: 'admin-sections-overview-tab',
  system: 'admin-sections-governance-tab',
  team: 'admin-sections-team-tab',
  workers: 'admin-sections-worker-tab',
}
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

export function AdminSections() {
  const { role, session } = useAuth()
  const localVisualAuditSession = session?.user.app_metadata?.provider === 'local-visual-audit'
  const ownerId = session?.user.id ?? null
  const enabled = Boolean(ownerId && !localVisualAuditSession && (role === 'admin' || role === 'admin_operator'))
  return <AdminDataSyncProvider enabled={enabled} key={ownerId ?? 'anonymous-admin'} ownerId={ownerId}>
    <AdminSectionsContent />
  </AdminDataSyncProvider>
}

function AdminSectionsContent() {
  const layoutProps = useAdminSectionsController()
  return <AdminSectionsLayout {...layoutProps} />
}

function useAdminSectionsController(): AdminSectionsLayoutProps {
  const router = useRouter()
  const language = useAppLanguage()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const copy = adminSectionsCopy[language]
  const formatters = useAdminSectionFormatters(copy, language)
  const { role, session, signOut } = useAuth()
  const params = useLocalSearchParams<AdminSectionRouteParams>()
  const resolvedRoute = resolveAdminProductionRoute(params)
  const resolvedCapability = resolveAdminProductionCapability(params)
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
  const [state, dispatch] = useReducer(
    adminSectionsReducer,
    { capability: resolvedCapability, route: resolvedRoute },
    initialAdminSectionsState,
  )
  const loadRequestIds = useMemo<Partial<Record<AdminSectionTab, number>>>(() => ({}), [])
  const backgroundLoads = useMemo(() => new Set<AdminSectionTab>(), [])
  const activeSectionRef = useRef(state.activeTab)
  const actorRef = useRef(state.actor)
  const transactionDetailRequestId = useRef(0)
  const { activeTab, actor, debouncedSearchQuery, overviewDetailKey, searchQuery, signingOut, transactionPage, workerFilter, workerPage } = state
  const patch = useCallback((next: Partial<AdminSectionsState>) => {
    dispatch({ type: 'patch', patch: next })
  }, [])
  const openSection = useCallback((section: AdminSectionTab) => {
    transactionDetailRequestId.current += 1
    patch({
      activeTab: section,
      error: null,
      readError: null,
      readFailed: false,
      detailReadError: null,
      detailReadFailed: false,
      selectedTransaction: null,
      transactionDetailJobId: null,
      overviewDetailKey: null,
      selectedCapabilityId: null,
      transactionPage: section === 'operations' ? 1 : state.transactionPage,
      workerPage: section === 'workers' ? 1 : state.workerPage,
    })
    router.setParams({ ns_admin_capability: undefined, ns_admin_section: section, ns_finance_view: undefined, panel: undefined })
  }, [patch, router, state.transactionPage, state.workerPage])
  const openCapability = useCallback((capability: AdminProductionCapability) => {
    patch({ overviewDetailKey: null, selectedCapabilityId: capability.id })
  }, [patch])
  const openOverviewTarget = useCallback((target: AdminOverviewOpenTarget) => {
    transactionDetailRequestId.current += 1
    const targetWorkerFilter: WorkerFilter = target.detailKey === 'worker_applications'
      ? 'pending_access'
      : target.detailKey === 'workers_in_verification'
        ? 'ready_verification'
        : 'all'
    patch({
      activeTab: target.section,
      error: null,
      readError: null,
      readFailed: false,
      detailReadError: null,
      detailReadFailed: false,
      selectedTransaction: null,
      transactionDetailJobId: null,
      overviewDetailKey: target.detailKey,
      searchQuery: '',
      debouncedSearchQuery: '',
      selectedCapabilityId: target.capabilityId,
      transactionPage: 1,
      workerFilter: targetWorkerFilter,
      workerPage: 1,
    })
    router.setParams({ ns_admin_capability: target.capabilityId, ns_admin_section: target.section, ns_finance_view: undefined, panel: undefined })
  }, [patch, router])

  useEffect(() => {
    activeSectionRef.current = activeTab
    actorRef.current = actor
  }, [activeTab, actor])

  useEffect(() => {
    patch({
      activeTab: resolvedRoute.section,
      selectedCapabilityId: resolvedCapability,
      transactionView: resolvedRoute.financeWorkspace === 'payouts' ? 'payouts' : 'services',
    })
  }, [patch, resolvedCapability, resolvedRoute.financeWorkspace, resolvedRoute.section])

  useEffect(() => {
    if (!hasAuthenticatedAdminSession) router.replace(loginRoute as never)
  }, [hasAuthenticatedAdminSession, loginRoute, router])

  const loadData = useCallback(async ({ force = true, refreshActor }: { force?: boolean; refreshActor?: boolean } = {}) => {
    const requestedSection = activeTab
    const isInitialLoad = !actorRef.current
    if (backgroundLoads.has(requestedSection) && !force) return
    backgroundLoads.add(requestedSection)
    const requestId = (loadRequestIds[requestedSection] ?? 0) + 1
    loadRequestIds[requestedSection] = requestId
    patch({
      ...(isInitialLoad
        ? { loading: true, refreshing: false }
        : { loading: false, refreshing: true }),
    })
    try {
      let currentActor = actorRef.current
      if (!currentActor || refreshActor) {
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const actorResult = await adminControlService.getActor()
        if (requestId !== loadRequestIds[requestedSection] || activeSectionRef.current !== requestedSection) return
        if (!actorResult.success && isMissingAdminSession(actorResult)) {
          actorRef.current = null
          patch({ actor: null, operations: null, operationsError: null, readError: null, readFailed: false })
          router.replace(loginRoute as never)
          return
        }
        if (!actorResult.success) {
          patch({ readError: copy.errors.load, readFailed: true })
          return
        }
        currentActor = withFinanceReadBaseline(actorResult.data)
        actorRef.current = currentActor
        patch({ actor: currentActor })
      }
      const visibleSections = visibleAdminProductionSections(currentActor)
      const effectiveSection = visibleSections.some((section) => section.id === requestedSection)
        ? requestedSection
        : visibleSections[0]?.id
      if (!effectiveSection) {
        patch({ actor: currentActor, readError: copy.errors.load, readFailed: true })
        return
      }
      if (effectiveSection !== requestedSection) {
        patch({ actor: currentActor, activeTab: effectiveSection })
        return
      }

      let sectionResult: ApiResult<unknown> | null = null
      if (effectiveSection === 'workers') {
        const result = await adminControlService.listWorkerApplications({
          limit: WORKERS_PER_PAGE,
          offset: (workerPage - 1) * WORKERS_PER_PAGE,
          query: debouncedSearchQuery,
          stage: workerFilter,
          status: 'all',
        })
        sectionResult = result
        if (requestId !== loadRequestIds[requestedSection] || activeSectionRef.current !== requestedSection) return
        patch(result.success ? {
          readError: null,
          readFailed: false,
          workers: result.data.applications,
          workersHasMore: result.data.has_more,
          workersTotalCount: result.data.total_count,
        } : { readError: copy.errors.load, readFailed: true })
      } else if (effectiveSection === 'operations') {
        const [operationsResult, result] = await Promise.all([
          adminControlService.getOperations(),
          adminControlService.listTransactions({
            limit: TRANSACTIONS_PER_PAGE,
            offset: (transactionPage - 1) * TRANSACTIONS_PER_PAGE,
            payment_status: overviewDetailKey === 'payment_attention' ? 'amount_mismatch' : undefined,
            query: debouncedSearchQuery,
          }),
        ])
        sectionResult = !operationsResult.success && isMissingAdminSession(operationsResult)
          ? operationsResult
          : result
        if (requestId !== loadRequestIds[requestedSection] || activeSectionRef.current !== requestedSection) return
        patch({
          ...(operationsResult.success
            ? { operations: operationsResult.data, operationsError: null }
            : { operationsError: isMissingAdminSession(operationsResult) ? null : operationsResult.error }),
          ...(result.success ? {
          readError: null,
          readFailed: !operationsResult.success,
          transactions: result.data.transactions,
          transactionsHasMore: result.data.has_more,
          transactionsTotalCount: result.data.total_count,
          } : { readError: copy.errors.load, readFailed: true }),
        })
      } else if (effectiveSection === 'team') {
        const result = await adminControlService.listSubAdmins()
        sectionResult = result
        if (requestId !== loadRequestIds[requestedSection] || activeSectionRef.current !== requestedSection) return
        patch(result.success ? {
          managerNominations: result.data.nominations,
          pendingAdminAccounts: result.data.pending_accounts ?? [],
          subAdmins: result.data.members,
          readError: null,
          readFailed: false,
          teamError: null,
        } : { teamError: result.error, readFailed: true })
      }

      if (sectionResult && !sectionResult.success && isMissingAdminSession(sectionResult)) {
        patch({ actor: null, operations: null, operationsError: null, readError: null, readFailed: false })
        router.replace(loginRoute as never)
      }
    } catch {
      if (requestId !== loadRequestIds[requestedSection] || activeSectionRef.current !== requestedSection) return
      patch({
        readError: copy.errors.load,
        readFailed: true,
        ...(requestedSection === 'operations' ? { operationsError: copy.errors.load } : {}),
        ...(requestedSection === 'team' ? { teamError: copy.errors.load } : {}),
      })
    } finally {
      if (requestId === loadRequestIds[requestedSection]) {
        backgroundLoads.delete(requestedSection)
        if (activeSectionRef.current === requestedSection) patch({ loading: false, refreshing: false })
      }
    }
  }, [activeTab, backgroundLoads, copy.errors.load, debouncedSearchQuery, loadRequestIds, loginRoute, overviewDetailKey, patch, router, transactionPage, workerFilter, workerPage])
  const openTransaction = useCallback(async (transaction: AdminViewTransactionSummary) => {
    const requestId = transactionDetailRequestId.current + 1
    transactionDetailRequestId.current = requestId
    patch({
      detailLoading: true,
      detailReadError: null,
      detailReadFailed: false,
      selectedTransaction: null,
      transactionDetailJobId: transaction.job_id,
    })
    try {
      // The post-read identity guard prevents an old detail from replacing a newer selection.
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = await adminControlService.getTransaction(transaction.job_id)
      if (requestId !== transactionDetailRequestId.current) return
      if (!result.success || result.data.transaction.job_id !== transaction.job_id) {
        patch({ detailLoading: false, detailReadError: copy.errors.load, detailReadFailed: true })
        return
      }
      patch({
        detailLoading: false,
        detailReadError: null,
        detailReadFailed: false,
        selectedTransaction: result.data,
      })
    } catch {
      if (requestId !== transactionDetailRequestId.current) return
      patch({ detailLoading: false, detailReadError: copy.errors.load, detailReadFailed: true })
    }
  }, [copy.errors.load, patch])

  const refreshSelectedTransaction = useCallback(async () => {
    const jobId = state.transactionDetailJobId
    if (!jobId) return
    const requestId = transactionDetailRequestId.current + 1
    transactionDetailRequestId.current = requestId
    try {
      // The post-read identity guard prevents an old detail from replacing a newer selection.
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = await adminControlService.getTransaction(jobId)
      if (requestId !== transactionDetailRequestId.current) return
      if (!result.success || result.data.transaction.job_id !== jobId) {
        patch({ detailReadError: copy.errors.load, detailReadFailed: true })
        return
      }
      patch({
        selectedTransaction: result.data,
        detailReadError: null,
        detailReadFailed: false,
      })
    } catch {
      if (requestId !== transactionDetailRequestId.current) return
      patch({ detailReadError: copy.errors.load, detailReadFailed: true })
    }
  }, [copy.errors.load, patch, state.transactionDetailJobId])

  const closeTransaction = useCallback(() => {
    transactionDetailRequestId.current += 1
    patch({
      detailLoading: false,
      detailReadError: null,
      detailReadFailed: false,
      selectedTransaction: null,
      transactionDetailJobId: null,
    })
  }, [patch])

  const refreshAdminSection = useCallback(async () => {
    await Promise.all([
      loadData(),
      refreshSelectedTransaction(),
    ])
  }, [loadData, refreshSelectedTransaction])

  useAdminSectionAutoRefresh(
    activeTab,
    refreshAdminSection,
    Boolean(state.readFailed || state.operationsError || state.teamError || state.detailReadFailed),
    refreshAdminSection,
  )
  const startAdminDataLoad = useEffectEvent(() => {
    void loadData()
  })

  useEffect(() => {
    if (!hasAuthenticatedAdminSession) return () => undefined
    const sectionAtStart = activeTab
    startAdminDataLoad()
    return () => {
      loadRequestIds[sectionAtStart] = (loadRequestIds[sectionAtStart] ?? 0) + 1
      backgroundLoads.delete(sectionAtStart)
    }
  }, [activeTab, backgroundLoads, debouncedSearchQuery, hasAuthenticatedAdminSession, loadRequestIds, overviewDetailKey, transactionPage, workerFilter, workerPage])

  useEffect(() => {
    if (searchQuery === debouncedSearchQuery) return () => undefined
    const timer = setTimeout(() => dispatch({
      type: 'patch',
      patch: { debouncedSearchQuery: searchQuery, transactionPage: 1, workerPage: 1 },
    }), 300)
    return () => clearTimeout(timer)
  }, [debouncedSearchQuery, searchQuery])

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

  const handleSessionMissing = useCallback(() => {
    actorRef.current = null
    patch({ actor: null })
    router.replace(loginRoute as never)
  }, [loginRoute, patch, router])

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

  return {
    actions: { closeTransaction, commitDecision, commitWorkerAccess, completeSignOut, handleSessionMissing, loadData, openCapability, openOverviewTarget, openSection, openTransaction, patch },
    copy,
    financeView,
    formatters,
    language,
    payoutInitialTab: resolvedRoute.payoutTab,
    reduceMotion,
    reduceTransparency,
    state,
  }
}

function AdminSectionsLayout({ actions, copy, financeView, formatters, language, payoutInitialTab, reduceMotion, reduceTransparency, state }: AdminSectionsLayoutProps) {
  const [financeRefreshVersion, incrementFinanceRefreshVersion] = useReducer((version: number) => version + 1, 0)
  const onFinanceUpdated = useCallback(() => incrementFinanceRefreshVersion(), [])
  const {
    activeTab: requestedActiveTab,
    actionPending,
    actor,
    decisionModal,
    decisionReason,
    detailLoading,
    loading,
    selectedTransaction,
    selectedWorker,
    signOutConfirmationOpen,
    signingOut,
    workerAccessModal,
    workerAccessReason,
    refreshing,
    readError,
    detailReadError,
  } = state
  const { closeTransaction, commitDecision, commitWorkerAccess, completeSignOut, handleSessionMissing, loadData, openCapability, openOverviewTarget, openSection, patch } = actions
  const { disputeStatusLabel, formatCurrency, formatDate, jobStatusLabel, paymentProviderLabel, serviceLabel, statusLabel } = formatters
  const visibleSections = useMemo(() => visibleAdminProductionSections(actor), [actor])
  const activeTab = visibleSections.some((section) => section.id === requestedActiveTab)
    ? requestedActiveTab
    : visibleSections[0]?.id ?? requestedActiveTab
  const navigationCopy = language === 'vi'
    ? { finance: 'Tài chính', operations: 'Vận hành', overview: 'Tổng quan', system: 'Hệ thống', team: 'Đội ngũ', workers: 'Thợ' }
    : { finance: 'Finance', operations: 'Operations', overview: 'Overview', system: 'System', team: 'Team', workers: 'Workers' }
  const navigation = visibleSections.map((section) => ({
    id: section.id,
    label: navigationCopy[section.id],
    testID: ADMIN_SECTION_NAVIGATION_TEST_IDS[section.id],
  }))
  const workspaceTitle = language === 'vi' ? 'Điều hành NestScout' : 'NestScout operations'
  const baseSectionPresentation = findAdminProductionSection(language, activeTab)
  const sectionPresentation = {
    ...baseSectionPresentation,
    capabilities: baseSectionPresentation.capabilities.filter((capability) => canAccessProductionCapability(
      capability.id,
      actor,
    )),
  }
  const requestedCapability = findAdminProductionCapability(language, state.selectedCapabilityId)
  const selectedCapability = requestedCapability
    && sectionPresentation.capabilities.some((capability) => capability.id === requestedCapability.id)
    && (!requestedCapability.ownerOnly || actor?.access_level === 'owner')
    ? requestedCapability
    : null
  return <SafeAreaView style={styles.safeArea} testID="admin-sections">
    <AdminSectionsProductionShell
      activeSection={activeTab}
      navigation={navigation}
      navigationLabel={language === 'vi' ? 'Khu vực quản trị' : 'Admin areas'}
      onSelectSection={openSection}
      onSignOut={() => patch({ signOutConfirmationOpen: true })}
      signOutLabel={copy.actions.signOut}
      title={workspaceTitle}
    >
      <View style={styles.stack}>
        {!actor && loading ? <View style={styles.loading}><ActivityIndicator color={color.brand.primary} /><AdminText textRole="subheadline" style={styles.loadingText}>{copy.loading}</AdminText></View> : null}
        {!actor && readError ? <AdminDataFeedback error={readError} notice={null} /> : null}
        {actor && navigation.length === 0 ? <EmptyState body={copy.errors.load} /> : null}
        {actor ? activeTab === 'overview'
          ? <AdminOverviewDashboard financeRefreshVersion={financeRefreshVersion} language={language} onOpenTarget={openOverviewTarget} onSessionMissing={handleSessionMissing} />
          : <AdminProductionSectionIndex
            actor={actor}
            language={language}
            onOpenCapability={openCapability}
            refreshing={refreshing}
            section={sectionPresentation}
          /> : null}
        {detailLoading ? <View style={styles.detailLoading}><ActivityIndicator color={color.brand.primary} /></View> : null}
        {detailReadError && !selectedTransaction ? <AdminDataFeedback error={detailReadError} notice={null} /> : null}
      </View>
    </AdminSectionsProductionShell>
    <AdminProductionCapabilitySheet
      capability={selectedCapability}
      language={language}
      onClose={() => patch({ overviewDetailKey: null, selectedCapabilityId: null })}
      ownsScroll={selectedCapability?.id === 'operations-scope-change' || selectedCapability?.id === 'operations-disputes' || selectedCapability?.id.startsWith('system-')}
    >
      {actor && selectedCapability ? <AdminCapabilityWorkspace
        actions={actions}
        actor={actor}
        capability={selectedCapability}
        copy={copy}
        financeView={financeView}
        formatters={formatters}
        language={language}
        payoutInitialTab={payoutInitialTab}
        onFinanceUpdated={onFinanceUpdated}
        reduceMotion={reduceMotion}
        reduceTransparency={reduceTransparency}
        state={state}
      /> : null}
    </AdminProductionCapabilitySheet>
    <AdminWorkerReviewModal key={selectedWorker?.id ?? 'closed-worker-review'} copy={copy} language={language} worker={selectedWorker} serviceLabel={serviceLabel} formatDate={formatDate} actionPending={actionPending} canReview={Boolean(actor?.capabilities.includes('workers.review'))} canManage={Boolean(actor?.capabilities.includes('workers.manage'))} canReadFinance={Boolean(actor?.capabilities.includes('finance.read'))} onClose={() => patch({ selectedWorker: null })} onRefresh={loadData} onAccessApprove={() => { if (selectedWorker) { patch({ selectedWorker: null }); void commitDecision(selectedWorker, 'approve') } }} onAccessRequestChanges={() => { if (selectedWorker) patch({ selectedWorker: null, decisionModal: { decision: 'request_changes', worker: selectedWorker }, decisionReason: '' }) }} onAccessReject={() => { if (selectedWorker) patch({ selectedWorker: null, decisionModal: { decision: 'reject', worker: selectedWorker }, decisionReason: '' }) }} onSuspend={() => { if (selectedWorker) patch({ selectedWorker: null, workerAccessModal: { action: 'suspend', worker: selectedWorker }, workerAccessReason: '' }) }} onReinstate={() => { if (selectedWorker) patch({ selectedWorker: null, workerAccessModal: { action: 'reinstate', worker: selectedWorker }, workerAccessReason: '' }) }} reduceMotion={reduceMotion} />
    <DecisionModalView copy={copy} modal={decisionModal} reason={decisionReason} pending={Boolean(actionPending)} onChangeReason={(decisionReason) => patch({ decisionReason })} onClose={() => patch({ decisionModal: null })} onSubmit={() => decisionModal && void commitDecision(decisionModal.worker, decisionModal.decision, decisionReason)} />
    <WorkerAccessModalView actionPending={Boolean(actionPending)} language={language} modal={workerAccessModal} onChangeReason={(workerAccessReason) => patch({ workerAccessReason })} onClose={() => patch({ workerAccessModal: null })} onSubmit={() => workerAccessModal && void commitWorkerAccess(workerAccessModal.worker, workerAccessModal.action, workerAccessReason)} reason={workerAccessReason} />
    <Modal animationType={reduceMotion ? 'none' : 'fade'} transparent visible={signOutConfirmationOpen} onRequestClose={() => { if (!signingOut) patch({ signOutConfirmationOpen: false }) }}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard} testID="admin-sign-out-confirmation">
        <AdminText textRole="title2" style={styles.modalTitle}>{copy.modal.signOutTitle}</AdminText>
        <AdminText textRole="subheadline" style={styles.modalSubtitle}>{copy.modal.signOutBody}</AdminText>
        <View style={styles.modalActionRow}>
          <KaelButton label={copy.actions.staySignedIn} onPress={() => patch({ signOutConfirmationOpen: false })} disabled={signingOut} style={styles.modalActionButton} variant="secondary" />
          <KaelButton label={signingOut ? copy.actions.signingOut : copy.actions.signOut} loading={signingOut} onPress={() => { void completeSignOut() }} style={styles.modalActionButton} testID="admin-sign-out-confirm" variant="primary" />
        </View>
      </View></View>
    </Modal>
    <TransactionDetailModal copy={copy} detail={selectedTransaction} formatCurrency={formatCurrency} formatDate={formatDate} language={language} serviceLabel={serviceLabel} statusLabel={statusLabel} paymentProviderLabel={paymentProviderLabel} disputeStatusLabel={disputeStatusLabel} jobStatusLabel={jobStatusLabel} onClose={closeTransaction} readError={detailReadError} reduceTransparency={reduceTransparency} />
  </SafeAreaView>
}

export default AdminSections
