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
  WorkerBroadcast,
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
import { localizeWorkflowError, type WorkflowErrorHandler } from './frontend-workflow/errors'
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
import {
  useWorkerBoardActions,
  type WorkerMatchingDeliveryView,
  type WorkerProposalOpportunityView,
} from './frontend-workflow/use-worker-board-actions'
import { useWorkerOnsiteActions } from './frontend-workflow/use-worker-onsite-actions'
import { useWorkerCandidateActions } from './frontend-workflow/use-worker-candidate-actions'

// Active worker job statuses whose next change can come from the customer, Kael, or payment
// reconciliation; the 20-second worker poll stays the fallback.
const WORKER_LIVE_JOB_STATUSES = new Set([
  'worker_candidate_pending',
  'worker_matched',
  'worker_on_way',
  'arrived',
  'inspecting',
  'repairing',
  'scope_change_pending',
  'completed_by_worker',
  'confirmed_by_customer',
  'payment_pending',
])

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
  confirmRemoteSearch: (jobIdOverride?: string, sessionId?: string) => Promise<boolean>
  listFavoriteWorkersForMatching: () => Promise<FavoriteWorkerForMatching[] | null>
  setMatchingPreference: (input: Omit<JobMatchingPreferenceInput, 'client_request_id'>) => Promise<boolean>
  cancelRemoteJob: () => Promise<boolean>
  refreshCurrentJob: () => Promise<boolean>
  workerRefresh: () => Promise<boolean>
  workerAcceptBroadcast: (jobId?: string) => Promise<boolean>
  workerMarkBroadcastSeen: (broadcastId: string) => Promise<boolean>
  workerSubmitBroadcastProposal: (input: import('./api-types').WorkerBroadcastProposalInput) => Promise<boolean>
  workerDeclineBroadcast: () => Promise<boolean>
  workerSelectBroadcast: (broadcastId: string) => boolean
  workerUpdateStatus: WorkerOnsiteActions['workerUpdateStatus']
  requestScopeChange: (input: WorkerScopeChangeDraftInput) => Promise<boolean>
  getKaelJobIncident: (jobIdOverride?: string) => Promise<JobIncidentResponse | false>
  openKaelJobIncident: (input: WorkerScopeChangeDraftInput) => Promise<JobIncidentResponse | false>
  previewScopeChangeFromKaelIncident: () => Promise<JobIncidentScopePricePreviewResponse | false>
  proposeScopeChangeFromKaelIncident: (quoteId: string) => Promise<boolean>
  requestWorkerCancellation: (input: WorkerCancellationRequestInput) => Promise<boolean>
    workerSubmitRegistration: (input: WorkerRegistrationDraftInput) => Promise<boolean>
    workerReconcileRegistration: () => Promise<boolean>
  workerSaveRegistrationDraft: (input: WorkerRegistrationDraftInput) => Promise<boolean>
  decideScopeChange: (scopeChangeId: string, input: CustomerScopeDecisionInput) => Promise<boolean>
  customerConfirmCompletion: () => Promise<boolean>
  createManualBankPaymentOrder: () => Promise<boolean>
  claimManualBankPayment: (sendingBank?: string) => Promise<boolean>
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
  saveCustomerDefaultAddress: (defaultAddress: string) => Promise<boolean>
  refreshCustomerAvatar: () => Promise<boolean>
  customerUploadAvatar: (input: CustomerAvatarDraft) => Promise<boolean>
  refreshWorkerCandidate: (jobId?: string) => Promise<boolean>
  decideWorkerCandidate: (decision: 'confirm' | 'reject') => Promise<boolean>
  setWorkerCandidateFavorite: (isFavorite: boolean) => Promise<boolean>
}

