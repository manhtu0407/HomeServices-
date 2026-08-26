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
  const { activeTab, actor, debouncedSearchQuery, overviewDetailKey, searchQuery, signingOut, transactionPage, workerFilter, workerPage } = state
  const patch = useCallback((next: Partial<AdminSectionsState>) => {
    dispatch({ type: 'patch', patch: next })
  }, [])
  const openSection = useCallback((section: AdminSectionTab) => {
    patch({
      activeTab: section,
      error: null,
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
    const targetWorkerFilter: WorkerFilter = target.detailKey === 'worker_applications'
      ? 'pending_access'
      : target.detailKey === 'workers_in_verification'
        ? 'ready_verification'
        : 'all'
    patch({
      activeTab: target.section,
      error: null,
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

  const loadData = useCallback(async ({ refreshActor }: { refreshActor?: boolean } = {}) => {
    const requestedSection = activeTab
    const isInitialLoad = !actorRef.current
    if (!isInitialLoad && backgroundLoads.has(requestedSection)) return
    if (!isInitialLoad) backgroundLoads.add(requestedSection)
    const requestId = (loadRequestIds[requestedSection] ?? 0) + 1
    loadRequestIds[requestedSection] = requestId
    patch({
      ...(isInitialLoad
        ? { loading: true, refreshing: false }
        : { loading: false, refreshing: true }),
      error: null,
      ...(requestedSection === 'team' ? { teamError: null } : {}),
    })
    try {
      let currentActor = actorRef.current
      if (!currentActor || refreshActor) {
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const actorResult = await adminControlService.getActor()
        if (requestId !== loadRequestIds[requestedSection] || activeSectionRef.current !== requestedSection) return
        if (!actorResult.success && isMissingAdminSession(actorResult)) {
          actorRef.current = null
          patch({ actor: null, operations: null, operationsError: actorResult.error })
          router.replace(loginRoute as never)
          return
        }
        if (!actorResult.success) {
          patch({ error: actorResult.error })
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
        patch({ actor: currentActor, error: copy.errors.load })
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
          error: null,
          workers: result.data.applications,
          workersHasMore: result.data.has_more,
          workersTotalCount: result.data.total_count,
        } : { error: copy.errors.load })
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
            : { operationsError: operationsResult.error }),
          ...(result.success ? {
          error: null,
          transactions: result.data.transactions,
          transactionsHasMore: result.data.has_more,
          transactionsTotalCount: result.data.total_count,
          } : { error: copy.errors.load }),
        })
      } else if (effectiveSection === 'team') {
        const result = await adminControlService.listSubAdmins()
        sectionResult = result
        if (requestId !== loadRequestIds[requestedSection] || activeSectionRef.current !== requestedSection) return
        patch(result.success ? {
          managerNominations: result.data.nominations,
          pendingAdminAccounts: result.data.pending_accounts ?? [],
          subAdmins: result.data.members,
          teamError: null,
        } : { teamError: result.error })
      }

      if (sectionResult && !sectionResult.success && isMissingAdminSession(sectionResult)) {
        patch({ actor: null, operations: null, operationsError: sectionResult.error })
        router.replace(loginRoute as never)
      }
    } finally {
      if (requestId === loadRequestIds[requestedSection]) {
        backgroundLoads.delete(requestedSection)
        if (activeSectionRef.current === requestedSection) patch({ loading: false, refreshing: false })
      }
    }
  }, [activeTab, backgroundLoads, copy.errors.load, debouncedSearchQuery, loadRequestIds, loginRoute, overviewDetailKey, patch, router, transactionPage, workerFilter, workerPage])
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
    actions: { commitDecision, commitWorkerAccess, completeSignOut, handleSessionMissing, loadData, openCapability, openOverviewTarget, openSection, openTransaction, patch },
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

type AdminSectionsLayoutProps = {
  actions: {
    commitDecision: (worker: AdminViewWorkerApplicationSummary, decision: AdminViewWorkerApplicationDecisionInput['decision'], reason?: string) => Promise<void>
    commitWorkerAccess: (worker: AdminViewWorkerApplicationSummary, action: 'suspend' | 'reinstate', reason: string) => Promise<void>
    completeSignOut: () => Promise<void>
    handleSessionMissing: () => void
    loadData: () => Promise<void>
    openCapability: (capability: AdminProductionCapability) => void
    openOverviewTarget: (target: AdminOverviewOpenTarget) => void
    openSection: (section: AdminSectionTab) => void
    openTransaction: (transaction: AdminViewTransactionSummary) => Promise<void>
    patch: (next: Partial<AdminSectionsState>) => void
  }
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
  payoutInitialTab: 'accounts' | 'withdrawals'
  reduceMotion: boolean
  reduceTransparency: boolean
  state: AdminSectionsState
}

function AdminSectionsLayout({ actions, copy, financeView, formatters, language, payoutInitialTab, reduceMotion, reduceTransparency, state }: AdminSectionsLayoutProps) {
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
  } = state
  const { commitDecision, commitWorkerAccess, completeSignOut, handleSessionMissing, loadData, openCapability, openOverviewTarget, openSection, patch } = actions
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
        {actor && navigation.length === 0 ? <EmptyState body={copy.errors.load} /> : null}
        {actor ? activeTab === 'overview'
          ? <AdminOverviewDashboard language={language} onOpenTarget={openOverviewTarget} onSessionMissing={handleSessionMissing} />
          : <AdminProductionSectionIndex
            actor={actor}
            language={language}
            onOpenCapability={openCapability}
            refreshing={refreshing}
            section={sectionPresentation}
          /> : null}
        {detailLoading ? <View style={styles.detailLoading}><ActivityIndicator color={color.brand.primary} /></View> : null}
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
    <TransactionDetailModal copy={copy} detail={selectedTransaction} formatCurrency={formatCurrency} formatDate={formatDate} language={language} serviceLabel={serviceLabel} statusLabel={statusLabel} paymentProviderLabel={paymentProviderLabel} disputeStatusLabel={disputeStatusLabel} jobStatusLabel={jobStatusLabel} onClose={() => patch({ selectedTransaction: null })} reduceTransparency={reduceTransparency} />
  </SafeAreaView>
}

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

function AdminCapabilityWorkspace({ actions, actor, capability, copy, financeView, formatters, language, payoutInitialTab, reduceMotion, reduceTransparency, state }: {
  actions: AdminSectionsLayoutProps['actions']
  actor: AdminViewActor
  capability: AdminProductionCapability
  copy: AdminSectionsCopy
  financeView: string
  formatters: AdminSectionsLayoutProps['formatters']
  language: 'vi' | 'en'
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
        onRetry={() => { void loadData() }}
        snapshot={operations}
      />
    case 'operations-service-transactions':
      return <>
        {overviewDetailKey === 'payment_attention' ? <View style={styles.filterRow} testID="admin-overview-payment-filter">
          <AdminText textRole="subheadline">{overviewDetailTitle(overviewDetailKey, language)}</AdminText>
          <KaelButton label={language === 'vi' ? 'Bỏ bộ lọc' : 'Clear filter'} onPress={() => patch({ overviewDetailKey: null, transactionPage: 1 })} variant="secondary" />
        </View> : null}
        <AdminDataSearchToolbar copy={copy} onChangeSearch={(searchQuery) => patch({ searchQuery })} onRefresh={() => { void loadData() }} searchQuery={searchQuery} />
        <AdminDataFeedback copy={copy} error={error} notice={notice} onDismissError={() => patch({ error: null })} onRetry={() => { void loadData() }} />
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
        <AdminDataSearchToolbar copy={copy} onChangeSearch={(searchQuery) => patch({ searchQuery })} onRefresh={() => { void loadData() }} refreshTestID="admin-worker-refresh" searchQuery={searchQuery} />
        <View style={styles.filterRow}>
          {(['pending_access', 'missing_profile', 'ready_verification', 'verified', 'all'] as const).map((filter) => <FinanceChoiceChip key={filter} accessibilityLabel={workerReviewCopy[language].filter[filter]} label={workerReviewCopy[language].filter[filter]} onPress={() => patch({ workerFilter: filter, workerPage: 1 })} selected={workerFilter === filter} testID={`admin-worker-filter-${filter}`} />)}
        </View>
        <AdminDataFeedback copy={copy} error={error} notice={notice} onDismissError={() => patch({ error: null })} onRetry={() => { void loadData() }} />
        {loading && workers.length === 0 ? <AdminWorkspaceLoading copy={copy} /> : workers.length === 0 ? <EmptyState body={copy.noData.workers} /> : <>
          {workers.map((worker) => <WorkerApplicationCard key={worker.id} copy={copy} language={language} worker={worker} serviceLabel={serviceLabel} formatDate={formatDate} actionPending={actionPending} canReview={actor.capabilities.includes('workers.review')} onOpen={() => patch({ selectedWorker: worker })} onApprove={() => void commitDecision(worker, 'approve')} onRequestChanges={() => patch({ decisionModal: { decision: 'request_changes', worker }, decisionReason: '' })} onReject={() => patch({ decisionModal: { decision: 'reject', worker }, decisionReason: '' })} />)}
          <AdminPagination hasMore={workersHasMore} labels={copy.pagination} loading={loading || refreshing} onPageChange={(workerPage) => patch({ workerPage })} page={workerPage} pageTestIDPrefix="admin-worker-page" pageSize={WORKERS_PER_PAGE} testID="admin-worker-pagination" totalCount={workersTotalCount} />
        </>}
      </>
    case 'finance-overview':
    case 'finance-reconciliation':
    case 'finance-tax': {
      const effectiveView = capability.id === 'finance-reconciliation'
        ? 'cash'
        : capability.id === 'finance-tax'
          ? 'tax'
          : financeView
      return <AdminFinancePanel actor={actor} initialView={effectiveView} key={`${capability.id}-${effectiveView}`} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} />
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
          ? <AdminDataFeedback copy={copy} error={teamError} notice={null} onDismissError={() => patch({ teamError: null })} onRetry={() => { void loadData() }} />
          : <AdminTeamWorkspace actor={actor} capability={capability.id} language={language} members={subAdmins} nominations={managerNominations} pendingAccounts={pendingAdminAccounts} onRefresh={loadData} />
    case 'system-price-baseline':
    case 'system-taxonomy':
    case 'system-learning-rules':
    case 'system-model-health':
      return <AdminSystemWorkspace actor={actor} capability={capability.id} key={capability.id} language={language} />
    default:
      return <AdminUnavailableCapability language={language} />
  }
}

export default AdminSections
