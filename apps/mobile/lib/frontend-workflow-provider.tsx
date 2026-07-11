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
  type WorkerScopeChangeInput,
} from '@nestscout/shared'
import { useAuth } from './auth-provider'
import { uploadJobMediaDrafts, type LocalMediaUploadDraft } from './media-upload'
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
import {
  ACTIVE_TIMELINE_STATUSES,
  currentWorkerMonthRange,
  defaultCustomerCancellationInput,
  getRemoteJobId,
  hasStaleRemoteBroadcast,
  isStaleBroadcastError,
  isWorkerOperationalJobStatus,
  jobCreateClientRequestFingerprint,
  mergeCustomerKaelMemoryPermission,
  readCustomerKaelMemoryPermission,
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
  formatReleasedFullAddress,
  formatStoredJobAddress,
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

type FrontendWorkflowActions = {
  createRemoteJobFromDraft: (
    draft?: LocalDealDraft,
    mediaItems?: LocalMediaUploadDraft[],
  ) => Promise<{ jobId: string; mediaError?: string } | false | null>
  hydrateRemoteJobById: (jobId: string) => Promise<boolean>
  confirmRemoteSearch: () => Promise<boolean>
  cancelRemoteJob: () => Promise<boolean>
  refreshCurrentJob: () => Promise<boolean>
  workerRefresh: () => Promise<boolean>
  workerAcceptBroadcast: () => Promise<boolean>
  workerDeclineBroadcast: () => Promise<boolean>
  workerUpdateStatus: (
    status: WorkerStatusUpdate,
    extras?: { completion_notes?: string; completion_photo_urls?: string[]; access_check_in?: WorkerAccessCheckInInput },
  ) => Promise<boolean>
  requestScopeChange: (input: WorkerScopeChangeInput) => Promise<boolean>
  requestWorkerCancellation: (input: WorkerCancellationRequestInput) => Promise<boolean>
  workerSubmitRegistration: (input: WorkerRegisterInput) => Promise<boolean>
  decideScopeChange: (scopeChangeId: string, input: CustomerScopeDecisionInput) => Promise<boolean>
  customerConfirmCompletion: () => Promise<boolean>
  authorizeApartmentAccess: () => Promise<boolean>
  submitReview: (input: Omit<ReviewInput, 'job_id'>) => Promise<boolean>
  workerUpdateAvailability: (isAvailable: boolean) => Promise<boolean>
  workerUpdateServiceArea: (input: WorkerServiceAreaUpdateInput) => Promise<boolean>
  workerSavePayoutMethod: (input: WorkerPayoutMethodSaveInput) => Promise<boolean | WorkerPayoutMethodSaveResult>
  refreshNotifications: () => Promise<boolean>
  markNotificationRead: (notificationId: string) => Promise<boolean>
  refreshCustomerKaelMemory: () => Promise<boolean>
  updateCustomerKaelMemoryPreference: (input: CustomerKaelMemoryPreferenceUpdateInput) => Promise<boolean | CustomerKaelMemoryPreferenceUpdateResult>
  refreshCustomerProfileInsights: () => Promise<boolean>
}

type CustomerKaelMemoryStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

type FrontendWorkflowContextValue = {
  state: LocalWorkflowState
  selectors: LocalWorkflowSelectors
  customerKaelMemory: KaelMemorySelfViewResponse['memory'] | null
  customerKaelMemoryStatus: CustomerKaelMemoryStatus
  customerProfileInsights: CustomerProfileInsightsResponse | null
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

const FrontendWorkflowContext = createContext<FrontendWorkflowContextValue | null>(null)
const isAppForeground = () => AppState.currentState === 'active'

function useFrontendWorkflowValue(): FrontendWorkflowContextValue {
  const { role, session } = useAuth()
  const language = useAppLanguage()
  const [state, dispatch] = useReducer(localWorkflowReducer, undefined, createInitialLocalWorkflowState)
  const selectors = useMemo(() => selectLocalWorkflow(state), [state])
  const sessionUserId = session?.user.id ?? null
  const stateRef = useRef(state)
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
  const [notificationState, setNotificationState] = useReducer(notificationStateReducer, initialNotificationState)
  const { notifications, unreadCount: notificationUnreadCount } = notificationState
  const notificationsRef = useRef<NotificationListResponse['notifications']>([])
  const locallyReadNotificationIdsRef = useRef<Set<string> | null>(null)
  if (locallyReadNotificationIdsRef.current === null) {
    locallyReadNotificationIdsRef.current = new Set<string>()
  }
  const pendingJobCreateClientRequestRef = useRef<PendingClientRequestId | null>(null)
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
    if (!draft?.serviceType) return setRemoteError('Chọn dịch vụ điện, nước hoặc vệ sinh trước khi tạo yêu cầu')
    if (draft.problemChips.length === 0) return setRemoteError('Chọn ít nhất một vấn đề cần xử lý')
    if (draft.description.trim().length < 10) return setRemoteError('Mô tả cần rõ hơn trước khi gửi yêu cầu')
    const districtLabel = extractKnownDistrictLabel(draft.districtLabel) || extractKnownDistrictLabel(draft.addressLabel)
    if (!districtLabel) return setRemoteError('aịa chỉ cần có quận TP.HCM rõ ràng')

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
      const mediaError = localizeWorkflowError(uploaded.error, language)
      dispatch({ type: 'set_workflow_error', error: mediaError })
      return { jobId: created.data.job_id, mediaError }
    }
    const refreshed = await jobService.getJob(created.data.job_id)
    if (refreshed.success) {
      dispatch({ type: 'hydrate_remote_job', job: jobDetailToSnapshot(refreshed.data, false) })
    }
    return { jobId: created.data.job_id }
  }, [language, setRemoteError])

  const confirmRemoteSearch = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
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

    const profile = await workerService.getProfile()
    if (!profile.success) return setRemoteError(profile.error)

    const earnings = await workerService.getEarnings(currentWorkerMonthRange())
    const nextEarnings = earnings.success ? earnings.data : null
    const performanceInsights = await workerService.getPerformanceInsights()
    const nextPerformanceInsights = performanceInsights.success ? performanceInsights.data : null
    setWorkerRemoteState((current) => {
      const currentProfile = current.sessionUserId === sessionUserId ? current.profile : null
      const currentEarnings = current.sessionUserId === sessionUserId ? current.earnings : null
      const currentJobs = current.sessionUserId === sessionUserId ? current.jobs : []
      const currentPerformanceInsights = current.sessionUserId === sessionUserId ? current.performanceInsights : null
      const sameProfile = sameWorkerProfile(currentProfile, profile.data)
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
            profile: profile.data,
            sessionUserId,
          }
    })

    const broadcasts = await workerService.getBroadcasts()
    if (!broadcasts.success) return setRemoteError(broadcasts.error)
    const nextBroadcast = broadcasts.data.broadcasts[0]

    const jobs = await workerService.getJobs()
    if (!jobs.success) {
      if (nextBroadcast) {
        dispatch({ type: 'hydrate_remote_broadcast', broadcast: workerBroadcastToSnapshot(nextBroadcast) })
        return true
      }
      return setRemoteError(jobs.error)
    }
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
    if (nextBroadcast) {
      dispatch({ type: 'hydrate_remote_broadcast', broadcast: workerBroadcastToSnapshot(nextBroadcast) })
      return true
    }
    const currentJobId = getRemoteJobId(stateRef.current)
    const activeJob = jobs.data.jobs.find((job) => isWorkerOperationalJobStatus(job.status))
    if (activeJob) {
      dispatch({ type: 'hydrate_remote_job', job: workerJobToSnapshot(activeJob), workerGate: 'remote_backend' })
      return true
    }
    const currentJob = currentJobId ? jobs.data.jobs.find((job) => job.id === currentJobId) : undefined
    if (currentJob) {
      dispatch({ type: 'hydrate_remote_job', job: workerJobToSnapshot(currentJob), workerGate: 'remote_backend' })
      return true
    }

    if (hasStaleRemoteBroadcast(stateRef.current)) {
      dispatch({ type: 'mark_remote_broadcast_expired' })
    }
    return true
  }, [role, sessionUserId, setRemoteError])

  const workerUpdateAvailability = useCallback(async (isAvailable: boolean) => {
    const updated = await workerService.updateAvailability({ is_available: isAvailable })
    if (!updated.success) return setRemoteError(updated.error)
    setWorkerRemoteState((current) => current.sessionUserId === sessionUserId && current.profile
      ? { ...current, profile: { ...current.profile, is_available: updated.data.is_available } }
      : current)
    await workerRefresh()
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
    setWorkerRemoteState((current) => current.sessionUserId === sessionUserId && current.profile
      ? { ...current, profile: { ...current.profile, is_available: false } }
      : current)

    const existing = stateRef.current.deal
    if (existing?.broadcast) {
      const addressAccess = accepted.data.address_access
      const fullAddressLabel = addressAccess.exact_unit_released
        ? formatReleasedFullAddress(accepted.data.full_address)
        : ''
      const stagedAddressLabel = formatStoredJobAddress({
        building: accepted.data.full_address.building,
        floor: null,
        unit: null,
        district: accepted.data.full_address.district,
      })
      dispatch({
        type: 'hydrate_remote_job',
        workerGate: 'remote_backend',
        job: {
          ...dealToSnapshot(existing),
          backendStatus: accepted.data.status,
          status: toLocalDealStatus(accepted.data.status),
          addressLabel: fullAddressLabel || stagedAddressLabel || existing.draft.addressLabel,
          broadcast: {
            ...existing.broadcast,
            status: 'accepted',
            generalArea: stagedAddressLabel || existing.broadcast.generalArea,
            fullAddressVisible: Boolean(fullAddressLabel),
            fullAddressLabel: fullAddressLabel || null,
            addressAccess,
          },
        },
      })
    } else {
      await refreshCurrentJob()
    }
    return true
  }, [refreshCurrentJob, sessionUserId, setRemoteError])

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

  const requestScopeChange = useCallback(async (input: WorkerScopeChangeInput) => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để đổi phạm vi')
    const result = await workerService.requestScopeChange(jobId, input)
    if (!result.success) return setRemoteError(result.error)
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
    const result = await jobService.decideScopeChange(scopeChangeId, input)
    if (!result.success) return setRemoteError(result.error)
    await refreshCurrentJob()
    return true
  }, [refreshCurrentJob, setRemoteError])

  const customerConfirmCompletion = useCallback(async () => {
    const jobId = getRemoteJobId(stateRef.current)
    if (!jobId) return setRemoteError('Không có yêu cầu để xác nhận hoàn tất')
    const confirmed = await jobService.confirmCompletion(jobId)
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
    requestWorkerCancellation,
    workerSubmitRegistration,
    decideScopeChange,
    customerConfirmCompletion,
    authorizeApartmentAccess,
    submitReview,
    workerUpdateAvailability,
    workerUpdateServiceArea,
    workerSavePayoutMethod,
    refreshNotifications,
    markNotificationRead,
    refreshCustomerKaelMemory,
    updateCustomerKaelMemoryPreference,
    refreshCustomerProfileInsights,
  }), [
    authorizeApartmentAccess,
    cancelRemoteJob,
    confirmRemoteSearch,
    createRemoteJobFromDraft,
    customerConfirmCompletion,
    decideScopeChange,
    hydrateRemoteJobById,
    refreshCurrentJob,
    refreshNotifications,
    refreshCustomerKaelMemory,
    refreshCustomerProfileInsights,
    updateCustomerKaelMemoryPreference,
    markNotificationRead,
    requestScopeChange,
    requestWorkerCancellation,
    submitReview,
    workerAcceptBroadcast,
    workerDeclineBroadcast,
    workerRefresh,
    workerSavePayoutMethod,
    workerSubmitRegistration,
    workerUpdateAvailability,
    workerUpdateServiceArea,
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
    if (!sessionUserId || (role !== 'worker' && role !== 'admin')) return
    const initialRefresh = setTimeout(() => {
      if (isAppForeground()) void workerRefresh()
    }, 0)
    const interval = setInterval(() => {
      if (isAppForeground()) void workerRefresh()
    }, 20_000)
    return () => {
      clearTimeout(initialRefresh)
      clearInterval(interval)
    }
  }, [role, sessionUserId, workerRefresh])

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
  const customerBroadcast = state.deal?.broadcast
  const remoteJobId = getRemoteJobId(state)
  const customerStatus = state.deal?.status

  const customerTimelineActive =
    (role === 'customer' || role === 'admin') &&
    !!remoteJobId &&
    !(customerStatus === 'broadcasting' && customerBroadcast?.status === 'expired') &&
    ACTIVE_TIMELINE_STATUSES.includes(customerStatus ?? '')

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

export function FrontendWorkflowProvider({ children }: { children: ReactNode }) {
  const value = useFrontendWorkflowValue()

  return (
    <FrontendWorkflowContext.Provider value={value}>
      {children}
    </FrontendWorkflowContext.Provider>
  )
}

export function useFrontendWorkflow() {
  const value = use(FrontendWorkflowContext)
  if (!value) {
    throw new Error('useFrontendWorkflow must be used inside FrontendWorkflowProvider')
  }
  return value
}
