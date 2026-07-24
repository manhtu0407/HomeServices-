import { createContext, use, useCallback, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from 'react'
import { AppState } from 'react-native'
import {
  createInitialLocalWorkflowState,
  extractKnownDistrictLabel,
  localWorkflowReducer,
  selectLocalWorkflow,
  toLocalDealStatus,
  type CustomerKaelMemoryPreferenceUpdateInput,
  type CustomerScopeDecisionInput,
  type JobCreateInput,
  type JobStatus,
  type LocalDealDraft,
  type LocalWorkflowAction,
  type LocalWorkflowSelectors,
  type LocalWorkflowState,
  type ReviewInput,
  type WorkerRegisterInput,
  type WorkerServiceAreaUpdateInput,
  type WorkerServicePreferencesUpdateInput,
  type WorkerScopeChangeInput,
} from '@nestscout/shared'
import { useAuth } from './auth-provider'
import {
  localizeMediaUploadFailure,
  uploadJobMediaDrafts,
  type LocalMediaUploadDraft,
} from './media-upload'
import { customerProfileService, jobService, kaelMemoryService, notificationService, workerService } from './services'
import { subscribeToJobStatus, subscribeToWorkerBroadcasts } from './realtime'
import {
  clearStableClientRequestId,
  stableClientRequestId,
  type PendingClientRequestId,
} from './client-request-id'
import type { ApiResult } from './api'
import type {
  CustomerProfileInsightsResponse,
  EarningsResponse,
  JobDetailResponse,
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
import {
  sameCustomerProfileInsights,
  sameWorkerEarnings,
  sameWorkerJobs,
  sameWorkerPerformanceInsights,
  sameWorkerProfile,
} from './frontend-workflow/comparisons'
import { localizeWorkflowError } from './frontend-workflow/errors'
import { uploadWorkerAvatar, type WorkerAvatarDraft } from './worker-avatar-upload'
import {
  ACTIVE_TIMELINE_STATUSES,
  currentWorkerMonthRange,
  defaultCustomerCancellationInput,
  getRemoteJobId,
  hasStaleRemoteBroadcast,
  isWorkerCurrentJobStatus,
  isStaleBroadcastError,
  jobCreateClientRequestFingerprint,
  mergeCustomerKaelMemoryPermission,
  readCustomerKaelMemoryPermission,
  scopeChangeClientRequestFingerprint,
  usesBeforeAcceptCancelEndpoint,
} from './frontend-workflow/helpers'
import {
  initialNotificationState,
  markNotificationListRead,
  notificationStateReducer,
} from './frontend-workflow/notifications'
import {
  confirmSearchToSnapshot,
  createJobResponseToSnapshot,
  dealToSnapshot,
  jobDetailToSnapshot,
  workerBroadcastToSnapshot,
  workerJobToSnapshot,
} from './frontend-workflow/snapshots'

type WorkerStatusUpdate = Extract<JobStatus, 'worker_on_way' | 'arrived' | 'inspecting' | 'repairing' | 'completed_by_worker'>
type WorkerAccessCheckInInput = {
  mode: 'geofence' | 'manual_photo'
  lat?: number
  lng?: number
  accuracy_m?: number
  photo_urls?: string[]
  note?: string
  checked_in_at?: string
}

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

type WorkerScopeChangeDraftInput = Omit<WorkerScopeChangeInput, 'client_request_id'> & {
  client_request_id?: string
}

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
  workerAcceptBroadcast: () => Promise<boolean>
  workerDeclineBroadcast: () => Promise<boolean>
  workerUpdateStatus: (
    status: WorkerStatusUpdate,
    extras?: { completion_notes?: string; completion_photo_urls?: string[]; access_check_in?: WorkerAccessCheckInInput },
  ) => Promise<boolean>
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

type CustomerKaelMemoryStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

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

type WorkerRemoteState = {
  earnings: EarningsResponse | null
  jobs: WorkerJobListResponse['jobs']
  jobsHydrated: boolean
  performanceInsights: WorkerPerformanceInsightsResponse | null
  profile: WorkerProfileResponse | null
  sessionUserId: string | null
}

type CustomerKaelMemoryState = {
  memory: KaelMemorySelfViewResponse['memory'] | null
  sessionUserId: string | null
  status: CustomerKaelMemoryStatus
}

type CustomerProfileInsightsState = {
  insights: CustomerProfileInsightsResponse | null
  sessionUserId: string | null
}

type CustomerWorkerCandidateState = {
  candidate: WorkerCandidateView | null
  busy: boolean
  error: string | null
}

const initialWorkerRemoteState: WorkerRemoteState = {
  earnings: null,
  jobs: [],
  jobsHydrated: false,
  performanceInsights: null,
  profile: null,
  sessionUserId: null,
}

const initialCustomerKaelMemoryState: CustomerKaelMemoryState = {
  memory: null,
  sessionUserId: null,
  status: 'idle',
}

const initialCustomerProfileInsightsState: CustomerProfileInsightsState = {
  insights: null,
  sessionUserId: null,
}

const initialCustomerWorkerCandidateState: CustomerWorkerCandidateState = {
  candidate: null,
  busy: false,
  error: null,
}

const FrontendWorkflowContext = createContext<FrontendWorkflowContextValue | null>(null)
const isAppForeground = () => AppState.currentState === 'active'

function useFrontendWorkflowValue(): FrontendWorkflowContextValue {
  const { role, session } = useAuth()
  const language = useAppLanguage()
  const [state, dispatch] = useReducer(localWorkflowReducer, undefined, createInitialLocalWorkflowState)
  const selectors = useMemo(() => selectLocalWorkflow(state), [state])
  const sessionUserId = session?.user.id ?? null
  const stateRef = useRef(state)
  const workerAvailabilityPreferenceRef = useRef<{ sessionUserId: string | null; value: boolean } | null>(null)
  const workerRefreshRequestIdRef = useRef(0)
  const workerActivityHeartbeatBusyRef = useRef(false)
  const [workerRemoteState, setWorkerRemoteState] = useState<WorkerRemoteState>(initialWorkerRemoteState)
  const workerProfile = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.profile : null
  const workerEarnings = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.earnings : null
  const workerJobs = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.jobs : []
  const workerJobsHydrated = workerRemoteState.sessionUserId === sessionUserId && workerRemoteState.jobsHydrated
  const workerPerformanceInsights = workerRemoteState.sessionUserId === sessionUserId ? workerRemoteState.performanceInsights : null
  const [customerKaelMemoryState, setCustomerKaelMemoryState] = useState<CustomerKaelMemoryState>(initialCustomerKaelMemoryState)
  const customerKaelMemory = customerKaelMemoryState.sessionUserId === sessionUserId ? customerKaelMemoryState.memory : null
  const customerKaelMemoryStatus = customerKaelMemoryState.sessionUserId === sessionUserId ? customerKaelMemoryState.status : 'idle'
  const [customerProfileInsightsState, setCustomerProfileInsightsState] = useState<CustomerProfileInsightsState>(initialCustomerProfileInsightsState)
  const customerProfileInsights = customerProfileInsightsState.sessionUserId === sessionUserId ? customerProfileInsightsState.insights : null
  const [customerWorkerCandidateState, setCustomerWorkerCandidateState] = useState<CustomerWorkerCandidateState>(initialCustomerWorkerCandidateState)
  const customerWorkerCandidate = customerWorkerCandidateState.candidate
  const customerWorkerCandidateBusy = customerWorkerCandidateState.busy
  const customerWorkerCandidateError = customerWorkerCandidateState.error
  const [customerScopeDecisionBusyId, setCustomerScopeDecisionBusyId] = useState<string | null>(null)
  const customerScopeDecisionBusyRef = useRef<string | null>(null)
  const [notificationState, setNotificationState] = useReducer(notificationStateReducer, initialNotificationState)
  const { notifications, unreadCount: notificationUnreadCount } = notificationState
  const notificationsRef = useRef<NotificationListResponse['notifications']>([])
  const locallyReadNotificationIdsRef = useRef<Set<string> | null>(null)
  if (locallyReadNotificationIdsRef.current === null) {
    locallyReadNotificationIdsRef.current = new Set<string>()
  }
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

  useEffect(() => {
    notificationsRef.current = notifications
  }, [notifications])

  const setRemoteError = useCallback((error: string) => {
    dispatch({ type: 'set_workflow_error', error: localizeWorkflowError(error, language) })
    return false
  }, [language])

  const hydrateJobResult = useCallback((result: ApiResult<JobDetailResponse>) => {
    if (!result.success) return setRemoteError(result.error)
    dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(result.data, role === 'worker' || role === 'admin') })
    return true
  }, [role, setRemoteError])

  const hydrateRemoteJobById = useCallback(async (jobId: string) => {
    if (!jobId) return setRemoteError('Chưa có yêu cầu để tải lại')
    return hydrateJobResult(await jobService.getJob(jobId))
  }, [hydrateJobResult, setRemoteError])

  const refreshCurrentJob = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Chưa có yêu cầu để tải lại')
    return hydrateJobResult(await jobService.getJob(jobId))
  }, [hydrateJobResult, setRemoteError])

  const refreshWorkerCandidate = useCallback(async (jobIdOverride?: string) => {
    const jobId = jobIdOverride ?? getRemoteJobId(stateRef.current)
    if (!jobId) {
      setCustomerWorkerCandidateState({
        busy: false,
        candidate: null,
        error: language === 'vi' ? 'Chưa có công việc để tải hồ sơ thợ.' : 'There is no job to load a worker profile for.',
      })
      return false
    }
    setCustomerWorkerCandidateState((current) => ({ ...current, busy: true, error: null }))
    const result = await jobService.getWorkerCandidate(jobId)
    if (!result.success) {
      setCustomerWorkerCandidateState({
        busy: false,
        candidate: null,
        error: localizeWorkflowError(result.error, language),
      })
      return false
    }
    setCustomerWorkerCandidateState({ busy: false, candidate: result.data.candidate, error: null })
    return true
  }, [language])

  const decideWorkerCandidate = useCallback(async (decision: 'confirm' | 'reject') => {
    const jobId = getRemoteJobId(stateRef.current)
    const candidateId = customerWorkerCandidate?.candidate_id
    if (!jobId || !candidateId || customerWorkerCandidateBusy) return false
    setCustomerWorkerCandidateState((current) => ({ ...current, busy: true, error: null }))
    const result = decision === 'confirm'
      ? await jobService.confirmWorkerCandidate(jobId, candidateId)
      : await jobService.rejectWorkerCandidate(jobId, candidateId)
    if (!result.success) {
      setCustomerWorkerCandidateState((current) => ({
        ...current,
        busy: false,
        error: localizeWorkflowError(result.error, language),
      }))
      return false
    }
    const decidedCandidate = decision === 'confirm' ? result.data.candidate : null
    const hydrated = await hydrateRemoteJobById(jobId)
    setCustomerWorkerCandidateState({
      busy: false,
      candidate: decidedCandidate,
      error: hydrated
        ? null
        : language === 'vi'
          ? 'Đã ghi nhận quyết định nhưng chưa đồng bộ trạng thái mới.'
          : 'Your decision was saved, but the new state has not synced yet.',
    })
    return true
  }, [customerWorkerCandidate?.candidate_id, customerWorkerCandidateBusy, hydrateRemoteJobById, language])

  const setWorkerCandidateFavorite = useCallback(async (isFavorite: boolean) => {
    const workerId = customerWorkerCandidate?.worker_id
    if (!workerId || customerWorkerCandidateBusy) return false
    setCustomerWorkerCandidateState((current) => ({ ...current, busy: true, error: null }))
    const result = await jobService.setFavoriteWorker(workerId, isFavorite)
    if (!result.success) {
      setCustomerWorkerCandidateState((current) => ({
        ...current,
        busy: false,
        error: localizeWorkflowError(result.error, language),
      }))
      return false
    }
    setCustomerWorkerCandidateState((current) => ({
      busy: false,
      candidate: current.candidate
        ? { ...current.candidate, is_favorite: result.data.is_favorite }
        : null,
      error: null,
    }))
    return true
  }, [customerWorkerCandidate?.worker_id, customerWorkerCandidateBusy, language])

  // Hydrate the active job from the backend so refresh/cold start keeps the
  // backend as source of truth without noisy "no active job" banners.
  const hydrateCustomerActiveJob = useCallback(async () => {
    if (getRemoteJobId(stateRef.current)) return true
    const result = await jobService.listMyActiveJob()
    if (!result.success) return false
    if (!result.data.active_job) return true
    dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(result.data.active_job, false) })
    return true
  }, [])

  const createRemoteJobFromDraft = useCallback(async (
    draftOverride?: LocalDealDraft,
    mediaItems: LocalMediaUploadDraft[] = [],
  ) => {
    const draft = draftOverride ?? stateRef.current.deal?.draft
    if (!draft?.serviceType) return setRemoteError('Chọn một trong sáu dịch vụ NestScout hỗ trợ trước khi tạo yêu cầu')
    if (draft.problemChips.length === 0) return setRemoteError('Chọn ít nhất một vấn đề cần xử lý')
    if (draft.description.trim().length < 10) return setRemoteError('Mô tả cần rõ hơn trước khi gửi yêu cầu')
    const districtLabel = extractKnownDistrictLabel(draft.districtLabel) || extractKnownDistrictLabel(draft.addressLabel)
    if (!districtLabel) return setRemoteError('Địa chỉ cần có quận TP.HCM rõ ràng')

    const requestFingerprint = jobCreateClientRequestFingerprint(draft, districtLabel)
    const input: JobCreateInput = {
      service_type: draft.serviceType,
      description: draft.description.trim(),
      problem_chips: draft.problemChips,
      photo_urls: [],
      address_building: draft.addressLabel.trim() || undefined,
      address_district: districtLabel,
      // Re-renders and retries reuse the same key so Edge returns the existing
      // job instead of creating duplicates.
      client_request_id: stableClientRequestId(
        pendingJobCreateClientRequestRef,
        requestFingerprint,
      ),
    }

    const created = await jobService.createJob(input)
    if (!created.success) {
      setRemoteError(created.error)
      return null
    }
    clearStableClientRequestId(pendingJobCreateClientRequestRef, requestFingerprint)
    dispatch({ type: 'hydrate_remote_job', job: createJobResponseToSnapshot(created.data, draft) })
    if (mediaItems.length === 0) return { jobId: created.data.job_id }

    const uploaded = await uploadJobMediaDrafts(created.data.job_id, mediaItems, 'before')
    if (!uploaded.success) {
      const mediaError = localizeMediaUploadFailure(uploaded, language)
      dispatch({ type: 'set_workflow_error', error: mediaError })
      return { jobId: created.data.job_id, mediaError }
    }
    const refreshed = await jobService.getJob(created.data.job_id)
    if (refreshed.success) {
      dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(refreshed.data, false) })
    }
    return { jobId: created.data.job_id }
  }, [language, setRemoteError])

  const confirmRemoteSearch = useCallback(async (jobIdOverride?: string) => {
    const jobId = jobIdOverride ?? getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Chưa có yêu cầu để tìm thợ')
    const confirmed = await jobService.confirmSearch(jobId)
    if (!confirmed.success) return setRemoteError(confirmed.error)

    const existing = stateRef.current.deal
    if (existing) {
      dispatch({
        type: 'hydrate_remote_job',
        job: confirmSearchToSnapshot(confirmed.data, existing),
      })
    }
    if (confirmed.data.broadcast_sent) {
      const refreshed = await jobService.getJob(jobId)
      if (refreshed.success) {
        dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(refreshed.data, false) })
      }
    }
    return true
  }, [setRemoteError])

  const cancelRemoteJob = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) {
      dispatch({ type: 'cancel_deal' })
      return true
    }
    const existing = stateRef.current.deal
    if (existing && !usesBeforeAcceptCancelEndpoint(existing.status)) {
      const requested = await jobService.requestCustomerCancellation(jobId, defaultCustomerCancellationInput(language))
      if (!requested.success) return setRemoteError(requested.error)
      const cancelledByPolicy = requested.data.job_status === 'cancelled'
      dispatch({
        type: 'hydrate_remote_job',
        job: {
          ...dealToSnapshot(existing),
          backendStatus: requested.data.job_status,
          status: toLocalDealStatus(requested.data.job_status),
          broadcast: existing.broadcast
            ? {
                ...existing.broadcast,
                status: cancelledByPolicy ? 'cancelled' : existing.broadcast.status,
                fullAddressVisible: cancelledByPolicy ? false : existing.broadcast.fullAddressVisible,
                fullAddressLabel: cancelledByPolicy ? null : existing.broadcast.fullAddressLabel,
                secondsRemaining: cancelledByPolicy ? 0 : existing.broadcast.secondsRemaining,
              }
            : null,
        },
      })
      await refreshCurrentJob()
      return true
    }
    const cancelled = await jobService.cancelJob(jobId)
    if (!cancelled.success) return setRemoteError(cancelled.error)
    if (existing) {
      dispatch({
        type: 'hydrate_remote_job',
        job: {
          ...dealToSnapshot(existing),
          backendStatus: cancelled.data.status,
          status: toLocalDealStatus(cancelled.data.status),
          broadcast: existing.broadcast
            ? { ...existing.broadcast, status: 'cancelled', fullAddressVisible: false, fullAddressLabel: null }
            : null,
        },
      })
    }
    return true
  }, [language, refreshCurrentJob, setRemoteError])

  const workerRefresh = useCallback(async () => {
    if (role !== 'worker' && role !== 'admin') return true
    const workerRefreshRequestId = workerRefreshRequestIdRef.current + 1
    workerRefreshRequestIdRef.current = workerRefreshRequestId
    const isCurrentWorkerRefresh = () => workerRefreshRequestIdRef.current === workerRefreshRequestId

    const profileRequest = workerService.getProfile()
    const earningsRequest = workerService.getEarnings(currentWorkerMonthRange())
    const performanceInsightsRequest = workerService.getPerformanceInsights()
    const broadcastsRequest = workerService.getBroadcasts()
    const jobsRequest = workerService.getJobs()

    // Incoming work is time-sensitive. Hydrate it as soon as its dedicated
    // request returns instead of waiting for profile and reporting data.
    // react-doctor-disable-next-line react-doctor/async-defer-await
    const broadcasts = await broadcastsRequest
    if (!isCurrentWorkerRefresh()) return true
    const nextBroadcast = broadcasts.success ? broadcasts.data.broadcasts[0] : undefined
    if (nextBroadcast) {
      dispatch({ type: 'hydrate_remote_broadcast', broadcast: workerBroadcastToSnapshot(nextBroadcast) })
    }

    // Job state drives routing and must not wait for profile or reporting data.
    // react-doctor-disable-next-line react-doctor/async-defer-await
    const jobs = await jobsRequest
    if (!isCurrentWorkerRefresh()) return true
    let workflowError = broadcasts.success ? null : broadcasts.error
    if (jobs.success) {
      setWorkerRemoteState((current) => {
        const currentJobs = current.sessionUserId === sessionUserId ? current.jobs : []
        if (current.sessionUserId === sessionUserId && current.jobsHydrated && sameWorkerJobs(currentJobs, jobs.data.jobs)) return current
        return {
          earnings: current.sessionUserId === sessionUserId ? current.earnings : null,
          jobs: jobs.data.jobs,
          jobsHydrated: true,
          performanceInsights: current.sessionUserId === sessionUserId ? current.performanceInsights : null,
          profile: current.sessionUserId === sessionUserId ? current.profile : null,
          sessionUserId,
        }
      })
      const activeJob = jobs.data.jobs.find((job) => isWorkerCurrentJobStatus(job.status))
      const currentJobId = getRemoteJobId(stateRef.current)
      const currentJob = currentJobId ? jobs.data.jobs.find((job) => job.id === currentJobId) : undefined
      if (activeJob) {
        dispatch({ type: 'hydrate_remote_job', job: workerJobToSnapshot(activeJob), workerGate: 'remote_backend' })
      } else if (!nextBroadcast && currentJob) {
        dispatch({ type: 'hydrate_remote_job', job: workerJobToSnapshot(currentJob), workerGate: 'remote_backend' })
      } else if (
        !nextBroadcast
        && stateRef.current.workerGate === 'remote_backend'
        && stateRef.current.deal?.backendStatus === 'worker_candidate_pending'
      ) {
        dispatch({ type: 'reset_workflow' })
      } else if (!nextBroadcast && hasStaleRemoteBroadcast(stateRef.current)) {
        dispatch({ type: 'mark_remote_broadcast_expired' })
      }
    } else if (!nextBroadcast) {
      workflowError = jobs.error
    }

    // The post-I/O generation check prevents an older refresh from committing after a newer refresh starts.
    // react-doctor-disable-next-line react-doctor/async-defer-await
    const [profile, earnings, performanceInsights] = await Promise.all([
      profileRequest,
      earningsRequest,
      performanceInsightsRequest,
    ])
    if (!isCurrentWorkerRefresh()) return true
    if (!profile.success) return setRemoteError(profile.error)

    const nextEarnings = earnings.success ? earnings.data : null
    const nextPerformanceInsights = performanceInsights.success ? performanceInsights.data : null
    const pendingAvailabilityPreference = workerAvailabilityPreferenceRef.current?.sessionUserId === sessionUserId
      ? workerAvailabilityPreferenceRef.current.value
      : null
    const refreshedProfile = pendingAvailabilityPreference === null || profile.data.is_available === pendingAvailabilityPreference
      ? profile.data
      : { ...profile.data, is_available: pendingAvailabilityPreference }
    if (pendingAvailabilityPreference !== null && profile.data.is_available === pendingAvailabilityPreference) {
      workerAvailabilityPreferenceRef.current = null
    }
    setWorkerRemoteState((current) => {
      const currentProfile = current.sessionUserId === sessionUserId ? current.profile : null
      const currentEarnings = current.sessionUserId === sessionUserId ? current.earnings : null
      const currentJobs = current.sessionUserId === sessionUserId ? current.jobs : []
      const currentPerformanceInsights = current.sessionUserId === sessionUserId ? current.performanceInsights : null
      const sameProfile = sameWorkerProfile(currentProfile, refreshedProfile)
      const sameEarnings = nextEarnings ? sameWorkerEarnings(currentEarnings, nextEarnings) : currentEarnings === null
      const samePerformanceInsights = nextPerformanceInsights
        ? sameWorkerPerformanceInsights(currentPerformanceInsights, nextPerformanceInsights)
        : currentPerformanceInsights === null
      return current.sessionUserId === sessionUserId && sameProfile && sameEarnings && samePerformanceInsights
        ? current
        : {
            earnings: nextEarnings,
            jobs: currentJobs,
            jobsHydrated: current.sessionUserId === sessionUserId ? current.jobsHydrated : false,
            performanceInsights: nextPerformanceInsights,
            profile: refreshedProfile,
            sessionUserId,
          }
    })
    if (workflowError) return setRemoteError(workflowError)
    return true
  }, [role, sessionUserId, setRemoteError])

  const workerUpdateAvailability = useCallback(async (
    isAvailable: boolean,
    options: { revalidate?: boolean } = {},
  ) => {
    const updated = await workerService.updateAvailability({ is_available: isAvailable })
    if (!updated.success) return setRemoteError(updated.error)
    workerAvailabilityPreferenceRef.current = { sessionUserId, value: updated.data.is_available }
    setWorkerRemoteState((current) => current.sessionUserId === sessionUserId && current.profile
      ? { ...current, profile: { ...current.profile, is_available: updated.data.is_available } }
      : current)
    if (options.revalidate !== false) void workerRefresh().catch(() => undefined)
    return true
  }, [sessionUserId, setRemoteError, workerRefresh])

  const workerUpdateServiceArea = useCallback(async (input: WorkerServiceAreaUpdateInput) => {
    const updated = await workerService.updateServiceArea(input)
    if (!updated.success) return setRemoteError(updated.error)
    setWorkerRemoteState((current) => ({
      earnings: current.sessionUserId === sessionUserId ? current.earnings : null,
      jobs: current.sessionUserId === sessionUserId ? current.jobs : [],
      jobsHydrated: current.sessionUserId === sessionUserId ? current.jobsHydrated : false,
      performanceInsights: current.sessionUserId === sessionUserId ? current.performanceInsights : null,
      profile: updated.data,
      sessionUserId,
    }))
    await workerRefresh()
    return true
  }, [sessionUserId, setRemoteError, workerRefresh])

  const workerUpdateServicePreferences = useCallback(async (
    input: WorkerServicePreferencesUpdateInput,
  ) => {
    const updated = await workerService.updateServicePreferences(input)
    if (!updated.success) return setRemoteError(updated.error)
    setWorkerRemoteState((current) => ({
      earnings: current.sessionUserId === sessionUserId ? current.earnings : null,
      jobs: current.sessionUserId === sessionUserId ? current.jobs : [],
      jobsHydrated: current.sessionUserId === sessionUserId ? current.jobsHydrated : false,
      performanceInsights: current.sessionUserId === sessionUserId ? current.performanceInsights : null,
      profile: updated.data,
      sessionUserId,
    }))
    await workerRefresh()
    return true
  }, [sessionUserId, setRemoteError, workerRefresh])

  const workerUploadAvatar = useCallback(async (input: WorkerAvatarDraft) => {
    const uploaded = await uploadWorkerAvatar(input)
    if (!uploaded.success) return setRemoteError(uploaded.error)
    setWorkerRemoteState((current) => current.sessionUserId === sessionUserId && current.profile
      ? {
          ...current,
          profile: { ...current.profile, avatar_url: uploaded.data.avatar_url },
        }
      : current)
    return true
  }, [sessionUserId, setRemoteError])

  const workerSavePayoutMethod = useCallback(async (input: WorkerPayoutMethodSaveInput) => {
    const result = await workerService.savePayoutMethod(input)
    if (!result.success) {
      setRemoteError(result.error)
      return {
        success: false as const,
        code: result.code,
        error: result.error,
        status: result.status,
      }
    }
    await workerRefresh()
    return true
  }, [setRemoteError, workerRefresh])

  const workerAcceptBroadcast = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có lời mời việc để nhận')
    const accepted = await workerService.acceptBroadcast(jobId)
    if (!accepted.success) {
      if (isStaleBroadcastError(accepted.code)) dispatch({ type: 'mark_remote_broadcast_expired' })
      return setRemoteError(accepted.error)
    }

    const existing = stateRef.current.deal
    if (existing?.broadcast) {
      dispatch({
        type: 'hydrate_remote_job',
        workerGate: 'remote_backend',
        job: {
          ...dealToSnapshot(existing),
          backendStatus: accepted.data.status,
          status: toLocalDealStatus(accepted.data.status),
          addressLabel: existing.broadcast.generalArea || existing.draft.districtLabel || existing.draft.addressLabel,
          broadcast: {
            ...existing.broadcast,
            status: 'accepted',
            fullAddressVisible: false,
            fullAddressLabel: null,
            addressAccess: null,
            safe_metadata: {
              ...existing.broadcast.safe_metadata,
              candidate_id: accepted.data.candidate_id,
              awaiting_customer_confirmation: accepted.data.awaiting_customer_confirmation,
              already_applied: accepted.data.already_applied,
            },
          },
        },
      })
    } else {
      await refreshCurrentJob()
    }
    return true
  }, [refreshCurrentJob, setRemoteError])

  const workerDeclineBroadcast = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có lời mời việc để từ chối')
    const declined = await workerService.declineBroadcast(jobId)
    if (!declined.success) {
      if (isStaleBroadcastError(declined.code)) dispatch({ type: 'mark_remote_broadcast_expired' })
      return setRemoteError(declined.error)
    }
    dispatch({ type: 'worker_decline_broadcast' })
    await workerRefresh()
    return true
  }, [setRemoteError, workerRefresh])

  const workerUpdateStatus = useCallback<FrontendWorkflowActions['workerUpdateStatus']>(async (status, extras) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để cập nhật')
    const updated = await workerService.updateJobStatus(jobId, status, extras)
    if (!updated.success) return setRemoteError(updated.error)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError])

  const requestScopeChange = useCallback(async (input: WorkerScopeChangeDraftInput) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để đổi phạm vi')
    const requestFingerprint = scopeChangeClientRequestFingerprint(jobId, input)
    const result = await workerService.requestScopeChange(jobId, {
      ...input,
      client_request_id: stableClientRequestId(
        pendingDirectScopeChangeClientRequestRef,
        requestFingerprint,
      ),
      new_description: input.new_description.trim(),
      reason: input.reason.trim(),
    })
    if (!result.success) return setRemoteError(result.error)
    clearStableClientRequestId(pendingDirectScopeChangeClientRequestRef, requestFingerprint)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError])

  const getKaelJobIncident = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return false
    const result = await workerService.getKaelJobIncident(jobId)
    if (!result.success) {
      setRemoteError(result.error)
      return false
    }
    return result.data
  }, [setRemoteError])

  const openKaelJobIncident = useCallback(async (input: WorkerScopeChangeDraftInput) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) {
      setRemoteError('Không có yêu cầu để mở Kael Công việc')
      return false
    }
    const requestFingerprint = scopeChangeClientRequestFingerprint(jobId, input)
    const result = await workerService.openKaelJobIncident(jobId, {
      ...input,
      client_request_id: stableClientRequestId(
        pendingIncidentOpenClientRequestRef,
        requestFingerprint,
      ),
      new_description: input.new_description.trim(),
      reason: input.reason.trim(),
    })
    if (!result.success) {
      setRemoteError(result.error)
      return false
    }
    clearStableClientRequestId(pendingIncidentOpenClientRequestRef, requestFingerprint)
    return result.data
  }, [setRemoteError])

  const proposeScopeChangeFromKaelIncident = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để tạo đề xuất')
    const requestFingerprint = `job-incident-scope-proposal:${jobId}`
    const result = await workerService.proposeScopeChangeFromKaelIncident(jobId, {
      client_request_id: stableClientRequestId(
        pendingScopeProposalClientRequestRef,
        requestFingerprint,
      ),
    })
    if (!result.success) return setRemoteError(result.error)
    clearStableClientRequestId(pendingScopeProposalClientRequestRef, requestFingerprint)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError])

  const requestWorkerCancellation = useCallback(async (input: WorkerCancellationRequestInput) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để hủy')
    const result = await workerService.requestWorkerCancellation(jobId, input)
    if (!result.success) return setRemoteError(result.error)
    if (result.data.status === 'approved') {
      const existing = stateRef.current.deal
      if (existing) {
        dispatch({
          type: 'hydrate_remote_job',
          job: {
            ...dealToSnapshot(existing),
            backendStatus: result.data.job_status,
            status: toLocalDealStatus(result.data.job_status),
            broadcast: existing.broadcast
              ? {
                ...existing.broadcast,
                status: 'cancelled',
                fullAddressVisible: false,
                fullAddressLabel: null,
                secondsRemaining: 0,
              }
              : null,
          },
        })
      }
      await workerRefresh()
      return true
    }
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError, workerRefresh])

  const workerSubmitRegistration = useCallback(async (input: WorkerRegisterInput) => {
    const result = await workerService.register(input)
    if (!result.success) return setRemoteError(result.error)
    await workerRefresh()
    return true
  }, [setRemoteError, workerRefresh])

  const decideScopeChange = useCallback(async (scopeChangeId: string, input: CustomerScopeDecisionInput) => {
    if (customerScopeDecisionBusyRef.current) return false
    customerScopeDecisionBusyRef.current = scopeChangeId
    setCustomerScopeDecisionBusyId(scopeChangeId)
    try {
      const result = await jobService.decideScopeChange(scopeChangeId, input)
      if (!result.success) return setRemoteError(result.error)
      await refreshCurrentJob()
      return true
    } finally {
      customerScopeDecisionBusyRef.current = null
      setCustomerScopeDecisionBusyId(null)
    }
  }, [refreshCurrentJob, setRemoteError])

  const customerConfirmCompletion = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để xác nhận hoàn tất')
    const confirmed = await jobService.confirmCompletion(jobId)
    if (!confirmed.success) return setRemoteError(confirmed.error)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError])

  const createPaymentIntent = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để tạo thanh toán')
    const created = await jobService.createPaymentIntent(jobId)
    if (!created.success) return setRemoteError(created.error)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError])

  const confirmStagingPayment = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để xác nhận thanh toán Staging')
    const confirmed = await jobService.confirmStagingPayment(jobId)
    if (!confirmed.success) return setRemoteError(confirmed.error)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError])

  // Releases the exact unit after the worker's lobby check-in.
  const authorizeApartmentAccess = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để mở quyền vào căn hộ')
    const authorized = await jobService.authorizeApartmentAccess(jobId)
    if (!authorized.success) return setRemoteError(authorized.error)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError])

  const submitReview = useCallback(async (input: Omit<ReviewInput, 'job_id'>) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để đánh giá')
    const reviewed = await jobService.submitReview(jobId, input)
    if (!reviewed.success) return setRemoteError(reviewed.error)
    dispatch({ type: 'customer_submit_review' })
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError])

  const refreshNotifications = useCallback(async () => {
    if (!sessionUserId || !role) return true
    const result = await notificationService.list()
    if (!result.success) return setRemoteError(result.error)
    notificationsRef.current = result.data.notifications
    const readNotificationIds = new Set<string>()
    for (const item of result.data.notifications) {
      if (item.status === 'read') readNotificationIds.add(item.id)
    }
    locallyReadNotificationIdsRef.current = readNotificationIds
    setNotificationState({
      type: 'refresh',
      notifications: result.data.notifications,
      unreadCount: result.data.unread_count,
    })
    return true
  }, [role, sessionUserId, setRemoteError])

  const refreshCustomerKaelMemory = useCallback(async () => {
    if (!sessionUserId) {
      setCustomerKaelMemoryState(initialCustomerKaelMemoryState)
      return false
    }
    setCustomerKaelMemoryState((current) => ({
      memory: current.sessionUserId === sessionUserId ? current.memory : null,
      sessionUserId,
      status: 'loading',
    }))
    const result = await kaelMemoryService.getMyMemory()
    if (!result.success) {
      setCustomerKaelMemoryState({
        memory: null,
        sessionUserId,
        status: 'unavailable',
      })
      return false
    }
    setCustomerKaelMemoryState({
      memory: result.data.subject_type === 'customer' ? result.data.memory : null,
      sessionUserId,
      status: 'ready',
    })
    return true
  }, [sessionUserId])

  const updateCustomerKaelMemoryPreference = useCallback(async (input: CustomerKaelMemoryPreferenceUpdateInput) => {
    if (!sessionUserId) return setRemoteError('Bạn cần đăng nhập để cập nhật bộ nhớ Kael')
    const result = await kaelMemoryService.updateMyPreference(input)
    if (!result.success) {
      setRemoteError(result.error)
      return {
        success: false,
        code: result.code,
        error: result.error,
        status: result.status,
      }
    }
    const responseMemory = result.data.subject_type === 'customer' ? result.data.memory : null
    const currentMemory = customerKaelMemoryState.sessionUserId === sessionUserId ? customerKaelMemoryState.memory : null
    const memory = mergeCustomerKaelMemoryPermission(responseMemory ?? currentMemory, input.key, input.enabled)
    setCustomerKaelMemoryState({
      memory,
      sessionUserId,
      status: 'ready',
    })
    if (readCustomerKaelMemoryPermission(memory, input.key) !== input.enabled) {
      return setRemoteError('Không thể xác nhận cập nhật bộ nhớ Kael')
    }
    return true
  }, [customerKaelMemoryState, sessionUserId, setRemoteError])

  const refreshCustomerProfileInsights = useCallback(async () => {
    if (!sessionUserId) {
      setCustomerProfileInsightsState(initialCustomerProfileInsightsState)
      return false
    }
    const result = await customerProfileService.getInsights()
    if (!result.success) {
      setCustomerProfileInsightsState({
        insights: null,
        sessionUserId,
      })
      return false
    }
    setCustomerProfileInsightsState((current) => {
      const currentInsights = current.sessionUserId === sessionUserId ? current.insights : null
      return current.sessionUserId === sessionUserId && sameCustomerProfileInsights(currentInsights, result.data)
        ? current
        : { insights: result.data, sessionUserId }
    })
    return true
  }, [sessionUserId])

  const markNotificationRead = useCallback(async (notificationId: string) => {
    const result = await notificationService.markRead(notificationId)
    if (!result.success) return setRemoteError(result.error)
    const currentNotification = notificationsRef.current.find((item) => item.id === notificationId)
    const shouldDecrementUnread = Boolean(
      currentNotification &&
      currentNotification.status !== 'read' &&
      !locallyReadNotificationIdsRef.current!.has(notificationId),
    )
    locallyReadNotificationIdsRef.current!.add(notificationId)
    notificationsRef.current = markNotificationListRead(notificationsRef.current, notificationId, result.data.read_at)
    setNotificationState({
      type: 'mark_read',
      notificationId,
      readAt: result.data.read_at,
      shouldDecrementUnread,
    })
    return true
  }, [setRemoteError])

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
    setNotificationState({ type: 'reset' })
  }, [sessionUserId])

  useEffect(() => {
    setCustomerKaelMemoryState(initialCustomerKaelMemoryState)
  }, [sessionUserId])

  useEffect(() => {
    setCustomerProfileInsightsState(initialCustomerProfileInsightsState)
  }, [sessionUserId])

  useEffect(() => {
    setCustomerWorkerCandidateState(initialCustomerWorkerCandidateState)
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

  useEffect(() => {
    if (!sessionUserId || !role) return
    if (isAppForeground()) void refreshNotifications()
    const interval = setInterval(() => {
      if (isAppForeground()) void refreshNotifications()
    }, 60_000)
    return () => clearInterval(interval)
  }, [refreshNotifications, role, sessionUserId])

  useEffect(() => {
    if (!sessionUserId || role !== 'worker') return
    if (isAppForeground()) void workerRefresh()
    const interval = setInterval(() => {
      if (isAppForeground()) void workerRefresh()
    }, 20_000)
    return () => {
      clearInterval(interval)
    }
  }, [role, sessionUserId, workerRefresh])

  useEffect(() => {
    if (!sessionUserId || role !== 'worker') return
    let cancelled = false
    const interval = setInterval(() => {
      if (!isAppForeground() || workerActivityHeartbeatBusyRef.current) return
      workerActivityHeartbeatBusyRef.current = true
      void workerService.recordActiveMinute().then((result) => {
        if (cancelled || !result.success) return
        setWorkerRemoteState((current) => current.sessionUserId === sessionUserId && current.profile
          ? {
              ...current,
              profile: {
                ...current.profile,
                active_minutes: result.data.active_minutes,
                last_active_at: result.data.last_active_at,
              },
            }
          : current)
      }).finally(() => {
        workerActivityHeartbeatBusyRef.current = false
      })
    }, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
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

  // On customer login/cold start, hydrate the active job once; polling keeps it
  // fresh while the deal remains active.
  useEffect(() => {
    if (!sessionUserId || (role !== 'customer' && role !== 'admin')) return
    if (isAppForeground()) void hydrateCustomerActiveJob()
  }, [role, sessionUserId, hydrateCustomerActiveJob])

  useEffect(() => {
    if (!sessionUserId || (role !== 'customer' && role !== 'admin')) return
    if (isAppForeground()) void refreshCustomerKaelMemory()
  }, [role, sessionUserId, refreshCustomerKaelMemory])

  useEffect(() => {
    if (!sessionUserId || (role !== 'customer' && role !== 'admin')) return
    if (isAppForeground()) void refreshCustomerProfileInsights()
  }, [role, sessionUserId, refreshCustomerProfileInsights])

  const broadcast = state.deal?.broadcast
  const remoteJobId = getRemoteJobId(state)
  const customerStatus = state.deal?.status

  useEffect(() => {
    if (
      (role !== 'customer' && role !== 'admin') ||
      !remoteJobId ||
      customerStatus !== 'worker_candidate_pending'
    ) {
      setCustomerWorkerCandidateState(initialCustomerWorkerCandidateState)
      return
    }
    void refreshWorkerCandidate(remoteJobId)
  }, [customerStatus, refreshWorkerCandidate, remoteJobId, role])

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
