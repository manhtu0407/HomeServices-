import { createContext, use, useCallback, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react'
import { AppState } from 'react-native'
import {
  createInitialLocalWorkflowState,
  localWorkflowReducer,
  selectLocalWorkflow,
  type CustomerKaelMemoryPreferenceUpdateInput,
  type CustomerScopeDecisionInput,
  type FavoriteWorkerForMatching,
  type JobMatchingPreferenceInput,
  type LocalDealDraft,
  type LocalWorkflowAction,
  type LocalWorkflowSelectors,
  type LocalWorkflowState,
  type ReviewInput,
  type WorkerRegisterInput,
  type WorkerRegistrationDraftInput,
  type WorkerServiceAreaUpdateInput,
  type WorkerServicePreferencesUpdateInput,
} from '@nestscout/shared'
import type { PendingClientRequestId } from './client-request-id'
import { useAuth } from './auth-provider'
import type { LocalMediaUploadDraft } from './media-upload'
import { subscribeToJobStatus, subscribeToWorkerBroadcasts, subscribeToWorkerEarnings } from './realtime'
import type {
  CustomerProfileInsightsResponse,
  EarningsResponse,
  KaelMemorySelfViewResponse,
  NotificationListResponse,
  WorkerCancellationRequestInput,
  WorkerJobListResponse,
  WorkerPayoutMethod,
  WorkerPayoutMethodSaveInput,
  WorkerPerformanceInsightsResponse,
  WorkerProfileResponse,
  WorkerWithdrawalRequest,
  WorkerWithdrawalRequestCreateInput,
  WorkerCandidateView,
  JobIncidentResponse,
  JobIncidentScopePricePreviewResponse,
} from './api-types'
import { useAppLanguage } from './app-language'
import { localizeWorkflowError, type WorkflowErrorContext } from './frontend-workflow/errors'
import type { CustomerAvatarDraft } from './customer-avatar-upload'
import type { WorkerAvatarDraft } from './worker-avatar-upload'
import {
  ACTIVE_TIMELINE_STATUSES,
  getRemoteJobId,
  isAppForeground,
} from './frontend-workflow/helpers'
import {
  useCustomerKaelMemoryActions,
  type CustomerKaelMemoryStatus,
} from './frontend-workflow/use-customer-kael-memory-actions'
import { useCompletionPaymentActions } from './frontend-workflow/use-completion-payment-actions'
import { useCustomerAvatarActions } from './frontend-workflow/use-customer-avatar-actions'
import { useCustomerJobActions } from './frontend-workflow/use-customer-job-actions'
import { useCustomerProfileInsightsActions } from './frontend-workflow/use-customer-profile-insights-actions'
import { useNotificationActions } from './frontend-workflow/use-notification-actions'
import {
  useScopeChangeActions,
  type WorkerScopeChangeDraftInput,
} from './frontend-workflow/use-scope-change-actions'
import { useWorkerBoardActions } from './frontend-workflow/use-worker-board-actions'
import { useWorkerOnsiteActions } from './frontend-workflow/use-worker-onsite-actions'
import { useWorkerCandidateActions } from './frontend-workflow/use-worker-candidate-actions'

type CustomerKaelMemoryPreferenceUpdateResult = {
  success: boolean
  code?: string
  error?: string
  status?: number
}

type WorkerPayoutMethodSaveResult = {
  success: false
  code?: string
  error: string
  status?: number
}

type WorkerOnsiteActions = ReturnType<typeof useWorkerOnsiteActions>

type FrontendWorkflowActions = {
  createRemoteJobFromDraft: (
    draft?: LocalDealDraft,
    mediaItems?: LocalMediaUploadDraft[],
  ) => Promise<{ jobId: string; mediaError?: string } | false | null>
  hydrateRemoteJobById: (jobId: string, accessToken?: string) => Promise<boolean>
  confirmRemoteSearch: (jobIdOverride?: string) => Promise<boolean>
  listFavoriteWorkersForMatching: () => Promise<FavoriteWorkerForMatching[] | null>
  setMatchingPreference: (input: Omit<JobMatchingPreferenceInput, 'client_request_id'>) => Promise<boolean>
  cancelRemoteJob: () => Promise<boolean>
  refreshCurrentJob: () => Promise<boolean>
  workerRefresh: () => Promise<boolean>
  workerAcceptBroadcast: (jobId?: string) => Promise<boolean>
  workerDeclineBroadcast: () => Promise<boolean>
  workerUpdateStatus: WorkerOnsiteActions['workerUpdateStatus']
  workerConfirmCashPayment: (received?: boolean) => Promise<boolean>
  requestScopeChange: (input: WorkerScopeChangeDraftInput) => Promise<boolean>
  getKaelJobIncident: (jobIdOverride?: string) => Promise<JobIncidentResponse | false>
  openKaelJobIncident: (input: WorkerScopeChangeDraftInput) => Promise<JobIncidentResponse | false>
  previewScopeChangeFromKaelIncident: () => Promise<JobIncidentScopePricePreviewResponse | false>
  proposeScopeChangeFromKaelIncident: (quoteId: string) => Promise<boolean>
  requestWorkerCancellation: (input: WorkerCancellationRequestInput) => Promise<boolean>
  workerSubmitRegistration: (input: WorkerRegisterInput) => Promise<boolean>
  workerSaveRegistrationDraft: (input: WorkerRegistrationDraftInput) => Promise<boolean>
  decideScopeChange: (scopeChangeId: string, input: CustomerScopeDecisionInput) => Promise<boolean>
  customerConfirmCompletion: () => Promise<boolean>
  createPaymentIntent: () => Promise<boolean>
  createManualBankPaymentOrder: () => Promise<boolean>
  claimManualBankPayment: (sendingBank?: string) => Promise<boolean>
  selectDirectWorkerPayment: () => Promise<boolean>
  respondToDirectWorkerPayment: (received: boolean) => Promise<boolean>
  confirmStagingPayment: () => Promise<boolean>
  authorizeApartmentAccess: () => Promise<boolean>
  submitReview: (input: Omit<ReviewInput, 'job_id'>) => Promise<boolean>
  workerUpdateAvailability: (isAvailable: boolean) => Promise<boolean>
  workerUpdateServiceArea: (input: WorkerServiceAreaUpdateInput) => Promise<boolean>
  workerUpdateServicePreferences: (input: WorkerServicePreferencesUpdateInput) => Promise<boolean>
  workerUploadAvatar: (input: WorkerAvatarDraft) => Promise<boolean>
  workerSavePayoutMethod: (input: WorkerPayoutMethodSaveInput) => Promise<boolean | WorkerPayoutMethodSaveResult>
  workerRequestWithdrawal: (input: WorkerWithdrawalRequestCreateInput) => Promise<boolean | WorkerPayoutMethodSaveResult>
  refreshNotifications: () => Promise<boolean>
  markNotificationRead: (notificationId: string) => Promise<boolean>
  refreshCustomerKaelMemory: () => Promise<boolean>
  updateCustomerKaelMemoryPreference: (input: CustomerKaelMemoryPreferenceUpdateInput) => Promise<boolean | CustomerKaelMemoryPreferenceUpdateResult>
  refreshCustomerProfileInsights: () => Promise<boolean>
  refreshCustomerAvatar: () => Promise<boolean>
  customerUploadAvatar: (input: CustomerAvatarDraft) => Promise<boolean>
  refreshWorkerCandidate: (jobId?: string) => Promise<boolean>
  decideWorkerCandidate: (decision: 'confirm' | 'reject') => Promise<boolean>
  setWorkerCandidateFavorite: (isFavorite: boolean) => Promise<boolean>
}

type FrontendWorkflowContextValue = {
  state: LocalWorkflowState
  selectors: LocalWorkflowSelectors
  customerKaelMemory: KaelMemorySelfViewResponse['memory'] | null
  customerKaelMemoryStatus: CustomerKaelMemoryStatus
  customerProfileInsights: CustomerProfileInsightsResponse | null
  customerAvatarUrl: string | null
  customerWorkerCandidate: WorkerCandidateView | null
  customerWorkerCandidateBusy: boolean
  customerWorkerCandidateError: string | null
  customerScopeDecisionBusyId: string | null
  workerEarnings: EarningsResponse | null
  workerEarningsError: string | null
  workerJobs: WorkerJobListResponse['jobs']
  workerJobsHydrated: boolean
  workerPerformanceInsights: WorkerPerformanceInsightsResponse | null
  workerPayoutMethod: WorkerPayoutMethod | null
  workerProfile: WorkerProfileResponse | null
  workerWithdrawalRequests: WorkerWithdrawalRequest[]
  notifications: NotificationListResponse['notifications']
  notificationUnreadCount: number
  dispatch: Dispatch<LocalWorkflowAction>
  actions: FrontendWorkflowActions
}

const FrontendWorkflowContext = createContext<FrontendWorkflowContextValue | null>(null)

function useFrontendWorkflowValue(): FrontendWorkflowContextValue {
  const { role, session } = useAuth()
  const language = useAppLanguage()
  const [state, dispatch] = useReducer(localWorkflowReducer, undefined, createInitialLocalWorkflowState)
  const selectors = useMemo(() => selectLocalWorkflow(state), [state])
  const sessionUserId = session?.user.id ?? null
  const localVisualAuditSession = session?.user.app_metadata?.provider === 'local-visual-audit'
  const remoteRole = localVisualAuditSession ? null : role
  const remoteSessionUserId = localVisualAuditSession ? null : sessionUserId
  const stateRef = useRef(state)
  const pendingJobCreateClientRequestRef = useRef<PendingClientRequestId | null>(null)
  const pendingMatchingPreferenceClientRequestRef = useRef<PendingClientRequestId | null>(null)
  const pendingDirectScopeChangeClientRequestRef = useRef<PendingClientRequestId | null>(null)
  const pendingIncidentOpenClientRequestRef = useRef<PendingClientRequestId | null>(null)
  const pendingScopePricePreviewClientRequestRef = useRef<PendingClientRequestId | null>(null)
  const pendingScopeProposalClientRequestRef = useRef<PendingClientRequestId | null>(null)
  const pendingRequestOwnerRef = useRef(sessionUserId)
  // Holds the latest refresh callbacks so realtime/AppState effects can stay
  // subscribed across callback-identity changes (no channel churn) while always
  // invoking the freshest closure. Populated by the sync effect below once the
  // callbacks are defined.
  const liveRefreshRef = useRef<{
    refreshCurrentJob: () => Promise<boolean>
    workerRefresh: () => Promise<boolean>
    refreshNotifications: () => Promise<boolean>
    hydrateCustomerActiveJob: () => Promise<boolean>
    refreshCustomerAvatar: () => Promise<boolean>
  } | null>(null)

  useEffect(() => {
    if (pendingRequestOwnerRef.current === sessionUserId) return
    pendingRequestOwnerRef.current = sessionUserId
    pendingJobCreateClientRequestRef.current = null
    pendingMatchingPreferenceClientRequestRef.current = null
    pendingDirectScopeChangeClientRequestRef.current = null
    pendingIncidentOpenClientRequestRef.current = null
    pendingScopePricePreviewClientRequestRef.current = null
    pendingScopeProposalClientRequestRef.current = null
  }, [sessionUserId])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const broadcast = state.deal?.broadcast
  const remoteJobId = getRemoteJobId(state)
  const customerStatus = state.deal?.status

  const setRemoteError = useCallback((error: string, code?: string, context?: WorkflowErrorContext) => {
    dispatch({ type: 'set_workflow_error', error: localizeWorkflowError(error, language, code, context) })
    return false
  }, [language])

  const {
    notifications,
    notificationUnreadCount,
    refreshNotifications,
    markNotificationRead,
  } = useNotificationActions({ role: remoteRole, sessionUserId: remoteSessionUserId, setRemoteError })

  const {
    customerKaelMemory,
    customerKaelMemoryStatus,
    refreshCustomerKaelMemory,
    updateCustomerKaelMemoryPreference,
  } = useCustomerKaelMemoryActions({ role: remoteRole, sessionUserId: remoteSessionUserId, setRemoteError })

  const {
    customerProfileInsights,
    refreshCustomerProfileInsights,
  } = useCustomerProfileInsightsActions({ role: remoteRole, sessionUserId: remoteSessionUserId })

  const {
    customerAvatarUrl,
    customerUploadAvatar,
    refreshCustomerAvatar,
  } = useCustomerAvatarActions({ role: remoteRole, sessionUserId: remoteSessionUserId, setRemoteError })

  const {
    cancelRemoteJob,
    confirmRemoteSearch,
    createRemoteJobFromDraft,
    hydrateCustomerActiveJob,
    hydrateRemoteJobById,
    listFavoriteWorkersForMatching,
    refreshCurrentJob,
    setMatchingPreference,
  } = useCustomerJobActions({
    dispatch,
    language,
    pendingJobCreateClientRequestRef,
    pendingMatchingPreferenceClientRequestRef,
    role: remoteRole,
    sessionUserId: remoteSessionUserId,
    setRemoteError,
    stateRef,
  })

  const {
    workerAcceptBroadcast,
    workerDeclineBroadcast,
    workerEarnings,
    workerEarningsError,
    workerJobs,
    workerJobsHydrated,
    workerPerformanceInsights,
    workerPayoutMethod,
    workerProfile,
    workerRefresh,
    workerRequestWithdrawal,
    workerSavePayoutMethod,
    workerSubmitRegistration,
    workerSaveRegistrationDraft,
    workerUpdateAvailability,
    workerUpdateServiceArea,
    workerUpdateServicePreferences,
    workerUploadAvatar,
    workerWithdrawalRequests,
  } = useWorkerBoardActions({
    dispatch,
    language,
    refreshCurrentJob,
    role: remoteRole,
    sessionUserId: remoteSessionUserId,
    setRemoteError,
    stateRef,
  })

  const {
    customerWorkerCandidate,
    customerWorkerCandidateBusy,
    customerWorkerCandidateError,
    decideWorkerCandidate,
    refreshWorkerCandidate,
    setWorkerCandidateFavorite,
  } = useWorkerCandidateActions({
    customerStatus,
    hydrateRemoteJobById,
    language,
    remoteJobId,
    role: remoteRole,
    sessionUserId: remoteSessionUserId,
    stateRef,
  })

  const {
    customerScopeDecisionBusyId,
    decideScopeChange,
    getKaelJobIncident,
    openKaelJobIncident,
    previewScopeChangeFromKaelIncident,
    proposeScopeChangeFromKaelIncident,
    requestScopeChange,
  } = useScopeChangeActions({
    pendingDirectScopeChangeClientRequestRef,
    pendingIncidentOpenClientRequestRef,
    pendingScopePricePreviewClientRequestRef,
    pendingScopeProposalClientRequestRef,
    refreshCurrentJob,
    setRemoteError,
    stateRef,
  })

  const {
    authorizeApartmentAccess,
    requestWorkerCancellation,
    workerConfirmCashPayment,
    workerUpdateStatus,
  } = useWorkerOnsiteActions({
    dispatch,
    refreshCurrentJob,
    setRemoteError,
    stateRef,
    workerRefresh,
  })

  const {
    claimManualBankPayment,
    confirmStagingPayment,
    createManualBankPaymentOrder,
    createPaymentIntent,
    customerConfirmCompletion,
    respondToDirectWorkerPayment,
    selectDirectWorkerPayment,
    submitReview,
  } = useCompletionPaymentActions({
    dispatch,
    refreshCurrentJob,
    setRemoteError,
    stateRef,
  })

  const actions = useMemo<FrontendWorkflowActions>(() => ({
    createRemoteJobFromDraft,
    confirmRemoteSearch,
    listFavoriteWorkersForMatching,
    setMatchingPreference,
    cancelRemoteJob,
    hydrateRemoteJobById,
    refreshCurrentJob,
    workerRefresh,
    workerAcceptBroadcast,
    workerDeclineBroadcast,
    workerUpdateStatus,
    workerConfirmCashPayment,
    requestScopeChange,
    getKaelJobIncident,
    openKaelJobIncident,
    previewScopeChangeFromKaelIncident,
    proposeScopeChangeFromKaelIncident,
    requestWorkerCancellation,
    workerSubmitRegistration,
    workerSaveRegistrationDraft,
    decideScopeChange,
    customerConfirmCompletion,
    createManualBankPaymentOrder,
    createPaymentIntent,
    claimManualBankPayment,
    selectDirectWorkerPayment,
    respondToDirectWorkerPayment,
    confirmStagingPayment,
    authorizeApartmentAccess,
    submitReview,
    workerUpdateAvailability,
    workerUpdateServiceArea,
    workerUpdateServicePreferences,
    workerUploadAvatar,
    workerRequestWithdrawal,
    workerSavePayoutMethod,
    refreshNotifications,
    markNotificationRead,
    refreshCustomerKaelMemory,
    updateCustomerKaelMemoryPreference,
    refreshCustomerProfileInsights,
    refreshCustomerAvatar,
    customerUploadAvatar,
    refreshWorkerCandidate,
    decideWorkerCandidate,
    setWorkerCandidateFavorite,
  }), [
    authorizeApartmentAccess,
    cancelRemoteJob,
    confirmRemoteSearch,
    createRemoteJobFromDraft,
    listFavoriteWorkersForMatching,
    customerConfirmCompletion,
    createManualBankPaymentOrder,
    createPaymentIntent,
    claimManualBankPayment,
    selectDirectWorkerPayment,
    respondToDirectWorkerPayment,
    confirmStagingPayment,
    decideScopeChange,
    decideWorkerCandidate,
    setWorkerCandidateFavorite,
    setMatchingPreference,
    hydrateRemoteJobById,
    refreshCurrentJob,
    refreshNotifications,
    refreshCustomerKaelMemory,
    refreshCustomerProfileInsights,
    refreshCustomerAvatar,
    customerUploadAvatar,
    refreshWorkerCandidate,
    updateCustomerKaelMemoryPreference,
    markNotificationRead,
    requestScopeChange,
    getKaelJobIncident,
    openKaelJobIncident,
    previewScopeChangeFromKaelIncident,
    proposeScopeChangeFromKaelIncident,
    requestWorkerCancellation,
    submitReview,
    workerAcceptBroadcast,
    workerDeclineBroadcast,
    workerRefresh,
    workerSavePayoutMethod,
    workerRequestWithdrawal,
    workerSubmitRegistration,
    workerSaveRegistrationDraft,
    workerUpdateAvailability,
    workerUpdateServiceArea,
    workerUpdateServicePreferences,
    workerUploadAvatar,
    workerUpdateStatus,
    workerConfirmCashPayment,
  ])

  useEffect(() => {
    dispatch({ type: 'reset_workflow' })
  }, [sessionUserId])

  useEffect(() => {
    liveRefreshRef.current = {
      refreshCurrentJob,
      workerRefresh,
      refreshNotifications,
      hydrateCustomerActiveJob,
      refreshCustomerAvatar,
    }
  }, [refreshCurrentJob, workerRefresh, refreshNotifications, hydrateCustomerActiveJob, refreshCustomerAvatar])

  // Refresh immediately on foreground; polling and realtime can otherwise leave
  // a stale timeline/notification visible until their next interval/event.
  useEffect(() => {
    if (!remoteSessionUserId || !remoteRole) return
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return
      const live = liveRefreshRef.current
      if (!live) return
      void live.refreshNotifications()
      if (remoteRole === 'customer' || remoteRole === 'admin') {
        if (getRemoteJobId(stateRef.current)) void live.refreshCurrentJob()
        else void live.hydrateCustomerActiveJob()
      }
      // The avatar read URL is short-lived, so re-sign it after a long background.
      if (remoteRole === 'customer') void live.refreshCustomerAvatar()
      if (remoteRole === 'worker' || remoteRole === 'admin') void live.workerRefresh()
    })
    return () => subscription.remove()
  }, [remoteRole, remoteSessionUserId])

  // Realtime surfaces incoming broadcasts quickly; polling remains the fallback
  // and RLS scopes the channel to this worker's own rows.
  useEffect(() => {
    if (!remoteSessionUserId || (remoteRole !== 'worker' && remoteRole !== 'admin')) return
    const handle = subscribeToWorkerBroadcasts(remoteSessionUserId, () => {
      void liveRefreshRef.current?.workerRefresh()
    })
    return () => {
      void handle?.unsubscribe()?.catch(() => {})
    }
  }, [remoteRole, remoteSessionUserId])

  // Payment rows are authoritative invalidation events. Keep the 20-second
  // poll as recovery, but refresh immediately when reconciliation changes the
  // authenticated Worker's own ledger.
  useEffect(() => {
    if (!remoteSessionUserId || remoteRole !== 'worker') return
    const handle = subscribeToWorkerEarnings(remoteSessionUserId, () => {
      void liveRefreshRef.current?.workerRefresh()
    })
    return () => {
      void handle?.unsubscribe()?.catch(() => {})
    }
  }, [remoteRole, remoteSessionUserId])

  const customerTimelineActive =
    (remoteRole === 'customer' || remoteRole === 'admin') &&
    !!remoteJobId &&
    ACTIVE_TIMELINE_STATUSES.includes(customerStatus ?? '')

  // The local countdown is advisory. Keep reconciling a broadcasting job with
  // backend truth because a worker may be accepted at the deadline boundary.

  // Live customer timeline subscribes only while the job is active; polling is
  // the dropped-socket fallback and the latest-callback ref avoids churn.
  useEffect(() => {
    if (!customerTimelineActive || !remoteJobId) return
    const handle = subscribeToJobStatus(remoteJobId, () => {
      void liveRefreshRef.current?.refreshCurrentJob()
    })
    return () => {
      void handle?.unsubscribe()?.catch(() => {})
    }
  }, [customerTimelineActive, remoteJobId])

  useEffect(() => {
    if (!customerTimelineActive) return

    // Realtime above is the fast path; this fallback only matters if the socket is down.
    const interval = setInterval(() => {
      if (isAppForeground()) void refreshCurrentJob()
    }, 30_000)
    return () => clearInterval(interval)
  }, [
    customerTimelineActive,
    refreshCurrentJob,
  ])

  useEffect(() => {
    if (state.deal?.status !== 'broadcasting' || broadcast?.status !== 'sent') return
    if (broadcast.secondsRemaining === null) return

    const timer = setTimeout(() => dispatch({ type: 'tick_broadcast' }), 1000)
    return () => clearTimeout(timer)
  }, [state.deal?.status, broadcast?.status, broadcast?.secondsRemaining])

  return {
    state,
    selectors,
    customerKaelMemory,
    customerKaelMemoryStatus,
    customerProfileInsights,
    customerAvatarUrl,
    customerWorkerCandidate,
    customerWorkerCandidateBusy,
    customerWorkerCandidateError,
    customerScopeDecisionBusyId,
    workerEarnings,
    workerEarningsError,
    workerJobs,
    workerJobsHydrated,
    workerPerformanceInsights,
    workerPayoutMethod,
    workerProfile,
    workerWithdrawalRequests,
    notifications,
    notificationUnreadCount,
    dispatch,
    actions,
  }
}

function FrontendWorkflowProviderValue({ children }: { children: ReactNode }) {
  const value = useFrontendWorkflowValue()

  return (
    <FrontendWorkflowContext.Provider value={value}>
      {children}
    </FrontendWorkflowContext.Provider>
  )
}

export function FrontendWorkflowProvider({ children }: { children: ReactNode }) {
  const { guestMode, role, session } = useAuth()
  const isolationKey = `${session?.user.id ?? 'anonymous'}:${role ?? 'unresolved'}:${guestMode ? 'guest' : 'account'}`

  return (
    <FrontendWorkflowProviderValue key={isolationKey}>
      {children}
    </FrontendWorkflowProviderValue>
  )
}

export function useFrontendWorkflow() {
  const value = use(FrontendWorkflowContext)
  if (!value) {
    throw new Error('useFrontendWorkflow must be used inside FrontendWorkflowProvider')
  }
  return value
}
