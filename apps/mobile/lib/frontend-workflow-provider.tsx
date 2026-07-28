import { createContext, use, useCallback, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react'
import { AppState } from 'react-native'
import {
  createInitialLocalWorkflowState,
  localWorkflowReducer,
  selectLocalWorkflow,
  type CustomerKaelMemoryPreferenceUpdateInput,
  type CustomerScopeDecisionInput,
  type LocalDealDraft,
  type LocalWorkflowAction,
  type LocalWorkflowSelectors,
  type LocalWorkflowState,
  type ReviewInput,
  type WorkerRegisterInput,
  type WorkerServiceAreaUpdateInput,
  type WorkerServicePreferencesUpdateInput,
} from '@nestscout/shared'
import type { PendingClientRequestId } from './client-request-id'
import { useAuth } from './auth-provider'
import type { LocalMediaUploadDraft } from './media-upload'
import { subscribeToJobStatus, subscribeToWorkerBroadcasts } from './realtime'
import type {
  CustomerProfileInsightsResponse,
  EarningsResponse,
  KaelMemorySelfViewResponse,
  NotificationListResponse,
  WorkerCancellationRequestInput,
  WorkerJobListResponse,
  WorkerPayoutMethodSaveInput,
  WorkerPerformanceInsightsResponse,
  WorkerProfileResponse,
  WorkerCandidateView,
  JobIncidentResponse,
} from './api-types'
import { useAppLanguage } from './app-language'
import { localizeWorkflowError } from './frontend-workflow/errors'
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

export type CustomerKaelMemoryPreferenceUpdateResult = {
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
  hydrateRemoteJobById: (jobId: string) => Promise<boolean>
  confirmRemoteSearch: (jobIdOverride?: string) => Promise<boolean>
  cancelRemoteJob: () => Promise<boolean>
  refreshCurrentJob: () => Promise<boolean>
  workerRefresh: () => Promise<boolean>
  workerAcceptBroadcast: (jobId?: string) => Promise<boolean>
  workerDeclineBroadcast: () => Promise<boolean>
  workerUpdateStatus: WorkerOnsiteActions['workerUpdateStatus']
  requestScopeChange: (input: WorkerScopeChangeDraftInput) => Promise<boolean>
  getKaelJobIncident: () => Promise<JobIncidentResponse | false>
  openKaelJobIncident: (input: WorkerScopeChangeDraftInput) => Promise<JobIncidentResponse | false>
  proposeScopeChangeFromKaelIncident: () => Promise<boolean>
  requestWorkerCancellation: (input: WorkerCancellationRequestInput) => Promise<boolean>
  workerSubmitRegistration: (input: WorkerRegisterInput) => Promise<boolean>
  decideScopeChange: (scopeChangeId: string, input: CustomerScopeDecisionInput) => Promise<boolean>
  customerConfirmCompletion: () => Promise<boolean>
  createPaymentIntent: () => Promise<boolean>
  confirmStagingPayment: () => Promise<boolean>
  authorizeApartmentAccess: () => Promise<boolean>
  submitReview: (input: Omit<ReviewInput, 'job_id'>) => Promise<boolean>
  workerUpdateAvailability: (isAvailable: boolean) => Promise<boolean>
  workerUpdateServiceArea: (input: WorkerServiceAreaUpdateInput) => Promise<boolean>
  workerUpdateServicePreferences: (input: WorkerServicePreferencesUpdateInput) => Promise<boolean>
  workerUploadAvatar: (input: WorkerAvatarDraft) => Promise<boolean>
  workerSavePayoutMethod: (input: WorkerPayoutMethodSaveInput) => Promise<boolean | WorkerPayoutMethodSaveResult>
  refreshNotifications: () => Promise<boolean>
  markNotificationRead: (notificationId: string) => Promise<boolean>
  refreshCustomerKaelMemory: () => Promise<boolean>
  updateCustomerKaelMemoryPreference: (input: CustomerKaelMemoryPreferenceUpdateInput) => Promise<boolean | CustomerKaelMemoryPreferenceUpdateResult>
  refreshCustomerProfileInsights: () => Promise<boolean>
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
  customerWorkerCandidate: WorkerCandidateView | null
  customerWorkerCandidateBusy: boolean
  customerWorkerCandidateError: string | null
  customerScopeDecisionBusyId: string | null
  workerEarnings: EarningsResponse | null
  workerJobs: WorkerJobListResponse['jobs']
  workerJobsHydrated: boolean
  workerPerformanceInsights: WorkerPerformanceInsightsResponse | null
  workerProfile: WorkerProfileResponse | null
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
  const stateRef = useRef(state)
  const pendingJobCreateClientRequestRef = useRef<PendingClientRequestId | null>(null)
  const pendingDirectScopeChangeClientRequestRef = useRef<PendingClientRequestId | null>(null)
  const pendingIncidentOpenClientRequestRef = useRef<PendingClientRequestId | null>(null)
  const pendingScopeProposalClientRequestRef = useRef<PendingClientRequestId | null>(null)
  const pendingRequestOwnerRef = useRef(sessionUserId)
  if (pendingRequestOwnerRef.current !== sessionUserId) {
    pendingRequestOwnerRef.current = sessionUserId
    pendingJobCreateClientRequestRef.current = null
    pendingDirectScopeChangeClientRequestRef.current = null
    pendingIncidentOpenClientRequestRef.current = null
    pendingScopeProposalClientRequestRef.current = null
  }
  // Holds the latest refresh callbacks so realtime/AppState effects can stay
  // subscribed across callback-identity changes (no channel churn) while always
  // invoking the freshest closure. Populated by the sync effect below once the
  // callbacks are defined.
  const liveRefreshRef = useRef<{
    refreshCurrentJob: () => Promise<boolean>
    workerRefresh: () => Promise<boolean>
    refreshNotifications: () => Promise<boolean>
    hydrateCustomerActiveJob: () => Promise<boolean>
  } | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const broadcast = state.deal?.broadcast
  const remoteJobId = getRemoteJobId(state)
  const customerStatus = state.deal?.status

  const setRemoteError = useCallback((error: string) => {
    dispatch({ type: 'set_workflow_error', error: localizeWorkflowError(error, language) })
    return false
  }, [language])

  const {
    notifications,
    notificationUnreadCount,
    refreshNotifications,
    markNotificationRead,
  } = useNotificationActions({ role, sessionUserId, setRemoteError })

  const {
    customerKaelMemory,
    customerKaelMemoryStatus,
    refreshCustomerKaelMemory,
    updateCustomerKaelMemoryPreference,
  } = useCustomerKaelMemoryActions({ role, sessionUserId, setRemoteError })

  const {
    customerProfileInsights,
    refreshCustomerProfileInsights,
  } = useCustomerProfileInsightsActions({ role, sessionUserId })

  const {
    cancelRemoteJob,
    confirmRemoteSearch,
    createRemoteJobFromDraft,
    hydrateCustomerActiveJob,
    hydrateRemoteJobById,
    refreshCurrentJob,
  } = useCustomerJobActions({
    dispatch,
    language,
    pendingJobCreateClientRequestRef,
    role,
    sessionUserId,
    setRemoteError,
    stateRef,
  })

  const {
    workerAcceptBroadcast,
    workerDeclineBroadcast,
    workerEarnings,
    workerJobs,
    workerJobsHydrated,
    workerPerformanceInsights,
    workerProfile,
    workerRefresh,
    workerSavePayoutMethod,
    workerSubmitRegistration,
    workerUpdateAvailability,
    workerUpdateServiceArea,
    workerUpdateServicePreferences,
    workerUploadAvatar,
  } = useWorkerBoardActions({
    dispatch,
    refreshCurrentJob,
    role,
    sessionUserId,
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
    role,
    sessionUserId,
    stateRef,
  })

  const {
    customerScopeDecisionBusyId,
    decideScopeChange,
    getKaelJobIncident,
    openKaelJobIncident,
    proposeScopeChangeFromKaelIncident,
    requestScopeChange,
  } = useScopeChangeActions({
    pendingDirectScopeChangeClientRequestRef,
    pendingIncidentOpenClientRequestRef,
    pendingScopeProposalClientRequestRef,
    refreshCurrentJob,
    setRemoteError,
    stateRef,
  })

  const {
    authorizeApartmentAccess,
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
    confirmStagingPayment,
    createPaymentIntent,
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
    cancelRemoteJob,
    hydrateRemoteJobById,
    refreshCurrentJob,
    workerRefresh,
    workerAcceptBroadcast,
    workerDeclineBroadcast,
    workerUpdateStatus,
    requestScopeChange,
    getKaelJobIncident,
    openKaelJobIncident,
    proposeScopeChangeFromKaelIncident,
    requestWorkerCancellation,
    workerSubmitRegistration,
    decideScopeChange,
    customerConfirmCompletion,
    createPaymentIntent,
    confirmStagingPayment,
    authorizeApartmentAccess,
    submitReview,
    workerUpdateAvailability,
    workerUpdateServiceArea,
    workerUpdateServicePreferences,
    workerUploadAvatar,
    workerSavePayoutMethod,
    refreshNotifications,
    markNotificationRead,
    refreshCustomerKaelMemory,
    updateCustomerKaelMemoryPreference,
    refreshCustomerProfileInsights,
    refreshWorkerCandidate,
    decideWorkerCandidate,
    setWorkerCandidateFavorite,
  }), [
    authorizeApartmentAccess,
    cancelRemoteJob,
    confirmRemoteSearch,
    createRemoteJobFromDraft,
    customerConfirmCompletion,
    createPaymentIntent,
    confirmStagingPayment,
    decideScopeChange,
    decideWorkerCandidate,
    setWorkerCandidateFavorite,
    hydrateRemoteJobById,
    refreshCurrentJob,
    refreshNotifications,
    refreshCustomerKaelMemory,
    refreshCustomerProfileInsights,
    refreshWorkerCandidate,
    updateCustomerKaelMemoryPreference,
    markNotificationRead,
    requestScopeChange,
    getKaelJobIncident,
    openKaelJobIncident,
    proposeScopeChangeFromKaelIncident,
    requestWorkerCancellation,
    submitReview,
    workerAcceptBroadcast,
    workerDeclineBroadcast,
    workerRefresh,
    workerSavePayoutMethod,
    workerSubmitRegistration,
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
    }
  }, [refreshCurrentJob, workerRefresh, refreshNotifications, hydrateCustomerActiveJob])

  // Refresh immediately on foreground; polling and realtime can otherwise leave
  // a stale timeline/notification visible until their next interval/event.
  useEffect(() => {
    if (!sessionUserId || !role) return
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return
      const live = liveRefreshRef.current
      if (!live) return
      void live.refreshNotifications()
      if (role === 'customer' || role === 'admin') {
        if (getRemoteJobId(stateRef.current)) void live.refreshCurrentJob()
        else void live.hydrateCustomerActiveJob()
      }
      if (role === 'worker' || role === 'admin') void live.workerRefresh()
    })
    return () => subscription.remove()
  }, [role, sessionUserId])

  // Realtime surfaces incoming broadcasts quickly; polling remains the fallback
  // and RLS scopes the channel to this worker's own rows.
  useEffect(() => {
    if (!sessionUserId || (role !== 'worker' && role !== 'admin')) return
    const handle = subscribeToWorkerBroadcasts(sessionUserId, () => {
      void liveRefreshRef.current?.workerRefresh()
    })
    return () => {
      void handle?.unsubscribe()?.catch(() => {})
    }
  }, [role, sessionUserId])

  const customerTimelineActive =
    (role === 'customer' || role === 'admin') &&
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
    customerWorkerCandidate,
    customerWorkerCandidateBusy,
    customerWorkerCandidateError,
    customerScopeDecisionBusyId,
    workerEarnings,
    workerJobs,
    workerJobsHydrated,
    workerPerformanceInsights,
    workerProfile,
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