type FrontendWorkflowContextValue = {
  customerApartmentAccessState: ReturnType<typeof useCustomerJobActions>['customerApartmentAccessState']
  customerMatchingRetryFeedback: ReturnType<typeof useCustomerJobActions>['customerMatchingRetryFeedback']
  customerMatchingSelectionFeedback: ReturnType<typeof useCustomerJobActions>['customerMatchingSelectionFeedback']
  customerMatchingSelectionState: ReturnType<typeof useCustomerJobActions>['customerMatchingSelectionState']
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
  workerBroadcasts: WorkerBroadcast[]
  workerBroadcastsError: string | null
  workerBroadcastsHydrated: boolean
  workerJobs: WorkerJobListResponse['jobs']
  workerJobsHydrated: boolean
  workerMatchingDelivery: WorkerMatchingDeliveryView | null
  workerProposalOpportunity: WorkerProposalOpportunityView | null
  workerPerformanceInsights: WorkerPerformanceInsightsResponse | null
  workerPayoutMethod: WorkerPayoutMethod | null
  workerProfile: WorkerProfileResponse | null
  workerRegistrationRecovery: import('./frontend-workflow/worker-registration-recovery').WorkerRegistrationRecoveryView
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
    reconcilePendingConfirmations: () => Promise<boolean>
    refreshCustomerAvatar: () => Promise<boolean>
  } | null>(null)

  useEffect(() => {
    if (pendingRequestOwnerRef.current === sessionUserId) return
    pendingRequestOwnerRef.current = sessionUserId
    pendingJobCreateClientRequestRef.current = null
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

  const setRemoteError = useCallback<WorkflowErrorHandler>((error, code) => {
    dispatch({ type: 'set_workflow_error', error: localizeWorkflowError(error, language, code) })
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
    saveCustomerDefaultAddress,
  } = useCustomerProfileInsightsActions({ role: remoteRole, sessionUserId: remoteSessionUserId })

  const {
    customerAvatarUrl,
    customerUploadAvatar,
    refreshCustomerAvatar,
  } = useCustomerAvatarActions({ role: remoteRole, sessionUserId: remoteSessionUserId, setRemoteError })

  const {
    cancelRemoteJob,
    authorizeApartmentAccess,
    customerApartmentAccessState,
    confirmRemoteSearch,
    customerMatchingRetryFeedback,
    customerMatchingSelectionFeedback,
    customerMatchingSelectionState,
    createRemoteJobFromDraft,
    hydrateCustomerActiveJob,
    hydrateRemoteJobById,
    listFavoriteWorkersForMatching,
    reconcilePendingConfirmations,
    refreshCurrentJob,
    setMatchingPreference,
  } = useCustomerJobActions({
    dispatch,
    language,
    pendingJobCreateClientRequestRef,
    role: remoteRole,
    sessionAccessToken: localVisualAuditSession ? undefined : session?.access_token,
    sessionUserId: remoteSessionUserId,
    setRemoteError,
    stateRef,
  })

  const {
    workerAcceptBroadcast,
    workerDeclineBroadcast,
    workerBroadcasts,
    workerBroadcastsError,
    workerBroadcastsHydrated,
    workerEarnings,
    workerEarningsError,
    workerJobs,
    workerJobsHydrated,
    workerMarkBroadcastSeen,
    workerMatchingDelivery,
    workerProposalOpportunity,
    workerPerformanceInsights,
    workerPayoutMethod,
    workerProfile,
    workerRefresh,
    workerSelectBroadcast,
    workerRequestWithdrawal,
    workerSavePayoutMethod,
    workerSubmitRegistration,
    workerSaveRegistrationDraft,
    workerRegistrationRecovery,
    workerReconcileRegistration,
    workerSubmitBroadcastProposal,
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
    sessionAccessToken: localVisualAuditSession ? undefined : session?.access_token,
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
    dispatch,
    language,
    remoteJobId,
    role: remoteRole,
    sessionUserId: remoteSessionUserId,
    sessionAccessToken: localVisualAuditSession ? undefined : session?.access_token,
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
    requestWorkerCancellation,
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
    createManualBankPaymentOrder,
    customerConfirmCompletion,
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
    workerMarkBroadcastSeen,
    workerSubmitBroadcastProposal,
    workerDeclineBroadcast,
    workerSelectBroadcast,
    workerUpdateStatus,
    requestScopeChange,
    getKaelJobIncident,
    openKaelJobIncident,
    previewScopeChangeFromKaelIncident,
    proposeScopeChangeFromKaelIncident,
    requestWorkerCancellation,
    workerSubmitRegistration,
      workerSaveRegistrationDraft,
      workerReconcileRegistration,
    decideScopeChange,
    customerConfirmCompletion,
    createManualBankPaymentOrder,
    claimManualBankPayment,
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
    saveCustomerDefaultAddress,
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
    claimManualBankPayment,
    decideScopeChange,
    decideWorkerCandidate,
    setWorkerCandidateFavorite,
    setMatchingPreference,
    hydrateRemoteJobById,
    refreshCurrentJob,
    refreshNotifications,
    refreshCustomerKaelMemory,
    refreshCustomerProfileInsights,
    saveCustomerDefaultAddress,
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
    workerMarkBroadcastSeen,
    workerSubmitBroadcastProposal,
    workerDeclineBroadcast,
    workerSelectBroadcast,
    workerRefresh,
    workerSavePayoutMethod,
    workerRequestWithdrawal,
    workerSubmitRegistration,
    workerSaveRegistrationDraft,
    workerReconcileRegistration,
    workerUpdateAvailability,
    workerUpdateServiceArea,
    workerUpdateServicePreferences,
    workerUploadAvatar,
    workerUpdateStatus,
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
      reconcilePendingConfirmations,
      refreshCustomerAvatar,
    }
  }, [
    refreshCurrentJob,
    workerRefresh,
    refreshNotifications,
    hydrateCustomerActiveJob,
    reconcilePendingConfirmations,
    refreshCustomerAvatar,
  ])

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
        if (remoteRole === 'customer') void live.reconcilePendingConfirmations()
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

  // RLS releases the job row to the worker once jobs.worker_id is set, so the customer's
  // candidate confirmation is the first event a candidate-pending worker receives.
  const workerJobLive = remoteRole === 'worker'
    && !!remoteJobId
    && WORKER_LIVE_JOB_STATUSES.has(state.deal?.backendStatus ?? state.deal?.status ?? '')

  useEffect(() => {
    if (!workerJobLive || !remoteJobId) return
    const handle = subscribeToJobStatus(remoteJobId, () => {
      void liveRefreshRef.current?.workerRefresh()
    })
    return () => {
      void handle?.unsubscribe()?.catch(() => {})
    }
  }, [workerJobLive, remoteJobId])

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
    customerApartmentAccessState,
    selectors,
    customerMatchingRetryFeedback,
    customerMatchingSelectionFeedback,
    customerMatchingSelectionState,
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
    workerBroadcasts,
    workerBroadcastsError,
    workerBroadcastsHydrated,
    workerJobs,
    workerJobsHydrated,
    workerMatchingDelivery,
    workerProposalOpportunity,
    workerPerformanceInsights,
    workerPayoutMethod,
    workerProfile,
    workerRegistrationRecovery,
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
